<?php

namespace App\Http\Controllers;

use App\Models\DocumentEndorsement;
use App\Models\DocumentTransfer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class DocumentEndorsementController extends Controller
{
    private const COPY_STATE_FIELD_NAME = 'Document Copy State';
    private const COPY_STATE_DIGITAL_PENDING = 'Digital (physical pending)';
    /**
     * Endorse a document. Called when an office (that cannot take action) endorses it.
     */
    public function store(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }
        if ($user->allow_endorse === false) {
            return response()->json(['message' => 'Endorsement is not enabled for your office'], 403);
        }
        if ($this->isDigitalPending($id)) {
            return response()->json(['message' => 'Please wait for the physical document before endorsing.'], 422);
        }

        $release = DocumentTransfer::where('document_id', $id)
            ->where('type', 'release')
            ->whereNotNull('route_sequence')
            ->orderByDesc('created_at')
            ->first();

        $hasFixedRoute = $release && is_array($release->route_sequence) && !empty($release->route_sequence);

        if ($hasFixedRoute) {
            $canTake = $release->route_can_take_action ?? [];
            if (empty($canTake) && !empty($release->route_sequence)) {
                $canTake = [(int) end($release->route_sequence)];
            }
            $canTake = array_map('intval', (array) $canTake);

            if (in_array((int) $tagId, $canTake, true)) {
                return response()->json(['message' => 'Your office can take action; use Take Action instead of Endorse'], 422);
            }

            $routeOffices = array_map('intval', $release->route_sequence);
            if (!in_array((int) $tagId, $routeOffices, true)) {
                return response()->json(['message' => 'Your office is not in this document\'s route'], 422);
            }
        }

        $existing = DocumentEndorsement::where('document_id', $id)->where('tag_id', $tagId)->first();
        if ($existing) {
            return response()->json(['message' => 'Already endorsed', 'endorsement' => [
                'id' => $existing->id,
                'tag_id' => $existing->tag_id,
                'created_at' => $existing->created_at->toIso8601String(),
            ]], 200);
        }

        $remarks = $request->input('remarks');
        if (!is_string($remarks) || trim($remarks) === '') {
            return response()->json(['message' => 'Remarks are required for endorsement'], 422);
        }

        $endorsement = DocumentEndorsement::create([
            'document_id' => $id,
            'tag_id' => $tagId,
            'user_id' => $user->id,
            'remarks' => trim($remarks),
        ]);

        if ($hasFixedRoute) {
            $routeOffices = array_map('intval', $release->route_sequence);
            $canTake = $release->route_can_take_action ?? [];
            if (empty($canTake) && !empty($release->route_sequence)) {
                $canTake = [(int) end($release->route_sequence)];
            }
            $canTake = array_map('intval', (array) $canTake);
            $nonActionOffices = array_values(array_diff($routeOffices, $canTake));
            $needEndorsement = array_map('intval', (array) ($release->route_need_endorsement ?? []));
            $requiredOffices = !empty($needEndorsement) ? $needEndorsement : $nonActionOffices;
            $endorsedCount = DocumentEndorsement::where('document_id', $id)
                ->whereIn('tag_id', $requiredOffices)
                ->count();
            if (!empty($requiredOffices) && $endorsedCount >= count($requiredOffices)) {
                $this->setDocumentStatusToNeedsAction($id);
            }
        }

        return response()->json([
            'message' => 'Document endorsed',
            'endorsement' => [
                'id' => $endorsement->id,
                'tag_id' => $endorsement->tag_id,
                'created_at' => $endorsement->created_at->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * Update endorsement remarks. Only the office that created the endorsement can edit.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $tagId = $user->tag_id;
        if ($tagId === null) {
            return response()->json(['message' => 'Office not configured'], 403);
        }
        if ($user->allow_endorse === false) {
            return response()->json(['message' => 'Endorsement is not enabled for your office'], 403);
        }

        $endorsement = DocumentEndorsement::find($id);
        if (!$endorsement) {
            return response()->json(['message' => 'Endorsement not found'], 404);
        }
        if ((int) $endorsement->tag_id !== (int) $tagId) {
            return response()->json(['message' => 'You can only edit your own office\'s endorsement remarks'], 403);
        }
        if ($this->isDigitalPending((int) $endorsement->document_id)) {
            return response()->json(['message' => 'Please wait for the physical document before endorsing.'], 422);
        }

        $remarks = $request->input('remarks');
        if (!is_string($remarks) || trim($remarks) === '') {
            return response()->json(['message' => 'Remarks are required'], 422);
        }

        $endorsement->remarks = trim($remarks);
        $endorsement->save();

        return response()->json([
            'message' => 'Endorsement updated',
            'endorsement' => [
                'id' => $endorsement->id,
                'tag_id' => $endorsement->tag_id,
                'remarks' => $endorsement->remarks,
                'created_at' => $endorsement->created_at->toIso8601String(),
            ],
        ], 200);
    }

    private function setDocumentStatusToNeedsAction(int $documentId): void
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');
        if (!$token) {
            return;
        }
        $headers = ['Authorization' => 'Token ' . $token];
        $statusFieldId = $this->getStatusFieldId($baseUrl, $headers);
        if (!$statusFieldId) {
            return;
        }
        $docUrl = "{$baseUrl}/api/documents/{$documentId}/";
        $docResponse = Http::withHeaders($headers)->timeout(15)->get($docUrl);
        if (!$docResponse->successful()) {
            return;
        }
        $doc = $docResponse->json();
        $customFields = $doc['custom_fields'] ?? [];
        $updatedFields = [];
        $found = false;
        foreach ($customFields as $cf) {
            $fieldId = $cf['field'] ?? $cf;
            if ((int) $fieldId === (int) $statusFieldId) {
                $updatedFields[] = ['field' => (int) $statusFieldId, 'value' => 'Needs Action'];
                $found = true;
            } else {
                $updatedFields[] = is_array($cf) ? $cf : ['field' => $fieldId, 'value' => $cf['value'] ?? ''];
            }
        }
        if (!$found) {
            $updatedFields[] = ['field' => (int) $statusFieldId, 'value' => 'Needs Action'];
        }
        $patchResponse = Http::withHeaders($headers)->timeout(15)->patch($docUrl, ['custom_fields' => $updatedFields]);
        if (!$patchResponse->successful()) {
            Log::warning('Failed to set document status to Needs Action in Paperless', [
                'document_id' => $documentId,
                'status' => $patchResponse->status(),
                'body' => $patchResponse->body(),
            ]);
        }
    }

    private function getStatusFieldId(string $baseUrl, array $headers): ?int
    {
        $url = "{$baseUrl}/api/custom_fields/";
        $response = Http::withHeaders($headers)->timeout(10)->get($url);
        if (!$response->successful()) {
            return null;
        }
        $data = $response->json();
        $results = $data['results'] ?? (is_array($data) ? $data : []);
        foreach ($results as $f) {
            if (strcasecmp($f['name'] ?? '', 'Document Status') === 0) {
                return (int) ($f['id'] ?? $f['pk'] ?? 0) ?: null;
            }
        }
        return null;
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
            Log::warning('Unable to verify digital-pending state for endorsement', [
                'document_id' => $documentId,
                'error' => $e->getMessage(),
            ]);
        }
        return false;
    }
}
