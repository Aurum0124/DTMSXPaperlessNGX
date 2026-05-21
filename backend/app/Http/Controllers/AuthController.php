<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\PaperlessTagsCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Login and issue token.
     */
    public function login(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'username' => 'required|string',
                'password' => 'required|string',
            ]);

            $user = User::where('username', $request->username)->first();

            if (!$user || !Hash::check($request->password, $user->password)) {
                throw ValidationException::withMessages([
                    'username' => ['The provided credentials are incorrect.'],
                ]);
            }

            $token = $user->createToken('auth-token')->plainTextToken;

            $userData = [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'role' => $user->role,
            ];
            if ($user->tag_id !== null) {
                $userData['tag_id'] = $user->tag_id;
                $paperlessTagId = PaperlessTagsCache::effectiveTagIdForUser($user);
                if ($paperlessTagId !== null) {
                    $userData['paperless_tag_id'] = $paperlessTagId;
                }
            }
            if ($user->tracking_code_prefix !== null) {
                $userData['tracking_code_prefix'] = $user->tracking_code_prefix;
            }
            if ($user->role === 'department') {
                $userData['can_approve_reject'] = (bool) $user->can_approve_reject;
                $userData['fixed_routing_enabled'] = (bool) $user->fixed_routing_enabled;
                $userData['allow_endorse'] = (bool) ($user->allow_endorse ?? true);
                $userData['can_upload_documents'] = (bool) ($user->can_upload_documents ?? true);
            }
            return response()->json([
                'token' => $token,
                'user' => $userData,
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            \Log::error('Login error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'message' => 'Login failed',
                'error' => config('app.debug') ? $e->getMessage() : 'Internal server error',
            ], 500);
        }
    }

    /**
     * Logout and revoke current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    /**
     * Get current authenticated user.
     */
    public function user(Request $request): JsonResponse
    {
        $user = $request->user();
        $userData = [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'role' => $user->role,
        ];
        if ($user->tag_id !== null) {
            $userData['tag_id'] = $user->tag_id;
            $paperlessTagId = PaperlessTagsCache::effectiveTagIdForUser($user);
            if ($paperlessTagId !== null) {
                $userData['paperless_tag_id'] = $paperlessTagId;
            }
        }
        if ($user->tracking_code_prefix !== null) {
            $userData['tracking_code_prefix'] = $user->tracking_code_prefix;
        }
        if ($user->role === 'department') {
            $userData['can_approve_reject'] = (bool) $user->can_approve_reject;
            $userData['fixed_routing_enabled'] = (bool) $user->fixed_routing_enabled;
            $userData['allow_endorse'] = (bool) ($user->allow_endorse ?? true);
            $userData['can_upload_documents'] = (bool) ($user->can_upload_documents ?? true);
        }
        return response()->json($userData);
    }
}
