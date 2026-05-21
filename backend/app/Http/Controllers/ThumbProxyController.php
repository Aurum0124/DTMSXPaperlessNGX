<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class ThumbProxyController extends Controller
{
    public function __invoke(int $id)
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (!$token) {
            abort(502, 'Paperless token not configured');
        }

        $url = "{$baseUrl}/api/documents/{$id}/thumb/";

        $response = Http::withHeaders([
            'Authorization' => 'Token ' . $token,
        ])
            ->timeout(15)
            ->get($url);

        if (!$response->successful()) {
            abort($response->status(), 'Thumbnail unavailable');
        }

        return response($response->body(), 200, [
            'Content-Type' => $response->header('Content-Type') ?? 'image/png',
            'Cache-Control' => 'public, max-age=86400, stale-while-revalidate=3600',
        ]);
    }
}
