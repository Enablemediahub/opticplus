<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class InventoryController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $payload = $this->validateInventoryPayload($request, $branchId);
        $user = $request->user();

        $productId = DB::table('products')->insertGetId([
            ...$payload,
            'branch_id' => $branchId,
        ]);

        if ($payload['stock'] > 0) {
            $this->recordInventoryMovement([
                'product_id' => $productId,
                'branch_id' => $branchId,
                'movement_type' => 'opening',
                'quantity_change' => $payload['stock'],
                'stock_before' => 0,
                'stock_after' => $payload['stock'],
                'reference_table' => 'products',
                'reference_id' => $productId,
                'notes' => 'Opening stock created from inventory form.',
                'created_by' => $user?->id,
            ]);
        }

        return response()->json([
            'message' => 'Inventory item added successfully.',
            'id' => $productId,
        ], 201);
    }

    public function update(Request $request, int $productId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $product = DB::table('products')
            ->where('id', $productId)
            ->where('branch_id', $branchId)
            ->first(['id', 'stock']);

        if (! $product) {
            return response()->json([
                'message' => 'Inventory item not found for this branch.',
            ], 404);
        }

        $payload = $this->validateInventoryPayload($request, $branchId);

        DB::table('products')
            ->where('id', $productId)
            ->update($payload);

        $stockBefore = (int) $product->stock;
        $stockAfter = (int) $payload['stock'];
        $quantityChange = $stockAfter - $stockBefore;

        if ($quantityChange !== 0) {
            $this->recordInventoryMovement([
                'product_id' => $productId,
                'branch_id' => $branchId,
                'movement_type' => 'adjustment',
                'quantity_change' => $quantityChange,
                'stock_before' => $stockBefore,
                'stock_after' => $stockAfter,
                'reference_table' => 'products',
                'reference_id' => $productId,
                'notes' => 'Manual stock adjustment from inventory form.',
                'created_by' => $request->user()?->id,
            ]);
        }

        return response()->json([
            'message' => 'Inventory item updated successfully.',
        ]);
    }

    public function destroy(Request $request, int $productId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $deleted = DB::table('products')
            ->where('id', $productId)
            ->where('branch_id', $branchId)
            ->delete();

        if (! $deleted) {
            return response()->json([
                'message' => 'Inventory item not found for this branch.',
            ], 404);
        }

        return response()->json([
            'message' => 'Inventory item deleted successfully.',
        ]);
    }

    public function overview(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $search = trim($request->string('search')->toString());
        $category = $request->string('category')->toString() ?: 'all';
        $dateFrom = $request->string('date_from')->toString();
        $dateTo = $request->string('date_to')->toString();
        $asOfAt = $request->string('as_of_at')->toString();
        $perPage = min(max((int) $request->integer('per_page', 15), 10), 40);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $hasMovementTable = Schema::hasTable('inventory_movements');

        $query = DB::table('products');
        $this->applyBranchScope($query, 'branch_id', $branchId);

        if ($category !== 'all') {
            $query->where('category', $category);
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('name', 'like', $like)
                    ->orWhere('code', 'like', $like)
                    ->orWhere('grade', 'like', $like);
            });
        }

        $filteredProductIds = (clone $query)->pluck('id')->all();
        $total = (clone $query)->count();

        $records = $query
            ->orderBy('category')
            ->orderBy('name')
            ->limit($perPage)
            ->offset($offset)
            ->get([
                'id',
                'name',
                'category',
                'grade',
                'code',
                'stock',
                'min_price',
                'max_price',
                'branch_id',
            ]);

        $movementSnapshotByProduct = [];
        $movementRangeByProduct = [];
        $latestMovementByProduct = [];
        $movementFeed = collect();
        $snapshotUnits = null;
        $snapshotLowStock = null;
        $snapshotOutOfStock = null;
        $rangeNetChange = 0;
        $rangeMovementCount = 0;
        $frameSalesByProduct = [];
        $frameSalesBreakdown = collect();
        $framesSoldInRange = 0;
        $frameSalesValueInRange = 0.0;
        $frameLinesSoldInRange = 0;

        if ($hasMovementTable && $filteredProductIds !== []) {
            if ($asOfAt !== '') {
                $snapshotRows = DB::table('inventory_movements')
                    ->selectRaw('product_id, SUM(quantity_change) as stock_at_snapshot')
                    ->whereIn('product_id', $filteredProductIds)
                    ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
                    ->where('movement_at', '<=', $asOfAt)
                    ->groupBy('product_id')
                    ->get();

                foreach ($snapshotRows as $row) {
                    $movementSnapshotByProduct[(int) $row->product_id] = (int) $row->stock_at_snapshot;
                }

                $snapshotValues = collect($filteredProductIds)
                    ->map(fn ($productId) => (int) ($movementSnapshotByProduct[(int) $productId] ?? 0))
                    ->values();

                $snapshotUnits = (int) $snapshotValues->sum();
                $snapshotLowStock = (int) $snapshotValues->filter(fn ($value) => $value >= 1 && $value <= 10)->count();
                $snapshotOutOfStock = (int) $snapshotValues->filter(fn ($value) => $value <= 0)->count();
            }

            if ($dateFrom !== '' || $dateTo !== '') {
                $rangeRows = DB::table('inventory_movements')
                    ->selectRaw('product_id, SUM(quantity_change) as net_change, COUNT(*) as movement_count')
                    ->whereIn('product_id', $filteredProductIds)
                    ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
                    ->when($dateFrom !== '', fn ($query) => $query->where('movement_at', '>=', $dateFrom.' 00:00:00'))
                    ->when($dateTo !== '', fn ($query) => $query->where('movement_at', '<=', $dateTo.' 23:59:59'))
                    ->groupBy('product_id')
                    ->get();

                foreach ($rangeRows as $row) {
                    $movementRangeByProduct[(int) $row->product_id] = [
                        'net_change' => (int) $row->net_change,
                        'movement_count' => (int) $row->movement_count,
                    ];
                }

                $rangeNetChange = (int) collect($movementRangeByProduct)->sum('net_change');
                $rangeMovementCount = (int) collect($movementRangeByProduct)->sum('movement_count');
            }

            $latestRows = DB::table('inventory_movements')
                ->selectRaw('product_id, MAX(movement_at) as last_movement_at')
                ->whereIn('product_id', $filteredProductIds)
                ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
                ->groupBy('product_id')
                ->get();

            foreach ($latestRows as $row) {
                $latestMovementByProduct[(int) $row->product_id] = $row->last_movement_at;
            }

            $movementFeed = DB::table('inventory_movements as im')
                ->join('products as p', 'im.product_id', '=', 'p.id')
                ->when($branchId > 0, fn ($query) => $query->where('im.branch_id', $branchId))
                ->whereIn('im.product_id', $filteredProductIds)
                ->when($dateFrom !== '', fn ($query) => $query->where('im.movement_at', '>=', $dateFrom.' 00:00:00'))
                ->when($dateTo !== '', fn ($query) => $query->where('im.movement_at', '<=', $dateTo.' 23:59:59'))
                ->orderByDesc('im.movement_at')
                ->limit(40)
                ->get([
                    'im.id',
                    'im.product_id',
                    'im.branch_id',
                    'im.movement_type',
                    'im.quantity_change',
                    'im.stock_before',
                    'im.stock_after',
                    'im.reference_table',
                    'im.reference_id',
                    'im.notes',
                    'im.created_by',
                    'im.movement_at',
                    'p.code as product_code',
                    'p.name as product_name',
                    'p.category as product_category',
                ]);
        }

        if ($filteredProductIds !== []) {
            $frameSalesRows = DB::table('billing_frames as bf')
                ->join('billing as b', 'bf.billing_id', '=', 'b.id')
                ->join('products as p', function ($join) use ($branchId): void {
                    $join->on('bf.frame_code_id', '=', 'p.code');
                    if ($branchId > 0) {
                        $join->where('p.branch_id', '=', $branchId);
                    }
                })
                ->whereIn('p.id', $filteredProductIds)
                ->when($branchId > 0, function ($query) use ($branchId) {
                    $query->where('bf.branch_id', $branchId)
                        ->where('b.branch_id', $branchId);
                })
                ->when($dateFrom !== '', fn ($query) => $query->whereDate('b.date', '>=', $dateFrom))
                ->when($dateTo !== '', fn ($query) => $query->whereDate('b.date', '<=', $dateTo))
                ->groupBy('p.id', 'p.code', 'p.name', 'p.category', 'p.grade')
                ->orderByDesc(DB::raw('COUNT(*)'))
                ->orderBy('p.name')
                ->get([
                    'p.id as product_id',
                    'p.code as product_code',
                    'p.name as product_name',
                    'p.category as product_category',
                    'p.grade as product_grade',
                    DB::raw('COUNT(*) as sold_count'),
                    DB::raw('SUM(COALESCE(bf.frame_price, 0)) as sold_value'),
                    DB::raw('MAX(b.date) as last_sold_at'),
                ]);

            foreach ($frameSalesRows as $row) {
                $frameSalesByProduct[(int) $row->product_id] = [
                    'sold_count' => (int) $row->sold_count,
                    'sold_value' => round((float) $row->sold_value, 2),
                    'last_sold_at' => $row->last_sold_at,
                ];
            }

            $frameSalesBreakdown = $frameSalesRows->map(fn ($row) => [
                'product_id' => (int) $row->product_id,
                'product_code' => $row->product_code,
                'product_name' => $row->product_name,
                'product_category' => $row->product_category,
                'product_grade' => $row->product_grade,
                'sold_count' => (int) $row->sold_count,
                'sold_value' => round((float) $row->sold_value, 2),
                'last_sold_at' => $row->last_sold_at,
            ])->values();

            $framesSoldInRange = (int) $frameSalesBreakdown->sum('sold_count');
            $frameSalesValueInRange = round((float) $frameSalesBreakdown->sum('sold_value'), 2);
            $frameLinesSoldInRange = (int) $frameSalesBreakdown->count();
        }

        $records = $records->map(function ($record) use ($movementSnapshotByProduct, $movementRangeByProduct, $latestMovementByProduct, $frameSalesByProduct, $asOfAt) {
            $productId = (int) $record->id;
            $snapshotStock = $asOfAt !== ''
                ? (int) ($movementSnapshotByProduct[$productId] ?? 0)
                : (int) $record->stock;
            $rangeMeta = $movementRangeByProduct[$productId] ?? ['net_change' => 0, 'movement_count' => 0];
            $salesMeta = $frameSalesByProduct[$productId] ?? ['sold_count' => 0, 'sold_value' => 0.0, 'last_sold_at' => null];

            $record->current_stock = (int) $record->stock;
            $record->stock_at_snapshot = $snapshotStock;
            $record->net_change = (int) $rangeMeta['net_change'];
            $record->movement_count = (int) $rangeMeta['movement_count'];
            $record->last_movement_at = $latestMovementByProduct[$productId] ?? null;
            $record->sold_in_range = (int) $salesMeta['sold_count'];
            $record->sold_value_in_range = (float) $salesMeta['sold_value'];
            $record->last_sold_at = $salesMeta['last_sold_at'];

            return $record;
        });

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => [
                'product_lines' => (int) tap(DB::table('products'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count(),
                'stock_units' => $snapshotUnits ?? (int) tap(DB::table('products'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('stock'),
                'low_stock' => $snapshotLowStock ?? (int) tap(DB::table('products'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->whereBetween('stock', [1, 10])->count(),
                'out_of_stock' => $snapshotOutOfStock ?? (int) tap(DB::table('products'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->where('stock', '<=', 0)->count(),
                'inventory_floor_value' => (float) tap(DB::table('products'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                    ->selectRaw('SUM(stock * min_price) as value')
                    ->value('value'),
                'range_net_change' => $rangeNetChange,
                'range_movement_count' => $rangeMovementCount,
                'frames_sold_in_range' => $framesSoldInRange,
                'frame_sales_value_in_range' => $frameSalesValueInRange,
                'frame_lines_sold_in_range' => $frameLinesSoldInRange,
                'sales_range_active' => $dateFrom !== '' || $dateTo !== '',
                'snapshot_enabled' => $asOfAt !== '',
            ],
            'categories' => tap(DB::table('products'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->distinct()
                ->orderBy('category')
                ->pluck('category'),
            'filters' => [
                'search' => $search,
                'category' => $category,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'as_of_at' => $asOfAt,
                'page' => $page,
                'per_page' => $perPage,
            ],
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
            'records' => $records,
            'movement_feed' => $movementFeed->values(),
            'frame_sales_breakdown' => $frameSalesBreakdown,
            'movement_tracking_enabled' => $hasMovementTable,
        ]);
    }

    public function lensTracker(Request $request): JsonResponse
    {
        $this->ensureBillingLensItemCountSchema();
        $branchId = $this->resolveBranchId($request);
        $dateFrom = $request->string('date_from')->toString() ?: now()->toDateString();
        $dateTo = $request->string('date_to')->toString() ?: $dateFrom;
        $search = trim($request->string('search')->toString());
        $tracking = $request->string('tracking')->toString() ?: 'all';
        $hasLensItemCount = Schema::hasColumn('billing', 'lens_item_count');

        $lensCostSummary = DB::table('lens_costs as lc')
            ->select(
                'lc.billing_id',
                'lc.branch_id',
                DB::raw('MAX(lc.id) as latest_cost_id')
            )
            ->groupBy('lc.billing_id', 'lc.branch_id');

        $frameSummary = DB::table('billing_frames as bf')
            ->select(
                'bf.billing_id',
                DB::raw('MAX(bf.frame_code_id) as frame_code_id')
            )
            ->when($branchId > 0, fn ($query) => $query->where('bf.branch_id', $branchId))
            ->groupBy('bf.billing_id');

        $prescriptionSummary = DB::table('glasses_prescriptions as gp')
            ->select(
                'gp.folder_id',
                DB::raw('MAX(gp.prescription_id) as prescription_id'),
                DB::raw('MAX(gp.sph_od) as sph_od'),
                DB::raw('MAX(gp.sph_os) as sph_os'),
                DB::raw('MAX(gp.cyl_od) as cyl_od'),
                DB::raw('MAX(gp.cyl_os) as cyl_os'),
                DB::raw('MAX(gp.axis_od) as axis_od'),
                DB::raw('MAX(gp.axis_os) as axis_os'),
                DB::raw('MAX(gp.add_od) as add_od'),
                DB::raw('MAX(gp.add_os) as add_os'),
                DB::raw('MAX(gp.ipd) as ipd'),
                DB::raw('MAX(gp.lens_type) as lens_type'),
                DB::raw('MAX(gp.lens_material) as lens_material'),
                DB::raw('MAX(gp.color) as color'),
                DB::raw('MAX(gp.notes) as prescription_notes'),
                DB::raw('MAX(gp.status) as prescription_status'),
                DB::raw('MAX(gp.created_at) as prescription_date')
            )
            ->when($branchId > 0, fn ($query) => $query->where('gp.branch_id', $branchId))
            ->groupBy('gp.folder_id');

        $insuranceSummary = DB::table('insurance_claims as ic')
            ->select(
                'ic.billing_id',
                DB::raw('MAX(ic.insurance_provider) as insurance_provider'),
                DB::raw('MAX(ic.insurance_number) as insurance_number'),
                DB::raw('MAX(ic.insurance_package) as insurance_package'),
                DB::raw('MAX(ic.patient_organization) as patient_organization'),
                DB::raw('MAX(ic.amount_paid) as insurance_amount'),
                DB::raw('MAX(ic.status) as insurance_status')
            )
            ->when($branchId > 0, fn ($query) => $query->where('ic.branch_id', $branchId))
            ->groupBy('ic.billing_id');

        $query = DB::table('billing as b')
            ->leftJoinSub($lensCostSummary, 'lc_summary', function ($join): void {
                $join->on('b.id', '=', 'lc_summary.billing_id')
                    ->on('b.branch_id', '=', 'lc_summary.branch_id');
            })
            ->leftJoin('lens_costs as lc', function ($join): void {
                $join->on('lc.id', '=', 'lc_summary.latest_cost_id');
            })
            ->leftJoinSub($frameSummary, 'bf', function ($join): void {
                $join->on('b.id', '=', 'bf.billing_id');
            })
            ->leftJoinSub($prescriptionSummary, 'gp', function ($join): void {
                $join->on('b.folder_id', '=', 'gp.folder_id');
            })
            ->leftJoin('customers as c', 'b.customer_id', '=', 'c.id')
            ->leftJoinSub($insuranceSummary, 'ic', function ($join): void {
                $join->on('b.id', '=', 'ic.billing_id');
            })
            ->leftJoin('products as p', function ($join) use ($branchId): void {
                $join->on('bf.frame_code_id', '=', 'p.code');
                if ($branchId > 0) {
                    $join->where('p.branch_id', '=', $branchId);
                }
            })
            ->leftJoin('users as u', 'lc.entered_by', '=', 'u.id')
            ->whereDate('b.date', '>=', $dateFrom)
            ->whereDate('b.date', '<=', $dateTo)
            ->where('b.lens_price', '>', 0)
            ->where(function ($inner): void {
                $inner->where('b.health_insurance', '!=', 'NONE')
                    ->orWhere(function ($cash): void {
                        $cash->where('b.health_insurance', 'NONE')
                            ->whereIn('b.status', ['paid', 'balance_remaining', 'pending']);
                    });
            });
        $this->applyBranchScope($query, 'b.branch_id', $branchId);

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('b.folder_id', 'like', $like)
                    ->orWhere('b.name', 'like', $like)
                    ->orWhere('b.receipt_number', 'like', $like);
            });
        }

        if ($tracking === 'tracked') {
            $query->whereNotNull('lc.id');
        }

        if ($tracking === 'untracked') {
            $query->whereNull('lc.id');
        }

        $records = $query
            ->orderByDesc('b.date')
            ->orderByDesc('b.id')
            ->get([
                'b.id as billing_id',
                'b.folder_id',
                'b.patient_id',
                'b.customer_id',
                'b.health_insurance',
                'b.total_amount as total_bill_amount',
                'b.lens_price as selling_price',
                DB::raw($hasLensItemCount ? 'b.lens_item_count as lens_item_count' : 'CASE WHEN b.lens_price > 0 THEN 1 ELSE 0 END as lens_item_count'),
                'b.date as billing_date',
                'b.receipt_number',
                'b.status as billing_status',
                'b.balance as remaining_balance',
                'b.name as patient_name',
                'c.name as customer_name',
                'b.branch_id',
                'bf.frame_code_id',
                'lc.id as cost_record_id',
                'lc.cost_price',
                'lc.selling_price as tracked_selling_price',
                'lc.profit as tracked_profit',
                'lc.margin_percentage as tracked_margin_percentage',
                'lc.entered_at as cost_entry_date',
                'u.name as entered_by_name',
                'p.name as product_name',
                'p.category as product_category',
                'p.grade as product_grade',
                DB::raw("COALESCE(NULLIF(b.name, ''), c.name) as patient_display_name"),
                'gp.prescription_id',
                'gp.sph_od',
                'gp.sph_os',
                'gp.cyl_od',
                'gp.cyl_os',
                'gp.axis_od',
                'gp.axis_os',
                'gp.add_od',
                'gp.add_os',
                'gp.ipd',
                'gp.lens_type',
                'gp.lens_material',
                'gp.color',
                'gp.prescription_notes',
                'gp.prescription_status',
                'gp.prescription_date',
                'ic.insurance_provider',
                'ic.insurance_number',
                'ic.insurance_package',
                'ic.patient_organization',
                'ic.insurance_amount',
                'ic.insurance_status',
            ])
            ->map(function ($record) {
                $record->lens_item_count = max((int) ($record->lens_item_count ?? 0), (float) ($record->selling_price ?? 0) > 0 ? 1 : 0);
                $record->tracked = $record->cost_record_id !== null;
                $record->profit = $record->cost_price !== null
                    ? round((float) $record->selling_price - (float) $record->cost_price, 2)
                    : null;
                $record->margin_percentage = ($record->cost_price !== null && (float) $record->selling_price > 0)
                    ? round((((float) $record->selling_price - (float) $record->cost_price) / (float) $record->selling_price) * 100, 2)
                    : null;
                $record->payment_category = $record->health_insurance !== 'NONE' ? 'Insurance' : 'Cash';
                $record->immediate_cash = $record->health_insurance === 'NONE'
                    ? round((float) $record->selling_price, 2)
                    : 0.0;
                $record->insurance_received = $record->health_insurance !== 'NONE' && $record->insurance_status === 'paid'
                    ? round((float) ($record->insurance_amount ?? 0), 2)
                    : 0.0;
                $record->insurance_pending = $record->health_insurance !== 'NONE' && in_array($record->insurance_status, ['pending', 'claimed'], true)
                    ? round((float) ($record->insurance_amount ?? 0), 2)
                    : 0.0;
                $record->staff_share = $record->profit !== null ? round((float) $record->profit * 0.40, 2) : null;
                $record->reinvestment_share = $record->profit !== null ? round((float) $record->profit * 0.30, 2) : null;
                $record->tax_share = $record->profit !== null ? round((float) $record->profit * 0.15, 2) : null;
                $record->operational_share = $record->profit !== null ? round((float) $record->profit * 0.15, 2) : null;
                $record->branch_name = $this->branchName((int) $record->branch_id);

                return $record;
            });

        $tracked = $records->filter(fn ($record) => $record->tracked);
        $insuranceRecords = $records->filter(fn ($record) => $record->health_insurance !== 'NONE');
        $cashRecords = $records->filter(fn ($record) => $record->health_insurance === 'NONE');
        $immediateCash = (float) $records->sum(fn ($record) => (float) $record->immediate_cash);
        $insuranceReceived = (float) $records->sum(fn ($record) => (float) $record->insurance_received);
        $insurancePending = (float) $records->sum(fn ($record) => (float) $record->insurance_pending);
        $staffShare = (float) $tracked->sum(fn ($record) => (float) ($record->staff_share ?? 0));
        $reinvestmentShare = (float) $tracked->sum(fn ($record) => (float) ($record->reinvestment_share ?? 0));
        $taxShare = (float) $tracked->sum(fn ($record) => (float) ($record->tax_share ?? 0));
        $operationalShare = (float) $tracked->sum(fn ($record) => (float) ($record->operational_share ?? 0));
        $branchBreakdown = $records
            ->groupBy(fn ($record) => $record->branch_name)
            ->map(function ($group, $label) {
                return [
                    'label' => $label,
                    'transactions' => $group->count(),
                    'total_margin' => round((float) $group->sum(fn ($record) => (float) ($record->profit ?? 0)), 2),
                    'cash_received' => round((float) $group->sum(fn ($record) => (float) $record->immediate_cash), 2),
                    'insurance_received' => round((float) $group->sum(fn ($record) => (float) $record->insurance_received), 2),
                    'insurance_pending' => round((float) $group->sum(fn ($record) => (float) $record->insurance_pending), 2),
                ];
            })
            ->sortByDesc('total_margin')
            ->values();
        $framePerformance = $records
            ->groupBy(fn ($record) => $record->frame_code_id ?: 'Unassigned')
            ->map(function ($group, $code) {
                return [
                    'frame_code' => $code,
                    'name' => $group->first()->product_name ?: $code,
                    'sales' => $group->count(),
                    'total_margin' => round((float) $group->sum(fn ($record) => (float) ($record->profit ?? 0)), 2),
                    'avg_margin' => round((float) $group->avg(fn ($record) => (float) ($record->profit ?? 0)), 2),
                ];
            })
            ->sortByDesc('total_margin')
            ->values();
        $enteredByBreakdown = $tracked
            ->groupBy(fn ($record) => $record->entered_by_name ?: 'Not recorded')
            ->map(function ($group, $label) {
                return [
                    'label' => $label,
                    'transactions' => $group->count(),
                    'total_margin' => round((float) $group->sum(fn ($record) => (float) ($record->profit ?? 0)), 2),
                    'staff_share' => round((float) $group->sum(fn ($record) => (float) ($record->staff_share ?? 0)), 2),
                ];
            })
            ->sortByDesc('total_margin')
            ->values();
        $paymentDistribution = collect([
            [
                'label' => 'Immediate Cash',
                'value' => $immediateCash,
            ],
            [
                'label' => 'Insurance Received',
                'value' => $insuranceReceived,
            ],
            [
                'label' => 'Insurance Pending',
                'value' => $insurancePending,
            ],
        ])->filter(fn ($item) => $item['value'] > 0)->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'search' => $search,
            'tracking' => $tracking,
            'stats' => [
                'total_lenses' => $records->count(),
                'tracked_count' => $tracked->count(),
                'pending_count' => $records->count() - $tracked->count(),
                'total_sales' => (float) $records->sum(fn ($record) => (float) $record->selling_price),
                'total_cost' => (float) $tracked->sum(fn ($record) => (float) $record->cost_price),
                'total_profit' => (float) $tracked->sum(fn ($record) => (float) $record->profit),
                'average_margin' => round((float) ($tracked->avg(fn ($record) => (float) $record->margin_percentage) ?? 0), 2),
                'insurance_lenses' => $records->filter(fn ($record) => $record->health_insurance !== 'NONE')->count(),
                'insurance_sales' => (float) $insuranceRecords->sum(fn ($record) => (float) $record->selling_price),
                'insurance_profit' => (float) $insuranceRecords->filter(fn ($record) => $record->tracked)->sum(fn ($record) => (float) $record->profit),
                'cash_lenses' => $cashRecords->count(),
                'cash_sales' => (float) $cashRecords->sum(fn ($record) => (float) $record->selling_price),
                'cash_profit' => (float) $cashRecords->filter(fn ($record) => $record->tracked)->sum(fn ($record) => (float) $record->profit),
                'untracked_count' => $records->count() - $tracked->count(),
                'immediate_cash' => $immediateCash,
                'insurance_received' => $insuranceReceived,
                'insurance_pending' => $insurancePending,
                'staff_share_total' => $staffShare,
                'reinvestment_total' => $reinvestmentShare,
                'tax_share_total' => $taxShare,
                'operational_total' => $operationalShare,
                'cash_conversion_rate' => (float) ($records->sum(fn ($record) => (float) $record->total_bill_amount) > 0
                    ? round((($immediateCash + $insuranceReceived) / (float) $records->sum(fn ($record) => (float) $record->total_bill_amount)) * 100, 2)
                    : 0),
            ],
            'breakdowns' => [
                'branches' => $branchBreakdown,
                'frames' => $framePerformance,
                'entered_by' => $enteredByBreakdown,
                'payment_distribution' => $paymentDistribution,
            ],
            'records' => $records->values(),
        ]);
    }

    public function lensOrders(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $month = $request->string('month')->toString() ?: null;
        $dateFrom = $request->string('date_from')->toString();
        $dateTo = $request->string('date_to')->toString();
        $search = trim($request->string('search')->toString());
        $pickupStatus = $request->string('pickup_status')->toString() ?: 'all';

        if ($dateFrom === '' || $dateTo === '') {
            [$dateFrom, $dateTo] = $this->lensOrdersDateRange($month);
        }

        $legacyQuery = DB::table('glasses_prescriptions as gp')
            ->join('patient_records as pr', 'gp.patient_id', '=', 'pr.id')
            ->leftJoin('users as assigned', 'assigned.id', '=', 'pr.assigned_optometrist_id');
        $this->applyBranchScope($legacyQuery, 'gp.branch_id', $branchId);
        $this->applyBranchScope($legacyQuery, 'pr.branch_id', $branchId);
        $legacyQuery
            ->whereDate('gp.date', '>=', $dateFrom)
            ->whereDate('gp.date', '<=', $dateTo);

        if ($search !== '') {
            $searchTerm = '%'.$search.'%';
            $legacyQuery->where(function ($query) use ($searchTerm): void {
                $query
                    ->where('pr.folder_id', 'like', $searchTerm)
                    ->orWhere('pr.surname', 'like', $searchTerm)
                    ->orWhere('pr.firstname', 'like', $searchTerm)
                    ->orWhere('pr.othernames', 'like', $searchTerm)
                    ->orWhere('assigned.name', 'like', $searchTerm);
            });
        }

        $legacyPrescriptions = $legacyQuery
            ->orderByDesc('gp.date')
            ->orderByDesc('gp.created_at')
            ->get([
                'gp.prescription_id as billing_id',
                'gp.prescription_id',
                'gp.patient_id',
                'gp.folder_id',
                'gp.date',
                'gp.sph_od',
                'gp.sph_os',
                'gp.cyl_od',
                'gp.cyl_os',
                'gp.axis_od',
                'gp.axis_os',
                'gp.add_od',
                'gp.add_os',
                'gp.ipd',
                'gp.lens_type',
                'gp.lens_material',
                'gp.color',
                'gp.notes',
                'gp.status',
                'gp.created_at',
                'gp.status as pickup_status',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.name',
                'pr.status as patient_status',
                'pr.assigned_optometrist_id',
                'assigned.name as assigned_optometrist_name',
            ])
            ->map(function ($item): array {
                return [
                    'patient_id' => $item->patient_id,
                    'folder_id' => $item->folder_id,
                    'date' => $item->date,
                    'sph_od' => $item->sph_od,
                    'sph_os' => $item->sph_os,
                    'cyl_od' => $item->cyl_od,
                    'cyl_os' => $item->cyl_os,
                    'axis_od' => $item->axis_od,
                    'axis_os' => $item->axis_os,
                    'add_od' => $item->add_od,
                    'add_os' => $item->add_os,
                    'ipd' => $item->ipd,
                    'lens_type' => $item->lens_type,
                    'lens_material' => $item->lens_material,
                    'color' => $item->color,
                    'notes' => $item->notes,
                    'status' => $item->status,
                    'created_at' => $item->created_at,
                    'billing_id' => $item->billing_id,
                    'pickup_status' => $item->pickup_status,
                    'prescription_id' => $item->prescription_id,
                    'source' => 'legacy',
                    'surname' => $item->surname,
                    'firstname' => $item->firstname,
                    'othernames' => $item->othernames,
                    'name' => $item->name,
                    'patient_status' => $item->patient_status,
                    'assigned_optometrist_id' => $item->assigned_optometrist_id,
                    'assigned_optometrist_name' => $item->assigned_optometrist_name,
                ];
            })
            ->values();

        $formQuery = DB::table('patient_form_data as pfd')
            ->join('patient_records as pr', 'pfd.folder_id', '=', 'pr.folder_id')
            ->leftJoin('users as assigned', 'assigned.id', '=', 'pr.assigned_optometrist_id');
        $this->applyBranchScope($formQuery, 'pfd.branch_id', $branchId);
        $this->applyBranchScope($formQuery, 'pr.branch_id', $branchId);
        $formQuery
            ->whereDate('pfd.updated_at', '>=', $dateFrom)
            ->whereDate('pfd.updated_at', '<=', $dateTo);

        if ($search !== '') {
            $searchTerm = '%'.$search.'%';
            $formQuery->where(function ($query) use ($searchTerm): void {
                $query
                    ->where('pr.folder_id', 'like', $searchTerm)
                    ->orWhere('pr.surname', 'like', $searchTerm)
                    ->orWhere('pr.firstname', 'like', $searchTerm)
                    ->orWhere('pr.othernames', 'like', $searchTerm)
                    ->orWhere('assigned.name', 'like', $searchTerm);
            });
        }

        $formPrescriptions = $formQuery
            ->orderByDesc('pfd.version')
            ->orderByDesc('pfd.updated_at')
            ->get([
                'pfd.id as form_id',
                'pfd.folder_id',
                'pfd.version',
                'pfd.status as form_status',
                'pfd.updated_at',
                'pfd.form_data',
                'pr.id as patient_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.name',
                'pr.status as patient_status',
                'pr.assigned_optometrist_id',
                'assigned.name as assigned_optometrist_name',
            ])
            ->map(function ($item) {
                $record = (object) [
                    'id' => $item->patient_id,
                    'folder_id' => $item->folder_id,
                    'surname' => $item->surname,
                    'firstname' => $item->firstname,
                    'othernames' => $item->othernames,
                    'name' => $item->name,
                    'status' => $item->patient_status,
                    'assigned_optometrist_id' => $item->assigned_optometrist_id,
                    'assigned_optometrist_name' => $item->assigned_optometrist_name,
                ];

                $form = (object) [
                    'id' => $item->form_id,
                    'version' => $item->version,
                    'status' => $item->form_status,
                    'updated_at' => $item->updated_at,
                    'form_data' => $item->form_data,
                ];

                return $this->formatExamFormPrescriptionRow($record, $form);
            })
            ->filter()
            ->values();

        $combined = $formPrescriptions
            ->concat($legacyPrescriptions)
            ->map(function (array $item): array {
                $patientName = trim((string) ($item['name'] ?? implode(' ', array_filter([
                    $item['surname'] ?? '',
                    $item['firstname'] ?? '',
                    $item['othernames'] ?? '',
                ]))));
                $patientStatus = strtolower((string) ($item['patient_status'] ?? $item['status'] ?? ''));

                return [
                    ...$item,
                    'patient_name' => $patientName !== '' ? $patientName : ($item['folder_id'] ?? 'Unknown patient'),
                    'order_date' => (string) ($item['date'] ?? $item['created_at'] ?? ''),
                    'pickup_status' => in_array(strtolower((string) ($item['pickup_status'] ?? '')), ['ready', 'notified', 'picked_up'], true)
                        ? strtolower((string) $item['pickup_status'])
                        : 'pending',
                    'ready_for_order' => in_array($patientStatus, ['seen', 'completed', 'ready'], true)
                        || in_array(strtolower((string) ($item['status'] ?? '')), ['seen', 'completed', 'ready'], true),
                    'prescription_summary' => $this->buildLensOrderPrescriptionSummary($item),
                ];
            })
            ->filter(function (array $item) use ($pickupStatus): bool {
                return match ($pickupStatus) {
                    'ready' => in_array($item['pickup_status'] ?? 'pending', ['ready', 'notified'], true),
                    'not_ready' => ($item['pickup_status'] ?? 'pending') === 'pending',
                    default => true,
                };
            })
            ->sortByDesc(fn (array $item) => ($item['order_date'] ?? '').'|'.($item['created_at'] ?? '').'|'.($item['prescription_id'] ?? ''))
            ->values();

        $orders = $combined->values();
        $readyOrders = $orders->filter(fn ($item) => (bool) ($item['ready_for_order'] ?? false));

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => [
                'month' => $month ?? now()->format('Y-m'),
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'search' => $search,
                'pickup_status' => $pickupStatus,
            ],
            'summary' => [
                'total_orders' => $orders->count(),
                'ready_orders' => $readyOrders->count(),
                'pending_orders' => $orders->count() - $readyOrders->count(),
                'today_orders' => $orders->filter(fn ($item) => ($item['order_date'] ?? '') === now()->toDateString())->count(),
                'assigned_optometrists' => $orders
                    ->pluck('assigned_optometrist_id')
                    ->filter(fn ($value) => filled($value))
                    ->unique()
                    ->count(),
            ],
            'orders' => $orders->values(),
        ]);
    }

    public function bsmiTracker(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $dateFrom = $request->string('date_from')->toString() ?: now()->toDateString();
        $dateTo = $request->string('date_to')->toString() ?: $dateFrom;
        $search = trim($request->string('search')->toString());
        $tracking = $request->string('tracking')->toString() ?: 'all';

        $query = DB::table('bsmi_transactions as bt')
            ->leftJoin('billing as b', 'bt.billing_id', '=', 'b.id')
            ->leftJoin('patient_records as pr', 'b.patient_id', '=', 'pr.id')
            ->leftJoin('customers as c', 'b.customer_id', '=', 'c.id')
            ->leftJoin('products as p', function ($join) use ($branchId): void {
                $join->on('bt.frame_code', '=', 'p.code');
                if ($branchId > 0) {
                    $join->where('p.branch_id', '=', $branchId);
                }
            })
            ->leftJoin('users as u', 'bt.sold_by', '=', 'u.id')
            ->whereDate('bt.created_at', '>=', $dateFrom)
            ->whereDate('bt.created_at', '<=', $dateTo)
            ->where(function ($inner): void {
                $inner->whereRaw('LOWER(COALESCE(bt.payment_method, "")) = ?', ['cash'])
                    ->orWhereRaw('LOWER(COALESCE(bt.payment_method, "")) = ?', ['mobile money'])
                    ->orWhereRaw('LOWER(COALESCE(bt.payment_method, "")) = ?', ['momo'])
                    ->orWhereRaw('LOWER(COALESCE(bt.payment_method, "")) = ?', ['mobile_money'])
                    ->orWhereRaw('LOWER(COALESCE(bt.payment_method, "")) = ?', ['paystack']);
            });

        $this->applyBranchScope($query, 'bt.branch_id', $branchId);

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('b.folder_id', 'like', $like)
                    ->orWhere('b.name', 'like', $like)
                    ->orWhere('b.receipt_number', 'like', $like)
                    ->orWhere('bt.frame_code', 'like', $like)
                    ->orWhere('u.name', 'like', $like)
                    ->orWhere('c.name', 'like', $like)
                    ->orWhere('pr.name', 'like', $like)
                    ->orWhere('pr.phone', 'like', $like)
                    ->orWhere('c.phone', 'like', $like);
            });
        }

        if ($tracking === 'untracked') {
            return response()->json([
                'branch_id' => $branchId,
                'branch_name' => $this->branchName($branchId),
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'search' => $search,
                'tracking' => $tracking,
                'stats' => [
                    'total_transactions' => 0,
                    'tracked_count' => 0,
                    'untracked_count' => 0,
                    'total_surplus' => 0.0,
                    'total_sales' => 0.0,
                    'total_base_price' => 0.0,
                    'immediate_cash' => 0.0,
                    'staff_share_total' => 0.0,
                    'reinvestment_total' => 0.0,
                    'tax_share_total' => 0.0,
                    'operational_total' => 0.0,
                    'cash_conversion_rate' => 0.0,
                    'cash_transactions' => 0,
                ],
                'breakdowns' => [
                    'branches' => [],
                    'frames' => [],
                    'entered_by' => [],
                    'payment_distribution' => [],
                ],
                'records' => [],
            ]);
        }

        $records = $query
            ->orderByDesc('bt.created_at')
            ->orderByDesc('bt.id')
            ->get([
                'bt.id',
                'bt.billing_id',
                'bt.frame_code as frame_code_id',
                'bt.min_price',
                'bt.selling_price',
                'bt.margin',
                'bt.staff_share',
                'bt.reinvestment_share',
                'bt.tax_share',
                'bt.operational_share',
                'bt.sold_by',
                'bt.branch',
                'bt.created_at as transaction_date',
                'bt.amount_allocated',
                'bt.lens_paid',
                'bt.frame_min_paid',
                'bt.surplus_for_bsmi',
                'bt.payment_method',
                'bt.insurance_amount',
                'bt.insurance_status',
                'bt.cash_amount',
                'bt.branch_id',
                'b.folder_id',
                'b.patient_id',
                'b.customer_id',
                'b.health_insurance',
                'b.total_amount as total_bill_amount',
                'b.date as billing_date',
                'b.receipt_number',
                'b.name as patient_name',
                'c.name as customer_name',
                'u.name as entered_by_name',
                'p.name as product_name',
                'p.category as product_category',
                'p.grade as product_grade',
                DB::raw("COALESCE(NULLIF(pr.name, ''), TRIM(CONCAT_WS(' ', pr.surname, pr.firstname, pr.othernames)), c.name) as patient_display_name"),
            ])
            ->map(function ($record) {
                $record->tracked = true;
                $record->cost_price = $record->min_price !== null ? round((float) $record->min_price, 2) : null;
                $record->profit = $record->surplus_for_bsmi !== null
                    ? round((float) $record->surplus_for_bsmi, 2)
                    : round((float) ($record->margin ?? 0), 2);
                $record->surplus_amount = $record->profit;
                $record->allocation_amount = round((float) ($record->amount_allocated ?? $record->profit ?? 0), 2);
                $record->tracked_selling_price = round((float) ($record->selling_price ?? 0), 2);
                $paymentMethod = strtolower(trim((string) ($record->payment_method ?? '')));
                $record->payment_category = match (true) {
                    in_array($paymentMethod, ['mobile money', 'momo', 'mobile_money'], true) => 'MoMo',
                    $paymentMethod === 'paystack' => 'Paystack',
                    default => 'Cash',
                };
                $record->immediate_cash = round((float) (($record->cash_amount ?? 0) ?: ($record->selling_price ?? 0)), 2);
                $record->margin_percentage = (float) ($record->selling_price ?? 0) > 0
                    ? round(((float) ($record->profit ?? 0) / (float) $record->selling_price) * 100, 2)
                    : 0.0;
                $record->branch_name = $record->branch ?: $this->branchName((int) $record->branch_id);

                return $record;
            });

        $totalSurplus = (float) $records->sum(fn ($record) => (float) ($record->profit ?? 0));
        $immediateCash = (float) $records->sum(fn ($record) => (float) $record->immediate_cash);
        $staffShare = (float) $records->sum(fn ($record) => (float) ($record->staff_share ?? 0));
        $reinvestmentShare = (float) $records->sum(fn ($record) => (float) ($record->reinvestment_share ?? 0));
        $taxShare = (float) $records->sum(fn ($record) => (float) ($record->tax_share ?? 0));
        $operationalShare = (float) $records->sum(fn ($record) => (float) ($record->operational_share ?? 0));

        $branchBreakdown = $records
            ->groupBy(fn ($record) => $record->branch_name ?: 'Unknown')
            ->map(function ($group, $label) {
                return [
                    'label' => $label,
                    'transactions' => $group->count(),
                    'total_surplus' => round((float) $group->sum(fn ($record) => (float) ($record->profit ?? 0)), 2),
                    'cash_received' => round((float) $group->sum(fn ($record) => (float) $record->immediate_cash), 2),
                ];
            })
            ->sortByDesc('total_surplus')
            ->values();

        $framePerformance = $records
            ->groupBy(fn ($record) => $record->frame_code_id ?: 'Unassigned')
            ->map(function ($group, $code) {
                return [
                    'frame_code' => $code,
                    'name' => $group->first()->product_name ?: $code,
                    'sales' => $group->count(),
                    'total_surplus' => round((float) $group->sum(fn ($record) => (float) ($record->profit ?? 0)), 2),
                    'avg_surplus' => round((float) $group->avg(fn ($record) => (float) ($record->profit ?? 0)), 2),
                ];
            })
            ->sortByDesc('total_surplus')
            ->values();

        $enteredByBreakdown = $records
            ->groupBy(fn ($record) => $record->entered_by_name ?: 'Not recorded')
            ->map(function ($group, $label) {
                return [
                    'label' => $label,
                    'transactions' => $group->count(),
                    'total_surplus' => round((float) $group->sum(fn ($record) => (float) ($record->profit ?? 0)), 2),
                    'staff_share' => round((float) $group->sum(fn ($record) => (float) ($record->staff_share ?? 0)), 2),
                ];
            })
            ->sortByDesc('total_surplus')
            ->values();

        $paymentDistribution = collect([
            [
                'label' => 'Cash & MoMo',
                'value' => $immediateCash,
            ],
        ])->filter(fn ($item) => $item['value'] > 0)->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'search' => $search,
            'tracking' => $tracking,
            'stats' => [
                'total_transactions' => $records->count(),
                'tracked_count' => $records->count(),
                'untracked_count' => 0,
                'total_surplus' => $totalSurplus,
                'total_sales' => (float) $records->sum(fn ($record) => (float) ($record->selling_price ?? 0)),
                'total_base_price' => (float) $records->sum(fn ($record) => (float) ($record->cost_price ?? 0)),
                'immediate_cash' => $immediateCash,
                'staff_share_total' => $staffShare,
                'reinvestment_total' => $reinvestmentShare,
                'tax_share_total' => $taxShare,
                'operational_total' => $operationalShare,
                'cash_conversion_rate' => $totalSurplus > 0
                    ? round(($immediateCash / $totalSurplus) * 100, 2)
                    : 0.0,
                'cash_transactions' => $records->count(),
            ],
            'breakdowns' => [
                'branches' => $branchBreakdown,
                'frames' => $framePerformance,
                'entered_by' => $enteredByBreakdown,
                'payment_distribution' => $paymentDistribution,
            ],
            'records' => $records->values(),
        ]);
    }

    public function storeLensCost(Request $request, int $billingId): JsonResponse
    {
        $requestedBranchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($requestedBranchId)) {
            return $response;
        }
        $user = $request->user();

        $billingQuery = DB::table('billing')
            ->where('id', $billingId);

        if (! $user->isAdmin() || $request->has('branch_id')) {
            $billingQuery->where('branch_id', $requestedBranchId);
        }

        $billing = $billingQuery
            ->first(['id', 'branch_id', 'folder_id', 'patient_id', 'name', 'lens_price']);

        if (! $billing) {
            return response()->json([
                'message' => 'Billing record not found for this branch.',
            ], 404);
        }

        $branchId = (int) $billing->branch_id;

        $existingCost = DB::table('lens_costs')
            ->where('branch_id', $branchId)
            ->where('billing_id', $billingId)
            ->first(['id']);

        if ($existingCost && ! $user->isAdmin()) {
            return response()->json([
                'message' => 'This lens cost has already been saved. Only the General Manager, CEO, or Accountant can edit it.',
            ], 403);
        }

        $validated = $request->validate([
            'cost_price' => ['required', 'numeric', 'min:0'],
            'selling_price' => ['nullable', 'numeric', 'min:0'],
        ]);

        $sellingPrice = round((float) ($validated['selling_price'] ?? $billing->lens_price), 2);
        $costPrice = round((float) $validated['cost_price'], 2);

        DB::transaction(function () use ($billing, $branchId, $sellingPrice, $costPrice, $user): void {
            DB::table('lens_costs')->updateOrInsert(
                [
                    'billing_id' => $billing->id,
                    'branch_id' => $branchId,
                ],
                [
                    'folder_id' => $billing->folder_id,
                    'patient_id' => $billing->patient_id,
                    'selling_price' => $sellingPrice,
                    'cost_price' => $costPrice,
                    'entered_by' => $user?->id,
                    'entered_at' => now(),
                ]
            );

            $this->syncLensCostExpense($billing, $costPrice, $user?->id);
        });

        return response()->json([
            'message' => $existingCost
                ? 'Lens cost updated successfully.'
                : 'Lens cost saved successfully.',
        ], 201);
    }

    public function deleteLensCost(Request $request, int $billingId): JsonResponse
    {
        $requestedBranchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($requestedBranchId)) {
            return $response;
        }

        $user = $request->user();
        if (! $user->isAdmin()) {
            return response()->json([
                'message' => 'Only the General Manager, CEO, or Accountant can delete a saved lens cost entry.',
            ], 403);
        }

        $billingQuery = DB::table('billing')
            ->where('id', $billingId);

        if ($request->has('branch_id')) {
            $billingQuery->where('branch_id', $requestedBranchId);
        }

        $billing = $billingQuery->first(['id', 'branch_id']);

        if (! $billing) {
            return response()->json([
                'message' => 'Billing record not found for this branch.',
            ], 404);
        }

        $branchId = (int) $billing->branch_id;

        $deleted = DB::table('lens_costs')
            ->where('branch_id', $branchId)
            ->where('billing_id', $billingId)
            ->delete();

        if ($deleted === 0) {
            return response()->json([
                'message' => 'No saved lens cost entry was found for this billing record.',
            ], 404);
        }

        $this->deleteLinkedLensCostExpense((int) $billing->id, $branchId);

        return response()->json([
            'message' => 'Lens cost entry deleted successfully.',
        ]);
    }

    private function syncLensCostExpense(object $billing, float $costPrice, ?int $userId): void
    {
        $this->ensureLensExpenseSchema();

        if (! Schema::hasTable('expenses')) {
            return;
        }

        $branchId = (int) $billing->branch_id;
        $billingId = (int) $billing->id;

        if ($costPrice <= 0) {
            $this->deleteLinkedLensCostExpense($billingId, $branchId);
            return;
        }

        $this->ensureExpenseCategory('Lens');

        $patientName = trim((string) ($billing->name ?? ''));
        $folderId = trim((string) ($billing->folder_id ?? ''));
        $descriptionParts = ['Lens cost'];
        if ($patientName !== '') {
            $descriptionParts[] = $patientName;
        }
        if ($folderId !== '') {
            $descriptionParts[] = 'Folder '.$folderId;
        }

        $payload = [
            'description' => implode(' - ', $descriptionParts),
            'amount' => $costPrice,
            'date' => now()->toDateString(),
            'category' => 'Lens',
            'branch_id' => $branchId,
            'created_by' => $userId,
        ];

        if (Schema::hasColumn('expenses', 'updated_at')) {
            $payload['updated_at'] = now();
        }

        DB::transaction(function () use ($branchId, $billingId, $payload): void {
            $existingIds = DB::table('expenses')
                ->where('branch_id', $branchId)
                ->where('source_type', 'lens_cost')
                ->where('source_id', $billingId)
                ->orderBy('expense_id')
                ->lockForUpdate()
                ->pluck('expense_id');

            if ($existingIds->isNotEmpty()) {
                $keeperId = (int) $existingIds->first();
                $extraIds = $existingIds->slice(1)->values()->all();
                if ($extraIds !== []) {
                    DB::table('expenses')->whereIn('expense_id', $extraIds)->delete();
                }

                DB::table('expenses')
                    ->where('expense_id', $keeperId)
                    ->update($payload);

                return;
            }

            if (Schema::hasColumn('expenses', 'created_at')) {
                $payload['created_at'] = now();
            }
            $payload['source_type'] = 'lens_cost';
            $payload['source_id'] = $billingId;

            try {
                DB::table('expenses')->insert($payload);
            } catch (\Throwable) {
                $existingExpenseId = DB::table('expenses')
                    ->where('branch_id', $branchId)
                    ->where('source_type', 'lens_cost')
                    ->where('source_id', $billingId)
                    ->orderBy('expense_id')
                    ->value('expense_id');

                if ($existingExpenseId) {
                    DB::table('expenses')
                        ->where('expense_id', $existingExpenseId)
                        ->update($payload);
                }
            }
        });
    }

    private function deleteLinkedLensCostExpense(int $billingId, int $branchId): void
    {
        if (! Schema::hasTable('expenses') || ! Schema::hasColumn('expenses', 'source_type') || ! Schema::hasColumn('expenses', 'source_id')) {
            return;
        }

        DB::table('expenses')
            ->where('branch_id', $branchId)
            ->where('source_type', 'lens_cost')
            ->where('source_id', $billingId)
            ->delete();
    }

    private function ensureLensExpenseSchema(): void
    {
        if (! Schema::hasTable('expenses')) {
            return;
        }

        if (! Schema::hasColumn('expenses', 'created_by')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->unsignedBigInteger('created_by')->nullable()->index();
            });
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

        $this->collapseDuplicateLensCostExpenses();
        $this->ensureLensCostExpenseUniqueIndex();
    }

    private function collapseDuplicateLensCostExpenses(): void
    {
        if (! Schema::hasColumn('expenses', 'source_type') || ! Schema::hasColumn('expenses', 'source_id')) {
            return;
        }

        $groups = DB::table('expenses')
            ->select('branch_id', 'source_id', DB::raw('MIN(expense_id) as keep_id'))
            ->where('source_type', 'lens_cost')
            ->whereNotNull('source_id')
            ->groupBy('branch_id', 'source_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($groups as $group) {
            DB::table('expenses')
                ->where('branch_id', (int) $group->branch_id)
                ->where('source_type', 'lens_cost')
                ->where('source_id', (int) $group->source_id)
                ->where('expense_id', '!=', (int) $group->keep_id)
                ->delete();
        }
    }

    private function ensureLensCostExpenseUniqueIndex(): void
    {
        if (! Schema::hasColumn('expenses', 'source_type') || ! Schema::hasColumn('expenses', 'source_id')) {
            return;
        }

        $indexExists = collect(DB::select('SHOW INDEX FROM expenses WHERE Key_name = ?', ['expenses_lens_source_unique']))
            ->isNotEmpty();

        if ($indexExists) {
            return;
        }

        try {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->unique(['branch_id', 'source_type', 'source_id'], 'expenses_lens_source_unique');
            });
        } catch (\Throwable) {
            // Leave without the index if legacy duplicates remain; next sync collapses them.
        }
    }

    private function ensureExpenseCategory(string $name): void
    {
        if (! Schema::hasTable('expense_categories')) {
            return;
        }

        $payload = ['is_active' => true];
        if (Schema::hasColumn('expense_categories', 'updated_at')) {
            $payload['updated_at'] = now();
        }

        DB::table('expense_categories')->updateOrInsert(
            ['name' => $name],
            $payload
        );
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();
        $requestedBranchId = (int) $request->integer('branch_id');

        if ($user->isAdmin()) {
            return in_array($requestedBranchId, [0, 1, 2], true) ? $requestedBranchId : 1;
        }

        if (($user->role ?? null) === 'technician') {
            return in_array($requestedBranchId, [1, 2], true)
                ? $requestedBranchId
                : (int) ($user->branch_id ?: 1);
        }

        return (int) $user->branch_id;
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
            'message' => 'Merged mode is read-only. Switch to a branch before saving lens cost entries.',
        ], 422);
    }

    private function recordInventoryMovement(array $payload): void
    {
        if (! Schema::hasTable('inventory_movements')) {
            return;
        }

        DB::table('inventory_movements')->insert([
            'product_id' => $payload['product_id'],
            'branch_id' => $payload['branch_id'],
            'movement_type' => $payload['movement_type'],
            'quantity_change' => $payload['quantity_change'],
            'stock_before' => $payload['stock_before'] ?? null,
            'stock_after' => $payload['stock_after'] ?? null,
            'reference_table' => $payload['reference_table'] ?? null,
            'reference_id' => $payload['reference_id'] ?? null,
            'notes' => $payload['notes'] ?? null,
            'created_by' => $payload['created_by'] ?? null,
            'movement_at' => $payload['movement_at'] ?? now(),
            'created_at' => now(),
        ]);
    }

    private function validateInventoryPayload(Request $request, int $branchId): array
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:255'],
            'grade' => ['nullable', 'string', 'max:255'],
            'stock' => ['required', 'numeric', 'min:0'],
            'min_price' => ['required', 'numeric', 'min:0'],
            'max_price' => ['required', 'numeric', 'min:0'],
        ]);

        $duplicateCode = DB::table('products')
            ->where('branch_id', $branchId)
            ->where('code', $validated['code'])
            ->when($request->route('productId'), fn ($query, $productId) => $query->where('id', '!=', (int) $productId))
            ->exists();

        if ($duplicateCode) {
            abort(response()->json([
                'message' => 'Product code already exists for this branch.',
            ], 422));
        }

        return [
            'code' => trim($validated['code']),
            'name' => trim($validated['name']),
            'category' => trim($validated['category']),
            'grade' => isset($validated['grade']) && trim((string) $validated['grade']) !== '' ? trim((string) $validated['grade']) : null,
            'stock' => (int) round((float) $validated['stock']),
            'min_price' => round((float) $validated['min_price'], 2),
            'max_price' => round((float) $validated['max_price'], 2),
        ];
    }

    private function lensOrdersDateRange(?string $monthKey = null): array
    {
        $monthKey = $monthKey ?: now()->format('Y-m');
        $parts = explode('-', $monthKey);
        $year = isset($parts[0]) ? (int) $parts[0] : (int) now()->format('Y');
        $month = isset($parts[1]) ? (int) $parts[1] : (int) now()->format('m');
        $month = $month >= 1 && $month <= 12 ? $month : (int) now()->format('m');
        $anchor = Carbon::createFromDate($year, $month, 1);

        return [$anchor->copy()->startOfMonth()->toDateString(), $anchor->copy()->endOfMonth()->toDateString()];
    }

    private function buildLensOrderPrescriptionSummary(array $row): string
    {
        $lines = [];

        foreach (['od' => 'OD', 'os' => 'OS'] as $eye => $label) {
            $parts = array_filter([
                $row["sph_{$eye}"] ?? '',
                $row["cyl_{$eye}"] ?? '',
                ! empty($row["axis_{$eye}"] ?? '') ? 'x '.($row["axis_{$eye}"] ?? '') : '',
                ! empty($row["add_{$eye}"] ?? '') ? 'ADD '.($row["add_{$eye}"] ?? '') : '',
            ], fn ($value) => filled($value));

            if ($parts !== []) {
                $lines[] = $label.': '.implode(' ', $parts);
            }
        }

        if (filled($row['lens_type'] ?? null)) {
            $lines[] = 'Lens: '.$row['lens_type'];
        }

        if (filled($row['lens_material'] ?? null)) {
            $lines[] = 'Material: '.$row['lens_material'];
        }

        if (filled($row['color'] ?? null)) {
            $lines[] = 'Color: '.$row['color'];
        }

        if (filled($row['ipd'] ?? null)) {
            $lines[] = 'IPD: '.$row['ipd'];
        }

        if (filled($row['notes'] ?? null)) {
            $lines[] = 'Notes: '.$row['notes'];
        }

        return implode(' | ', array_filter($lines, fn ($value) => filled($value)));
    }

    private function formatExamFormPrescriptionRow(object $record, object $form): ?array
    {
        $prescription = $this->extractPrescriptionFromFormData($form->form_data ?? null);

        if (! $prescription) {
            return null;
        }

        return [
            'patient_id' => $record->id,
            'folder_id' => $record->folder_id,
            'date' => $form->updated_at ? substr((string) $form->updated_at, 0, 10) : null,
            'sph_od' => $prescription['od']['sphere'] ?? '',
            'sph_os' => $prescription['os']['sphere'] ?? '',
            'cyl_od' => $prescription['od']['cylinder'] ?? '',
            'cyl_os' => $prescription['os']['cylinder'] ?? '',
            'axis_od' => $prescription['od']['axis'] ?? '',
            'axis_os' => $prescription['os']['axis'] ?? '',
            'add_od' => $prescription['od']['add'] ?? '',
            'add_os' => $prescription['os']['add'] ?? '',
            'ipd' => '',
            'lens_type' => $prescription['od']['lens_type'] ?? ($prescription['os']['lens_type'] ?? ''),
            'lens_material' => null,
            'color' => null,
            'notes' => $prescription['prescription_notes'] ?? '',
            'status' => $form->status ?? 'completed',
            'created_at' => $form->updated_at,
            'billing_id' => null,
            'pickup_status' => null,
            'prescription_id' => 'FORM-'.$record->id.'-'.$form->version,
            'source' => 'exam_form',
            'form_version' => $form->version,
            'surname' => $record->surname ?? null,
            'firstname' => $record->firstname ?? null,
            'othernames' => $record->othernames ?? null,
            'name' => $record->name ?? null,
            'patient_status' => property_exists($record, 'status') ? ($record->status ?? null) : null,
            'assigned_optometrist_id' => property_exists($record, 'assigned_optometrist_id') ? ($record->assigned_optometrist_id ?? null) : null,
            'assigned_optometrist_name' => property_exists($record, 'assigned_optometrist_name') ? ($record->assigned_optometrist_name ?? null) : null,
        ];
    }

    private function extractPrescriptionFromFormData(?string $formData): ?array
    {
        if (! $formData) {
            return null;
        }

        $decoded = json_decode($formData, true);

        if (! is_array($decoded)) {
            return null;
        }

        $spectacleRx = $decoded['spectacle_rx'] ?? [];
        $refraction = $decoded['refraction']['subjective'] ?? [];
        $eyes = [];

        foreach (['od', 'os'] as $eyeKey) {
            $primary = $spectacleRx[$eyeKey] ?? [];
            $fallback = $refraction[$eyeKey] ?? [];
            $value = static function (string $field) use ($primary, $fallback): string {
                $primaryValue = (string) ($primary[$field] ?? '');

                return filled($primaryValue) ? $primaryValue : (string) ($fallback[$field] ?? '');
            };
            $eye = array_filter([
                $value('sphere'),
                $value('cylinder'),
                $value('axis'),
                $value('add'),
                $value('va'),
                $value('lens_type'),
            ], fn ($value) => filled($value));

            $eyes[$eyeKey] = [
                'sphere' => $value('sphere'),
                'cylinder' => $value('cylinder'),
                'axis' => $value('axis'),
                'add' => $value('add'),
                'va' => $value('va'),
                'lens_type' => $value('lens_type'),
            ];
        }

        $diagnosis = $decoded['diagnosis'] ?? [];
        $hasContent = array_filter([
            $eyes['od']['sphere'] ?? '',
            $eyes['od']['cylinder'] ?? '',
            $eyes['od']['axis'] ?? '',
            $eyes['od']['add'] ?? '',
            $eyes['od']['va'] ?? '',
            $eyes['od']['lens_type'] ?? '',
            $eyes['os']['sphere'] ?? '',
            $eyes['os']['cylinder'] ?? '',
            $eyes['os']['axis'] ?? '',
            $eyes['os']['add'] ?? '',
            $eyes['os']['va'] ?? '',
            $eyes['os']['lens_type'] ?? '',
            $diagnosis['prescription'] ?? null,
            $diagnosis['diagnosis'] ?? null,
        ], fn ($value) => filled($value));

        if (! $hasContent) {
            return null;
        }

        return [
            'od' => $eyes['od'] ?? ['sphere' => '', 'cylinder' => '', 'axis' => '', 'add' => '', 'va' => '', 'lens_type' => ''],
            'os' => $eyes['os'] ?? ['sphere' => '', 'cylinder' => '', 'axis' => '', 'add' => '', 'va' => '', 'lens_type' => ''],
            'prescription_notes' => (string) ($diagnosis['prescription'] ?? $diagnosis['notes'] ?? ''),
        ];
    }

    private function ensureBillingLensItemCountSchema(): void
    {
        if (! Schema::hasTable('billing') || Schema::hasColumn('billing', 'lens_item_count')) {
            return;
        }

        Schema::table('billing', function (Blueprint $table): void {
            $table->unsignedInteger('lens_item_count')->default(1)->after('lens_price');
        });

        DB::table('billing')
            ->where('lens_price', '<=', 0)
            ->update(['lens_item_count' => 0]);
    }
}
