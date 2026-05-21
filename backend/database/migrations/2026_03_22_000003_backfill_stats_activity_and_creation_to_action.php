<?php

use App\Models\DocumentStatusChange;
use App\Models\DocumentTransfer;
use App\Models\StatsActivityEvent;
use App\Models\StatsCreationToAction;
use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Http;

return new class extends Migration
{
    public function up(): void
    {
        $this->backfillActivityEvents();
        $this->backfillOriginateForNoTransferDocs();
        $this->backfillCreationToAction();
    }

    private function backfillOriginateForNoTransferDocs(): void
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');
        if (! $token) {
            return;
        }
        $allTransferredIds = DocumentTransfer::distinct()->pluck('document_id')->all();
        $headers = ['Authorization' => 'Token ' . $token];
        $nextUrl = "{$baseUrl}/api/documents/?page_size=100";
        while ($nextUrl) {
            $response = Http::withHeaders($headers)->timeout(15)->get($nextUrl);
            if (! $response->successful()) {
                break;
            }
            $data = $response->json();
            foreach ($data['results'] ?? [] as $doc) {
                $docId = $doc['id'] ?? $doc['pk'] ?? null;
                if ($docId === null || in_array($docId, $allTransferredIds, true)) {
                    continue;
                }
                $tags = $doc['tags'] ?? [];
                if (count($tags) !== 1) {
                    continue;
                }
                $tagId = (int) $tags[0];
                $exists = StatsActivityEvent::where('tag_id', $tagId)
                    ->where('document_id', $docId)
                    ->where('event_type', 'originate')
                    ->exists();
                if ($exists) {
                    continue;
                }
                $dateStr = $doc['added'] ?? $doc['created'] ?? $doc['created_date'] ?? null;
                if (! $dateStr) {
                    continue;
                }
                try {
                    $occurredAt = Carbon::parse($dateStr);
                } catch (\Throwable $e) {
                    continue;
                }
                StatsActivityEvent::create([
                    'tag_id' => $tagId,
                    'document_id' => $docId,
                    'event_type' => 'originate',
                    'occurred_at' => $occurredAt,
                ]);
            }
            $nextUrl = $data['next'] ?? null;
        }
    }

    private function backfillActivityEvents(): void
    {
        $receives = DocumentTransfer::where('type', 'receive')
            ->whereNotNull('to_tag_id')
            ->orderBy('created_at')
            ->get(['id', 'document_id', 'to_tag_id', 'created_at']);

        foreach ($receives as $r) {
            $exists = StatsActivityEvent::where('tag_id', (int) $r->to_tag_id)
                ->where('document_id', $r->document_id)
                ->where('event_type', 'receive')
                ->where('occurred_at', $r->created_at)
                ->exists();
            if (! $exists) {
                StatsActivityEvent::create([
                    'tag_id' => (int) $r->to_tag_id,
                    'document_id' => $r->document_id,
                    'event_type' => 'receive',
                    'occurred_at' => $r->created_at,
                ]);
            }
        }

        $firstReleases = DocumentTransfer::where('type', 'release')
            ->whereNotNull('from_tag_id')
            ->orderBy('document_id')
            ->orderBy('created_at')
            ->get(['document_id', 'from_tag_id', 'created_at']);

        $seen = [];
        foreach ($firstReleases as $r) {
            if (isset($seen[$r->document_id])) {
                continue;
            }
            $seen[$r->document_id] = true;
            $tagId = (int) $r->from_tag_id;
            $exists = StatsActivityEvent::where('tag_id', $tagId)
                ->where('document_id', $r->document_id)
                ->where('event_type', 'originate')
                ->exists();
            if (! $exists) {
                StatsActivityEvent::create([
                    'tag_id' => $tagId,
                    'document_id' => $r->document_id,
                    'event_type' => 'originate',
                    'occurred_at' => $r->created_at,
                ]);
            }
        }
    }

    private function backfillCreationToAction(): void
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');
        if (! $token) {
            return;
        }

        $finalActions = DocumentStatusChange::whereIn('to_status', ['Approved', 'Rejected'])
            ->orderBy('document_id')
            ->orderByDesc('created_at')
            ->get(['document_id', 'created_at']);

        $latestByDoc = [];
        foreach ($finalActions as $s) {
            if (! isset($latestByDoc[$s->document_id])) {
                $latestByDoc[$s->document_id] = $s->created_at;
            }
        }

        $headers = ['Authorization' => 'Token ' . $token];
        foreach ($latestByDoc as $docId => $actionAt) {
            if (StatsCreationToAction::where('document_id', $docId)->exists()) {
                continue;
            }
            $response = Http::withHeaders($headers)->timeout(10)->get("{$baseUrl}/api/documents/{$docId}/");
            if (! $response->successful()) {
                continue;
            }
            $doc = $response->json();
            $dateStr = $doc['added'] ?? $doc['created'] ?? $doc['created_date'] ?? null;
            if (! $dateStr) {
                continue;
            }
            try {
                $createdAt = Carbon::parse($dateStr);
            } catch (\Throwable $e) {
                continue;
            }
            $daysTaken = ($actionAt->timestamp - $createdAt->timestamp) / 86400;
            if ($daysTaken < 0) {
                continue;
            }
            StatsCreationToAction::create([
                'document_id' => $docId,
                'created_at_doc' => $createdAt,
                'action_at' => $actionAt,
                'days_taken' => $daysTaken,
            ]);
        }
    }

    public function down(): void
    {
        StatsActivityEvent::query()->delete();
        StatsCreationToAction::query()->delete();
    }
};
