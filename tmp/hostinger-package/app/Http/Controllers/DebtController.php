<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DebtController extends Controller
{
    public function meta(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'debt_types' => ['loan', 'supplier_credit', 'overdraft', 'lease', 'other'],
            'categories' => $this->debtCategories($branchId),
            'statuses' => ['active', 'paid', 'defaulted', 'restructured', 'pending'],
            'interest_types' => ['fixed', 'variable', 'none'],
            'payment_frequencies' => ['monthly', 'quarterly', 'annually', 'one-time'],
            'payment_methods' => ['cash', 'bank_transfer', 'cheque', 'mobile_money', 'other'],
        ]);
    }

    public function salesAllocation(Request $request): JsonResponse
    {
        if (! Schema::hasTable('sales_allocation_items')) {
            return response()->json(['message' => 'Sales allocation is not installed. Run the latest database migration first.'], 503);
        }
        if (! Schema::hasTable('sales_allocation_savings_entries')) {
            return response()->json(['message' => 'Savings tracking is not installed. Run the latest database migration first.'], 503);
        }

        $branchId = $this->resolveBranchId($request);
        $validated = $request->validate([
            'date_from' => ['sometimes', 'date'],
            'date_to' => ['sometimes', 'date', 'after_or_equal:date_from'],
        ]);
        $dateFrom = $validated['date_from'] ?? now()->startOfMonth()->toDateString();
        $dateTo = $validated['date_to'] ?? now()->toDateString();

        $items = tap(
            DB::table('sales_allocation_items')->where('is_active', true),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )
            ->orderBy('treatment')
            ->orderBy('name')
            ->get([
                'id',
                'branch_id',
                'name',
                'allocation_percent',
                'target_amount',
                'target_start_date',
                'target_date',
                'treatment',
                'created_at',
            ]);

        $scheduleStartDates = $items
            ->where('treatment', 'savings')
            ->pluck('target_start_date')
            ->filter()
            ->all();
        $scheduleEndDates = $items
            ->where('treatment', 'savings')
            ->pluck('target_date')
            ->filter()
            ->all();
        $financialRangeStart = min([$dateFrom, ...$scheduleStartDates]);
        $financialRangeEnd = max([$dateTo, ...$scheduleEndDates]);
        $productCostTrackingAvailable = Schema::hasTable('billing')
            && Schema::hasColumn('billing', 'lens_price')
            && Schema::hasTable('billing_frames')
            && Schema::hasColumn('billing_frames', 'frame_price')
            && Schema::hasTable('products')
            && Schema::hasColumn('products', 'cost_price')
            && Schema::hasTable('lens_costs')
            && Schema::hasColumn('lens_costs', 'cost_price');
        $dailyCollections = tap(
            DB::table('sales')
                ->whereBetween('date', [$financialRangeStart, $financialRangeEnd])
                ->whereNotNull('payment_method')
                ->whereRaw('LOWER(payment_method) NOT LIKE ?', ['%insurance%']),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )
            ->selectRaw('date, SUM(amount_paid) as collected')
            ->groupBy('date')
            ->get()
            ->keyBy('date');
        $dailyProductCosts = $this->dailyProductCostReserves($branchId, $financialRangeStart, $financialRangeEnd);
        $dailyExpenses = Schema::hasTable('expenses')
            && Schema::hasColumn('expenses', 'date')
            && Schema::hasColumn('expenses', 'category')
            && Schema::hasColumn('expenses', 'amount')
            ? tap(
                DB::table('expenses')
                    ->whereBetween('date', [$financialRangeStart, $financialRangeEnd])
                    ->whereDate('date', '<=', now()->toDateString()),
                fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
            )
                ->when(Schema::hasColumn('expenses', 'source_type'), fn ($query) => $query
                    ->where(fn ($sourceQuery) => $sourceQuery
                        ->whereNull('source_type')
                        ->orWhere('source_type', '!=', 'billing_refund')))
                ->selectRaw('date, SUM(amount) as total')
                ->groupBy('date')
                ->get()
                ->keyBy('date')
            : collect();

        $collectionQuery = tap(
            DB::table('sales')
                ->whereBetween('date', [$dateFrom, $dateTo])
                ->whereNotNull('payment_method')
                ->whereRaw('LOWER(payment_method) NOT LIKE ?', ['%insurance%']),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $grossCollections = (float) (clone $collectionQuery)->where('amount_paid', '>', 0)->sum('amount_paid');
        $refundReversals = abs((float) (clone $collectionQuery)->where('amount_paid', '<', 0)->sum('amount_paid'));
        $netCollections = $grossCollections - $refundReversals;
        $periodProductCosts = $dailyProductCosts
            ->filter(fn ($cost, $date) => $date >= $dateFrom && $date <= $dateTo);
        $knownProductCostToSetAside = round((float) $periodProductCosts->sum(
            fn ($cost) => ($cost['lens_cost'] ?? 0) + ($cost['frame_cost'] ?? 0)
        ), 2);
        $unpricedProductSales = round((float) $periodProductCosts->sum(
            fn ($cost) => ($cost['unpriced_lens_sales'] ?? 0) + ($cost['unpriced_frame_sales'] ?? 0)
        ), 2);
        $periodExpenses = round((float) $dailyExpenses
            ->filter(fn ($expense, $date) => $date >= $dateFrom && $date <= $dateTo)
            ->sum('total'), 2);
        $allocationBase = $productCostTrackingAvailable
            ? max($netCollections - $knownProductCostToSetAside - $unpricedProductSales - $periodExpenses, 0)
            : 0.0;
        $expenseContributions = Schema::hasTable('expenses')
            && Schema::hasColumn('expenses', 'category')
            && Schema::hasColumn('expenses', 'date')
            ? tap(
                DB::table('expenses')
                    ->whereDate('date', '<=', now()->toDateString())
                    ->selectRaw('LOWER(TRIM(category)) as normalized_category, date as contribution_date, SUM(amount) as daily_amount, COUNT(*) as daily_count')
                    ->groupByRaw('LOWER(TRIM(category)), date')
                    ->orderBy('date'),
                fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
            )->get()
                ->groupBy('normalized_category')
                ->map(fn ($entries) => (object) [
                    'contribution_total' => $entries->sum('daily_amount'),
                    'contribution_count' => $entries->sum('daily_count'),
                    'daily_contributions' => $entries->map(fn ($entry) => [
                        'date' => $entry->contribution_date,
                        'amount' => round((float) $entry->daily_amount, 2),
                        'entry_count' => (int) $entry->daily_count,
                    ])->values(),
                ])
            : collect();
        $recordedSavingsByDay = DB::table('sales_allocation_savings_entries')
            ->whereBetween('target_date', [$financialRangeStart, $financialRangeEnd])
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->selectRaw('allocation_item_id, target_date, SUM(amount) as saved_amount')
            ->groupBy('allocation_item_id', 'target_date')
            ->get()
            ->groupBy('allocation_item_id')
            ->map(fn ($entries) => $entries->keyBy('target_date'));
        $savingsEntryDetails = DB::table('sales_allocation_savings_entries as se')
            ->join('expenses as e', 'e.expense_id', '=', 'se.expense_id')
            ->whereBetween('se.target_date', [$financialRangeStart, $financialRangeEnd])
            ->when($branchId > 0, fn ($query) => $query->where('se.branch_id', $branchId))
            ->orderBy('se.set_aside_date')
            ->orderBy('se.id')
            ->get([
                'se.allocation_item_id',
                'se.target_date',
                'se.set_aside_date',
                'se.amount',
                'se.expense_id',
            ])
            ->groupBy('allocation_item_id')
            ->map(fn ($entries) => $entries->groupBy('target_date'));
        $savingsItems = $items->where('treatment', 'savings');
        $bankItems = $items->where('treatment', 'bank');
        $savingsAmount = round($savingsItems->sum(
            fn ($item) => $allocationBase * (float) $item->allocation_percent / 100
        ), 2);
        $bankAllocatedAmount = round($bankItems->sum(
            fn ($item) => $allocationBase * (float) $item->allocation_percent / 100
        ), 2);
        $bankTransferAmount = round(max($allocationBase - $savingsAmount, 0), 2);
        $unallocatedBankAmount = round(max($bankTransferAmount - $bankAllocatedAmount, 0), 2);
        $totalPercent = round((float) $items->sum('allocation_percent'), 2);
        $savingsPercent = (float) $savingsItems->sum('allocation_percent');

        $existingSetAsideAmount = 0.0;
        $items = $items->map(function ($item) use ($allocationBase, $dailyCollections, $dailyProductCosts, $dailyExpenses, $savingsPercent, $expenseContributions, $productCostTrackingAvailable, $recordedSavingsByDay, $savingsEntryDetails, &$existingSetAsideAmount): array {
            $periodAllocation = round($allocationBase * (float) $item->allocation_percent / 100, 2);
            $target = $item->target_amount !== null ? (float) $item->target_amount : null;
            $normalizedCategory = mb_strtolower(trim((string) $item->name));
            $contribution = $expenseContributions->get($normalizedCategory);
            $existingSetAside = $item->treatment === 'savings'
                ? round((float) ($contribution->contribution_total ?? 0), 2)
                : 0.0;
            $existingSetAsideAmount += $existingSetAside;
            $projectedTotal = $existingSetAside;
            $targetStartDate = $item->target_start_date;
            $targetDate = $item->target_date;
            $remainingToTarget = $target !== null ? round(max($target - $existingSetAside, 0), 2) : null;
            $today = now()->startOfDay();
            $planStart = $targetStartDate !== null
                ? Carbon::parse($targetStartDate)->startOfDay()
                : $today->copy();
            $scheduleStart = $planStart->copy()->max($today);
            $targetDeadline = $targetDate !== null
                ? Carbon::parse($targetDate)->startOfDay()
                : null;
            $scheduleEnd = $targetDeadline?->copy()->subDay();
            $workingDates = [];
            $allWorkingDates = [];
            if ($item->treatment === 'savings' && $remainingToTarget > 0 && $scheduleEnd && ! $planStart->isAfter($scheduleEnd)) {
                for ($date = $planStart->copy(); ! $date->isAfter($scheduleEnd); $date->addDay()) {
                    if ($date->dayOfWeek !== Carbon::SUNDAY) {
                        $allWorkingDates[] = $date->toDateString();
                        if (! $date->isBefore($scheduleStart)) {
                            $workingDates[] = $date->toDateString();
                        }
                    }
                }
            }
            $workingDaysRemaining = count($workingDates);
            $requiredDailySavings = $workingDaysRemaining > 0
                ? ceil(($remainingToTarget / $workingDaysRemaining) * 100) / 100
                : null;
            $targetDeadlinePassed = $targetDeadline !== null && $targetDeadline->isBefore($today);
            $dailySchedule = collect($allWorkingDates)->map(function (string $date) use ($item, $dailyCollections, $dailyProductCosts, $dailyExpenses, $savingsPercent, $requiredDailySavings, $productCostTrackingAvailable, $recordedSavingsByDay, $savingsEntryDetails, $today): array {
                $costs = $dailyProductCosts->get($date, []);
                $collected = round((float) ($dailyCollections->get($date)->collected ?? 0), 2);
                $lensCost = round((float) ($costs['lens_cost'] ?? 0), 2);
                $frameCost = round((float) ($costs['frame_cost'] ?? 0), 2);
                $unpricedSales = round((float) ($costs['unpriced_lens_sales'] ?? 0) + (float) ($costs['unpriced_frame_sales'] ?? 0), 2);
                $dailyExpenseAmount = round((float) ($dailyExpenses->get($date)->total ?? 0), 2);
                $salesRecorded = $date <= now()->toDateString();
                $availableAfterCosts = $productCostTrackingAvailable && $salesRecorded
                    ? round(max($collected - $lensCost - $frameCost - $unpricedSales, 0), 2)
                    : null;
                $availableForAllocations = $availableAfterCosts !== null
                    ? round(max($availableAfterCosts - $dailyExpenseAmount, 0), 2)
                    : null;
                $estimatedBankDeposit = $availableForAllocations !== null
                    ? round(max($availableForAllocations * (1 - $savingsPercent / 100), 0), 2)
                    : null;
                $savedEntry = $recordedSavingsByDay->get((int) $item->id)?->get($date);
                $saved = round((float) ($savedEntry->saved_amount ?? 0), 2);
                $remainingForDay = round(max((float) $requiredDailySavings - $saved, 0), 2);
                $isDue = Carbon::parse($date)->startOfDay()->lessThanOrEqualTo($today);
                $arrears = $isDue ? $remainingForDay : 0.0;
                $entryDetails = ($savingsEntryDetails->get((int) $item->id)?->get($date) ?? collect())
                    ->map(fn ($entry) => [
                        'set_aside_date' => $entry->set_aside_date,
                        'amount' => round((float) $entry->amount, 2),
                        'expense_id' => (int) $entry->expense_id,
                    ])
                    ->values();

                return [
                    'date' => $date,
                    'eligible_collections' => $collected,
                    'lens_cost_to_set_aside' => $lensCost,
                    'frame_cost_to_set_aside' => $frameCost,
                    'known_costs_to_set_aside' => round($lensCost + $frameCost, 2),
                    'recorded_expenses' => $dailyExpenseAmount,
                    'unpriced_lens_sales' => round((float) ($costs['unpriced_lens_sales'] ?? 0), 2),
                    'unpriced_frame_sales' => round((float) ($costs['unpriced_frame_sales'] ?? 0), 2),
                    'missing_lens_cost_count' => (int) ($costs['missing_lens_cost_count'] ?? 0),
                    'missing_frame_cost_count' => (int) ($costs['missing_frame_cost_count'] ?? 0),
                    'sales_recorded' => $salesRecorded,
                    'cost_tracking_available' => $productCostTrackingAvailable,
                    'available_after_costs' => $availableAfterCosts,
                    'available_for_allocations' => $availableForAllocations,
                    'estimated_bank_deposit' => $estimatedBankDeposit,
                    'required_rent_savings' => $requiredDailySavings,
                    'required_share_percent' => $availableForAllocations !== null && $availableForAllocations > 0
                        ? round($requiredDailySavings / $availableForAllocations * 100, 2)
                        : null,
                    'actual_rent_saved' => $saved,
                    'remaining_for_day' => $remainingForDay,
                    'arrears_amount' => $arrears,
                    'is_due' => $isDue,
                    'saving_entries' => $entryDetails,
                    'shortfall_after_costs' => $productCostTrackingAvailable && $salesRecorded && $requiredDailySavings !== null
                        ? round(max($requiredDailySavings - $availableForAllocations, 0), 2)
                        : null,
                ];
            })->values();

            return [
                'id' => (int) $item->id,
                'branch_id' => (int) $item->branch_id,
                'name' => $item->name,
                'allocation_percent' => (float) $item->allocation_percent,
                'target_amount' => $target,
                'target_start_date' => $targetStartDate,
                'target_date' => $targetDate,
                'treatment' => $item->treatment,
                'period_allocation' => $periodAllocation,
                'existing_set_aside_amount' => $existingSetAside,
                'existing_set_aside_count' => $item->treatment === 'savings'
                    ? (int) ($contribution->contribution_count ?? 0)
                    : 0,
                'daily_contributions' => $item->treatment === 'savings'
                    ? ($contribution->daily_contributions ?? collect())->values()
                    : collect(),
                'projected_total' => round($projectedTotal, 2),
                'remaining_to_target' => $remainingToTarget,
                'target_progress_percent' => $target !== null && $target > 0
                    ? round(min($projectedTotal / $target * 100, 100), 2)
                    : null,
                'working_days_remaining' => $workingDaysRemaining,
                'required_daily_savings' => $requiredDailySavings,
                'arrears_total' => round((float) $dailySchedule->sum('arrears_amount'), 2),
                'target_deadline_passed' => $targetDeadlinePassed,
                'daily_savings_schedule' => $dailySchedule,
                'created_at' => $item->created_at,
            ];
        })->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => ['date_from' => $dateFrom, 'date_to' => $dateTo],
            'summary' => [
                'gross_collections' => round($grossCollections, 2),
                'refund_reversals' => round($refundReversals, 2),
                'net_collections' => round($netCollections, 2),
                'known_product_costs_to_set_aside' => $knownProductCostToSetAside,
                'lens_costs_to_set_aside' => round((float) $periodProductCosts->sum(fn ($cost) => $cost['lens_cost'] ?? 0), 2),
                'frame_costs_to_set_aside' => round((float) $periodProductCosts->sum(fn ($cost) => $cost['frame_cost'] ?? 0), 2),
                'unpriced_product_sales_held' => $unpricedProductSales,
                'recorded_expenses' => $periodExpenses,
                'product_cost_tracking_available' => $productCostTrackingAvailable,
                'allocation_base' => round($allocationBase, 2),
                'total_percent' => $totalPercent,
                'existing_set_aside_amount' => round($existingSetAsideAmount, 2),
                'savings_amount' => $savingsAmount,
                'projected_savings_amount' => round($existingSetAsideAmount + $savingsAmount, 2),
                'bank_allocated_amount' => $bankAllocatedAmount,
                'bank_transfer_amount' => $bankTransferAmount,
                'unallocated_bank_amount' => $unallocatedBankAmount,
            ],
            'items' => $items,
        ]);
    }

    public function recordSalesAllocationSaving(Request $request, int $allocationId): JsonResponse
    {
        if (! Schema::hasTable('sales_allocation_savings_entries')) {
            return response()->json(['message' => 'Savings tracking is not installed. Run the latest database migration first.'], 503);
        }
        if (! Schema::hasTable('expenses')) {
            return response()->json(['message' => 'Expense tracking is not available on this database.'], 503);
        }

        $user = $request->user();
        $role = $user?->normalized_role ?? $user?->role;
        if ($role !== 'manager' && ! $user?->isAdmin()) {
            return response()->json(['message' => 'Only the General Manager can record savings directly as an expense.'], 403);
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'target_date' => ['required', 'date'],
            'set_aside_date' => ['required', 'date', 'before_or_equal:today'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'min:0.01'],
        ]);
        $targetDay = Carbon::parse($validated['target_date'])->startOfDay();
        if ($targetDay->dayOfWeek === Carbon::SUNDAY) {
            return response()->json(['message' => 'Savings targets are not scheduled for Sundays.'], 422);
        }

        $item = DB::table('sales_allocation_items')
            ->where('id', $allocationId)
            ->where('branch_id', $branchId)
            ->where('is_active', true)
            ->where('treatment', 'savings')
            ->first();
        if (! $item || $item->target_amount === null || $item->target_start_date === null || $item->target_date === null) {
            return response()->json(['message' => 'A savings goal with a start date and deadline is required.'], 404);
        }

        if (
            $targetDay->toDateString() < $item->target_start_date
            || $targetDay->toDateString() >= $item->target_date
        ) {
            return response()->json(['message' => 'The target day must fall within the savings plan dates and before the due date.'], 422);
        }

        foreach (['expense_id', 'description', 'amount', 'date', 'category', 'branch_id'] as $requiredColumn) {
            if (! Schema::hasColumn('expenses', $requiredColumn)) {
                return response()->json(['message' => 'The expense table is missing required fields for recording savings.'], 503);
            }
        }

        $expenseId = DB::transaction(function () use ($item, $branchId, $validated, $user): int {
            DB::table('sales_allocation_items')
                ->where('id', $item->id)
                ->where('branch_id', $branchId)
                ->lockForUpdate()
                ->first();

            $existingSaved = (float) DB::table('sales_allocation_savings_entries')
                ->where('allocation_item_id', $item->id)
                ->where('branch_id', $branchId)
                ->whereDate('target_date', $validated['target_date'])
                ->sum('amount');

            $contributedSoFar = (float) DB::table('expenses')
                ->where('branch_id', $branchId)
                ->whereRaw('LOWER(TRIM(category)) = ?', [mb_strtolower(trim((string) $item->name))])
                ->whereDate('date', '<=', now()->toDateString())
                ->sum('amount');
            $remainingToTarget = max((float) $item->target_amount - $contributedSoFar, 0);
            $targetStart = Carbon::parse($item->target_start_date)->startOfDay()->max(now()->startOfDay());
            $deadline = Carbon::parse($item->target_date)->startOfDay()->subDay();
            $workingDays = 0;
            if (! $targetStart->isAfter($deadline)) {
                for ($date = $targetStart->copy(); ! $date->isAfter($deadline); $date->addDay()) {
                    if ($date->dayOfWeek !== Carbon::SUNDAY) {
                        $workingDays++;
                    }
                }
            }
            $dailyTarget = $workingDays > 0
                ? ceil(($remainingToTarget / $workingDays) * 100) / 100
                : 0.0;
            $arrears = max($dailyTarget - $existingSaved, 0);
            $amount = round((float) $validated['amount'], 2);
            if ($amount > $arrears + 0.0001) {
                abort(response()->json([
                    'message' => 'The amount cannot exceed this day’s remaining savings target of GH₵'.number_format($arrears, 2).'.',
                ], 422));
            }

            $entryId = DB::table('sales_allocation_savings_entries')->insertGetId([
                'branch_id' => $branchId,
                'allocation_item_id' => $item->id,
                'target_date' => $validated['target_date'],
                'set_aside_date' => $validated['set_aside_date'],
                'amount' => $amount,
                'recorded_by' => $user?->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $expenseData = [
                'description' => trim((string) $item->name).' savings for '.$validated['target_date'],
                'amount' => $amount,
                'date' => $validated['set_aside_date'],
                'category' => trim((string) $item->name),
                'branch_id' => $branchId,
            ];
            if (Schema::hasColumn('expenses', 'created_by')) {
                $expenseData['created_by'] = $user?->id;
            }
            if (Schema::hasColumn('expenses', 'created_at')) {
                $expenseData['created_at'] = now();
            }
            if (Schema::hasColumn('expenses', 'updated_at')) {
                $expenseData['updated_at'] = now();
            }
            if (Schema::hasColumn('expenses', 'source_type')) {
                $expenseData['source_type'] = 'sales_allocation_saving';
            }
            if (Schema::hasColumn('expenses', 'source_id')) {
                $expenseData['source_id'] = $entryId;
            }

            $createdExpenseId = DB::table('expenses')->insertGetId($expenseData, 'expense_id');
            DB::table('sales_allocation_savings_entries')
                ->where('id', $entryId)
                ->update(['expense_id' => $createdExpenseId, 'updated_at' => now()]);

            return (int) $createdExpenseId;
        });

        return response()->json([
            'message' => trim((string) $item->name).' savings recorded as an expense.',
            'expense_id' => $expenseId,
        ], 201);
    }

    public function storeSalesAllocation(Request $request): JsonResponse
    {
        if (! Schema::hasTable('sales_allocation_items')) {
            return response()->json(['message' => 'Sales allocation is not installed. Run the latest database migration first.'], 503);
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'allocation_percent' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:100'],
            'target_amount' => ['nullable', 'numeric', 'decimal:0,2', 'min:0.01'],
            'target_start_date' => ['nullable', 'date'],
            'target_date' => ['nullable', 'date'],
            'treatment' => ['required', 'in:bank,savings'],
        ]);
        $this->validateAllocationDates($validated);
        $this->ensureAllocationPercentTotal($branchId, (float) $validated['allocation_percent']);
        $now = now();
        $id = DB::table('sales_allocation_items')->insertGetId([
            'branch_id' => $branchId,
            'name' => trim($validated['name']),
            'allocation_percent' => $validated['allocation_percent'],
            'target_amount' => $validated['target_amount'] ?? null,
            'target_start_date' => $validated['target_start_date'] ?? null,
            'target_date' => $validated['target_date'] ?? null,
            'treatment' => $validated['treatment'],
            'is_active' => true,
            'created_by' => $request->user()?->id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return response()->json([
            'message' => 'Sales allocation item added.',
            'id' => $id,
        ], 201);
    }

    public function updateSalesAllocation(Request $request, int $allocationId): JsonResponse
    {
        if (! Schema::hasTable('sales_allocation_items')) {
            return response()->json(['message' => 'Sales allocation is not installed. Run the latest database migration first.'], 503);
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'allocation_percent' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:100'],
            'target_amount' => ['nullable', 'numeric', 'decimal:0,2', 'min:0.01'],
            'target_start_date' => ['nullable', 'date'],
            'target_date' => ['nullable', 'date'],
            'treatment' => ['required', 'in:bank,savings'],
        ]);
        $this->validateAllocationDates($validated);
        $item = DB::table('sales_allocation_items')
            ->where('id', $allocationId)
            ->where('branch_id', $branchId)
            ->where('is_active', true)
            ->first();
        if (! $item) {
            return response()->json(['message' => 'Sales allocation item not found for this branch.'], 404);
        }

        $this->ensureAllocationPercentTotal($branchId, (float) $validated['allocation_percent'], $allocationId);
        DB::table('sales_allocation_items')
            ->where('id', $allocationId)
            ->where('branch_id', $branchId)
            ->update([
                'name' => trim($validated['name']),
                'allocation_percent' => $validated['allocation_percent'],
                'target_amount' => $validated['target_amount'] ?? null,
                'target_start_date' => $validated['target_start_date'] ?? null,
                'target_date' => $validated['target_date'] ?? null,
                'treatment' => $validated['treatment'],
                'updated_at' => now(),
            ]);

        return response()->json(['message' => 'Sales allocation item updated.']);
    }

    public function deleteSalesAllocation(Request $request, int $allocationId): JsonResponse
    {
        if (! Schema::hasTable('sales_allocation_items')) {
            return response()->json(['message' => 'Sales allocation is not installed. Run the latest database migration first.'], 503);
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $updated = DB::table('sales_allocation_items')
            ->where('id', $allocationId)
            ->where('branch_id', $branchId)
            ->where('is_active', true)
            ->update(['is_active' => false, 'updated_at' => now()]);

        if (! $updated) {
            return response()->json(['message' => 'Sales allocation item not found for this branch.'], 404);
        }

        return response()->json(['message' => 'Sales allocation item removed.']);
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
            'expected_repayment_amount' => ['nullable', 'numeric', 'gte:principal_amount'],
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
        $expectedRepaymentAmount = $validated['expected_repayment_amount'] ?? null;
        if ($expectedRepaymentAmount !== null) {
            if (! $termMonths) {
                return response()->json(['message' => 'Term in months is required when using an expected repayment amount.'], 422);
            }
            $interestRate = max(0, (($expectedRepaymentAmount / $principalAmount) - 1) * 100 * (12 / $termMonths));
            $interestType = 'fixed';
        }
        if ($interestType === 'none') {
            $interestRate = null;
        }

        $totalAmount = $principalAmount;
        if ($expectedRepaymentAmount !== null) {
            $totalAmount = (float) $expectedRepaymentAmount;
        } elseif ($interestRate && $interestRate > 0 && $termMonths) {
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
            'expected_repayment_amount' => ['nullable', 'numeric', 'gte:principal_amount'],
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
        $expectedRepaymentAmount = $validated['expected_repayment_amount'] ?? null;
        if ($expectedRepaymentAmount !== null) {
            if (! $termMonths) {
                return response()->json(['message' => 'Term in months is required when using an expected repayment amount.'], 422);
            }
            $interestRate = max(0, (($expectedRepaymentAmount / $principalAmount) - 1) * 100 * (12 / $termMonths));
            $interestType = 'fixed';
        }
        if ($interestType === 'none') {
            $interestRate = null;
        }

        $totalAmount = $principalAmount;
        if ($expectedRepaymentAmount !== null) {
            $totalAmount = (float) $expectedRepaymentAmount;
        } elseif ($interestRate && $interestRate > 0 && $termMonths) {
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

    private function dailyProductCostReserves(int $branchId, string $dateFrom, string $dateTo)
    {
        $daily = collect();
        if (
            Schema::hasTable('billing')
            && Schema::hasTable('lens_costs')
            && Schema::hasColumn('lens_costs', 'billing_id')
            && Schema::hasColumn('lens_costs', 'branch_id')
            && Schema::hasColumn('lens_costs', 'cost_price')
        ) {
            $lensRows = tap(
                DB::table('billing as b')
                    ->leftJoin('lens_costs as lc', function ($join): void {
                        $join->on('lc.billing_id', '=', 'b.id')
                            ->on('lc.branch_id', '=', 'b.branch_id');
                    })
                    ->whereBetween('b.date', [$dateFrom, $dateTo])
                    ->where('b.lens_price', '>', 0),
                fn ($query) => $this->applyBranchScope($query, 'b.branch_id', $branchId)
            )
                ->selectRaw('
                    DATE(b.date) as sale_date,
                    SUM(CASE WHEN lc.cost_price IS NOT NULL THEN lc.cost_price ELSE 0 END) as known_cost,
                    SUM(CASE WHEN lc.cost_price IS NULL THEN b.lens_price ELSE 0 END) as unpriced_sales,
                    SUM(CASE WHEN lc.cost_price IS NULL THEN 1 ELSE 0 END) as missing_count
                ')
                ->groupByRaw('DATE(b.date)')
                ->get();

            foreach ($lensRows as $row) {
                $date = (string) $row->sale_date;
                $daily[$date] = array_merge($daily->get($date, []), [
                    'lens_cost' => round((float) $row->known_cost, 2),
                    'unpriced_lens_sales' => round((float) $row->unpriced_sales, 2),
                    'missing_lens_cost_count' => (int) $row->missing_count,
                ]);
            }
        }

        if (
            Schema::hasTable('billing')
            && Schema::hasTable('billing_frames')
            && Schema::hasTable('products')
            && Schema::hasColumn('products', 'code')
            && Schema::hasColumn('products', 'branch_id')
            && Schema::hasColumn('products', 'cost_price')
        ) {
            $frameRows = tap(
                DB::table('billing_frames as bf')
                    ->join('billing as b', 'bf.billing_id', '=', 'b.id')
                    ->leftJoin('products as p', function ($join): void {
                        $join->on('p.code', '=', 'bf.frame_code_id')
                            ->on('p.branch_id', '=', 'b.branch_id');
                    })
                    ->whereBetween('b.date', [$dateFrom, $dateTo]),
                fn ($query) => $this->applyBranchScope($query, 'b.branch_id', $branchId)
            )
                ->selectRaw('
                    DATE(b.date) as sale_date,
                    SUM(CASE WHEN p.cost_price IS NOT NULL THEN p.cost_price ELSE 0 END) as known_cost,
                    SUM(CASE WHEN p.cost_price IS NULL THEN COALESCE(bf.frame_price, 0) ELSE 0 END) as unpriced_sales,
                    SUM(CASE WHEN p.cost_price IS NULL THEN 1 ELSE 0 END) as missing_count
                ')
                ->groupByRaw('DATE(b.date)')
                ->get();

            foreach ($frameRows as $row) {
                $date = (string) $row->sale_date;
                $daily[$date] = array_merge($daily->get($date, []), [
                    'frame_cost' => round((float) $row->known_cost, 2),
                    'unpriced_frame_sales' => round((float) $row->unpriced_sales, 2),
                    'missing_frame_cost_count' => (int) $row->missing_count,
                ]);
            }
        }

        return $daily;
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

    private function debtCategories(int $branchId): array
    {
        $categories = tap(DB::table('debts'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereNotNull('category')
            ->where('category', '!=', '')
            ->distinct()
            ->orderBy('category')
            ->pluck('category')
            ->map(fn ($category) => (string) $category)
            ->values()
            ->all();

            return $categories ?: ['Loan', 'Supplier Credit', 'Overdraft', 'Lease', 'Other'];
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

    private function ensureAllocationPercentTotal(int $branchId, float $requestedPercent, ?int $excludeId = null): void
    {
        $existingPercent = (float) tap(
            DB::table('sales_allocation_items')
                ->where('is_active', true)
                ->when($excludeId !== null, fn ($query) => $query->where('id', '!=', $excludeId)),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->sum('allocation_percent');

        if ($existingPercent + $requestedPercent > 100.0001) {
            abort(response()->json([
                'message' => 'Combined allocation percentages cannot exceed 100%. Current active total: '.round($existingPercent, 2).'%.',
            ], 422));
        }
    }

    private function validateAllocationDates(array $validated): void
    {
        $startDate = $validated['target_start_date'] ?? null;
        $targetDate = $validated['target_date'] ?? null;

        if ($startDate !== null && $targetDate !== null && $targetDate <= $startDate) {
            abort(response()->json([
                'message' => 'The target date must be after the savings start date.',
            ], 422));
        }
    }
}
