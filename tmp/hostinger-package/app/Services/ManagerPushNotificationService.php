<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Throwable;

class ManagerPushNotificationService
{
    public function notifyBranchManagers(int $branchId, string $kind): void
    {
        $configuration = config('services.webpush');
        if (! $configuration['public_key'] || ! $configuration['private_key'] || ! $configuration['subject']) {
            return;
        }

        if (! Schema::hasTable('push_subscriptions')) {
            return;
        }

        $message = match ($kind) {
            'memo' => [
                'title' => 'Memo approval pending',
                'body' => 'A memo is waiting for your review.',
                'url' => '/#/memos',
                'tag' => 'opticplus-memo-approvals',
            ],
            'expense' => [
                'title' => 'Expense approval pending',
                'body' => 'An expense request is waiting for your review.',
                'url' => '/#/expenses',
                'tag' => 'opticplus-expense-approvals',
            ],
            'sms_review' => [
                'title' => 'SMS Review Queue',
                'body' => 'A bank SMS alert is waiting for your review.',
                'url' => '/#/bank-deposits',
                'tag' => 'opticplus-sms-review',
            ],
            default => null,
        };
        if (! $message) {
            return;
        }

        $subscriptions = DB::table('push_subscriptions as subscriptions')
            ->join('users', 'users.id', '=', 'subscriptions.user_id')
            ->whereIn('users.role', ['manager', 'general-manager'])
            ->where(function ($query) use ($branchId): void {
                $query->where('subscriptions.branch_id', $branchId);
                if ($branchId > 0) {
                    $query->orWhere('subscriptions.branch_id', 0);
                }
            })
            ->get([
                'subscriptions.id',
                'subscriptions.endpoint_hash',
                'subscriptions.subscription_json',
            ]);

        $this->sendToSubscriptions($subscriptions, $configuration, $message, [
            'branch_id' => $branchId,
            'kind' => $kind,
        ]);
    }

    public function notifyCeoOfBankBalanceChange(
        int $accountId,
        int $branchId,
        string $bankName,
        string $accountLabel,
        ?float $previousBalance,
        float $balance,
        string $changedAt,
    ): void {
        $configuration = config('services.webpush');
        if (! $configuration['public_key'] || ! $configuration['private_key'] || ! $configuration['subject']) {
            return;
        }

        if (! Schema::hasTable('push_subscriptions')) {
            return;
        }

        $subscriptions = DB::table('push_subscriptions as subscriptions')
            ->join('users', 'users.id', '=', 'subscriptions.user_id')
            ->where('users.role', 'ceo')
            ->whereIn('subscriptions.branch_id', array_values(array_unique([$branchId, 0])))
            ->get([
                'subscriptions.id',
                'subscriptions.subscription_json',
            ]);

        $branchName = $branchId === 2 ? 'Madina' : 'Labadi';
        $message = [
            'type' => 'bank-balance-change',
            'title' => 'Bank balance changed',
            'body' => sprintf('%s · %s · %s: GHS %s', $bankName, $branchName, $accountLabel, number_format($balance, 2)),
            'url' => '/#/dashboard',
            'tag' => 'opticplus-bank-balance-'.$accountId,
            'account_id' => $accountId,
            'branch_id' => $branchId,
            'bank_name' => $bankName,
            'account_label' => $accountLabel,
            'previous_balance' => $previousBalance,
            'balance' => $balance,
            'changed_at' => $changedAt,
        ];

        $this->sendToSubscriptions($subscriptions, $configuration, $message, [
            'branch_id' => $branchId,
            'kind' => 'bank_balance_change',
        ]);
    }

    private function sendToSubscriptions(Collection $subscriptions, array $configuration, array $message, array $context): void
    {
        if ($subscriptions->isEmpty()) {
            return;
        }

        try {
            $webPush = new WebPush([
                'VAPID' => [
                    'subject' => $configuration['subject'],
                    'publicKey' => $configuration['public_key'],
                    'privateKey' => $configuration['private_key'],
                ],
            ]);

            $payload = json_encode($message, JSON_UNESCAPED_SLASHES);
            foreach ($subscriptions as $storedSubscription) {
                $decoded = json_decode($storedSubscription->subscription_json, true);
                if (! is_array($decoded)) {
                    Log::warning('A push subscription could not be decoded.', [
                        'subscription_id' => $storedSubscription->id,
                    ]);

                    continue;
                }

                $decoded['contentEncoding'] = 'aes128gcm';
                $report = $webPush->sendOneNotification(Subscription::create($decoded), $payload);

                if ($report->isSubscriptionExpired()) {
                    DB::table('push_subscriptions')->where('id', $storedSubscription->id)->delete();
                } elseif (! $report->isSuccess()) {
                    Log::warning('A push notification could not be delivered.', [
                        'subscription_id' => $storedSubscription->id,
                        'reason' => $report->getReason(),
                    ]);
                }
            }
        } catch (Throwable $exception) {
            Log::warning('Push notification delivery failed.', [
                ...$context,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
