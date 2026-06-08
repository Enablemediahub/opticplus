<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BillingController extends Controller
{
    public function meta(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $this->ensureBillingSchema();
        $this->ensureStandardPricesSchema();

        $standardPrices = tap(DB::table('standard_prices'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->orderBy('id')
            ->first();

        $patientCandidates = DB::table('patient_records as pr')
            ->leftJoin('glasses_prescriptions as gp', function ($join): void {
                $join->on('gp.folder_id', '=', 'pr.folder_id');
            })
            ->leftJoin('billing as b', function ($join): void {
                $join->on('b.folder_id', '=', 'pr.folder_id')
                    ->where('b.status', '!=', 'draft');
            })
            ->when($branchId > 0, fn ($query) => $query->where('pr.branch_id', $branchId))
            ->groupBy(
                'pr.id',
                'pr.folder_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.phone',
                'pr.status',
                'pr.created_at',
                'pr.branch_id'
            )
            ->orderByDesc('pr.created_at')
            ->limit(30)
            ->get([
                'pr.id',
                'pr.folder_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.phone',
                'pr.status as patient_status',
                'pr.created_at',
                'pr.branch_id',
                DB::raw('MAX(gp.prescription_id) as prescription_id'),
                DB::raw('MAX(gp.lens_price) as lens_price'),
                DB::raw('MAX(gp.lens_type) as lens_type'),
                DB::raw('MAX(gp.lens_material) as lens_material'),
                DB::raw('MAX(gp.status) as prescription_status'),
                DB::raw('MAX(b.id) as billing_id'),
                DB::raw('MAX(b.status) as billing_status'),
            ])
            ->map(fn ($record) => $this->mapPatientCandidate($record));

        $frameProducts = tap(DB::table('products'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->where('category', 'Frame')
            ->orderByDesc('stock')
            ->orderBy('name')
            ->limit(80)
            ->get([
                'id',
                'code',
                'name',
                'category',
                'min_price',
                'max_price',
                'stock',
                'grade',
                'branch_id',
            ]);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'standard_prices' => [
                'consultation_price' => (float) ($standardPrices->consultation_price ?? 100),
                'existing_consultation_price' => (float) ($standardPrices->existing_consultation_price ?? 80),
                'frame_price' => (float) ($standardPrices->frame_price ?? 0),
                'lens_price' => (float) ($standardPrices->lens_price ?? 0),
                'case_price' => (float) ($standardPrices->case_price ?? 0),
            ],
            'patient_candidates' => $patientCandidates,
            'frame_products' => $frameProducts,
            'insurance_options' => ['NONE', 'APEX', 'ACACIA', 'GLICO', 'PREMIERE HEALTH INSURANCE', 'NATIONWIDE', 'OTHER'],
        ]);
    }

    public function updatePricing(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $this->ensureStandardPricesSchema();

        $validated = $request->validate([
            'consultation_price' => ['required', 'numeric', 'min:0'],
            'existing_consultation_price' => ['required', 'numeric', 'min:0'],
            'frame_price' => ['required', 'numeric', 'min:0'],
            'lens_price' => ['required', 'numeric', 'min:0'],
            'case_price' => ['required', 'numeric', 'min:0'],
        ]);

        DB::table('standard_prices')->updateOrInsert(
            ['branch_id' => $branchId],
            [
                'consultation_price' => $validated['consultation_price'],
                'existing_consultation_price' => $validated['existing_consultation_price'],
                'frame_price' => $validated['frame_price'],
                'lens_price' => $validated['lens_price'],
                'case_price' => $validated['case_price'],
            ]
        );

        return response()->json([
            'message' => 'Billing pricing updated successfully.',
        ]);
    }

    public function patientSearch(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $search = trim($request->string('search')->toString());

        if (mb_strlen($search) < 2) {
            return response()->json([
                'branch_id' => $branchId,
                'branch_name' => $this->branchName($branchId),
                'search' => $search,
                'patient_candidates' => [],
            ]);
        }

        $like = '%'.$search.'%';

        $patientCandidates = DB::table('patient_records as pr')
            ->leftJoin('glasses_prescriptions as gp', function ($join): void {
                $join->on('gp.folder_id', '=', 'pr.folder_id');
            })
            ->leftJoin('billing as b', function ($join): void {
                $join->on('b.folder_id', '=', 'pr.folder_id')
                    ->where('b.status', '!=', 'draft');
            })
            ->when($branchId > 0, fn ($query) => $query->where('pr.branch_id', $branchId))
            ->where(function ($query) use ($like): void {
                $query->where('pr.folder_id', 'like', $like)
                    ->orWhere('pr.surname', 'like', $like)
                    ->orWhere('pr.firstname', 'like', $like)
                    ->orWhere('pr.othernames', 'like', $like)
                    ->orWhere('pr.name', 'like', $like)
                    ->orWhere('pr.phone', 'like', $like)
                    ->orWhere('pr.email', 'like', $like);
            })
            ->groupBy(
                'pr.id',
                'pr.folder_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.phone',
                'pr.status',
                'pr.created_at',
                'pr.branch_id'
            )
            ->orderByDesc('pr.created_at')
            ->limit(20)
            ->get([
                'pr.id',
                'pr.folder_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.phone',
                'pr.status as patient_status',
                'pr.created_at',
                'pr.branch_id',
                DB::raw('MAX(gp.prescription_id) as prescription_id'),
                DB::raw('MAX(gp.lens_price) as lens_price'),
                DB::raw('MAX(gp.lens_type) as lens_type'),
                DB::raw('MAX(gp.lens_material) as lens_material'),
                DB::raw('MAX(gp.status) as prescription_status'),
                DB::raw('MAX(b.id) as billing_id'),
                DB::raw('MAX(b.status) as billing_status'),
            ])
            ->map(fn ($record) => $this->mapPatientCandidate($record));

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'search' => $search,
            'patient_candidates' => $patientCandidates,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $this->ensureBillingSchema();
        $perPage = min(max((int) $request->integer('per_page', 15), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;

        $salesTotals = $this->alignedSalesTotalsQuery();
        $claimTotals = $this->alignedClaimTotalsQuery();

        $baseQuery = DB::table('billing as b')
            ->leftJoin('patient_records as p', 'b.patient_id', '=', 'p.id')
            ->leftJoin('customers as c', 'b.customer_id', '=', 'c.id')
            ->leftJoinSub($salesTotals, 'sales_totals', function ($join): void {
                $join->on('b.id', '=', 'sales_totals.billing_id');
            })
            ->leftJoinSub($claimTotals, 'claim_totals', function ($join): void {
                $join->on('b.id', '=', 'claim_totals.billing_id');
            });
        $this->applyBranchScope($baseQuery, 'b.branch_id', $branchId);

        $this->applyBillingFilters($baseQuery, $request);

        $statsBase = clone $baseQuery;
        $records = (clone $baseQuery)
            ->orderByDesc('b.date')
            ->orderByDesc('b.id')
            ->limit($perPage)
            ->offset($offset)
            ->get([
                'b.id',
                'b.folder_id',
                'b.name',
                'b.branch_id',
                'b.total_amount',
                'b.balance',
                'b.status',
                'b.date',
                'b.consultation_price',
                'b.frame_price',
                'b.lens_price',
                'b.case_price',
                'b.discount',
                'b.health_insurance',
                'b.receipt_number',
                'p.phone as patient_phone',
                'c.phone as customer_phone',
                DB::raw('COALESCE(sales_totals.sales_paid, 0) as sales_paid'),
                DB::raw('COALESCE(claim_totals.insurance_claimed, 0) as insurance_claimed'),
                DB::raw('COALESCE(sales_totals.sales_paid, 0) + COALESCE(claim_totals.insurance_claimed, 0) as total_paid'),
                DB::raw('COALESCE(b.balance, 0) as calculated_balance'),
            ])
            ->map(fn ($record) => $this->mapBillingRecord($record));

        $total = (clone $baseQuery)->count('b.id');
        $filteredTotalAmount = (float) (clone $statsBase)->sum('b.total_amount');
        $filteredOutstandingAmount = (float) ((clone $statsBase)
            ->sum('b.balance') ?? 0);
        $filteredCollectedAmount = max($filteredTotalAmount - $filteredOutstandingAmount, 0);
        $insuredBillCount = (int) (clone $statsBase)
            ->whereNotNull('b.health_insurance')
            ->where('b.health_insurance', '!=', '')
            ->where('b.health_insurance', '!=', 'NONE')
            ->count('b.id');
        $insuredBillValue = (float) (clone $statsBase)
            ->whereNotNull('b.health_insurance')
            ->where('b.health_insurance', '!=', '')
            ->where('b.health_insurance', '!=', 'NONE')
            ->sum('b.total_amount');
        $averageBillValue = $total > 0 ? round($filteredTotalAmount / $total, 2) : 0;
        $collectionRate = $filteredTotalAmount > 0 ? round(($filteredCollectedAmount / $filteredTotalAmount) * 100, 1) : 0;
        $statusBreakdown = (clone $statsBase)
            ->select('b.status', DB::raw('COUNT(b.id) as total'), DB::raw('SUM(b.total_amount) as amount'))
            ->groupBy('b.status')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($item) => [
                'label' => $item->status,
                'count' => (int) $item->total,
                'amount' => (float) ($item->amount ?? 0),
            ])
            ->values();
        $branchBreakdown = (clone $statsBase)
            ->select('b.branch_id', DB::raw('COUNT(b.id) as total'), DB::raw('SUM(b.total_amount) as amount'))
            ->groupBy('b.branch_id')
            ->orderByDesc('amount')
            ->get()
            ->map(fn ($item) => [
                'label' => $this->branchName((int) $item->branch_id),
                'count' => (int) $item->total,
                'amount' => (float) ($item->amount ?? 0),
            ])
            ->values();

        $stats = [
            'total_bills' => (int) tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count(),
            'total_amount' => (float) tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('total_amount'),
            'pending_bills' => (int) tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->whereIn('status', ['pending', 'balance_remaining', 'insurance_pending'])
                ->count(),
            'paid_bills' => (int) tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->whereIn('status', ['paid', 'completed'])
                ->count(),
            'today_bills' => (int) tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->whereDate('date', now()->toDateString())
                ->count(),
            'filtered_total_amount' => $filteredTotalAmount,
            'filtered_collected_amount' => $filteredCollectedAmount,
            'filtered_outstanding_amount' => $filteredOutstandingAmount,
            'insured_bill_count' => $insuredBillCount,
            'insured_bill_value' => $insuredBillValue,
            'average_bill_value' => $averageBillValue,
            'collection_rate' => $collectionRate,
            'status_breakdown' => $statusBreakdown,
            'branch_breakdown' => $branchBreakdown,
        ];

        $stats['balance_amount'] = (float) $records->sum(
            fn (array $record) => (float) ($record['calculated_balance'] ?? 0)
        );

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => $stats,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
            'records' => $records,
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $this->ensureBillingSchema();

        $salesTotals = $this->alignedSalesTotalsQuery();
        $claimTotals = $this->alignedClaimTotalsQuery();

        $query = DB::table('billing as b')
            ->leftJoin('patient_records as p', 'b.patient_id', '=', 'p.id')
            ->leftJoin('customers as c', 'b.customer_id', '=', 'c.id')
            ->leftJoinSub($salesTotals, 'sales_totals', function ($join): void {
                $join->on('b.id', '=', 'sales_totals.billing_id');
            })
            ->leftJoinSub($claimTotals, 'claim_totals', function ($join): void {
                $join->on('b.id', '=', 'claim_totals.billing_id');
            });
        $this->applyBranchScope($query, 'b.branch_id', $branchId);
        $this->applyBillingFilters($query, $request);

        $records = $query
            ->orderByDesc('b.date')
            ->orderByDesc('b.id')
            ->get([
                'b.id',
                'b.folder_id',
                'b.name',
                'b.branch_id',
                'b.date',
                'b.receipt_number',
                'b.status',
                'b.health_insurance',
                'b.consultation_price',
                'b.frame_price',
                'b.lens_price',
                'b.case_price',
                'b.discount',
                'b.total_amount',
                'b.balance',
                'p.phone as patient_phone',
                'c.phone as customer_phone',
                DB::raw('COALESCE(sales_totals.sales_paid, 0) as sales_paid'),
                DB::raw('COALESCE(claim_totals.insurance_claimed, 0) as insurance_claimed'),
                DB::raw('COALESCE(sales_totals.sales_paid, 0) + COALESCE(claim_totals.insurance_claimed, 0) as total_paid'),
                DB::raw('COALESCE(b.balance, 0) as calculated_balance'),
            ])
            ->map(fn ($record) => $this->mapBillingRecord($record));

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'exported_at' => now()->toDateTimeString(),
            'records' => $records,
        ]);
    }

    public function dailyPayments(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $search = trim($request->string('search')->toString());
        $date = $request->string('date')->toString() ?: now()->toDateString();

        $query = DB::table('sales as s')
            ->leftJoin('billing as b', 's.folder_id', '=', 'b.folder_id')
            ->whereDate('s.created_at', $date);
        $this->applyBranchScope($query, 's.branch_id', $branchId);

        if ($search !== '') {
            $query->where(function ($inner) use ($search): void {
                $like = '%'.$search.'%';
                $inner->where('b.name', 'like', $like)
                    ->orWhere('s.folder_id', 'like', $like)
                    ->orWhere('s.id', 'like', $like);
            });
        }

        $sales = $query
            ->distinct('s.id')
            ->orderByDesc('s.created_at')
            ->get([
                's.id',
                's.patient_id',
                's.amount_paid',
                's.date',
                's.payment_method',
                's.folder_id',
                's.created_at',
                'b.name',
            ]);

        $totalCollected = (float) $sales->sum('amount_paid');
        $count = $sales->count();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'date' => $date,
            'stats' => [
                'total_collected' => $totalCollected,
                'transaction_count' => $count,
                'average_transaction' => $count > 0 ? round($totalCollected / $count, 2) : 0,
            ],
            'payments' => $sales,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $this->ensureBillingSchema();
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'folder_id' => ['required', 'string', 'max:50'],
            'patient_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'date' => ['required', 'date'],
            'consultation_price' => ['required', 'numeric', 'min:0'],
            'frame_code_id' => ['nullable', 'string', 'max:50'],
            'frame_price' => ['required', 'numeric', 'min:0'],
            'frame_items' => ['nullable', 'array'],
            'frame_items.*.frame_code_id' => ['nullable', 'string', 'max:50'],
            'frame_items.*.frame_price' => ['nullable', 'numeric', 'min:0'],
            'lens_price' => ['required', 'numeric', 'min:0'],
            'lens_items' => ['nullable', 'array'],
            'lens_items.*.amount' => ['nullable', 'numeric', 'min:0'],
            'case_price' => ['required', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'health_insurance' => ['required', 'string', 'max:50'],
            'prescription_id' => ['nullable', 'integer'],
        ]);

        $frameItems = collect($validated['frame_items'] ?? [])
            ->map(fn ($item) => [
                'frame_code_id' => trim((string) ($item['frame_code_id'] ?? '')),
                'frame_price' => $this->money($item['frame_price'] ?? 0),
            ])
            ->filter(fn ($item) => $item['frame_code_id'] !== '')
            ->values();

        if ($frameItems->isEmpty() && ! empty($validated['frame_code_id'])) {
            $frameItems = collect([[
                'frame_code_id' => trim((string) $validated['frame_code_id']),
                'frame_price' => $this->money($validated['frame_price']),
            ]]);
        }

        $framePrice = $this->money($frameItems->sum('frame_price'));
        $discount = $this->money($validated['discount'] ?? 0);

        $requestedFrameCounts = $frameItems
            ->groupBy('frame_code_id')
            ->map(fn ($items) => $items->count());

        foreach ($frameItems as $frameItem) {
            $frameCodeId = $frameItem['frame_code_id'];
            $currentFramePrice = $frameItem['frame_price'];

            $product = DB::table('products')
                ->where('branch_id', $branchId)
                ->where('code', $frameCodeId)
                ->first();

            if (! $product) {
                return response()->json(['message' => 'Invalid frame code selected.'], 422);
            }

            if ($currentFramePrice < (float) $product->min_price) {
                return response()->json(['message' => 'Frame price is below the minimum allowed price.'], 422);
            }

            if ($product->grade !== 'A' && $currentFramePrice > (float) $product->max_price) {
                return response()->json(['message' => 'Frame price exceeds the allowed range for this frame.'], 422);
            }

            if ((int) ($requestedFrameCounts[$frameCodeId] ?? 0) > (int) ($product->stock ?? 0)) {
                return response()->json(['message' => "Not enough stock for frame {$frameCodeId}."], 422);
            }
        }

        $consultationPrice = $this->money($validated['consultation_price']);
        $lensItems = collect($validated['lens_items'] ?? [])
            ->map(fn ($item) => $this->money($item['amount'] ?? 0))
            ->filter(fn ($amount) => $amount > 0)
            ->values();
        $lensPrice = $lensItems->isNotEmpty()
            ? $this->money($lensItems->sum())
            : $this->money($validated['lens_price']);
        $lensItemCount = $lensItems->isNotEmpty()
            ? $lensItems->count()
            : ($lensPrice > 0 ? 1 : 0);
        $casePrice = $this->money($validated['case_price']);
        $subtotal = $this->money($consultationPrice + $framePrice + $lensPrice + $casePrice);
        $taxBreakdown = $this->calculateTaxBreakdown($subtotal);
        $baseAmount = $taxBreakdown['base_amount'];
        $nhil = $taxBreakdown['nhil'];
        $getfund = $taxBreakdown['getfund'];
        $vat = $taxBreakdown['vat'];
        $tax = $taxBreakdown['tax'];
        $totalAmount = $this->money(max($subtotal - $discount, 0));

        $billingId = DB::transaction(function () use (
            $validated,
            $branchId,
            $frameItems,
            $consultationPrice,
            $framePrice,
            $lensPrice,
            $lensItemCount,
            $casePrice,
            $baseAmount,
            $subtotal,
            $discount,
            $tax,
            $nhil,
            $getfund,
            $vat,
            $totalAmount
        ) {
            $billingId = DB::table('billing')->insertGetId([
                'patient_id' => $validated['patient_id'] ?? null,
                'folder_id' => $validated['folder_id'],
                'name' => $validated['name'],
                'date' => $validated['date'],
                'consultation_price' => $consultationPrice,
                'frame_price' => $framePrice,
                'lens_price' => $lensPrice,
                'lens_item_count' => $lensItemCount,
                'case_price' => $casePrice,
                'amount' => $baseAmount,
                'discount' => $discount,
                'tax' => $tax,
                'nhil_amount' => $nhil,
                'getfund_amount' => $getfund,
                'vat_amount' => $vat,
                'vat_flat_rate_amount' => 0,
                'vat' => 0,
                'total_amount' => $totalAmount,
                'health_insurance' => $validated['health_insurance'],
                'status' => 'balance_remaining',
                'balance' => $totalAmount,
                'prescription_id' => $validated['prescription_id'] ?? null,
                'branch_id' => $branchId,
            ]);

            foreach ($frameItems as $frameItem) {
                DB::table('billing_frames')->insert([
                    'billing_id' => $billingId,
                    'frame_code_id' => $frameItem['frame_code_id'],
                    'frame_price' => $frameItem['frame_price'],
                    'branch_id' => $branchId,
                    'created_at' => now(),
                ]);

                $productBeforeSale = DB::table('products')
                    ->where('branch_id', $branchId)
                    ->where('code', $frameItem['frame_code_id'])
                    ->first(['id', 'stock']);

                DB::table('products')
                    ->where('branch_id', $branchId)
                    ->where('code', $frameItem['frame_code_id'])
                    ->where('stock', '>', 0)
                    ->decrement('stock');

                if ($productBeforeSale && Schema::hasTable('inventory_movements') && (int) $productBeforeSale->stock > 0) {
                    DB::table('inventory_movements')->insert([
                        'product_id' => $productBeforeSale->id,
                        'branch_id' => $branchId,
                        'movement_type' => 'sale',
                        'quantity_change' => -1,
                        'stock_before' => (int) $productBeforeSale->stock,
                        'stock_after' => (int) $productBeforeSale->stock - 1,
                        'reference_table' => 'billing',
                        'reference_id' => $billingId,
                        'notes' => 'Frame stock reduced from billing sale.',
                        'created_by' => null,
                        'movement_at' => now(),
                        'created_at' => now(),
                    ]);
                }
            }

            if (! empty($validated['prescription_id'])) {
                DB::table('glasses_prescriptions')
                    ->where('branch_id', $branchId)
                    ->where('prescription_id', $validated['prescription_id'])
                    ->where('folder_id', $validated['folder_id'])
                    ->update(['status' => 'billed']);
            }

            return $billingId;
        });

        return response()->json([
            'message' => 'Billing record created successfully.',
            'billing_id' => $billingId,
        ], 201);
    }

    private function applyBillingFilters($query, Request $request): void
    {
        $status = $request->string('status')->toString();
        $search = trim($request->string('search')->toString());

        if ($status && $status !== 'all') {
            match ($status) {
                'pending' => $query->whereIn('b.status', ['pending', 'balance_remaining', 'insurance_pending']),
                'paid' => $query->whereIn('b.status', ['paid', 'completed']),
                default => $query->where('b.status', $status),
            };
        }

        if ($request->filled('date_from')) {
            $query->whereDate('b.date', '>=', $request->string('date_from')->toString());
        }

        if ($request->filled('date_to')) {
            $query->whereDate('b.date', '<=', $request->string('date_to')->toString());
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('b.folder_id', 'like', $like)
                    ->orWhere('b.name', 'like', $like)
                    ->orWhere('b.receipt_number', 'like', $like)
                    ->orWhere('p.phone', 'like', $like)
                    ->orWhere('c.name', 'like', $like)
                    ->orWhere('c.phone', 'like', $like);
            });
        }
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
            ->select('s.billing_id', DB::raw("SUM(CASE WHEN s.payment_method != 'Insurance' THEN s.amount_paid ELSE 0 END) as sales_paid"))
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
            'message' => 'Merged mode is read-only. Switch to a branch before creating billing records.',
        ], 422);
    }

    private function mapPatientCandidate(object $record): array
    {
        return [
            'id' => $record->id,
            'folder_id' => $record->folder_id,
            'name' => trim(implode(' ', array_filter([
                $record->surname,
                $record->firstname,
                $record->othernames,
            ]))),
            'phone' => $record->phone,
            'patient_status' => $record->patient_status,
            'created_at' => $record->created_at,
            'prescription_id' => $record->prescription_id,
            'lens_price' => (float) ($record->lens_price ?? 0),
            'lens_type' => $record->lens_type,
            'lens_material' => $record->lens_material,
            'prescription_status' => $record->prescription_status,
            'billing_id' => $record->billing_id,
            'billing_status' => $record->billing_status,
            'is_existing_customer' => ! empty($record->billing_id),
        ];
    }

    private function mapBillingRecord(object $record): array
    {
        return [
            'id' => $record->id,
            'folder_id' => $record->folder_id,
            'name' => $record->name,
            'branch_id' => (int) $record->branch_id,
            'branch_name' => $this->branchName((int) $record->branch_id),
            'date' => $record->date,
            'receipt_number' => $record->receipt_number,
            'status' => $record->status,
            'health_insurance' => $record->health_insurance,
            'consultation_price' => (float) ($record->consultation_price ?? 0),
            'frame_price' => (float) ($record->frame_price ?? 0),
            'lens_price' => (float) ($record->lens_price ?? 0),
            'lens_item_count' => (int) ($record->lens_item_count ?? ($record->lens_price > 0 ? 1 : 0)),
            'case_price' => (float) ($record->case_price ?? 0),
            'discount' => (float) ($record->discount ?? 0),
            'total_amount' => (float) ($record->total_amount ?? 0),
            'total_paid' => (float) ($record->total_paid ?? 0),
            'insurance_claimed' => (float) ($record->insurance_claimed ?? 0),
            'calculated_balance' => (float) ($record->calculated_balance ?? 0),
            'patient_phone' => $record->patient_phone,
            'customer_phone' => $record->customer_phone,
        ];
    }

    private function money($value): float
    {
        return round((float) $value, 2);
    }

    private function calculateTaxBreakdown(float $subtotal): array
    {
        $subtotal = $this->money($subtotal);
        if ($subtotal <= 0) {
            return [
                'base_amount' => 0.0,
                'nhil' => 0.0,
                'getfund' => 0.0,
                'vat' => 0.0,
                'tax' => 0.0,
            ];
        }

        $baseAmount = $this->money($subtotal / 1.20);
        $nhil = $this->money($baseAmount * 0.025);
        $getfund = $this->money($baseAmount * 0.025);
        $vat = $this->money(max($subtotal - $baseAmount - $nhil - $getfund, 0));
        $tax = $this->money($nhil + $getfund + $vat);

        return [
            'base_amount' => $baseAmount,
            'nhil' => $nhil,
            'getfund' => $getfund,
            'vat' => $vat,
            'tax' => $tax,
        ];
    }

    private function ensureBillingSchema(): void
    {
        if (! Schema::hasTable('billing')) {
            return;
        }

        if (! Schema::hasColumn('billing', 'lens_item_count')) {
            Schema::table('billing', function (Blueprint $table): void {
                $table->unsignedInteger('lens_item_count')->default(1)->after('lens_price');
            });

            DB::table('billing')
                ->where('lens_price', '<=', 0)
                ->update(['lens_item_count' => 0]);
        }
    }

    private function ensureStandardPricesSchema(): void
    {
        if (! Schema::hasTable('standard_prices')) {
            Schema::create('standard_prices', function (Blueprint $table): void {
                $table->id();
                $table->decimal('consultation_price', 12, 2)->default(100);
                $table->decimal('existing_consultation_price', 12, 2)->default(80);
                $table->decimal('frame_price', 12, 2)->default(0);
                $table->decimal('lens_price', 12, 2)->default(0);
                $table->decimal('case_price', 12, 2)->default(0);
                $table->integer('branch_id')->default(1);
            });

            return;
        }

        if (! Schema::hasColumn('standard_prices', 'existing_consultation_price')) {
            Schema::table('standard_prices', function (Blueprint $table): void {
                $table->decimal('existing_consultation_price', 12, 2)->default(80)->after('consultation_price');
            });
        }
    }
}
