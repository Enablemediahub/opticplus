<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class GtBankGmailService
{
    private const SENDER = 'gh.gens@gtbank.com';

    public function status(): array
    {
        $connection = DB::table('bank_gmail_connections')->where('id', 1)->first();

        return [
            'connected' => (bool) $connection?->refresh_token,
            'email' => $connection?->email,
            'last_synced_at' => $connection?->last_synced_at,
            'last_sync_message_at' => $connection?->last_sync_message_at,
            'last_error' => $connection?->last_error,
        ];
    }

    public function sync(?ManagerPushNotificationService $pushNotifications = null): array
    {
        $connection = DB::table('bank_gmail_connections')->where('id', 1)->first();
        if (! $connection || ! $connection->refresh_token) {
            throw new \RuntimeException('Connect a Gmail account before syncing GTBank email notifications.');
        }

        $accessToken = $this->accessToken($connection);
        $processed = 0;
        $duplicates = 0;
        $pageToken = null;
        $latestEmailAt = null;

        do {
            $response = Http::withToken($accessToken)
                ->acceptJson()
                ->get('https://gmail.googleapis.com/gmail/v1/users/me/messages', [
                    'q' => 'from:'.self::SENDER,
                    'maxResults' => 100,
                    'pageToken' => $pageToken,
                ]);
            if (! $response->successful()) {
                throw new \RuntimeException('Gmail message search failed: '.$response->json('error.message', $response->body()));
            }

            foreach ($response->json('messages', []) as $summary) {
                $messageId = (string) ($summary['id'] ?? '');
                if ($messageId === '' || DB::table('bank_gmail_messages')->where('gmail_message_id', $messageId)->exists()) {
                    $duplicates++;
                    continue;
                }

                $messageResponse = Http::withToken($accessToken)
                    ->acceptJson()
                    ->get('https://gmail.googleapis.com/gmail/v1/users/me/messages/'.$messageId, [
                        'format' => 'full',
                    ]);
                if (! $messageResponse->successful()) {
                    continue;
                }

                $parsed = $this->parseMessage($messageResponse->json());
                if (! $parsed) {
                    continue;
                }

                $suffix = $parsed['account_suffix'];
                if (! $suffix) {
                    $gtAccounts = DB::table('bank_accounts')
                        ->where('bank_name', 'GTBank')
                        ->where('is_active', true)
                        ->distinct()
                        ->pluck('account_suffix');
                    $suffix = $gtAccounts->count() === 1 ? (string) $gtAccounts->first() : null;
                }
                if (! $suffix) {
                    continue;
                }

                DB::transaction(function () use ($messageId, $parsed, $suffix, &$processed, &$latestEmailAt): void {
                    $accounts = DB::table('bank_accounts')
                        ->where('bank_name', 'GTBank')
                        ->where('account_suffix', $suffix)
                        ->where('is_active', true)
                        ->lockForUpdate()
                        ->get(['id', 'branch_id', 'account_label', 'reported_balance', 'reported_balance_at']);

                    foreach ($accounts as $account) {
                        $shouldUpdate = ! $account->reported_balance_at
                            || $parsed['email_at']->greaterThan(\Illuminate\Support\Carbon::parse($account->reported_balance_at));
                        if (! $shouldUpdate) {
                            continue;
                        }

                        $oldBalance = $account->reported_balance === null ? null : round((float) $account->reported_balance, 2);
                        if ($oldBalance !== $parsed['current_balance']) {
                            DB::table('bank_accounts')->where('id', $account->id)->update([
                                'reported_balance' => $parsed['current_balance'],
                                'reported_balance_at' => $parsed['email_at']->toDateTimeString(),
                                'updated_at' => now(),
                            ]);
                        }
                    }

                    DB::table('bank_gmail_messages')->insert([
                        'gmail_message_id' => $messageId,
                        'sender' => self::SENDER,
                        'account_suffix' => $suffix,
                        'current_balance' => $parsed['current_balance'],
                        'available_balance' => $parsed['available_balance'],
                        'email_at' => $parsed['email_at']->toDateTimeString(),
                        'processed_at' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $processed++;
                    if (! $latestEmailAt || $parsed['email_at']->greaterThan($latestEmailAt)) {
                        $latestEmailAt = $parsed['email_at'];
                    }
                });
            }

            $pageToken = $response->json('nextPageToken');
        } while ($pageToken);

        // Reapply the latest stored Gmail balance on every sync. This also
        // repairs GTBank accounts whose last notification was already
        // deduplicated, or whose reported balance previously came from SMS.
        $latestRecordedEmail = DB::table('bank_gmail_messages')
            ->whereNotNull('account_suffix')
            ->orderByDesc('email_at')
            ->orderByDesc('id')
            ->first(['account_suffix', 'current_balance', 'email_at']);
        $accountsUpdated = 0;
        if ($latestRecordedEmail) {
            $latestEmailAt = \Illuminate\Support\Carbon::parse($latestRecordedEmail->email_at);
            $accountsUpdated = DB::table('bank_accounts')
                ->where('bank_name', 'GTBank')
                ->where('account_suffix', $latestRecordedEmail->account_suffix)
                ->where('is_active', true)
                ->update([
                    'reported_balance' => $latestRecordedEmail->current_balance,
                    'reported_balance_at' => $latestEmailAt->toDateTimeString(),
                    'updated_at' => now(),
                ]);
        }

        DB::table('bank_gmail_connections')->where('id', 1)->update([
            'access_token' => Crypt::encryptString($accessToken),
            'token_expires_at' => now()->addHour(),
            'last_synced_at' => now(),
            'last_sync_message_at' => $latestEmailAt?->toDateTimeString(),
            'last_error' => null,
            'updated_at' => now(),
        ]);

        return [
            'processed' => $processed,
            'duplicates' => $duplicates,
            'message' => $latestRecordedEmail && $accountsUpdated > 0
                ? ($processed
                    ? $processed.' GTBank Gmail notification'.($processed === 1 ? '' : 's').' synced; balance refreshed from the latest email dated '.$latestEmailAt->format('d M Y, g:i A').'.'
                    : 'GTBank balance refreshed from the latest credit/debit email dated '.$latestEmailAt->format('d M Y, g:i A').'; no new notifications were found.')
                : ($latestRecordedEmail
                    ? 'The latest GTBank email was found, but no active account matches its account number ending '.$latestRecordedEmail->account_suffix.'.'
                    : 'No GTBank credit/debit emails with a readable Current Balance were found.'),
        ];
    }

    private function accessToken(object $connection): string
    {
        if ($connection->access_token && $connection->token_expires_at
            && \Illuminate\Support\Carbon::parse($connection->token_expires_at)->greaterThan(now()->addMinute())) {
            return Crypt::decryptString($connection->access_token);
        }

        $clientId = config('services.google.client_id');
        $clientSecret = config('services.google.client_secret');
        if (! $clientId || ! $clientSecret || ! $connection->refresh_token) {
            throw new \RuntimeException('Gmail OAuth credentials are not configured.');
        }

        $refreshToken = Crypt::decryptString($connection->refresh_token);
        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'refresh_token' => $refreshToken,
            'grant_type' => 'refresh_token',
        ]);
        if (! $response->successful()) {
            throw new \RuntimeException('Gmail authorization expired: '.$response->json('error_description', $response->body()));
        }

        return (string) $response->json('access_token');
    }

    private function parseMessage(array $message): ?array
    {
        $headers = collect($message['payload']['headers'] ?? [])
            ->mapWithKeys(fn (array $header): array => [strtolower((string) $header['name']) => (string) $header['value']])
            ->all();
        $from = strtolower((string) ($headers['from'] ?? ''));
        if (! str_contains($from, self::SENDER)) {
            return null;
        }

        $body = $this->messageBody($message['payload'] ?? []);
        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8') ?: ''));
        $currentBalance = $this->balanceAfterLabel($text, 'Current\\s*Balance');
        $availableBalance = $this->balanceAfterLabel($text, 'Available\\s*Balance');
        if ($currentBalance === null) {
            return null;
        }

        $emailAt = null;
        if (! empty($headers['date'])) {
            try {
                $emailAt = new \Illuminate\Support\Carbon($headers['date']);
            } catch (\Throwable) {
                $emailAt = null;
            }
        }
        if (! $emailAt) {
            $internalDate = (int) ($message['internalDate'] ?? 0);
            $emailAt = $internalDate
                ? now()->setTimestamp((int) floor($internalDate / 1000))
                : now();
        }

        $accountSuffix = null;
        if (preg_match('/(?:account|acct)[^\d]{0,20}(?:ending(?:\s+with)?|ending|x|\*)*\s*[xX*]*(\d{4})\b/i', $text, $matches)
            || preg_match('/(?:x{2,}|\*){2,}\s*(\d{4})\b/', $text, $matches)) {
            $accountSuffix = $matches[1];
        }

        return [
            'current_balance' => $currentBalance,
            'available_balance' => $availableBalance,
            'account_suffix' => $accountSuffix,
            'email_at' => $emailAt,
        ];
    }

    private function messageBody(array $payload): string
    {
        $parts = [];
        $walk = function (array $part) use (&$walk, &$parts): void {
            $mimeType = strtolower((string) ($part['mimeType'] ?? ''));
            if (in_array($mimeType, ['text/plain', 'text/html'], true) && isset($part['body']['data'])) {
                $parts[] = [$mimeType, $this->base64UrlDecode((string) $part['body']['data'])];
            }
            foreach ($part['parts'] ?? [] as $child) {
                $walk($child);
            }
        };
        $walk($payload);
        if (! $parts) {
            if (isset($payload['body']['data'])) {
                return $this->base64UrlDecode((string) $payload['body']['data']);
            }
            return '';
        }

        foreach ($parts as [$mimeType, $body]) {
            if ($mimeType === 'text/plain') {
                return $body;
            }
        }

        return $parts[0][1];
    }

    private function base64UrlDecode(string $value): string
    {
        $value = str_replace(['-', '_'], ['+', '/'], $value);
        return base64_decode(str_pad($value, strlen($value) + ((4 - strlen($value) % 4) % 4), '=', STR_PAD_RIGHT)) ?: '';
    }

    private function balanceAfterLabel(string $text, string $labelPattern): ?float
    {
        if (! preg_match('/'.$labelPattern.'\s*(?::|-|=)?\s*(?:GHS|GH₵|NGN|N|₦|\$)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i', $text, $matches)) {
            return null;
        }

        $value = str_replace(',', '', $matches[1]);
        return is_numeric($value) ? round((float) $value, 2) : null;
    }
}
