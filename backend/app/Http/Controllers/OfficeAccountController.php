<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OfficeAccountController extends Controller
{
    /**
     * Create office account (Laravel user linked to Paperless tag).
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:128',
            'username' => 'required|string|max:64|regex:/^[a-zA-Z0-9_-]+$/',
            'password' => 'required|string|min:4',
            'tag_id' => 'required|integer',
        ]);

        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $username = $this->ensureUniqueUsername(Str::lower(trim($request->username)));

        $user = User::create([
            'name' => $request->name,
            'email' => $username . '@office.local',
            'username' => $username,
            'password' => $request->password,
            'role' => 'department',
            'tag_id' => $request->tag_id,
            'tracking_code_prefix' => $request->input('tracking_code_prefix', 'TRK'),
            'can_approve_reject' => $request->boolean('can_approve_reject', false),
            'fixed_routing_enabled' => $request->boolean('fixed_routing_enabled', false),
            'allow_endorse' => $request->boolean('allow_endorse', true),
            'can_upload_documents' => $request->boolean('can_upload_documents', true),
        ]);

        return response()->json([
            'id' => $user->id,
            'username' => $user->username,
        ]);
    }

    /**
     * Delete office account by office name.
     */
    public function destroy(Request $request, string $name): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $officeUser = User::where('name', urldecode($name))->where('role', 'department')->first();
        if ($officeUser) {
            $tagId = $officeUser->tag_id;
            $officeUser->tokens()->delete();
            $officeUser->delete();

            // Nullify employees assigned to this office so they are not orphaned
            if ($tagId !== null) {
                Employee::where('tag_id', $tagId)->update(['tag_id' => null]);
            }
        }
        // Idempotent: no user found = already deleted or legacy tag without account

        return response()->json(['message' => 'Office account deleted']);
    }

    /**
     * Get office details by name (for admin).
     */
    public function show(Request $request, string $name): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $officeUser = User::where('name', urldecode($name))->where('role', 'department')->first();
        if (!$officeUser) {
            return response()->json(['message' => 'Office not found'], 404);
        }
        return response()->json([
            'name' => $officeUser->name,
            'username' => $officeUser->username,
            'tracking_code_prefix' => $officeUser->tracking_code_prefix ?? 'TRK',
            'can_approve_reject' => (bool) $officeUser->can_approve_reject,
            'fixed_routing_enabled' => (bool) $officeUser->fixed_routing_enabled,
            'allow_endorse' => (bool) ($officeUser->allow_endorse ?? true),
            'can_upload_documents' => (bool) ($officeUser->can_upload_documents ?? true),
        ]);
    }

    /**
     * Update office (e.g. tracking code prefix).
     */
    public function update(Request $request, string $name): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $officeUser = User::where('name', urldecode($name))->where('role', 'department')->first();
        if (!$officeUser) {
            return response()->json(['message' => 'Office not found'], 404);
        }
        if ($request->has('tracking_code_prefix')) {
            $prefix = trim((string) $request->tracking_code_prefix);
            $officeUser->tracking_code_prefix = $prefix ?: 'TRK';
        }
        if ($request->has('can_approve_reject')) {
            $officeUser->can_approve_reject = $request->boolean('can_approve_reject');
        }
        if ($request->has('fixed_routing_enabled')) {
            $officeUser->fixed_routing_enabled = $request->boolean('fixed_routing_enabled');
        }
        if ($request->has('allow_endorse')) {
            $officeUser->allow_endorse = $request->boolean('allow_endorse');
        }
        if ($request->has('can_upload_documents')) {
            $officeUser->can_upload_documents = $request->boolean('can_upload_documents');
        }
        if ($request->has('name')) {
            $newName = trim((string) $request->name);
            if ($newName && $newName !== $officeUser->name) {
                $tagId = $officeUser->tag_id;
                if ($tagId !== null) {
                    $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
                    $token = config('services.paperless.token');
                    if ($token) {
                        $tagUrl = "{$baseUrl}/api/tags/{$tagId}/";
                        $patchResponse = Http::withHeaders(['Authorization' => 'Token ' . $token])
                            ->timeout(10)
                            ->patch($tagUrl, ['name' => $newName]);
                        if (! $patchResponse->successful()) {
                            return response()->json(['message' => 'Failed to update tag name in Paperless'], 422);
                        }
                    }
                }
                $officeUser->name = $newName;
            }
        }
        $officeUser->save();

        return response()->json([
            'name' => $officeUser->name,
            'tracking_code_prefix' => $officeUser->tracking_code_prefix,
            'can_approve_reject' => (bool) $officeUser->can_approve_reject,
            'fixed_routing_enabled' => (bool) $officeUser->fixed_routing_enabled,
            'allow_endorse' => (bool) ($officeUser->allow_endorse ?? true),
            'can_upload_documents' => (bool) ($officeUser->can_upload_documents ?? true),
        ]);
    }

    private function nameToUsername(string $name): string
    {
        $slug = Str::lower($name);
        $slug = preg_replace('/[^a-z0-9\s-]/', '', $slug);
        $slug = preg_replace('/[\s-]+/', '-', trim($slug));
        return $slug ?: 'office-' . uniqid();
    }

    private function ensureUniqueUsername(string $base): string
    {
        $username = $base;
        $n = 0;
        while (User::where('username', $username)->exists()) {
            $n++;
            $username = $base . '-' . $n;
        }
        return $username;
    }
}
