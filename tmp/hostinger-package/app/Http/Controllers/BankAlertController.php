<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BankAlertController extends Controller
{
    private const BANKS = ['Ecobank', 'Prudential Bank', 'GTBank'];

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
            ->orderBy('branch_id')
            ->orderBy('bank_name')
            ->orderBy('account_suffix')
            ->get();

        if (! $isManager) {
            return response()->json([
                'accounts' => $accounts,
                'alerts' => [],
                'device' => null,
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

        $device = DB::table('bank_sms_devices')
            ->whereNull('revoked_at')
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->orderByDesc('id')
            ->first(['id', 'branch_id', 'label', 'token_hint', 'last_used_at', 'created_at']);

        return response()->json([
            'accounts' => $accounts,
            'alerts' => $alerts,
            'device' => $device,
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

        $exists = DB::table('bank_accounts')
            ->where('branch_id', $validated['branch_id'])
            ->where('bank_name', $validated['bank_name'])
            ->where('account_suffix', $validated['account_suffix'])
            ->exists();
        if ($exists) {
            throw ValidationException::withMessages([
                'account_suffix' => 'That bank account is already configured for this branch.',
            ]);
        }

        $now = now();
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

    public function issueDevice(Request $request): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        $validated = $request->validate([
            'label' => ['required', 'string', 'max:100'],
            'branch_id' => ['required', 'integer', Rule::in([1, 2])],
        ]);
        $token = 'opba_'.Str::random(64);
        $now = now();
        DB::transaction(function () use ($validated, $token, $now, $request): void {
            DB::table('bank_sms_devices')->whereNull('revoked_at')->update([
                'revoked_at' => $now,
                'updated_at' => $now,
            ]);
            DB::table('bank_sms_devices')->insert([
                'branch_id' => $validated['branch_id'],
                'label' => trim($validated['label']),
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

    public function ingest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sender' => ['required', 'string', 'in:PRUDENTIAL'],
            'account_suffix' => ['required', 'regex:/^\d{4}$/'],
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

        $device = DB::table('bank_sms_devices')
            ->where('id', $deviceId)
            ->whereNull('revoked_at')
            ->first(['branch_id']);
        if (! $device) {
            return response()->json(['message' => 'The paired device is no longer active.'], 401);
        }

        if ($receivedAt->greaterThan(now()->addMinutes(5))) {
            throw ValidationException::withMessages([
                'received_at' => 'The alert timestamp cannot be in the future.',
            ]);
        }

        $matchingAccounts = DB::table('bank_accounts')
            ->where('bank_name', 'Prudential Bank')
            ->where('account_suffix', $validated['account_suffix'])
            ->where('branch_id', $device->branch_id)
            ->where('is_active', true)
            ->get();
        $account = $matchingAccounts->count() === 1 ? $matchingAccounts->first() : null;

        try {
            $alertId = DB::table('bank_sms_alerts')->insertGetId([
                'bank_account_id' => $account?->id,
                'device_id' => $deviceId,
                'branch_id' => $device->branch_id,
                'sender' => 'PRUDENTIAL',
                'account_suffix' => $validated['account_suffix'],
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
        } catch (\Illuminate\Database\QueryException $exception) {
            $sqlState = $exception->errorInfo[0] ?? null;
            $driverCode = (int) ($exception->errorInfo[1] ?? 0);
            if (! ($sqlState === '23505' || ($sqlState === '23000' && $driverCode === 19) || $driverCode === 1062)) {
                throw $exception;
            }

            DB::table('bank_sms_devices')->where('id', $deviceId)->update(['last_used_at' => now()]);

            return response()->json(['message' => 'This bank alert was already received.', 'duplicate' => true]);
        }

        if ($account && (! $account->reported_balance_at || $receivedAt->greaterThan($account->reported_balance_at))) {
            DB::table('bank_accounts')->where('id', $account->id)->update([
                'reported_balance' => round((float) $validated['available_balance'], 2),
                'reported_balance_at' => $receivedAt,
                'updated_at' => now(),
            ]);
        }

        DB::table('bank_sms_devices')->where('id', $deviceId)->update(['last_used_at' => now()]);

        return response()->json([
            'message' => $account ? 'Bank alert received for review.' : 'Alert received, but no matching bank account is configured yet.',
            'alert_id' => $alertId,
            'status' => $account ? 'pending' : 'unmatched',
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
            if ($validated['decision'] === 'approve') {
                $amount = round((float) $alert->amount * ($alert->direction === 'debited' ? -1 : 1), 2);
                $balanceQuery = DB::table('bank_balance');
                if (\Illuminate\Support\Facades\Schema::hasColumn('bank_balance', 'branch_id')) {
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

            return ['deposit_id' => $depositId];
        });

        return response()->json([
            'message' => $validated['decision'] === 'approve'
                ? 'Alert approved and posted to the branch bank register.'
                : 'Alert rejected; no bank-register balance was changed.',
            ...$result,
        ]);
    }

    private function resolveUnmatchedAccounts(int $branchId): void
    {
        $query = DB::table('bank_sms_alerts')
            ->where('sender', 'PRUDENTIAL')
            ->where('status', 'unmatched')
            ->whereNull('bank_account_id');
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        foreach ($query->get() as $alert) {
            $account = DB::table('bank_accounts')
                ->where('bank_name', 'Prudential Bank')
                ->where('account_suffix', $alert->account_suffix)
                ->where('branch_id', $alert->branch_id)
                ->where('is_active', true)
                ->get();
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
