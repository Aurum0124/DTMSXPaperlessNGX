<?php

namespace App\Http\Controllers;

use App\Models\ArchiveDrawer;
use App\Models\ArchiveFolder;
use App\Models\DocumentEndorsement;
use App\Models\DocumentArchiveDrawer;
use App\Models\DocumentTransfer;
use App\Services\PaperlessTagsCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Throwable;

class DocumentTransferController extends Controller
{
    private const COPY_STATE_FIELD_NAME = 'Document Copy State';
    private const COPY_STATE_PHYSICAL = 'Physical';
    private const COPY_STATE_DIGITAL_PENDING = 'Digital (physical pending)';
    private const COPY_STATE_DIGITAL_ONLY = 'Digital only';

    /**
     * List transfers for a document (for timeline display).
     */
    public function index(Request $request): JsonResponse
    {
        $documentId = $request->query('document_id');
        if ($documentId && ctype_digit((string) $documentId)) {
            $transfers = DocumentTransfer::where('document_id', (int) $documentId)
                ->orderBy('created_at', 'asc')
                ->get();

            return response()->json([
                'transfers' => $transfers->map(fn ($t) => [
                    'id' => 'transfer_' . $t->id,
                    'document_id' => $t->document_id,
                    'from_tag_id' => $t->from_tag_id,
                    'to_tag_id' => $t->to_tag_id,
                    'type' => $t->type,
                    'route_sequence' => $t->route_sequence,
                    'route_can_take_action' => $t->route_can_take_action,
                    'route_need_endorsement' => $t->route_need_endorsement,
                    'received_at_wrong_office' => (bool) $t->received_at_wrong_office,
                    'created_at' => $t->created_at->toIso8601String(),
                ]),
            ]);
        }

        $userTagId = $request->user()?->tag_id;
        if ($userTagId === null) {
            return response()->json(['transfers' => []], 200);
        }

        $limit = (int) $request->query('limit', 8);
        $limit = max(1, min(25, $limit));

        $transfers = DocumentTransfer::whereIn('type', ['receive', 'digital_release'])
            ->where('to_tag_id', (int) $userTagId)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        return response()->json([
            'transfers' => $transfers->map(fn ($t) => [
                'id' => 'transfer_' . $t->id,
                'document_id' => $t->document_id,
                'tracking_code' => $t->tracking_code,
                'from_tag_id' => $t->from_tag_id,
                'to_tag_id' => $t->to_tag_id,
                'type' => $t->type,
                'digital_mode' => $t->type === 'digital_release' ? ($t->digital_mode ?? null) : null,
                'received_at_wrong_office' => (bool) $t->received_at_wrong_office,
                'created_at' => $t->created_at->toIso8601String(),
            ]),
        ]);
    }

    /**
     * Document IDs whose latest transfer places them at the user's office (receive or digital release).
     * Used when Paperless office tags are missing so ?tags= queries return nothing.
     */
    public function atOfficeDocumentIds(Request $request): JsonResponse
    {
        $tagId = (int) (PaperlessTagsCache::effectiveTagIdForUser($request->user()) ?? 0);
        if ($tagId < 1) {
            return response()->json(['document_ids' => []]);
        }

        $documentIds = DocumentTransfer::query()
            ->distinct()
            ->pluck('document_id')
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->values()
            ->all();

        if ($documentIds === []) {
            return response()->json(['document_ids' => []]);
        }

        $atOffice = [];
        foreach (array_chunk($documentIds, 200) as $chunk) {
            $transfers = DocumentTransfer::query()
                ->whereIn('document_id', $chunk)
                ->orderBy('document_id')
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->get(['document_id', 'type', 'to_tag_id']);

            $latestByDoc = [];
            foreach ($transfers as $t) {
                if (! isset($latestByDoc[$t->document_id])) {
                    $latestByDoc[$t->document_id] = $t;
                }
            }

            foreach ($latestByDoc as $docId => $t) {
                $type = (string) ($t->type ?? '');
                $toTag = (int) ($t->to_tag_id ?? 0);
                if ($toTag !== $tagId) {
                    continue;
                }
                if ($type === 'receive' || $type === 'digital_release') {
                    $atOffice[] = (int) $docId;
                }
            }
        }

        $atOffice = array_values(array_unique($atOffice));
        $atOffice = $this->filterExistingPaperlessDocumentIds($atOffice);

        // Repair Paperless office tags for digital-first arrivals that lost their tag.
        foreach ($atOffice as $docId) {
            $this->syncPaperlessOfficeTags($docId, [$tagId]);
        }

        return response()->json(['document_ids' => $atOffice]);
    }

