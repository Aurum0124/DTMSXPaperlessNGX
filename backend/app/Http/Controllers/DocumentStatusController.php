<?php

namespace App\Http\Controllers;

use App\Models\ArchiveDrawer;
use App\Models\ArchiveFolder;
use App\Models\DocumentArchiveDrawer;
use App\Models\DocumentStatusChange;
use App\Models\DocumentTransfer;
use App\Models\StatsCreationToAction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;

class DocumentStatusController extends Controller
{
    private const VALID_STATUSES = ['Under Review', 'Needs Action', 'Approved', 'Rejected', 'For Archiving', 'Archived'];
    private const COPY_STATE_FIELD_NAMES = ['Document Copy State'];
    private const COPY_STATE_DIGITAL_PENDING = 'Digital (physical pending)';

    /** Paperless custom field name(s) — create one of these as text or select with option "For Archiving". */
    private const ARCHIVING_FIELD_NAMES = ['Archiving', 'Archive status'];

    /**
     * Update document status and record audit trail.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'status' => ['required', 'string', 'in:' . implode(',', self::VALID_STATUSES)],
            'remarks' => ['nullable', 'string', 'max:5000'],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $user = $request->user();
        if (! $user->can_approve_reject) {
            return response()->json(['message' => 'Office does not have permission to approve or reject documents'], 403);
        }

        $newStatus = $request->input('status');
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (! $token) {
            return response()->json(['message' => 'Paperless not configured'], 500);
        }

        $headers = ['Authorization' => 'Token ' . $token];

        $customFieldDefinitions = $this->fetchPaperlessCustomFieldDefinitions($baseUrl, $headers);
        $statusFieldId = $this->findFieldIdByNames($customFieldDefinitions, ['Document Status']);
        if (! $statusFieldId) {
            return response()->json(['message' => 'Document Status custom field not found in Paperless'], 500);
        }
        $copyStateFieldId = $this->findFieldIdByNames($customFieldDefinitions, self::COPY_STATE_FIELD_NAMES);

        $archivingFieldId = $this->findFieldIdByNames($customFieldDefinitions, self::ARCHIVING_FIELD_NAMES);
        $setForArchiving = in_array($newStatus, ['Approved', 'Rejected'], true)
            && $archivingFieldId !== null;

        $docUrl = "{$baseUrl}/api/documents/{$id}/";
        $docResponse = Http::withHeaders($headers)->timeout(15)->get($docUrl);
        if (! $docResponse->successful()) {
            return response()->json(['message' => 'Document not found'], 404);
        }

        $doc = $docResponse->json();
        $customFields = $doc['custom_fields'] ?? [];
        $currentStatus = null;

        foreach ($customFields as $cf) {
            $fieldId = $cf['field'] ?? $cf;
            if ((int) $fieldId === (int) $statusFieldId) {
                $currentStatus = $cf['value'] ?? null;
                break;
            }
        }

        if ($copyStateFieldId !== null && in_array($newStatus, ['Approved', 'Rejected'], true)) {
            $copyStateValue = null;
            foreach ($customFields as $cf) {
                $fieldId = $cf['field'] ?? $cf;
                if ((int) $fieldId === (int) $copyStateFieldId) {
                    $copyStateValue = trim((string) ($cf['value'] ?? ''));
                    break;
                }
            }
            if ($copyStateValue !== null && strcasecmp($copyStateValue, self::COPY_STATE_DIGITAL_PENDING) === 0) {
                return response()->json([
                    'message' => 'This document is digital only. You can take action after the physical document is received at your office.',
                ], 422);
            }
        }

        $updatedFields = [];
        $foundStatus = false;
        $foundArchiving = false;
        foreach ($customFields as $cf) {
            $fieldId = $cf['field'] ?? $cf;
            $fieldIdInt = (int) $fieldId;
            if ($fieldIdInt === (int) $statusFieldId) {
                $updatedFields[] = ['field' => (int) $statusFieldId, 'value' => $newStatus];
                $foundStatus = true;
            } elseif ($setForArchiving && $archivingFieldId !== null && $fieldIdInt === (int) $archivingFieldId) {
                $updatedFields[] = ['field' => (int) $archivingFieldId, 'value' => 'For Archiving'];
                $foundArchiving = true;
            } else {
                $updatedFields[] = is_array($cf) ? $cf : ['field' => $fieldId, 'value' => $cf['value'] ?? ''];
            }
        }
        if (! $foundStatus) {
            $updatedFields[] = ['field' => (int) $statusFieldId, 'value' => $newStatus];
        }
        if ($setForArchiving && $archivingFieldId !== null && ! $foundArchiving) {
            $updatedFields[] = ['field' => (int) $archivingFieldId, 'value' => 'For Archiving'];
        }

        $patchResponse = Http::withHeaders($headers)
            ->timeout(15)
            ->patch($docUrl, ['custom_fields' => $updatedFields]);

        if (! $patchResponse->successful()) {
            return response()->json(['message' => 'Failed to update document in Paperless'], 502);
        }

        DocumentStatusChange::create([
            'document_id' => $id,
            'from_status' => $currentStatus,
            'to_status' => $newStatus,
            'remarks' => $request->input('remarks'),
            'user_id' => $user->id,
        ]);

        if (in_array($newStatus, ['Approved', 'Rejected'], true)) {
            $this->recordCreationToAction($id, $doc);
        }

        $payload = ['message' => 'Status updated', 'status' => $newStatus];
        if ($setForArchiving) {
            $payload['archiving'] = 'For Archiving';
        }

        return response()->json($payload, 200);
    }

    /**
     * Mark document for archiving (Archiving / Archive status = "For Archiving").
     * Allowed only when the document is at the user's office and status is Approved or Rejected.
     */
    public function archive(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (! $token) {
            return response()->json(['message' => 'Paperless not configured'], 500);
        }

        $headers = ['Authorization' => 'Token ' . $token];
        $docUrl = "{$baseUrl}/api/documents/{$id}/";
        $docResponse = Http::withHeaders($headers)->timeout(15)->get($docUrl);
        if (! $docResponse->successful()) {
            return response()->json(['message' => 'Document not found'], 404);
        }

        $doc = $docResponse->json();
        $docTags = $doc['tags'] ?? [];
        $hasOffice = false;
        foreach ($docTags as $t) {
            if ((int) $t === (int) $tagId) {
                $hasOffice = true;
                break;
            }
        }
        if (! $hasOffice) {
            return response()->json(['message' => 'Document is not at your office'], 403);
        }

        $validator = Validator::make($request->all(), [
            'drawer_id' => ['required', 'integer'],
            'folder_id' => ['nullable', 'integer'],
        ]);
        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $drawer = ArchiveDrawer::with('cabinet')
            ->where('id', (int) $request->input('drawer_id'))
            ->where('tag_id', $tagId)
            ->first();
        if (! $drawer) {
            return response()->json(['message' => 'Invalid drawer for your office'], 422);
        }
        if (! $drawer->cabinet || (int) $drawer->cabinet->tag_id !== (int) $tagId) {
            return response()->json(['message' => 'Drawer is not linked to a cabinet for your office'], 422);
        }
        if ($drawer->drawer_code === null || trim((string) $drawer->drawer_code) === '') {
            return response()->json(['message' => 'Drawer code is missing. Edit the drawer and set a code (shown as D{code} in the archive reference).'], 422);
        }

        $folderCount = ArchiveFolder::where('drawer_id', $drawer->id)->count();
        $folderIdRaw = $request->input('folder_id');
        $resolvedFolder = null;
        if ($folderCount > 0) {
            if ($folderIdRaw === null || $folderIdRaw === '') {
                return response()->json(['message' => 'This drawer has numbered folders. Select a folder before archiving.'], 422);
            }
            $resolvedFolder = ArchiveFolder::where('id', (int) $folderIdRaw)->where('drawer_id', $drawer->id)->first();
            if (! $resolvedFolder) {
                return response()->json(['message' => 'Invalid folder for this drawer.'], 422);
            }
        } elseif ($folderIdRaw !== null && $folderIdRaw !== '') {
            return response()->json(['message' => 'This drawer has no folders; do not send folder_id.'], 422);
        }

        $customFieldDefinitions = $this->fetchPaperlessCustomFieldDefinitions($baseUrl, $headers);
        $statusFieldId = $this->findFieldIdByNames($customFieldDefinitions, ['Document Status']);
        $archivingFieldId = $this->findFieldIdByNames($customFieldDefinitions, self::ARCHIVING_FIELD_NAMES);
        $copyStateFieldId = $this->findFieldIdByNames($customFieldDefinitions, self::COPY_STATE_FIELD_NAMES);

        if (! $archivingFieldId) {
            return response()->json(['message' => 'Archiving custom field not found in Paperless'], 422);
        }
        if (! $statusFieldId) {
            return response()->json(['message' => 'Document Status custom field not found in Paperless'], 500);
        }

        $customFields = $doc['custom_fields'] ?? [];
        $copyState = $this->readCustomFieldValue($customFields, $copyStateFieldId);
        if ($copyState !== null && strcasecmp($copyState, self::COPY_STATE_DIGITAL_PENDING) === 0 && ! $this->isDigitalArchiveAllowed($user, $doc)) {
            return response()->json([
                'message' => 'Digital-only pending documents cannot be archived unless allow_digital_archive is enabled for this office or document type.',
            ], 422);
        }
        $currentStatus = null;
        foreach ($customFields as $cf) {
            $fieldId = $cf['field'] ?? $cf;
            if ((int) $fieldId === (int) $statusFieldId) {
                $currentStatus = $cf['value'] ?? null;
                break;
            }
        }
        if (! in_array($currentStatus, ['Approved', 'Rejected'], true)) {
            return response()->json(['message' => 'Approve or reject the document before archiving'], 422);
        }

        $currentArchiving = null;
        foreach ($customFields as $cf) {
            $fieldId = $cf['field'] ?? $cf;
            if ((int) $fieldId === (int) $archivingFieldId) {
                $currentArchiving = $cf['value'] ?? null;
                break;
            }
        }
        if (is_string($currentArchiving) && trim($currentArchiving) === 'For Archiving') {
            $placement = $this->persistArchivePlacement($id, $drawer, $user, $resolvedFolder);

            return response()->json([
                'message' => 'Archive drawer saved',
                'archiving' => 'For Archiving',
                'archive_reference' => $placement['archive_reference'],
                'drawer' => $this->archiveDrawerResponse($placement['drawer'], $placement['folder'] ?? null),
            ], 200);
        }

        $updatedFields = [];
        $foundArchiving = false;
        foreach ($customFields as $cf) {
            $fieldId = $cf['field'] ?? $cf;
            $fieldIdInt = (int) $fieldId;
            if ($fieldIdInt === (int) $archivingFieldId) {
                $updatedFields[] = ['field' => (int) $archivingFieldId, 'value' => 'For Archiving'];
                $foundArchiving = true;
            } else {
                $updatedFields[] = is_array($cf) ? $cf : ['field' => $fieldId, 'value' => $cf['value'] ?? ''];
            }
        }
        if (! $foundArchiving) {
            $updatedFields[] = ['field' => (int) $archivingFieldId, 'value' => 'For Archiving'];
        }

        $patchResponse = Http::withHeaders($headers)
            ->timeout(15)
            ->patch($docUrl, ['custom_fields' => $updatedFields]);

        if (! $patchResponse->successful()) {
            return response()->json(['message' => 'Failed to update document in Paperless'], 502);
        }

        $placement = $this->persistArchivePlacement($id, $drawer, $user, $resolvedFolder);

        return response()->json([
            'message' => 'Marked for archiving',
            'archiving' => 'For Archiving',
            'archive_reference' => $placement['archive_reference'],
            'drawer' => $this->archiveDrawerResponse($placement['drawer'], $placement['folder'] ?? null),
        ], 200);
    }

