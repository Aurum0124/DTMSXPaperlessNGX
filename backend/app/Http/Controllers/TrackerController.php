<?php

namespace App\Http\Controllers;

use App\Models\DocumentEndorsement;
use App\Models\DocumentPublicRouteHidden;
use App\Models\DocumentStatusChange;
use App\Models\DocumentTransfer;
use App\Services\PaperlessTagsCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class TrackerController extends Controller
{
    /**
     * Public tracker: get document by tracking code with location and history.
     * No auth. Documents in document_public_route_hidden are not returned (same as unknown code).
     */
    public function __invoke(Request $request): JsonResponse
    {
        return $this->trackerResponse($request, hideUntrackedForPublic: true);
    }

    /**
     * Staff document lookup (auth:sanctum): same response shape; includes untracked documents.
     */
    public function staffLookup(Request $request): JsonResponse
    {
        return $this->trackerResponse($request, hideUntrackedForPublic: false);
    }

    private function trackerResponse(Request $request, bool $hideUntrackedForPublic): JsonResponse
    {
        $trackingCode = $request->query('tracking_code');
        if (empty($trackingCode) || ! is_string($trackingCode)) {
            return response()->json(['document' => null, 'inTransit' => false, 'currentLocation' => null, 'history' => []], 200);
        }

        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (! $token) {
            return response()->json(['document' => null, 'inTransit' => false, 'currentLocation' => null, 'history' => []], 200);
        }

        $results = $this->fetchDocumentsForTrackingCode($baseUrl, $token, $trackingCode);
        if (empty($results)) {
            return response()->json(['document' => null, 'inTransit' => false, 'currentLocation' => null, 'history' => []], 200);
        }

        $doc = $results[0];
        $docId = $doc['id'] ?? null;
        if (! $docId) {
            return response()->json(['document' => null, 'inTransit' => false, 'currentLocation' => null, 'history' => []], 200);
        }

        $docId = (int) $docId;

        if ($hideUntrackedForPublic && DocumentPublicRouteHidden::query()->where('document_id', $docId)->exists()) {
            return response()->json([
                'document' => null,
                'inTransit' => false,
                'currentLocation' => null,
                'fixedRoute' => [],
                'currentLocationTagId' => null,
                'inTransitFromTagId' => null,
                'inTransitToTagId' => null,
                'history' => [],
                'actionRemarks' => null,
                'endorsementProgress' => null,
                'endorsementCount' => 0,
                'locationTimeline' => null,
            ], 200);
        }

        // Tags from cache (avoids HTTP round-trip)
        $tagMap = PaperlessTagsCache::getTagMap();

        $historyUrl = "{$baseUrl}/api/documents/{$docId}/history/";
        $historyResponse = Http::withHeaders(['Authorization' => 'Token ' . $token])
            ->timeout(15)
            ->get($historyUrl);

        $paperlessList = [];
        if ($historyResponse->successful()) {
            $histData = $historyResponse->json();
            $paperlessList = is_array($histData) ? $histData : ($histData['results'] ?? []);
        }

        // Transfers for this document
        $transfers = DocumentTransfer::where('document_id', $docId)
            ->orderBy('created_at')
            ->get();

        $transferList = $transfers->map(fn ($t) => [
            'id' => 'transfer_' . $t->id,
            'document_id' => $t->document_id,
            'from_tag_id' => $t->from_tag_id,
            'to_tag_id' => $t->to_tag_id,
            'type' => $t->type,
            'route_sequence' => $t->route_sequence,
            'received_at_wrong_office' => (bool) $t->received_at_wrong_office,
            'created_at' => $t->created_at->toIso8601String(),
        ])->all();

        // In transit:
        // - physical release/archive handoff => in transit
        // - digital release => only in transit if document has no office tag yet
        $inTransit = false;
        if ($transfers->isNotEmpty()) {
            $latest = $transfers->last();
            $latestType = (string) ($latest->type ?? '');
            if (in_array($latestType, ['release', 'archive_release'], true)) {
                $inTransit = true;
            } elseif ($latestType === 'digital_release') {
                if ($this->hasDigitalOnlyCopyState($doc)) {
                    $inTransit = false;
                } else {
                $docTagIds = $this->normalizeTagIds($doc['tags'] ?? []);
                $inTransit = count($docTagIds) === 0;
                }
            }
        }

        // Current location: In Transit or tag names
        $normalizedDocTags = $this->normalizeTagIds($doc['tags'] ?? []);
        $currentLocation = $inTransit
            ? 'In Transit'
            : $this->locationFromTags($normalizedDocTags, $tagMap);

        // Fixed route: "issued by" + intended offices + wrong-office receives inserted chronologically (red circle).
        $fixedRoute = $this->buildExtendedFixedRoute($transfers, $tagMap);

        $statusChanges = DocumentStatusChange::with('user:id,name')
            ->where('document_id', $docId)
            ->orderBy('created_at')
            ->get(['id', 'document_id', 'from_status', 'to_status', 'remarks', 'user_id', 'created_at']);

        $endorsements = DocumentEndorsement::where('document_id', $docId)
            ->orderBy('created_at')
            ->get(['id', 'document_id', 'tag_id', 'remarks', 'created_at']);

        $currentLocationTagId = null;
        $inTransitFromTagId = null;
        $inTransitToTagId = null;
        if ($inTransit) {
            $releases = $transfers->filter(fn ($t) => in_array($t->type, ['release', 'digital_release', 'archive_release'], true))->values();
            $lastRelease = $releases->last();
            if ($lastRelease) {
                $inTransitFromTagId = $lastRelease->from_tag_id ? (int) $lastRelease->from_tag_id : null;
                $routeSeq = $lastRelease->route_sequence;
                $inTransitToTagId = (is_array($routeSeq) && count($routeSeq) > 0) ? (int) $routeSeq[0] : null;
                // When last release has no route: find next office in the extended route after the releasing office.
                // Do not use route_sequence[0] from older releases - that gives the first office, not the next after from.
                if ($inTransitToTagId === null && $inTransitFromTagId !== null && ! empty($fixedRoute)) {
                    $routeOffices = array_values(array_map(fn ($s) => (int) ($s['tag_id'] ?? 0), array_filter($fixedRoute, fn ($s) => isset($s['tag_id']))));
                    $fromIdx = array_search($inTransitFromTagId, $routeOffices, true);
                    if ($fromIdx !== false && isset($routeOffices[$fromIdx + 1]) && $routeOffices[$fromIdx + 1] > 0) {
                        $inTransitToTagId = $routeOffices[$fromIdx + 1];
                    }
                }
            }
        } else {
            $currentLocationTagId = ! empty($normalizedDocTags) ? (int) $normalizedDocTags[0] : null;
            // Prefer latest explicit destination for digital/receive flows when available.
            $latestAtOffice = $transfers
                ->filter(fn ($t) => in_array((string) ($t->type ?? ''), ['receive', 'digital_release'], true))
                ->sortByDesc('created_at')
                ->first();
            $latestTo = $latestAtOffice?->to_tag_id != null ? (int) $latestAtOffice->to_tag_id : null;
            if ($latestTo !== null && in_array($latestTo, $normalizedDocTags, true)) {
                $currentLocationTagId = $latestTo;
            }
        }

        $history = $this->buildHistory($paperlessList, $transferList, $statusChanges, $endorsements, $tagMap);

        $lastAction = $statusChanges
            ->filter(fn ($s) => in_array($s->to_status, ['Approved', 'Rejected'], true))
            ->sortByDesc('created_at')
            ->first();
        $actionRemarks = $lastAction && ! empty(trim($lastAction->remarks ?? ''))
            ? trim($lastAction->remarks)
            : null;

        $endorsementProgress = $this->computeEndorsementProgress($transfers, $endorsements);

        $endorsementCount = $endorsements->count();

        $locationTimeline = empty($fixedRoute)
            ? $this->buildLocationTimeline($transfers, $tagMap, $inTransit, $currentLocationTagId)
            : null;

        return response()->json([
            'document' => $doc,
            'inTransit' => $inTransit,
            'currentLocation' => $currentLocation,
            'fixedRoute' => $fixedRoute,
            'currentLocationTagId' => $currentLocationTagId,
            'inTransitFromTagId' => $inTransitFromTagId,
            'inTransitToTagId' => $inTransitToTagId,
            'history' => $history,
            'actionRemarks' => $actionRemarks,
            'endorsementProgress' => $endorsementProgress,
            'endorsementCount' => $endorsementCount,
            'locationTimeline' => $locationTimeline,
        ]);
    }

    /**
     * Resolve documents by tracking code: prefer Paperless `iexact` (case-insensitive), then `exact` fallbacks for older instances.
     *
     * @return array<int, array<string, mixed>>
     */
    private function fetchDocumentsForTrackingCode(string $baseUrl, string $token, string $trackingCode): array
    {
        $t = trim($trackingCode);
        if ($t === '') {
            return [];
        }

        $tuples = [
            ['Tracking Code', 'iexact', $t],
            ['Tracking Code', 'exact', $t],
        ];
        $upper = strtoupper($t);
        $lower = strtolower($t);
        if ($upper !== $t) {
            $tuples[] = ['Tracking Code', 'exact', $upper];
        }
        if ($lower !== $t && $lower !== $upper) {
            $tuples[] = ['Tracking Code', 'exact', $lower];
        }

        foreach ($tuples as $tuple) {
            $query = json_encode($tuple);
            $documentsUrl = "{$baseUrl}/api/documents/?custom_field_query=" . urlencode($query);
            $docResponse = Http::withHeaders(['Authorization' => 'Token ' . $token])
                ->timeout(15)
                ->get($documentsUrl);
            if (! $docResponse->successful()) {
                continue;
            }
            $docData = $docResponse->json();
            $results = $docData['results'] ?? [];
            if (is_array($results) && count($results) > 0) {
                return $results;
            }
        }

        return [];
    }

    /**
     * Build fixed route with wrong-office receives inserted chronologically.
     * Wrong-office steps have wrong_office=true and display with red circle.
     *
     * @param  \Illuminate\Support\Collection<int, DocumentTransfer>  $transfers
     * @param  array<int, string>  $tagMap
     * @return array<int, array{tag_id: int, name: string, issued_by: bool, wrong_office?: bool}>
     */
    private function buildExtendedFixedRoute($transfers, array $tagMap): array
    {
        $releases = $transfers->filter(fn ($t) => in_array($t->type, ['release', 'digital_release', 'archive_release'], true))->values();
        $originalRelease = $releases->first(fn ($t) => is_array($t->route_sequence) && count($t->route_sequence) > 0);
        if (! $originalRelease) {
            return [];
        }

        $baseRoute = [];
        $fromId = $originalRelease->from_tag_id;
        if ($fromId !== null) {
            $baseRoute[] = [
                'tag_id' => (int) $fromId,
                'name' => $tagMap[$fromId] ?? ('Office #' . $fromId),
                'issued_by' => true,
                'wrong_office' => false,
            ];
        }
        foreach ($originalRelease->route_sequence as $tagId) {
            $baseRoute[] = [
                'tag_id' => (int) $tagId,
                'name' => $tagMap[$tagId] ?? ('Office #' . $tagId),
                'issued_by' => false,
                'wrong_office' => false,
            ];
        }

        // Insert wrong-office receives in chronological order.
        // Each wrong-office receive: doc was in transit from lastRelease.from to route[0]. Insert receive.to between them.
        $result = [];
        $routeIdx = 0;
        $lastReleaseFrom = $fromId !== null ? (int) $fromId : null;

        foreach ($transfers as $t) {
            if (in_array($t->type, ['release', 'digital_release', 'archive_release'], true)) {
                $lastReleaseFrom = $t->from_tag_id ? (int) $t->from_tag_id : null;
                continue;
            }
            if ($t->type === 'receive' && $t->received_at_wrong_office) {
                $wrongTagId = $t->to_tag_id ? (int) $t->to_tag_id : null;
                if ($wrongTagId === null) {
                    continue;
                }
                // Find insert position: after lastReleaseFrom in our base route. If lastReleaseFrom is issuer, insert after issuer.
                $insertAfterTagId = $lastReleaseFrom;
                $inserted = false;
                $newResult = [];
                foreach ($result ?: $baseRoute as $step) {
                    $newResult[] = $step;
                    if (! $inserted && $step['tag_id'] === $insertAfterTagId) {
                        $newResult[] = [
                            'tag_id' => $wrongTagId,
                            'name' => $tagMap[$wrongTagId] ?? ('Office #' . $wrongTagId),
                            'issued_by' => false,
                            'wrong_office' => true,
                        ];
                        $inserted = true;
                    }
                }
                if (! $inserted) {
                    $newResult[] = [
                        'tag_id' => $wrongTagId,
                        'name' => $tagMap[$wrongTagId] ?? ('Office #' . $wrongTagId),
                        'issued_by' => false,
                        'wrong_office' => true,
                    ];
                }
                $result = $newResult;
                $lastReleaseFrom = $wrongTagId;
            }
        }

        return $result ?: $baseRoute;
    }

    private function locationFromTags(array $tagIds, array $tagMap): string
    {
        if (empty($tagIds)) {
            return 'No location assigned';
        }
        $names = [];
        foreach ($tagIds as $id) {
            if (isset($tagMap[$id]) && $tagMap[$id] !== '') {
                $names[] = $tagMap[$id];
            }
        }
        return empty($names) ? 'No location assigned' : implode(', ', $names);
    }

    /**
     * Paperless may return tag entries as ints or objects ({id, ...}).
     *
     * @param array<int, mixed> $tagRows
     * @return array<int, int>
     */
    private function normalizeTagIds(array $tagRows): array
    {
        $out = [];
        foreach ($tagRows as $t) {
            $id = null;
            if (is_array($t)) {
                $id = $t['id'] ?? $t['pk'] ?? null;
            } else {
                $id = $t;
            }
            if ($id !== null && is_numeric((string) $id)) {
                $out[] = (int) $id;
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * Best-effort check from document custom field values.
     * We do not require custom field definitions here to keep tracker fast.
     */
    private function hasDigitalOnlyCopyState(array $doc): bool
    {
        $customFields = $doc['custom_fields'] ?? [];
        if (! is_array($customFields)) {
            return false;
        }
        foreach ($customFields as $cf) {
            if (! is_array($cf)) {
                continue;
            }
            $value = strtolower(trim((string) ($cf['value'] ?? '')));
            if ($value === 'digital only') {
                return true;
            }
        }

        return false;
    }

    private function buildHistory(array $paperlessList, array $transfers, $statusChanges, $endorsements, array $tagMap): array
    {
        $entries = [];
        $receiveTransfers = array_filter($transfers, fn ($t) => ($t['type'] ?? '') === 'receive');
        $nameToId = [];
        foreach ($tagMap as $id => $name) {
            if ($name !== '') {
                $nameToId[strtolower((string) $name)] = (int) $id;
            }
        }

        // For deduplication: skip Paperless status entries that duplicate our audit (Approved/Rejected)
        $statusChangeTimes = [];
        foreach ($statusChanges as $s) {
            $statusChangeTimes[] = [
                'time' => strtotime($s->created_at->toIso8601String()),
                'to_status' => $s->to_status,
            ];
        }

        foreach ($paperlessList as $entry) {
            if (($entry['action'] ?? '') === 'create') {
                continue;
            }
            $changes = $entry['changes'] ?? [];
            if (! empty($changes['custom_fields'])) {
                $field = $changes['custom_fields']['field'] ?? '';
                $value = $changes['custom_fields']['value'] ?? '';
                if ($field === 'Document Status') {
                    // Skip Paperless status if we have a Laravel audit entry (Approved/Rejected) - we use that instead
                    if (in_array($value, ['Approved', 'Rejected'], true)) {
                        $entryTime = strtotime($entry['timestamp'] ?? '');
                        $isDuplicate = false;
                        foreach ($statusChangeTimes as $st) {
                            if ($st['to_status'] === $value && abs($entryTime - $st['time']) < 60) {
                                $isDuplicate = true;
                                break;
                            }
                        }
                        if ($isDuplicate) {
                            continue;
                        }
                        // Legacy: no Laravel audit - show as "Action Taken" on tracker (no remarks)
                        $entries[] = [
                            'timestamp' => $entry['timestamp'] ?? null,
                            'source' => 'paperless',
                            'displayText' => 'Status: Action Taken',
                        ];
                    } else {
                        // Under Review etc - show as-is
                        $entries[] = [
                            'timestamp' => $entry['timestamp'] ?? null,
                            'source' => 'paperless',
                            'displayText' => 'Status: ' . $value,
                        ];
                    }
                } elseif ($field === 'Tracking Code') {
                    $entries[] = [
                        'timestamp' => $entry['timestamp'] ?? null,
                        'source' => 'paperless',
                        'displayText' => 'Tracking Code: ' . $value,
                    ];
                } elseif ($field === 'Document Copy State') {
                    $entries[] = [
                        'timestamp' => $entry['timestamp'] ?? null,
                        'source' => 'paperless',
                        'displayText' => 'Copy State: ' . $value,
                    ];
                }
            } elseif (! empty($changes['tags']) && ($changes['tags']['operation'] ?? '') === 'add') {
                $objects = $changes['tags']['objects'] ?? [];
                if (! empty($objects)) {
                    $raw = $objects[0];
                    $tagId = is_numeric($raw) ? (int) $raw : ($nameToId[strtolower((string) $raw)] ?? null);
                    if ($tagId !== null) {
                        $entryTime = strtotime($entry['timestamp'] ?? '');
                        $isDuplicate = false;
                        foreach ($receiveTransfers as $r) {
                            if (($r['to_tag_id'] ?? null) !== $tagId) {
                                continue;
                            }
                            $rTime = strtotime($r['created_at'] ?? '');
                            if (abs($entryTime - $rTime) < 120) {
                                $isDuplicate = true;
                                break;
                            }
                        }
                        if (! $isDuplicate) {
                            $name = is_numeric($raw) ? ($tagMap[$raw] ?? 'Office #' . $raw) : (string) $raw;
                            $entries[] = [
                                'timestamp' => $entry['timestamp'] ?? null,
                                'source' => 'paperless',
                                'displayText' => 'Assigned to: ' . $name,
                            ];
                        }
                    }
                }
            }
        }

        // Add endorsements
        foreach ($endorsements as $e) {
            $tagId = $e->tag_id;
            $name = $tagId ? ($tagMap[$tagId] ?? 'Office #' . $tagId) : 'Unknown';
            $entry = [
                'timestamp' => $e->created_at->toIso8601String(),
                'source' => 'endorsement',
                'displayText' => 'Endorsed by ' . $name,
            ];
            if (!empty(trim($e->remarks ?? ''))) {
                $entry['noteText'] = trim($e->remarks);
            }
            $entries[] = $entry;
        }

        // Add status changes from Laravel - on tracker always display as "Action Taken" with remarks
        foreach ($statusChanges as $s) {
            $who = $s->user?->name ? ' by ' . $s->user->name : '';
            $entries[] = [
                'timestamp' => $s->created_at->toIso8601String(),
                'source' => 'status_change',
                'displayText' => 'Status: Action Taken' . $who,
                'noteText' => $s->remarks ? trim($s->remarks) : null,
            ];
        }

        foreach ($transfers as $t) {
            $name = '';
            if (($t['type'] ?? '') === 'release') {
                $fromId = $t['from_tag_id'] ?? null;
                $name = $fromId ? ($tagMap[$fromId] ?? 'Office #' . $fromId) : 'Unknown';
                $displayText = 'Released from ' . $name;
            } elseif (($t['type'] ?? '') === 'digital_release') {
                $fromId = $t['from_tag_id'] ?? null;
                $fromName = $fromId ? ($tagMap[$fromId] ?? 'Office #' . $fromId) : 'Unknown';
                $seq = $t['route_sequence'] ?? null;
                $toId = is_array($seq) && count($seq) > 0 ? $seq[0] : ($t['to_tag_id'] ?? null);
                $toName = $toId !== null ? ($tagMap[$toId] ?? 'Office #' . $toId) : 'selected office';
                $displayText = 'Digitally released from ' . $fromName . ' → ' . $toName;
            } elseif (($t['type'] ?? '') === 'archive_release') {
                $fromId = $t['from_tag_id'] ?? null;
                $fromName = $fromId ? ($tagMap[$fromId] ?? 'Office #' . $fromId) : 'Unknown';
                $seq = $t['route_sequence'] ?? null;
                $toId = is_array($seq) && count($seq) > 0 ? $seq[0] : null;
                $toName = $toId !== null ? ($tagMap[$toId] ?? 'Office #' . $toId) : 'selected office';
                $displayText = 'Sent for archiving from ' . $fromName . ' → ' . $toName;
            } elseif (($t['type'] ?? '') === 'receive') {
                $toId = $t['to_tag_id'] ?? null;
                $name = $toId ? ($tagMap[$toId] ?? 'Office #' . $toId) : 'Unknown';
                $wrongOffice = ! empty($t['received_at_wrong_office']);
                $displayText = $wrongOffice
                    ? 'Document wrongly forwarded to ' . $name . '. Please forward to next office.'
                    : 'Received at ' . $name;
            } else {
                $displayText = 'Transfer';
            }
            $entries[] = [
                'timestamp' => $t['created_at'] ?? null,
                'source' => 'transfer',
                'displayText' => $displayText,
            ];
        }

        usort($entries, function ($a, $b) {
            $ta = $a['timestamp'] ?? '';
            $tb = $b['timestamp'] ?? '';
            return strcmp($ta, $tb);
        });

        return $entries;
    }

    /**
     * Build a simple location timeline for documents without fixed routing.
     * Returns steps: office names only. "In Transit" is shown only when the document is currently in transit.
     *
     * @param  \Illuminate\Support\Eloquent\Collection  $transfers
     * @param  array<int, string>  $tagMap
     * @return array<int, array{name: string, tag_id: int|null, isInTransit: bool, isCurrent: bool}>
     */
    private function buildLocationTimeline($transfers, array $tagMap, bool $inTransit, ?int $currentLocationTagId): array
    {
        $steps = [];
        $prevTagId = null;
        foreach ($transfers as $t) {
            if (in_array($t->type, ['release', 'archive_release'], true) && $t->from_tag_id) {
                $fromId = (int) $t->from_tag_id;
                $name = $tagMap[$fromId] ?? 'Office #' . $fromId;
                if ($fromId !== $prevTagId) {
                    $steps[] = ['name' => $name, 'tag_id' => $fromId, 'isInTransit' => false, 'isCurrent' => false, 'wrong_office' => false];
                    $prevTagId = $fromId;
                }
                // Do NOT reset prevTagId; avoids duplicate when release A then receive at A
            }
            if ($t->type === 'digital_release') {
                if ($t->from_tag_id) {
                    $fromId = (int) $t->from_tag_id;
                    $fromName = $tagMap[$fromId] ?? 'Office #' . $fromId;
                    if ($fromId !== $prevTagId) {
                        $steps[] = ['name' => $fromName, 'tag_id' => $fromId, 'isInTransit' => false, 'isCurrent' => false, 'wrong_office' => false];
                        $prevTagId = $fromId;
                    }
                }
                if ($t->to_tag_id) {
                    $toId = (int) $t->to_tag_id;
                    $toName = $tagMap[$toId] ?? 'Office #' . $toId;
                    if ($toId !== $prevTagId) {
                        $steps[] = ['name' => $toName, 'tag_id' => $toId, 'isInTransit' => false, 'isCurrent' => false, 'wrong_office' => false];
                        $prevTagId = $toId;
                    }
                }
                continue;
            }
            if ($t->type === 'receive' && $t->to_tag_id) {
                $toId = (int) $t->to_tag_id;
                $name = $tagMap[$toId] ?? 'Office #' . $toId;
                $wrongOffice = (bool) ($t->received_at_wrong_office ?? false);
                if ($wrongOffice) {
                    $name = $name . ' (wrongly forwarded)';
                }
                if ($toId !== $prevTagId) {
                    $steps[] = ['name' => $name, 'tag_id' => $toId, 'isInTransit' => false, 'isCurrent' => false, 'wrong_office' => $wrongOffice];
                    $prevTagId = $toId;
                }
            }
        }

        if ($inTransit) {
            $steps[] = ['name' => 'In Transit', 'tag_id' => null, 'isInTransit' => true, 'isCurrent' => true, 'wrong_office' => false];
        } elseif (! empty($steps)) {
            $steps[count($steps) - 1]['isCurrent'] = true;
        }

        return $steps;
    }

    private function computeEndorsementProgress($transfers, $endorsements): ?array
    {
        $release = $transfers->filter(fn ($t) => in_array($t->type, ['release', 'digital_release'], true))
            ->filter(fn ($t) => is_array($t->route_sequence) && ! empty($t->route_sequence))
            ->sortBy('created_at')
            ->first();

        if (! $release) {
            return null;
        }

        $canTake = $release->route_can_take_action ?? [];
        if (empty($canTake) && ! empty($release->route_sequence)) {
            $canTake = [(int) end($release->route_sequence)];
        }
        $canTake = array_map('intval', (array) $canTake);
        $routeOffices = array_map('intval', (array) ($release->route_sequence ?? []));
        $nonActionOffices = array_values(array_diff($routeOffices, $canTake));

        $needEndorsement = array_map('intval', (array) ($release->route_need_endorsement ?? []));
        $required = ! empty($needEndorsement) ? $needEndorsement : $nonActionOffices;

        if (empty($required)) {
            return null;
        }

        $endorsedTagIds = $endorsements->pluck('tag_id')->map('intval')->unique()->values()->all();
        $endorsed = count(array_intersect($required, $endorsedTagIds));

        return [
            'required' => count($required),
            'endorsed' => $endorsed,
        ];
    }
}
