<?php

namespace App\Http\Controllers;

use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkingCapitalLiabilityController extends Controller
{
    private const TYPES = [
        'trade_creditors',
        'staff_creditors',
        'accrued_expenses',
        'other_actuals',
    ];

    public function index(Request $request): JsonResponse
    {
        if ($response = $this->ensureAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $year = max(2020, min(2100, (int) $request->integer('year', (int) now()->format('Y'))));
        $month = (int) $request->integer('month', 0);
        $query = DB::table('working_capital_liabilities');
        $this->applyBranchScope($query, $branchId);
        $query->whereYear('as_of_date', $year);
        if ($month >= 1 && $month <= 12) {
            $query->whereMonth('as_of_date', $month);
        }

        $records = $query->orderByDesc('as_of_date')->orderBy('liability_type')->orderBy('description')->get();
        $totals = array_fill_keys(self::TYPES, 0.0);
        foreach ($records as $record) {
            $totals[$record->liability_type] = round($totals[$record->liability_type] + (float) $record->amount, 2);
        }

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'year' => $year,
            'month' => $month,
            'types' => self::TYPES,
            'records' => $records,
            'totals' => $totals,
            'total' => round(array_sum($totals), 2),
        ]);
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
            'liability_type' => ['required', 'in:'.implode(',', self::TYPES)],
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);

        return [
            'as_of_date' => $validated['as_of_date'],
            'liability_type' => $validated['liability_type'],
            'description' => trim($validated['description']),
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
