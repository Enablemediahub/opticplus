<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (! $token) {
            return response()->json([
                'message' => 'Authentication token is required.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $userId = Cache::get($this->cacheKey($token));

        if (! $userId) {
            return response()->json([
                'message' => 'Authentication token is invalid or expired.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $user = User::query()->find($userId);

        if (! $user) {
            Cache::forget($this->cacheKey($token));

            return response()->json([
                'message' => 'Authenticated user no longer exists.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        $request->attributes->set('current_access_token', $token);
        $request->setUserResolver(fn () => $user);

        return $next($request);
    }

    private function cacheKey(string $token): string
    {
        return 'opticplus_api_token:'.$token;
    }
}
