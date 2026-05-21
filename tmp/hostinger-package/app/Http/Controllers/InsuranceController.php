<?php

namespace App\Http\Controllers;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class InsuranceController extends Controller
{
    public function meta(Request $request): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();
        $this->ensureInsuranceRemittanceSchema();
        $branchId = $this->resolveBranchId($request);

        $packageOptions = tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereNotNull('insurance_package')
            ->where('insurance_package', '!=', '')
            ->select('insurance_provider', 'insurance_package')
            ->distinct()
            ->orderBy('insurance_provider')
            ->orderBy('insurance_package')
            ->get()
            ->groupBy('insurance_provider')
            ->map(fn ($items) => $items->pluck('insurance_package')->values());

        $organizationOptions = tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereNotNull('patient_organization')
            ->where('patient_organization', '!=', '')
            ->distinct()
            ->orderBy('patient_organization')
            ->pluck('patient_organization');

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'providers' => $this->providerOptions(),
            'package_options' => $packageOptions,
            'organization_options' => $organizationOptions,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();
        $this->ensureInsuranceRemittanceSchema();
        $branchId = $this->resolveBranchId($request);
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 30);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;

        $query = $this->buildFilteredClaimsQuery($request, $branchId);

        $total = (clone $query)->count('ic.id');

        $claims = $query
            ->orderByDesc('ic.date')
            ->orderByDesc('ic.id')
            ->limit($perPage)
            ->offset($offset)
            ->get([
                'ic.id',
                'ic.patient_id',
                'ic.folder_id',
                'ic.insurance_provider',
                'ic.insurance_number',
                'ic.insurance_package',
                'ic.patient_organization',
                'ic.amount_paid',
                'ic.date',
                'ic.status',
                'ic.billing_id',
                'b.name',
                DB::raw("COALESCE(NULLIF(b.name, ''), NULLIF(pr.name, ''), NULLIF(TRIM(CONCAT_WS(' ', pr.surname, pr.firstname, pr.othernames)), '')) as patient_name"),
                'b.receipt_number',
                'b.total_amount',
            ]);

        $summary = $this->buildClaimsSummary(clone $query);
        $remittanceQuery = $this->buildFilteredRemittanceQuery($request, $branchId);

        $billingCandidates = tap(DB::table('billing as b'), fn ($query) => $this->applyBranchScope($query, 'b.branch_id', $branchId))
            ->where('b.health_insurance', '!=', 'NONE')
            ->where('b.health_insurance', '!=', '')
            ->orderByDesc('b.date')
            ->limit(40)
            ->get([
                'b.id',
                'b.patient_id',
                'b.folder_id',
                'b.name',
                'b.health_insurance',
                'b.total_amount',
                'b.balance',
                'b.date',
                'b.receipt_number',
            ]);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => [
                'total_claimed' => (float) tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount_paid'),
                'pending_claims' => (float) tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->where('status', 'pending')->sum('amount_paid'),
                'claimed_not_paid' => (float) tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->where('status', 'claimed')->sum('amount_paid'),
                'paid_claims' => (float) tap(DB::table('insurance_claims'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->where('status', 'paid')->sum('amount_paid'),
            ],
            'filtered_stats' => $summary,
            'remittance_summary' => $this->buildRemittanceSummary(clone $remittanceQuery),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
            'billing_candidates' => $billingCandidates,
            'claims' => $claims,
            'remittances' => (clone $remittanceQuery)
                ->orderByDesc('ir.date')
                ->orderByDesc('ir.id')
                ->limit(12)
                ->get([
                    'ir.id',
                    'ir.insurance_provider',
                    'ir.amount_paid',
                    'ir.date',
                    'ir.reference',
                    'ir.notes',
                    'ir.created_at',
                ]),
            'providers' => $this->providerOptions(),
        ]);
    }

    public function report(Request $request): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();
        $this->ensureInsuranceRemittanceSchema();
        $branchId = $this->resolveBranchId($request);
        $query = $this->buildFilteredClaimsQuery($request, $branchId);
        $remittanceQuery = $this->buildFilteredRemittanceQuery($request, $branchId);

        $claims = (clone $query)
            ->orderByDesc('ic.date')
            ->orderByDesc('ic.id')
            ->get([
                'ic.id',
                'ic.patient_id',
                'ic.folder_id',
                'ic.insurance_provider',
                'ic.insurance_number',
                'ic.insurance_package',
                'ic.patient_organization',
                'ic.amount_paid',
                'ic.date',
                'ic.status',
                'ic.billing_id',
                'b.name',
                DB::raw("COALESCE(NULLIF(b.name, ''), NULLIF(pr.name, ''), NULLIF(TRIM(CONCAT_WS(' ', pr.surname, pr.firstname, pr.othernames)), '')) as patient_name"),
                'b.receipt_number',
                'b.total_amount',
            ]);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'generated_at' => now()->toDateTimeString(),
            'filters' => $this->readClaimFilters($request),
            'summary' => $this->buildClaimsSummary(clone $query),
            'simple_summary' => $this->buildSimpleInsuranceSummary(clone $query, clone $remittanceQuery),
            'manual_remittance_summary' => $this->buildRemittanceSummary(clone $remittanceQuery),
            'provider_breakdown' => $this->buildClaimsBreakdown(clone $query, 'ic.insurance_provider'),
            'package_breakdown' => $this->buildClaimsBreakdown(clone $query, 'ic.insurance_package'),
            'organization_breakdown' => $this->buildClaimsBreakdown(clone $query, 'ic.patient_organization'),
            'manual_remittances' => (clone $remittanceQuery)
                ->orderByDesc('ir.date')
                ->orderByDesc('ir.id')
                ->get([
                    'ir.id',
                    'ir.insurance_provider',
                    'ir.amount_paid',
                    'ir.date',
                    'ir.reference',
                    'ir.notes',
                ]),
            'claims' => $claims,
        ]);
    }

    public function remittances(Request $request): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();
        $this->ensureInsuranceRemittanceSchema();
        $branchId = $this->resolveBranchId($request);
        $query = $this->buildFilteredRemittanceQuery($request, $branchId);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'summary' => $this->buildRemittanceSummary(clone $query),
            'records' => $query
                ->orderByDesc('ir.date')
                ->orderByDesc('ir.id')
                ->limit(20)
                ->get([
                    'ir.id',
                    'ir.insurance_provider',
                    'ir.amount_paid',
                    'ir.date',
                    'ir.reference',
                    'ir.notes',
                    'ir.created_at',
                ]),
        ]);
    }

    public function storeRemittance(Request $request): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();
        $this->ensureInsuranceRemittanceSchema();
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        if ($response = $this->ensureRemittanceWriteAccess($request)) {
            return $response;
        }

        $providerOptions = $this->providerOptions();
        $validated = $request->validate([
            'insurance_provider' => ['required', Rule::in($providerOptions)],
            'amount_paid' => ['required', 'numeric', 'min:0.01'],
            'date' => ['required', 'date'],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $remittanceId = DB::table('insurance_remittances')->insertGetId([
            'insurance_provider' => $validated['insurance_provider'],
            'amount_paid' => round((float) $validated['amount_paid'], 2),
            'date' => $validated['date'],
            'reference' => trim((string) ($validated['reference'] ?? '')),
            'notes' => trim((string) ($validated['notes'] ?? '')),
            'branch_id' => $branchId,
            'created_by' => $request->user()?->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'message' => 'Insurance remittance recorded successfully.',
            'remittance' => DB::table('insurance_remittances')->where('id', $remittanceId)->first(),
        ], 201);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $providerOptions = $this->providerOptions();
        $validated = $request->validate([
            'billing_id' => ['required', 'integer'],
            'patient_id' => ['nullable', 'integer'],
            'folder_id' => ['required', 'string', 'max:255'],
            'insurance_provider' => ['required', Rule::in($providerOptions)],
            'insurance_number' => ['required', 'string', 'max:255'],
            'insurance_package' => ['nullable', 'string', 'max:255'],
            'patient_organization' => ['nullable', 'string', 'max:255'],
            'amount_paid' => ['required', 'numeric', 'min:0.01'],
            'date' => ['required', 'date'],
        ]);

        $billing = DB::table('billing')
            ->where('branch_id', $branchId)
            ->where('id', $validated['billing_id'])
            ->first();

        if (! $billing) {
            return response()->json(['message' => 'Billing record not found for this branch.'], 404);
        }

        $amount = round((float) $validated['amount_paid'], 2);
        $currentBalance = $this->calculateBillingBalance($branchId, (int) $billing->id, (float) $billing->total_amount);
        if ($amount > $currentBalance + 0.001) {
            return response()->json(['message' => 'Claim amount cannot exceed the current outstanding balance.'], 422);
        }

        $claimId = DB::transaction(function () use ($validated, $billing, $branchId, $amount): int {
            $claimId = DB::table('insurance_claims')->insertGetId([
                'patient_id' => $validated['patient_id'] ?? $billing->patient_id,
                'folder_id' => $validated['folder_id'],
                'insurance_provider' => $validated['insurance_provider'],
                'insurance_number' => $validated['insurance_number'],
                'insurance_package' => $validated['insurance_package'] ?? '',
                'patient_organization' => $validated['patient_organization'] ?? '',
                'amount_paid' => $amount,
                'date' => $validated['date'],
                'status' => 'claimed',
                'billing_id' => $validated['billing_id'],
                'branch_id' => $branchId,
            ]);

            $remainingBalance = $this->calculateBillingBalance($branchId, (int) $billing->id, (float) $billing->total_amount);
            DB::table('billing')
                ->where('branch_id', $branchId)
                ->where('id', $validated['billing_id'])
                ->update([
                    'balance' => $remainingBalance,
                    'status' => $this->resolveBillingStatus($branchId, (int) $billing->id, $remainingBalance, (float) $billing->total_amount),
                ]);

            return $claimId;
        });

        return response()->json([
            'message' => 'Insurance claim recorded successfully.',
            'claim_id' => $claimId,
        ], 201);
    }

    public function markPaid(Request $request, int $claimId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $claim = DB::table('insurance_claims')
            ->where('branch_id', $branchId)
            ->where('id', $claimId)
            ->first();

        if (! $claim) {
            return response()->json(['message' => 'Insurance claim not found for this branch.'], 404);
        }

        if ($claim->status === 'paid') {
            return response()->json([
                'message' => 'Insurance claim is already marked as paid.',
            ]);
        }

        $billing = DB::table('billing')
            ->where('branch_id', $branchId)
            ->where('id', $claim->billing_id)
            ->first();

        if (! $billing) {
            return response()->json(['message' => 'Billing record not found for this claim.'], 404);
        }

        $existingSale = $this->findInsuranceSale($branchId, $claim);

        DB::transaction(function () use ($claim, $billing, $branchId, $existingSale): void {
            DB::table('insurance_claims')
                ->where('id', $claim->id)
                ->update([
                    'status' => 'paid',
                ]);

            $salePayload = $this->insuranceSalePayload($claim, $billing, $branchId);

            if ($existingSale) {
                DB::table('sales')
                    ->where('id', $existingSale->id)
                    ->update($this->insuranceSaleUpdatePayload($salePayload));
            } else {
                DB::table('sales')->insert($salePayload);
            }

            DB::table('billing')
                ->where('id', $billing->id)
                ->update([
                    'balance' => $this->calculateBillingBalance($branchId, (int) $billing->id, (float) $billing->total_amount),
                    'status' => $this->resolveBillingStatus(
                        $branchId,
                        (int) $billing->id,
                        $this->calculateBillingBalance($branchId, (int) $billing->id, (float) $billing->total_amount),
                        (float) $billing->total_amount
                    ),
                ]);
        });

        return response()->json([
            'message' => 'Insurance claim marked as paid.',
        ]);
    }

    public function markPending(Request $request, int $claimId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $claim = DB::table('insurance_claims')
            ->where('branch_id', $branchId)
            ->where('id', $claimId)
            ->first();

        if (! $claim) {
            return response()->json(['message' => 'Insurance claim not found for this branch.'], 404);
        }

        if ($claim->status === 'pending') {
            return response()->json([
                'message' => 'Insurance claim is already pending.',
            ]);
        }

        $billing = null;
        if (! empty($claim->billing_id)) {
            $billing = DB::table('billing')
                ->where('branch_id', $branchId)
                ->where('id', $claim->billing_id)
                ->first();
        }

        $sale = null;
        if ($claim->status === 'paid') {
            $sale = $this->findInsuranceSale($branchId, $claim);
        }

        DB::transaction(function () use ($claim, $billing, $sale, $branchId): void {
            if ($claim->status === 'paid') {
                if ($sale) {
                    DB::table('sales')->where('id', $sale->id)->delete();
                }
            }

            DB::table('insurance_claims')
                ->where('id', $claim->id)
                ->update([
                    'status' => 'pending',
                ]);

            if ($billing) {
                $currentBalance = $this->calculateBillingBalance($branchId, (int) $billing->id, (float) $billing->total_amount);
                DB::table('billing')
                    ->where('id', $billing->id)
                    ->update([
                        'balance' => $currentBalance,
                        'status' => $this->resolveBillingStatus(
                            $branchId,
                            (int) $billing->id,
                            $currentBalance,
                            (float) $billing->total_amount
                        ),
                    ]);
            }
        });

        return response()->json([
            'message' => 'Insurance claim reverted to pending.',
        ]);
    }

    public function updateClaim(Request $request, int $claimId): JsonResponse
    {
        if ($response = $this->ensureClaimWriteAccess($request)) {
            return $response;
        }

        $this->ensureInsuranceProvidersSchema();
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $claim = DB::table('insurance_claims')
            ->where('branch_id', $branchId)
            ->where('id', $claimId)
            ->first();

        if (! $claim) {
            return response()->json(['message' => 'Insurance claim not found for this branch.'], 404);
        }

        $providerOptions = $this->providerOptions();
        $validated = $request->validate([
            'insurance_provider' => ['required', Rule::in($providerOptions)],
            'insurance_number' => ['required', 'string', 'max:255'],
            'insurance_package' => ['nullable', 'string', 'max:255'],
            'patient_organization' => ['nullable', 'string', 'max:255'],
            'amount_paid' => ['required', 'numeric', 'min:0.01'],
            'date' => ['required', 'date'],
        ]);

        $billing = null;
        if (! empty($claim->billing_id)) {
            $billing = DB::table('billing')
                ->where('branch_id', $branchId)
                ->where('id', $claim->billing_id)
                ->first();
        }

        if ($billing) {
            $difference = round((float) $validated['amount_paid'] - (float) $claim->amount_paid, 2);
            $currentBalance = $this->calculateBillingBalance($branchId, (int) $billing->id, (float) $billing->total_amount);
            if ($difference > $currentBalance + 0.001) {
                return response()->json(['message' => 'Updated claim amount cannot exceed the current outstanding balance.' ], 422);
            }
        }

        $updatedClaim = (object) [
            'id' => $claim->id,
            'patient_id' => $claim->patient_id,
            'folder_id' => $claim->folder_id,
            'billing_id' => $claim->billing_id,
            'insurance_provider' => $validated['insurance_provider'],
            'insurance_number' => $validated['insurance_number'],
            'insurance_package' => $validated['insurance_package'] ?? '',
            'patient_organization' => $validated['patient_organization'] ?? '',
            'amount_paid' => (float) $validated['amount_paid'],
            'date' => $validated['date'],
            'status' => $claim->status,
        ];

        $sale = $claim->status === 'paid' ? $this->findInsuranceSale($branchId, $claim) : null;

        DB::transaction(function () use ($claim, $updatedClaim, $billing, $sale, $branchId, $validated): void {
            DB::table('insurance_claims')
                ->where('id', $claim->id)
                ->update([
                    'insurance_provider' => $validated['insurance_provider'],
                    'insurance_number' => $validated['insurance_number'],
                    'insurance_package' => $validated['insurance_package'] ?? '',
                    'patient_organization' => $validated['patient_organization'] ?? '',
                    'amount_paid' => $validated['amount_paid'],
                    'date' => $validated['date'],
                ]);

            if ($sale) {
                DB::table('sales')
                    ->where('id', $sale->id)
                    ->update($this->insuranceSaleUpdatePayload($this->insuranceSalePayload($updatedClaim, $billing, $branchId)));
            }

            if ($billing) {
                $adjustedBalance = $this->calculateBillingBalance($branchId, (int) $billing->id, (float) $billing->total_amount);
                DB::table('billing')
                    ->where('id', $billing->id)
                    ->update([
                        'balance' => $adjustedBalance,
                        'status' => $this->resolveBillingStatus($branchId, (int) $billing->id, $adjustedBalance, (float) $billing->total_amount),
                    ]);
            }
        });

        return response()->json([
            'message' => 'Insurance claim updated successfully.',
        ]);
    }

    public function deleteClaim(Request $request, int $claimId): JsonResponse
    {
        if ($response = $this->ensureClaimWriteAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $claim = DB::table('insurance_claims')
            ->where('branch_id', $branchId)
            ->where('id', $claimId)
            ->first();

        if (! $claim) {
            return response()->json(['message' => 'Insurance claim not found for this branch.'], 404);
        }

        $billing = null;
        if (! empty($claim->billing_id)) {
            $billing = DB::table('billing')
                ->where('branch_id', $branchId)
                ->where('id', $claim->billing_id)
                ->first();
        }

        $sale = $claim->status === 'paid' ? $this->findInsuranceSale($branchId, $claim) : null;

        DB::transaction(function () use ($claim, $billing, $sale, $branchId): void {
            if ($sale) {
                DB::table('sales')->where('id', $sale->id)->delete();
            }

            DB::table('insurance_claims')
                ->where('id', $claim->id)
                ->delete();

            if ($billing) {
                $restoredBalance = $this->calculateBillingBalance($branchId, (int) $billing->id, (float) $billing->total_amount);

                DB::table('billing')
                    ->where('id', $billing->id)
                    ->update([
                        'balance' => $restoredBalance,
                        'status' => $this->resolveBillingStatus($branchId, (int) $billing->id, $restoredBalance, (float) $billing->total_amount),
                    ]);
            }
        });

        return response()->json([
            'message' => 'Insurance claim deleted successfully.',
        ]);
    }

    public function providerCatalog(Request $request): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();

        return response()->json([
            'providers' => DB::table('insurance_providers')
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'is_active', 'created_at', 'updated_at']),
        ]);
    }

    public function storeProvider(Request $request): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();

        if ($response = $this->ensureProviderWriteAccess($request)) {
            return $response;
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
        ]);

        $name = $this->normalizeProviderName($validated['name']);
        if ($name === '') {
            return response()->json(['message' => 'Provider name is required.'], 422);
        }

        $existing = DB::table('insurance_providers')
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->first(['id', 'is_active']);

        if ($existing?->is_active) {
            return response()->json(['message' => 'This insurance provider already exists.'], 422);
        }

        if ($existing && ! $existing->is_active) {
          DB::table('insurance_providers')
              ->where('id', $existing->id)
              ->update([
                  'is_active' => true,
                  'updated_at' => now(),
              ]);

          return response()->json([
              'message' => 'Insurance provider restored successfully.',
              'provider' => DB::table('insurance_providers')->where('id', $existing->id)->first(['id', 'name', 'is_active', 'created_at', 'updated_at']),
          ]);
        }

        $providerId = DB::table('insurance_providers')->insertGetId([
            'name' => $name,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'message' => 'Insurance provider added successfully.',
            'provider' => DB::table('insurance_providers')->where('id', $providerId)->first(['id', 'name', 'is_active', 'created_at', 'updated_at']),
        ], 201);
    }

    public function deleteProvider(Request $request, int $providerId): JsonResponse
    {
        $this->ensureInsuranceProvidersSchema();

        if ($response = $this->ensureProviderWriteAccess($request)) {
            return $response;
        }

        $provider = DB::table('insurance_providers')->where('id', $providerId)->first();
        if (! $provider) {
            return response()->json(['message' => 'Insurance provider not found.'], 404);
        }

        DB::table('insurance_providers')
            ->where('id', $providerId)
            ->update([
                'is_active' => false,
                'updated_at' => now(),
            ]);

        return response()->json([
            'message' => 'Insurance provider deleted successfully.',
        ]);
    }

    public function providerOptions(): array
    {
        $this->ensureInsuranceProvidersSchema();

        return DB::table('insurance_providers')
            ->where('is_active', true)
            ->orderBy('name')
            ->pluck('name')
            ->values()
            ->all();
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

    private function buildFilteredClaimsQuery(Request $request, int $branchId)
    {
        $query = DB::table('insurance_claims as ic')
            ->leftJoin('billing as b', 'ic.billing_id', '=', 'b.id')
            ->leftJoin('patient_records as pr', 'ic.patient_id', '=', 'pr.id');
        $this->applyBranchScope($query, 'ic.branch_id', $branchId);

        $filters = $this->readClaimFilters($request);

        if ($filters['provider']) {
            $query->where('ic.insurance_provider', $filters['provider']);
        }

        if ($filters['status']) {
            $query->where('ic.status', $filters['status']);
        }

        if ($filters['date_from']) {
            $query->whereDate('ic.date', '>=', $filters['date_from']);
        }

        if ($filters['date_to']) {
            $query->whereDate('ic.date', '<=', $filters['date_to']);
        }

        if ($filters['search'] !== '') {
            $like = '%'.$filters['search'].'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('ic.folder_id', 'like', $like)
                    ->orWhere('b.name', 'like', $like)
                    ->orWhere('pr.name', 'like', $like)
                    ->orWhere(DB::raw("TRIM(CONCAT_WS(' ', pr.surname, pr.firstname, pr.othernames))"), 'like', $like)
                    ->orWhere('ic.insurance_number', 'like', $like)
                    ->orWhere('ic.patient_organization', 'like', $like)
                    ->orWhere('ic.insurance_package', 'like', $like)
                    ->orWhere('ic.insurance_provider', 'like', $like);
            });
        }

        return $query;
    }

    private function buildFilteredRemittanceQuery(Request $request, int $branchId)
    {
        $query = DB::table('insurance_remittances as ir');
        $this->applyBranchScope($query, 'ir.branch_id', $branchId);

        $filters = $this->readClaimFilters($request);

        if ($filters['provider']) {
            $query->where('ir.insurance_provider', $filters['provider']);
        }

        if ($filters['date_from']) {
            $query->whereDate('ir.date', '>=', $filters['date_from']);
        }

        if ($filters['date_to']) {
            $query->whereDate('ir.date', '<=', $filters['date_to']);
        }

        if ($filters['search'] !== '') {
            $like = '%'.$filters['search'].'%';
            $query->where(function ($inner) use ($like): void {
                $inner->where('ir.insurance_provider', 'like', $like)
                    ->orWhere('ir.reference', 'like', $like)
                    ->orWhere('ir.notes', 'like', $like);
            });
        }

        return $query;
    }

    private function readClaimFilters(Request $request): array
    {
        $provider = trim($request->string('provider')->toString());
        $status = trim($request->string('status')->toString());

        return [
            'search' => trim($request->string('search')->toString()),
            'provider' => $provider !== '' && $provider !== 'all' ? $provider : null,
            'status' => $status !== '' && $status !== 'all' ? $status : null,
            'date_from' => $request->filled('date_from') ? $request->string('date_from')->toString() : null,
            'date_to' => $request->filled('date_to') ? $request->string('date_to')->toString() : null,
        ];
    }

    private function buildClaimsSummary($query): array
    {
        $rows = $query
            ->selectRaw("
                LOWER(COALESCE(ic.status, 'pending')) as normalized_status,
                COUNT(ic.id) as claim_count,
                COALESCE(SUM(ic.amount_paid), 0) as total_amount
            ")
            ->groupByRaw("LOWER(COALESCE(ic.status, 'pending'))")
            ->get();

        $summary = [
            'claim_count' => 0,
            'total_amount' => 0.0,
            'pending_count' => 0,
            'pending_amount' => 0.0,
            'claimed_count' => 0,
            'claimed_amount' => 0.0,
            'paid_count' => 0,
            'paid_amount' => 0.0,
            'open_count' => 0,
            'open_amount' => 0.0,
            'average_claim_amount' => 0.0,
            'settlement_rate' => 0.0,
        ];

        foreach ($rows as $row) {
            $status = strtolower((string) $row->normalized_status);
            $count = (int) $row->claim_count;
            $amount = round((float) $row->total_amount, 2);

            $summary['claim_count'] += $count;
            $summary['total_amount'] += $amount;

            if ($status === 'paid') {
                $summary['paid_count'] += $count;
                $summary['paid_amount'] += $amount;
                continue;
            }

            if ($status === 'claimed') {
                $summary['claimed_count'] += $count;
                $summary['claimed_amount'] += $amount;
                continue;
            }

            $summary['pending_count'] += $count;
            $summary['pending_amount'] += $amount;
        }

        $summary['claim_count'] = (int) $summary['claim_count'];
        $summary['open_count'] = (int) ($summary['pending_count'] + $summary['claimed_count']);
        $summary['open_amount'] = round($summary['pending_amount'] + $summary['claimed_amount'], 2);
        $summary['total_amount'] = round($summary['total_amount'], 2);
        $summary['pending_amount'] = round($summary['pending_amount'], 2);
        $summary['claimed_amount'] = round($summary['claimed_amount'], 2);
        $summary['paid_amount'] = round($summary['paid_amount'], 2);
        $summary['average_claim_amount'] = $summary['claim_count'] > 0
            ? round($summary['total_amount'] / $summary['claim_count'], 2)
            : 0.0;
        $summary['settlement_rate'] = $summary['total_amount'] > 0
            ? round(($summary['paid_amount'] / $summary['total_amount']) * 100, 2)
            : 0.0;

        return $summary;
    }

    private function buildClaimsBreakdown($query, string $column): array
    {
        $scopedQuery = $query->selectRaw("
            COALESCE(NULLIF(TRIM($column), ''), 'Unspecified') as breakdown_label,
            LOWER(COALESCE(ic.status, 'pending')) as normalized_status,
            ic.amount_paid
        ");

        return DB::query()
            ->fromSub($scopedQuery, 'claim_scope')
            ->selectRaw("
                breakdown_label,
                COUNT(*) as claim_count,
                COALESCE(SUM(amount_paid), 0) as total_amount,
                COALESCE(SUM(CASE WHEN normalized_status = 'pending' THEN amount_paid ELSE 0 END), 0) as pending_amount,
                COALESCE(SUM(CASE WHEN normalized_status = 'claimed' THEN amount_paid ELSE 0 END), 0) as claimed_amount,
                COALESCE(SUM(CASE WHEN normalized_status = 'paid' THEN amount_paid ELSE 0 END), 0) as paid_amount
            ")
            ->groupBy('breakdown_label')
            ->orderByDesc('total_amount')
            ->orderBy('breakdown_label')
            ->get()
            ->map(fn ($row) => [
                'label' => $row->breakdown_label,
                'claim_count' => (int) $row->claim_count,
                'total_amount' => round((float) $row->total_amount, 2),
                'pending_amount' => round((float) $row->pending_amount, 2),
                'claimed_amount' => round((float) $row->claimed_amount, 2),
                'paid_amount' => round((float) $row->paid_amount, 2),
            ])
            ->values()
            ->all();
    }

    private function buildRemittanceSummary($query): array
    {
        $count = (int) (clone $query)->count('ir.id');
        $totalAmount = round((float) (clone $query)->sum('ir.amount_paid'), 2);

        return [
            'record_count' => $count,
            'total_amount' => $totalAmount,
            'average_amount' => $count > 0 ? round($totalAmount / $count, 2) : 0.0,
        ];
    }

    private function buildSimpleInsuranceSummary($claimsQuery, $remittanceQuery): array
    {
        $claimSummary = $this->buildClaimsSummary(clone $claimsQuery);
        $remittanceSummary = $this->buildRemittanceSummary(clone $remittanceQuery);
        $totalClaimed = round((float) $claimSummary['total_amount'], 2);
        $paidAgainstClaims = round((float) $claimSummary['paid_amount'], 2);
        $unallocatedPaid = round((float) $remittanceSummary['total_amount'], 2);

        return [
            'total_claimed' => $totalClaimed,
            'claimed_not_paid' => round((float) $claimSummary['claimed_amount'], 2),
            'pending_amount' => round((float) $claimSummary['pending_amount'], 2),
            'paid_against_claims' => $paidAgainstClaims,
            'manual_paid_amount' => $unallocatedPaid,
            'total_paid_received' => round($paidAgainstClaims + $unallocatedPaid, 2),
        ];
    }

    private function ensureWritableBranch(int $branchId): ?JsonResponse
    {
        if ($branchId !== 0) {
            return null;
        }

        return response()->json([
            'message' => 'Merged mode is read-only. Switch to a branch before recording or updating insurance claims.',
        ], 422);
    }

    private function ensureInsuranceProvidersSchema(): void
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

        foreach ([
            'APEX',
            'ACACIA',
            'GLICO',
            'PREMIERE HEALTH INSURANCE',
            'NATIONWIDE',
        ] as $provider) {
            $this->upsertProvider($provider);
        }

        $existingProviders = DB::table('insurance_claims')
            ->whereNotNull('insurance_provider')
            ->where('insurance_provider', '!=', '')
            ->distinct()
            ->pluck('insurance_provider')
            ->merge(
                DB::table('billing')
                    ->whereNotNull('health_insurance')
                    ->where('health_insurance', '!=', '')
                    ->where('health_insurance', '!=', 'NONE')
                    ->distinct()
                    ->pluck('health_insurance')
            );

        foreach ($existingProviders as $provider) {
            $this->upsertProvider((string) $provider);
        }
    }

    private function ensureInsuranceRemittanceSchema(): void
    {
        if (! Schema::hasTable('insurance_remittances')) {
            Schema::create('insurance_remittances', function (Blueprint $table): void {
                $table->id();
                $table->string('insurance_provider', 80);
                $table->decimal('amount_paid', 12, 2);
                $table->date('date');
                $table->string('reference')->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('branch_id');
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
            });
        }
    }

    private function upsertProvider(string $name): void
    {
        $normalized = $this->normalizeProviderName($name);
        if ($normalized === '') {
            return;
        }

        $existing = DB::table('insurance_providers')
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($normalized)])
            ->first(['id', 'is_active']);

        if ($existing?->is_active) {
            return;
        }

        if ($existing && ! $existing->is_active) {
            return;
        }

        DB::table('insurance_providers')->insert([
            'name' => $normalized,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function normalizeProviderName(string $name): string
    {
        return trim(preg_replace('/\s+/', ' ', mb_strtoupper($name)) ?? '');
    }

    private function findInsuranceSale(int $branchId, object $claim): ?object
    {
        return DB::table('sales')
            ->where('branch_id', $branchId)
            ->where('billing_id', $claim->billing_id)
            ->where('payment_method', 'Insurance')
            ->where(function ($query) use ($claim): void {
                $query->where('transaction_id', 'INS-CLAIM-'.$claim->id)
                    ->orWhere('reference', 'INS-CLAIM-'.$claim->id)
                    ->orWhere('reference', $claim->insurance_number ?: ('INS-CLAIM-'.$claim->id))
                    ->orWhere(function ($fallback) use ($claim): void {
                        $fallback->where('amount_paid', $claim->amount_paid)
                            ->where('folder_id', $claim->folder_id)
                            ->where('description', 'like', 'Insurance payment received from '.$claim->insurance_provider.'%');
                    });
            })
            ->orderByDesc('id')
            ->first();
    }

    private function insuranceSalePayload(object $claim, ?object $billing, int $branchId): array
    {
        return [
            'date' => now()->toDateString(),
            'amount_paid' => $claim->amount_paid,
            'description' => 'Insurance payment received from '.$claim->insurance_provider.' for Folder ID: '.$claim->folder_id,
            'billing_id' => $claim->billing_id,
            'patient_id' => $claim->patient_id,
            'customer_id' => $billing?->customer_id,
            'folder_id' => $claim->folder_id,
            'payment_method' => 'Insurance',
            'transaction_id' => 'INS-CLAIM-'.$claim->id,
            'reference' => $claim->insurance_number ?: ('INS-CLAIM-'.$claim->id),
            'branch_id' => $branchId,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function calculateBillingBalance(int $branchId, int $billingId, float $totalAmount): float
    {
        $salesPaid = (float) DB::table('sales')
            ->where('branch_id', $branchId)
            ->where('billing_id', $billingId)
            ->where('payment_method', '!=', 'Insurance')
            ->sum('amount_paid');

        $insuranceClaimed = (float) DB::table('insurance_claims')
            ->where('branch_id', $branchId)
            ->where('billing_id', $billingId)
            ->sum('amount_paid');

        return max(round($totalAmount - $salesPaid - $insuranceClaimed, 2), 0);
    }

    private function resolveBillingStatus(int $branchId, int $billingId, float $balance, float $totalAmount): string
    {
        $hasOpenClaims = DB::table('insurance_claims')
            ->where('branch_id', $branchId)
            ->where('billing_id', $billingId)
            ->whereIn('status', ['pending', 'claimed'])
            ->exists();

        if ($hasOpenClaims) {
            return 'insurance_pending';
        }

        if ($balance <= 0.5) {
            return 'paid';
        }

        $hasRecoveries = DB::table('sales')
            ->where('branch_id', $branchId)
            ->where('billing_id', $billingId)
            ->where('payment_method', '!=', 'Insurance')
            ->exists()
            || DB::table('insurance_claims')
                ->where('branch_id', $branchId)
                ->where('billing_id', $billingId)
                ->exists();

        if (! $hasRecoveries && abs($balance - $totalAmount) <= 0.5) {
            return 'balance_remaining';
        }

        return 'pending';
    }

    private function normalizeRole(?string $role): string
    {
        return strtolower(trim((string) $role));
    }

    private function insuranceSaleUpdatePayload(array $payload): array
    {
        unset($payload['created_at']);
        $payload['updated_at'] = now();

        return $payload;
    }

    private function ensureClaimWriteAccess(Request $request): ?JsonResponse
    {
        $user = $request->user();
        $role = $this->normalizeRole($user?->normalized_role ?? $user?->role);

        if ($role !== 'manager' && ! ($user?->is_admin ?? false)) {
            return response()->json([
                'message' => 'Only the General Manager can edit or delete insurance claims.',
            ], 403);
        }

        return null;
    }

    private function ensureProviderWriteAccess(Request $request): ?JsonResponse
    {
        $user = $request->user();
        $role = $this->normalizeRole($user?->normalized_role ?? $user?->role);

        if ($role !== 'manager' && ! ($user?->is_admin ?? false)) {
            return response()->json([
                'message' => 'Only the General Manager can manage insurance providers.',
            ], 403);
        }

        return null;
    }

    private function ensureRemittanceWriteAccess(Request $request): ?JsonResponse
    {
        $user = $request->user();
        $role = $this->normalizeRole($user?->normalized_role ?? $user?->role);

        if (! in_array($role, ['manager', 'accountant'], true) && ! ($user?->is_admin ?? false)) {
            return response()->json([
                'message' => 'Only the General Manager or Accountant can record manual insurance remittances.',
            ], 403);
        }

        return null;
    }
}
