<?php

namespace App\Http\Controllers;

use App\Models\DocumentComment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class DocumentCommentController extends Controller
{
    private const COPY_STATE_FIELD_NAME = 'Document Copy State';
    private const COPY_STATE_DIGITAL_PENDING = 'Digital (physical pending)';
    /**
     * Store a note on a document (full audit: user_id, created_at).
     */
    public function store(Request $request, int $documentId): JsonResponse
    {
        $request->validate([
            'note' => ['required', 'string', 'max:5000'],
        ]);

        $user = $request->user();
        if ($this->isDigitalPending($documentId)) {
            return response()->json(['message' => 'Please wait for the physical document before adding notes.'], 422);
        }

        $comment = DocumentComment::create([
            'document_id' => $documentId,
            'user_id' => $user->id,
            'comment' => trim($request->input('note')),
        ]);

        $comment->load('user:id,name');

        return response()->json([
            'id' => $comment->id,
            'document_id' => $comment->document_id,
            'user_id' => $comment->user_id,
            'user_name' => $comment->user?->name ?? null,
            'note' => $comment->comment,
            'created_at' => $comment->created_at->toIso8601String(),
        ], 201);
    }

    /**
     * Update an existing note.
     * Allowed for admin or users from the same office (tag_id) as the note author.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'note' => ['required', 'string', 'max:5000'],
        ]);

        $authUser = $request->user();
        $comment = DocumentComment::with('user:id,name,tag_id')->find($id);

        if (! $comment) {
            return response()->json(['message' => 'Note not found'], 404);
        }

        $sameOffice = $authUser->tag_id !== null
            && $comment->user?->tag_id !== null
            && (int) $authUser->tag_id === (int) $comment->user->tag_id;

        if ($authUser->role !== 'admin' && ! $sameOffice) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($this->isDigitalPending((int) $comment->document_id)) {
            return response()->json(['message' => 'Please wait for the physical document before adding notes.'], 422);
        }

        $comment->comment = trim($request->input('note'));
        $comment->save();

        return response()->json([
            'id' => $comment->id,
            'document_id' => $comment->document_id,
            'user_id' => $comment->user_id,
            'user_name' => $comment->user?->name ?? null,
            'note' => $comment->comment,
            'created_at' => $comment->created_at->toIso8601String(),
            'updated_at' => $comment->updated_at?->toIso8601String(),
        ]);
    }

    private function isDigitalPending(int $documentId): bool
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');
        if (! $token || $documentId < 1) {
            return false;
        }
        try {
            $headers = ['Authorization' => 'Token ' . $token];
            $fieldsResp = Http::withHeaders($headers)->timeout(10)->get("{$baseUrl}/api/custom_fields/");
            if (! $fieldsResp->successful()) return false;
            $fieldsPayload = $fieldsResp->json();
            $fields = $fieldsPayload['results'] ?? (is_array($fieldsPayload) ? $fieldsPayload : []);
            $copyStateFieldId = null;
            foreach ($fields as $f) {
                if (strcasecmp((string) ($f['name'] ?? ''), self::COPY_STATE_FIELD_NAME) === 0) {
                    $copyStateFieldId = (int) ($f['id'] ?? $f['pk'] ?? 0) ?: null;
                    break;
                }
            }
            if ($copyStateFieldId === null) return false;
            $docResp = Http::withHeaders($headers)->timeout(15)->get("{$baseUrl}/api/documents/{$documentId}/");
            if (! $docResp->successful()) return false;
            $doc = $docResp->json();
            foreach (($doc['custom_fields'] ?? []) as $cf) {
                $fid = (int) ($cf['field'] ?? $cf ?? 0);
                if ($fid === $copyStateFieldId) {
                    $v = trim((string) ($cf['value'] ?? ''));
                    return strcasecmp($v, self::COPY_STATE_DIGITAL_PENDING) === 0;
                }
            }
        } catch (Throwable $e) {
            Log::warning('Unable to verify digital-pending state for note', [
                'document_id' => $documentId,
                'error' => $e->getMessage(),
            ]);
        }
        return false;
    }
}
