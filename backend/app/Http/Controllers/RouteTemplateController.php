<?php

namespace App\Http\Controllers;

use App\Models\ReleaseRouteTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class RouteTemplateController extends Controller
{
    /**
     * List route templates for the current user's office.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['templates' => []]);
        }

        $templates = ReleaseRouteTemplate::where('tag_id', $tagId)
            ->orderBy('name')
            ->get(['id', 'name', 'route_sequence', 'route_can_take_action', 'route_need_endorsement', 'created_at']);

        return response()->json([
            'templates' => $templates->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'route_sequence' => $t->route_sequence ?? [],
                'route_can_take_action' => $t->route_can_take_action ?? [],
                'route_need_endorsement' => $t->route_need_endorsement ?? [],
                'created_at' => $t->created_at?->toIso8601String(),
            ]),
        ]);
    }

    /**
     * Store a new route template.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->fixed_routing_enabled) {
            return response()->json(['message' => 'Office does not have fixed routing enabled'], 403);
        }
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:128',
            'route_sequence' => 'required|array',
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

        $seq = array_values(array_map('intval', $request->input('route_sequence')));
        $canTake = $request->route_can_take_action;
        $canTakeAction = (is_array($canTake) && !empty($canTake))
            ? array_values(array_map('intval', $canTake))
            : (!empty($seq) ? [(int) end($seq)] : null);
        $needEndorsement = $request->route_need_endorsement;
        $needEndorsementIds = (is_array($needEndorsement) && !empty($needEndorsement))
            ? array_values(array_map('intval', $needEndorsement))
            : null;

        $template = ReleaseRouteTemplate::create([
            'tag_id' => $tagId,
            'name' => $request->input('name'),
            'route_sequence' => $seq,
            'route_can_take_action' => $canTakeAction,
            'route_need_endorsement' => $needEndorsementIds,
        ]);

        return response()->json([
            'template' => [
                'id' => $template->id,
                'name' => $template->name,
                'route_sequence' => $template->route_sequence,
                'route_can_take_action' => $template->route_can_take_action,
                'route_need_endorsement' => $template->route_need_endorsement,
                'created_at' => $template->created_at->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * Update a route template.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (! $user->fixed_routing_enabled) {
            return response()->json(['message' => 'Office does not have fixed routing enabled'], 403);
        }
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $template = ReleaseRouteTemplate::where('id', $id)->where('tag_id', $tagId)->first();
        if (! $template) {
            return response()->json(['message' => 'Template not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:128',
            'route_sequence' => 'required|array',
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

        $seq = array_values(array_map('intval', $request->input('route_sequence')));
        $canTake = $request->route_can_take_action;
        $canTakeAction = (is_array($canTake) && !empty($canTake))
            ? array_values(array_map('intval', $canTake))
            : (!empty($seq) ? [(int) end($seq)] : null);
        $needEndorsement = $request->route_need_endorsement;
        $needEndorsementIds = (is_array($needEndorsement) && !empty($needEndorsement))
            ? array_values(array_map('intval', $needEndorsement))
            : null;

        $template->name = $request->input('name');
        $template->route_sequence = $seq;
        $template->route_can_take_action = $canTakeAction;
        $template->route_need_endorsement = $needEndorsementIds;
        $template->save();

        return response()->json([
            'template' => [
                'id' => $template->id,
                'name' => $template->name,
                'route_sequence' => $template->route_sequence,
                'route_can_take_action' => $template->route_can_take_action,
                'route_need_endorsement' => $template->route_need_endorsement,
                'created_at' => $template->created_at->toIso8601String(),
            ],
        ], 200);
    }

    /**
     * Delete a route template.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $template = ReleaseRouteTemplate::where('id', $id)->where('tag_id', $tagId)->first();
        if (! $template) {
            return response()->json(['message' => 'Template not found'], 404);
        }

        $template->delete();
        return response()->json(['message' => 'Template deleted']);
    }
}
