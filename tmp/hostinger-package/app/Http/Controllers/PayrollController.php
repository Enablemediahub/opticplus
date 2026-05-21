<?php

namespace App\Http\Controllers;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PayrollController extends Controller
{
    public function meta(Request $request): JsonResponse
    {
        $this->ensurePayrollTables();

        $branchId = $this->resolveBranchId($request);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'payment_methods' => ['bank_transfer', 'cash', 'mobile_money', 'cheque'],
            'months' => collect(range(1, 12))->map(fn (int $month) => [
                'value' => $month,
                'label' => now()->setMonth($month)->format('F'),
            ])->values(),
            'years' => collect(range((int) now()->year - 2, (int) now()->year + 1))->values(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->ensurePayrollTables();

        $branchId = $this->resolveBranchId($request);
        $month = max(1, min(12, (int) $request->integer('month', now()->month)));
        $year = max(2020, (int) $request->integer('year', now()->year));
        $search = trim($request->string('search')->toString());
        $status = trim($request->string('status')->toString() ?: 'all');

        $employees = $this->employeePayrollRows($branchId, $month, $year, $search, $status);
        $history = $this->historyRows($branchId, $month, $year);
        $advances = $this->advanceRows($branchId, $month, $year);
        $bankBalance = $this->currentBankBalance($branchId);

        $totalGross = collect($employees)->where('is_paid', false)->sum('salary');
        $totalAdvances = collect($employees)->where('is_paid', false)->sum('pending_advances');
        $totalNet = collect($employees)->where('is_paid', false)->sum('net_payable');

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'month' => $month,
            'year' => $year,
            'stats' => [
                'bank_balance' => round($bankBalance, 2),
                'expected_gross' => round($totalGross, 2),
                'expected_advances' => round($totalAdvances, 2),
                'expected_net' => round($totalNet, 2),
                'employee_count' => count($employees),
                'processed_count' => count(array_filter($employees, fn (array $row) => $row['is_paid'])),
                'pending_advance_count' => count(array_filter($advances, fn (array $row) => $row['status'] === 'pending')),
            ],
            'employees' => $employees,
            'history' => $history,
            'advances' => $advances,
            'filters' => [
                'search' => $search,
                'status' => $status,
            ],
        ]);
    }

    public function storeAdvance(Request $request): JsonResponse
    {
        $this->ensurePayrollTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'employee_id' => ['required', 'integer'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'advance_date' => ['required', 'date'],
            'deduction_month' => ['required', 'integer', 'min:1', 'max:12'],
            'deduction_year' => ['required', 'integer', 'min:2020'],
            'notes' => ['nullable', 'string'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'override_balance' => ['nullable', 'boolean'],
        ]);

        $employee = $this->employeeRecord($branchId, (int) $validated['employee_id']);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found or inactive for this branch.'], 404);
        }

        $amount = (float) $validated['amount'];
        $currentBalance = $this->currentBankBalance($branchId);
        $pendingAdvances = (float) $this->advanceQuery($branchId)
            ->where('sa.employee_id', $employee->id)
            ->where('sa.status', 'pending')
            ->sum('sa.amount');

        if (($pendingAdvances + $amount) > ((float) $employee->salary * 0.5)) {
            return response()->json(['message' => 'Advance amount exceeds 50% of monthly salary limit.'], 422);
        }

        $overrideBalance = (bool) ($validated['override_balance'] ?? false);
        if (! $overrideBalance && $currentBalance < $amount) {
            return response()->json([
                'message' => 'Insufficient bank balance for this salary advance.',
            ], 422);
        }

        DB::transaction(function () use ($validated, $branchId, $employee, $amount, $currentBalance, $overrideBalance): void {
            DB::table('salary_advances')->insert([
                'branch_id' => $branchId,
                'employee_id' => $employee->id,
                'employee_name' => $employee->ghana_card_name,
                'amount' => $amount,
                'advance_date' => $validated['advance_date'],
                'deduction_month' => (int) $validated['deduction_month'],
                'deduction_year' => (int) $validated['deduction_year'],
                'notes' => $validated['notes'] ?? '',
                'status' => 'pending',
                'payment_method' => $validated['payment_method'] ?? 'cash',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if (! $overrideBalance) {
                $this->setBankBalance($branchId, $currentBalance - $amount);
                DB::table('bank_deposits')->insert([
                    'branch_id' => $branchId,
                    'amount' => -$amount,
                    'date' => now()->toDateString(),
                    'description' => 'Salary advance to '.$employee->ghana_card_name,
                    'type' => 'withdrawal',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('expenses')->insert([
                'branch_id' => $branchId,
                'description' => 'Salary Advance - '.$employee->ghana_card_name,
                'amount' => $amount,
                'date' => $validated['advance_date'],
                'category' => 'Salary Advances',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return response()->json([
            'message' => 'Salary advance recorded successfully.',
        ], 201);
    }

    public function processPayroll(Request $request): JsonResponse
    {
        $this->ensurePayrollTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'employee_id' => ['required', 'integer'],
            'pay_month' => ['required', 'integer', 'min:1', 'max:12'],
            'pay_year' => ['required', 'integer', 'min:2020'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string'],
            'declared_salary' => ['nullable', 'numeric', 'min:0'],
            'allowance_amount' => ['nullable', 'numeric', 'min:0'],
            'pay_declared_salary' => ['nullable', 'boolean'],
            'pay_allowance' => ['nullable', 'boolean'],
            'override_balance' => ['nullable', 'boolean'],
        ]);

        $employee = $this->employeeRecord($branchId, (int) $validated['employee_id']);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found or inactive for this branch.'], 404);
        }

        $existingPayroll = $this->payrollRecord($branchId, $employee->id, (int) $validated['pay_month'], (int) $validated['pay_year']);
        $advanceDeduction = $this->pendingAdvanceAmount($branchId, $employee->id, (int) $validated['pay_month'], (int) $validated['pay_year']);
        $grossSalary = (float) ($employee->salary ?? 0);
        [$declaredSalary, $allowanceAmount] = $this->resolvePayrollSplit(
            $grossSalary,
            $validated['declared_salary'] ?? $existingPayroll?->declared_salary,
            $validated['allowance_amount'] ?? $existingPayroll?->allowance_amount,
        );
        [$declaredDue, $allowanceDue] = $this->allocatePayrollSplitAfterDeduction($declaredSalary, $allowanceAmount, $advanceDeduction);
        $existingDeclaredPaid = round((float) ($existingPayroll?->declared_paid ?? 0), 2);
        $existingAllowancePaid = round((float) ($existingPayroll?->allowance_paid ?? 0), 2);
        $remainingDeclared = round(max($declaredDue - $existingDeclaredPaid, 0), 2);
        $remainingAllowance = round(max($allowanceDue - $existingAllowancePaid, 0), 2);
        $payDeclared = (bool) ($validated['pay_declared_salary'] ?? true);
        $payAllowance = (bool) ($validated['pay_allowance'] ?? true);

        if ($remainingDeclared <= 0) {
            $payDeclared = false;
        }

        if ($remainingAllowance <= 0) {
            $payAllowance = false;
        }

        if (! $payDeclared && ! $payAllowance) {
            return response()->json(['message' => 'Select salary, allowance, or both before processing payroll.'], 422);
        }

        $declaredPayment = $payDeclared ? $remainingDeclared : 0.0;
        $allowancePayment = $payAllowance ? $remainingAllowance : 0.0;
        $paymentAmount = round($declaredPayment + $allowancePayment, 2);

        if ($paymentAmount <= 0) {
            return response()->json(['message' => 'There is no remaining salary or allowance left to process for this employee.'], 422);
        }

        $currentBalance = $this->currentBankBalance($branchId);
        $overrideBalance = (bool) ($validated['override_balance'] ?? false);

        if (! $overrideBalance && $currentBalance < $paymentAmount) {
            return response()->json(['message' => 'Insufficient bank balance for payroll processing.'], 422);
        }

        $paymentLabel = $this->describePayrollPayment($payDeclared, $payAllowance);
        $updatedDeclaredPaid = round($existingDeclaredPaid + $declaredPayment, 2);
        $updatedAllowancePaid = round($existingAllowancePaid + $allowancePayment, 2);
        $netSalary = round($declaredDue + $allowanceDue, 2);

        DB::transaction(function () use ($validated, $branchId, $employee, $grossSalary, $declaredSalary, $allowanceAmount, $updatedDeclaredPaid, $updatedAllowancePaid, $advanceDeduction, $netSalary, $paymentAmount, $paymentLabel, $currentBalance, $overrideBalance, $existingPayroll): void {
            if ($existingPayroll) {
                DB::table('payroll_history')
                    ->where('id', $existingPayroll->id)
                    ->update([
                        'employee_name' => $employee->ghana_card_name,
                        'gross_salary' => $grossSalary,
                        'declared_salary' => $declaredSalary,
                        'allowance_amount' => $allowanceAmount,
                        'declared_paid' => $updatedDeclaredPaid,
                        'allowance_paid' => $updatedAllowancePaid,
                        'advance_deduction' => $advanceDeduction,
                        'net_salary' => $netSalary,
                        'payment_date' => now(),
                        'notes' => $validated['notes'] ?? $existingPayroll->notes ?? '',
                        'payment_method' => $validated['payment_method'] ?? 'bank_transfer',
                        'updated_at' => now(),
                    ]);
            } else {
                DB::table('payroll_history')->insert([
                    'branch_id' => $branchId,
                    'employee_id' => $employee->id,
                    'employee_name' => $employee->ghana_card_name,
                    'gross_salary' => $grossSalary,
                    'declared_salary' => $declaredSalary,
                    'allowance_amount' => $allowanceAmount,
                    'declared_paid' => $updatedDeclaredPaid,
                    'allowance_paid' => $updatedAllowancePaid,
                    'advance_deduction' => $advanceDeduction,
                    'net_salary' => $netSalary,
                    'pay_month' => (int) $validated['pay_month'],
                    'pay_year' => (int) $validated['pay_year'],
                    'payment_date' => now(),
                    'notes' => $validated['notes'] ?? '',
                    'payment_method' => $validated['payment_method'] ?? 'bank_transfer',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            if (! $existingPayroll && $advanceDeduction > 0) {
                DB::table('salary_advances')
                    ->where('branch_id', $branchId)
                    ->where('employee_id', $employee->id)
                    ->where('status', 'pending')
                    ->where('deduction_month', (int) $validated['pay_month'])
                    ->where('deduction_year', (int) $validated['pay_year'])
                    ->update([
                        'status' => 'deducted',
                        'updated_at' => now(),
                    ]);
            }

            if (! $overrideBalance) {
                $this->setBankBalance($branchId, $currentBalance - $paymentAmount);
                DB::table('bank_deposits')->insert([
                    'branch_id' => $branchId,
                    'amount' => -$paymentAmount,
                    'date' => now()->toDateString(),
                    'description' => $paymentLabel.' payment to '.$employee->ghana_card_name.' for '.$this->monthLabel((int) $validated['pay_month'], (int) $validated['pay_year']),
                    'type' => 'withdrawal',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('expenses')->insert([
                'branch_id' => $branchId,
                'description' => $paymentLabel.' Payment - '.$employee->ghana_card_name.' for '.$this->monthLabel((int) $validated['pay_month'], (int) $validated['pay_year']),
                'amount' => $paymentAmount,
                'date' => now()->toDateString(),
                'category' => 'Payroll',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return response()->json([
            'message' => $paymentLabel.' processed successfully.',
        ], 201);
    }

    public function processBulk(Request $request): JsonResponse
    {
        $this->ensurePayrollTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'pay_month' => ['required', 'integer', 'min:1', 'max:12'],
            'pay_year' => ['required', 'integer', 'min:2020'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'declarations' => ['nullable', 'array'],
            'override_balance' => ['nullable', 'boolean'],
        ]);

        $month = (int) $validated['pay_month'];
        $year = (int) $validated['pay_year'];
        $employees = collect($this->employeePayrollRows($branchId, $month, $year, '', 'unpaid'));
        $totalPayroll = (float) $employees->sum('net_payable');
        $currentBalance = $this->currentBankBalance($branchId);
        $overrideBalance = (bool) ($validated['override_balance'] ?? false);

        if ($employees->isEmpty()) {
            return response()->json(['message' => 'No unpaid payroll records were found for the selected month.'], 422);
        }

        if (! $overrideBalance && $currentBalance < $totalPayroll) {
            return response()->json(['message' => 'Insufficient bank balance for bulk payroll.'], 422);
        }

        DB::transaction(function () use ($employees, $validated, $branchId, $month, $year, $totalPayroll, $currentBalance, $overrideBalance): void {
            foreach ($employees as $employee) {
                $declaration = $validated['declarations'][$employee['id']] ?? $validated['declarations'][(string) $employee['id']] ?? [];
                [$declaredSalary, $allowanceAmount] = $this->resolvePayrollSplit(
                    (float) $employee['salary'],
                    $declaration['declared_salary'] ?? null,
                    $declaration['allowance_amount'] ?? null,
                );
                [$declaredPaid, $allowancePaid] = $this->allocatePayrollSplitAfterDeduction($declaredSalary, $allowanceAmount, (float) $employee['pending_advances']);

                DB::table('payroll_history')->insert([
                    'branch_id' => $branchId,
                    'employee_id' => $employee['id'],
                    'employee_name' => $employee['name'],
                    'gross_salary' => $employee['salary'],
                    'declared_salary' => $declaredSalary,
                    'allowance_amount' => $allowanceAmount,
                    'declared_paid' => $declaredPaid,
                    'allowance_paid' => $allowancePaid,
                    'advance_deduction' => $employee['pending_advances'],
                    'net_salary' => $employee['net_payable'],
                    'pay_month' => $month,
                    'pay_year' => $year,
                    'payment_date' => now(),
                    'notes' => trim(($declaration['notes'] ?? '').' Bulk payroll processing'),
                    'payment_method' => $validated['payment_method'] ?? 'bank_transfer',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                if ($employee['pending_advances'] > 0) {
                    DB::table('salary_advances')
                        ->where('branch_id', $branchId)
                        ->where('employee_id', $employee['id'])
                        ->where('status', 'pending')
                        ->where('deduction_month', $month)
                        ->where('deduction_year', $year)
                        ->update([
                            'status' => 'deducted',
                            'updated_at' => now(),
                        ]);
                }
            }

            if (! $overrideBalance) {
                $this->setBankBalance($branchId, $currentBalance - $totalPayroll);
                DB::table('bank_deposits')->insert([
                    'branch_id' => $branchId,
                    'amount' => -$totalPayroll,
                    'date' => now()->toDateString(),
                    'description' => 'Bulk payroll for '.$this->monthLabel($month, $year).' ('.$employees->count().' employees)',
                    'type' => 'withdrawal',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('expenses')->insert([
                'branch_id' => $branchId,
                'description' => 'Bulk Payroll Processing - '.$this->monthLabel($month, $year),
                'amount' => $totalPayroll,
                'date' => now()->toDateString(),
                'category' => 'Payroll',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return response()->json([
            'message' => 'Bulk payroll processed successfully.',
        ], 201);
    }

    public function bankRegister(Request $request): JsonResponse
    {
        $this->ensurePayrollTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureBankRegisterAccess($request)) {
            return $response;
        }

        $rows = DB::table('bank_deposits')
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->limit(120)
            ->get();

        $monthStart = now()->startOfMonth()->toDateString();
        $today = now()->toDateString();
        $monthlyRows = DB::table('bank_deposits')
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->whereBetween('date', [$monthStart, $today])
            ->get();

        $currentBalance = $this->currentBankBalance($branchId);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'payment_methods' => ['bank_transfer', 'cash', 'mobile_money', 'cheque'],
            'current_balance' => round($currentBalance, 2),
            'stats' => [
                'month_deposits' => round((float) $monthlyRows->where('type', 'deposit')->sum('amount'), 2),
                'month_withdrawals' => round(abs((float) $monthlyRows->where('type', 'withdrawal')->sum('amount')), 2),
                'month_adjustments' => round((float) $monthlyRows->where('type', 'adjustment')->sum('amount'), 2),
                'activity_count' => $rows->count(),
            ],
            'activities' => $rows->map(fn ($row) => [
                'id' => (int) $row->id,
                'amount' => (float) $row->amount,
                'date' => $row->date,
                'description' => $row->description,
                'type' => $row->type ?: 'deposit',
                'payment_method' => $row->payment_method ?: 'bank_transfer',
                'created_at' => $row->created_at,
            ])->values(),
        ]);
    }

    public function storeBankDeposit(Request $request): JsonResponse
    {
        $this->ensurePayrollTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        if ($response = $this->ensureBankRegisterAccess($request)) {
            return $response;
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'date' => ['required', 'date'],
            'description' => ['required', 'string', 'max:255'],
            'payment_method' => ['nullable', 'string', 'max:50'],
        ]);

        $amount = round((float) $validated['amount'], 2);
        $currentBalance = $this->currentBankBalance($branchId);

        DB::transaction(function () use ($branchId, $validated, $amount, $currentBalance): void {
            DB::table('bank_deposits')->insert([
                'branch_id' => $branchId,
                'amount' => $amount,
                'date' => $validated['date'],
                'description' => $validated['description'],
                'payment_method' => $validated['payment_method'] ?? 'bank_transfer',
                'type' => 'deposit',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->setBankBalance($branchId, $currentBalance + $amount);
        });

        return response()->json([
            'message' => 'Bank deposit recorded successfully.',
        ], 201);
    }

    public function updateBankBalance(Request $request): JsonResponse
    {
        $this->ensurePayrollTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        if ($response = $this->ensureBankRegisterAccess($request)) {
            return $response;
        }

        $validated = $request->validate([
            'balance' => ['required', 'numeric', 'min:0'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $newBalance = round((float) $validated['balance'], 2);
        $currentBalance = $this->currentBankBalance($branchId);
        $difference = round($newBalance - $currentBalance, 2);

        DB::transaction(function () use ($branchId, $newBalance, $difference, $validated): void {
            $this->setBankBalance($branchId, $newBalance);

            DB::table('bank_deposits')->insert([
                'branch_id' => $branchId,
                'amount' => $difference,
                'date' => now()->toDateString(),
                'description' => trim(($validated['reason'] ?? 'Manual bank balance update').' | balance set to '.number_format($newBalance, 2)),
                'payment_method' => 'adjustment',
                'type' => 'adjustment',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return response()->json([
            'message' => 'Bank balance updated successfully.',
        ]);
    }

    private function employeePayrollRows(int $branchId, int $month, int $year, string $search, string $status): array
    {
        $query = DB::table('employees_comprehensive as ec')
            ->where('ec.status', 'active');
        $this->applyBranchScope($query, 'ec.branch_id', $branchId);

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like) {
                $inner->where('ec.ghana_card_name', 'like', $like)
                    ->orWhere('ec.staff_id', 'like', $like)
                    ->orWhere('ec.email', 'like', $like)
                    ->orWhere('ec.job_title', 'like', $like);
            });
        }

        $records = $query
            ->orderBy('ec.branch')
            ->orderBy('ec.ghana_card_name')
            ->get([
                'ec.id',
                'ec.ghana_card_name',
                'ec.staff_id',
                'ec.branch',
                'ec.branch_id',
                'ec.department',
                'ec.job_title',
                'ec.salary',
            ]);

        $rows = $records->map(function ($employee) use ($branchId, $month, $year) {
            $pendingAdvances = $this->pendingAdvanceAmount($branchId, (int) $employee->id, $month, $year);
            $salary = (float) ($employee->salary ?? 0);
            $latestPayroll = $this->latestPayrollRecord($branchId, (int) $employee->id);
            $currentPayroll = $this->payrollRecord($branchId, (int) $employee->id, $month, $year);
            $declaredSalary = round((float) ($currentPayroll?->declared_salary ?? $latestPayroll?->declared_salary ?? $salary), 2);
            $allowanceAmount = round((float) ($currentPayroll?->allowance_amount ?? $latestPayroll?->allowance_amount ?? 0), 2);
            $declaredPaid = round((float) ($currentPayroll?->declared_paid ?? 0), 2);
            $allowancePaid = round((float) ($currentPayroll?->allowance_paid ?? 0), 2);
            $netPayable = round(max($salary - $pendingAdvances, 0), 2);
            $isPaid = round($declaredPaid + $allowancePaid, 2) >= $netPayable && $netPayable > 0;
            $isPartial = ! $isPaid && round($declaredPaid + $allowancePaid, 2) > 0;

            return [
                'id' => (int) $employee->id,
                'name' => $employee->ghana_card_name,
                'staff_id' => $employee->staff_id,
                'branch' => $employee->branch,
                'branch_id' => (int) $employee->branch_id,
                'department' => $employee->department,
                'job_title' => $employee->job_title,
                'salary' => round($salary, 2),
                'declared_salary' => $declaredSalary,
                'allowance_amount' => $allowanceAmount,
                'declared_paid' => $declaredPaid,
                'allowance_paid' => $allowancePaid,
                'pending_advances' => round($pendingAdvances, 2),
                'net_payable' => $netPayable,
                'is_paid' => $isPaid,
                'is_partial' => $isPartial,
            ];
        })->values();

        if ($status === 'paid') {
            return $rows->where('is_paid', true)->values()->all();
        }

        if ($status === 'unpaid') {
            return $rows->where('is_paid', false)->values()->all();
        }

        return $rows->all();
    }

    private function historyRows(int $branchId, int $month, int $year): array
    {
        return $this->historyQuery($branchId)
            ->where('ph.pay_month', $month)
            ->where('ph.pay_year', $year)
            ->orderBy('ec.branch')
            ->orderBy('ec.ghana_card_name')
            ->get([
                'ph.id',
                'ph.employee_id',
                'ph.employee_name',
                'ph.gross_salary',
                'ph.declared_salary',
                'ph.allowance_amount',
                'ph.declared_paid',
                'ph.allowance_paid',
                'ph.advance_deduction',
                'ph.net_salary',
                'ph.pay_month',
                'ph.pay_year',
                'ph.payment_date',
                'ph.notes',
                'ph.payment_method',
                'ec.ghana_card_name',
                'ec.staff_id',
                'ec.branch',
            ])
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'employee_id' => (int) $row->employee_id,
                'employee_name' => $row->ghana_card_name ?: $row->employee_name,
                'staff_id' => $row->staff_id,
                'branch' => $row->branch,
                'gross_salary' => (float) $row->gross_salary,
                'declared_salary' => (float) ($row->declared_salary ?? $row->gross_salary),
                'allowance_amount' => (float) ($row->allowance_amount ?? 0),
                'declared_paid' => (float) ($row->declared_paid ?? $row->declared_salary ?? $row->gross_salary),
                'allowance_paid' => (float) ($row->allowance_paid ?? $row->allowance_amount ?? 0),
                'advance_deduction' => (float) $row->advance_deduction,
                'net_salary' => (float) $row->net_salary,
                'is_fully_paid' => round((float) ($row->declared_paid ?? 0) + (float) ($row->allowance_paid ?? 0), 2) >= round((float) $row->net_salary, 2),
                'payment_date' => $row->payment_date,
                'notes' => $row->notes,
                'payment_method' => $row->payment_method ?: 'bank_transfer',
            ])->all();
    }

    private function advanceRows(int $branchId, int $month, int $year): array
    {
        return $this->advanceQuery($branchId)
            ->where('sa.deduction_month', $month)
            ->where('sa.deduction_year', $year)
            ->orderByDesc('sa.advance_date')
            ->get([
                'sa.id',
                'sa.employee_id',
                'sa.employee_name',
                'sa.amount',
                'sa.advance_date',
                'sa.deduction_month',
                'sa.deduction_year',
                'sa.notes',
                'sa.status',
                'sa.payment_method',
                'ec.staff_id',
                'ec.branch',
            ])
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'employee_id' => (int) $row->employee_id,
                'employee_name' => $row->employee_name,
                'staff_id' => $row->staff_id,
                'branch' => $row->branch,
                'amount' => (float) $row->amount,
                'advance_date' => $row->advance_date,
                'notes' => $row->notes,
                'status' => $row->status,
                'payment_method' => $row->payment_method ?: 'cash',
            ])->all();
    }

    private function pendingAdvanceAmount(int $branchId, int $employeeId, int $month, int $year): float
    {
        return (float) $this->advanceQuery($branchId)
            ->where('sa.employee_id', $employeeId)
            ->where('sa.status', 'pending')
            ->where('sa.deduction_month', $month)
            ->where('sa.deduction_year', $year)
            ->sum('sa.amount');
    }

    private function payrollAlreadyProcessed(int $branchId, int $employeeId, int $month, int $year): bool
    {
        return $this->historyQuery($branchId)
            ->where('ph.employee_id', $employeeId)
            ->where('ph.pay_month', $month)
            ->where('ph.pay_year', $year)
            ->whereRaw('ROUND(COALESCE(ph.declared_paid, 0) + COALESCE(ph.allowance_paid, 0), 2) >= ROUND(COALESCE(ph.net_salary, 0), 2)')
            ->exists();
    }

    private function employeeRecord(int $branchId, int $employeeId): ?object
    {
        $query = DB::table('employees_comprehensive')
            ->where('id', $employeeId)
            ->where('status', 'active');
        $this->applyBranchScope($query, 'branch_id', $branchId);

        return $query->first();
    }

    private function latestPayrollRecord(int $branchId, int $employeeId): ?object
    {
        return $this->historyQuery($branchId)
            ->where('ph.employee_id', $employeeId)
            ->orderByDesc('ph.pay_year')
            ->orderByDesc('ph.pay_month')
            ->orderByDesc('ph.id')
            ->first([
                'ph.declared_salary',
                'ph.allowance_amount',
                'ph.declared_paid',
                'ph.allowance_paid',
            ]);
    }

    private function payrollRecord(int $branchId, int $employeeId, int $month, int $year): ?object
    {
        return $this->historyQuery($branchId)
            ->where('ph.employee_id', $employeeId)
            ->where('ph.pay_month', $month)
            ->where('ph.pay_year', $year)
            ->orderByDesc('ph.id')
            ->first([
                'ph.id',
                'ph.employee_name',
                'ph.gross_salary',
                'ph.declared_salary',
                'ph.allowance_amount',
                'ph.declared_paid',
                'ph.allowance_paid',
                'ph.advance_deduction',
                'ph.net_salary',
                'ph.notes',
            ]);
    }

    private function currentBankBalance(int $branchId): float
    {
        $query = DB::table('bank_balance');
        if (Schema::hasColumn('bank_balance', 'branch_id')) {
            $this->applyBranchScope($query, 'branch_id', $branchId);
        }

        return (float) ($query->orderByDesc('id')->value('balance') ?? 0);
    }

    private function setBankBalance(int $branchId, float $balance): void
    {
        $query = DB::table('bank_balance');
        if (Schema::hasColumn('bank_balance', 'branch_id')) {
            $this->applyBranchScope($query, 'branch_id', $branchId);
        }

        $existing = $query->orderByDesc('id')->first();

        if ($existing) {
            DB::table('bank_balance')->where('id', $existing->id)->update([
                'balance' => round($balance, 2),
                'last_updated' => now(),
                'updated_at' => now(),
            ]);
            return;
        }

        DB::table('bank_balance')->insert([
            'branch_id' => $branchId,
            'balance' => round($balance, 2),
            'last_updated' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function advanceQuery(int $branchId)
    {
        $query = DB::table('salary_advances as sa')
            ->leftJoin('employees_comprehensive as ec', 'sa.employee_id', '=', 'ec.id');

        if (Schema::hasColumn('salary_advances', 'branch_id')) {
            $this->applyBranchScope($query, 'sa.branch_id', $branchId);
        } else {
            $this->applyBranchScope($query, 'ec.branch_id', $branchId);
        }

        return $query;
    }

    private function historyQuery(int $branchId)
    {
        $query = DB::table('payroll_history as ph')
            ->leftJoin('employees_comprehensive as ec', 'ph.employee_id', '=', 'ec.id');

        if (Schema::hasColumn('payroll_history', 'branch_id')) {
            $this->applyBranchScope($query, 'ph.branch_id', $branchId);
        } else {
            $this->applyBranchScope($query, 'ec.branch_id', $branchId);
        }

        return $query;
    }

    private function ensurePayrollTables(): void
    {
        if (! Schema::hasTable('payroll_history')) {
            Schema::create('payroll_history', function (Blueprint $table): void {
                $table->id();
                $table->unsignedInteger('branch_id')->default(1)->index();
                $table->unsignedBigInteger('employee_id')->index();
                $table->string('employee_name');
                $table->decimal('gross_salary', 12, 2)->default(0);
                $table->decimal('advance_deduction', 12, 2)->default(0);
                $table->decimal('net_salary', 12, 2)->default(0);
                $table->unsignedTinyInteger('pay_month');
                $table->unsignedSmallInteger('pay_year');
                $table->dateTime('payment_date')->nullable();
                $table->text('notes')->nullable();
                $table->string('payment_method', 50)->default('bank_transfer');
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('payroll_history', 'branch_id')) {
            Schema::table('payroll_history', function (Blueprint $table): void {
                $table->unsignedInteger('branch_id')->default(1)->after('id')->index();
            });
        }

        if (! Schema::hasColumn('payroll_history', 'payment_method')) {
            Schema::table('payroll_history', function (Blueprint $table): void {
                $table->string('payment_method', 50)->default('bank_transfer')->after('notes');
            });
        }

        if (! Schema::hasColumn('payroll_history', 'declared_salary')) {
            Schema::table('payroll_history', function (Blueprint $table): void {
                $table->decimal('declared_salary', 12, 2)->default(0)->after('gross_salary');
            });
        }

        if (! Schema::hasColumn('payroll_history', 'allowance_amount')) {
            Schema::table('payroll_history', function (Blueprint $table): void {
                $table->decimal('allowance_amount', 12, 2)->default(0)->after('declared_salary');
            });
        }

        if (! Schema::hasColumn('payroll_history', 'declared_paid')) {
            Schema::table('payroll_history', function (Blueprint $table): void {
                $table->decimal('declared_paid', 12, 2)->default(0)->after('allowance_amount');
            });
        }

        if (! Schema::hasColumn('payroll_history', 'allowance_paid')) {
            Schema::table('payroll_history', function (Blueprint $table): void {
                $table->decimal('allowance_paid', 12, 2)->default(0)->after('declared_paid');
            });
        }

        if (! Schema::hasTable('salary_advances')) {
            Schema::create('salary_advances', function (Blueprint $table): void {
                $table->id();
                $table->unsignedInteger('branch_id')->default(1)->index();
                $table->unsignedBigInteger('employee_id')->index();
                $table->string('employee_name');
                $table->decimal('amount', 12, 2);
                $table->date('advance_date');
                $table->unsignedTinyInteger('deduction_month');
                $table->unsignedSmallInteger('deduction_year');
                $table->text('notes')->nullable();
                $table->string('status', 30)->default('pending')->index();
                $table->string('payment_method', 50)->default('cash');
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('salary_advances', 'branch_id')) {
            Schema::table('salary_advances', function (Blueprint $table): void {
                $table->unsignedInteger('branch_id')->default(1)->after('id')->index();
            });
        }

        if (! Schema::hasColumn('salary_advances', 'payment_method')) {
            Schema::table('salary_advances', function (Blueprint $table): void {
                $table->string('payment_method', 50)->default('cash')->after('notes');
            });
        }

        if (! Schema::hasTable('bank_balance')) {
            Schema::create('bank_balance', function (Blueprint $table): void {
                $table->id();
                $table->unsignedInteger('branch_id')->default(1)->index();
                $table->decimal('balance', 12, 2)->default(0);
                $table->dateTime('last_updated')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('bank_balance', 'branch_id')) {
            Schema::table('bank_balance', function (Blueprint $table): void {
                $table->unsignedInteger('branch_id')->default(1)->after('id')->index();
            });
        }

        if (! Schema::hasTable('bank_deposits')) {
            Schema::create('bank_deposits', function (Blueprint $table): void {
                $table->id();
                $table->unsignedInteger('branch_id')->default(1)->index();
                $table->decimal('amount', 12, 2)->default(0);
                $table->date('date')->nullable();
                $table->text('description')->nullable();
                $table->enum('type', ['deposit', 'withdrawal', 'adjustment'])->default('deposit');
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('bank_deposits', 'branch_id')) {
            Schema::table('bank_deposits', function (Blueprint $table): void {
                $table->unsignedInteger('branch_id')->default(1)->after('id')->index();
            });
        }

        if (! Schema::hasColumn('bank_deposits', 'type')) {
            Schema::table('bank_deposits', function (Blueprint $table): void {
                $table->enum('type', ['deposit', 'withdrawal', 'adjustment'])->default('deposit')->after('description');
            });
        }

        if (! Schema::hasColumn('bank_deposits', 'payment_method')) {
            Schema::table('bank_deposits', function (Blueprint $table): void {
                $table->string('payment_method', 50)->default('bank_transfer')->after('description');
            });
        }
    }

    private function monthLabel(int $month, int $year): string
    {
        return now()->setYear($year)->setMonth($month)->format('F Y');
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();
        $requestedBranchId = (int) $request->integer('branch_id');

        return $user->isAdmin()
            ? (($requestedBranchId >= 0) ? $requestedBranchId : (int) ($user->branch_id ?: 1))
            : (int) $user->branch_id;
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
            'message' => 'Merged mode is read-only. Switch to a branch before processing payroll.',
        ], 422);
    }

    private function ensureBankRegisterAccess(Request $request): ?JsonResponse
    {
        $role = $request->user()?->normalized_role;

        if (in_array($role, ['manager', 'accountant'], true)) {
            return null;
        }

        return response()->json([
            'message' => 'Only the General Manager and Accountant can manage bank deposits and balance updates.',
        ], 403);
    }

    private function resolvePayrollSplit(float $grossSalary, mixed $declaredSalaryInput, mixed $allowanceInput): array
    {
        $grossSalary = round(max($grossSalary, 0), 2);
        $declaredSalary = is_numeric($declaredSalaryInput) ? (float) $declaredSalaryInput : null;
        $allowanceAmount = is_numeric($allowanceInput) ? (float) $allowanceInput : null;

        if ($declaredSalary === null && $allowanceAmount !== null) {
            $declaredSalary = $grossSalary - $allowanceAmount;
        }

        if ($declaredSalary === null) {
            $declaredSalary = $grossSalary;
        }

        $declaredSalary = round(min(max($declaredSalary, 0), $grossSalary), 2);
        $allowanceAmount = round(max($grossSalary - $declaredSalary, 0), 2);

        return [$declaredSalary, $allowanceAmount];
    }

    private function allocatePayrollSplitAfterDeduction(float $declaredSalary, float $allowanceAmount, float $advanceDeduction): array
    {
        $remainingDeduction = round(max($advanceDeduction, 0), 2);
        $declaredPaid = round(max($declaredSalary - min($declaredSalary, $remainingDeduction), 0), 2);
        $remainingDeduction = round(max($remainingDeduction - $declaredSalary, 0), 2);
        $allowancePaid = round(max($allowanceAmount - min($allowanceAmount, $remainingDeduction), 0), 2);

        return [$declaredPaid, $allowancePaid];
    }

    private function describePayrollPayment(bool $payDeclared, bool $payAllowance): string
    {
        if ($payDeclared && $payAllowance) {
            return 'Salary and allowance';
        }

        if ($payDeclared) {
            return 'Salary';
        }

        return 'Allowance';
    }
}
