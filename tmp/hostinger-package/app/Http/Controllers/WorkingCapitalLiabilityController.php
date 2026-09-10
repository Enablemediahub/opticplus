<?php

namespace App\Http\Controllers;

use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

class WorkingCapitalLiabilityController extends Controller
{
    private const TYPES = [
        'trade_creditors',
        'staff_creditors',
        'accrued_expenses',
        'other_actuals',
        'cash_in_hand',
        'cash_in_momo',
        'cash_at_bank',
    ];

    private const ASSET_TYPES = ['cash_in_hand', 'cash_in_momo', 'cash_at_bank'];

    public function index(Request $request): JsonResponse
    {
        if ($response = $this->ensureAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $year = max(2020, min(2100, (int) $request->integer('year', (int) now()->format('Y'))));
        $month = (int) $request->integer('month', 0);
        $monthFrom = (int) $request->integer('month_from', $month);
        $monthTo = (int) $request->integer('month_to', $month);
        $monthFrom = $monthFrom >= 1 && $monthFrom <= 12 ? $monthFrom : 0;
        $monthTo = $monthTo >= 1 && $monthTo <= 12 ? $monthTo : 0;
        if ($monthFrom && $monthTo && $monthFrom > $monthTo) {
            [$monthFrom, $monthTo] = [$monthTo, $monthFrom];
        }
        $search = trim($request->string('search')->toString());
        $query = DB::table('working_capital_liabilities');
        $this->applyBranchScope($query, $branchId);
        $query->whereYear('as_of_date', $year);
        if ($monthFrom && $monthTo) {
            $query->whereBetween(DB::raw('MONTH(as_of_date)'), [$monthFrom, $monthTo]);
        } elseif ($monthFrom) {
            $query->whereMonth('as_of_date', $monthFrom);
        } elseif ($monthTo) {
            $query->whereMonth('as_of_date', $monthTo);
        }
        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('description', 'like', $like)
                    ->orWhere('notes', 'like', $like)
                    ->orWhere('liability_type', 'like', $like);
            });
        }

        $records = $query->orderByDesc('as_of_date')->orderBy('entry_side')->orderBy('liability_type')->orderBy('description')->get();
        $totals = array_fill_keys(self::TYPES, 0.0);
        foreach ($records as $record) {
            $totals[$record->liability_type] = round($totals[$record->liability_type] + (float) $record->amount, 2);
        }

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'year' => $year,
            'month' => $month,
            'month_from' => $monthFrom,
            'month_to' => $monthTo,
            'search' => $search,
            'types' => self::TYPES,
            'asset_types' => self::ASSET_TYPES,
            'records' => $records,
            'totals' => $totals,
            'total' => round(array_sum($totals), 2),
            'approval' => $monthFrom && $monthTo && $monthFrom === $monthTo ? $this->approvalState($branchId, $year, $monthFrom) : null,
        ]);
    }

    public function approve(Request $request): JsonResponse
    {
        return $this->setApproval($request, true);
    }

    public function reopen(Request $request): JsonResponse
    {
        return $this->setApproval($request, false);
    }

    public function store(Request $request): JsonResponse
    {
        if ($response = $this->ensureAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        if ($branchId === 0) {
            return response()->json(['message' => 'Merged mode is read-only. Select a branch before recording a liability.'], 422);
        }

        $validated = $this->validatePayload($request);
        if ($this->isApproved($branchId, $validated['as_of_date'])) {
            return response()->json(['message' => 'This month is approved and locked. The General Manager must reopen it before editing.'], 423);
        }
        $id = DB::table('working_capital_liabilities')->insertGetId([
            ...$validated,
            'branch_id' => $branchId,
            'created_by' => $request->user()->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        AuditLog::logManual($request, 'create', 'working_capital_liabilities', 'liability_id: '.$id, $validated);

        return response()->json(['message' => 'Working capital liability added successfully.', 'id' => $id], 201);
    }

    public function update(Request $request, int $liabilityId): JsonResponse
    {
        if ($response = $this->ensureAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        if ($branchId === 0) {
            return response()->json(['message' => 'Merged mode is read-only. Select a branch before editing a liability.'], 422);
        }

        $record = DB::table('working_capital_liabilities')
            ->where('id', $liabilityId)
            ->where('branch_id', $branchId)
            ->first();
        if (! $record) {
            return response()->json(['message' => 'Working capital liability not found for this branch.'], 404);
        }

        if ($this->isApproved($branchId, $record->as_of_date)) {
            return response()->json(['message' => 'This month is approved and locked. The General Manager must reopen it before editing.'], 423);
        }

        $validated = $this->validatePayload($request);
        DB::table('working_capital_liabilities')->where('id', $liabilityId)->update([
            ...$validated,
            'updated_at' => now(),
        ]);
        AuditLog::logManual($request, 'edit', 'working_capital_liabilities', 'liability_id: '.$liabilityId, $validated);

        return response()->json(['message' => 'Working capital liability updated successfully.']);
    }

    public function destroy(Request $request, int $liabilityId): JsonResponse
    {
        if ($response = $this->ensureAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        if ($branchId === 0) {
            return response()->json(['message' => 'Merged mode is read-only. Select a branch before deleting a liability.'], 422);
        }

        $record = DB::table('working_capital_liabilities')->where('id', $liabilityId)->where('branch_id', $branchId)->first(['as_of_date']);
        if ($record && $this->isApproved($branchId, $record->as_of_date)) {
            return response()->json(['message' => 'This month is approved and locked. The General Manager must reopen it before editing.'], 423);
        }

        $deleted = DB::table('working_capital_liabilities')
            ->where('id', $liabilityId)
            ->where('branch_id', $branchId)
            ->delete();
        if (! $deleted) {
            return response()->json(['message' => 'Working capital liability not found for this branch.'], 404);
        }

        AuditLog::logManual($request, 'delete', 'working_capital_liabilities', 'liability_id: '.$liabilityId);
        return response()->json(['message' => 'Working capital liability deleted successfully.']);
    }

    private function validatePayload(Request $request): array
    {
        $validated = $request->validate([
            'as_of_date' => ['required', 'date'],
            'entry_side' => ['required', 'in:current_asset,current_liability'],
            'liability_type' => ['required', 'in:'.implode(',', self::TYPES)],
            'description' => ['nullable', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);

        return [
            'as_of_date' => $validated['as_of_date'],
            'entry_side' => $validated['entry_side'],
            'liability_type' => $validated['liability_type'],
            'description' => trim((string) ($validated['description'] ?? '')) ?: null,
            'amount' => round((float) $validated['amount'], 2),
            'notes' => trim((string) ($validated['notes'] ?? '')) ?: null,
        ];
    }

    private function ensureAccess(Request $request): ?JsonResponse
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        if ($request->user()?->is_admin || in_array($role, ['manager', 'accountant'], true)) {
            return null;
        }

        return response()->json(['message' => 'Only accountants and general managers can access working capital liabilities.'], 403);
    }

    private function setApproval(Request $request, bool $approve): JsonResponse
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        if (! $request->user()?->is_admin && $role !== 'manager') {
            return response()->json(['message' => 'Only the General Manager can approve or reopen working capital entries.'], 403);
        }

        $branchId = $this->resolveBranchId($request);
        $year = max(2020, min(2100, (int) $request->integer('year')));
        $month = (int) $request->integer('month');
        if ($branchId === 0 || $month < 1 || $month > 12) {
            return response()->json(['message' => 'Select one branch and one month before changing approval status.'], 422);
        }

        $periodMonth = sprintf('%04d-%02d-01', $year, $month);
        DB::table('working_capital_entry_approvals')->updateOrInsert(
            ['branch_id' => $branchId, 'period_month' => $periodMonth],
            $approve
                ? ['approved_at' => now(), 'approved_by' => $request->user()->id, 'reopened_at' => null, 'reopened_by' => null, 'updated_at' => now(), 'created_at' => now()]
                : ['approved_at' => null, 'approved_by' => null, 'reopened_at' => now(), 'reopened_by' => $request->user()->id, 'updated_at' => now(), 'created_at' => now()]
        );
        AuditLog::logManual($request, $approve ? 'approve' : 'reopen', 'working_capital_entry_approvals', $branchId.' / '.$periodMonth);

        return response()->json(['message' => $approve ? 'Working capital entries approved and locked.' : 'Working capital entries reopened for editing.', 'approval' => $this->approvalState($branchId, $year, $month)]);
    }

    private function approvalState(int $branchId, int $year, int $month): array
    {
        $row = DB::table('working_capital_entry_approvals')->where('branch_id', $branchId)->where('period_month', sprintf('%04d-%02d-01', $year, $month))->first();
        return ['approved' => (bool) ($row?->approved_at), 'approved_at' => $row?->approved_at, 'approved_by' => $row?->approved_by, 'reopened_at' => $row?->reopened_at];
    }

    private function isApproved(int $branchId, string $asOfDate): bool
    {
        $periodMonth = Carbon::parse($asOfDate)->startOfMonth()->toDateString();
        return (bool) DB::table('working_capital_entry_approvals')->where('branch_id', $branchId)->where('period_month', $periodMonth)->whereNotNull('approved_at')->exists();
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

    private function applyBranchScope($query, int $branchId): void
    {
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }
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
}
