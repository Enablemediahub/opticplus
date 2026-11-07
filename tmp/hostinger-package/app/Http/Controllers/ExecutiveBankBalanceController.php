<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ExecutiveBankBalanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if ($response = $this->ensureCeo($request)) {
            return $response;
        }

        $accounts = Schema::hasTable('bank_accounts')
            ? DB::table('bank_accounts')
                ->where('is_active', true)
                ->orderBy('branch_id')
                ->orderBy('bank_name')
                ->orderBy('account_suffix')
                ->get([
                    'id',
                    'branch_id',
                    'bank_name',
                    'account_suffix',
                    'account_label',
                    'reported_balance',
                    'reported_balance_at',
                ])
            : collect();

        $pushEnabled = $this->pushIsConfigured() && Schema::hasTable('push_subscriptions');
        $subscribed = $pushEnabled
            && DB::table('push_subscriptions')
                ->where('user_id', $request->user()->id)
                ->where('branch_id', 0)
                ->exists();

        return response()->json([
            'accounts' => $accounts,
            'push' => [
                'enabled' => $pushEnabled,
                'public_key' => config('services.webpush.public_key'),
                'subscribed' => $subscribed,
            ],
        ]);
    }

    public function subscribe(Request $request): JsonResponse
    {
        if ($response = $this->ensureCeo($request)) {
            return $response;
        }

        if (! Schema::hasTable('push_subscriptions')) {
            return response()->json(['message' => 'Run the push subscriptions SQL setup before enabling phone alerts.'], 503);
        }

        if (! $this->pushIsConfigured()) {
            return response()->json(['message' => 'Phone notifications are not configured on the server yet.'], 503);
        }

        $validated = $request->validate([
            'subscription.endpoint' => ['required', 'url', 'starts_with:https://', 'max:2048'],
            'subscription.keys.p256dh' => ['required', 'string', 'max:255'],
            'subscription.keys.auth' => ['required', 'string', 'max:255'],
        ]);

        $endpoint = $validated['subscription']['endpoint'];
        $endpointHost = strtolower((string) parse_url($endpoint, PHP_URL_HOST));
        $endpointPort = parse_url($endpoint, PHP_URL_PORT);
        $isKnownPushHost = in_array($endpointHost, [
            'fcm.googleapis.com',
            'updates.push.services.mozilla.com',
            'web.push.apple.com',
            'notify.windows.com',
        ], true) || str_ends_with($endpointHost, '.notify.windows.com');
        if (! $isKnownPushHost || ($endpointPort !== null && $endpointPort !== 443)) {
            return response()->json(['message' => 'This browser push provider is not supported.'], 422);
        }

        $now = now();
        DB::table('push_subscriptions')->updateOrInsert(
            [
                'user_id' => $request->user()->id,
                'endpoint_hash' => hash('sha256', $endpoint),
            ],
            [
                'branch_id' => 0,
                'endpoint' => $endpoint,
                'subscription_json' => json_encode($validated['subscription'], JSON_UNESCAPED_SLASHES),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        return response()->json(['message' => 'Phone alerts for bank balance changes are enabled.']);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        if ($response = $this->ensureCeo($request)) {
            return $response;
        }

        if (! Schema::hasTable('push_subscriptions')) {
            return response()->json(['message' => 'Run the push subscriptions SQL setup before managing phone alerts.'], 503);
        }

        $validated = $request->validate([
            'endpoint' => ['required', 'url', 'starts_with:https://', 'max:2048'],
        ]);

        DB::table('push_subscriptions')
            ->where('user_id', $request->user()->id)
            ->where('endpoint_hash', hash('sha256', $validated['endpoint']))
            ->delete();

        return response()->json(['message' => 'Phone alerts for bank balance changes are disabled.']);
    }

    private function ensureCeo(Request $request): ?JsonResponse
    {
        if ($request->user()?->normalized_role !== 'ceo') {
            return response()->json(['message' => 'Only the CEO can access company bank balance alerts.'], 403);
        }

        return null;
    }

    private function pushIsConfigured(): bool
    {
        return filled(config('services.webpush.public_key'))
            && filled(config('services.webpush.private_key'))
            && filled(config('services.webpush.subject'));
    }
}
