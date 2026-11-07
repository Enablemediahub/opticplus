<?php

namespace App\Http\Controllers;

use App\Services\ManagerPushNotificationService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BankAlertController extends Controller
{
    private const BANKS = ['Ecobank', 'Prudential Bank', 'GTBank', 'MTN MoMo'];

    private const SENDER_BANKS = ['PRUDENTIAL' => 'Prudential Bank', 'MTN_MOMO' => 'MTN MoMo'];

    public function index(Request $request): JsonResponse
    {
        if ($response = $this->ensureAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $isManager = $request->user()?->normalized_role === 'manager';
        if ($isManager) {
            $this->resolveUnmatchedAccounts($branchId);
        }

        $accounts = DB::table('bank_accounts')
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->where('is_active', true)
            ->orderBy('branch_id')
            ->orderBy('bank_name')
            ->orderBy('account_suffix')
            ->get();

        if (! $isManager) {
            return response()->json([
                'accounts' => $accounts,
                'alerts' => [],
                'device' => null,
                'devices' => [],
                'banks' => [],
            ]);
        }

        $alerts = DB::table('bank_sms_alerts as alerts')
            ->leftJoin('bank_accounts as accounts', 'accounts.id', '=', 'alerts.bank_account_id')
            ->when($branchId > 0, fn ($query) => $query->where(function ($branchQuery) use ($branchId): void {
                $branchQuery->where('alerts.branch_id', $branchId);
            }))
            ->whereIn('alerts.status', ['pending', 'unmatched'])
            ->orderByDesc('alerts.received_at')
            ->limit(100)
            ->get([
                'alerts.id',
                'alerts.branch_id',
                'alerts.bank_account_id',
                'alerts.sender',
                'alerts.account_suffix',
                'alerts.direction',
                'alerts.amount',
                'alerts.transaction_reference',
                'alerts.transaction_date',
                'alerts.available_balance',
                'alerts.received_at',
                'alerts.status',
                'accounts.bank_name',
                'accounts.account_label',
            ]);

        $deviceColumns = ['id', 'branch_id', 'label', 'token_hint', 'last_used_at', 'created_at'];
        foreach (['alert_source', 'sync_request_version', 'sync_completed_version'] as $optionalColumn) {
            if (Schema::hasColumn('bank_sms_devices', $optionalColumn)) {
                $deviceColumns[] = $optionalColumn;
            }
        }

        $devices = DB::table('bank_sms_devices')
            ->whereNull('revoked_at')
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->orderByDesc('id')
            ->get($deviceColumns);

        return response()->json([
            'accounts' => $accounts,
            'alerts' => $alerts,
            'device' => $devices->first(),
            'devices' => $devices,
            'banks' => self::BANKS,
        ]);
    }

    public function storeAccount(Request $request): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        $validated = $request->validate([
            'branch_id' => ['required', 'integer', Rule::in([1, 2])],
            'bank_name' => ['required', 'string', Rule::in(self::BANKS)],
            'account_suffix' => ['required', 'regex:/^\d{4}$/'],
            'account_label' => ['nullable', 'string', 'max:80'],
        ]);

        $existingAccount = DB::table('bank_accounts')
            ->where('branch_id', $validated['branch_id'])
            ->where('bank_name', $validated['bank_name'])
            ->where('account_suffix', $validated['account_suffix'])
            ->first(['id', 'is_active']);
        if ($existingAccount?->is_active) {
            throw ValidationException::withMessages([
                'account_suffix' => 'That bank account is already configured for this branch.',
            ]);
        }

        $now = now();
        if ($existingAccount) {
            DB::table('bank_accounts')->where('id', $existingAccount->id)->update([
                'account_label' => trim((string) ($validated['account_label'] ?? '')) ?: null,
                'reported_balance' => null,
                'reported_balance_at' => null,
                'is_active' => true,
                'updated_at' => $now,
            ]);

            return response()->json([
                'message' => 'Bank account reconnected.',
                'account_id' => (int) $existingAccount->id,
            ]);
        }

        $accountId = DB::table('bank_accounts')->insertGetId([
            ...$validated,
            'account_label' => trim((string) ($validated['account_label'] ?? '')) ?: null,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return response()->json([
            'message' => 'Bank account added.',
            'account_id' => $accountId,
        ], 201);
    }

    public function destroyAccount(Request $request, int $accountId): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $accountQuery = DB::table('bank_accounts')->where('id', $accountId);
        if ($branchId > 0) {
            $accountQuery->where('branch_id', $branchId);
        }
        $account = $accountQuery->first();
        if (! $account) {
            return response()->json(['message' => 'That account was not found for the selected branch.'], 404);
        }

        $now = now();
        $sender = array_search($account->bank_name, self::SENDER_BANKS, true);

        DB::transaction(function () use ($account, $accountId, $sender, $now): void {
            $linkedAlerts = DB::table('bank_sms_alerts')->where('bank_account_id', $accountId);
            $linkedAlerts->whereIn('status', ['pending', 'unmatched'])->update([
                'bank_account_id' => null,
                'status' => 'archived',
                'updated_at' => $now,
            ]);
            DB::table('bank_sms_alerts')->where('bank_account_id', $accountId)->update([
                'bank_account_id' => null,
                'updated_at' => $now,
            ]);

            if ($sender !== false) {
                DB::table('bank_sms_alerts')
                    ->where('branch_id', $account->branch_id)
                    ->where('account_suffix', $account->account_suffix)
                    ->where('sender', $sender)
                    ->whereNull('bank_account_id')
                    ->whereIn('status', ['pending', 'unmatched'])
                    ->update([
                        'status' => 'archived',
                        'updated_at' => $now,
                    ]);
            }

            DB::table('bank_accounts')->where('id', $accountId)->update([
                'is_active' => false,
                'reported_balance' => null,
                'reported_balance_at' => null,
                'updated_at' => $now,
            ]);
        });

        return response()->json([
            'message' => 'Account removed. SMS history and posted bank-register activity were preserved; pending alerts for this account were archived.',
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        if ($response = $this->ensureAccess($request)) {
            return $response;
        }

        $validated = $request->validate([
            'bank_name' => ['required', 'string', Rule::in(self::BANKS)],
            'branch_id' => ['nullable', 'integer', Rule::in([0, 1, 2])],
            'start_date' => ['nullable', 'date_format:Y-m-d'],
            'end_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $branchId = $this->resolveBranchId($request);
        $sender = array_search($validated['bank_name'], self::SENDER_BANKS, true);
        $history = DB::table('bank_sms_alerts as alerts')
            ->leftJoin('bank_accounts as accounts', 'accounts.id', '=', 'alerts.bank_account_id')
            ->where(function ($query) use ($validated, $sender): void {
                $query->where('accounts.bank_name', $validated['bank_name']);
                if ($sender !== false) {
                    $query->orWhere(function ($unmatched) use ($sender): void {
                        $unmatched->whereNull('alerts.bank_account_id')->where('alerts.sender', $sender);
                    });
                }
            })
            ->when($branchId > 0, fn ($query) => $query->where('alerts.branch_id', $branchId))
            ->when(! empty($validated['start_date']), fn ($query) => $query->whereDate('alerts.transaction_date', '>=', $validated['start_date']))
            ->when(! empty($validated['end_date']), fn ($query) => $query->whereDate('alerts.transaction_date', '<=', $validated['end_date']))
            ->orderByDesc('alerts.received_at')
            ->paginate((int) ($validated['per_page'] ?? 25), [
                'alerts.id',
                'alerts.branch_id',
                'alerts.sender',
                'alerts.account_suffix',
                'alerts.direction',
                'alerts.amount',
                'alerts.transaction_reference',
                'alerts.transaction_date',
                'alerts.available_balance',
                'alerts.received_at',
                'alerts.status',
                'accounts.bank_name',
                'accounts.account_label',
            ], 'page', (int) ($validated['page'] ?? 1));

        return response()->json([
            'items' => $history->items(),
            'current_page' => $history->currentPage(),
            'last_page' => $history->lastPage(),
            'per_page' => $history->perPage(),
            'total' => $history->total(),
        ]);
    }

    public function requestDeviceSync(Request $request, int $deviceId): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $deviceQuery = DB::table('bank_sms_devices')
            ->where('id', $deviceId)
            ->whereNull('revoked_at');
        if ($branchId > 0) {
            $deviceQuery->where('branch_id', $branchId);
        }
        $device = $deviceQuery->first(['id', 'branch_id']);
        if (! $device) {
            return response()->json(['message' => 'No active paired phone was found for this branch.'], 404);
        }

        DB::table('bank_sms_devices')->where('id', $device->id)->increment('sync_request_version');
        $version = (int) DB::table('bank_sms_devices')->where('id', $device->id)->value('sync_request_version');

        return response()->json([
            'message' => 'Phone refresh requested. The phone will check on its next background poll, usually within five minutes.',
            'device_id' => (int) $device->id,
            'branch_id' => (int) $device->branch_id,
            'sync_request_version' => $version,
        ], 202);
    }

    public function revokeDevice(Request $request, int $deviceId): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $deviceQuery = DB::table('bank_sms_devices')
            ->where('id', $deviceId)
            ->whereNull('revoked_at');
        if ($branchId > 0) {
            $deviceQuery->where('branch_id', $branchId);
        }
        $device = $deviceQuery->first(['id', 'label', 'branch_id']);
        if (! $device) {
            return response()->json(['message' => 'That active phone pairing was not found for the selected branch.'], 404);
        }

        DB::table('bank_sms_devices')->where('id', $device->id)->update([
            'revoked_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'message' => $device->label.' pairing revoked. SMS history is preserved; you can generate a new token to pair the phone again.',
        ]);
    }

    public function updateDeviceSource(Request $request, int $deviceId): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        if (! Schema::hasColumn('bank_sms_devices', 'alert_source')) {
            return response()->json([
                'message' => 'Phone source settings are not enabled yet. Apply database/schema/add_bank_sms_device_alert_source.mysql.sql first.',
            ], 503);
        }

        $validated = $request->validate([
            'alert_source' => ['required', 'string', Rule::in(['prudential', 'momo', 'both'])],
        ]);
        $branchId = $this->resolveBranchId($request);
        $deviceQuery = DB::table('bank_sms_devices')->where('id', $deviceId)->whereNull('revoked_at');
        if ($branchId > 0) {
            $deviceQuery->where('branch_id', $branchId);
        }
        $device = $deviceQuery->first(['id', 'branch_id', 'label', 'alert_source']);
        if (! $device) {
            return response()->json(['message' => 'That active phone pairing was not found for the selected branch.'], 404);
        }

        $newSource = $validated['alert_source'];
        $blockedSender = $newSource === 'prudential' ? 'MTN_MOMO' : ($newSource === 'momo' ? 'PRUDENTIAL' : null);
        DB::transaction(function () use ($device, $newSource, $blockedSender): void {
            if ($blockedSender) {
                $blockedAlerts = DB::table('bank_sms_alerts')
                    ->where('device_id', $device->id)
                    ->where('sender', $blockedSender)
                    ->whereIn('status', ['pending', 'unmatched']);
                $affectedAccountIds = (clone $blockedAlerts)->whereNotNull('bank_account_id')->pluck('bank_account_id')->unique();
                foreach ($affectedAccountIds as $accountId) {
                    $latest = DB::table('bank_sms_alerts')->where('bank_account_id', $accountId)->orderByDesc('received_at')->first(['device_id', 'sender']);
                    if ($latest && (int) $latest->device_id === (int) $device->id && $latest->sender === $blockedSender) {
                        DB::table('bank_accounts')->where('id', $accountId)->update([
                            'reported_balance' => null,
                            'reported_balance_at' => null,
                            'updated_at' => now(),
                        ]);
                    }
                }
                $blockedAlerts->update(['status' => 'archived', 'bank_account_id' => null, 'updated_at' => now()]);
            }
            DB::table('bank_sms_devices')->where('id', $device->id)->update([
                'alert_source' => $newSource,
                'updated_at' => now(),
            ]);
        });

        return response()->json(['message' => $device->label.' is now set to '.($newSource === 'prudential' ? 'Prudential only' : ($newSource === 'momo' ? 'MTN MoMo only' : 'both Prudential and MTN MoMo alerts')).'.']);
    }

    public function deviceSyncRequest(Request $request): JsonResponse
    {
        $deviceId = (int) $request->attributes->get('bank_alert_device_id');
        $device = DB::table('bank_sms_devices')
            ->where('id', $deviceId)
            ->whereNull('revoked_at')
            ->first(['sync_request_version', 'sync_completed_version']);
        if (! $device) {
            return response()->json(['message' => 'The paired device is no longer active.'], 401);
        }

        DB::table('bank_sms_devices')->where('id', $deviceId)->update(['last_used_at' => now()]);
        $version = (int) ($device->sync_request_version ?? 0);
        $completedVersion = (int) ($device->sync_completed_version ?? 0);

        return response()->json([
            'requested' => $version > $completedVersion,
            'version' => $version,
        ]);
    }

    public function completeDeviceSyncRequest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'version' => ['required', 'integer', 'min:1'],
        ]);
        $deviceId = (int) $request->attributes->get('bank_alert_device_id');
        $updated = DB::table('bank_sms_devices')
            ->where('id', $deviceId)
            ->whereNull('revoked_at')
            ->where('sync_request_version', '>=', $validated['version'])
            ->where('sync_completed_version', '<', $validated['version'])
            ->update([
                'sync_completed_version' => $validated['version'],
                'last_used_at' => now(),
                'updated_at' => now(),
            ]);
        if (! $updated) {
            return response()->json(['message' => 'The refresh request was already completed or the device is no longer active.']);
        }

        return response()->json(['message' => 'Refresh request completed.']);
    }

    public function issueDevice(Request $request): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        if (! Schema::hasColumn('bank_sms_devices', 'alert_source')) {
            return response()->json([
                'message' => 'Phone pairing is not enabled until the Hostinger database is updated. Apply database/schema/add_bank_sms_device_alert_source.mysql.sql, then try again.',
            ], 503);
        }

        $validated = $request->validate([
            'label' => ['required', 'string', 'max:100'],
            'branch_id' => ['required', 'integer', Rule::in([1, 2])],
            'alert_source' => ['required', 'string', Rule::in(['prudential', 'momo', 'both'])],
        ]);
        $token = 'opba_'.Str::random(64);
        $now = now();
        DB::transaction(function () use ($validated, $token, $now, $request): void {
            DB::table('bank_sms_devices')->insert([
                'branch_id' => $validated['branch_id'],
                'label' => trim($validated['label']),
                'alert_source' => $validated['alert_source'],
                'token_hash' => hash('sha256', $token),
                'token_hint' => substr($token, -8),
                'created_by' => $request->user()->id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        });

        return response()->json([
            'message' => 'Device paired. Copy this token into the company phone now; it will not be shown again.',
            'token' => $token,
        ], 201);
    }

    public function ingest(Request $request, ManagerPushNotificationService $pushNotifications): JsonResponse
    {
        $validated = $request->validate([
            'sender' => ['required', 'string', Rule::in(array_keys(self::SENDER_BANKS))],
            'account_suffix' => ['nullable', 'regex:/^\d{4}$/'],
            'direction' => ['required', 'string', Rule::in(['credited', 'debited'])],
            'amount' => ['required', 'numeric', 'gt:0', 'max:9999999999.99'],
            'transaction_reference' => ['required', 'string', 'max:80', 'regex:/^[A-Za-z0-9_-]+$/'],
            'transaction_date' => ['required', 'date_format:d-m-Y'],
            'available_balance' => ['required', 'numeric', 'min:0', 'max:9999999999.99'],
            'received_at' => ['required', 'integer', 'min:0'],
        ]);

        $deviceId = (int) $request->attributes->get('bank_alert_device_id');
        $receivedAt = now()->setTimestamp((int) floor($validated['received_at'] / 1000));
        $transactionDate = \DateTimeImmutable::createFromFormat('!d-m-Y', $validated['transaction_date']);
        if (! $transactionDate) {
            throw ValidationException::withMessages(['transaction_date' => 'Invalid transaction date.']);
        }

        $deviceColumns = ['branch_id'];
        if (Schema::hasColumn('bank_sms_devices', 'alert_source')) {
            $deviceColumns[] = 'alert_source';
        }
        $device = DB::table('bank_sms_devices')
            ->where('id', $deviceId)
            ->whereNull('revoked_at')
            ->first($deviceColumns);
        if (! $device) {
            return response()->json(['message' => 'The paired device is no longer active.'], 401);
        }

        if ($receivedAt->greaterThan(now()->addMinutes(5))) {
            throw ValidationException::withMessages([
                'received_at' => 'The alert timestamp cannot be in the future.',
            ]);
        }

        $source = $validated['sender'] === 'PRUDENTIAL' ? 'prudential' : 'momo';
        if (isset($device->alert_source) && $device->alert_source !== 'both' && $device->alert_source !== $source) {
            DB::table('bank_sms_devices')->where('id', $deviceId)->update(['last_used_at' => now()]);

            return response()->json(['message' => 'Alert ignored because this phone is not paired for this SMS source.', 'ignored' => true]);
        }

        if ($validated['sender'] === 'PRUDENTIAL' && empty($validated['account_suffix'])) {
            throw ValidationException::withMessages(['account_suffix' => 'Account suffix is required for Prudential alerts.']);
        }
        $bankName = self::SENDER_BANKS[$validated['sender']];
        $matchingAccounts = DB::table('bank_accounts')
            ->where('bank_name', $bankName)
            ->when($validated['sender'] === 'PRUDENTIAL', fn ($query) => $query->where('account_suffix', $validated['account_suffix']))
            ->where('branch_id', $device->branch_id)
            ->where('is_active', true)
            ->get();
        $account = $matchingAccounts->count() === 1 ? $matchingAccounts->first() : null;
        if ($validated['sender'] === 'MTN_MOMO' && ! $account) {
            throw ValidationException::withMessages([
                'account_suffix' => 'Configure exactly one active MTN MoMo wallet for this branch before syncing MoMo alerts.',
            ]);
        }
        $accountSuffix = $account?->account_suffix ?? $validated['account_suffix'];

        try {
            $alertId = DB::table('bank_sms_alerts')->insertGetId([
                'bank_account_id' => $account?->id,
                'device_id' => $deviceId,
                'branch_id' => $device->branch_id,
                'sender' => $validated['sender'],
                'account_suffix' => $accountSuffix,
                'direction' => $validated['direction'],
                'amount' => round((float) $validated['amount'], 2),
                'transaction_reference' => $validated['transaction_reference'],
                'transaction_date' => $transactionDate->format('Y-m-d'),
                'available_balance' => round((float) $validated['available_balance'], 2),
                'received_at' => $receivedAt,
                'status' => $account ? 'pending' : 'unmatched',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (QueryException $exception) {
            $sqlState = $exception->errorInfo[0] ?? null;
            $driverCode = (int) ($exception->errorInfo[1] ?? 0);
            if (! ($sqlState === '23505' || ($sqlState === '23000' && $driverCode === 19) || $driverCode === 1062)) {
                throw $exception;
            }

            DB::table('bank_sms_devices')->where('id', $deviceId)->update(['last_used_at' => now()]);

            return response()->json(['message' => 'This bank alert was already received.', 'duplicate' => true]);
        }

        $balanceChanged = false;
        $updatedBalance = round((float) $validated['available_balance'], 2);
        if ($account && (! $account->reported_balance_at || $receivedAt->greaterThan($account->reported_balance_at))) {
            $balanceChanged = $account->reported_balance === null
                || round((float) $account->reported_balance, 2) !== $updatedBalance;
            DB::table('bank_accounts')->where('id', $account->id)->update([
                'reported_balance' => $updatedBalance,
                'reported_balance_at' => $receivedAt,
                'updated_at' => now(),
            ]);
            if ($balanceChanged) {
                $pushNotifications->notifyCeoOfBankBalanceChange(
                    (int) $account->id,
                    (int) $account->branch_id,
                    (string) $account->bank_name,
                    (string) ($account->account_label ?: 'Account •••• '.$account->account_suffix),
                    $account->reported_balance === null ? null : round((float) $account->reported_balance, 2),
                    $updatedBalance,
                    $receivedAt->toDateTimeString(),
                );
            }
        }

        DB::table('bank_sms_devices')->where('id', $deviceId)->update(['last_used_at' => now()]);

        $pushNotifications->notifyBranchManagers((int) $device->branch_id, 'sms_review');

        return response()->json([
            'message' => 'Alert received for review.',
            'alert_id' => $alertId,
            'status' => 'pending',
        ], 201);
    }

    public function review(Request $request, int $alertId): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        $validated = $request->validate([
            'decision' => ['required', Rule::in(['approve', 'reject'])],
        ]);

        $result = DB::transaction(function () use ($alertId, $validated, $request): array {
            $alert = DB::table('bank_sms_alerts')->where('id', $alertId)->lockForUpdate()->first();
            if (! $alert || $alert->status !== 'pending' || ! $alert->bank_account_id || ! $alert->branch_id) {
                throw ValidationException::withMessages([
                    'alert' => 'This alert is no longer pending or has no configured bank account.',
                ]);
            }

            $depositId = null;
            if ($validated['decision'] === 'approve' && $alert->sender === 'PRUDENTIAL') {
                $amount = round((float) $alert->amount * ($alert->direction === 'debited' ? -1 : 1), 2);
                $balanceQuery = DB::table('bank_balance');
                if (Schema::hasColumn('bank_balance', 'branch_id')) {
                    $balanceQuery->where('branch_id', $alert->branch_id);
                }
                $balanceRow = $balanceQuery->orderByDesc('id')->lockForUpdate()->first();
                $currentBalance = (float) ($balanceRow->balance ?? 0);
                $nextBalance = round($currentBalance + $amount, 2);
                if ($nextBalance < 0) {
                    throw ValidationException::withMessages([
                        'alert' => 'Approving this withdrawal would make the recorded branch balance negative.',
                    ]);
                }

                $depositId = DB::table('bank_deposits')->insertGetId([
                    'branch_id' => $alert->branch_id,
                    'amount' => $amount,
                    'date' => $alert->transaction_date,
                    'description' => 'Prudential Bank SMS '.$alert->direction.' | account ending '.$alert->account_suffix.' | reference '.$alert->transaction_reference,
                    'type' => $alert->direction === 'debited' ? 'withdrawal' : 'deposit',
                    'payment_method' => 'bank_transfer',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                if ($balanceRow) {
                    DB::table('bank_balance')->where('id', $balanceRow->id)->update([
                        'balance' => $nextBalance,
                        'last_updated' => now(),
                        'updated_at' => now(),
                    ]);
                } else {
                    DB::table('bank_balance')->insert([
                        'branch_id' => $alert->branch_id,
                        'balance' => $nextBalance,
                        'last_updated' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            DB::table('bank_sms_alerts')->where('id', $alert->id)->update([
                'status' => $validated['decision'] === 'approve' ? 'approved' : 'rejected',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'bank_deposit_id' => $depositId,
                'updated_at' => now(),
            ]);

            return [
                'deposit_id' => $depositId,
                'wallet_balance_only' => $alert->sender === 'MTN_MOMO',
            ];
        });

        return response()->json([
            'message' => $validated['decision'] === 'approve'
                ? (($result['wallet_balance_only'] ?? false)
                    ? 'MTN MoMo alert approved. The wallet balance remains separate from the branch bank register.'
                    : 'Alert approved and posted to the branch bank register.')
                : 'Alert rejected; no bank-register balance was changed.',
            ...$result,
        ]);
    }

    private function resolveUnmatchedAccounts(int $branchId): void
    {
        $query = DB::table('bank_sms_alerts')
            ->where('status', 'unmatched')
            ->whereNull('bank_account_id');
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        foreach ($query->get() as $alert) {
            $bankName = self::SENDER_BANKS[$alert->sender] ?? null;
            if (! $bankName) {
                continue;
            }
            $accountQuery = DB::table('bank_accounts')
                ->where('bank_name', $bankName)
                ->where('branch_id', $alert->branch_id)
                ->where('is_active', true);
            if ($alert->sender === 'PRUDENTIAL') {
                $accountQuery->where('account_suffix', $alert->account_suffix);
            }
            $account = $accountQuery->get();
            if ($account->count() === 1) {
                $account = $account->first();
                DB::table('bank_sms_alerts')->where('id', $alert->id)->update([
                    'bank_account_id' => $account->id,
                    'branch_id' => $account->branch_id,
                    'status' => 'pending',
                    'updated_at' => now(),
                ]);
            }
        }
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();

        return $user->isAdmin()
            ? max(0, (int) $request->integer('branch_id', $user->branch_id ?: 1))
            : (int) ($user->branch_id ?: 1);
    }

    private function ensureAccess(Request $request): ?JsonResponse
    {
        if (in_array($request->user()?->normalized_role, ['manager', 'accountant'], true)) {
            return null;
        }

        return response()->json(['message' => 'Only the General Manager and Accountant can view bank alerts.'], 403);
    }

    private function ensureManager(Request $request): ?JsonResponse
    {
        if ($request->user()?->normalized_role === 'manager') {
            return null;
        }

        return response()->json(['message' => 'Only the General Manager can manage bank SMS settings and reviews.'], 403);
    }
}
