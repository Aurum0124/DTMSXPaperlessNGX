<?php

namespace App\Services;

use App\Models\DocumentArchiveDrawer;
use Illuminate\Support\Facades\Http;

/**
 * Removes document_archive_drawers rows when the Paperless document no longer exists (404).
 * Deleting a document in Paperless does not cascade to DTS; this keeps cabinet/drawer delete accurate.
 */
class ArchiveStalePlacementCleanup
{
    /**
     * @param  array<int>  $drawerIds
     * @return int Number of placement rows deleted
     */
    public static function forDrawerIds(array $drawerIds): int
    {
        $drawerIds = array_values(array_unique(array_filter(array_map('intval', $drawerIds))));
        if ($drawerIds === []) {
            return 0;
        }

        $token = config('services.paperless.token');
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        if (! $token) {
            return 0;
        }

        $headers = ['Authorization' => 'Token '.$token];
        $placements = DocumentArchiveDrawer::query()
            ->whereIn('drawer_id', $drawerIds)
            ->get();

        $deleted = 0;
        foreach ($placements as $p) {
            $docId = (int) $p->document_id;
            if ($docId < 1) {
                $p->delete();
                $deleted++;

                continue;
            }
            $url = "{$baseUrl}/api/documents/{$docId}/";
            $response = Http::withHeaders($headers)->timeout(12)->get($url);
            if ($response->status() === 404) {
                $p->delete();
                $deleted++;
            }
        }

        return $deleted;
    }
}
