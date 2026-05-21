<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DebtController extends Controller
{
    public function meta(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'debt_types' => ['loan', 'supplier_credit', 'overdraft', 'lease', 'other'],
            'statuses' => ['active', 'paid', 'defaulted', 'restructured', 'pending'],
            'interest_types' => ['fixed', 'variable', 'none'],
            'payment_frequencies' => ['monthly', 'quarterly', 'annually', 'one-time'],
            'payment_methods' => ['cash', 'bank_transfer', 'cheque', 'mobile_money', 'other'],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;

        $query = $this->debtListingQuery($branchId);
        $this->applyDebtFilters($query, $request);

        $total = (clone $query)->count('d.id');
        $records = $query
            ->orderByRaw("
                CASE
                    WHEN d.status = 'active' AND d.due_date < CURDATE() THEN 0
                    WHEN d.status = 'active' THEN 1
                    ELSE 2
                END
            ")
            ->orderBy('d.due_date')
            ->orderByDesc('d.id')
            ->limit($perPage)
            ->offset($offset)
            ->get($this->debtSelectColumns());

        $recentPayments = $this->recentPaymentsQuery($branchId)
            ->limit(20)
            ->get();

        $upcomingPayments = $this->debtListingQuery($branchId)
            ->where('d.status', 'active')
            ->whereBetween('d.next_payment_date', [now()->toDateString(), now()->copy()->addDays(30)->toDateString()])
            ->orderBy('d.next_payment_date')
            ->limit(8)
            ->get($this->debtSelectColumns());

        $overdueDebts = $this->debtListingQuery($branchId)
            ->where('d.status', 'active')
            ->whereDate('d.due_date', '<', now()->toDateString())
            ->orderBy('d.due_date')
            ->limit(8)
            ->get($this->debtSelectColumns());

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => [
                'search' => trim($request->string('search')->toString()),
                'status' => $request->string('status')->toString() ?: 'all',
                'type' => $request->string('type')->toString() ?: 'all',
            ],
            'stats' => $this->summaryStats($branchId),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
            'debts' => $records,
            'recent_payments' => $recentPayments,
            'upcoming_payments' => $upcomingPayments,
            'overdue_debts' => $overdueDebts,
        ]);
    }

    public function show(Request $request, int $debtId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);

        $debt = $this->debtListingQuery($branchId)
            ->where('d.id', $debtId)
            ->first($this->debtSelectColumns());

        if (! $debt) {
            return response()->json(['message' => 'Debt record not found for this branch.'], 404);
        }

        $payments = $this->paymentsForDebtQuery($branchId, $debtId)->get();
        $reminders = tap(DB::table('debt_reminders as dr'), fn ($query) => $this->applyBranchScope($query, 'dr.branch_id', $branchId))
            ->where('dr.debt_id', $debtId)
            ->orderByDesc('dr.reminder_date')
            ->get([
                'dr.id',
                'dr.reminder_date',
                'dr.reminder_type',
                'dr.message',
                'dr.status',
                'dr.sent_via',
                'dr.sent_to',
                'dr.sent_at',
            ]);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'debt' => $debt,
            'payments' => $payments,
            'reminders' => $reminders,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'debtor_name' => ['required', 'string', 'max:255'],
            'debt_type' => ['required', 'in:loan,supplier_credit,overdraft,lease,other'],
            'category' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'principal_amount' => ['required', 'numeric', 'min:0.01'],
            'interest_rate' => ['nullable', 'numeric', 'min:0'],
            'interest_type' => ['nullable', 'in:fixed,variable,none'],
            'lender_name' => ['nullable', 'string', 'max:255'],
            'lender_contact' => ['nullable', 'string', 'max:255'],
            'lender_phone' => ['nullable', 'string', 'max:20'],
            'lender_email' => ['nullable', 'string', 'max:100'],
            'start_date' => ['required', 'date'],
            'due_date' => ['required', 'date'],
            'term_months' => ['nullable', 'integer', 'min:1'],
            'payment_frequency' => ['nullable', 'in:monthly,quarterly,annually,one-time'],
            'collateral' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        $principalAmount = (float) $validated['principal_amount'];
        $interestRate = $validated['interest_rate'] !== null ? (float) $validated['interest_rate'] : null;
        $termMonths = $validated['term_months'] ?? null;
        $interestType = $validated['interest_type'] ?? 'fixed';
        if ($interestType === 'none') {
            $interestRate = null;
        }

        $totalAmount = $principalAmount;
        if ($interestRate && $interestRate > 0 && $termMonths) {
            $interestAmount = $principalAmount * ($interestRate / 100) * ($termMonths / 12);
            $totalAmount += $interestAmount;
        }

        $monthlyPayment = $termMonths ? round($totalAmount / $termMonths, 2) : null;
        $paymentFrequency = $validated['payment_frequency'] ?? 'monthly';
        $nextPaymentDate = $this->nextPaymentDate($validated['start_date'], $paymentFrequency, $termMonths);
        $nextPaymentAmount = $nextPaymentDate ? $monthlyPayment : null;

        $debtId = DB::table('debts')->insertGetId([
            'debtor_name' => $validated['debtor_name'],
            'debt_type' => $validated['debt_type'],
            'category' => trim($validated['category']),
            'description' => $validated['description'] ?? '',
            'principal_amount' => $principalAmount,
            'interest_rate' => $interestRate,
            'interest_type' => $interestType,
            'total_amount' => round($totalAmount, 2),
            'amount_paid' => 0,
            'monthly_payment' => $monthlyPayment,
            'lender_name' => $validated['lender_name'] ?? '',
            'lender_contact' => $validated['lender_contact'] ?? '',
            'lender_phone' => $validated['lender_phone'] ?? '',
            'lender_email' => $validated['lender_email'] ?? '',
            'start_date' => $validated['start_date'],
            'due_date' => $validated['due_date'],
            'term_months' => $termMonths,
            'payment_frequency' => $paymentFrequency,
            'next_payment_date' => $nextPaymentDate,
            'next_payment_amount' => $nextPaymentAmount,
            'status' => 'active',
            'collateral' => $validated['collateral'] ?? '',
            'notes' => $validated['notes'] ?? '',
            'created_by' => $request->user()->id,
            'branch_id' => $branchId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($nextPaymentDate) {
            $this->createReminder(
                $debtId,
                $branchId,
                $nextPaymentDate,
                'payment_due',
                'Payment of ₵'.number_format((float) $nextPaymentAmount, 2).' due for '.$validated['debtor_name']
            );
        }

        return response()->json([
            'message' => 'Debt record added successfully.',
            'debt_id' => $debtId,
        ], 201);
    }

    public function update(Request $request, int $debtId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $debt = tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('id', $debtId)
            ->first();

        if (! $debt) {
            return response()->json(['message' => 'Debt record not found for this branch.'], 404);
        }

        $validated = $request->validate([
            'debtor_name' => ['required', 'string', 'max:255'],
            'debt_type' => ['required', 'in:loan,supplier_credit,overdraft,lease,other'],
            'category' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'principal_amount' => ['required', 'numeric', 'min:0.01'],
            'interest_rate' => ['nullable', 'numeric', 'min:0'],
            'interest_type' => ['nullable', 'in:fixed,variable,none'],
            'lender_name' => ['nullable', 'string', 'max:255'],
            'lender_contact' => ['nullable', 'string', 'max:255'],
            'lender_phone' => ['nullable', 'string', 'max:20'],
            'lender_email' => ['nullable', 'string', 'max:100'],
            'start_date' => ['required', 'date'],
            'due_date' => ['required', 'date'],
            'term_months' => ['nullable', 'integer', 'min:1'],
            'payment_frequency' => ['nullable', 'in:monthly,quarterly,annually,one-time'],
            'collateral' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        $principalAmount = (float) $validated['principal_amount'];
        $interestRate = $validated['interest_rate'] !== null ? (float) $validated['interest_rate'] : null;
        $termMonths = $validated['term_months'] ?? null;
        $interestType = $validated['interest_type'] ?? 'fixed';
        if ($interestType === 'none') {
            $interestRate = null;
        }

        $totalAmount = $principalAmount;
        if ($interestRate && $interestRate > 0 && $termMonths) {
            $interestAmount = $principalAmount * ($interestRate / 100) * ($termMonths / 12);
            $totalAmount += $interestAmount;
        }

        $currentAmountPaid = (float) $debt->amount_paid;
        $remainingBalance = max($totalAmount - $currentAmountPaid, 0);
        $monthlyPayment = $termMonths ? round($totalAmount / $termMonths, 2) : null;
        $paymentFrequency = $validated['payment_frequency'] ?? 'monthly';
        $nextPaymentDate = $remainingBalance <= 0.01
            ? null
            : $this->nextPaymentDate($validated['start_date'], $paymentFrequency, $termMonths);
        $nextPaymentAmount = $remainingBalance <= 0.01
            ? null
            : ($termMonths ? round($remainingBalance / max($termMonths, 1), 2) : null);
        $status = $remainingBalance <= 0.01 ? 'paid' : ($debt->status === 'paid' ? 'active' : $debt->status);

        DB::table('debts')
            ->where('id', $debtId)
            ->update([
                'debtor_name' => $validated['debtor_name'],
                'debt_type' => $validated['debt_type'],
                'category' => trim($validated['category']),
                'description' => $validated['description'] ?? '',
                'principal_amount' => $principalAmount,
                'interest_rate' => $interestRate,
                'interest_type' => $interestType,
                'total_amount' => round($totalAmount, 2),
                'monthly_payment' => $monthlyPayment,
                'lender_name' => $validated['lender_name'] ?? '',
                'lender_contact' => $validated['lender_contact'] ?? '',
                'lender_phone' => $validated['lender_phone'] ?? '',
                'lender_email' => $validated['lender_email'] ?? '',
                'start_date' => $validated['start_date'],
                'due_date' => $validated['due_date'],
                'term_months' => $termMonths,
                'payment_frequency' => $paymentFrequency,
                'next_payment_date' => $nextPaymentDate,
                'next_payment_amount' => $nextPaymentAmount,
                'status' => $status,
                'collateral' => $validated['collateral'] ?? '',
                'notes' => $validated['notes'] ?? '',
                'updated_at' => now(),
            ]);

        return response()->json([
            'message' => 'Debt record updated successfully.',
        ]);
    }

    public function storePayment(Request $request, int $debtId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'in:cash,bank_transfer,cheque,mobile_money,other'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string'],
        ]);

        $debt = tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('id', $debtId)
            ->first();

        if (! $debt) {
            return response()->json(['message' => 'Debt record not found for this branch.'], 404);
        }

        $requestedAmount = (float) $validated['amount'];
        if ($requestedAmount <= 0) {
            return response()->json(['message' => 'Payment amount must be greater than 0.'], 422);
        }

        $currentBalance = max((float) $debt->total_amount - (float) $debt->amount_paid, 0);
        $paymentAmount = min($requestedAmount, $currentBalance);
        $notes = trim((string) ($validated['notes'] ?? ''));

        if ($paymentAmount < $requestedAmount) {
            $notes = trim($notes.' Adjusted to exact balance of ₵'.number_format($currentBalance, 2));
        }

        if ($currentBalance <= 0.01) {
            return response()->json(['message' => 'This debt is already fully paid.'], 422);
        }

        $userId = $request->user()->id;

        DB::transaction(function () use ($branchId, $debt, $paymentAmount, $validated, $notes, $userId): void {
            DB::table('debt_payments')->insert([
                'debt_id' => $debt->id,
                'payment_date' => $validated['payment_date'],
                'amount' => $paymentAmount,
                'payment_method' => $validated['payment_method'],
                'reference_number' => $validated['reference_number'] ?? '',
                'notes' => $notes,
                'recorded_by' => $userId,
                'branch_id' => $branchId,
                'created_at' => now(),
            ]);

            $newAmountPaid = (float) $debt->amount_paid + $paymentAmount;
            $newBalance = max((float) $debt->total_amount - $newAmountPaid, 0);

            $updatePayload = [
                'amount_paid' => round($newAmountPaid, 2),
                'updated_at' => now(),
            ];

            if ($newBalance <= 0.01) {
                $updatePayload['status'] = 'paid';
                $updatePayload['next_payment_date'] = null;
                $updatePayload['next_payment_amount'] = null;
            } else {
                $paymentCount = (int) DB::table('debt_payments')->where('debt_id', $debt->id)->count();
                $remainingMonths = max((int) ($debt->term_months ?? 0) - $paymentCount, 0);

                if ($remainingMonths > 0) {
                    $newMonthlyPayment = round($newBalance / $remainingMonths, 2);
                    $updatePayload['monthly_payment'] = $newMonthlyPayment;

                    if ($debt->payment_frequency !== 'one-time') {
                        $nextDate = $this->nextPaymentDate(
                            $debt->next_payment_date ?: $validated['payment_date'],
                            $debt->payment_frequency,
                            $remainingMonths,
                            true
                        );
                        $updatePayload['next_payment_date'] = $nextDate;
                        $updatePayload['next_payment_amount'] = $newMonthlyPayment;

                        if ($nextDate) {
                            $this->createReminder(
                                $debt->id,
                                $branchId,
                                $nextDate,
                                'payment_due',
                                'Next payment of ₵'.number_format($newMonthlyPayment, 2).' due for '.$debt->debtor_name
                            );
                        }
                    }
                }
            }

            DB::table('debts')->where('id', $debt->id)->update($updatePayload);
        });

        return response()->json([
            'message' => 'Payment of ₵'.number_format($paymentAmount, 2).' recorded successfully.',
        ], 201);
    }

    public function updateStatus(Request $request, int $debtId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'status' => ['required', 'in:active,paid,defaulted,restructured,pending'],
        ]);

        $updated = tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('id', $debtId)
            ->update([
                'status' => $validated['status'],
                'updated_at' => now(),
            ]);

        if (! $updated) {
            return response()->json(['message' => 'Debt record not found for this branch.'], 404);
        }

        return response()->json([
            'message' => 'Debt status updated successfully.',
        ]);
    }

    public function restructure(Request $request, int $debtId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'new_term_months' => ['required', 'integer', 'min:1'],
            'new_interest_rate' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);

        $debt = tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('id', $debtId)
            ->first();

        if (! $debt) {
            return response()->json(['message' => 'Debt record not found for this branch.'], 404);
        }

        $remainingBalance = max((float) $debt->total_amount - (float) $debt->amount_paid, 0);
        $newTermMonths = (int) $validated['new_term_months'];
        $newMonthlyPayment = round($remainingBalance / $newTermMonths, 2);
        $newInterestRate = $validated['new_interest_rate'] !== null ? (float) $validated['new_interest_rate'] : null;
        $newDueDate = now()->copy()->addMonths($newTermMonths)->toDateString();
        $newTotalAmount = (float) $debt->total_amount;

        if ($newInterestRate !== null && (float) $debt->interest_rate !== $newInterestRate) {
            $newInterestAmount = (float) $debt->principal_amount * ($newInterestRate / 100) * ($newTermMonths / 12);
            $newTotalAmount = (float) $debt->principal_amount + $newInterestAmount;
        }

        $nextPaymentDate = now()->copy()->addMonth()->toDateString();
        $restructureNote = now()->toDateString().' - Restructured: New term: '.$newTermMonths.' months, New monthly payment: ₵'.number_format($newMonthlyPayment, 2).'. '.trim((string) ($validated['notes'] ?? ''));

        DB::transaction(function () use ($branchId, $debtId, $debt, $newDueDate, $newTotalAmount, $newInterestRate, $newTermMonths, $newMonthlyPayment, $nextPaymentDate, $restructureNote): void {
            DB::table('debts')
                ->where('id', $debtId)
                ->update([
                    'due_date' => $newDueDate,
                    'total_amount' => round($newTotalAmount, 2),
                    'interest_rate' => $newInterestRate ?? $debt->interest_rate,
                    'term_months' => $newTermMonths,
                    'monthly_payment' => $newMonthlyPayment,
                    'next_payment_date' => $nextPaymentDate,
                    'next_payment_amount' => $newMonthlyPayment,
                    'status' => 'restructured',
                    'notes' => trim((string) $debt->notes."\n[RESTRUCTURED: ".$restructureNote.']'),
                    'updated_at' => now(),
                ]);

            $this->createReminder(
                $debtId,
                $branchId,
                $nextPaymentDate,
                'review',
                'First payment after restructuring: ₵'.number_format($newMonthlyPayment, 2)
            );
        });

        return response()->json([
            'message' => 'Debt restructured successfully. New monthly payment: ₵'.number_format($newMonthlyPayment, 2),
        ]);
    }

    public function payments(Request $request, int $debtId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);

        $debt = tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('id', $debtId)
            ->first();

        if (! $debt) {
            return response()->json(['message' => 'Debt record not found for this branch.'], 404);
        }

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'payments' => $this->paymentsForDebtQuery($branchId, $debtId)->get(),
        ]);
    }

    private function debtListingQuery(int $branchId)
    {
        $paymentCountSubquery = DB::table('debt_payments')
            ->select('debt_id', DB::raw('COUNT(*) as payment_count'))
            ->groupBy('debt_id');

        $query = DB::table('debts as d')
            ->leftJoinSub($paymentCountSubquery, 'payment_counts', function ($join): void {
                $join->on('payment_counts.debt_id', '=', 'd.id');
            });

        $this->applyBranchScope($query, 'd.branch_id', $branchId);

        return $query;
    }

    private function debtSelectColumns(): array
    {
        return [
            'd.id',
            'd.debtor_name',
            'd.debt_type',
            'd.category',
            'd.description',
            'd.principal_amount',
            'd.interest_rate',
            'd.interest_type',
            'd.total_amount',
            'd.amount_paid',
            'd.monthly_payment',
            'd.lender_name',
            'd.lender_contact',
            'd.lender_phone',
            'd.lender_email',
            'd.start_date',
            'd.due_date',
            'd.term_months',
            'd.payment_frequency',
            'd.next_payment_date',
            'd.next_payment_amount',
            'd.status',
            'd.collateral',
            'd.notes',
            'd.created_by',
            'd.created_at',
            'd.updated_at',
            'd.branch_id',
            DB::raw('COALESCE(payment_counts.payment_count, 0) as payment_count'),
            DB::raw('GREATEST(d.total_amount - d.amount_paid, 0) as balance'),
        ];
    }

    private function recentPaymentsQuery(int $branchId)
    {
        $query = DB::table('debt_payments as p')
            ->join('debts as d', 'p.debt_id', '=', 'd.id')
            ->orderByDesc('p.payment_date')
            ->orderByDesc('p.id');

        $this->applyBranchScope($query, 'p.branch_id', $branchId);

        return $query->select([
            'p.id',
            'p.debt_id',
            'p.payment_date',
            'p.amount',
            'p.payment_method',
            'p.reference_number',
            'p.notes',
            'd.debtor_name',
            'd.category',
            'd.lender_name',
        ]);
    }

    private function paymentsForDebtQuery(int $branchId, int $debtId)
    {
        $query = DB::table('debt_payments as p')
            ->where('p.debt_id', $debtId)
            ->orderByDesc('p.payment_date')
            ->orderByDesc('p.id');

        $this->applyBranchScope($query, 'p.branch_id', $branchId);

        return $query->select([
            'p.id',
            'p.debt_id',
            'p.payment_date',
            'p.amount',
            'p.payment_method',
            'p.reference_number',
            'p.notes',
            'p.recorded_by',
            'p.created_at',
        ]);
    }

    private function summaryStats(int $branchId): array
    {
        $debts = tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->get();
        $overdueCount = (int) tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('status', 'active')
            ->whereDate('due_date', '<', now()->toDateString())
            ->count();
        $nextThirtyDays = (float) tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('status', 'active')
            ->whereBetween('next_payment_date', [now()->toDateString(), now()->copy()->addDays(30)->toDateString()])
            ->sum('next_payment_amount');

        $summary = [
            'total_debts' => 0,
            'total_principal' => 0,
            'total_balance' => 0,
            'active_count' => 0,
            'overdue_count' => $overdueCount,
            'paid_count' => 0,
            'total_monthly_payment' => 0,
            'next_30_days' => $nextThirtyDays,
        ];

        foreach ($debts as $debt) {
            $balance = max((float) $debt->total_amount - (float) $debt->amount_paid, 0);
            $summary['total_debts']++;
            $summary['total_principal'] += (float) $debt->principal_amount;
            $summary['total_balance'] += $balance;

            if ($debt->status === 'active') {
                $summary['active_count']++;
                if ($debt->monthly_payment) {
                    $summary['total_monthly_payment'] += (float) $debt->monthly_payment;
                }
            } elseif ($debt->status === 'paid') {
                $summary['paid_count']++;
            }
        }

        return $summary;
    }

    private function applyDebtFilters($query, Request $request): void
    {
        $search = trim($request->string('search')->toString());
        $status = $request->string('status')->toString();
        $type = $request->string('type')->toString();

        if ($status !== '' && $status !== 'all') {
            $query->where('d.status', $status);
        }

        if ($type !== '' && $type !== 'all') {
            $query->where('d.debt_type', $type);
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('d.debtor_name', 'like', $like)
                    ->orWhere('d.category', 'like', $like)
                    ->orWhere('d.lender_name', 'like', $like)
                    ->orWhere('d.lender_contact', 'like', $like)
                    ->orWhere('d.lender_phone', 'like', $like)
                    ->orWhere('d.description', 'like', $like);
            });
        }
    }

    private function nextPaymentDate(string $baseDate, string $paymentFrequency, ?int $termMonths, bool $isRolling = false): ?string
    {
        if ($paymentFrequency === 'one-time' || ! $termMonths) {
            return null;
        }

        $date = Carbon::parse($baseDate);

        if ($paymentFrequency === 'quarterly') {
            return $date->addMonths($isRolling ? 3 : 3)->toDateString();
        }

        if ($paymentFrequency === 'annually') {
            return $date->addYear()->toDateString();
        }

        return $date->addMonth()->toDateString();
    }

    private function createReminder(int $debtId, int $branchId, string $reminderDate, string $type, string $message): void
    {
        DB::table('debt_reminders')->insert([
            'debt_id' => $debtId,
            'reminder_date' => $reminderDate,
            'reminder_type' => $type,
            'message' => $message,
            'status' => 'pending',
            'branch_id' => $branchId,
            'created_at' => now(),
        ]);
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();

        if (! $user->isAdmin()) {
            return (int) $user->branch_id;
        }

        $requestedBranchId = (int) $request->integer('branch_id');

        return $requestedBranchId >= 0 ? $requestedBranchId : 1;
    }

    private function branchName(int $branchId): string
    {
        return match ($branchId) {
            0 => 'Merged Branches',
            1 => 'Labadi',
            2 => 'Madina',
            default => 'Unknown',
        };
    }

    private function applyBranchScope($query, string $column, int $branchId): void
    {
        if ($branchId > 0) {
            $query->where($column, $branchId);
        }
    }

    private function ensureWritableBranch(int $branchId): ?JsonResponse
    {
        if ($branchId !== 0) {
            return null;
        }

        return response()->json([
            'message' => 'Merged mode is read-only. Switch to a branch before recording or updating debt records.',
        ], 422);
    }
}