    /**
     * Drop stale Paperless document IDs (deleted in Paperless but still referenced in transfers).
     *
     * @param  array<int>  $documentIds
     * @return array<int>
     */
    private function filterExistingPaperlessDocumentIds(array $documentIds): array
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');
        if (! $token || $documentIds === []) {
            return [];
        }

        $headers = ['Authorization' => 'Token ' . $token];
        $existing = [];
        foreach (array_chunk($documentIds, 50) as $chunk) {
            $url = "{$baseUrl}/api/documents/?id__in=" . implode(',', $chunk) . '&page_size=' . count($chunk);
            $response = Http::withHeaders($headers)->timeout(15)->get($url);
            if (! $response->successful()) {
                continue;
            }
            $data = $response->json();
            foreach ($data['results'] ?? [] as $doc) {
                $id = $doc['id'] ?? $doc['pk'] ?? null;
                if ($id !== null) {
                    $existing[] = (int) $id;
                }
            }
        }

        return array_values(array_unique($existing));
    }

    /**
     * Store a document transfer (release or receive) event.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'document_id' => 'required|integer|min:1',
            'tracking_code' => 'required|string|max:64',
            'from_tag_id' => 'nullable|integer|min:1',
            'to_tag_id' => 'nullable|integer|min:1',
            'type' => 'required|in:release,receive,digital_release',
            'digital_mode' => 'nullable|in:digital_first,digital_only',
            'cabinet_id' => 'nullable|integer|min:1',
            'drawer_id' => 'nullable|integer|min:1',
            'folder_id' => 'nullable|integer|min:1',
            'receive_anyway' => 'nullable|boolean',
            'route_sequence' => 'nullable|array',
            'route_sequence.*' => 'integer|min:1',
            'route_can_take_action' => 'nullable|array',
            'route_can_take_action.*' => 'integer|min:1',
            'route_need_endorsement' => 'nullable|array',
            'route_need_endorsement.*' => 'integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $digitalMode = (string) $request->input('digital_mode', 'digital_first');
        $resolvedArchiveDrawer = null;
        $resolvedArchiveFolder = null;
        if ($request->type === 'digital_release') {
            if (! $request->to_tag_id) {
                return response()->json([
                    'message' => 'Digital release requires a destination office.',
                ], 422);
            }
            if ((int) $request->to_tag_id === (int) $request->from_tag_id) {
                return response()->json([
                    'message' => 'Destination office must be different from source office.',
                ], 422);
            }
            if ($digitalMode === 'digital_only') {
                $currentCopyState = $this->getDocumentCopyStateValue((int) $request->document_id);
                $alreadyDigitalOnly = $currentCopyState !== null && strcasecmp(trim($currentCopyState), self::COPY_STATE_DIGITAL_ONLY) === 0;
                if ($alreadyDigitalOnly) {
                    // Archive placement is already established for this digital-only document.
                    // Allow further digital-only forwarding without requiring cabinet/drawer/folder again.
                    $resolvedArchiveDrawer = null;
                    $resolvedArchiveFolder = null;
                } else {
                $cabinetId = (int) $request->input('cabinet_id');
                if ($cabinetId < 1) {
                    return response()->json([
                        'message' => 'Digital-only release requires selecting an archive cabinet.',
                    ], 422);
                }
                $drawerId = (int) $request->input('drawer_id');
                if ($drawerId < 1) {
                    return response()->json([
                        'message' => 'Digital-only release requires selecting an archive drawer for the releasing office.',
                    ], 422);
                }
                $releasingOfficeTagId = (int) ($request->user()?->tag_id ?? 0);
                if ($releasingOfficeTagId < 1) {
                    return response()->json([
                        'message' => 'Releasing office is not configured.',
                    ], 422);
                }
                $resolvedArchiveDrawer = ArchiveDrawer::with('cabinet')
                    ->where('id', $drawerId)
                    ->where('tag_id', $releasingOfficeTagId)
                    ->first();
                if (! $resolvedArchiveDrawer || ! $resolvedArchiveDrawer->cabinet || (int) $resolvedArchiveDrawer->cabinet->tag_id !== $releasingOfficeTagId) {
                    return response()->json([
                        'message' => 'Selected archive drawer is invalid for the releasing office.',
                    ], 422);
                }
                if ((int) $resolvedArchiveDrawer->cabinet_id !== $cabinetId) {
                    return response()->json([
                        'message' => 'Selected archive drawer does not belong to the selected cabinet.',
                    ], 422);
                }
                $folderIdRaw = $request->input('folder_id');
                $folderCount = ArchiveFolder::where('drawer_id', $resolvedArchiveDrawer->id)->count();
                if ($folderIdRaw === null || $folderIdRaw === '') {
                    return response()->json([
                        'message' => 'Digital-only release requires selecting an archive folder.',
                    ], 422);
                }
                if ($folderCount <= 0) {
                    return response()->json([
                        'message' => 'Selected drawer has no folders. Add a folder before digital-only release.',
                    ], 422);
                }
                $resolvedArchiveFolder = ArchiveFolder::where('id', (int) $folderIdRaw)
                    ->where('drawer_id', $resolvedArchiveDrawer->id)
                    ->first();
                if (! $resolvedArchiveFolder) {
                    return response()->json([
                        'message' => 'Invalid folder for the selected archive drawer.',
                    ], 422);
                }
                }
            }
            $currentCopyState = $this->getDocumentCopyStateValue((int) $request->document_id);
            $alreadyDigitalOnly = $currentCopyState !== null && strcasecmp(trim($currentCopyState), self::COPY_STATE_DIGITAL_ONLY) === 0;
            if ($alreadyDigitalOnly && $digitalMode !== 'digital_only') {
                return response()->json([
                    'message' => 'This document is already marked as digital only and cannot be downgraded to digital-first.',
                ], 422);
            }
        }

        if ($request->type === 'release') {
            $copyState = $this->getDocumentCopyStateValue((int) $request->document_id);
            if ($copyState !== null) {
                $normalized = strtolower(trim($copyState));
                if (str_contains($normalized, 'digital only')) {
                    return response()->json([
                        'message' => 'This document is digital only and cannot be released normally.',
                    ], 422);
                }
                if (str_contains($normalized, 'digital') && str_contains($normalized, 'pending')) {
                    return response()->json([
                        'message' => 'Please wait for the physical document before releasing this document.',
                    ], 422);
                }
            }
        }

        $receivedAtWrongOffice = false;
        if ($request->type === 'receive') {
            $userTagId = (int) ($request->user()?->tag_id ?? 0);
            if ($userTagId < 1) {
                return response()->json(['message' => 'Office not configured'], 403);
            }
            if ((int) ($request->to_tag_id ?? 0) !== $userTagId) {
                return response()->json([
                    'message' => 'Receive destination must match your office.',
                ], 422);
            }

            $latestTransfer = DocumentTransfer::where('document_id', $request->document_id)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->first();
            if (! $latestTransfer || ! in_array((string) $latestTransfer->type, ['release', 'digital_release', 'archive_release'], true)) {
                return response()->json([
                    'message' => 'Document cannot be received because it has not been released to any office.',
                ], 422);
            }

            $lastRelease = DocumentTransfer::where('document_id', $request->document_id)
                ->whereIn('type', ['release', 'digital_release', 'archive_release'])
                ->orderByDesc('created_at')
                ->first();
            $routeSequence = $lastRelease?->route_sequence ?? null;
            if (is_array($routeSequence) && count($routeSequence) > 0) {
                $nextOfficeId = (int) $routeSequence[0];
                $toTagId = $request->to_tag_id ? (int) $request->to_tag_id : null;
                if ($toTagId !== $nextOfficeId) {
                    $originalRouteTransfer = DocumentTransfer::where('document_id', $request->document_id)
                        ->whereIn('type', ['release', 'digital_release', 'archive_release'])
                        ->whereNotNull('route_sequence')
                        ->orderBy('created_at')
                        ->first();
                    if ($request->boolean('receive_anyway')) {
                        $receivedAtWrongOffice = true;
                    } else {
                        $isArchiveHandoff = ($lastRelease->type ?? '') === 'archive_release';
                        $message = $isArchiveHandoff
                            ? 'This document was sent for archiving. Only the office designated to archive it may receive it.'
                            : 'Wrong office! Document has fixed routing. Next office in route must receive first.';

                        return response()->json([
                            'message' => $message,
                            'route_sequence' => $routeSequence,
                            'route_issuer_tag_id' => $originalRouteTransfer?->from_tag_id ?? $lastRelease?->from_tag_id,
                            'wrong_office' => true,
                            'archive_handoff' => $isArchiveHandoff,
                        ], 422);
                    }
                }
            }
        }

        if (in_array($request->type, ['release', 'digital_release'], true) && $request->from_tag_id) {
            $release = DocumentTransfer::where('document_id', $request->document_id)
                ->whereIn('type', ['release', 'digital_release'])
                ->whereNotNull('route_sequence')
                ->orderBy('created_at')
                ->first();

            $needEndorsement = $release?->route_need_endorsement ?? [];
            if (is_array($needEndorsement) && !empty($needEndorsement)) {
                $needEndorsementIds = array_map('intval', $needEndorsement);
                $fromTagId = (int) $request->from_tag_id;
                if (in_array($fromTagId, $needEndorsementIds, true)) {
                    // Offices that can take action don't need to endorse to release (they have final authority)
                    $canTake = $release->route_can_take_action ?? [];
                    if (empty($canTake) && is_array($release->route_sequence) && !empty($release->route_sequence)) {
                        $canTake = [(int) end($release->route_sequence)];
                    }
                    $canTake = array_map('intval', (array) $canTake);
                    if (in_array($fromTagId, $canTake, true)) {
                        // Skip endorsement requirement for can-take-action offices
                    } else {
                        $hasEndorsed = DocumentEndorsement::where('document_id', $request->document_id)
                            ->where('tag_id', $fromTagId)
                            ->exists();
                        if (!$hasEndorsed) {
                            return response()->json([
                                'message' => 'This document needs endorsement before it can be released.',
                            ], 422);
                        }
                    }
                }
            }
        }

        $data = [
            'document_id' => $request->document_id,
            'tracking_code' => $request->tracking_code,
            'from_tag_id' => $request->from_tag_id,
            'to_tag_id' => $request->to_tag_id,
            'type' => $request->type,
            'received_at_wrong_office' => $receivedAtWrongOffice,
            'user_id' => $request->user()->id,
        ];
        if ($request->type === 'digital_release') {
            $data['digital_mode'] = $digitalMode;
        }
        if ($request->has('route_sequence') && is_array($request->route_sequence)) {
            $seq = array_values(array_map('intval', $request->route_sequence));
            $data['route_sequence'] = $seq;
            $canTake = $request->route_can_take_action;
            if (is_array($canTake) && !empty($canTake)) {
                $data['route_can_take_action'] = array_values(array_map('intval', $canTake));
            } elseif (!empty($seq)) {
                $data['route_can_take_action'] = [(int) end($seq)];
            }
            $needEndorsement = $request->route_need_endorsement;
            if (is_array($needEndorsement) && !empty($needEndorsement)) {
                $data['route_need_endorsement'] = array_values(array_map('intval', $needEndorsement));
            }
        }
        $transfer = DocumentTransfer::create($data);

        if (in_array($request->type, ['release', 'digital_release'], true)) {
            Log::info('Document released', [
                'document_id' => $transfer->document_id,
                'tracking_code' => $transfer->tracking_code,
                'type' => $transfer->type,
                'from_tag_id' => $transfer->from_tag_id,
                'user_id' => $transfer->user_id,
            ]);
        }

        Cache::forget('admin_stats_quick');

        if ($request->type === 'digital_release') {
            $copyStateValue = $digitalMode === 'digital_only'
                ? self::COPY_STATE_DIGITAL_ONLY
                : self::COPY_STATE_DIGITAL_PENDING;
            // Tag destination office in the same Paperless PATCH as copy state so the office
            // document list (?tags=) stays in sync with the tracker (which uses transfers).
            $this->syncDocumentCopyState(
                (int) $transfer->document_id,
                $copyStateValue,
                [(int) $transfer->to_tag_id]
            );
            if ($digitalMode === 'digital_only' && $resolvedArchiveDrawer) {
                $this->persistArchivePlacement(
                    (int) $transfer->document_id,
                    $resolvedArchiveDrawer,
                    (int) $request->user()->id,
                    $resolvedArchiveFolder
                );
            }
        } elseif ($request->type === 'receive') {
            // Once physical is received at an office, copy state returns to Physical; tag this office.
            $this->syncDocumentCopyState(
                (int) $transfer->document_id,
                self::COPY_STATE_PHYSICAL,
                [(int) $request->to_tag_id]
            );
        }

        return response()->json([
            'message' => 'Transfer recorded',
            'transfer' => [
                'id' => $transfer->id,
                'document_id' => $transfer->document_id,
                'tracking_code' => $transfer->tracking_code,
                'from_tag_id' => $transfer->from_tag_id,
                'to_tag_id' => $transfer->to_tag_id,
                'type' => $transfer->type,
                'digital_mode' => $request->type === 'digital_release' ? $digitalMode : null,
                'received_at_wrong_office' => (bool) $transfer->received_at_wrong_office,
                'created_at' => $transfer->created_at->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * @param  array<int>  $tagIds
     */
    private function syncPaperlessOfficeTags(int $documentId, array $tagIds): void
    {
        $this->syncDocumentCopyState($documentId, null, $tagIds);
    }

    /**
     * @param  array<int>|null  $paperlessTagIds  When set, included on the PATCH (office assignment for digital release / receive).
     */
    private function syncDocumentCopyState(int $documentId, ?string $value, ?array $paperlessTagIds = null): void
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');
        if (! $token || $documentId < 1) {
            return;
        }

        try {
            $headers = ['Authorization' => 'Token ' . $token];
            $fieldId = $this->resolveCopyStateFieldId($baseUrl, $headers);

            $docUrl = "{$baseUrl}/api/documents/{$documentId}/";
            $docResponse = Http::withHeaders($headers)->timeout(15)->get($docUrl);
            if (! $docResponse->successful()) {
                Log::warning('Unable to load document for Paperless sync', [
                    'document_id' => $documentId,
                    'status' => $docResponse->status(),
                ]);

                return;
            }

            $doc = $docResponse->json();
            $payload = [];

            if ($value !== null && $value !== '') {
                if ($fieldId !== null) {
                    $customFields = $doc['custom_fields'] ?? [];
                    $updated = false;
                    foreach ($customFields as &$cf) {
                        $fid = (int) ($cf['field'] ?? $cf ?? 0);
                        if ($fid === $fieldId) {
                            $cf['value'] = $value;
                            $updated = true;
                            break;
                        }
                    }
                    unset($cf);
                    if (! $updated) {
                        $customFields[] = ['field' => $fieldId, 'value' => $value];
                    }
                    $payload['custom_fields'] = $customFields;
                } else {
                    Log::warning('Document Copy State custom field not found in Paperless; skipping copy state update', [
                        'document_id' => $documentId,
                    ]);
                }
            }

            if ($paperlessTagIds !== null) {
                $tagIds = array_values(array_unique(array_filter(
                    array_map('intval', $paperlessTagIds),
                    static fn (int $id): bool => $id > 0
                )));
                $payload['tags'] = $tagIds;
            }

            if ($payload === []) {
                return;
            }

            $patchResponse = Http::withHeaders($headers)->timeout(15)->patch($docUrl, $payload);
            if (! $patchResponse->successful()) {
                Log::warning('Paperless document sync failed', [
                    'document_id' => $documentId,
                    'status' => $patchResponse->status(),
                    'body' => $patchResponse->body(),
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('Unable to sync document in Paperless', [
                'document_id' => $documentId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function resolveCopyStateFieldId(string $baseUrl, array $headers): ?int
    {
        $url = "{$baseUrl}/api/custom_fields/";
        $response = Http::withHeaders($headers)->timeout(15)->get($url);
        if (! $response->successful()) {
            return null;
        }
        $payload = $response->json();
        $results = $payload['results'] ?? (is_array($payload) ? $payload : []);
        foreach ($results as $field) {
            $name = trim((string) ($field['name'] ?? ''));
            if (strcasecmp($name, self::COPY_STATE_FIELD_NAME) === 0) {
                return (int) ($field['id'] ?? $field['pk'] ?? 0) ?: null;
            }
        }
        return null;
    }

    private function persistArchivePlacement(int $documentId, ArchiveDrawer $drawer, int $userId, ?ArchiveFolder $folder = null): void
    {
        DB::transaction(function () use ($documentId, $drawer, $userId, $folder) {
            $drawerModel = ArchiveDrawer::with('cabinet')
                ->whereKey($drawer->id)
                ->lockForUpdate()
                ->firstOrFail();
            $cabinet = $drawerModel->cabinet;
            if (! $cabinet) {
                throw new \RuntimeException('Invalid cabinet for archive drawer');
            }

            $existing = DocumentArchiveDrawer::where('document_id', $documentId)->lockForUpdate()->first();
            if ($existing && (int) $existing->drawer_id === (int) $drawerModel->id && $existing->archive_reference) {
                $existing->user_id = $userId;
                $existing->folder_id = $folder?->id;
                $existing->save();
                return;
            }

            $folderModel = $folder;
            if ($folderModel !== null && (int) $folderModel->drawer_id !== (int) $drawerModel->id) {
                throw new \RuntimeException('Folder does not belong to drawer');
            }

            $seqQuery = DocumentArchiveDrawer::where('drawer_id', $drawerModel->id)->lockForUpdate();
            if ($folderModel !== null) {
                $seqQuery->where('folder_id', $folderModel->id);
            } else {
                $seqQuery->whereNull('folder_id');
            }
            $max = (int) $seqQuery->max('archive_sequence');
            $seq = $max + 1;

            if ($folderModel !== null) {
                $ref = sprintf(
                    'C%s.D%s.F%s.%s',
                    $cabinet->code,
                    $drawerModel->drawer_code,
                    $folderModel->folder_number,
                    str_pad((string) $seq, 3, '0', STR_PAD_LEFT)
                );
            } else {
                $ref = sprintf(
                    'C%s.D%s.%s',
                    $cabinet->code,
                    $drawerModel->drawer_code,
                    str_pad((string) $seq, 3, '0', STR_PAD_LEFT)
                );
            }

            DocumentArchiveDrawer::updateOrCreate(
                ['document_id' => $documentId],
                [
                    'drawer_id' => $drawerModel->id,
                    'folder_id' => $folderModel?->id,
                    'user_id' => $userId,
                    'archive_sequence' => $seq,
                    'archive_reference' => $ref,
                ]
            );
        });
    }

    private function getDocumentCopyStateValue(int $documentId): ?string
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');
        if (! $token || $documentId < 1) {
            return null;
        }
        try {
            $headers = ['Authorization' => 'Token ' . $token];
            $fieldId = $this->resolveCopyStateFieldId($baseUrl, $headers);
            if ($fieldId === null) {
                return null;
            }
            $docUrl = "{$baseUrl}/api/documents/{$documentId}/";
            $docResponse = Http::withHeaders($headers)->timeout(15)->get($docUrl);
            if (! $docResponse->successful()) {
                return null;
            }
            $doc = $docResponse->json();
            foreach (($doc['custom_fields'] ?? []) as $cf) {
                $fid = (int) ($cf['field'] ?? $cf ?? 0);
                if ($fid === $fieldId) {
                    return is_scalar($cf['value'] ?? null) ? (string) $cf['value'] : null;
                }
            }
        } catch (Throwable $e) {
            Log::warning('Unable to read Document Copy State', [
                'document_id' => $documentId,
                'error' => $e->getMessage(),
            ]);
        }
        return null;
    }

    /**
     * Undo the most recent standard release from the user's office, only while the document
     * is still in transit (no tags in Paperless) and no receive has happened after that release.
     * Safe for fixed-route releases: deletes the release row, restores the office tag in Paperless,
     * and inserts a revert_release row for the timeline (UI hides the redundant Paperless tag-add next to revert).
     */
    public function revertRelease(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'document_id' => 'required|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $documentId = (int) $request->input('document_id');

        $transfers = DocumentTransfer::where('document_id', $documentId)
            ->orderBy('created_at', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        if ($transfers->isEmpty()) {
            return response()->json(['message' => 'No transfers found for this document.'], 422);
        }

        $last = $transfers->last();
        if ($last->type !== 'release') {
            return response()->json([
                'message' => 'The last action on this document is not a release you can undo (for example it may already have been received).',
            ], 422);
        }

        if ((int) $last->from_tag_id !== (int) $tagId) {
            return response()->json([
                'message' => 'Only the office that released the document can undo that release.',
            ], 403);
        }

        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (! $token) {
            return response()->json(['message' => 'Paperless not configured'], 502);
        }

        $headers = ['Authorization' => 'Token '.$token];
        $docUrl = "{$baseUrl}/api/documents/{$documentId}/";

        $docResponse = Http::withHeaders($headers)->timeout(15)->get($docUrl);
        if (! $docResponse->successful()) {
            return response()->json(['message' => 'Document not found in Paperless'], 404);
        }

        $doc = $docResponse->json();
        if (! is_array($doc)) {
            return response()->json(['message' => 'Invalid response from Paperless for this document.'], 502);
        }

        $paperlessTags = $doc['tags'] ?? [];
        if (count($paperlessTags) > 0) {
            return response()->json([
                'message' => 'Document is already at an office. Undo is only available while it is still in transit.',
            ], 422);
        }

        $restoreTagId = (int) $last->from_tag_id;
        $trackingCode = $last->tracking_code;
        $patchResponse = Http::withHeaders($headers)
            ->timeout(15)
            ->patch($docUrl, ['tags' => [$restoreTagId]]);

        if (! $patchResponse->successful()) {
            return response()->json([
                'message' => 'Could not restore document to your office in Paperless.',
            ], 502);
        }

        $deleted = false;
        try {
            $deleted = (bool) $last->delete();
        } catch (\Throwable $e) {
            \Log::error('revertRelease: Paperless tags restored but failed to delete transfer row', [
                'document_id' => $documentId,
                'transfer_id' => $last->id ?? null,
                'exception' => $e->getMessage(),
            ]);
        }

        if (! $deleted) {
            return response()->json([
                'message' => 'Document was returned to your office in Paperless, but the release record could not be removed. Please contact an administrator.',
            ], 500);
        }

        try {
            DocumentTransfer::create([
                'document_id' => $documentId,
                'tracking_code' => $trackingCode,
                'from_tag_id' => $restoreTagId,
                'to_tag_id' => null,
                'type' => 'revert_release',
                'received_at_wrong_office' => false,
                'route_sequence' => null,
                'route_can_take_action' => null,
                'route_need_endorsement' => null,
                'user_id' => $user->id,
            ]);
        } catch (\Throwable $e) {
            \Log::error('revertRelease: failed to insert revert_release transfer row', [
                'document_id' => $documentId,
                'exception' => $e->getMessage(),
            ]);
        }

        Cache::forget('admin_stats_quick');

        return response()->json([
            'message' => 'Release undone. The document is back at your office.',
            'document_id' => $documentId,
        ], 200);
    }
}
