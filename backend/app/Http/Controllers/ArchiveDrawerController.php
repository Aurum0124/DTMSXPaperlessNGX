<?php

namespace App\Http\Controllers;

use App\Models\ArchiveCabinet;
use App\Models\ArchiveDrawer;
use App\Models\DocumentArchiveDrawer;
use App\Services\ArchiveStalePlacementCleanup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ArchiveDrawerController extends Controller
{
    /**
     * Return document IDs with archive placements in the current user's office.
     */
    public function placedDocumentIds(Request $request): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['document_ids' => []]);
        }

        // One row per document (unique document_id); load all IDs for this office — no row cap.
        $ids = DocumentArchiveDrawer::query()
            ->whereHas('drawer', fn ($q) => $q->where('tag_id', $tagId))
            ->pluck('document_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        return response()->json(['document_ids' => $ids]);
    }

    /**
     * Drawer assignment for a document at the current user's office (if any).
     */
    public function placements(Request $request): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['placements' => (object) []]);
        }

        $idsRaw = (string) $request->query('document_ids', '');
        $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', $idsRaw)))));
        if ($ids === []) {
            return response()->json(['placements' => (object) []]);
        }
        $ids = array_slice($ids, 0, 500);

        $rows = DocumentArchiveDrawer::query()
            ->whereIn('document_id', $ids)
            ->whereHas('drawer', fn ($q) => $q->where('tag_id', $tagId))
            ->with(['drawer:id,name,drawer_code,cabinet_id', 'drawer.cabinet:id,code,name', 'folder:id,folder_number,drawer_id,name'])
            ->get();

        $map = [];
        foreach ($rows as $row) {
            if ($row->drawer) {
                $map[(string) $row->document_id] = [
                    'drawer_id' => $row->drawer_id,
                    'drawer_name' => $row->drawer->labelForDisplay(),
                    'archive_reference' => $row->archive_reference,
                    'cabinet_code' => $row->drawer->cabinet?->code,
                    'drawer_code' => $row->drawer->drawer_code,
                    'folder_id' => $row->folder_id,
                    'folder_number' => $row->folder?->folder_number,
                    'folder_name' => $row->folder?->name,
                    'archived_at' => $row->created_at?->toIso8601String(),
                ];
            }
        }

        return response()->json(['placements' => (object) $map]);
    }

    public function forDocument(Request $request, int $documentId): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['drawer' => null]);
        }

        $placement = DocumentArchiveDrawer::query()
            ->where('document_id', $documentId)
            ->whereHas('drawer', fn ($q) => $q->where('tag_id', $tagId))
            ->with(['drawer:id,name,drawer_code,cabinet_id', 'drawer.cabinet:id,code,name', 'folder:id,folder_number,drawer_id,name'])
            ->first();

        if (! $placement || ! $placement->drawer) {
            return response()->json(['drawer' => null]);
        }

        $drawerPayload = [
            'id' => $placement->drawer->id,
            'name' => $placement->drawer->labelForDisplay(),
            'drawer_code' => $placement->drawer->drawer_code,
            'cabinet_code' => $placement->drawer->cabinet?->code,
            'folder_id' => $placement->folder_id,
            'folder_number' => $placement->folder?->folder_number,
            'folder_name' => $placement->folder?->name,
        ];

        return response()->json([
            'drawer' => $drawerPayload,
            'archive_reference' => $placement->archive_reference,
            'archived_at' => $placement->created_at?->toIso8601String(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['drawers' => []]);
        }

        $drawers = ArchiveDrawer::where('tag_id', $tagId)
            ->with('cabinet:id,name,code')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'drawers' => $drawers->map(fn ($d) => [
                'id' => $d->id,
                'name' => $d->name,
                'cabinet_id' => $d->cabinet_id,
                'cabinet_name' => $d->cabinet?->name,
                'cabinet_code' => $d->cabinet?->code,
                'drawer_code' => $d->drawer_code,
                'sort_order' => $d->sort_order,
                'created_at' => $d->created_at?->toIso8601String(),
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $cabinetId = (int) $request->input('cabinet_id');
        $cabinet = ArchiveCabinet::where('id', $cabinetId)->where('tag_id', $tagId)->first();
        if (! $cabinet) {
            return response()->json(['message' => 'Invalid cabinet for your office'], 422);
        }

        if ($request->has('drawer_count')) {
            $bulkValidator = Validator::make($request->all(), [
                'cabinet_id' => 'required|integer',
                'drawer_count' => 'required|integer|min:1|max:50',
            ]);
            if ($bulkValidator->fails()) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => $bulkValidator->errors(),
                ], 422);
            }

            $count = (int) $request->input('drawer_count');

            $maxNumericCode = 0;
            foreach (ArchiveDrawer::where('cabinet_id', $cabinetId)->pluck('drawer_code') as $dc) {
                $dc = (string) $dc;
                if (ctype_digit($dc)) {
                    $maxNumericCode = max($maxNumericCode, (int) $dc);
                }
            }

            $drawersPayload = [];

            DB::transaction(function () use ($tagId, $cabinetId, $count, $maxNumericCode, &$drawersPayload) {
                $sortOrder = ArchiveDrawer::where('cabinet_id', $cabinetId)->max('sort_order');
                $sortOrder = $sortOrder === null ? -1 : (int) $sortOrder;

                for ($i = 1; $i <= $count; $i++) {
                    $sortOrder++;
                    $num = $maxNumericCode + $i;
                    $drawerCode = (string) $num;
                    while (ArchiveDrawer::where('cabinet_id', $cabinetId)->where('drawer_code', $drawerCode)->exists()) {
                        $num++;
                        $drawerCode = (string) $num;
                    }

                    $drawer = ArchiveDrawer::create([
                        'tag_id' => $tagId,
                        'cabinet_id' => $cabinetId,
                        'name' => 'Drawer '.$drawerCode,
                        'drawer_code' => $drawerCode,
                        'sort_order' => $sortOrder,
                    ]);

                    $drawersPayload[] = [
                        'id' => $drawer->id,
                        'name' => $drawer->name,
                        'cabinet_id' => $drawer->cabinet_id,
                        'drawer_code' => $drawer->drawer_code,
                        'sort_order' => $drawer->sort_order,
                        'created_at' => $drawer->created_at->toIso8601String(),
                    ];
                }
            });

            return response()->json(['drawers' => $drawersPayload], 201);
        }

        $validator = Validator::make($request->all(), [
            'cabinet_id' => 'required|integer',
            'name' => 'required|string|max:128',
            'drawer_code' => [
                'required',
                'string',
                'max:16',
                'regex:/^[A-Za-z0-9]+$/',
                Rule::unique('archive_drawers', 'drawer_code')->where(fn ($q) => $q->where('cabinet_id', $cabinetId)),
            ],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $maxOrder = ArchiveDrawer::where('cabinet_id', $cabinetId)->max('sort_order');

        $drawer = ArchiveDrawer::create([
            'tag_id' => $tagId,
            'cabinet_id' => $cabinetId,
            'name' => trim($request->input('name')),
            'drawer_code' => trim($request->input('drawer_code')),
            'sort_order' => ($maxOrder === null ? 0 : (int) $maxOrder + 1),
        ]);

        return response()->json([
            'drawer' => [
                'id' => $drawer->id,
                'name' => $drawer->name,
                'cabinet_id' => $drawer->cabinet_id,
                'drawer_code' => $drawer->drawer_code,
                'sort_order' => $drawer->sort_order,
                'created_at' => $drawer->created_at->toIso8601String(),
            ],
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $drawer = ArchiveDrawer::where('id', $id)->where('tag_id', $tagId)->first();
        if (! $drawer) {
            return response()->json(['message' => 'Drawer not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:128',
            'drawer_code' => [
                'required',
                'string',
                'max:16',
                'regex:/^[A-Za-z0-9]+$/',
                Rule::unique('archive_drawers', 'drawer_code')
                    ->where(fn ($q) => $q->where('cabinet_id', $drawer->cabinet_id))
                    ->ignore($drawer->id),
            ],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $drawer->name = trim($request->input('name'));
        $drawer->drawer_code = trim($request->input('drawer_code'));
        $drawer->save();

        return response()->json([
            'drawer' => [
                'id' => $drawer->id,
                'name' => $drawer->name,
                'cabinet_id' => $drawer->cabinet_id,
                'drawer_code' => $drawer->drawer_code,
                'sort_order' => $drawer->sort_order,
                'created_at' => $drawer->created_at->toIso8601String(),
            ],
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $drawer = ArchiveDrawer::where('id', $id)->where('tag_id', $tagId)->first();
        if (! $drawer) {
            return response()->json(['message' => 'Drawer not found'], 404);
        }

        ArchiveStalePlacementCleanup::forDrawerIds([(int) $drawer->id]);

        if ($drawer->placements()->exists()) {
            return response()->json(['message' => 'Cannot remove a drawer that has archived documents'], 422);
        }

        $drawer->delete();

        return response()->json(['message' => 'Drawer removed']);
    }
}
