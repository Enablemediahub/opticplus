<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class PreventDuplicateSubmission
{
    private const CACHE_TTL_SECONDS = 90;

    private const WAIT_TIMEOUT_SECONDS = 15;

    private const WAIT_INTERVAL_MICROSECONDS = 250000;

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->shouldProtect($request)) {
            return $next($request);
        }

        $idempotencyKey = trim((string) $request->header('X-Idempotency-Key', ''));
        if ($idempotencyKey === '') {
            return $next($request);
        }

        $fingerprint = $this->requestFingerprint($request, $idempotencyKey);
        $responseCacheKey = 'opticplus_idempotency_response:'.$fingerprint;
        $lockCacheKey = 'opticplus_idempotency_lock:'.$fingerprint;

        if ($cached = Cache::get($responseCacheKey)) {
            return $this->replayResponse($cached);
        }

        if (! Cache::add($lockCacheKey, now()->timestamp, now()->addSeconds(self::WAIT_TIMEOUT_SECONDS + 5))) {
            $cached = $this->waitForCachedResponse($responseCacheKey);

            if ($cached) {
                return $this->replayResponse($cached);
            }

            return response()->json([
                'message' => 'This submission is already being processed. Please wait a moment.',
            ], Response::HTTP_CONFLICT);
        }

        try {
            $response = $next($request);

            if ($this->isCacheableResponse($response)) {
                Cache::put($responseCacheKey, $this->serializeResponse($response), now()->addSeconds(self::CACHE_TTL_SECONDS));
            }

            return $response;
        } finally {
            Cache::forget($lockCacheKey);
        }
    }

    private function shouldProtect(Request $request): bool
    {
        return in_array($request->getMethod(), ['POST', 'PUT', 'PATCH', 'DELETE'], true);
    }

    private function requestFingerprint(Request $request, string $idempotencyKey): string
    {
        $userId = $request->user()?->id ?? 'guest';

        return hash('sha256', implode('|', [
            $request->getMethod(),
            $request->path(),
            (string) $userId,
            $idempotencyKey,
        ]));
    }

    private function waitForCachedResponse(string $responseCacheKey): ?array
    {
        $deadline = microtime(true) + self::WAIT_TIMEOUT_SECONDS;

        do {
            $cached = Cache::get($responseCacheKey);
            if ($cached) {
                return $cached;
            }

            usleep(self::WAIT_INTERVAL_MICROSECONDS);
        } while (microtime(true) < $deadline);

        return null;
    }

    private function isCacheableResponse(Response $response): bool
    {
        return $response->isSuccessful() && $this->extractPayload($response) !== null;
    }

    private function serializeResponse(Response $response): array
    {
        return [
            'status' => $response->getStatusCode(),
            'payload' => $this->extractPayload($response),
        ];
    }

    private function replayResponse(array $cached): JsonResponse
    {
        return response()->json(
            $cached['payload'] ?? [],
            (int) ($cached['status'] ?? Response::HTTP_OK),
            ['X-Idempotent-Replay' => '1'],
        );
    }

    private function extractPayload(Response $response): mixed
    {
        if ($response instanceof JsonResponse) {
            return $response->getData(true);
        }

        $content = trim((string) $response->getContent());
        if ($content === '') {
            return [];
        }

        $decoded = json_decode($content, true);

        return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
    }
}
