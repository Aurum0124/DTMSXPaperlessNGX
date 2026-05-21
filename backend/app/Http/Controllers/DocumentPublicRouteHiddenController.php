<?php

namespace App\Http\Controllers;

use App\Models\DocumentPublicRouteHidden;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class DocumentPublicRouteHiddenController extends Controller
{
    /** Paperless custom field label(s); create as Select with option "Untracked" (and e.g. "Standard"). */
    private const PUBLIC_TRACKING_FIELD_NAMES = ['Public tracking', 'Public Tracking'];

    private const PUBLIC_TRACKING_VALUE_UNTRACKED = 'Untracked';

    /**
     * Which document IDs are opted out of the public tracker (Laravel).
     */
    public function index(Request $request): JsonResponse
    {
        $idsRaw = (string) $request->query('document_ids', '');
        $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', $idsRaw)))));
        $ids = array_slice($ids, 0, 500);
        if ($ids === []) {
            return response()->json(['hidden_document_ids' => []]);
        }

        $hidden = DocumentPublicRouteHidden::query()
            ->whereIn('document_id', $ids)
            ->pluck('document_id')
            ->values()
            ->all();

        return response()->json(['hidden_document_ids' => $hidden]);
    }

    /**
     * Opt document out of the unauthenticated public tracker; sync Paperless "Public tracking" when the field exists.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'document_id' => 'required|integer|min:1',
        ]);

        $documentId = (int) $request->document_id;

        DocumentPublicRouteHidden::query()->firstOrCreate([
            'document_id' => $documentId,
        ]);

        $this->syncPaperlessPublicTrackingField($documentId);

        return response()->json(['ok' => true]);
    }

    private function syncPaperlessPublicTrackingField(int $documentId): void
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');
        if (! $token) {
            return;
        }

        $headers = ['Authorization' => 'Token '.$token];
        $definitions = $this->fetchPaperlessCustomFieldDefinitions($baseUrl, $headers);
        $fieldId = $this->findFieldIdByNames($definitions, self::PUBLIC_TRACKING_FIELD_NAMES);
        if ($fieldId === null) {
            return;
        }

        $docUrl = "{$baseUrl}/api/documents/{$documentId}/";
        $docResponse = Http::withHeaders($headers)->timeout(15)->get($docUrl);
        if (! $docResponse->successful()) {
            return;
        }

        $doc = $docResponse->json();
        $customFields = $doc['custom_fields'] ?? [];
        $updatedFields = [];
        $found = false;

        foreach ($customFields as $cf) {
            $fid = $cf['field'] ?? $cf;
            if ((int) $fid === (int) $fieldId) {
                $updatedFields[] = ['field' => (int) $fieldId, 'value' => self::PUBLIC_TRACKING_VALUE_UNTRACKED];
                $found = true;
            } else {
                $updatedFields[] = is_array($cf) ? $cf : ['field' => $fid, 'value' => $cf['value'] ?? ''];
            }
        }

        if (! $found) {
            $updatedFields[] = ['field' => (int) $fieldId, 'value' => self::PUBLIC_TRACKING_VALUE_UNTRACKED];
        }

        Http::withHeaders($headers)
            ->timeout(15)
            ->patch($docUrl, ['custom_fields' => $updatedFields]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetchPaperlessCustomFieldDefinitions(string $baseUrl, array $headers): array
    {
        $url = "{$baseUrl}/api/custom_fields/";
        $response = Http::withHeaders($headers)->timeout(10)->get($url);
        if (! $response->successful()) {
            return [];
        }

        $data = $response->json();
        $results = $data['results'] ?? (is_array($data) ? $data : []);

        return is_array($results) ? $results : [];
    }

    /**
     * @param  list<array<string, mixed>>  $definitions
     * @param  list<string>  $names
     */
    private function findFieldIdByNames(array $definitions, array $names): ?int
    {
        foreach ($definitions as $f) {
            $fieldName = $f['name'] ?? '';
            foreach ($names as $candidate) {
                if (strcasecmp($fieldName, $candidate) === 0) {
                    return (int) ($f['id'] ?? $f['pk'] ?? 0) ?: null;
                }
            }
        }

        return null;
    }
}
