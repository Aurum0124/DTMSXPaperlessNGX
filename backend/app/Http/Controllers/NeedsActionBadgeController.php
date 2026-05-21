<?php

namespace App\Http\Controllers;

use App\Models\DocumentEndorsement;
use App\Models\DocumentTransfer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NeedsActionBadgeController extends Controller
{
    /**
     * Returns document IDs that should show the "Needs Action" badge for the given office.
     * A document shows the badge when:
     * - Status is Needs Action
     * - Current office is in the document's route
     * - All offices in the route that cannot take action have endorsed
     *
     * Badge is shown to all route offices (action, endorsement, pass-through) so the document
     * always has a visible badge until it reaches the action office—including when the
     * endorsement office is in the middle of the route.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $tagId = $request->query('tag_id');
        $docIdsParam = $request->query('document_ids');

        if (!$tagId || !ctype_digit((string) $tagId)) {
            return response()->json(['document_ids' => []], 200);
        }
        $tagId = (int) $tagId;

        $docIds = [];
        if (is_string($docIdsParam)) {
            $docIds = array_map('intval', array_filter(explode(',', $docIdsParam)));
        } elseif (is_array($docIdsParam)) {
            $docIds = array_map('intval', array_filter($docIdsParam));
        }

        if (empty($docIds)) {
            return response()->json(['document_ids' => []], 200);
        }

        $releases = DocumentTransfer::whereIn('document_id', $docIds)
            ->where('type', 'release')
            ->whereNotNull('route_sequence')
            ->orderBy('document_id')
            ->orderByDesc('created_at')
            ->get();

        $endorsementsByDoc = DocumentEndorsement::whereIn('document_id', $docIds)
            ->get()
            ->groupBy('document_id');

        $documentIdToRelease = [];
        foreach ($releases as $r) {
            if (!isset($documentIdToRelease[$r->document_id])) {
                $documentIdToRelease[$r->document_id] = $r;
            }
        }

        $showBadge = [];
        foreach ($docIds as $docId) {
            $release = $documentIdToRelease[$docId] ?? null;
            if (!$release) {
                continue;
            }
            $canTake = $release->route_can_take_action;
            if (empty($canTake) && is_array($release->route_sequence) && !empty($release->route_sequence)) {
                $canTake = [(int) end($release->route_sequence)];
            }
            $canTake = array_map('intval', (array) $canTake);

            $routeOffices = array_map('intval', (array) ($release->route_sequence ?? []));
            $nonActionOffices = array_values(array_diff($routeOffices, $canTake));
            $needEndorsement = array_map('intval', (array) ($release->route_need_endorsement ?? []));
            $requiredOffices = !empty($needEndorsement) ? $needEndorsement : $nonActionOffices;
            $endorsedTagIds = ($endorsementsByDoc[$docId] ?? collect())->pluck('tag_id')->map('intval')->unique()->values()->all();

            if (!in_array($tagId, $routeOffices, true)) {
                continue;
            }

            if (!empty($requiredOffices)) {
                $allEndorsed = count(array_intersect($requiredOffices, $endorsedTagIds)) === count($requiredOffices);
                if (!$allEndorsed) {
                    continue;
                }
            }

            $showBadge[] = $docId;
        }

        return response()->json(['document_ids' => array_values($showBadge)], 200);
    }
}
