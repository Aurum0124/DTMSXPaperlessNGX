<?php

namespace App\Http\Controllers;

use App\Models\DocumentComment;
use App\Models\DocumentEndorsement;
use App\Models\DocumentStatusChange;
use App\Models\DocumentTransfer;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

class DocumentHistoryController extends Controller
{
    /**
     * Combined document history: Paperless + Laravel transfers in one round-trip.
     */
    public function __invoke(int $id): JsonResponse
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (!$token) {
            $endorsementsNoToken = DocumentEndorsement::with('user:id,name')->where('document_id', $id)->orderBy('created_at')->get();
            $transfersNoToken = DocumentTransfer::where('document_id', $id)->orderBy('created_at')->get(['id', 'document_id', 'from_tag_id', 'to_tag_id', 'type', 'received_at_wrong_office', 'route_sequence', 'route_can_take_action', 'route_need_endorsement', 'created_at']);
            $endorsementProgressNoToken = $this->computeEndorsementProgress($transfersNoToken, $endorsementsNoToken);
            return response()->json([
                'paperlessHistory' => [],
                'transfers' => [],
                'endorsements' => $endorsementsNoToken->map(fn ($e) => [
                    'id' => 'endorsement_' . $e->id,
                    'document_id' => $e->document_id,
                    'tag_id' => $e->tag_id,
                    'user_name' => $e->user?->name ?? null,
                    'remarks' => $e->remarks,
                    'created_at' => $e->created_at->toIso8601String(),
                ]),
                'statusChanges' => DocumentStatusChange::with('user:id,name,tag_id')->where('document_id', $id)->orderBy('created_at')->get()->map(fn ($s) => [
                    'id' => 'status_' . $s->id,
                    'document_id' => $s->document_id,
                    'from_status' => $s->from_status,
                    'to_status' => $s->to_status,
                    'remarks' => $s->remarks,
                    'user_name' => $s->user?->name ?? null,
                    'tag_id' => $s->user?->tag_id ?? null,
                    'created_at' => $s->created_at->toIso8601String(),
                ]),
                'notes' => DocumentComment::with('user:id,name,tag_id')->where('document_id', $id)->orderBy('created_at')->get()->map(fn ($c) => [
                    'id' => 'note_' . $c->id,
                    'document_id' => $c->document_id,
                    'user_id' => $c->user_id,
                    'tag_id' => $c->user?->tag_id ?? null,
                    'user_name' => $c->user?->name ?? null,
                    'note' => $c->comment,
                    'created_at' => $c->created_at->toIso8601String(),
                ]),
                'endorsementProgress' => $endorsementProgressNoToken,
            ], 200);
        }

        $paperlessUrl = "{$baseUrl}/api/documents/{$id}/history/";

        $paperless = Http::withHeaders(['Authorization' => 'Token ' . $token])
            ->timeout(15)
            ->get($paperlessUrl);

        $transfers = DocumentTransfer::with('user:id,name')
            ->where('document_id', $id)
            ->orderBy('created_at')
            ->get([
                'id', 'document_id', 'from_tag_id', 'to_tag_id', 'type', 'received_at_wrong_office',
                'route_sequence', 'route_can_take_action', 'route_need_endorsement', 'created_at', 'user_id',
            ]);

        $statusChanges = DocumentStatusChange::with('user:id,name,tag_id')
            ->where('document_id', $id)
            ->orderBy('created_at')
            ->get(['id', 'document_id', 'from_status', 'to_status', 'remarks', 'user_id', 'created_at']);

        $notes = DocumentComment::with('user:id,name,tag_id')
            ->where('document_id', $id)
            ->orderBy('created_at')
            ->get(['id', 'document_id', 'user_id', 'comment', 'created_at']);

        $endorsements = DocumentEndorsement::with('user:id,name')
            ->where('document_id', $id)
            ->orderBy('created_at')
            ->get(['id', 'document_id', 'tag_id', 'user_id', 'remarks', 'created_at']);

        $paperlessData = $paperless->successful() ? $paperless->json() : [];
        $paperlessList = is_array($paperlessData) ? $paperlessData : ($paperlessData['results'] ?? []);

        $endorsementProgress = $this->computeEndorsementProgress($transfers, $endorsements);

        return response()->json([
            'paperlessHistory' => $paperlessList,
            'transfers' => $transfers->map(fn ($t) => [
                'id' => 'transfer_' . $t->id,
                'document_id' => $t->document_id,
                'from_tag_id' => $t->from_tag_id,
                'to_tag_id' => $t->to_tag_id,
                'type' => $t->type,
                'user_name' => $t->user?->name ?? null,
                'received_at_wrong_office' => (bool) ($t->received_at_wrong_office ?? false),
                'route_sequence' => $t->route_sequence,
                'route_can_take_action' => $t->route_can_take_action,
                'route_need_endorsement' => $t->route_need_endorsement,
                'created_at' => $t->created_at->toIso8601String(),
            ]),
            'endorsements' => $endorsements->map(fn ($e) => [
                'id' => 'endorsement_' . $e->id,
                'document_id' => $e->document_id,
                'tag_id' => $e->tag_id,
                'user_name' => $e->user?->name ?? null,
                'remarks' => $e->remarks,
                'created_at' => $e->created_at->toIso8601String(),
            ]),
            'statusChanges' => $statusChanges->map(fn ($s) => [
                'id' => 'status_' . $s->id,
                'document_id' => $s->document_id,
                'from_status' => $s->from_status,
                'to_status' => $s->to_status,
                'remarks' => $s->remarks,
                'user_name' => $s->user?->name ?? null,
                'tag_id' => $s->user?->tag_id ?? null,
                'created_at' => $s->created_at->toIso8601String(),
            ]),
            'notes' => $notes->map(fn ($c) => [
                'id' => 'note_' . $c->id,
                'document_id' => $c->document_id,
                'user_id' => $c->user_id,
                'tag_id' => $c->user?->tag_id ?? null,
                'user_name' => $c->user?->name ?? null,
                'note' => $c->comment,
                'created_at' => $c->created_at->toIso8601String(),
            ]),
            'endorsementProgress' => $endorsementProgress,
        ]);
    }

    /**
     * Compute endorsement progress: how many of the required offices have endorsed.
     * Uses route_need_endorsement when present; otherwise nonActionOffices.
     */
    private function computeEndorsementProgress($transfers, $endorsements): ?array
    {
        $release = $transfers->filter(fn ($t) => $t->type === 'release')
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
