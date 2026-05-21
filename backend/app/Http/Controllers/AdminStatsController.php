<?php

namespace App\Http\Controllers;

use App\Models\DocumentStatusChange;
use App\Models\DocumentTransfer;
use App\Models\Employee;
use App\Models\OfficeProcessingVisit;
use App\Models\StatsActivityEvent;
use App\Models\StatsCreationToAction;
use App\Services\PaperlessTagsCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class AdminStatsController extends Controller
{
    /** @var list<string> */
    private const WORKFLOW_STATUSES = ['Under Review', 'Needs Action', 'Approved', 'Rejected', 'For Archiving', 'Archived'];

    /**
     * Return admin dashboard stats: offices, documents, in transit.
     *
     * Document states are mutually exclusive:
     * - At office: document has exactly one tag (that office). Counted in documents_count.
     * - In transit: document has no tag (released, not yet received). Counted in in_transit_count.
     * Total documents = documents_count + in_transit_count (no double-counting).
     *
     * Single-office (tag_id): For department dashboard, returns at_office_count, in_transit_released_count,
     * and documents_count = at_office + in_transit_released (workload for that office).
     */
    public function index(Request $request): JsonResponse
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        $officesCount = 0;
        $documentsCount = 0;
        $inTransitCount = 0;
        $offices = [];
        $inTransitList = [];
        $globalStatusMix = null;
        $tagId = $request->query('tag_id');
        $excludeDocumentId = $request->query('exclude_document_id');
        $includeOffices = $request->boolean('include_offices');
        $includeInTransit = $request->boolean('include_in_transit');
        $includeAvgProcessingTime = $request->boolean('include_avg_processing_time');
        $includeDailyActivity = $request->boolean('include_daily_activity');

        if ($token) {
            $headers = ['Authorization' => 'Token ' . $token];

            try {
                $tags = [];
                $tagMap = [];

                if (! $tagId) {
                    $tagMap = PaperlessTagsCache::getTagMap();
                    $tags = [];
                    foreach ($tagMap as $tid => $name) {
                        $tags[] = ['id' => $tid, 'name' => $name ?: 'Office'];
                    }
                    $officesCount = count($tags);
                }

                $officeCounts = [];
                foreach (array_keys($tagMap) as $tid) {
                    $officeCounts[$tid] = 0;
                }
                $inTransitDocIds = [];
                $digitalPendingDocIds = [];
                $docsAtOffice = [];

                if ($tagId && ctype_digit((string) $tagId)) {
                    // Single-office request: count docs where tags === [tagId] and NOT released (last transfer is not release)
                    $nextUrl = "{$baseUrl}/api/documents/?page_size=100&tags={$tagId}";
                    $candidateDocIds = [];
                    $candidateDigitalPendingDocIds = [];
                    while ($nextUrl) {
                        $docResponse = Http::withHeaders($headers)->timeout(15)->get($nextUrl);
                        if (! $docResponse->successful()) {
                            break;
                        }
                        $docData = $docResponse->json();
                        $results = $docData['results'] ?? [];
                        foreach ($results as $doc) {
                            $docTags = $doc['tags'] ?? [];
                            $docId = $doc['id'] ?? null;
                            if ($docId && count($docTags) === 1 && (int) $docTags[0] === (int) $tagId) {
                                $candidateDocIds[] = $docId;
                                if ($this->isDigitalPendingCopyState($doc)) {
                                    $candidateDigitalPendingDocIds[] = (int) $docId;
                                }
                            }
                        }
                        $nextUrl = $docData['next'] ?? null;
                    }
                    $uniqueCandidates = array_values(array_unique($candidateDocIds));
                    $pendingSet = array_flip(array_values(array_unique($candidateDigitalPendingDocIds)));
                    $releasedDocIds = $this->getDocumentsLastReleased($uniqueCandidates);
                    $releasedSet = array_flip(array_map('intval', $releasedDocIds));
                    $atOfficeCount = 0;
                    foreach ($uniqueCandidates as $docId) {
                        $docId = (int) $docId;
                        if (isset($releasedSet[$docId]) || isset($pendingSet[$docId])) {
                            continue;
                        }
                        $atOfficeCount++;
                    }
                    $inTransitReleasedCount = $this->getInTransitReleasedFromOfficeCount($baseUrl, $headers, (int) $tagId);
                    $documentsCount = $atOfficeCount + $inTransitReleasedCount;
                    $originatedCount = $this->getDocumentsOriginatedAtOfficeCount(
                        (int) $tagId,
                        $uniqueCandidates,
                        $excludeDocumentId ? (int) $excludeDocumentId : null
                    );
                    $activityCounts = $this->getActivityCountsForOffice((int) $tagId);
                    $atOfficeDocIds = array_values(array_filter($uniqueCandidates, fn ($docId) => ! isset($releasedSet[(int) $docId]) && ! isset($pendingSet[(int) $docId])));
                    // received_still_with_us: only docs physically at our office (exclude in-transit from us - we've forwarded those)
                    $cumulativeStats = $this->getCumulativeStatsForOffice((int) $tagId, $atOfficeDocIds);
                } elseif ($includeOffices || $includeInTransit) {
                    // Full stats: fetch all docs when breakdown requested
                    $nextUrl = "{$baseUrl}/api/documents/?page_size=100";
                    while ($nextUrl) {
                        $docResponse = Http::withHeaders($headers)->timeout(15)->get($nextUrl);
                        if (! $docResponse->successful()) {
                            break;
                        }
                        $docData = $docResponse->json();
                        $results = $docData['results'] ?? [];
                        foreach ($results as $doc) {
                            $docTags = $doc['tags'] ?? [];
                            $docId = $doc['id'] ?? null;
                            $isDigitalPending = $this->isDigitalPendingCopyState($doc);
                            if ($isDigitalPending && $docId) {
                                $digitalPendingDocIds[] = (int) $docId;
                            }
                            if (empty($docTags)) {
                                $inTransitDocIds[] = $docId;
                            } elseif (count($docTags) === 1 && $docId) {
                                $soleTag = $docTags[0];
                                if (isset($officeCounts[$soleTag])) {
                                    $docsAtOffice[] = [
                                        'doc_id' => $docId,
                                        'tag_id' => $soleTag,
                                        'status' => $this->inferDocumentWorkflowStatus($doc),
                                        'digital_pending' => $isDigitalPending,
                                    ];
                                }
                            }
                        }
                        $nextUrl = $docData['next'] ?? null;
                    }
                    $candidateDocIds = array_column($docsAtOffice, 'doc_id');
                    $releasedDocIds = $this->getDocumentsLastReleased(array_unique($candidateDocIds));
                    $inTransitDocIds = array_values(array_unique(array_filter(array_merge($inTransitDocIds, $digitalPendingDocIds))));
                    foreach ($docsAtOffice as $entry) {
                        if (! empty($entry['digital_pending'])) {
                            continue;
                        }
                        if (! in_array($entry['doc_id'], $releasedDocIds, true)) {
                            $officeCounts[$entry['tag_id']]++;
                        }
                    }
                    // documents_count = docs physically at offices only (excludes in-transit)
                    $documentsCount = (int) array_sum($officeCounts);

                    $globalStatusMix = [
                        'Under Review' => 0,
                        'Needs Action' => 0,
                        'Approved' => 0,
                        'Rejected' => 0,
                        'For Archiving' => 0,
                        'Archived' => 0,
                    ];
                    foreach ($docsAtOffice as $entry) {
                        if (! empty($entry['digital_pending'])) {
                            continue;
                        }
                        if (in_array($entry['doc_id'], $releasedDocIds, true)) {
                            continue;
                        }
                        $st = $entry['status'] ?? 'Under Review';
                        if (! isset($globalStatusMix[$st])) {
                            $st = 'Under Review';
                        }
                        $globalStatusMix[$st]++;
                    }
                } else {
                    // Quick path: just get totals for initial overview load (cache 60s)
                    $cacheKey = 'admin_stats_quick';
                    $cached = Cache::get($cacheKey);
                    if ($cached !== null) {
                        $documentsCount = $cached['documents_count'] ?? 0;
                        $inTransitCount = $cached['in_transit_count'] ?? 0;
                    } else {
                        $docUrl = "{$baseUrl}/api/documents/?page_size=1";
                        $docResponse = Http::withHeaders($headers)->timeout(10)->get($docUrl);
                        if ($docResponse->successful()) {
                            $docData = $docResponse->json();
                            $documentsCount = (int) ($docData['count'] ?? 0);
                        }
                        $untaggedUrl = "{$baseUrl}/api/documents/?query=is:untagged&page_size=1";
                        $untaggedResponse = Http::withHeaders($headers)->timeout(10)->get($untaggedUrl);
                        if ($untaggedResponse->successful()) {
                            $untaggedData = $untaggedResponse->json();
                            $inTransitCount = (int) ($untaggedData['count'] ?? 0);
                        }
                        Cache::put($cacheKey, ['documents_count' => $documentsCount, 'in_transit_count' => $inTransitCount], 60);
                    }
                }

                if (! ($tagId && ctype_digit((string) $tagId)) && ! empty($inTransitDocIds)) {
                    $inTransitDocIds = array_values(array_unique(array_map('intval', $inTransitDocIds)));
                    $inTransitCount = count($inTransitDocIds);
                }

                // In-transit details: last released from office
                if ($includeInTransit && ! empty($inTransitDocIds)) {
                    $releases = DocumentTransfer::whereIn('document_id', $inTransitDocIds)
                        ->whereIn('type', ['release', 'digital_release', 'archive_release'])
                        ->orderBy('document_id')
                        ->orderByDesc('created_at')
                        ->orderByDesc('id')
                        ->get(['document_id', 'from_tag_id', 'tracking_code', 'created_at']);

                    $lastReleaseByDoc = [];
                    foreach ($releases as $r) {
                        if (! isset($lastReleaseByDoc[$r->document_id])) {
                            $lastReleaseByDoc[$r->document_id] = [
                                'document_id' => $r->document_id,
                                'tracking_code' => $r->tracking_code,
                                'released_from_tag_id' => $r->from_tag_id,
                                'released_from' => $tagMap[$r->from_tag_id] ?? 'Unknown',
                                'released_at' => $r->created_at->toIso8601String(),
                            ];
                        }
                    }

                    foreach ($inTransitDocIds as $did) {
                        $info = $lastReleaseByDoc[$did] ?? [
                            'document_id' => $did,
                            'tracking_code' => null,
                            'released_from_tag_id' => null,
                            'released_from' => 'Unknown',
                            'released_at' => null,
                        ];
                        $inTransitList[] = $info;
                    }
                }

                // Per-office breakdown: at_office (physical) + in_transit_released (released by this office)
                if ($includeOffices && ! $tagId && ! empty($tags)) {
                    $inTransitByOffice = [];
                    if (! empty($inTransitDocIds)) {
                        $releases = DocumentTransfer::whereIn('document_id', $inTransitDocIds)
                            ->whereIn('type', ['release', 'digital_release', 'archive_release'])
                            ->orderBy('document_id')
                            ->orderByDesc('created_at')
                            ->orderByDesc('id')
                            ->get(['document_id', 'from_tag_id']);
                        foreach ($releases as $r) {
                            if (! isset($inTransitByOffice[$r->document_id])) {
                                $inTransitByOffice[$r->document_id] = (int) $r->from_tag_id;
                            }
                        }
                    }
                    $inTransitCountByTag = [];
                    foreach ($inTransitByOffice as $docId => $fromTagId) {
                        if ($fromTagId > 0) {
                            $inTransitCountByTag[$fromTagId] = ($inTransitCountByTag[$fromTagId] ?? 0) + 1;
                        }
                    }
                    $seenTagIds = [];
                    foreach ($tags as $tag) {
                        $tid = $tag['id'] ?? $tag['pk'] ?? null;
                        $name = $tag['name'] ?? 'Office';
                        if ($tid === null) {
                            continue;
                        }
                        $seenTagIds[(int) $tid] = true;
                        $atOffice = $officeCounts[$tid] ?? 0;
                        $inTransitReleased = $inTransitCountByTag[(int) $tid] ?? 0;
                        $officeCumulative = $this->getCumulativeStatsForOffice((int) $tid);
                        $office = [
                            'tag_id' => (int) $tid,
                            'name' => $name,
                            'documents_count' => $atOffice,
                            'in_transit_released_count' => $inTransitReleased,
                            'cumulative_received_count' => $officeCumulative['cumulative_received_count'],
                            'cumulative_originated_count' => $officeCumulative['cumulative_originated_count'],
                        ];
                        if ($includeAvgProcessingTime) {
                            $avgDays = $this->getAvgProcessingTimeReceiveToRelease((int) $tid);
                            if ($avgDays !== null) {
                                $office['avg_processing_time_label'] = $this->formatDaysLabel($avgDays);
                            }
                        }
                        $offices[] = $office;
                    }
                    // Include offices that released in-transit docs but may not be in tags (e.g. wrong offices, stale refs)
                    foreach (array_keys($inTransitCountByTag) as $releasedFromId) {
                        if (! isset($seenTagIds[(int) $releasedFromId])) {
                            $orphanCumulative = $this->getCumulativeStatsForOffice((int) $releasedFromId);
                            $offices[] = [
                                'tag_id' => (int) $releasedFromId,
                                'name' => $tagMap[$releasedFromId] ?? 'Office #' . $releasedFromId,
                                'documents_count' => 0,
                                'in_transit_released_count' => $inTransitCountByTag[$releasedFromId],
                                'cumulative_received_count' => $orphanCumulative['cumulative_received_count'],
                                'cumulative_originated_count' => $orphanCumulative['cumulative_originated_count'],
                            ];
                        }
                    }
                }

            } catch (\Throwable $e) {
                // Return zeros on any error
            }
        }

        $employeesCount = Employee::count();

        $payload = [
            'offices_count' => $officesCount,
            'documents_count' => $documentsCount,
            'in_transit_count' => $inTransitCount,
            'employees_count' => $employeesCount,
        ];
        if (! empty($offices)) {
            $payload['offices'] = $offices;
        }
        if (! empty($inTransitList)) {
            $payload['in_transit'] = $inTransitList;
        }
        if (isset($originatedCount)) {
            $payload['originated_documents_count'] = $originatedCount;
        }
        if (isset($inTransitReleasedCount)) {
            $payload['in_transit_released_count'] = $inTransitReleasedCount;
        }
        if (isset($atOfficeCount)) {
            $payload['at_office_count'] = $atOfficeCount;
        }
        if (isset($activityCounts)) {
            $payload['activity_today'] = $activityCounts['today'] ?? 0;
            $payload['activity_this_week'] = $activityCounts['this_week'] ?? 0;
            $payload['activity_this_month'] = $activityCounts['this_month'] ?? 0;
        }
        if (isset($cumulativeStats)) {
            $payload['cumulative_received_count'] = $cumulativeStats['cumulative_received_count'];
            $payload['cumulative_originated_count'] = $cumulativeStats['cumulative_originated_count'];
            $payload['received_still_with_us_count'] = $cumulativeStats['received_still_with_us_count'] ?? 0;
        }
        if ($includeOffices) {
            $payload['total_documents_ever_processed'] = $this->getTotalDocumentsEverProcessed();
        }

        if ($includeAvgProcessingTime) {
            if ($tagId && ctype_digit((string) $tagId)) {
                $avgDays = $this->getAvgProcessingTimeReceiveToRelease((int) $tagId);
                if ($avgDays !== null) {
                    $payload['avg_processing_time_receive_to_release_days'] = round($avgDays, 1);
                    $payload['avg_processing_time_receive_to_release_label'] = $this->formatDaysLabel($avgDays);
                }
            } elseif ($token) {
                $avgDays = $this->getAvgProcessingTimeCreationToAction($baseUrl, $token);
                if ($avgDays !== null) {
                    $payload['avg_processing_time_creation_to_action_days'] = round($avgDays, 1);
                    $payload['avg_processing_time_creation_to_action_label'] = $this->formatDaysLabel($avgDays);
                }
            }
        }

        if ($includeDailyActivity && ! ($tagId && ctype_digit((string) $tagId))) {
            $sysAct = $this->getSystemWideActivityCounts();
            $payload['system_activity_today'] = $sysAct['today'];
            $payload['system_activity_this_week'] = $sysAct['this_week'];
            $payload['system_activity_this_month'] = $sysAct['this_month'];
            $dailyDays = max(1, min(366, (int) $request->query('daily_activity_days', 90)));
            $payload['daily_documents_activity'] = $this->getSystemWideDailyActivitySeries($dailyDays);
        }

        if ($globalStatusMix !== null && ! ($tagId && ctype_digit((string) $tagId))) {
            $payload['global_status_mix'] = $globalStatusMix;
        }

        if (($includeOffices || $includeInTransit) && ! ($tagId && ctype_digit((string) $tagId))) {
            $sysCum = $this->getSystemWideCumulativeCounts();
            $payload['system_cumulative_received_count'] = $sysCum['received'];
            $payload['system_cumulative_originated_count'] = $sysCum['originated'];
        }

        return response()->json($payload);
    }

    /**
     * Cumulative stats for an office: total received and originated (all time).
     * received_still_with_us: documents we received (did not originate) that are physically at our office.
     * When we forward a received doc, it leaves our office and no longer counts in our total.
     */
    private function getCumulativeStatsForOffice(int $tagId, array $docIdsWithUs = []): array
    {
        $received = (int) StatsActivityEvent::where('tag_id', $tagId)
            ->where('event_type', 'receive')
            ->selectRaw('COUNT(DISTINCT document_id) as c')
            ->value('c');
        $originated = (int) StatsActivityEvent::where('tag_id', $tagId)
            ->where('event_type', 'originate')
            ->selectRaw('COUNT(DISTINCT document_id) as c')
            ->value('c');
        $receivedStillWithUs = empty($docIdsWithUs) ? 0 : $this->getReceivedStillWithUsCount($tagId, $docIdsWithUs);

        return [
            'cumulative_received_count' => $received,
            'cumulative_originated_count' => $originated,
            'received_still_with_us_count' => $receivedStillWithUs,
        ];
    }

    /**
     * Count documents we received (did not originate) that are still with us (at office or in transit from us).
     *
     * @param  array<int>  $docIdsWithUs
     */
    private function getReceivedStillWithUsCount(int $tagId, array $docIdsWithUs): int
    {
        if (empty($docIdsWithUs)) {
            return 0;
        }
        $docIdsWithUs = array_values(array_unique(array_map('intval', $docIdsWithUs)));
        $originatedIds = StatsActivityEvent::where('tag_id', $tagId)
            ->where('event_type', 'originate')
            ->whereIn('document_id', $docIdsWithUs)
            ->distinct()
            ->pluck('document_id')
            ->all();
        $originatedSet = array_flip(array_map('intval', $originatedIds));
        $receivedIds = StatsActivityEvent::where('tag_id', $tagId)
            ->where('event_type', 'receive')
            ->whereIn('document_id', $docIdsWithUs)
            ->distinct()
            ->pluck('document_id')
            ->all();
        $count = 0;
        foreach ($receivedIds as $docId) {
            if (! isset($originatedSet[(int) $docId])) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * Total unique documents ever processed system-wide (received or originated at any office).
     */
    private function getTotalDocumentsEverProcessed(): int
    {
        return (int) StatsActivityEvent::selectRaw('COUNT(DISTINCT document_id) as c')->value('c');
    }

    /**
     * Count documents originated at the given office.
     * Uses persistent stats_activity_events (event_type=originate) - data retained when documents are removed.
     */
    private function getDocumentsOriginatedAtOfficeCount(int $tagId, array $candidateDocIds, ?int $excludeDocumentId = null, array $existingDocIds = []): int
    {
        $count = (int) StatsActivityEvent::where('tag_id', $tagId)
            ->where('event_type', 'originate')
            ->selectRaw('COUNT(DISTINCT document_id) as c')
            ->value('c');

        if ($excludeDocumentId !== null) {
            $hasOriginate = StatsActivityEvent::where('tag_id', $tagId)
                ->where('document_id', $excludeDocumentId)
                ->where('event_type', 'originate')
                ->exists();
            if ($hasOriginate) {
                $count--;
            }
        }

        return max(0, $count);
    }

    /**
     * Return document IDs that have ever been received (received at any office).
     * These documents were not originated (uploaded) at the current office.
     *
     * @param  array<int>  $documentIds
     * @return array<int>
     */
    private function getDocumentsEverReceived(array $documentIds): array
    {
        if (empty($documentIds)) {
            return [];
        }

        return DocumentTransfer::whereIn('document_id', $documentIds)
            ->where('type', 'receive')
            ->distinct()
            ->pluck('document_id')
            ->all();
    }

    /**
     * System-wide activity: distinct documents with any stats event (receive/originate) in the window.
     * Mirrors office dashboard “added” semantics using DTS stats (not Paperless added dates).
     */
    private function getSystemWideActivityCounts(): array
    {
        $now = now();
        $todayStart = $now->copy()->startOfDay();
        $weekStart = $now->copy()->subDays(7)->startOfDay();
        $monthStart = $now->copy()->subDays(30)->startOfDay();

        $countSince = static function ($since) {
            $v = StatsActivityEvent::where('occurred_at', '>=', $since)
                ->selectRaw('COUNT(DISTINCT document_id) as c')
                ->value('c');

            return (int) $v;
        };

        return [
            'today' => $countSince($todayStart),
            'this_week' => $countSince($weekStart),
            'this_month' => $countSince($monthStart),
        ];
    }

    /**
     * Per-calendar-day distinct document counts (all offices), last N days.
     *
     * @return array<int, array{date: string, count: int}>
     */
    private function getSystemWideDailyActivitySeries(int $numDays = 30): array
    {
        $numDays = max(1, min(366, $numDays));
        $driver = DB::connection()->getDriverName();
        $dateSql = $driver === 'sqlite'
            ? "strftime('%Y-%m-%d', occurred_at)"
            : 'DATE(occurred_at)';

        $start = now()->copy()->subDays($numDays - 1)->startOfDay();

        $rows = StatsActivityEvent::query()
            ->where('occurred_at', '>=', $start)
            ->selectRaw("{$dateSql} as day_date, COUNT(DISTINCT document_id) as cnt")
            ->groupByRaw($dateSql)
            ->orderBy('day_date')
            ->get();

        $byDay = [];
        foreach ($rows as $row) {
            $k = $row->day_date;
            if ($k !== null && $k !== '') {
                $byDay[(string) $k] = (int) $row->cnt;
            }
        }

        $out = [];
        for ($i = $numDays - 1; $i >= 0; $i--) {
            $d = now()->copy()->startOfDay()->subDays($i);
            $key = $d->format('Y-m-d');
            $out[] = ['date' => $key, 'count' => $byDay[$key] ?? 0];
        }

        return $out;
    }

    /**
     * Unique documents ever received / originated system-wide (DTS stats).
     *
     * @return array{received: int, originated: int}
     */
    private function getSystemWideCumulativeCounts(): array
    {
        $received = (int) StatsActivityEvent::where('event_type', 'receive')
            ->selectRaw('COUNT(DISTINCT document_id) as c')
            ->value('c');
        $originated = (int) StatsActivityEvent::where('event_type', 'originate')
            ->selectRaw('COUNT(DISTINCT document_id) as c')
            ->value('c');

        return ['received' => $received, 'originated' => $originated];
    }

    /**
     * Read workflow status from Paperless custom_fields (same values as the department UI).
     * Prefer Archiving field ("For Archiving") and explicit "Archived" over Document Status so
     * approved docs marked for archiving are not counted only as Approved in global_status_mix.
     */
    private function inferDocumentWorkflowStatus(array $doc): string
    {
        $values = [];
        foreach ($doc['custom_fields'] ?? [] as $cf) {
            $v = $cf['value'] ?? null;
            if ($v === null || $v === '') {
                continue;
            }
            if (is_scalar($v)) {
                $values[] = (string) $v;
            }
        }
        if (in_array('For Archiving', $values, true)) {
            return 'For Archiving';
        }
        if (in_array('Archived', $values, true)) {
            return 'Archived';
        }
        foreach ($values as $vs) {
            if (in_array($vs, self::WORKFLOW_STATUSES, true)) {
                return $vs;
            }
        }

        return 'Under Review';
    }

    /**
     * Activity counts for department dashboard: documents that arrived at this office
     * (received from others OR originated/uploaded here) in today, this week, this month.
     * Uses persistent stats_activity_events - data retained when documents are removed.
     */
    private function getActivityCountsForOffice(int $tagId): array
    {
        $now = now();
        $todayStart = $now->copy()->startOfDay();
        $weekStart = $now->copy()->subDays(7)->startOfDay();
        $monthStart = $now->copy()->subDays(30)->startOfDay();

        $countSince = static function ($since) use ($tagId) {
            $v = StatsActivityEvent::where('tag_id', $tagId)
                ->where('occurred_at', '>=', $since)
                ->selectRaw('COUNT(DISTINCT document_id) as c')
                ->value('c');
            return (int) $v;
        };

        return [
            'today' => $countSince($todayStart),
            'this_week' => $countSince($weekStart),
            'this_month' => $countSince($monthStart),
        ];
    }

    /**
     * Get document IDs that originated at this office (uploaded here or first released from here).
     *
     * @param  array<int>  $candidateDocIds
     * @param  array<int, bool>  $existingDocIds
     * @return array<int>
     */
    private function getOriginatedDocumentIds(int $tagId, array $candidateDocIds, array $existingDocIds): array
    {
        $allTransferredDocIds = DocumentTransfer::distinct()->pluck('document_id')->all();
        $noTransferAtOffice = array_diff($candidateDocIds, $allTransferredDocIds);
        $ids = [];
        foreach ($noTransferAtOffice as $docId) {
            if (empty($existingDocIds) || isset($existingDocIds[(int) $docId])) {
                $ids[] = (int) $docId;
            }
        }

        $firstTransferByDoc = DocumentTransfer::orderBy('document_id')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['document_id', 'type', 'from_tag_id']);

        $seen = [];
        foreach ($firstTransferByDoc as $t) {
            if (isset($seen[$t->document_id])) {
                continue;
            }
            $seen[$t->document_id] = true;
            if (in_array($t->type, ['release', 'archive_release'], true) && (int) $t->from_tag_id === $tagId) {
                if (empty($existingDocIds) || isset($existingDocIds[(int) $t->document_id])) {
                    $ids[] = (int) $t->document_id;
                }
            }
        }

        return array_values(array_unique($ids));
    }

    /**
     * Return document IDs currently in transit (untagged) that were released from the given office.
     * Uses Paperless query=is:untagged to fetch only in-transit docs instead of scanning all.
     *
     * @param  array<string, string>  $headers
     * @return array<int>
     */
    private function getInTransitReleasedFromOfficeDocIds(string $baseUrl, array $headers, int $tagId): array
    {
        $untaggedDocIds = [];
        $nextUrl = "{$baseUrl}/api/documents/?query=" . urlencode('is:untagged') . '&page_size=100';
        while ($nextUrl) {
            $response = Http::withHeaders($headers)->timeout(15)->get($nextUrl);
            if (! $response->successful()) {
                break;
            }
            $data = $response->json();
            foreach ($data['results'] ?? [] as $doc) {
                $id = $doc['id'] ?? $doc['pk'] ?? null;
                if ($id !== null) {
                    $untaggedDocIds[] = (int) $id;
                }
            }
            $nextUrl = $data['next'] ?? null;
        }
        if (empty($untaggedDocIds)) {
            return [];
        }

        $latest = DocumentTransfer::whereIn('document_id', $untaggedDocIds)
            ->orderBy('document_id')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get(['document_id', 'type', 'from_tag_id']);

        $lastByDoc = [];
        foreach ($latest as $t) {
            if (! isset($lastByDoc[$t->document_id])) {
                $lastByDoc[$t->document_id] = ['type' => $t->type, 'from_tag_id' => $t->from_tag_id];
            }
        }

        $ids = [];
        foreach ($lastByDoc as $docId => $info) {
            if (in_array($info['type'] ?? '', ['release', 'archive_release'], true) && isset($info['from_tag_id']) && (int) $info['from_tag_id'] === $tagId) {
                $ids[] = (int) $docId;
            }
        }

        return $ids;
    }

    /**
     * Count documents currently in transit (untagged) that were released from the given office.
     *
     * @param  array<string, string>  $headers
     */
    private function getInTransitReleasedFromOfficeCount(string $baseUrl, array $headers, int $tagId): int
    {
        $physicalInTransitIds = $this->getInTransitReleasedFromOfficeDocIds($baseUrl, $headers, $tagId);
        $digitalPendingDocIds = $this->getDigitalPendingDocumentIds($baseUrl, $headers);

        $digitalPendingReleasedByOffice = [];
        if (! empty($digitalPendingDocIds)) {
            $latest = DocumentTransfer::whereIn('document_id', $digitalPendingDocIds)
                ->whereIn('type', ['release', 'digital_release', 'archive_release', 'receive'])
                ->orderBy('document_id')
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->get(['document_id', 'type', 'from_tag_id']);
            $lastByDoc = [];
            foreach ($latest as $t) {
                if (! isset($lastByDoc[$t->document_id])) {
                    $lastByDoc[$t->document_id] = $t;
                }
            }
            foreach ($lastByDoc as $docId => $t) {
                if ((string) $t->type === 'digital_release' && (int) ($t->from_tag_id ?? 0) === $tagId) {
                    $digitalPendingReleasedByOffice[] = (int) $docId;
                }
            }
        }

        $combined = array_values(array_unique(array_merge($physicalInTransitIds, $digitalPendingReleasedByOffice)));
        return count($combined);
    }

    /**
     * Return document IDs whose last transfer is a release (released by a department).
     * These should not be counted at any office (they are in transit).
     *
     * @param  array<int>  $documentIds
     * @return array<int>
     */
    private function getDocumentsLastReleased(array $documentIds): array
    {
        if (empty($documentIds)) {
            return [];
        }

        $latest = DocumentTransfer::whereIn('document_id', $documentIds)
            ->orderBy('document_id')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get(['document_id', 'type']);

        $lastByDoc = [];
        foreach ($latest as $t) {
            if (! isset($lastByDoc[$t->document_id])) {
                $lastByDoc[$t->document_id] = $t->type;
            }
        }

        return array_keys(array_filter($lastByDoc, fn ($type) => in_array($type, ['release', 'archive_release'], true)));
    }

    /**
     * Average processing time: creation (Paperless) → final action (Approved/Rejected).
     * Uses persistent stats_creation_to_action - data retained when documents are removed.
     */
    private function getAvgProcessingTimeCreationToAction(string $baseUrl, string $token): ?float
    {
        $row = StatsCreationToAction::selectRaw('AVG(days_taken) as avg_days, COUNT(*) as cnt')->first();
        if (! $row || (int) $row->cnt === 0) {
            return null;
        }
        return (float) $row->avg_days;
    }

    /**
     * Record an upload (originate) event for stats. Called when a document is first uploaded to an office.
     */
    public function recordUpload(Request $request): JsonResponse
    {
        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'document_id' => 'required|integer|min:1',
            'tag_id' => 'required|integer|min:1',
        ]);
        if ($validator->fails()) {
            return response()->json(['message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }
        $documentId = (int) $request->document_id;
        $tagId = (int) $request->tag_id;

        $exists = StatsActivityEvent::where('tag_id', $tagId)
            ->where('document_id', $documentId)
            ->where('event_type', 'originate')
            ->exists();
        if ($exists) {
            return response()->json(['message' => 'Already recorded'], 200);
        }

        StatsActivityEvent::create([
            'tag_id' => $tagId,
            'document_id' => $documentId,
            'event_type' => 'originate',
            'occurred_at' => now(),
        ]);
        Cache::forget('admin_stats_quick');

        return response()->json(['message' => 'Upload recorded'], 201);
    }

    /**
     * Reset all persistent statistics. Clears office_processing_visits, stats_activity_events, stats_creation_to_action.
     */
    public function resetStats(Request $request): JsonResponse
    {
        OfficeProcessingVisit::query()->delete();
        StatsActivityEvent::query()->delete();
        StatsCreationToAction::query()->delete();
        return response()->json(['message' => 'Statistics reset successfully']);
    }

    /**
     * Fetch document dates from Paperless for given document IDs.
     * Prefers "added" (when doc entered Paperless/uploaded) over "created" (file creation date from metadata).
     * This aligns activity stats with when documents actually arrived at the office.
     *
     * @param  array<int>  $docIds
     * @return array<int, string> Map of document_id => date string (Y-m-d or ISO)
     */
    private function fetchDocumentCreatedDates(string $baseUrl, string $token, array $docIds): array
    {
        if (empty($docIds)) {
            return [];
        }
        $headers = ['Authorization' => 'Token ' . $token];
        $result = [];
        $chunks = array_chunk($docIds, 50);
        foreach ($chunks as $chunk) {
            $ids = implode(',', $chunk);
            $url = "{$baseUrl}/api/documents/?page_size=100&id__in={$ids}";
            $nextUrl = $url;
            while ($nextUrl) {
                $response = Http::withHeaders($headers)->timeout(15)->get($nextUrl);
                if (! $response->successful()) {
                    break;
                }
                $data = $response->json();
                foreach ($data['results'] ?? [] as $doc) {
                    $id = $doc['id'] ?? $doc['pk'] ?? null;
                    if ($id === null) {
                        continue;
                    }
                    // Prefer added (when doc entered Paperless) over created (file metadata date)
                    $dateStr = $doc['added'] ?? $doc['created'] ?? $doc['created_date'] ?? null;
                    if ($dateStr) {
                        $result[(int) $id] = $dateStr;
                    }
                }
                $nextUrl = $data['next'] ?? null;
            }
        }
        return $result;
    }

    /**
     * Average processing time per "visit": each receive paired with the next release.
     * Uses stored office_processing_visits (retained regardless of document location).
     * New visits are recorded when releases occur; avg = sum of all stored visits / count.
     */
    private function getAvgProcessingTimeReceiveToRelease(int $tagId): ?float
    {
        $row = OfficeProcessingVisit::where('tag_id', $tagId)
            ->selectRaw('AVG(days_taken) as avg_days, COUNT(*) as cnt')
            ->first();

        if (! $row || (int) $row->cnt === 0) {
            return null;
        }

        return (float) $row->avg_days;
    }

    private function formatDaysLabel(float $days): string
    {
        if ($days < 1 / 24) {
            $mins = round($days * 24 * 60, 1);
            return $mins < 1 ? '<1 min' : ($mins == 1 ? '1 min' : "{$mins} min");
        }
        if ($days < 1) {
            $hours = round($days * 24, 1);
            return $hours == 1 ? '1 hour' : "{$hours} hours";
        }
        $d = round($days, 1);
        return $d == 1 ? '1 day' : "{$d} days";
    }

    /**
     * Best-effort check from Paperless custom_fields payload.
     */
    private function isDigitalPendingCopyState(array $doc): bool
    {
        foreach (($doc['custom_fields'] ?? []) as $cf) {
            if (! is_array($cf)) {
                continue;
            }
            $value = strtolower(trim((string) ($cf['value'] ?? '')));
            if ($value !== '' && str_contains($value, 'digital') && str_contains($value, 'pending')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Fetch document IDs currently marked as digital physical-pending.
     *
     * @param  array<string, string>  $headers
     * @return array<int>
     */
    private function getDigitalPendingDocumentIds(string $baseUrl, array $headers): array
    {
        $ids = [];
        $query = urlencode(json_encode(['Document Copy State', 'exact', 'Digital (physical pending)']));
        $nextUrl = "{$baseUrl}/api/documents/?custom_field_query={$query}&page_size=100";
        while ($nextUrl) {
            $response = Http::withHeaders($headers)->timeout(15)->get($nextUrl);
            if (! $response->successful()) {
                break;
            }
            $data = $response->json();
            foreach ($data['results'] ?? [] as $doc) {
                $id = $doc['id'] ?? $doc['pk'] ?? null;
                if ($id !== null) {
                    $ids[] = (int) $id;
                }
            }
            $nextUrl = $data['next'] ?? null;
        }

        return array_values(array_unique($ids));
    }
}
