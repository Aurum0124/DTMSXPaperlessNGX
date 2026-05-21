<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class PaperlessTagsCache
{
    private const CACHE_KEY = 'paperless_tags_map';

    private const TTL_SECONDS = 300; // 5 minutes

    /**
     * Get tag ID => name map from Paperless. Cached for 5 minutes.
     *
     * @return array<int, string>
     */
    public static function getTagMap(): array
    {
        return Cache::remember(self::CACHE_KEY, self::TTL_SECONDS, function () {
            $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
            $token = config('services.paperless.token');

            if (! $token) {
                return [];
            }

            $tagsUrl = "{$baseUrl}/api/tags/";
            $response = Http::withHeaders(['Authorization' => 'Token ' . $token])
                ->timeout(10)
                ->get($tagsUrl);

            if (! $response->successful()) {
                return [];
            }

            $tagsData = $response->json();
            $tags = $tagsData['results'] ?? ($tagsData ?: []);
            $tags = is_array($tags) ? $tags : [];

            $tagMap = [];
            foreach ($tags as $t) {
                $id = $t['id'] ?? $t['pk'] ?? null;
                if ($id !== null) {
                    $tagMap[(int) $id] = $t['name'] ?? '';
                }
            }

            return $tagMap;
        });
    }

    /**
     * Clear the tags cache (e.g. when tags are modified).
     */
    public static function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * Resolve Paperless tag ID by exact office name (case-insensitive).
     */
    public static function resolveTagIdByOfficeName(string $officeName): ?int
    {
        $needle = trim($officeName);
        if ($needle === '') {
            return null;
        }
        foreach (self::getTagMap() as $id => $name) {
            if (strcasecmp(trim((string) $name), $needle) === 0) {
                return (int) $id;
            }
        }

        return null;
    }

    /**
     * Prefer Paperless tag ID matched by office name; fall back to stored user tag_id.
     */
    public static function effectiveTagIdForUser(?\App\Models\User $user): ?int
    {
        if ($user === null || $user->tag_id === null) {
            return null;
        }
        $byName = $user->name ? self::resolveTagIdByOfficeName($user->name) : null;

        return $byName ?? (int) $user->tag_id;
    }
}
