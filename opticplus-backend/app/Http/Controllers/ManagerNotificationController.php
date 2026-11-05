<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ManagerNotificationController extends Controller
{
    public function summary(Request $request): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $memoCount = 0;
        $expenseCount = 0;
        $smsCount = 0;

        if (Schema::hasTable('memos')) {
            $memoQuery = DB::table('memos')
                ->where('requires_approval', true)
                ->where('approval_status', 'pending')
                ->where('status', '!=', 'draft');
            $this->applyBranchScope($memoQuery, 'branch_id', $branchId);
            $memoCount = $memoQuery->count();
        }

        if (Schema::hasTable('expense_approval_requests')) {
            $expenseQuery = DB::table('expense_approval_requests')->where('status', 'pending');
            $this->applyBranchScope($expenseQuery, 'branch_id', $branchId);
            $expenseCount = $expenseQuery->count();
        }

        if (Schema::hasTable('bank_sms_alerts')) {
            $smsQuery = DB::table('bank_sms_alerts')->whereIn('status', ['pending', 'unmatched']);
            $this->applyBranchScope($smsQuery, 'branch_id', $branchId);
            $smsCount = $smsQuery->count();
        }

        $subscribed = Schema::hasTable('push_subscriptions')
            && DB::table('push_subscriptions')
                ->where('user_id', $request->user()->id)
                ->where('branch_id', $branchId)
                ->exists();

        return response()->json([
            'branch_id' => $branchId,
            'counts' => [
                'memos' => $memoCount,
                'expenses' => $expenseCount,
                'sms_reviews' => $smsCount,
                'total' => $memoCount + $expenseCount + $smsCount,
            ],
            'push' => [
                'enabled' => $this->pushIsConfigured() && Schema::hasTable('push_subscriptions'),
                'public_key' => config('services.webpush.public_key'),
                'subscribed' => $subscribed,
            ],
        ]);
    }

    public function subscribe(Request $request): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        if (! Schema::hasTable('push_subscriptions')) {
            return response()->json(['message' => 'Run the database migrations to enable phone notifications.'], 503);
        }

        if (! $this->pushIsConfigured()) {
            return response()->json([
                'message' => 'Phone notifications are not configured on the server yet.',
            ], 503);
        }

        $validated = $request->validate([
            'branch_id' => ['required', 'integer', 'in:0,1,2'],
            'subscription.endpoint' => ['required', 'url', 'starts_with:https://', 'max:2048'],
            'subscription.keys.p256dh' => ['required', 'string', 'max:255'],
            'subscription.keys.auth' => ['required', 'string', 'max:255'],
        ]);
        if ((int) $validated['branch_id'] !== $this->resolveBranchId($request)) {
            return response()->json(['message' => 'You cannot subscribe to notifications for this branch.'], 403);
        }

        $subscription = $validated['subscription'];
        $endpointHost = strtolower((string) parse_url($subscription['endpoint'], PHP_URL_HOST));
        $endpointPort = parse_url($subscription['endpoint'], PHP_URL_PORT);
        $isKnownPushHost = in_array($endpointHost, [
            'fcm.googleapis.com',
            'updates.push.services.mozilla.com',
            'web.push.apple.com',
            'notify.windows.com',
        ], true) || str_ends_with($endpointHost, '.notify.windows.com');
        if (! $isKnownPushHost || ($endpointPort !== null && $endpointPort !== 443)) {
            return response()->json([
                'message' => 'This browser push provider is not supported.',
            ], 422);
        }

        $endpointHash = hash('sha256', $subscription['endpoint']);
        $now = now();

        DB::table('push_subscriptions')->updateOrInsert(
            [
                'user_id' => $request->user()->id,
                'endpoint_hash' => $endpointHash,
            ],
            [
                'branch_id' => $validated['branch_id'],
                'endpoint' => $subscription['endpoint'],
                'subscription_json' => json_encode($subscription, JSON_UNESCAPED_SLASHES),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        return response()->json(['message' => 'Phone notifications are enabled for this branch.']);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        if (! Schema::hasTable('push_subscriptions')) {
            return response()->json(['message' => 'Run the database migrations to enable phone notifications.'], 503);
        }

        $validated = $request->validate([
            'endpoint' => ['required', 'url', 'starts_with:https://', 'max:2048'],
        ]);

        if (Schema::hasTable('push_subscriptions')) {
            DB::table('push_subscriptions')
                ->where('user_id', $request->user()->id)
                ->where('endpoint_hash', hash('sha256', $validated['endpoint']))
                ->delete();
        }

        return response()->json(['message' => 'Phone notifications are disabled on this device.']);
    }

    private function ensureManager(Request $request): ?JsonResponse
    {
        if (($request->user()?->normalized_role ?? $request->user()?->role) !== 'manager') {
            return response()->json(['message' => 'Only the General Manager can access approval notifications.'], 403);
        }

        return null;
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();
        if (! $user->isAdmin()) {
            return (int) $user->branch_id;
        }

        return max(0, (int) $request->integer('branch_id', $user->branch_id));
    }

    private function applyBranchScope($query, string $column, int $branchId): void
    {
        if ($branchId > 0) {
            $query->where($column, $branchId);
        }
    }

    private function pushIsConfigured(): bool
    {
        return filled(config('services.webpush.public_key'))
            && filled(config('services.webpush.private_key'))
            && filled(config('services.webpush.subject'));
    }
}
