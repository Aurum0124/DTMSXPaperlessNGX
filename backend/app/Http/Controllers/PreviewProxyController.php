<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Http;

class PreviewProxyController extends Controller
{
    public function __invoke(int $id)
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (!$token) {
            abort(502, 'Paperless token not configured');
        }

        $url = "{$baseUrl}/api/documents/{$id}/preview/";

        $response = Http::withHeaders([
            'Authorization' => 'Token ' . $token,
        ])
            ->timeout(30)
            ->get($url);

        if (!$response->successful()) {
            abort($response->status(), 'Preview unavailable');
        }

        $contentType = $response->header('Content-Type') ?? 'application/pdf';

        return response($response->body(), 200, [
            'Content-Type' => $contentType,
            'Cache-Control' => 'public, max-age=300',
        ]);
    }
}