    /**
     * @return array<string, mixed>
     */
    private function archiveDrawerResponse(ArchiveDrawer $drawer, ?ArchiveFolder $folder = null): array
    {
        $row = [
            'id' => $drawer->id,
            'name' => $drawer->labelForDisplay(),
            'drawer_code' => $drawer->drawer_code,
            'cabinet_code' => $drawer->cabinet?->code,
            'folder_id' => null,
            'folder_number' => null,
            'folder_name' => null,
        ];
        if ($folder !== null) {
            $row['folder_id'] = $folder->id;
            $row['folder_number'] = $folder->folder_number;
            $row['folder_name'] = $folder->name;
        }

        return $row;
    }

    /**
     * Assign archive reference: C{cab}.D{draw}.{seq} or C{cab}.D{draw}.F{folder}.{seq}.
     *
     * @return array{drawer: ArchiveDrawer, archive_reference: string, folder?: ArchiveFolder|null}
     */
    private function persistArchivePlacement(int $documentId, ArchiveDrawer $drawer, User $user, ?ArchiveFolder $folder = null): array
    {
        return DB::transaction(function () use ($documentId, $drawer, $user, $folder) {
            $drawerModel = ArchiveDrawer::with('cabinet')
                ->whereKey($drawer->id)
                ->lockForUpdate()
                ->firstOrFail();

            $cabinet = $drawerModel->cabinet;
            if (! $cabinet || (int) $cabinet->tag_id !== (int) $user->tag_id) {
                throw new \RuntimeException('Invalid cabinet');
            }

            $existing = DocumentArchiveDrawer::where('document_id', $documentId)->lockForUpdate()->first();

            if ($existing && (int) $existing->drawer_id === (int) $drawerModel->id && $existing->archive_reference) {
                $existing->user_id = $user->id;
                $existing->save();
                $existing->load('folder');

                return [
                    'drawer' => $drawerModel,
                    'archive_reference' => $existing->archive_reference,
                    'folder' => $existing->folder,
                ];
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
                    'user_id' => $user->id,
                    'archive_sequence' => $seq,
                    'archive_reference' => $ref,
                ]
            );

            return [
                'drawer' => $drawerModel,
                'archive_reference' => $ref,
                'folder' => $folderModel,
            ];
        });
    }

    /**
     * Mark for archiving and clear tags so the document is in transit to exactly one office for filing.
     * That office is the only one allowed to receive (same fixed-route rules as release).
     */
    public function archiveHandoff(Request $request, int $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'to_tag_id' => ['required', 'integer', 'min:1'],
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

        $toTagId = (int) $request->input('to_tag_id');
        if ($toTagId === (int) $tagId) {
            return response()->json(['message' => 'Choose a different office to send this document to'], 422);
        }

        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (! $token) {
            return response()->json(['message' => 'Paperless not configured'], 500);
        }

        $headers = ['Authorization' => 'Token ' . $token];
        $docUrl = "{$baseUrl}/api/documents/{$id}/";
        $docResponse = Http::withHeaders($headers)->timeout(15)->get($docUrl);
        if (! $docResponse->successful()) {
            return response()->json(['message' => 'Document not found'], 404);
        }

        $doc = $docResponse->json();
        $docTags = $doc['tags'] ?? [];
        $hasOffice = false;
        foreach ($docTags as $t) {
            if ((int) $t === (int) $tagId) {
                $hasOffice = true;
                break;
            }
        }
        if (! $hasOffice) {
            return response()->json(['message' => 'Document is not at your office'], 403);
        }

        $customFieldDefinitions = $this->fetchPaperlessCustomFieldDefinitions($baseUrl, $headers);
        $statusFieldId = $this->findFieldIdByNames($customFieldDefinitions, ['Document Status']);
        $archivingFieldId = $this->findFieldIdByNames($customFieldDefinitions, self::ARCHIVING_FIELD_NAMES);
        $trackingFieldId = $this->findFieldIdByNames($customFieldDefinitions, ['Tracking Code']);
        $copyStateFieldId = $this->findFieldIdByNames($customFieldDefinitions, self::COPY_STATE_FIELD_NAMES);

        if (! $archivingFieldId) {
            return response()->json(['message' => 'Archiving custom field not found in Paperless'], 422);
        }
        if (! $statusFieldId) {
            return response()->json(['message' => 'Document Status custom field not found in Paperless'], 500);
        }
        if (! $trackingFieldId) {
            return response()->json(['message' => 'Tracking Code custom field not found in Paperless'], 422);
        }

        $customFields = $doc['custom_fields'] ?? [];
        $copyState = $this->readCustomFieldValue($customFields, $copyStateFieldId);
        if ($copyState !== null && strcasecmp($copyState, self::COPY_STATE_DIGITAL_PENDING) === 0 && ! $this->isDigitalArchiveAllowed($user, $doc)) {
            return response()->json([
                'message' => 'Digital-only pending documents cannot be sent to archive unless allow_digital_archive is enabled for this office or document type.',
            ], 422);
        }
        $currentStatus = $this->readCustomFieldValue($customFields, $statusFieldId);
        if (! in_array($currentStatus, ['Approved', 'Rejected'], true)) {
            return response()->json(['message' => 'Approve or reject the document before archiving'], 422);
        }

        $trackingCode = $this->readCustomFieldValue($customFields, $trackingFieldId);
        if ($trackingCode === null || $trackingCode === '') {
            return response()->json(['message' => 'Document has no tracking code'], 422);
        }

        $currentArchiving = $this->readCustomFieldValue($customFields, $archivingFieldId);
        if (! is_string($currentArchiving) || trim($currentArchiving) !== 'For Archiving') {
            $updatedFields = [];
            $foundArchiving = false;
            foreach ($customFields as $cf) {
                $fieldId = $cf['field'] ?? $cf;
                $fieldIdInt = (int) $fieldId;
                if ($fieldIdInt === (int) $archivingFieldId) {
                    $updatedFields[] = ['field' => (int) $archivingFieldId, 'value' => 'For Archiving'];
                    $foundArchiving = true;
                } else {
                    $updatedFields[] = is_array($cf) ? $cf : ['field' => $fieldId, 'value' => $cf['value'] ?? ''];
                }
            }
            if (! $foundArchiving) {
                $updatedFields[] = ['field' => (int) $archivingFieldId, 'value' => 'For Archiving'];
            }

            $patchArchiving = Http::withHeaders($headers)
                ->timeout(15)
                ->patch($docUrl, ['custom_fields' => $updatedFields]);

            if (! $patchArchiving->successful()) {
                return response()->json(['message' => 'Failed to update document in Paperless'], 502);
            }
        }

        $transfer = DocumentTransfer::create([
            'document_id' => $id,
            'tracking_code' => $trackingCode,
            'from_tag_id' => (int) $tagId,
            'to_tag_id' => null,
            'type' => 'archive_release',
            'route_sequence' => [$toTagId],
            'route_can_take_action' => [$toTagId],
            'route_need_endorsement' => null,
            'received_at_wrong_office' => false,
            'user_id' => $user->id,
        ]);

        $clearTags = Http::withHeaders($headers)
            ->timeout(15)
            ->patch($docUrl, ['tags' => []]);

        if (! $clearTags->successful()) {
            $transfer->delete();

            return response()->json(['message' => 'Failed to clear document tags in Paperless'], 502);
        }

        Cache::forget('admin_stats_quick');

        return response()->json([
            'message' => 'Sent for archiving; only the selected office can receive it.',
            'archiving' => 'For Archiving',
            'to_tag_id' => $toTagId,
        ], 200);
    }

    /**
     * Update remarks on a status change. Only the office that made the status change can edit.
     */
    public function updateRemarks(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $statusChange = DocumentStatusChange::with('user')->find($id);
        if (!$statusChange) {
            return response()->json(['message' => 'Status change not found'], 404);
        }
        $changeTagId = $statusChange->user?->tag_id ?? null;
        if ($changeTagId === null || (int) $changeTagId !== (int) $tagId) {
            return response()->json(['message' => 'You can only edit your own office\'s status change remarks'], 403);
        }

        $remarks = $request->input('remarks');
        if ($remarks !== null && !is_string($remarks)) {
            return response()->json(['message' => 'Invalid remarks'], 422);
        }

        $statusChange->remarks = $remarks !== null ? trim((string) $remarks) : null;
        $statusChange->save();

        return response()->json([
            'message' => 'Remarks updated',
            'remarks' => $statusChange->remarks,
        ], 200);
    }

    private function recordCreationToAction(int $documentId, array $doc): void
    {
        if (StatsCreationToAction::where('document_id', $documentId)->exists()) {
            return;
        }
        $dateStr = $doc['added'] ?? $doc['created'] ?? $doc['created_date'] ?? null;
        if (! $dateStr) {
            return;
        }
        try {
            $createdAt = Carbon::parse($dateStr);
        } catch (\Throwable $e) {
            return;
        }
        $actionAt = now();
        $daysTaken = ($actionAt->timestamp - $createdAt->timestamp) / 86400;
        if ($daysTaken < 0) {
            return;
        }
        StatsCreationToAction::create([
            'document_id' => $documentId,
            'created_at_doc' => $createdAt,
            'action_at' => $actionAt,
            'days_taken' => $daysTaken,
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetchPaperlessCustomFieldDefinitions(string $baseUrl, array $headers): array
    {
        $url = "{$baseUrl}/api/custom_fields/";
        $response = Http::withHeaders($headers)->timeout(10)->get($url);
        if (! $response->successful()) {
            return [];
        }

        $data = $response->json();
        $results = $data['results'] ?? (is_array($data) ? $data : []);

        return is_array($results) ? $results : [];
    }

    /**
     * @param  list<array<string, mixed>>  $definitions
     * @param  list<string>  $names  First matching name wins
     */
    private function findFieldIdByNames(array $definitions, array $names): ?int
    {
        foreach ($definitions as $f) {
            $fieldName = $f['name'] ?? '';
            foreach ($names as $candidate) {
                if (strcasecmp($fieldName, $candidate) === 0) {
                return (int) ($f['id'] ?? $f['pk'] ?? 0) ?: null;
                }
            }
        }

        return null;
    }

    /**
     * @param  list<array<string, mixed>>  $customFields
     */
    private function readCustomFieldValue(array $customFields, ?int $fieldId): ?string
    {
        if ($fieldId === null) {
            return null;
        }
        foreach ($customFields as $cf) {
            $fid = $cf['field'] ?? null;
            if ((int) $fid === (int) $fieldId) {
                $v = $cf['value'] ?? null;

                return $v !== null ? trim((string) $v) : null;
            }
        }

        return null;
    }

    /**
     * Allow policy is configured via config/dtms.php:
     * - allow_digital_archive_office_tag_ids
     * - allow_digital_archive_document_type_ids
     */
    private function isDigitalArchiveAllowed(User $user, array $document): bool
    {
        $officeId = (int) ($user->tag_id ?? 0);
        $documentTypeId = (int) ($document['document_type'] ?? 0);
        $allowedOfficeIds = array_map('intval', (array) config('dtms.allow_digital_archive_office_tag_ids', []));
        $allowedDocumentTypeIds = array_map('intval', (array) config('dtms.allow_digital_archive_document_type_ids', []));

        return in_array($officeId, $allowedOfficeIds, true) || in_array($documentTypeId, $allowedDocumentTypeIds, true);
    }
}
