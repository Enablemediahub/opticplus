<?php

namespace App\Http\Controllers;

use App\Services\BsmiTransactionService;
use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class FinanceController extends Controller
{
    private const DEFAULT_EXPENSE_CATEGORIES = [
        'Utilities',
        'Salaries',
        'Transport',
        'Stationery',
        'Maintenance',
        'Operations',
    ];

    public function summary(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $this->ensureLensCostExpensesSynced($branchId);
        $today = now();
        $todayDate = $today->toDateString();
        $weekStart = $today->copy()->startOfWeek()->toDateString();
        $monthStart = $today->copy()->startOfMonth()->toDateString();
        $collectedSalesBase = tap(
            DB::table('sales')->where('payment_method', '!=', 'Insurance'),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $insuranceClaimsBase = tap(
            DB::table('insurance_claims'),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );

        $outstandingBalance = $this->outstandingBillingQuery($branchId)
            ->selectRaw('SUM(COALESCE(b.balance, 0)) as outstanding_balance')
            ->value('outstanding_balance');

        $topExpenseCategories = tap(DB::table('expenses'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereDate('date', '>=', $today->copy()->subMonths(3)->toDateString())
            ->select('category', DB::raw('SUM(amount) as total'))
            ->groupBy('category')
            ->orderByDesc('total')
            ->limit(5)
            ->get();

        $paymentMethods = tap(DB::table('sales')->where('payment_method', '!=', 'Insurance'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereDate('date', '>=', $monthStart)
            ->select('payment_method', DB::raw('SUM(amount_paid) as total'))
            ->groupBy('payment_method')
            ->orderByDesc('total')
            ->get();

        $salesToday = (float) (clone $collectedSalesBase)
            ->whereDate('date', $todayDate)
            ->sum('amount_paid');
        $salesWeek = (float) (clone $collectedSalesBase)
            ->whereDate('date', '>=', $weekStart)
            ->sum('amount_paid');
        $salesMonth = (float) (clone $collectedSalesBase)
            ->whereDate('date', '>=', $monthStart)
            ->sum('amount_paid');
        $insuranceBilledToday = (float) (clone $insuranceClaimsBase)
            ->whereDate('date', $todayDate)
            ->sum('amount_paid');
        $insuranceBilledWeek = (float) (clone $insuranceClaimsBase)
            ->whereDate('date', '>=', $weekStart)
            ->sum('amount_paid');
        $insuranceBilledMonth = (float) (clone $insuranceClaimsBase)
            ->whereDate('date', '>=', $monthStart)
            ->sum('amount_paid');

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => [
                'sales_today' => $salesToday,
                'sales_week' => $salesWeek,
                'sales_month' => $salesMonth,
                'insurance_billed_today' => $insuranceBilledToday,
                'insurance_billed_week' => $insuranceBilledWeek,
                'insurance_billed_month' => $insuranceBilledMonth,
                'sales_with_insurance_today' => $salesToday + $insuranceBilledToday,
                'sales_with_insurance_week' => $salesWeek + $insuranceBilledWeek,
                'sales_with_insurance_month' => $salesMonth + $insuranceBilledMonth,
                'expenses_month' => (float) tap(DB::table('expenses'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                    ->whereDate('date', '>=', $monthStart)
                    ->sum('amount'),
                'net_month' => $salesMonth -
                    (float) tap(DB::table('expenses'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                        ->whereDate('date', '>=', $monthStart)
                        ->sum('amount'),
                'outstanding_balance' => (float) ($outstandingBalance ?? 0),
                'insurance_pending' => (float) tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                    ->where('status', 'pending')
                    ->sum('amount_paid'),
            ],
            'top_expense_categories' => $topExpenseCategories,
            'payment_methods' => $paymentMethods,
        ]);
    }

    public function monthlyReport(Request $request): JsonResponse
    {
        $primaryBranchId = $this->resolveReportBranchId($request, 'branch_id');
        $comparisonBranchValue = $request->string('comparison_branch_id')->toString();
        $comparisonBranchId = $comparisonBranchValue === '' ? null : $this->resolveReportBranchId($request, 'comparison_branch_id');

        $month = $this->normalizeReportMonth($request->string('month')->toString());
        $comparisonMonth = $this->normalizeReportMonth($request->string('comparison_month')->toString() ?: $month);

        $this->ensureLensCostExpensesSynced($primaryBranchId);
        if ($comparisonBranchId !== null) {
            $this->ensureLensCostExpensesSynced($comparisonBranchId);
        }

        $primary = $this->buildMonthlyReportDataset($primaryBranchId, $month);
        $comparison = $comparisonBranchId === null
            ? null
            : $this->buildMonthlyReportDataset($comparisonBranchId, $comparisonMonth);

        return response()->json([
            'branches' => [
                ['id' => 0, 'name' => 'Merged Branches'],
                ['id' => 1, 'name' => 'Labadi'],
                ['id' => 2, 'name' => 'Madina'],
            ],
            'available_months' => $this->availableReportMonths(),
            'monthly_overview' => $this->buildMonthlyOverview($primaryBranchId),
            'primary' => $primary,
            'comparison' => $comparison,
        ]);
    }

    public function monitor(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = $user?->normalized_role ?? $user?->role;
        if ($role !== 'manager' && ! ($user?->is_admin ?? false)) {
            return response()->json([
                'message' => 'Only the General Manager can access The Monitor.',
            ], 403);
        }

        $branchId = $this->resolveReportBranchId($request, 'branch_id');
        $this->ensureLensCostExpensesSynced($branchId);
        [$startDate, $endDate, $periodLabel] = $this->monitorDateRange($request);

        $billingBase = tap(
            DB::table('billing')->whereBetween('date', [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $salesBase = tap(
            DB::table('sales')
                ->whereBetween('date', [$startDate, $endDate])
                ->where('payment_method', '!=', 'Insurance'),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $expenseBase = tap(
            DB::table('expenses')->whereBetween('date', [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $insuranceBase = tap(
            DB::table('insurance_claims')->whereBetween('date', [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $bsmiBase = tap(
            DB::table('bsmi_transactions')->whereBetween(DB::raw('DATE(created_at)'), [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );

        $billing = (clone $billingBase)
            ->selectRaw('
                COUNT(*) as bills,
                COALESCE(SUM(consultation_price), 0) as consultation_total,
                COALESCE(SUM(frame_price), 0) as frame_total,
                COALESCE(SUM(lens_price), 0) as lens_total,
                COALESCE(SUM(total_amount), 0) as billed_total,
                COALESCE(SUM(balance), 0) as outstanding_balance,
                SUM(CASE WHEN COALESCE(frame_price, 0) > 0 THEN 1 ELSE 0 END) as frame_count,
                SUM(CASE WHEN COALESCE(lens_price, 0) > 0 THEN 1 ELSE 0 END) as lens_count
            ')
            ->first();

        $lensExpenseTotal = (float) (clone $expenseBase)
            ->whereRaw('LOWER(category) = ?', ['lens'])
            ->sum('amount');
        $totalExpenses = (float) (clone $expenseBase)->sum('amount');
        $frameProfit = (float) (clone $bsmiBase)->sum('surplus_for_bsmi');

        $salesByMethod = (clone $salesBase)
            ->select('payment_method', DB::raw('SUM(amount_paid) as total'))
            ->groupBy('payment_method')
            ->pluck('total', 'payment_method');

        $collections = [
            'cash' => 0.0,
            'mobile_money' => 0.0,
            'paystack' => 0.0,
            'bank_transfer' => 0.0,
            'other' => 0.0,
        ];
        foreach ($salesByMethod as $method => $amount) {
            $bucket = $this->classifyPaymentMethod((string) $method);
            $collections[$bucket] = ($collections[$bucket] ?? 0) + round((float) $amount, 2);
        }

        $insurancePaid = (float) (clone $insuranceBase)->where('status', 'paid')->sum('amount_paid');
        $insuranceClaimed = (float) (clone $insuranceBase)->where('status', 'claimed')->sum('amount_paid');
        $insurancePending = (float) (clone $insuranceBase)->where('status', 'pending')->sum('amount_paid');
        $insuranceExpected = round($insuranceClaimed + $insurancePending, 2);
        $collectedRevenue = round(array_sum($collections) + $insurancePaid, 2);
        $lensRevenue = (float) ($billing->lens_total ?? 0);
        $lensProfit = round($lensRevenue - $lensExpenseTotal, 2);
        $grossProfit = round($lensProfit + $frameProfit + (float) ($billing->consultation_total ?? 0), 2);
        $cashPosition = round($collectedRevenue - $totalExpenses, 2);

        $expenseBreakdown = (clone $expenseBase)
            ->select('category', DB::raw('SUM(amount) as total'))
            ->groupBy('category')
            ->orderByDesc('total')
            ->limit(8)
            ->get();

        $billingDaily = (clone $billingBase)
            ->selectRaw('date, COALESCE(SUM(consultation_price), 0) as consultation_total, COALESCE(SUM(frame_price), 0) as frame_total, COALESCE(SUM(lens_price), 0) as lens_total')
            ->groupBy('date')
            ->get()
            ->keyBy('date');
        $salesDaily = (clone $salesBase)
            ->selectRaw('date, SUM(amount_paid) as collected_total')
            ->groupBy('date')
            ->get()
            ->keyBy('date');
        $insuranceDaily = (clone $insuranceBase)
            ->selectRaw("
                date,
                SUM(CASE WHEN status = 'paid' THEN amount_paid ELSE 0 END) as insurance_paid,
                SUM(CASE WHEN status IN ('pending', 'claimed') THEN amount_paid ELSE 0 END) as insurance_expected
            ")
            ->groupBy('date')
            ->get()
            ->keyBy('date');
        $expenseDaily = (clone $expenseBase)
            ->selectRaw('date, SUM(amount) as expense_total')
            ->groupBy('date')
            ->get()
            ->keyBy('date');

        $dailyRows = collect()
            ->merge($billingDaily->keys())
            ->merge($salesDaily->keys())
            ->merge($insuranceDaily->keys())
            ->merge($expenseDaily->keys())
            ->filter()
            ->unique()
            ->sortDesc()
            ->take(31)
            ->map(function ($date) use ($billingDaily, $salesDaily, $insuranceDaily, $expenseDaily) {
                $billingRow = $billingDaily->get($date);
                $salesRow = $salesDaily->get($date);
                $insuranceRow = $insuranceDaily->get($date);
                $expenseRow = $expenseDaily->get($date);
                $collectedTotal = round((float) ($salesRow->collected_total ?? 0) + (float) ($insuranceRow->insurance_paid ?? 0), 2);
                $expenseTotal = round((float) ($expenseRow->expense_total ?? 0), 2);

                return [
                    'date' => $date,
                    'consultation_total' => round((float) ($billingRow->consultation_total ?? 0), 2),
                    'frame_total' => round((float) ($billingRow->frame_total ?? 0), 2),
                    'lens_total' => round((float) ($billingRow->lens_total ?? 0), 2),
                    'collected_total' => $collectedTotal,
                    'insurance_expected' => round((float) ($insuranceRow->insurance_expected ?? 0), 2),
                    'expense_total' => $expenseTotal,
                    'net_position' => round($collectedTotal - $expenseTotal, 2),
                ];
            })
            ->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => [
                'period' => $request->string('period')->toString() ?: 'monthly',
                'date_from' => $startDate,
                'date_to' => $endDate,
                'label' => $periodLabel,
            ],
            'stats' => [
                'collected_revenue' => $collectedRevenue,
                'cash_position' => $cashPosition,
                'gross_profit' => $grossProfit,
                'total_expenses' => round($totalExpenses, 2),
                'consultation_revenue' => round((float) ($billing->consultation_total ?? 0), 2),
                'lens_revenue' => round($lensRevenue, 2),
                'lens_cost' => round($lensExpenseTotal, 2),
                'lens_profit' => $lensProfit,
                'lens_count' => (int) ($billing->lens_count ?? 0),
                'frame_revenue' => round((float) ($billing->frame_total ?? 0), 2),
                'frame_profit' => round($frameProfit, 2),
                'frame_count' => (int) ($billing->frame_count ?? 0),
                'insurance_claimed' => round($insuranceClaimed, 2),
                'insurance_pending' => round($insurancePending, 2),
                'insurance_expected' => $insuranceExpected,
                'outstanding_balance' => round((float) ($billing->outstanding_balance ?? 0), 2),
                'bill_count' => (int) ($billing->bills ?? 0),
            ],
            'collections' => [
                ...$collections,
                'insurance_paid' => round($insurancePaid, 2),
                'insurance_claimed' => round($insuranceClaimed, 2),
                'insurance_pending' => round($insurancePending, 2),
                'insurance_expected' => $insuranceExpected,
            ],
            'expense_breakdown' => $expenseBreakdown,
            'daily_rows' => $dailyRows,
        ]);
    }

    public function sales(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $today = now()->toDateString();
        $searchTerm = trim($request->string('search')->toString());
        $selectedPaymentMethod = $request->string('payment_method')->toString();
        $hasScopedFilters = $request->filled('date_from')
            || $request->filled('date_to')
            || $searchTerm !== ''
            || ($selectedPaymentMethod && $selectedPaymentMethod !== 'all');

        $query = DB::table('sales as s')
            ->leftJoin('billing as b', function ($join): void {
                $join->on('s.billing_id', '=', 'b.id')
                    ->on('s.branch_id', '=', 'b.branch_id');
            })
            ->where('s.payment_method', '!=', 'Insurance');
        $this->applyBranchScope($query, 's.branch_id', $branchId);

        $this->applySalesFilters($query, $request);

        $total = (clone $query)->count('s.id');
        $totalAmount = (float) (clone $query)->sum('s.amount_paid');
        $todaySales = (float) (clone $query)->whereDate('s.date', $today)->sum('s.amount_paid');
        $loanRevenueTotal = (float) (clone $query)->whereNull('s.billing_id')->sum('s.amount_paid');
        $billingRevenueTotal = (float) (clone $query)->whereNotNull('s.billing_id')->sum('s.amount_paid');
        $consultationTotal = (float) (clone $query)->sum(DB::raw('COALESCE(b.consultation_price, 0)'));
        $frameTotal = (float) (clone $query)->sum(DB::raw('COALESCE(b.frame_price, 0)'));
        $lensTotal = (float) (clone $query)->sum(DB::raw('COALESCE(b.lens_price, 0)'));
        $caseTotal = (float) (clone $query)->sum(DB::raw('COALESCE(b.case_price, 0)'));
        $discountTotal = (float) (clone $query)->sum(DB::raw('COALESCE(b.discount, 0)'));
        $taxTotal = (float) (clone $query)->sum(DB::raw('COALESCE(b.tax, 0) + COALESCE(b.nhil_amount, 0) + COALESCE(b.getfund_amount, 0) + COALESCE(b.covid_levy_amount, 0) + COALESCE(b.vat_amount, 0) + COALESCE(b.vat_flat_rate_amount, 0)'));
        $billingTotal = (float) (clone $query)->sum(DB::raw('COALESCE(b.total_amount, 0)'));
        $insuranceBilledQuery = tap(
            DB::table('insurance_claims as ic')
                ->leftJoin('billing as b', function ($join): void {
                    $join->on('ic.billing_id', '=', 'b.id')
                        ->on('ic.branch_id', '=', 'b.branch_id');
                }),
            fn ($builder) => $this->applyBranchScope($builder, 'ic.branch_id', $branchId)
        );

        if ($request->filled('date_from')) {
            $insuranceBilledQuery->whereDate('ic.date', '>=', $request->string('date_from')->toString());
        }

        if ($request->filled('date_to')) {
            $insuranceBilledQuery->whereDate('ic.date', '<=', $request->string('date_to')->toString());
        }

        if ($searchTerm !== '') {
            $like = '%'.$searchTerm.'%';
            $insuranceBilledQuery->where(function ($inner) use ($like): void {
                $inner->where('b.name', 'like', $like)
                    ->orWhere('ic.folder_id', 'like', $like)
                    ->orWhere('b.receipt_number', 'like', $like)
                    ->orWhere('ic.insurance_provider', 'like', $like)
                    ->orWhere('ic.insurance_number', 'like', $like)
                    ->orWhere('ic.insurance_package', 'like', $like);
            });
        }

        $insuranceBilledValue = (float) $insuranceBilledQuery->sum('ic.amount_paid');
        $insuranceBillCount = (int) (clone $insuranceBilledQuery)->count('ic.id');
        $dailyInsuranceRows = (clone $insuranceBilledQuery)
            ->selectRaw('DATE(ic.date) as sale_date, SUM(ic.amount_paid) as insurance_total, COUNT(ic.id) as insurance_count')
            ->groupBy(DB::raw('DATE(ic.date)'))
            ->orderByDesc('sale_date')
            ->get();

        $scopeMethodBreakdownQuery = tap(
            DB::table('sales as s')
                ->where('s.payment_method', '!=', 'Insurance'),
            fn ($builder) => $this->applyBranchScope($builder, 's.branch_id', $branchId)
        );

        if ($hasScopedFilters) {
            $scopeMethodBreakdownQuery->leftJoin('billing as b', function ($join): void {
                $join->on('s.billing_id', '=', 'b.id')
                    ->on('s.branch_id', '=', 'b.branch_id');
            });

            $this->applySalesFilters($scopeMethodBreakdownQuery, $request);
        } else {
            $scopeMethodBreakdownQuery->whereDate('s.date', $today);
        }

        $scopeMethodBreakdown = $scopeMethodBreakdownQuery
            ->select('s.payment_method', DB::raw('SUM(s.amount_paid) as total'))
            ->groupBy('s.payment_method')
            ->get();

        $todayCashTotal = 0.0;
        $todayMobileMoneyTotal = 0.0;
        $todayPaystackTotal = 0.0;
        $todayOtherTotal = 0.0;
        foreach ($scopeMethodBreakdown as $row) {
            $bucket = $this->classifyPaymentMethod((string) $row->payment_method);
            $value = (float) $row->total;
            match ($bucket) {
                'cash' => $todayCashTotal += $value,
                'mobile_money' => $todayMobileMoneyTotal += $value,
                'paystack' => $todayPaystackTotal += $value,
                default => $todayOtherTotal += $value,
            };
        }

        $scopeInsuranceQuery = tap(
            DB::table('insurance_claims as ic'),
            fn ($builder) => $this->applyBranchScope($builder, 'ic.branch_id', $branchId)
        );

        if ($hasScopedFilters) {
            $scopeInsuranceQuery->leftJoin('billing as b', function ($join): void {
                $join->on('ic.billing_id', '=', 'b.id')
                    ->on('ic.branch_id', '=', 'b.branch_id');
            });

            if ($request->filled('date_from')) {
                $scopeInsuranceQuery->whereDate('ic.date', '>=', $request->string('date_from')->toString());
            }

            if ($request->filled('date_to')) {
                $scopeInsuranceQuery->whereDate('ic.date', '<=', $request->string('date_to')->toString());
            }

            if ($searchTerm !== '') {
                $like = '%'.$searchTerm.'%';
                $scopeInsuranceQuery->where(function ($inner) use ($like): void {
                    $inner->where('b.name', 'like', $like)
                        ->orWhere('ic.folder_id', 'like', $like)
                        ->orWhere('b.receipt_number', 'like', $like)
                        ->orWhere('ic.insurance_provider', 'like', $like)
                        ->orWhere('ic.insurance_number', 'like', $like)
                        ->orWhere('ic.insurance_package', 'like', $like);
                });
            }
        } else {
            $scopeInsuranceQuery->whereDate('ic.date', $today);
        }

        $todayInsuranceSales = (float) $scopeInsuranceQuery->sum('ic.amount_paid');

        $todayCashMomoTotal = $todayCashTotal + $todayMobileMoneyTotal;

        $methodBreakdown = (clone $query)
            ->select('s.payment_method', DB::raw('SUM(s.amount_paid) as total'))
            ->groupBy('s.payment_method')
            ->orderByDesc('total')
            ->get();

        $trend = (clone $query)
            ->selectRaw('DATE(s.date) as sale_date, SUM(s.amount_paid) as total')
            ->groupBy(DB::raw('DATE(s.date)'))
            ->orderBy('sale_date')
            ->limit(14)
            ->get();

        $dailySalesRows = (clone $query)
            ->selectRaw('
                DATE(s.date) as sale_date,
                COUNT(s.id) as transaction_count,
                SUM(s.amount_paid) as collected_sales,
                SUM(COALESCE(b.consultation_price, 0)) as consultation_total,
                SUM(COALESCE(b.frame_price, 0)) as frame_total,
                SUM(COALESCE(b.lens_price, 0)) as lens_total,
                SUM(COALESCE(b.case_price, 0)) as case_total,
                SUM(COALESCE(b.discount, 0)) as discount_total,
                SUM(COALESCE(b.tax, 0) + COALESCE(b.nhil_amount, 0) + COALESCE(b.getfund_amount, 0) + COALESCE(b.covid_levy_amount, 0) + COALESCE(b.vat_amount, 0) + COALESCE(b.vat_flat_rate_amount, 0)) as tax_total,
                SUM(COALESCE(b.total_amount, 0)) as billed_total
            ')
            ->groupBy(DB::raw('DATE(s.date)'))
            ->orderByDesc('sale_date')
            ->get();

        $dailySalesByDate = $dailySalesRows->keyBy('sale_date');
        $dailyInsuranceByDate = $dailyInsuranceRows->keyBy('sale_date');
        $allDates = $dailySalesByDate->keys()
            ->merge($dailyInsuranceByDate->keys())
            ->unique()
            ->sortDesc()
            ->values();
        $dailyBreakdown = $allDates
            ->map(function ($saleDate) use ($dailySalesByDate, $dailyInsuranceByDate) {
                $salesRow = $dailySalesByDate->get($saleDate);
                $insuranceRow = $dailyInsuranceByDate->get($saleDate);
                $collectedSales = (float) ($salesRow->collected_sales ?? 0);
                $insuranceTotal = (float) ($insuranceRow->insurance_total ?? 0);

                return [
                    'sale_date' => $saleDate,
                    'transaction_count' => (int) ($salesRow->transaction_count ?? 0),
                    'consultation_total' => round((float) ($salesRow->consultation_total ?? 0), 2),
                    'frame_total' => round((float) ($salesRow->frame_total ?? 0), 2),
                    'lens_total' => round((float) ($salesRow->lens_total ?? 0), 2),
                    'case_total' => round((float) ($salesRow->case_total ?? 0), 2),
                    'discount_total' => round((float) ($salesRow->discount_total ?? 0), 2),
                    'tax_total' => round((float) ($salesRow->tax_total ?? 0), 2),
                    'billed_total' => round((float) ($salesRow->billed_total ?? 0), 2),
                    'collected_sales' => round($collectedSales, 2),
                    'insurance_total' => round($insuranceTotal, 2),
                    'sales_with_insurance' => round($collectedSales + $insuranceTotal, 2),
                ];
            })
            ->values();

        $records = $query
            ->orderByDesc('s.date')
            ->orderByDesc('s.id')
            ->limit($perPage)
            ->offset($offset)
            ->get([
                's.id',
                's.date',
                's.amount_paid',
                's.description',
                's.billing_id',
                's.folder_id',
                's.payment_method',
                's.reference',
                's.transaction_id',
                's.created_at',
                'b.name',
                'b.folder_id as billing_folder_id',
                'b.receipt_number',
                'b.status as billing_status',
                'b.consultation_price',
                'b.frame_price',
                'b.lens_price',
                'b.case_price',
                'b.discount',
                'b.tax',
                'b.nhil_amount',
                'b.getfund_amount',
                'b.covid_levy_amount',
                'b.vat_amount',
                'b.vat_flat_rate_amount',
                'b.health_insurance',
                'b.total_amount as billing_total',
                DB::raw("CASE WHEN s.billing_id IS NULL THEN 1 ELSE 0 END as is_loan_revenue"),
                DB::raw("COALESCE(b.name, CASE WHEN s.billing_id IS NULL THEN 'Loan / Non-Customer Revenue' ELSE 'Walk-in Customer' END) as client_name"),
            ]);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => [
                'search' => $request->string('search')->toString(),
                'payment_method' => $request->string('payment_method')->toString() ?: 'all',
                'date_from' => $request->string('date_from')->toString(),
                'date_to' => $request->string('date_to')->toString(),
            ],
            'stats' => [
                'today_sales' => $todaySales,
                'total_sales' => $totalAmount,
                'billing_sales' => $billingRevenueTotal,
                'loan_revenue_total' => $loanRevenueTotal,
                'billing_total' => $billingTotal,
                'consultation_total' => $consultationTotal,
                'frame_total' => $frameTotal,
                'lens_total' => $lensTotal,
                'case_total' => $caseTotal,
                'discount_total' => $discountTotal,
                'tax_total' => $taxTotal,
                'insurance_billed_value' => $insuranceBilledValue,
                'sales_with_insurance' => $totalAmount + $insuranceBilledValue,
                'transaction_count' => $total,
                'insurance_bill_count' => $insuranceBillCount,
                'scope_breakdown' => [
                    'cash' => round($todayCashTotal, 2),
                    'mobile_money' => round($todayMobileMoneyTotal, 2),
                    'paystack' => round($todayPaystackTotal, 2),
                    'other' => round($todayOtherTotal, 2),
                    'insurance' => round($todayInsuranceSales, 2),
                    'collected_total' => round($todayCashTotal + $todayMobileMoneyTotal + $todayPaystackTotal + $todayOtherTotal, 2),
                    'grand_total' => round($todayCashTotal + $todayMobileMoneyTotal + $todayPaystackTotal + $todayOtherTotal + $todayInsuranceSales, 2),
                    'label' => $hasScopedFilters ? 'Filtered Scope' : 'Today',
                ],
                'today_breakdown' => [
                    'cash' => round($todayCashTotal, 2),
                    'mobile_money' => round($todayMobileMoneyTotal, 2),
                    'paystack' => round($todayPaystackTotal, 2),
                    'other' => round($todayOtherTotal, 2),
                    'insurance' => round($todayInsuranceSales, 2),
                    'collected_total' => round($todayCashTotal + $todayMobileMoneyTotal + $todayPaystackTotal + $todayOtherTotal, 2),
                    'grand_total' => round($todayCashTotal + $todayMobileMoneyTotal + $todayPaystackTotal + $todayOtherTotal + $todayInsuranceSales, 2),
                ],
                'today_cash_momo_sales' => round($todayCashMomoTotal, 2),
                'today_insurance_sales' => round($todayInsuranceSales, 2),
                'today_cash_momo_plus_insurance' => round($todayCashMomoTotal + $todayInsuranceSales, 2),
                'average_sale' => $total > 0 ? round($totalAmount / $total, 2) : 0,
            ],
            'payment_methods' => $methodBreakdown,
            'trend' => $trend,
            'daily_breakdown' => $dailyBreakdown,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
            'records' => $records,
        ]);
    }

    public function expenses(Request $request): JsonResponse
    {
        $this->ensureExpenseCategoriesSchema();
        $this->ensureExpenseRecorderSchema();

        $branchId = $this->resolveBranchId($request);
        $this->ensureLensCostExpensesSynced($branchId);
        $today = now();
        $todayDate = $today->toDateString();
        $weekStart = $today->copy()->startOfWeek()->toDateString();
        $weekEnd = $today->copy()->endOfWeek()->toDateString();
        $monthStart = $today->copy()->startOfMonth()->toDateString();
        $monthEnd = $today->copy()->endOfMonth()->toDateString();
        $yearStart = $today->copy()->startOfYear()->toDateString();
        $yearEnd = $today->copy()->endOfYear()->toDateString();
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;

        $query = DB::table('expenses');
        $this->applyBranchScope($query, 'branch_id', $branchId);
        $this->applyExpenseFilters($query, $request);
        $filteredStatsQuery = clone $query;
        $widgetStatsQuery = DB::table('expenses');
        $this->applyBranchScope($widgetStatsQuery, 'branch_id', $branchId);

        $total = (clone $query)->count('expense_id');

        $records = $query
            ->orderByDesc('expense_id')
            ->orderByDesc('date')
            ->limit($perPage)
            ->offset($offset)
            ->get([
                'expense_id',
                'description',
                'amount',
                'date',
                'category',
                'branch_id',
            ]);

        $categories = $this->expenseCategoryOptions();
        $categoryRecords = DB::table('expense_categories')
            ->where('is_active', true)
            ->orderBy('name')
            ->get([
                'id',
                'name',
                'created_at',
                'updated_at',
            ]);

        $categoryBreakdown = (clone $filteredStatsQuery)
            ->select('category', DB::raw('SUM(amount) as total'))
            ->groupBy('category')
            ->orderByDesc('total')
            ->get();

        $trendRecords = (clone $query)
            ->selectRaw('DATE(date) as expense_date, SUM(amount) as total')
            ->groupBy(DB::raw('DATE(date)'))
            ->orderBy('expense_date')
            ->limit(20)
            ->get();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => [
                'filter' => $request->string('filter')->toString() ?: 'all',
                'start_date' => $request->string('start_date')->toString(),
                'end_date' => $request->string('end_date')->toString(),
                'category' => $request->string('category')->toString(),
                'search' => $request->string('search')->toString(),
            ],
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
            'stats' => [
                'today' => (float) (clone $widgetStatsQuery)
                    ->whereDate('date', $todayDate)
                    ->sum('amount'),
                'weekly' => (float) (clone $widgetStatsQuery)
                    ->whereBetween('date', [$weekStart, $weekEnd])
                    ->sum('amount'),
                'monthly' => (float) (clone $widgetStatsQuery)
                    ->whereBetween('date', [$monthStart, $monthEnd])
                    ->sum('amount'),
                'yearly' => (float) (clone $widgetStatsQuery)
                    ->whereBetween('date', [$yearStart, $yearEnd])
                    ->sum('amount'),
                'total' => (float) (clone $widgetStatsQuery)
                    ->whereBetween('date', [$yearStart, $yearEnd])
                    ->sum('amount'),
            ],
            'categories' => $categories,
            'category_records' => $categoryRecords,
            'category_breakdown' => $categoryBreakdown,
            'trend' => $trendRecords,
            'records' => $records,
        ]);
    }

    public function storeExpense(Request $request): JsonResponse
    {
        $this->ensureExpenseCategoriesSchema();
        $this->ensureExpenseRecorderSchema();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'date' => ['required', 'date'],
            'category' => ['required', 'string', 'max:50'],
            'other_category' => ['nullable', 'string', 'max:50'],
        ]);

        $category = trim((string) $validated['category']);
        if ($category === '') {
            return response()->json([
                'message' => 'Please select an expense category.',
            ], 422);
        }

        if ($response = $this->ensureMiscellaneousExpenseLimit($category, (float) $validated['amount'])) {
            return $response;
        }

        $this->upsertExpenseCategory($category);

        $userId = $request->user()?->id;
        $expenseId = DB::transaction(function () use ($request, $validated, $category, $branchId, $userId): int {
            $expenseData = [
                'description' => $validated['description'],
                'amount' => $validated['amount'],
                'date' => $validated['date'],
                'category' => $category,
                'branch_id' => $branchId,
                'created_by' => $userId,
            ];

            if (Schema::hasColumn('expenses', 'created_at')) {
                $expenseData['created_at'] = now();
            }

            if (Schema::hasColumn('expenses', 'updated_at')) {
                $expenseData['updated_at'] = now();
            }

            $expenseId = DB::table('expenses')->insertGetId($expenseData);

            AuditLog::logManual($request, 'edit', 'expenses', 'expense_id: '.$expenseId, [
                'description' => $validated['description'],
                'amount' => $validated['amount'],
                'date' => $validated['date'],
                'category' => $category,
                'branch_id' => $branchId,
            ], 201);

            return $expenseId;
        });

        return response()->json([
            'message' => 'Expense saved successfully.',
            'expense_id' => $expenseId,
        ], 201);
    }

    public function updateExpense(Request $request, int $expenseId): JsonResponse
    {
        $this->ensureExpenseCategoriesSchema();

        if ($response = $this->ensureExpenseWriteAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $current = tap(
            DB::table('expenses')->where('expense_id', $expenseId),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->first();

        if (! $current) {
            return response()->json([
                'message' => 'Expense record not found for this branch.',
            ], 404);
        }

        if ($this->isLinkedLensCostExpense($current)) {
            return response()->json([
                'message' => 'Lens cost expenses are controlled by Lens Tracker. Update the lens cost there instead.',
            ], 422);
        }

        $validated = $request->validate([
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'date' => ['required', 'date'],
            'category' => ['required', 'string', 'max:50'],
        ]);

        $category = trim((string) $validated['category']);
        if ($category === '') {
            return response()->json([
                'message' => 'Please select an expense category.',
            ], 422);
        }

        if ($response = $this->ensureMiscellaneousExpenseLimit($category, (float) $validated['amount'])) {
            return $response;
        }

        $this->upsertExpenseCategory($category);

        DB::table('expenses')
            ->where('expense_id', $expenseId)
            ->update([
                'description' => $validated['description'],
                'amount' => $validated['amount'],
                'date' => $validated['date'],
                'category' => $category,
            ]);

        AuditLog::logManual($request, 'edit', 'expenses', 'expense_id: '.$expenseId, [
            'description' => $validated['description'],
            'amount' => $validated['amount'],
            'date' => $validated['date'],
            'category' => $category,
            'branch_id' => $branchId,
        ]);

        return response()->json([
            'message' => 'Expense updated successfully.',
        ]);
    }

    public function deleteExpense(Request $request, int $expenseId): JsonResponse
    {
        if ($response = $this->ensureExpenseWriteAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $current = tap(
            DB::table('expenses')->where('expense_id', $expenseId),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->first();

        if (! $current) {
            return response()->json([
                'message' => 'Expense record not found for this branch.',
            ], 404);
        }

        if ($this->isLinkedLensCostExpense($current)) {
            return response()->json([
                'message' => 'Lens cost expenses are controlled by Lens Tracker. Delete the lens cost there instead.',
            ], 422);
        }

        DB::table('expenses')
            ->where('expense_id', $expenseId)
            ->delete();

        AuditLog::logManual($request, 'delete', 'expenses', 'expense_id: '.$expenseId, [
            'branch_id' => $branchId,
        ]);

        return response()->json([
            'message' => 'Expense deleted successfully.',
        ]);
    }

    public function expenseCategories(Request $request): JsonResponse
    {
        $this->ensureExpenseCategoriesSchema();

        return response()->json([
            'categories' => DB::table('expense_categories')
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'is_active', 'created_at', 'updated_at']),
        ]);
    }

    public function storeExpenseCategory(Request $request): JsonResponse
    {
        $this->ensureExpenseCategoriesSchema();

        if ($response = $this->ensureExpenseCategoryWriteAccess($request)) {
            return $response;
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50'],
        ]);

        $name = $this->normalizeExpenseCategoryName($validated['name']);
        if ($name === '') {
            return response()->json(['message' => 'Category name is required.'], 422);
        }

        $existing = DB::table('expense_categories')
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->first(['id', 'is_active']);

        if ($existing?->is_active) {
            return response()->json(['message' => 'This expense category already exists.'], 422);
        }

        if ($existing && ! $existing->is_active) {
            DB::table('expense_categories')
                ->where('id', $existing->id)
                ->update([
                    'is_active' => true,
                    'updated_at' => now(),
                ]);

            AuditLog::logManual($request, 'edit', 'expense_categories', 'id: '.$existing->id, [
                'name' => $name,
                'is_active' => true,
            ]);

            return response()->json([
                'message' => 'Expense category restored successfully.',
                'category' => DB::table('expense_categories')->where('id', $existing->id)->first(['id', 'name', 'is_active', 'created_at', 'updated_at']),
            ]);
        }

        $categoryId = DB::table('expense_categories')->insertGetId([
            'name' => $name,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        AuditLog::logManual($request, 'edit', 'expense_categories', 'id: '.$categoryId, [
            'name' => $name,
            'is_active' => true,
        ], 201);

        return response()->json([
            'message' => 'Expense category added successfully.',
            'category' => DB::table('expense_categories')->where('id', $categoryId)->first(['id', 'name', 'is_active', 'created_at', 'updated_at']),
        ], 201);
    }

    public function updateExpenseCategory(Request $request, int $categoryId): JsonResponse
    {
        $this->ensureExpenseCategoriesSchema();

        if ($response = $this->ensureExpenseCategoryWriteAccess($request)) {
            return $response;
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50'],
        ]);

        $current = DB::table('expense_categories')->where('id', $categoryId)->first();
        if (! $current) {
            return response()->json(['message' => 'Expense category not found.'], 404);
        }

        $name = $this->normalizeExpenseCategoryName($validated['name']);
        if ($name === '') {
            return response()->json(['message' => 'Category name is required.'], 422);
        }

        $duplicateId = DB::table('expense_categories')
            ->where('id', '!=', $categoryId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->value('id');

        if ($duplicateId) {
            return response()->json(['message' => 'Another expense category already uses that name.'], 422);
        }

        DB::transaction(function () use ($categoryId, $current, $name): void {
            DB::table('expense_categories')
                ->where('id', $categoryId)
                ->update([
                    'name' => $name,
                    'is_active' => true,
                    'updated_at' => now(),
                ]);

            DB::table('expenses')
                ->where('category', $current->name)
                ->update(['category' => $name]);
        });

        AuditLog::logManual($request, 'edit', 'expense_categories', 'id: '.$categoryId, [
            'previous_name' => $current->name,
            'name' => $name,
        ]);

        return response()->json([
            'message' => 'Expense category updated successfully.',
            'category' => DB::table('expense_categories')->where('id', $categoryId)->first(['id', 'name', 'is_active', 'created_at', 'updated_at']),
        ]);
    }

    public function deleteExpenseCategory(Request $request, int $categoryId): JsonResponse
    {
        $this->ensureExpenseCategoriesSchema();

        if ($response = $this->ensureExpenseCategoryWriteAccess($request)) {
            return $response;
        }

        $current = DB::table('expense_categories')->where('id', $categoryId)->first();
        if (! $current) {
            return response()->json(['message' => 'Expense category not found.'], 404);
        }

        DB::table('expense_categories')
            ->where('id', $categoryId)
            ->update([
                'is_active' => false,
                'updated_at' => now(),
            ]);

        AuditLog::logManual($request, 'delete', 'expense_categories', 'id: '.$categoryId, [
            'name' => $current->name,
        ]);

        return response()->json([
            'message' => 'Expense category deleted successfully.',
        ]);
    }

    public function payments(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $search = trim($request->string('search')->toString());
        $receiptSearch = trim($request->string('receipt_search')->toString());
        $dateFrom = $request->string('date_from')->toString();
        $dateTo = $request->string('date_to')->toString();
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 30);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $receiptPerPage = min(max((int) $request->integer('receipt_per_page', 10), 5), 30);
        $receiptPage = max((int) $request->integer('receipt_page', 1), 1);
        $receiptOffset = ($receiptPage - 1) * $receiptPerPage;

        $transactionQuery = DB::table('sales as s')
            ->leftJoin('billing as b', function ($join): void {
                $join->on('s.billing_id', '=', 'b.id')
                    ->on('s.branch_id', '=', 'b.branch_id');
            });
        $this->applyBranchScope($transactionQuery, 's.branch_id', $branchId);

        if ($dateFrom !== '') {
            $transactionQuery->whereDate('s.date', '>=', $dateFrom);
        }

        if ($dateTo !== '') {
            $transactionQuery->whereDate('s.date', '<=', $dateTo);
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $transactionQuery->where(function ($inner) use ($like): void {
                $inner->where('b.name', 'like', $like)
                    ->orWhere('b.id', 'like', $like)
                    ->orWhere('s.folder_id', 'like', $like)
                    ->orWhere('s.payment_method', 'like', $like)
                    ->orWhere('s.description', 'like', $like)
                    ->orWhere('s.reference', 'like', $like)
                    ->orWhere('s.transaction_id', 'like', $like);
            });
        }

        $transactionTotal = (int) (clone $transactionQuery)->count('s.id');
        $transactionCollected = (float) (clone $transactionQuery)->sum('s.amount_paid');

        $receiptQuery = (clone $transactionQuery)
            ->whereNotNull('b.receipt_number')
            ->where('b.receipt_number', '!=', '');

        if ($receiptSearch !== '') {
            $like = '%'.$receiptSearch.'%';
            $receiptQuery->where(function ($inner) use ($like): void {
                $inner->where('b.receipt_number', 'like', $like)
                    ->orWhere('b.name', 'like', $like)
                    ->orWhere('s.folder_id', 'like', $like)
                    ->orWhere('s.payment_method', 'like', $like)
                    ->orWhere('s.reference', 'like', $like)
                    ->orWhere('s.transaction_id', 'like', $like);
            });
        }

        $receiptTotal = (int) (clone $receiptQuery)->count('s.id');

        $transactions = $receiptQuery
            ->orderByDesc('s.created_at')
            ->limit($receiptPerPage)
            ->offset($receiptOffset)
            ->get([
                's.id',
                's.billing_id',
                's.date',
                's.amount_paid',
                's.payment_method',
                's.description',
                's.folder_id',
                's.reference',
                's.transaction_id',
                's.created_at',
                'b.name',
                'b.receipt_number',
                'b.total_amount',
                'b.discount',
                'b.balance',
                'b.tax',
                'b.nhil_amount',
                'b.getfund_amount',
                'b.covid_levy_amount',
                'b.vat_amount',
                'b.vat_flat_rate_amount',
            ]);

        $outstandingQuery = $this->outstandingBillingQuery($branchId)
            ->select([
                'b.id',
                'b.folder_id',
                'b.name',
                'b.date',
                'b.total_amount',
                'b.discount',
                'b.health_insurance',
                'b.receipt_number',
                'b.status',
                DB::raw('COALESCE(sales_totals.total_sales_paid, 0) as sales_paid'),
                DB::raw('COALESCE(claim_totals.insurance_claimed, 0) as insurance_claimed'),
                DB::raw('COALESCE(sales_totals.total_sales_paid, 0) + COALESCE(claim_totals.insurance_claimed, 0) as total_paid'),
                DB::raw('COALESCE(b.balance, 0) as outstanding_balance'),
            ])
            ->havingRaw('outstanding_balance > 0.009');

        if ($search !== '') {
            $like = '%'.$search.'%';
            $outstandingQuery->where(function ($inner) use ($like): void {
                $inner->where('b.folder_id', 'like', $like)
                    ->orWhere('b.name', 'like', $like)
                    ->orWhere('b.receipt_number', 'like', $like)
                    ->orWhere('b.id', 'like', $like);
            });
        }

        if ($dateFrom !== '') {
            $outstandingQuery->whereDate('b.date', '>=', $dateFrom);
        }

        if ($dateTo !== '') {
            $outstandingQuery->whereDate('b.date', '<=', $dateTo);
        }

        $outstandingTotal = count((clone $outstandingQuery)->get(['b.id']));

        $outstandingRecords = $outstandingQuery
            ->orderByDesc('b.date')
            ->orderByDesc('b.id')
            ->limit($perPage)
            ->offset($offset)
            ->get();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'receipt_search' => $receiptSearch,
            'stats' => [
                'total_collected' => $transactionCollected,
                'transaction_count' => $transactionTotal,
                'outstanding_balance' => (float) (clone $this->outstandingBillingQuery($branchId))
                    ->selectRaw('SUM(COALESCE(b.balance, 0)) as outstanding_balance')
                    ->value('outstanding_balance'),
                'insurance_pending' => (float) tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                    ->where('status', 'pending')
                    ->sum('amount_paid'),
            ],
            'search_mode' => $search !== '',
            'transactions' => $transactions,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $outstandingTotal,
                'total_pages' => (int) ceil(max($outstandingTotal, 1) / $perPage),
            ],
            'transactions_pagination' => [
                'page' => $receiptPage,
                'per_page' => $receiptPerPage,
                'total' => $receiptTotal,
                'total_pages' => (int) ceil(max($receiptTotal, 1) / $receiptPerPage),
            ],
            'outstanding_records' => $outstandingRecords,
        ]);
    }

    public function paymentDetail(Request $request, int $billingId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $patientEmailSelect = Schema::hasColumn('patient_records', 'email')
            ? 'COALESCE(pr.email, c.email, "") as email'
            : 'COALESCE(c.email, "") as email';
        $patientPhoneSelect = Schema::hasColumn('patient_records', 'phone')
            ? 'COALESCE(pr.phone, c.phone, "") as phone'
            : 'COALESCE(c.phone, "") as phone';

        $billing = tap(
            DB::table('billing as b')
                ->leftJoin('patient_records as pr', 'b.patient_id', '=', 'pr.id')
                ->leftJoin('customers as c', 'b.customer_id', '=', 'c.id')
                ->where('b.id', $billingId),
            fn ($query) => $this->applyBranchScope($query, 'b.branch_id', $branchId)
        )->first([
            'b.id',
            'b.patient_id',
            'b.customer_id',
            'b.folder_id',
            'b.name',
            DB::raw($patientEmailSelect),
            DB::raw($patientPhoneSelect),
            'b.consultation_price',
            'b.frame_price',
            'b.lens_price',
            'b.case_price',
            'b.discount',
            'b.tax',
            'b.nhil_amount',
            'b.getfund_amount',
            'b.covid_levy_amount',
            'b.vat_amount',
            'b.vat_flat_rate_amount',
            'b.total_amount',
            'b.health_insurance',
            'b.date',
            'b.status',
            'b.balance',
            'b.receipt_number',
        ]);

        if (! $billing) {
            return response()->json([
                'message' => 'Billing record not found for this branch.',
            ], 404);
        }

        $alignedSalesQuery = $this->alignedSalesEntriesQuery($branchId, $billing);
        $alignedClaimQuery = $this->alignedClaimEntriesQuery($branchId, $billing);

        $salesSummary = (clone $alignedSalesQuery)->selectRaw("
            COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount_paid ELSE 0 END), 0) as cash_paid,
            COALESCE(SUM(CASE WHEN payment_method = 'Mobile Money' THEN amount_paid ELSE 0 END), 0) as mobile_paid,
            COALESCE(SUM(CASE WHEN payment_method = 'Paystack' THEN amount_paid ELSE 0 END), 0) as paystack_paid,
            COALESCE(SUM(CASE WHEN payment_method = 'Insurance' THEN amount_paid ELSE 0 END), 0) as insurance_paid,
            COALESCE(SUM(CASE WHEN payment_method != 'Insurance' THEN amount_paid ELSE 0 END), 0) as total_sales_paid
        ")->first();

        $insuranceClaimed = (float) ((clone $alignedClaimQuery)->sum('amount_paid') ?? 0);

        $billing->cash_paid = (float) ($salesSummary->cash_paid ?? 0);
        $billing->mobile_paid = (float) ($salesSummary->mobile_paid ?? 0);
        $billing->paystack_paid = (float) ($salesSummary->paystack_paid ?? 0);
        $billing->insurance_paid = (float) ($salesSummary->insurance_paid ?? 0);
        $billing->total_sales_paid = (float) ($salesSummary->total_sales_paid ?? 0);
        $billing->insurance_claimed = $insuranceClaimed;
        $billing->total_paid = round($billing->total_sales_paid + $billing->insurance_claimed, 2);
        $billing->calculated_balance = max(round((float) $billing->balance, 2), 0.0);

        $recentTransactions = (clone $alignedSalesQuery)
            ->orderByDesc('created_at')
            ->limit(12)
            ->get([
                'id',
                'date',
                'amount_paid',
                'payment_method',
                'description',
                'transaction_id',
                'reference',
                'created_at',
            ])
            ->map(fn ($transaction) => $this->mapPaymentHistoryTransaction($transaction));

        $insuranceClaims = (clone $alignedClaimQuery)
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->limit(12)
            ->get([
                'id',
                'insurance_provider',
                'insurance_number',
                'insurance_package',
                'patient_organization',
                'amount_paid',
                'date',
                'status',
                DB::raw('date as created_at'),
            ])
            ->map(fn ($claim) => $this->mapInsuranceHistoryTransaction($claim));

        $paymentHistory = $recentTransactions
            ->concat($insuranceClaims)
            ->sortByDesc(function ($entry) {
                return $entry->created_at ?? $entry->date;
            })
            ->values()
            ->take(12);

        $previousBillingTransactions = $this->previousBillingTransactions($branchId, $billing)
            ->sortByDesc(function ($entry) {
                return $entry->created_at ?? $entry->date;
            })
            ->values()
            ->take(20);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'billing' => $billing,
            'recent_transactions' => $paymentHistory,
            'previous_billing_transactions' => $previousBillingTransactions,
            'previous_billing_summary' => [
                'transaction_count' => $previousBillingTransactions->count(),
                'total_paid' => round((float) $previousBillingTransactions->sum('amount_paid'), 2),
            ],
            'insurance_claims' => $insuranceClaims,
            'integrations' => [
                'paystack_configured' => $this->paystackConfigured(),
                'paystack_public_key' => config('services.paystack.public_key'),
            ],
        ]);
    }

    public function initializePaystackPayment(Request $request, int $billingId): JsonResponse
    {
        if ($response = $this->ensureFinancePaymentWriteAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        if (! $this->paystackConfigured()) {
            return response()->json([
                'message' => 'Paystack is not configured yet. Add PAYSTACK_PUBLIC_KEY and PAYSTACK_SECRET_KEY to the backend .env file first.',
            ], 503);
        }

        $billing = $this->billingDetailQuery($branchId)
            ->where('b.id', $billingId)
            ->first();

        if (! $billing) {
            return response()->json([
                'message' => 'Billing record not found for this branch.',
            ], 404);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'email' => ['required', 'email'],
            'callback_url' => ['nullable', 'url'],
        ]);

        $amount = round((float) $validated['amount'], 2);
        $currentBalance = round((float) $billing->calculated_balance, 2);
        if ($amount > $currentBalance + 0.001) {
            return response()->json([
                'message' => 'Amount cannot exceed the outstanding balance.',
            ], 422);
        }

        $reference = 'OPTICPLUS-'.$billing->id.'-'.Str::upper(Str::random(10));
        $callbackUrl = $validated['callback_url']
            ?? config('services.paystack.callback_url')
            ?? rtrim((string) config('app.url'), '/');

        $response = Http::timeout(30)
            ->withToken((string) config('services.paystack.secret_key'))
            ->acceptJson()
            ->post(rtrim((string) config('services.paystack.base_url'), '/').'/transaction/initialize', [
                'email' => $validated['email'],
                'amount' => (string) (int) round($amount * 100),
                'currency' => (string) config('services.paystack.currency', 'GHS'),
                'reference' => $reference,
                'callback_url' => $callbackUrl,
                'metadata' => [
                    'billing_id' => $billing->id,
                    'folder_id' => $billing->folder_id,
                    'branch_id' => $branchId,
                    'patient_name' => $billing->name,
                ],
            ]);

        $payload = $response->json() ?? [];
        if (! $response->successful() || ! ($payload['status'] ?? false)) {
            return response()->json([
                'message' => $payload['message'] ?? 'Paystack transaction initialization failed.',
            ], 502);
        }

        return response()->json([
            'message' => 'Paystack checkout initialized successfully.',
            'reference' => $payload['data']['reference'] ?? $reference,
            'authorization_url' => $payload['data']['authorization_url'] ?? null,
            'access_code' => $payload['data']['access_code'] ?? null,
            'public_key' => config('services.paystack.public_key'),
        ]);
    }

    public function verifyPaystackPayment(Request $request, int $billingId): JsonResponse
    {
        if ($response = $this->ensureFinancePaymentWriteAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        if (! $this->paystackConfigured()) {
            return response()->json([
                'message' => 'Paystack is not configured yet. Add PAYSTACK_PUBLIC_KEY and PAYSTACK_SECRET_KEY to the backend .env file first.',
            ], 503);
        }

        $billing = $this->billingDetailQuery($branchId)
            ->where('b.id', $billingId)
            ->first();

        if (! $billing) {
            return response()->json([
                'message' => 'Billing record not found for this branch.',
            ], 404);
        }

        $validated = $request->validate([
            'reference' => ['required', 'string', 'max:255'],
        ]);

        $response = Http::timeout(30)
            ->withToken((string) config('services.paystack.secret_key'))
            ->acceptJson()
            ->get(rtrim((string) config('services.paystack.base_url'), '/').'/transaction/verify/'.urlencode($validated['reference']));

        $payload = $response->json() ?? [];
        if (! $response->successful() || ! ($payload['status'] ?? false)) {
            return response()->json([
                'message' => $payload['message'] ?? 'Paystack transaction verification failed.',
            ], 502);
        }

        $data = $payload['data'] ?? [];
        if (($data['status'] ?? '') !== 'success') {
            return response()->json([
                'message' => 'Paystack transaction has not been completed successfully yet.',
            ], 422);
        }

        if (
            DB::table('sales')
                ->where('billing_id', $billingId)
                ->where('payment_method', 'Paystack')
                ->where(function ($query) use ($validated, $data): void {
                    $query->where('reference', $validated['reference']);
                    if (! empty($data['id'])) {
                        $query->orWhere('transaction_id', (string) $data['id']);
                    }
                })
                ->exists()
        ) {
            return response()->json([
                'message' => 'This Paystack transaction has already been verified and recorded.',
            ], 409);
        }

        $amount = round(((float) ($data['amount'] ?? 0)) / 100, 2);
        $currentBalance = round((float) $billing->calculated_balance, 2);
        if ($amount <= 0) {
            return response()->json([
                'message' => 'Verified Paystack amount is invalid.',
            ], 422);
        }

        if ($amount > $currentBalance + 0.001) {
            return response()->json([
                'message' => 'Verified Paystack amount exceeds the outstanding balance on this bill.',
            ], 422);
        }

        $receiptNumber = DB::transaction(function () use ($billing, $branchId, $validated, $data, $amount, $currentBalance, $request): string {
            $receiptNumber = $billing->receipt_number ?: $this->generateReceiptNumber($branchId);

            if (! $billing->receipt_number) {
                DB::table('billing')
                    ->where('id', $billing->id)
                    ->where('branch_id', $branchId)
                    ->update(['receipt_number' => $receiptNumber]);
            }

            DB::table('sales')->insert([
                'date' => now()->toDateString(),
                'amount_paid' => $amount,
                'description' => 'Verified Paystack payment for Folder ID: '.$billing->folder_id,
                'billing_id' => $billing->id,
                'patient_id' => $billing->patient_id,
                'customer_id' => $billing->customer_id,
                'transaction_id' => (string) ($data['id'] ?? ''),
                'reference' => $validated['reference'],
                'folder_id' => $billing->folder_id,
                'payment_method' => 'Paystack',
                'branch_id' => $branchId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $remainingBalance = round($currentBalance - $amount, 2);
            $status = $this->resolveBillingStatus(
                $branchId,
                (int) $billing->id,
                max($remainingBalance, 0),
                (float) $billing->total_amount
            );

            DB::table('billing')
                ->where('id', $billing->id)
                ->where('branch_id', $branchId)
                ->update([
                    'balance' => max($remainingBalance, 0),
                    'status' => $status,
                    'receipt_number' => $receiptNumber,
                ]);

            app(BsmiTransactionService::class)->syncForBilling((int) $billing->id, $request->user()?->id);

            return $receiptNumber;
        });

        return response()->json([
            'message' => 'Paystack payment verified and recorded successfully.',
            'receipt_number' => $receiptNumber,
            'amount' => $amount,
            'reference' => $validated['reference'],
        ], 201);
    }

    public function storePayment(Request $request, int $billingId): JsonResponse
    {
        $this->ensureInsuranceProviderSchema();
        if ($response = $this->ensureFinancePaymentWriteAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        $billing = $this->billingDetailQuery($branchId)
            ->where('b.id', $billingId)
            ->first();

        if (! $billing) {
            return response()->json([
                'message' => 'Billing record not found for this branch.',
            ], 404);
        }

        $validated = $request->validate([
            'payment_method' => ['nullable', 'in:Cash,Mobile Money,Paystack,Insurance'],
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'date' => ['nullable', 'date'],
            'transaction_id' => ['nullable', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
            'insurance_provider' => ['nullable', 'string', 'max:50'],
            'insurance_number' => ['nullable', 'string', 'max:255'],
            'insurance_package' => ['nullable', 'string', 'max:255'],
            'patient_organization' => ['nullable', 'string', 'max:255'],
            'payments' => ['nullable', 'array', 'min:1', 'max:2'],
            'payments.*.payment_method' => ['required_with:payments', 'in:Cash,Mobile Money,Paystack,Insurance'],
            'payments.*.amount' => ['required_with:payments', 'numeric', 'min:0.01'],
            'payments.*.date' => ['required_with:payments', 'date'],
            'payments.*.transaction_id' => ['nullable', 'string', 'max:255'],
            'payments.*.reference' => ['nullable', 'string', 'max:255'],
            'payments.*.description' => ['nullable', 'string', 'max:500'],
            'payments.*.insurance_provider' => ['nullable', 'string', 'max:50'],
            'payments.*.insurance_number' => ['nullable', 'string', 'max:255'],
            'payments.*.insurance_package' => ['nullable', 'string', 'max:255'],
            'payments.*.patient_organization' => ['nullable', 'string', 'max:255'],
        ]);

        $paymentEntries = collect($validated['payments'] ?? [[
            'payment_method' => $validated['payment_method'] ?? null,
            'amount' => $validated['amount'] ?? null,
            'date' => $validated['date'] ?? null,
            'transaction_id' => $validated['transaction_id'] ?? null,
            'reference' => $validated['reference'] ?? null,
            'description' => $validated['description'] ?? null,
            'insurance_provider' => $validated['insurance_provider'] ?? null,
            'insurance_number' => $validated['insurance_number'] ?? null,
            'insurance_package' => $validated['insurance_package'] ?? null,
            'patient_organization' => $validated['patient_organization'] ?? null,
        ]])->values();

        $currentBalance = round((float) $billing->calculated_balance, 2);
        $totalRequested = 0.0;
        $methods = [];

        foreach ($paymentEntries as $entry) {
            $amount = round((float) ($entry['amount'] ?? 0), 2);
            $method = (string) ($entry['payment_method'] ?? '');
            $methods[] = $method;
            $totalRequested += $amount;

            if ($amount <= 0) {
                return response()->json([
                    'message' => 'Each payment amount must be greater than zero.',
                ], 422);
            }

            if ($method === '') {
                return response()->json([
                    'message' => 'Each payment entry needs a payment method.',
                ], 422);
            }

            if (in_array($method, ['Mobile Money', 'Paystack'], true) && empty($entry['transaction_id'])) {
                return response()->json([
                    'message' => 'Transaction ID is required for Mobile Money and Paystack entries.',
                ], 422);
            }

            if ($method === 'Insurance' && empty($billing->health_insurance) && empty($entry['insurance_provider'])) {
                return response()->json([
                    'message' => 'Choose an insurance provider before recording this insurance claim.',
                ], 422);
            }
        }

        if ($totalRequested > $currentBalance + 0.001) {
            return response()->json([
                'message' => 'Combined payment amount cannot exceed the outstanding balance.',
            ], 422);
        }

        if ($paymentEntries->count() > 1 && in_array('Paystack', $methods, true)) {
            return response()->json([
                'message' => 'Paystack can only be used in single-payment mode.',
            ], 422);
        }

        $receiptNumber = DB::transaction(function () use ($billing, $branchId, $paymentEntries, $currentBalance, $request): string {
            $receiptNumber = $billing->receipt_number ?: $this->generateReceiptNumber($branchId);

            if (! $billing->receipt_number) {
                DB::table('billing')
                    ->where('id', $billing->id)
                    ->where('branch_id', $branchId)
                    ->update(['receipt_number' => $receiptNumber]);
            }

            $remainingBalance = $currentBalance;

            foreach ($paymentEntries as $entry) {
                $amount = round((float) ($entry['amount'] ?? 0), 2);
                $method = (string) ($entry['payment_method'] ?? '');

                if ($method === 'Insurance') {
                    $provider = trim((string) (($entry['insurance_provider'] ?? '') ?: $billing->health_insurance));
                    DB::table('insurance_claims')->insert([
                        'patient_id' => $billing->patient_id,
                        'folder_id' => $billing->folder_id,
                        'insurance_provider' => $provider,
                        'insurance_number' => ($entry['insurance_number'] ?? '') ?: 'PENDING',
                        'insurance_package' => ($entry['insurance_package'] ?? '') ?: 'Standard',
                        'patient_organization' => ($entry['patient_organization'] ?? '') ?: ($billing->name.' Insurance'),
                        'amount_paid' => $amount,
                        'date' => $entry['date'],
                        'status' => 'pending',
                        'billing_id' => $billing->id,
                        'branch_id' => $branchId,
                    ]);
                } else {
                    DB::table('sales')->insert([
                        'date' => $entry['date'],
                        'amount_paid' => $amount,
                        'description' => ($entry['description'] ?? '') ?: ($method.' payment for Folder ID: '.$billing->folder_id),
                        'billing_id' => $billing->id,
                        'patient_id' => $billing->patient_id,
                        'customer_id' => $billing->customer_id,
                        'transaction_id' => ($entry['transaction_id'] ?? '') ?: null,
                        'reference' => ($entry['reference'] ?? '') ?: null,
                        'folder_id' => $billing->folder_id,
                        'payment_method' => $method,
                        'branch_id' => $branchId,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }

                $remainingBalance = round($remainingBalance - $amount, 2);
            }

            $status = $this->resolveBillingStatus(
                $branchId,
                (int) $billing->id,
                max($remainingBalance, 0),
                (float) $billing->total_amount
            );

            DB::table('billing')
                ->where('id', $billing->id)
                ->where('branch_id', $branchId)
                ->update([
                    'balance' => max($remainingBalance, 0),
                    'status' => $status,
                    'receipt_number' => $receiptNumber,
                ]);

            app(BsmiTransactionService::class)->syncForBilling((int) $billing->id, $request->user()?->id);

            return $receiptNumber;
        });

        return response()->json([
            'message' => $paymentEntries->count() > 1
                ? 'Multiple payments recorded successfully.'
                : (($paymentEntries->first()['payment_method'] ?? '') === 'Insurance'
                    ? 'Insurance claim recorded successfully.'
                    : ($paymentEntries->first()['payment_method'] ?? 'Payment').' payment recorded successfully.'),
            'receipt_number' => $receiptNumber,
            'payment_methods' => $paymentEntries->pluck('payment_method')->values(),
            'payment_count' => $paymentEntries->count(),
        ], 201);
    }

    private function applySalesFilters($query, Request $request): void
    {
        $search = trim($request->string('search')->toString());
        $paymentMethod = $request->string('payment_method')->toString();

        if ($request->filled('date_from')) {
            $query->whereDate('s.date', '>=', $request->string('date_from')->toString());
        }

        if ($request->filled('date_to')) {
            $query->whereDate('s.date', '<=', $request->string('date_to')->toString());
        }

        if ($paymentMethod && $paymentMethod !== 'all') {
            $query->where('s.payment_method', $paymentMethod);
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('b.name', 'like', $like)
                    ->orWhere('s.folder_id', 'like', $like)
                    ->orWhere('s.description', 'like', $like)
                    ->orWhere('s.payment_method', 'like', $like)
                    ->orWhere('s.reference', 'like', $like);
            });
        }
    }

    private function applyExpenseFilters($query, Request $request): void
    {
        $filter = $request->string('filter')->toString() ?: 'all';
        $startDate = $request->string('start_date')->toString();
        $endDate = $request->string('end_date')->toString();
        $category = $request->string('category')->toString();
        $search = trim($request->string('search')->toString());
        $today = now();

        if ($startDate && $endDate) {
            $query->whereBetween('date', [$startDate, $endDate]);
        } elseif ($startDate) {
            $query->whereDate('date', '>=', $startDate);
        } elseif ($endDate) {
            $query->whereDate('date', '<=', $endDate);
        } elseif ($filter !== 'all') {
            match ($filter) {
                'daily' => $query->whereDate('date', $today->toDateString()),
                'weekly' => $query->whereDate('date', '>=', $today->copy()->startOfWeek()->toDateString()),
                'monthly' => $query->whereDate('date', '>=', $today->copy()->startOfMonth()->toDateString()),
                'yearly' => $query->whereDate('date', '>=', $today->copy()->startOfYear()->toDateString()),
                default => null,
            };
        }

        if ($category && $category !== 'all') {
            $query->where('category', $category);
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('description', 'like', $like)
                    ->orWhere('category', 'like', $like);
            });
        }
    }

    private function applyExpenseRecorderScope($query, Request $request): void
    {
        $user = $request->user();
        $role = $user?->normalized_role ?? $user?->role;

        if ($role !== 'receptionist' || ! Schema::hasColumn('expenses', 'created_by')) {
            return;
        }

        $query->where('created_by', $user?->id);
    }

    private function outstandingBillingQuery(int $branchId)
    {
        $salesTotals = $this->alignedSalesTotalsQuery();
        $claimTotals = $this->alignedClaimTotalsQuery();

        $query = DB::table('billing as b')
            ->leftJoin('patient_records as pr', 'b.folder_id', '=', 'pr.folder_id')
            ->leftJoinSub($salesTotals, 'sales_totals', function ($join): void {
                $join->on('b.id', '=', 'sales_totals.billing_id');
            })
            ->leftJoinSub($claimTotals, 'claim_totals', function ($join): void {
                $join->on('b.id', '=', 'claim_totals.billing_id');
            });
        $this->applyBranchScope($query, 'b.branch_id', $branchId);

        return $query;
    }

    private function billingDetailQuery(int $branchId)
    {
        $patientEmailSelect = Schema::hasColumn('patient_records', 'email')
            ? 'COALESCE(pr.email, c.email, "") as email'
            : 'COALESCE(c.email, "") as email';
        $patientPhoneSelect = Schema::hasColumn('patient_records', 'phone')
            ? 'COALESCE(pr.phone, c.phone, "") as phone'
            : 'COALESCE(c.phone, "") as phone';

        $salesTotals = $this->alignedSalesTotalsQuery();
        $claimTotals = $this->alignedClaimTotalsQuery();

        $query = DB::table('billing as b')
            ->leftJoin('patient_records as pr', 'b.patient_id', '=', 'pr.id')
            ->leftJoin('customers as c', 'b.customer_id', '=', 'c.id')
            ->leftJoinSub($salesTotals, 'sales_totals', function ($join): void {
                $join->on('b.id', '=', 'sales_totals.billing_id');
            })
            ->leftJoinSub($claimTotals, 'claim_totals', function ($join): void {
                $join->on('b.id', '=', 'claim_totals.billing_id');
            })
            ->select([
                'b.id',
                'b.patient_id',
                'b.customer_id',
                'b.folder_id',
                'b.name',
                DB::raw($patientEmailSelect),
                DB::raw($patientPhoneSelect),
                'b.branch_id',
                'b.consultation_price',
                'b.frame_price',
                'b.lens_price',
                'b.case_price',
                'b.discount',
                'b.tax',
                'b.nhil_amount',
                'b.getfund_amount',
                'b.covid_levy_amount',
                'b.vat_amount',
                'b.vat_flat_rate_amount',
                'b.total_amount',
                'b.health_insurance',
                'b.date',
                'b.status',
                'b.balance',
                'b.receipt_number',
                DB::raw('COALESCE(sales_totals.cash_paid, 0) as cash_paid'),
                DB::raw('COALESCE(sales_totals.mobile_paid, 0) as mobile_paid'),
                DB::raw('COALESCE(sales_totals.paystack_paid, 0) as paystack_paid'),
                DB::raw('COALESCE(sales_totals.insurance_paid, 0) as insurance_paid'),
                DB::raw('COALESCE(sales_totals.total_sales_paid, 0) as total_sales_paid'),
                DB::raw('COALESCE(claim_totals.insurance_claimed, 0) as insurance_claimed'),
                DB::raw('COALESCE(sales_totals.total_sales_paid, 0) + COALESCE(claim_totals.insurance_claimed, 0) as total_paid'),
                DB::raw('COALESCE(b.balance, 0) as calculated_balance'),
            ]);
        $this->applyBranchScope($query, 'b.branch_id', $branchId);

        return $query;
    }

    private function alignedSalesTotalsQuery()
    {
        return DB::table('sales as s')
            ->join('billing as matched_billing', function ($join): void {
                $join->on('s.billing_id', '=', 'matched_billing.id')
                    ->on('s.branch_id', '=', 'matched_billing.branch_id')
                    ->on('s.folder_id', '=', 'matched_billing.folder_id')
                    ->whereRaw('(s.patient_id IS NULL OR matched_billing.patient_id IS NULL OR s.patient_id = matched_billing.patient_id)');
            })
            ->select(
                's.billing_id',
                DB::raw("SUM(CASE WHEN s.payment_method = 'Cash' THEN s.amount_paid ELSE 0 END) as cash_paid"),
                DB::raw("SUM(CASE WHEN s.payment_method = 'Mobile Money' THEN s.amount_paid ELSE 0 END) as mobile_paid"),
                DB::raw("SUM(CASE WHEN s.payment_method = 'Paystack' THEN s.amount_paid ELSE 0 END) as paystack_paid"),
                DB::raw("SUM(CASE WHEN s.payment_method = 'Insurance' THEN s.amount_paid ELSE 0 END) as insurance_paid"),
                DB::raw("SUM(CASE WHEN s.payment_method != 'Insurance' THEN s.amount_paid ELSE 0 END) as total_sales_paid")
            )
            ->whereNotNull('s.billing_id')
            ->groupBy('s.billing_id');
    }

    private function alignedClaimTotalsQuery()
    {
        return DB::table('insurance_claims as ic')
            ->join('billing as matched_billing', function ($join): void {
                $join->on('ic.billing_id', '=', 'matched_billing.id')
                    ->on('ic.branch_id', '=', 'matched_billing.branch_id')
                    ->on('ic.folder_id', '=', 'matched_billing.folder_id')
                    ->whereRaw('(ic.patient_id IS NULL OR matched_billing.patient_id IS NULL OR ic.patient_id = matched_billing.patient_id)');
            })
            ->select('ic.billing_id', DB::raw('SUM(ic.amount_paid) as insurance_claimed'))
            ->whereNotNull('ic.billing_id')
            ->groupBy('ic.billing_id');
    }

    private function alignedSalesEntriesQuery(int $branchId, object $billing)
    {
        return tap(
            DB::table('sales')
                ->where('billing_id', $billing->id)
                ->where('folder_id', $billing->folder_id)
                ->where(function ($query) use ($billing): void {
                    if ($billing->patient_id === null) {
                        $query->whereNull('patient_id');

                        return;
                    }

                    $query->where('patient_id', $billing->patient_id)
                        ->orWhereNull('patient_id');
                }),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
    }

    private function alignedClaimEntriesQuery(int $branchId, object $billing)
    {
        return tap(
            DB::table('insurance_claims')
                ->where('billing_id', $billing->id)
                ->where('folder_id', $billing->folder_id)
                ->when($billing->patient_id !== null, fn ($query) => $query->where('patient_id', $billing->patient_id)),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
    }

    private function previousBillingTransactions(int $branchId, object $billing)
    {
        $previousBills = tap(
            DB::table('billing as b')->where('b.id', '!=', $billing->id),
            fn ($query) => $this->applyBranchScope($query, 'b.branch_id', $branchId)
        );

        $this->applyRelatedBillingIdentityScope($previousBills, $billing, 'b');

        $previousBills = $previousBills
            ->orderByDesc('b.date')
            ->orderByDesc('b.id')
            ->limit(12)
            ->get([
                'b.id',
                'b.patient_id',
                'b.customer_id',
                'b.folder_id',
                'b.name',
                'b.date',
                'b.receipt_number',
            ]);

        if ($previousBills->isEmpty()) {
            return collect();
        }

        $transactions = collect();

        foreach ($previousBills as $previousBill) {
            $billSales = $this->alignedSalesEntriesQuery($branchId, $previousBill)
                ->orderByDesc('created_at')
                ->limit(12)
                ->get([
                    'id',
                    'date',
                    'amount_paid',
                    'payment_method',
                    'description',
                    'transaction_id',
                    'reference',
                    'created_at',
                ])
                ->map(function ($transaction) use ($previousBill) {
                    $mapped = $this->mapPaymentHistoryTransaction($transaction);
                    $mapped->billing_id = $previousBill->id;
                    $mapped->billing_receipt_number = $previousBill->receipt_number;
                    $mapped->billing_folder_id = $previousBill->folder_id;
                    $mapped->billing_date = $previousBill->date;

                    return $mapped;
                });

            $billClaims = $this->alignedClaimEntriesQuery($branchId, $previousBill)
                ->orderByDesc('date')
                ->orderByDesc('id')
                ->limit(12)
                ->get([
                    'id',
                    'insurance_provider',
                    'insurance_number',
                    'insurance_package',
                    'patient_organization',
                    'amount_paid',
                    'date',
                    'status',
                    DB::raw('date as created_at'),
                ])
                ->map(function ($claim) use ($previousBill) {
                    $mapped = $this->mapInsuranceHistoryTransaction($claim);
                    $mapped->billing_id = $previousBill->id;
                    $mapped->billing_receipt_number = $previousBill->receipt_number;
                    $mapped->billing_folder_id = $previousBill->folder_id;
                    $mapped->billing_date = $previousBill->date;

                    return $mapped;
                });

            $transactions = $transactions->concat($billSales)->concat($billClaims);
        }

        return $transactions;
    }

    private function applyRelatedBillingIdentityScope($query, object $billing, string $alias = 'b'): void
    {
        $query->where(function ($inner) use ($billing, $alias): void {
            $hasIdentity = false;

            if (! empty($billing->folder_id)) {
                $inner->where($alias.'.folder_id', $billing->folder_id);
                $hasIdentity = true;
            }

            if (! empty($billing->patient_id)) {
                if ($hasIdentity) {
                    $inner->orWhere($alias.'.patient_id', $billing->patient_id);
                } else {
                    $inner->where($alias.'.patient_id', $billing->patient_id);
                    $hasIdentity = true;
                }
            }

            if (! empty($billing->customer_id)) {
                if ($hasIdentity) {
                    $inner->orWhere($alias.'.customer_id', $billing->customer_id);
                } else {
                    $inner->where($alias.'.customer_id', $billing->customer_id);
                    $hasIdentity = true;
                }
            }

            if (! $hasIdentity) {
                $inner->whereRaw('1 = 0');
            }
        });
    }

    private function mapPaymentHistoryTransaction(object $transaction): object
    {
        $transaction->entry_type = 'payment';
        $transaction->entry_label = $transaction->payment_method;

        return $transaction;
    }

    private function mapInsuranceHistoryTransaction(object $claim): object
    {
        $claim->entry_type = 'claim';
        $claim->entry_label = 'Insurance Claim';
        $claim->payment_method = 'Insurance';
        $claim->reference = $claim->insurance_number;
        $claim->transaction_id = null;
        $claim->description = trim(implode(' / ', array_filter([
            $claim->insurance_provider,
            $claim->insurance_package,
            $claim->status,
        ])));

        return $claim;
    }

    private function resolveBillingStatus(int $branchId, int $billingId, float $balance, float $totalAmount): string
    {
        $hasOpenInsuranceClaims = tap(
            DB::table('insurance_claims')
                ->where('billing_id', $billingId)
                ->whereIn('status', ['pending', 'claimed']),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->exists();

        if ($hasOpenInsuranceClaims) {
            return 'insurance_pending';
        }

        if ($balance <= 0.5) {
            return 'paid';
        }

        $hasRecoveries = tap(
            DB::table('sales')
                ->where('billing_id', $billingId)
                ->where('payment_method', '!=', 'Insurance'),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->exists()
            || tap(
                DB::table('insurance_claims')->where('billing_id', $billingId),
                fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
            )->exists();

        if (! $hasRecoveries && abs($balance - $totalAmount) <= 0.5) {
            return 'balance_remaining';
        }

        return 'pending';
    }

    private function ensureInsuranceProviderSchema(): void
    {
        if (! Schema::hasTable('insurance_providers')) {
            Schema::create('insurance_providers', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 80)->unique();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('insurance_providers', 'is_active')) {
            Schema::table('insurance_providers', function (Blueprint $table): void {
                $table->boolean('is_active')->default(true)->after('name');
            });
        }

        if (Schema::hasTable('insurance_claims')) {
            if (! Schema::hasColumn('insurance_claims', 'insurance_package')) {
                Schema::table('insurance_claims', function (Blueprint $table): void {
                    $table->string('insurance_package', 255)->default('');
                });
            }

            if (! Schema::hasColumn('insurance_claims', 'patient_organization')) {
                Schema::table('insurance_claims', function (Blueprint $table): void {
                    $table->string('patient_organization', 255)->default('');
                });
            }

            if (! Schema::hasColumn('insurance_claims', 'billing_id')) {
                Schema::table('insurance_claims', function (Blueprint $table): void {
                    $table->integer('billing_id')->nullable()->index();
                });
            }

            if (! Schema::hasColumn('insurance_claims', 'branch_id')) {
                Schema::table('insurance_claims', function (Blueprint $table): void {
                    $table->integer('branch_id')->default(1)->index();
                });
            }
        }
    }

    private function generateReceiptNumber(int $branchId): string
    {
        $year = now()->format('Y');

        $lastReceipt = tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('receipt_number', 'like', "BOC/RCPT/$year/%")
            ->orderByDesc('receipt_number')
            ->value('receipt_number');

        $sequence = 1;
        if ($lastReceipt && preg_match('/(\d{4})$/', $lastReceipt, $matches) === 1) {
            $sequence = ((int) $matches[1]) + 1;
        }

        return sprintf('BOC/RCPT/%s/%04d', $year, $sequence);
    }

    private function ensureExpenseCategoriesSchema(): void
    {
        if (! Schema::hasTable('expense_categories')) {
            Schema::create('expense_categories', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 50)->unique();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('expense_categories', 'is_active')) {
            Schema::table('expense_categories', function (Blueprint $table): void {
                $table->boolean('is_active')->default(true)->after('name');
            });
        }

        if (! DB::table('expense_categories')->exists()) {
            foreach (self::DEFAULT_EXPENSE_CATEGORIES as $category) {
                $this->upsertExpenseCategory($category);
            }

            $existingExpenseCategories = DB::table('expenses')
                ->whereNotNull('category')
                ->where('category', '!=', '')
                ->distinct()
                ->pluck('category');

            foreach ($existingExpenseCategories as $category) {
                $this->upsertExpenseCategory((string) $category);
            }
        }
    }

    private function ensureExpenseRecorderSchema(): void
    {
        $this->ensureExpenseIdAutoIncrement();

        if (! Schema::hasColumn('expenses', 'created_by')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->unsignedBigInteger('created_by')->nullable()->index();
            });
        }
    }

    private function ensureExpenseIdAutoIncrement(): void
    {
        $column = DB::selectOne("
            SELECT EXTRA
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'expenses'
              AND COLUMN_NAME = 'expense_id'
        ");

        if (! str_contains(strtolower((string) ($column->EXTRA ?? '')), 'auto_increment')) {
            DB::statement('ALTER TABLE expenses MODIFY expense_id INT NOT NULL AUTO_INCREMENT');
        }
    }

    private function ensureLensCostExpensesSynced(int $branchId): void
    {
        if (! Schema::hasTable('expenses') || ! Schema::hasTable('lens_costs')) {
            return;
        }

        $this->ensureExpenseCategoriesSchema();
        $this->ensureExpenseRecorderSchema();
        $this->ensureLensExpenseLinkSchema();
        $this->ensureActiveSystemExpenseCategory('Lens');
        $this->deleteStaleLensCostExpenses($branchId);

        $query = DB::table('lens_costs as lc')
            ->leftJoin('billing as b', function ($join): void {
                $join->on('lc.billing_id', '=', 'b.id')
                    ->on('lc.branch_id', '=', 'b.branch_id');
            })
            ->select([
                'lc.id',
                'lc.billing_id',
                'lc.branch_id',
                'lc.folder_id',
                'lc.patient_id',
                'lc.cost_price',
                'lc.entered_by',
                'lc.entered_at',
                'b.name as billing_name',
                'b.folder_id as billing_folder_id',
            ])
            ->where('lc.cost_price', '>', 0)
            ->orderBy('lc.id');

        $this->applyBranchScope($query, 'lc.branch_id', $branchId);

        $query->chunk(200, function ($rows): void {
            foreach ($rows as $row) {
                $this->upsertLensCostExpenseRow($row);
            }
        });
    }

    private function ensureLensExpenseLinkSchema(): void
    {
        if (! Schema::hasTable('expenses')) {
            return;
        }

        if (! Schema::hasColumn('expenses', 'source_type')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->string('source_type', 50)->nullable()->after('created_by')->index();
            });
        }

        if (! Schema::hasColumn('expenses', 'source_id')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->unsignedBigInteger('source_id')->nullable()->after('source_type')->index();
            });
        }
    }

    private function upsertLensCostExpenseRow(object $row): void
    {
        $branchId = (int) $row->branch_id;
        $billingId = (int) $row->billing_id;
        $costPrice = round((float) $row->cost_price, 2);

        if ($branchId <= 0 || $billingId <= 0 || $costPrice <= 0) {
            return;
        }

        $patientName = trim((string) ($row->billing_name ?? $row->name ?? ''));
        $folderId = trim((string) ($row->billing_folder_id ?? $row->folder_id ?? ''));
        $descriptionParts = ['Lens cost'];
        if ($patientName !== '') {
            $descriptionParts[] = $patientName;
        }
        if ($folderId !== '') {
            $descriptionParts[] = 'Folder '.$folderId;
        }

        $entryDate = trim((string) ($row->entered_at ?? ''));
        $payload = [
            'description' => implode(' - ', $descriptionParts),
            'amount' => $costPrice,
            'date' => $entryDate !== '' ? substr($entryDate, 0, 10) : now()->toDateString(),
            'category' => 'Lens',
            'branch_id' => $branchId,
            'created_by' => $row->entered_by ?? null,
        ];

        if (Schema::hasColumn('expenses', 'updated_at')) {
            $payload['updated_at'] = now();
        }

        $existingExpenseId = DB::table('expenses')
            ->where('branch_id', $branchId)
            ->where('source_type', 'lens_cost')
            ->where('source_id', $billingId)
            ->value('expense_id');

        if ($existingExpenseId) {
            DB::table('expenses')
                ->where('expense_id', $existingExpenseId)
                ->update($payload);
            return;
        }

        if (Schema::hasColumn('expenses', 'created_at')) {
            $payload['created_at'] = now();
        }

        $payload['source_type'] = 'lens_cost';
        $payload['source_id'] = $billingId;

        DB::table('expenses')->insert($payload);
    }

    private function deleteStaleLensCostExpenses(int $branchId): void
    {
        if (! Schema::hasColumn('expenses', 'source_type') || ! Schema::hasColumn('expenses', 'source_id')) {
            return;
        }

        $staleQuery = DB::table('expenses as e')
            ->leftJoin('lens_costs as lc', function ($join): void {
                $join->on('e.source_id', '=', 'lc.billing_id')
                    ->on('e.branch_id', '=', 'lc.branch_id');
            })
            ->where('e.source_type', 'lens_cost')
            ->where(function ($inner): void {
                $inner->whereNull('lc.id')
                    ->orWhere('lc.cost_price', '<=', 0);
            });

        $this->applyBranchScope($staleQuery, 'e.branch_id', $branchId);

        $staleIds = $staleQuery->pluck('e.expense_id');
        if ($staleIds->isEmpty()) {
            return;
        }

        DB::table('expenses')
            ->whereIn('expense_id', $staleIds)
            ->delete();
    }

    private function ensureActiveSystemExpenseCategory(string $name): void
    {
        if (! Schema::hasTable('expense_categories')) {
            return;
        }

        $normalized = $this->normalizeExpenseCategoryName($name);
        if ($normalized === '') {
            return;
        }

        $existing = DB::table('expense_categories')
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($normalized)])
            ->first(['id']);

        $payload = ['name' => $normalized, 'is_active' => true];
        if (Schema::hasColumn('expense_categories', 'updated_at')) {
            $payload['updated_at'] = now();
        }

        if ($existing) {
            DB::table('expense_categories')
                ->where('id', $existing->id)
                ->update($payload);
            return;
        }

        if (Schema::hasColumn('expense_categories', 'created_at')) {
            $payload['created_at'] = now();
        }

        DB::table('expense_categories')->insert($payload);
    }

    private function isLinkedLensCostExpense(object $expense): bool
    {
        return Schema::hasColumn('expenses', 'source_type')
            && (string) ($expense->source_type ?? '') === 'lens_cost';
    }

    private function expenseCategoryOptions()
    {
        return DB::table('expense_categories')
            ->where('is_active', true)
            ->orderBy('name')
            ->pluck('name');
    }

    private function upsertExpenseCategory(string $name): void
    {
        $normalized = $this->normalizeExpenseCategoryName($name);
        if ($normalized === '') {
            return;
        }

        $existing = DB::table('expense_categories')
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($normalized)])
            ->first(['id', 'is_active']);

        if ($existing?->is_active) {
            return;
        }

        if ($existing && ! $existing->is_active) {
            return;
        }

        DB::table('expense_categories')->insert([
            'name' => $normalized,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function normalizeExpenseCategoryName(string $name): string
    {
        $normalized = trim(preg_replace('/\s+/', ' ', $name) ?? '');

        return $normalized;
    }

    private function ensureExpenseCategoryWriteAccess(Request $request): ?JsonResponse
    {
        $user = $request->user();
        $role = $user?->normalized_role ?? $user?->role;

        if (! in_array($role, ['manager', 'accountant'], true) && ! ($user?->is_admin ?? false)) {
            return response()->json([
                'message' => 'Only the General Manager and Accountant can manage expense categories.',
            ], 403);
        }

        return null;
    }

    private function ensureExpenseWriteAccess(Request $request): ?JsonResponse
    {
        $user = $request->user();
        $role = $user?->normalized_role ?? $user?->role;

        if (! in_array($role, ['manager', 'accountant'], true) && ! ($user?->is_admin ?? false)) {
            return response()->json([
                'message' => 'Only the General Manager and Accountant can edit or delete expenses.',
            ], 403);
        }

        return null;
    }

    private function ensureMiscellaneousExpenseLimit(string $category, float $amount): ?JsonResponse
    {
        if (mb_strtolower($this->normalizeExpenseCategoryName($category)) !== 'miscellaneous') {
            return null;
        }

        if ($amount <= 200) {
            return null;
        }

        return response()->json([
            'message' => 'Miscellaneous expenses cannot exceed GH₵200.00.',
        ], 422);
    }

    private function buildMonthlyReportDataset(int $branchId, string $month): array
    {
        [$startDate, $endDate, $label] = $this->reportMonthRange($month);

        $billingQuery = tap(
            DB::table('billing')->whereBetween('date', [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $salesQuery = tap(
            DB::table('sales')->whereBetween('date', [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $insuranceQuery = tap(
            DB::table('insurance_claims')->whereBetween('date', [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $expenseQuery = tap(
            DB::table('expenses')->whereBetween('date', [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );
        $bsmiQuery = tap(
            DB::table('bsmi_transactions')->whereBetween(DB::raw('DATE(created_at)'), [$startDate, $endDate]),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        );

        $billing = (clone $billingQuery)
            ->selectRaw('
                COUNT(*) as bills,
                COALESCE(SUM(consultation_price), 0) as consultation_total,
                COALESCE(SUM(frame_price), 0) as frame_total,
                COALESCE(SUM(lens_price), 0) as lens_total,
                COALESCE(SUM(case_price), 0) as case_total,
                COALESCE(SUM(discount), 0) as discount_total,
                COALESCE(SUM(total_amount), 0) as billed_total,
                COALESCE(SUM(balance), 0) as outstanding_balance
            ')
            ->first();

        $salesByMethod = (clone $salesQuery)
            ->select('payment_method', DB::raw('SUM(amount_paid) as total'))
            ->groupBy('payment_method')
            ->pluck('total', 'payment_method');

        $insuranceByStatus = (clone $insuranceQuery)
            ->select('status', DB::raw('SUM(amount_paid) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $bsmi = (clone $bsmiQuery)
            ->selectRaw('
                COALESCE(SUM(surplus_for_bsmi), 0) as surplus_total,
                COALESCE(SUM(staff_share), 0) as staff_share_total,
                COALESCE(SUM(reinvestment_share), 0) as reinvestment_total,
                COALESCE(SUM(tax_share), 0) as tax_total,
                COALESCE(SUM(operational_share), 0) as operational_total
            ')
            ->first();

        $expenseRows = collect((clone $expenseQuery)
            ->select('category', DB::raw('SUM(amount) as total'))
            ->groupBy('category')
            ->orderBy('category')
            ->get())
            ->map(function ($row) {
                return [
                    'key' => 'expense_'.md5((string) $row->category),
                    'description' => $this->normalizeExpenseCategoryLabel((string) $row->category),
                    'amount' => round((float) $row->total, 2),
                    'note' => 'Expense category total for the selected month',
                ];
            })
            ->sortByDesc('amount')
            ->values();

        $cashTotal = 0.0;
        $mobileMoneyTotal = 0.0;
        $paystackTotal = 0.0;
        $bankTransferTotal = 0.0;
        $otherCollectionsTotal = 0.0;

        foreach ($salesByMethod as $method => $amount) {
            $bucket = $this->classifyPaymentMethod((string) $method);
            $value = round((float) $amount, 2);
            match ($bucket) {
                'cash' => $cashTotal += $value,
                'mobile_money' => $mobileMoneyTotal += $value,
                'paystack' => $paystackTotal += $value,
                'bank_transfer' => $bankTransferTotal += $value,
                default => $otherCollectionsTotal += $value,
            };
        }

        $insurancePaid = round((float) ($insuranceByStatus['paid'] ?? 0), 2);
        $insuranceClaimed = round((float) ($insuranceByStatus['claimed'] ?? 0), 2);
        $insurancePending = round((float) ($insuranceByStatus['pending'] ?? 0), 2);
        $grossBilled = round((float) ($billing->billed_total ?? 0), 2);
        $discountTotal = round((float) ($billing->discount_total ?? 0), 2);
        $netBilled = max($grossBilled - $discountTotal, 0);
        $totalCollections = round($cashTotal + $mobileMoneyTotal + $paystackTotal + $bankTransferTotal + $otherCollectionsTotal + $insurancePaid, 2);
        $totalExpenses = round((float) $expenseRows->sum('amount'), 2);
        $lensExpenses = round((float) $expenseRows
            ->filter(fn ($row) => strtolower((string) ($row['description'] ?? '')) === 'lens')
            ->sum('amount'), 2);
        $netOperating = round($totalCollections - $totalExpenses, 2);
        $netBilledPosition = round($netBilled - $totalExpenses, 2);

        return [
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'month' => $month,
            'month_label' => $label,
            'summary' => [
                'gross_billed' => $grossBilled,
                'net_billed' => $netBilled,
                'total_collections' => $totalCollections,
                'total_expenses' => $totalExpenses,
                'lens_expenses' => $lensExpenses,
                'net_operating' => $netOperating,
                'net_billed_position' => $netBilledPosition,
                'outstanding_balance' => round((float) ($billing->outstanding_balance ?? 0), 2),
                'insurance_pending' => $insurancePending,
                'bsmi_surplus' => round((float) ($bsmi->surplus_total ?? 0), 2),
            ],
            'sections' => [
                [
                    'key' => 'revenue',
                    'title' => 'Revenue Composition',
                    'rows' => [
                        ['key' => 'consultation_total', 'description' => 'Consultation Revenue', 'amount' => round((float) ($billing->consultation_total ?? 0), 2), 'note' => 'Billed consultation value for the month'],
                        ['key' => 'frame_total', 'description' => 'Frame Revenue', 'amount' => round((float) ($billing->frame_total ?? 0), 2), 'note' => 'Billed frame value for the month'],
                        ['key' => 'lens_total', 'description' => 'Lens Revenue', 'amount' => round((float) ($billing->lens_total ?? 0), 2), 'note' => 'Billed lens value for the month'],
                        ['key' => 'case_total', 'description' => 'Case / Accessories Revenue', 'amount' => round((float) ($billing->case_total ?? 0), 2), 'note' => 'Billed accessory and case value for the month'],
                        ['key' => 'discount_total', 'description' => 'Discounts Granted', 'amount' => $discountTotal, 'note' => 'Total monthly discounts recorded on billing'],
                        ['key' => 'gross_billed_total', 'description' => 'Gross Billed Revenue', 'amount' => $grossBilled, 'note' => 'Total billed amount before collection analysis'],
                        ['key' => 'net_billed_total', 'description' => 'Net Billed Revenue Less Discounts', 'amount' => $netBilled, 'note' => 'Gross billed revenue after discount deductions'],
                    ],
                ],
                [
                    'key' => 'collections',
                    'title' => 'Collections & Recovery',
                    'rows' => [
                        ['key' => 'cash_collections', 'description' => 'Cash Collections', 'amount' => round($cashTotal, 2), 'note' => 'Payments collected through cash'],
                        ['key' => 'mobile_money_collections', 'description' => 'Mobile Money Collections', 'amount' => round($mobileMoneyTotal, 2), 'note' => 'Payments collected through mobile money'],
                        ['key' => 'paystack_collections', 'description' => 'Paystack / Digital Collections', 'amount' => round($paystackTotal, 2), 'note' => 'Payments collected through Paystack and similar digital channels'],
                        ['key' => 'bank_transfer_collections', 'description' => 'Bank Transfer Collections', 'amount' => round($bankTransferTotal, 2), 'note' => 'Payments collected through bank transfer'],
                        ['key' => 'other_collections', 'description' => 'Other Collections', 'amount' => round($otherCollectionsTotal, 2), 'note' => 'Other payment methods posted in sales'],
                        ['key' => 'insurance_paid', 'description' => 'Insurance Claims Paid', 'amount' => $insurancePaid, 'note' => 'Claims settled by insurers within the month'],
                        ['key' => 'insurance_claimed', 'description' => 'Insurance Claims Claimed', 'amount' => $insuranceClaimed, 'note' => 'Claims moved to claimed status within the month'],
                        ['key' => 'insurance_pending', 'description' => 'Insurance Claims Pending', 'amount' => $insurancePending, 'note' => 'Pending insurance claims raised within the month'],
                        ['key' => 'outstanding_balance', 'description' => 'Outstanding Customer Balance', 'amount' => round((float) ($billing->outstanding_balance ?? 0), 2), 'note' => 'Open balance remaining on bills created within the month'],
                        ['key' => 'total_collections', 'description' => 'Total Collected Revenue', 'amount' => $totalCollections, 'note' => 'Cash and insurance receipts recognized for the month'],
                    ],
                ],
                [
                    'key' => 'bsmi',
                    'title' => 'BSMI Allocation',
                    'rows' => [
                        ['key' => 'bsmi_surplus', 'description' => 'BSMI Surplus Above Base Price', 'amount' => round((float) ($bsmi->surplus_total ?? 0), 2), 'note' => 'Frame surplus captured in bsmi_transactions'],
                        ['key' => 'bsmi_staff_share', 'description' => 'Staff Incentive Pool (40%)', 'amount' => round((float) ($bsmi->staff_share_total ?? 0), 2), 'note' => '40 percent allocation from BSMI surplus'],
                        ['key' => 'bsmi_reinvestment_share', 'description' => 'Reinvestment Pool (30%)', 'amount' => round((float) ($bsmi->reinvestment_total ?? 0), 2), 'note' => '30 percent allocation from BSMI surplus'],
                        ['key' => 'bsmi_tax_share', 'description' => 'Tax & Statutory Pool (15%)', 'amount' => round((float) ($bsmi->tax_total ?? 0), 2), 'note' => '15 percent allocation from BSMI surplus'],
                        ['key' => 'bsmi_operational_share', 'description' => 'Operational Pool (15%)', 'amount' => round((float) ($bsmi->operational_total ?? 0), 2), 'note' => '15 percent allocation from BSMI surplus'],
                    ],
                ],
                [
                    'key' => 'expenses',
                    'title' => 'Expense Schedule',
                    'rows' => [
                        ...$expenseRows,
                        ['key' => 'total_expenses', 'description' => 'Total Operating Expenses', 'amount' => $totalExpenses, 'note' => 'Total expenses posted within the month'],
                    ],
                ],
                [
                    'key' => 'net_position',
                    'title' => 'Net Position',
                    'rows' => [
                        ['key' => 'net_position_collections', 'description' => 'Total Collected Revenue', 'amount' => $totalCollections, 'note' => 'Collections recognized for the month'],
                        ['key' => 'net_position_expenses', 'description' => 'Total Operating Expenses', 'amount' => $totalExpenses, 'note' => 'Monthly operating expenses'],
                        ['key' => 'net_operating_position', 'description' => 'Net Operating Position', 'amount' => $netOperating, 'note' => 'Collections less operating expenses'],
                        ['key' => 'net_billed_position', 'description' => 'Net Billed Position', 'amount' => $netBilledPosition, 'note' => 'Net billed revenue less operating expenses'],
                    ],
                ],
            ],
        ];
    }

    private function buildMonthlyOverview(int $branchId): array
    {
        return collect($this->availableReportMonthsForBranch($branchId))
            ->map(function (string $month) use ($branchId) {
                $dataset = $this->buildMonthlyReportDataset($branchId, $month);

                return [
                    'month' => $month,
                    'month_label' => $dataset['month_label'],
                    'gross_billed' => $dataset['summary']['gross_billed'],
                    'revenue' => $dataset['summary']['total_collections'],
                    'expenses' => $dataset['summary']['total_expenses'],
                    'profit' => $dataset['summary']['net_operating'],
                    'outstanding_balance' => $dataset['summary']['outstanding_balance'],
                ];
            })
            ->values()
            ->all();
    }

    private function availableReportMonths(): array
    {
        $months = collect()
            ->merge(DB::table('billing')->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym")->distinct()->pluck('ym'))
            ->merge(DB::table('sales')->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym")->distinct()->pluck('ym'))
            ->merge(DB::table('expenses')->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym")->distinct()->pluck('ym'))
            ->merge(DB::table('insurance_claims')->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym")->distinct()->pluck('ym'))
            ->merge(DB::table('bsmi_transactions')->selectRaw("DATE_FORMAT(created_at, '%Y-%m') as ym")->distinct()->pluck('ym'))
            ->filter()
            ->unique()
            ->sortDesc()
            ->values();

        return $months
            ->map(fn ($month) => [
                'value' => $month,
                'label' => $this->reportMonthRange((string) $month)[2],
            ])
            ->all();
    }

    private function availableReportMonthsForBranch(int $branchId): array
    {
        $months = collect()
            ->merge(tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym")
                ->distinct()
                ->pluck('ym'))
            ->merge(tap(DB::table('sales'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym")
                ->distinct()
                ->pluck('ym'))
            ->merge(tap(DB::table('expenses'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym")
                ->distinct()
                ->pluck('ym'))
            ->merge(tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym")
                ->distinct()
                ->pluck('ym'))
            ->merge(tap(DB::table('bsmi_transactions'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->selectRaw("DATE_FORMAT(created_at, '%Y-%m') as ym")
                ->distinct()
                ->pluck('ym'))
            ->filter()
            ->unique()
            ->sortDesc()
            ->values();

        return $months->all();
    }

    private function reportMonthRange(string $month): array
    {
        $normalized = $this->normalizeReportMonth($month);
        $date = \DateTime::createFromFormat('Y-m-d', $normalized.'-01') ?: new \DateTime('first day of this month');

        return [
            $date->format('Y-m-01'),
            $date->format('Y-m-t'),
            $date->format('F Y'),
        ];
    }

    private function normalizeReportMonth(string $month): string
    {
        if (preg_match('/^\d{4}-\d{2}$/', $month) === 1) {
            return $month;
        }

        return now()->format('Y-m');
    }

    private function monitorDateRange(Request $request): array
    {
        $period = $request->string('period')->toString() ?: 'monthly';
        $today = now();

        if ($period === 'custom' && ($request->filled('date_from') || $request->filled('date_to'))) {
            $startDate = $request->string('date_from')->toString() ?: $today->copy()->startOfMonth()->toDateString();
            $endDate = $request->string('date_to')->toString() ?: $startDate;

            if ($startDate > $endDate) {
                [$startDate, $endDate] = [$endDate, $startDate];
            }

            return [$startDate, $endDate, $startDate === $endDate ? $startDate : $startDate.' to '.$endDate];
        }

        return match ($period) {
            'daily' => [
                $today->toDateString(),
                $today->toDateString(),
                'Today',
            ],
            'weekly' => [
                $today->copy()->startOfWeek()->toDateString(),
                $today->copy()->endOfWeek()->toDateString(),
                'This Week',
            ],
            'yearly' => [
                $today->copy()->startOfYear()->toDateString(),
                $today->copy()->endOfYear()->toDateString(),
                'This Year',
            ],
            default => [
                $today->copy()->startOfMonth()->toDateString(),
                $today->copy()->endOfMonth()->toDateString(),
                'This Month',
            ],
        };
    }

    private function resolveReportBranchId(Request $request, string $parameter): int
    {
        $requestedBranchId = (int) $request->integer($parameter, $request->user()?->branch_id ?? 1);
        $requestedBranchId = in_array($requestedBranchId, [0, 1, 2], true) ? $requestedBranchId : 1;
        $user = $request->user();

        if ($user?->isAdmin() || in_array($user?->role, ['accountant', 'manager', 'ceo'], true)) {
            return $requestedBranchId;
        }

        return (int) $user->branch_id;
    }

    private function classifyPaymentMethod(string $paymentMethod): string
    {
        $normalized = strtolower(trim($paymentMethod));

        return match (true) {
            str_contains($normalized, 'cash') => 'cash',
            str_contains($normalized, 'mobile') || str_contains($normalized, 'momo') => 'mobile_money',
            str_contains($normalized, 'paystack') => 'paystack',
            str_contains($normalized, 'bank') || str_contains($normalized, 'transfer') => 'bank_transfer',
            default => 'other',
        };
    }

    private function normalizeExpenseCategoryLabel(string $category): string
    {
        $normalized = trim(preg_replace('/\s+/', ' ', $category) ?? '');
        $key = strtolower($normalized);

        return match ($key) {
            'case', 'cases' => 'Cases',
            'lens' => 'Lens',
            'frame' => 'Frame',
            'bank charges', 'bank charge', 'bank_charges' => 'Bank Charges',
            'momo charge', 'momo charges' => 'MoMo Charges',
            'stationery', 'stationery ' => 'Stationery',
            default => ucwords($key),
        };
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

    private function ensureFinancePaymentWriteAccess(Request $request): ?JsonResponse
    {
        $user = $request->user();
        $normalizedRole = $user?->normalized_role ?? $user?->role;

        if ($normalizedRole === 'accountant') {
            return response()->json([
                'message' => 'Accountants can review finance records here, but cannot process payments from the finance desk.',
            ], 403);
        }

        return null;
    }

    private function paystackConfigured(): bool
    {
        return filled(config('services.paystack.public_key')) && filled(config('services.paystack.secret_key'));
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
            'message' => 'Merged mode is read-only. Switch to a branch before recording expenses or payments.',
        ], 422);
    }
}
