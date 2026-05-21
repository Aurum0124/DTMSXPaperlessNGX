<?php

namespace App\Http\Controllers;

use App\Models\ArchiveCabinet;
use App\Models\ArchiveDrawer;
use App\Models\DocumentArchiveDrawer;
use App\Services\ArchiveStalePlacementCleanup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ArchiveCabinetController extends Controller
{
    /**
     * Cabinets for the current office with nested drawers (for sidebar + archive UI).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['cabinets' => []]);
        }

        $cabinets = ArchiveCabinet::where('tag_id', $tagId)
            ->with(['drawers' => fn ($q) => $q->with('folders')->orderBy('sort_order')->orderBy('id')])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'cabinets' => $cabinets->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'code' => $c->code,
                'sort_order' => $c->sort_order,
                'created_at' => $c->created_at?->toIso8601String(),
                'drawers' => $c->drawers->map(fn ($d) => [
                    'id' => $d->id,
                    'name' => $d->name,
                    'drawer_code' => $d->drawer_code,
                    'sort_order' => $d->sort_order,
                    'created_at' => $d->created_at?->toIso8601String(),
                    'folders' => $d->folders->map(fn ($f) => [
                        'id' => $f->id,
                        'folder_number' => $f->folder_number,
                        'name' => $f->name,
                        'sort_order' => $f->sort_order,
                    ]),
                ]),
            ]),
        ]);
    }

    /**
     * Cabinets for a specific office tag (used when another office pre-assigns archive target).
     */
    public function byTag(Request $request, int $tagId): JsonResponse
    {
        if ($tagId < 1) {
            return response()->json(['cabinets' => []]);
        }

        $cabinets = ArchiveCabinet::where('tag_id', $tagId)
            ->with(['drawers' => fn ($q) => $q->with('folders')->orderBy('sort_order')->orderBy('id')])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'cabinets' => $cabinets->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'code' => $c->code,
                'sort_order' => $c->sort_order,
                'created_at' => $c->created_at?->toIso8601String(),
                'drawers' => $c->drawers->map(fn ($d) => [
                    'id' => $d->id,
                    'name' => $d->name,
                    'drawer_code' => $d->drawer_code,
                    'sort_order' => $d->sort_order,
                    'created_at' => $d->created_at?->toIso8601String(),
                    'folders' => $d->folders->map(fn ($f) => [
                        'id' => $f->id,
                        'folder_number' => $f->folder_number,
                        'name' => $f->name,
                        'sort_order' => $f->sort_order,
                    ]),
                ]),
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

        $codeInput = $request->input('code');
        if (is_string($codeInput) && trim($codeInput) !== '') {
            $codeValidator = Validator::make(
                ['code' => trim($codeInput)],
                [
                    'code' => [
                        'required',
                        'string',
                        'max:16',
                        'regex:/^[A-Za-z0-9]+$/',
                        Rule::unique('archive_cabinets', 'code')->where(fn ($q) => $q->where('tag_id', $tagId)),
                    ],
                ]
            );
            if ($codeValidator->fails()) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => $codeValidator->errors(),
                ], 422);
            }
            $code = trim($codeInput);
        } else {
            $code = self::nextCabinetCodeForTag($tagId);
        }

        $name = 'C'.$code;

        $maxOrder = ArchiveCabinet::where('tag_id', $tagId)->max('sort_order');

        $cabinet = ArchiveCabinet::create([
            'tag_id' => $tagId,
            'name' => $name,
            'code' => $code,
            'sort_order' => ($maxOrder === null ? 0 : (int) $maxOrder + 1),
        ]);

        return response()->json([
            'cabinet' => [
                'id' => $cabinet->id,
                'name' => $cabinet->name,
                'code' => $cabinet->code,
                'sort_order' => $cabinet->sort_order,
                'drawers' => [],
                'created_at' => $cabinet->created_at->toIso8601String(),
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

        $cabinet = ArchiveCabinet::where('id', $id)->where('tag_id', $tagId)->first();
        if (! $cabinet) {
            return response()->json(['message' => 'Cabinet not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:128',
            'code' => [
                'required',
                'string',
                'max:16',
                'regex:/^[A-Za-z0-9]+$/',
                Rule::unique('archive_cabinets', 'code')
                    ->where(fn ($q) => $q->where('tag_id', $tagId))
                    ->ignore($cabinet->id),
            ],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $cabinet->name = trim($request->input('name'));
        $cabinet->code = trim($request->input('code'));
        $cabinet->save();

        return response()->json([
            'cabinet' => [
                'id' => $cabinet->id,
                'name' => $cabinet->name,
                'code' => $cabinet->code,
                'sort_order' => $cabinet->sort_order,
                'created_at' => $cabinet->created_at->toIso8601String(),
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

        $cabinet = ArchiveCabinet::where('id', $id)->where('tag_id', $tagId)->first();
        if (! $cabinet) {
            return response()->json(['message' => 'Cabinet not found'], 404);
        }

        $drawerIds = ArchiveDrawer::where('cabinet_id', $cabinet->id)->pluck('id');
        if ($drawerIds->isNotEmpty()) {
            ArchiveStalePlacementCleanup::forDrawerIds($drawerIds->all());
            $hasPlacements = DocumentArchiveDrawer::whereIn('drawer_id', $drawerIds)->exists();
            if ($hasPlacements) {
                return response()->json(['message' => 'Cannot remove a cabinet that has drawers with archived documents'], 422);
            }
            ArchiveDrawer::where('cabinet_id', $cabinet->id)->delete();
        }

        $cabinet->delete();

        return response()->json(['message' => 'Cabinet removed']);
    }

    /**
     * Next numeric cabinet code for this office (displayed as C1, C2, … in the UI).
     */
    private static function nextCabinetCodeForTag(int $tagId): string
    {
        $max = 0;
        foreach (ArchiveCabinet::where('tag_id', $tagId)->pluck('code') as $c) {
            $c = (string) $c;
            if (ctype_digit($c)) {
                $max = max($max, (int) $c);
            }
        }

        return (string) ($max + 1);
    }
}
