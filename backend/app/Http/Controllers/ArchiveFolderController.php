<?php

namespace App\Http\Controllers;

use App\Models\ArchiveDrawer;
use App\Models\ArchiveFolder;
use App\Models\DocumentArchiveDrawer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ArchiveFolderController extends Controller
{
    public function store(Request $request, int $drawerId): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $drawer = ArchiveDrawer::where('id', $drawerId)->where('tag_id', $tagId)->first();
        if (! $drawer) {
            return response()->json(['message' => 'Drawer not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:128', 'regex:/\S/'],
            'folder_number' => [
                'required',
                'integer',
                'min:1',
                'max:9999',
                Rule::unique('archive_folders', 'folder_number')->where(fn ($q) => $q->where('drawer_id', $drawerId)),
            ],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $num = (int) $request->input('folder_number');
        $name = trim((string) $request->input('name'));
        $maxOrder = ArchiveFolder::where('drawer_id', $drawerId)->max('sort_order');

        $folder = ArchiveFolder::create([
            'drawer_id' => $drawerId,
            'folder_number' => $num,
            'name' => $name,
            'sort_order' => ($maxOrder === null ? 0 : (int) $maxOrder + 1),
        ]);

        return response()->json([
            'folder' => [
                'id' => $folder->id,
                'drawer_id' => $folder->drawer_id,
                'folder_number' => $folder->folder_number,
                'name' => $folder->name,
                'sort_order' => $folder->sort_order,
                'created_at' => $folder->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }

        $folder = ArchiveFolder::query()
            ->whereKey($id)
            ->whereHas('drawer', fn ($q) => $q->where('tag_id', $tagId))
            ->first();

        if (! $folder) {
            return response()->json(['message' => 'Folder not found'], 404);
        }

        if ($folder->placements()->exists()) {
            return response()->json(['message' => 'Cannot remove a folder that contains archived documents'], 422);
        }

        $folder->delete();

        return response()->json(['message' => 'Folder removed']);
    }
}
