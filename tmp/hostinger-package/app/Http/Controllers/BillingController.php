<?php

namespace App\Http\Controllers;

use App\Support\AuditLog;
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

    public function historicalLensSellingPrices(Request $request): JsonResponse
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        if (! in_array($role, ['manager', 'technician', 'receptionist'], true)) {
            return response()->json(['message' => 'This role cannot view selling-price matches.'], 403);
        }

        $branchId = $this->resolveBranchId($request);
        $records = DB::table('billing as b')
            ->leftJoin('glasses_prescriptions as gp', function ($join): void {
                $join->on('gp.prescription_id', '=', 'b.prescription_id')
                    ->on('gp.folder_id', '=', 'b.folder_id');
            })
            ->when($branchId > 0, fn ($query) => $query->where('b.branch_id', $branchId))
            ->whereIn('b.status', ['paid', 'completed'])
            ->where('b.lens_price', '>', 0)
            ->orderByDesc('b.date')
            ->orderByDesc('b.id')
            ->limit(500)
            ->get([
                'b.id as billing_id',
                'b.date as billed_date',
                'b.status as billing_status',
                'b.lens_price',
                'b.folder_id',
                'b.name as patient_name',
                'gp.prescription_id',
                'gp.lens_type',
                'gp.lens_material',
                'gp.sph_od',
                'gp.sph_os',
                'gp.cyl_od',
                'gp.cyl_os',
                'gp.add_od',
                'gp.add_os',
                'gp.ipd',
            ]);

        $formRows = DB::table('patient_form_data as pfd')
            ->whereIn('folder_id', $records->pluck('folder_id')->unique()->values())
            ->when(
                Schema::hasColumn('patient_form_data', 'branch_id') && $branchId > 0,
                fn ($query) => $query->where('pfd.branch_id', $branchId),
            )
            ->get(['pfd.folder_id', 'pfd.updated_at', 'pfd.form_data']);

        foreach ($records->whereNull('prescription_id') as $record) {
            $matchingForms = $formRows
                ->filter(function ($candidate) use ($record): bool {
                    return $candidate->folder_id === $record->folder_id
                        && substr((string) $candidate->updated_at, 0, 10) === substr((string) $record->billed_date, 0, 10);
                })
                ->map(fn ($candidate) => $this->examFormPrescription($candidate->form_data))
                ->filter()
                ->values();

            // Do not assign a bill when multiple prescriptions exist on the same day.
            if ($matchingForms->count() !== 1) {
                continue;
            }

            $records->push((object) [
                'billing_id' => $record->billing_id,
                'billed_date' => $record->billed_date,
                'billing_status' => $record->billing_status,
                'lens_price' => $record->lens_price,
                'folder_id' => $record->folder_id,
                'patient_name' => $record->patient_name,
                'prescription_id' => null,
                ...$matchingForms->first(),
            ]);
        }

        $records = $records
            ->filter(fn ($record) => trim((string) ($record->lens_type ?? '')) !== '')
            ->values();

        $grouped = $records
            ->groupBy(fn ($record) => implode('|', [
                $record->lens_type ?? '',
                $record->lens_material ?? '',
                number_format((float) $record->lens_price, 2, '.', ''),
            ]))
            ->values()
            ->map(function ($matches, int $index): array {
                $prices = $matches->pluck('lens_price')->map(fn ($price) => (float) $price)->unique()->values();
                $first = $matches->first();
                $sphValues = $this->prescriptionNumbers($matches, ['sph_od', 'sph_os']);
                $cylValues = $this->prescriptionNumbers($matches, ['cyl_od', 'cyl_os']);
                $addValues = $this->prescriptionNumbers($matches, ['add_od', 'add_os']);

                return [
                    'id' => "historical-range-{$index}",
                    'prescription_count' => $matches->count(),
                    'category' => $this->lensCategory($first->lens_type),
                    'lens_type' => $first->lens_type,
                    'lens_material' => $first->lens_material,
                    'sph_range' => $this->formatPrescriptionRange($sphValues),
                    'cyl_range' => $this->formatPrescriptionRange($cylValues),
                    'add_range' => $this->formatPrescriptionRange($addValues),
                    'selling_price' => $prices->count() === 1 ? $prices->first() : null,
                    'historical_prices' => $prices,
                    'prescription_examples' => $matches->map(fn ($match) => [
                        'sph_od' => $match->sph_od,
                        'sph_os' => $match->sph_os,
                        'cyl_od' => $match->cyl_od,
                        'cyl_os' => $match->cyl_os,
                        'add_od' => $match->add_od,
                        'add_os' => $match->add_os,
                    ])->values(),
                    'status' => 'Pre-list - pending review',
                ];
            });

        return response()->json([
            'branch_id' => $branchId,
            'currency' => 'GHS',
            'source' => 'paid_or_completed_bills',
            'records' => $grouped,
        ]);
    }

    private function examFormPrescription(?string $formData): ?array
    {
        $data = $formData ? json_decode($formData, true) : null;
        $od = $data['spectacle_rx']['od'] ?? null;
        $os = $data['spectacle_rx']['os'] ?? null;
        if (! is_array($od) && ! is_array($os)) {
            return null;
        }

        return [
            'lens_type' => is_array($od) ? ($od['lens_type'] ?? '') : ($os['lens_type'] ?? ''),
            'lens_material' => null,
            'sph_od' => is_array($od) ? ($od['sphere'] ?? '') : '',
            'sph_os' => is_array($os) ? ($os['sphere'] ?? '') : '',
            'cyl_od' => is_array($od) ? ($od['cylinder'] ?? '') : '',
            'cyl_os' => is_array($os) ? ($os['cylinder'] ?? '') : '',
            'add_od' => is_array($od) ? ($od['add'] ?? '') : '',
            'add_os' => is_array($os) ? ($os['add'] ?? '') : '',
            'ipd' => null,
        ];
    }

    public function storeSellingPriceRequest(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $validated = $request->validate([
            'patient_id' => ['nullable', 'integer'],
            'prescription_id' => ['nullable', 'integer'],
            'requested_price' => ['required', 'numeric', 'gt:0'],
            'lens_type' => ['nullable', 'string', 'max:255'],
            'lens_material' => ['nullable', 'string', 'max:255'],
            'sph_od' => ['nullable', 'string', 'max:20'],
            'sph_os' => ['nullable', 'string', 'max:20'],
            'cyl_od' => ['nullable', 'string', 'max:20'],
            'cyl_os' => ['nullable', 'string', 'max:20'],
            'add_od' => ['nullable', 'string', 'max:20'],
            'add_os' => ['nullable', 'string', 'max:20'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $requestId = DB::table('lens_selling_price_requests')->insertGetId([
            'branch_id' => $branchId,
            'patient_id' => $validated['patient_id'] ?? null,
            'prescription_id' => $validated['prescription_id'] ?? null,
            'requested_by' => $request->user()?->id,
            'status' => 'pending',
            'requested_price' => $validated['requested_price'],
            'lens_type' => $validated['lens_type'] ?? null,
            'lens_material' => $validated['lens_material'] ?? null,
            'sph_od' => $validated['sph_od'] ?? null,
            'sph_os' => $validated['sph_os'] ?? null,
            'cyl_od' => $validated['cyl_od'] ?? null,
            'cyl_os' => $validated['cyl_os'] ?? null,
            'add_od' => $validated['add_od'] ?? null,
            'add_os' => $validated['add_os'] ?? null,
            'notes' => $validated['notes'] ?? 'Manual selling price requested from billing.',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'message' => 'Selling-price request submitted for Technician and GM approval.',
            'request_id' => $requestId,
            'status' => 'pending',
        ], 201);
    }

    public function sellingPriceRequests(Request $request): JsonResponse
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        if (! in_array($role, ['manager', 'technician'], true)) {
            return response()->json(['message' => 'Only the General Manager or Technician can view selling-price requests.'], 403);
        }

        $branchId = $this->resolveBranchId($request);
        $records = DB::table('lens_selling_price_requests')
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return response()->json([
            'branch_id' => $branchId,
            'records' => $records,
        ]);
    }

    public function approveSellingPriceRequest(Request $request, int $requestId): JsonResponse
    {
        $this->ensureSellingPriceRuleAccess($request);
        $branchId = $this->resolveBranchId($request);
        $priceRequest = DB::table('lens_selling_price_requests')
            ->where('id', $requestId)
            ->where('branch_id', $branchId)
            ->where('status', 'pending')
            ->first();

        if (! $priceRequest) {
            return response()->json(['message' => 'Pending selling-price request not found.'], 404);
        }

        $range = static function (...$values): ?string {
            $numbers = collect($values)
                ->map(fn ($value) => is_numeric($value) ? (float) $value : null)
                ->filter(fn ($value) => $value !== null)
                ->values();
            if ($numbers->isEmpty()) return null;
            $min = $numbers->min();
            $max = $numbers->max();
            return $min === $max
                ? number_format($min, 2, '.', '')
                : number_format($max, 2, '.', '').' to '.number_format($min, 2, '.', '');
        };
        $example = [
            'sph_od' => $priceRequest->sph_od ?? '',
            'sph_os' => $priceRequest->sph_os ?? '',
            'cyl_od' => $priceRequest->cyl_od ?? '',
            'cyl_os' => $priceRequest->cyl_os ?? '',
            'add_od' => $priceRequest->add_od ?? '',
            'add_os' => $priceRequest->add_os ?? '',
        ];
        $ruleValues = [
            'category' => $this->lensCategory($priceRequest->lens_type),
            'lens_type' => $priceRequest->lens_type ?? 'Other',
            'lens_material' => $priceRequest->lens_material,
            'lens_index' => null,
            'sph_range' => $range($priceRequest->sph_od, $priceRequest->sph_os),
            'cyl_range' => $range($priceRequest->cyl_od, $priceRequest->cyl_os),
            'add_range' => $range($priceRequest->add_od, $priceRequest->add_os),
            'price_label' => null,
            'selling_price' => $priceRequest->requested_price,
            'prescription_examples' => json_encode([$example]),
            'prescription_count' => 1,
            'status' => 'approved',
            'updated_by' => $request->user()?->id,
            'updated_at' => now(),
        ];

        DB::transaction(function () use ($request, $requestId, $branchId, $priceRequest, $ruleValues): void {
            DB::table('lens_selling_price_rules')->insert([
                ...$ruleValues,
                'branch_id' => $branchId,
                'created_by' => $request->user()?->id,
                'created_at' => now(),
                'notes' => 'Approved from receptionist selling-price request #'.$requestId.'.',
            ]);
            DB::table('lens_selling_price_requests')
                ->where('id', $requestId)
                ->update([
                    'status' => 'approved',
                    'updated_at' => now(),
                ]);
        });

        return response()->json(['message' => 'Selling-price request approved and added to the catalogue.']);
    }

    public function sellingPriceRules(Request $request): JsonResponse
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        if (! in_array($role, ['manager', 'technician', 'receptionist'], true)) {
            return response()->json(['message' => 'This role cannot view selling-price rules.'], 403);
        }

        $branchId = $this->resolveBranchId($request);
        return response()->json([
            'branch_id' => $branchId,
            'currency' => 'GHS',
            'records' => DB::table('lens_selling_price_rules')
                ->whereIn('status', ['approved', 'pending_price'])
                ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
                ->orderBy('category')
                ->orderBy('lens_type')
                ->orderBy('id')
                ->get()
                ->map(function ($record) {
                    $record->prescription_examples = $record->prescription_examples
                        ? json_decode($record->prescription_examples, true)
                        : [];
                        $record->prescription_count = (int) ($record->prescription_count ?? count($record->prescription_examples));
                    return $record;
                }),
        ]);
    }

    public function catalogueSellingPricePrescription(Request $request): JsonResponse
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        if (! in_array($role, ['manager', 'technician', 'receptionist', 'optometrist'], true)) {
            return response()->json(['message' => 'This role cannot add lens catalogue entries.'], 403);
        }

        $branchId = $this->resolveBranchId($request);
        $validated = $request->validate([
            'lens_type' => ['required', 'string', 'max:255'],
            'lens_material' => ['nullable', 'string', 'max:255'],
            'lens_index' => ['nullable', 'string', 'max:50'],
            'sph_od' => ['nullable', 'string', 'max:20'],
            'sph_os' => ['nullable', 'string', 'max:20'],
            'cyl_od' => ['nullable', 'string', 'max:20'],
            'cyl_os' => ['nullable', 'string', 'max:20'],
            'add_od' => ['nullable', 'string', 'max:20'],
            'add_os' => ['nullable', 'string', 'max:20'],
        ]);
        $range = static function (...$values): ?string {
            $numbers = collect($values)->map(fn ($value) => is_numeric($value) ? (float) $value : null)->filter(fn ($value) => $value !== null)->values();
            if ($numbers->isEmpty()) return null;
            $min = $numbers->min();
            $max = $numbers->max();
            return $min === $max ? number_format($min, 2, '.', '') : number_format($max, 2, '.', '').' to '.number_format($min, 2, '.', '');
        };
        $lensType = trim($validated['lens_type']);
        $lensMaterial = $validated['lens_material'] ?? null;
        $lensIndex = $validated['lens_index'] ?? null;
        $sphRange = $range($validated['sph_od'] ?? null, $validated['sph_os'] ?? null);
        $cylRange = $range($validated['cyl_od'] ?? null, $validated['cyl_os'] ?? null);
        $addRange = $range($validated['add_od'] ?? null, $validated['add_os'] ?? null);
        $existing = DB::table('lens_selling_price_rules')
            ->where('branch_id', $branchId)
            ->where('status', 'pending_price')
            ->where('lens_type', $lensType)
            ->where('lens_material', $lensMaterial)
            ->where('lens_index', $lensIndex)
            ->where('sph_range', $sphRange)
            ->where('cyl_range', $cylRange)
            ->where('add_range', $addRange)
            ->first();
        if ($existing) return response()->json(['record' => $existing, 'created' => false]);

        $record = [
            'branch_id' => $branchId,
            'category' => $this->lensCategory($lensType),
            'lens_type' => $lensType,
            'lens_material' => $lensMaterial,
            'lens_index' => $lensIndex,
            'sph_range' => $sphRange,
            'cyl_range' => $cylRange,
            'add_range' => $addRange,
            'price_label' => null,
            'selling_price' => null,
            'status' => 'pending_price',
            'notes' => 'Automatically added from an optometrist prescription; price pending GM or Technician approval.',
            'prescription_examples' => json_encode([[
                'sph_od' => $validated['sph_od'] ?? '',
                'sph_os' => $validated['sph_os'] ?? '',
                'cyl_od' => $validated['cyl_od'] ?? '',
                'cyl_os' => $validated['cyl_os'] ?? '',
                'add_od' => $validated['add_od'] ?? '',
                'add_os' => $validated['add_os'] ?? '',
            ]]),
            'prescription_count' => 1,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        $id = DB::table('lens_selling_price_rules')->insertGetId($record);
        return response()->json(['record' => DB::table('lens_selling_price_rules')->where('id', $id)->first(), 'created' => true], 201);
    }

    public function sellingPriceSettings(Request $request): JsonResponse
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        if (! in_array($role, ['manager', 'technician', 'receptionist'], true)) {
            return response()->json(['message' => 'This role cannot view selling-price settings.'], 403);
        }

        $branchId = $this->resolveBranchId($request);
        $settings = DB::table('lens_selling_price_settings')->where('branch_id', $branchId)->first();

        return response()->json([
            'branch_id' => $branchId,
            'receptionist_override_allowed' => $settings?->receptionist_override_allowed ?? true,
        ]);
    }

    public function updateSellingPriceSettings(Request $request): JsonResponse
    {
        $this->ensureSellingPriceRuleAccess($request);
        $branchId = $this->resolveBranchId($request);
        $validated = $request->validate([
            'receptionist_override_allowed' => ['required', 'boolean'],
        ]);

        DB::table('lens_selling_price_settings')->updateOrInsert(
            ['branch_id' => $branchId],
            [
                'receptionist_override_allowed' => $validated['receptionist_override_allowed'],
                'updated_by' => $request->user()?->id,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );

        return $this->sellingPriceSettings($request);
    }

    public function bootstrapSellingPriceRules(Request $request): JsonResponse
    {
        $this->ensureSellingPriceRuleAccess($request);
        $branchId = $this->resolveBranchId($request);
        $existing = DB::table('lens_selling_price_rules')
            ->where('branch_id', $branchId)
            ->where('status', 'approved')
            ->exists();
        if ($existing) {
            return $this->sellingPriceRules($request);
        }

        $historical = $this->historicalLensSellingPrices($request)->getData(true)['records'] ?? [];
        foreach ($historical as $record) {
            if (($record['selling_price'] ?? null) === null) {
                continue;
            }
            DB::table('lens_selling_price_rules')->insert([
                'branch_id' => $branchId,
                'category' => $record['category'] ?? null,
                'lens_type' => $record['lens_type'] ?? '',
                'lens_material' => $record['lens_material'] ?? null,
                'sph_range' => $record['sph_range'] ?? null,
                'cyl_range' => $record['cyl_range'] ?? null,
                'add_range' => $record['add_range'] ?? null,
                'selling_price' => $record['selling_price'],
                'prescription_examples' => json_encode($record['prescription_examples'] ?? []),
                'prescription_count' => $record['prescription_count'] ?? count($record['prescription_examples'] ?? []),
                'status' => 'approved',
                'created_by' => $request->user()?->id,
                'updated_by' => $request->user()?->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $this->sellingPriceRules($request);
    }

    public function storeSellingPriceRule(Request $request): JsonResponse
    {
        return $this->saveSellingPriceRule($request);
    }

    public function updateSellingPriceRule(Request $request, int $ruleId): JsonResponse
    {
        return $this->saveSellingPriceRule($request, $ruleId);
    }

    public function deleteSellingPriceRule(Request $request, int $ruleId): JsonResponse
    {
        $this->ensureSellingPriceRuleAccess($request);
        $branchId = $this->resolveBranchId($request);
        $deleted = DB::table('lens_selling_price_rules')
            ->where('id', $ruleId)
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->delete();

        if ($deleted === 0) {
            return response()->json(['message' => 'Selling-price rule not found.'], 404);
        }

        return response()->json(['message' => 'Selling-price rule deleted.']);
    }

    private function saveSellingPriceRule(Request $request, ?int $ruleId = null): JsonResponse
    {
        $this->ensureSellingPriceRuleAccess($request);
        $branchId = $this->resolveBranchId($request);
        $validated = $request->validate([
            'category' => ['nullable', 'string', 'max:255'],
            'lens_type' => ['required', 'string', 'max:255'],
            'lens_material' => ['nullable', 'string', 'max:255'],
            'lens_index' => ['nullable', 'string', 'max:50'],
            'sph_range' => ['nullable', 'string', 'max:100'],
            'cyl_range' => ['nullable', 'string', 'max:100'],
            'add_range' => ['nullable', 'string', 'max:100'],
            'price_label' => ['nullable', 'string', 'max:100'],
            'selling_price' => ['nullable', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'receptionist_override_allowed' => ['sometimes', 'boolean'],
        ]);

        $values = [
            ...$validated,
            'branch_id' => $branchId,
            'status' => empty($validated['selling_price']) ? 'pending_price' : 'approved',
            'updated_by' => $request->user()?->id,
            'updated_at' => now(),
            'prescription_examples' => json_encode($request->input('prescription_examples', [])),
            'prescription_count' => count($request->input('prescription_examples', [])),
        ];
        if ($ruleId === null) {
            $values['created_by'] = $request->user()?->id;
            $values['created_at'] = now();
            $ruleId = DB::table('lens_selling_price_rules')->insertGetId($values);
        } else {
            $updated = DB::table('lens_selling_price_rules')
                ->where('id', $ruleId)
                ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
                ->update($values);
            if ($updated === 0) {
                return response()->json(['message' => 'Selling-price rule not found.'], 404);
            }
        }

        return response()->json([
            'message' => empty($validated['selling_price'])
                ? 'Selling-price catalogue entry saved with price pending.'
                : ($ruleId ? 'Selling-price rule saved as approved.' : 'Selling-price rule approved.'),
            'record' => DB::table('lens_selling_price_rules')->where('id', $ruleId)->first(),
        ], $ruleId ? 200 : 201);
    }

    private function ensureSellingPriceRuleAccess(Request $request): void
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        abort_unless(in_array($role, ['manager', 'technician'], true), 403, 'Only the General Manager or Technician can edit selling-price rules.');
    }

    private function prescriptionNumbers($records, array $fields): array
    {
        return $records
            ->flatMap(fn ($record) => collect($fields)->map(fn ($field) => $record->{$field} ?? null))
            ->map(function ($value) {
                if ($value === null || trim((string) $value) === '') {
                    return null;
                }
                $normalized = str_replace(',', '.', trim((string) $value));
                return is_numeric($normalized) ? (float) $normalized : null;
            })
            ->filter(fn ($value) => $value !== null)
            ->values()
            ->all();
    }

    private function formatPrescriptionRange(array $values): ?string
    {
        if ($values === []) {
            return null;
        }

        $min = min($values);
        $max = max($values);
        $format = static fn (float $value): string => number_format($value, 2, '.', '');

        return $min === $max ? $format($min) : "{$format($max)} to {$format($min)}";
    }

    private function lensCategory(?string $lensType): string
    {
        $value = strtolower((string) $lensType);
        if (str_contains($value, 'prog')) return 'Progressive';
        if (str_contains($value, 'bf') || str_contains($value, 'bifocal')) return 'Bifocal';
        if (str_contains($value, 'sv') || str_contains($value, 'single')) return 'Single Vision';
        return 'Other';
    }

    public function patientSearch(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $search = trim($request->string('search')->toString());

        if ($search === '') {
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
        $refundTotals = Schema::hasTable('billing_refunds')
            ? DB::table('billing_refunds')
                ->select('billing_id', 'branch_id', DB::raw('SUM(amount) as total_refunded'))
                ->groupBy('billing_id', 'branch_id')
            : null;
        $latestPatientByFolder = DB::table('patient_records')
            ->select('branch_id', 'folder_id', DB::raw('MAX(id) as patient_id'))
            ->groupBy('branch_id', 'folder_id');

        $baseQuery = DB::table('billing as b')
            ->leftJoin('patient_records as patient_by_id', function ($join): void {
                $join->on('b.patient_id', '=', 'patient_by_id.id')
                    ->on('b.branch_id', '=', 'patient_by_id.branch_id');
            })
            ->leftJoinSub($latestPatientByFolder, 'latest_patient_folder', function ($join): void {
                $join->on('b.folder_id', '=', 'latest_patient_folder.folder_id')
                    ->on('b.branch_id', '=', 'latest_patient_folder.branch_id')
                    ->whereNull('patient_by_id.id');
            })
            ->leftJoin('patient_records as patient_by_folder', function ($join): void {
                $join->on('latest_patient_folder.patient_id', '=', 'patient_by_folder.id')
                    ->on('latest_patient_folder.branch_id', '=', 'patient_by_folder.branch_id');
            })
            ->leftJoin('customers as c', 'b.customer_id', '=', 'c.id')
            ->leftJoin('users as patient_creator', function ($join): void {
                $join->on('patient_creator.id', '=', DB::raw('COALESCE(patient_by_id.created_by, patient_by_folder.created_by)'));
            })
            ->leftJoin('users as creator', 'b.created_by', '=', 'creator.id')
            ->leftJoinSub($salesTotals, 'sales_totals', function ($join): void {
                $join->on('b.id', '=', 'sales_totals.billing_id');
            })
            ->leftJoinSub($claimTotals, 'claim_totals', function ($join): void {
                $join->on('b.id', '=', 'claim_totals.billing_id');
            });
        if ($refundTotals) {
            $baseQuery->leftJoinSub($refundTotals, 'refund_totals', function ($join): void {
                $join->on('b.id', '=', 'refund_totals.billing_id')
                    ->on('b.branch_id', '=', 'refund_totals.branch_id');
            });
        }
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
                DB::raw('COALESCE(patient_creator.name, creator.name) as entered_by'),
                DB::raw('COALESCE(patient_by_id.phone, patient_by_folder.phone) as patient_phone'),
                'c.phone as customer_phone',
                DB::raw('COALESCE(sales_totals.total_sales_paid, 0) as sales_paid'),
                DB::raw('COALESCE(claim_totals.insurance_claimed, 0) as insurance_claimed'),
                DB::raw('COALESCE(sales_totals.total_sales_paid, 0) + COALESCE(claim_totals.insurance_claimed, 0) as total_paid'),
                $refundTotals
                    ? DB::raw('COALESCE(refund_totals.total_refunded, 0) as total_refunded')
                    : DB::raw('0 as total_refunded'),
                DB::raw('COALESCE(b.balance, 0) as calculated_balance'),
            ])
            ->map(fn ($record) => $this->mapBillingRecord($record));

        $total = (clone $baseQuery)->count('b.id');
        $filteredTotalAmount = (float) (clone $statsBase)->sum('b.total_amount');
        $filteredOutstandingAmount = (float) ((clone $statsBase)
            ->sum('b.balance') ?? 0);
        $filteredCollectedAmount = (float) (clone $statsBase)->sum(DB::raw(
            'COALESCE(sales_totals.total_sales_paid, 0) + COALESCE(claim_totals.insurance_claimed, 0)'
        ));
        $filteredPendingBills = (int) (clone $statsBase)
            ->whereIn('b.status', ['pending', 'partially_paid'])
            ->count('b.id');
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
                ->whereIn('status', ['pending', 'partially_paid'])
                ->count(),
            'paid_bills' => (int) tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->where('status', 'paid')
                ->count(),
            'today_bills' => (int) tap(DB::table('billing'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
                ->whereDate('date', now()->toDateString())
                ->count(),
            'filtered_total_bills' => $total,
            'filtered_pending_bills' => $filteredPendingBills,
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

    public function search(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $perPage = min(max((int) $request->integer('per_page', 15), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $query = DB::table('billing as b');
        $this->applyBranchScope($query, 'b.branch_id', $branchId);
        $this->applyBillingSearchFilters($query, $request);

        $summary = (clone $query)
            ->selectRaw('COUNT(b.id) as total_bills')
            ->selectRaw('COALESCE(SUM(b.total_amount), 0) as total_amount')
            ->selectRaw('COALESCE(SUM(b.balance), 0) as outstanding_amount')
            ->selectRaw("SUM(CASE WHEN b.status IN ('pending', 'partially_paid') THEN 1 ELSE 0 END) as pending_bills")
            ->selectRaw("SUM(CASE WHEN b.status = 'paid' THEN 1 ELSE 0 END) as paid_bills")
            ->selectRaw("SUM(CASE WHEN b.health_insurance IS NOT NULL AND b.health_insurance != '' AND b.health_insurance != 'NONE' THEN 1 ELSE 0 END) as insured_bill_count")
            ->selectRaw("COALESCE(SUM(CASE WHEN b.health_insurance IS NOT NULL AND b.health_insurance != '' AND b.health_insurance != 'NONE' THEN b.total_amount ELSE 0 END), 0) as insured_bill_value")
            ->first();
        $filteredTotalAmount = (float) $summary->total_amount;
        $filteredOutstandingAmount = (float) $summary->outstanding_amount;
        $filteredCollectedAmount = max($filteredTotalAmount - $filteredOutstandingAmount, 0);
        $overallQuery = DB::table('billing as b');
        $this->applyBranchScope($overallQuery, 'b.branch_id', $branchId);
        $overallStats = $overallQuery
            ->selectRaw('COUNT(b.id) as total_bills')
            ->selectRaw('COALESCE(SUM(b.total_amount), 0) as total_amount')
            ->selectRaw("SUM(CASE WHEN b.status IN ('pending', 'partially_paid') THEN 1 ELSE 0 END) as pending_bills")
            ->selectRaw("SUM(CASE WHEN b.status = 'paid' THEN 1 ELSE 0 END) as paid_bills")
            ->selectRaw('SUM(CASE WHEN DATE(b.date) = ? THEN 1 ELSE 0 END) as today_bills', [now()->toDateString()])
            ->first();

        $breakdown = (clone $query)
            ->select('b.status', 'b.branch_id', DB::raw('COUNT(b.id) as total'), DB::raw('SUM(b.total_amount) as amount'))
            ->groupBy('b.status', 'b.branch_id')
            ->get();
        $statusBreakdown = $breakdown
            ->groupBy('status')
            ->map(fn ($items, $status) => [
                'label' => $status,
                'count' => (int) $items->sum('total'),
                'amount' => (float) $items->sum('amount'),
            ])
            ->sortByDesc('count')
            ->values();
        $branchBreakdown = $breakdown
            ->groupBy('branch_id')
            ->map(fn ($items, $branchId) => [
                'label' => $this->branchName((int) $branchId),
                'count' => (int) $items->sum('total'),
                'amount' => (float) $items->sum('amount'),
            ])
            ->sortByDesc('amount')
            ->values();

        $billingIds = (clone $query)
            ->orderByDesc('b.date')
            ->orderByDesc('b.id')
            ->offset($offset)
            ->limit($perPage)
            ->pluck('b.id');

        $records = collect();
        if ($billingIds->isNotEmpty()) {
            $salesTotals = $this->alignedSalesTotalsQuery()->whereIn('s.billing_id', $billingIds);
            $claimTotals = $this->alignedClaimTotalsQuery()->whereIn('ic.billing_id', $billingIds);
            $pageQuery = DB::table('billing as b')
                ->leftJoin('patient_records as patient_by_id', function ($join): void {
                    $join->on('b.patient_id', '=', 'patient_by_id.id')
                        ->on('b.branch_id', '=', 'patient_by_id.branch_id');
                })
                ->leftJoin('patient_records as patient_by_folder', function ($join): void {
                    $join->on('b.folder_id', '=', 'patient_by_folder.folder_id')
                        ->on('b.branch_id', '=', 'patient_by_folder.branch_id');
                })
                ->leftJoin('customers as c', 'b.customer_id', '=', 'c.id')
                ->leftJoin('users as patient_creator', function ($join): void {
                    $join->on('patient_creator.id', '=', DB::raw('COALESCE(patient_by_id.created_by, patient_by_folder.created_by)'));
                })
                ->leftJoin('users as creator', 'b.created_by', '=', 'creator.id')
                ->leftJoinSub($salesTotals, 'sales_totals', function ($join): void {
                    $join->on('b.id', '=', 'sales_totals.billing_id');
                })
                ->leftJoinSub($claimTotals, 'claim_totals', function ($join): void {
                    $join->on('b.id', '=', 'claim_totals.billing_id');
                })
                ->whereIn('b.id', $billingIds)
                ->orderByDesc('b.date')
                ->orderByDesc('b.id');

            $records = $pageQuery
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
                    'b.lens_item_count',
                    'b.case_price',
                    'b.discount',
                    'b.health_insurance',
                    'b.receipt_number',
                    DB::raw('COALESCE(patient_creator.name, creator.name) as entered_by'),
                    DB::raw('COALESCE(patient_by_id.phone, patient_by_folder.phone) as patient_phone'),
                    'c.phone as customer_phone',
                    DB::raw('COALESCE(sales_totals.total_sales_paid, 0) as sales_paid'),
                    DB::raw('COALESCE(claim_totals.insurance_claimed, 0) as insurance_claimed'),
                    DB::raw('COALESCE(sales_totals.total_sales_paid, 0) + COALESCE(claim_totals.insurance_claimed, 0) as total_paid'),
                    DB::raw('COALESCE(b.balance, 0) as calculated_balance'),
                ])
                ->map(fn ($record) => $this->mapBillingRecord($record));
        }

        $totalBills = (int) $summary->total_bills;
        $total = $totalBills;
        $stats = [
            'total_bills' => (int) $overallStats->total_bills,
            'total_amount' => (float) $overallStats->total_amount,
            'pending_bills' => (int) $overallStats->pending_bills,
            'paid_bills' => (int) $overallStats->paid_bills,
            'today_bills' => (int) $overallStats->today_bills,
            'filtered_total_bills' => $totalBills,
            'filtered_pending_bills' => (int) $summary->pending_bills,
            'filtered_total_amount' => $filteredTotalAmount,
            'filtered_collected_amount' => $filteredCollectedAmount,
            'filtered_outstanding_amount' => $filteredOutstandingAmount,
            'insured_bill_count' => (int) $summary->insured_bill_count,
            'insured_bill_value' => (float) $summary->insured_bill_value,
            'average_bill_value' => $totalBills > 0 ? round($filteredTotalAmount / $totalBills, 2) : 0,
            'collection_rate' => $filteredTotalAmount > 0 ? round(($filteredCollectedAmount / $filteredTotalAmount) * 100, 1) : 0,
            'status_breakdown' => $statusBreakdown,
            'branch_breakdown' => $branchBreakdown,
        ];

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

    public function update(Request $request, int $billingId): JsonResponse
    {
        $user = $request->user();
        $role = $user?->normalized_role ?? $user?->role;
        if ($role !== 'manager') {
            return response()->json([
                'message' => 'Only the General Manager can edit billing records.',
            ], 403);
        }

        $this->ensureBillingSchema();
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $current = tap(
            DB::table('billing')->where('id', $billingId),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->first();

        if (! $current) {
            return response()->json(['message' => 'Billing record not found for this branch.'], 404);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'date' => ['required', 'date'],
        ]);

        DB::table('billing')
            ->where('id', $billingId)
            ->where('branch_id', $current->branch_id)
            ->update([
                'name' => $validated['name'],
                'date' => $validated['date'],
            ]);

        return response()->json(['message' => 'Billing record updated successfully.']);
    }

    public function destroy(Request $request, int $billingId): JsonResponse
    {
        $user = $request->user();
        $role = $user?->normalized_role ?? $user?->role;
        if (! in_array($role, ['manager', 'accountant'], true)) {
            return response()->json([
                'message' => 'Only the General Manager and Accountant can delete billing records.',
            ], 403);
        }

        $this->ensureBillingSchema();
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $current = tap(
            DB::table('billing')->where('id', $billingId),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->first();

        if (! $current) {
            return response()->json(['message' => 'Billing record not found for this branch.'], 404);
        }

        foreach ([
            ['sales', 'billing_id', 'payment'],
            ['insurance_claims', 'billing_id', 'insurance claim'],
            ['billing_frames', 'billing_id', 'frame'],
            ['lens_costs', 'billing_id', 'lens cost'],
        ] as [$table, $column, $label]) {
            if (
                Schema::hasTable($table)
                && Schema::hasColumn($table, $column)
                && DB::table($table)->where($column, $billingId)->exists()
            ) {
                return response()->json([
                    'message' => "This billing record cannot be deleted because it has a linked {$label} record.",
                ], 409);
            }
        }

        if (
            ! empty($current->prescription_id)
            && Schema::hasTable('glasses_prescriptions')
            && Schema::hasColumn('glasses_prescriptions', 'prescription_id')
            && DB::table('glasses_prescriptions')->where('prescription_id', $current->prescription_id)->exists()
        ) {
            return response()->json([
                'message' => 'This billing record cannot be deleted because it is linked to a prescription.',
            ], 409);
        }

        if (
            Schema::hasTable('inventory_movements')
            && Schema::hasColumn('inventory_movements', 'reference_table')
            && Schema::hasColumn('inventory_movements', 'reference_id')
            && DB::table('inventory_movements')
                ->where('reference_table', 'billing')
                ->where('reference_id', $billingId)
                ->exists()
        ) {
            return response()->json([
                'message' => 'This billing record cannot be deleted because it has a linked inventory movement.',
            ], 409);
        }

        DB::table('billing')
            ->where('id', $billingId)
            ->where('branch_id', $current->branch_id)
            ->delete();

        return response()->json(['message' => 'Billing record deleted successfully.'        ]);
    }

    public function refundOptions(Request $request, int $billingId): JsonResponse
    {
        if ($response = $this->ensureRefundWriteAccess($request)) {
            return $response;
        }

        if (! Schema::hasTable('billing_refunds')) {
            return response()->json(['message' => 'Refund tracking is not installed. Run the latest database migrations first.'], 503);
        }

        $branchId = $this->resolveBranchId($request);
        $billingQuery = DB::table('billing')->where('id', $billingId);
        $this->applyBranchScope($billingQuery, 'branch_id', $branchId);
        $billing = $billingQuery->first([
            'id', 'branch_id', 'patient_id', 'folder_id', 'name', 'receipt_number',
            'consultation_price', 'frame_price', 'lens_price', 'case_price', 'total_amount',
        ]);

        if (! $billing) {
            return response()->json(['message' => 'Billing record not found for this branch.'], 404);
        }

        return response()->json($this->buildRefundOptions($billing));
    }

    public function refund(Request $request, int $billingId): JsonResponse
    {
        if ($response = $this->ensureRefundWriteAccess($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        if (! Schema::hasTable('billing_refunds')) {
            return response()->json(['message' => 'Refund tracking is not installed. Run the latest database migrations first.'], 503);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'component' => ['required', 'in:consultation,frames,lenses,case,other'],
            'refund_method' => ['required', 'string', 'max:100'],
            'reason' => ['required', 'string', 'max:2000'],
        ]);
        $amount = round((float) $validated['amount'], 2);
        $user = $request->user();

        $this->ensureRefundExpenseSchema();

        $result = DB::transaction(function () use ($request, $billingId, $branchId, $validated, $amount, $user) {
            $billing = DB::table('billing')
                ->where('id', $billingId)
                ->where('branch_id', $branchId)
                ->lockForUpdate()
                ->first([
                    'id', 'branch_id', 'patient_id', 'folder_id', 'name', 'receipt_number',
                    'consultation_price', 'frame_price', 'lens_price', 'case_price', 'total_amount',
                ]);

            if (! $billing) {
                return ['error' => 'Billing record not found for this branch.', 'status' => 404];
            }

            $options = $this->buildRefundOptions($billing);
            $method = collect($options['refund_methods'])
                ->first(fn (array $item) => $item['method'] === $validated['refund_method']);
            $component = collect($options['components'])
                ->first(fn (array $item) => $item['key'] === $validated['component']);
            $available = min((float) ($method['available'] ?? 0), (float) ($component['available'] ?? 0));

            if (! $method || ! $component || $amount > $available + 0.001) {
                return [
                    'error' => 'The refund amount exceeds the available paid amount for the selected payment method or billing item.',
                    'status' => 422,
                ];
            }

            $refundedAt = now();
            $refundId = DB::table('billing_refunds')->insertGetId([
                'billing_id' => $billing->id,
                'branch_id' => $branchId,
                'amount' => $amount,
                'component' => $validated['component'],
                'refund_method' => $validated['refund_method'],
                'reason' => trim($validated['reason']),
                'authorized_by' => $user->id,
                'authorized_by_name' => $user->name,
                'authorized_role' => $user->normalized_role ?? $user->role,
                'refunded_at' => $refundedAt,
                'created_at' => $refundedAt,
                'updated_at' => $refundedAt,
            ]);

            $description = 'Refund for '.($billing->receipt_number ?: 'billing #'.$billing->id)
                .' ('.ucfirst($validated['component']).'): '.trim($validated['reason']);
            $saleId = DB::table('sales')->insertGetId([
                'date' => $refundedAt->toDateString(),
                'amount_paid' => -$amount,
                'description' => $description,
                'billing_id' => $billing->id,
                'patient_id' => $billing->patient_id,
                'transaction_id' => 'REFUND-'.$refundId,
                'reference' => 'Refund #'.$refundId,
                'folder_id' => $billing->folder_id ?? '',
                'payment_method' => $validated['refund_method'],
                'customer_id' => null,
                'branch_id' => $branchId,
                'created_at' => $refundedAt,
                'updated_at' => $refundedAt,
            ]);

            $expense = [
                'description' => mb_substr($description, 0, 255),
                'amount' => $amount,
                'date' => $refundedAt->toDateString(),
                'category' => 'Refunds',
                'branch_id' => $branchId,
                'created_by' => $user->id,
                'source_type' => 'billing_refund',
                'source_id' => $refundId,
            ];
            if (Schema::hasColumn('expenses', 'created_at')) {
                $expense['created_at'] = $refundedAt;
            }
            if (Schema::hasColumn('expenses', 'updated_at')) {
                $expense['updated_at'] = $refundedAt;
            }
            if (Schema::hasColumn('expenses', 'receipt_unavailable')) {
                $expense['receipt_unavailable'] = true;
            }
            $expenseId = DB::table('expenses')->insertGetId($expense, 'expense_id');

            DB::table('billing_refunds')->where('id', $refundId)->update([
                'sale_id' => $saleId,
                'expense_id' => $expenseId,
                'updated_at' => $refundedAt,
            ]);

            AuditLog::logManual($request, 'create', 'billing_refund', 'billing_id: '.$billing->id, [
                'refund_id' => $refundId,
                'amount' => $amount,
                'component' => $validated['component'],
                'refund_method' => $validated['refund_method'],
                'reason' => trim($validated['reason']),
                'expense_id' => $expenseId,
            ]);

            return [
                'refund_id' => $refundId,
                'sale_id' => $saleId,
                'expense_id' => $expenseId,
                'amount' => $amount,
                'authorized_by' => $user->name,
                'message' => 'Refund recorded as a payment reversal and Refunds expense.',
            ];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], $result['status']);
        }

        return response()->json($result, 201);
    }

    private function buildRefundOptions(object $billing): array
    {
        $branchId = (int) $billing->branch_id;
        $sales = DB::table('sales')
            ->where('billing_id', $billing->id)
            ->where('branch_id', $branchId)
            ->where('amount_paid', '>', 0)
            ->where('payment_method', '!=', 'Insurance')
            ->select('payment_method', DB::raw('SUM(amount_paid) as paid'))
            ->groupBy('payment_method')
            ->get()
            ->keyBy('payment_method');
        $refundedByMethod = DB::table('billing_refunds')
            ->where('billing_id', $billing->id)
            ->where('branch_id', $branchId)
            ->select('refund_method', DB::raw('SUM(amount) as refunded'))
            ->groupBy('refund_method')
            ->pluck('refunded', 'refund_method');
        $refundMethods = $sales
            ->map(fn ($sale, $method) => [
                'method' => (string) $method,
                'available' => round(max((float) $sale->paid - (float) ($refundedByMethod[$method] ?? 0), 0), 2),
            ])
            ->filter(fn (array $method) => $method['available'] > 0.005)
            ->values();
        $componentCaps = $this->refundComponentCaps($billing);
        $refundedByComponent = DB::table('billing_refunds')
            ->where('billing_id', $billing->id)
            ->where('branch_id', $branchId)
            ->select('component', DB::raw('SUM(amount) as refunded'))
            ->groupBy('component')
            ->pluck('refunded', 'component');
        $components = collect($componentCaps)
            ->map(fn ($cap, $key) => [
                'key' => $key,
                'label' => ucfirst($key),
                'available' => round(max($cap - (float) ($refundedByComponent[$key] ?? 0), 0), 2),
            ])
            ->filter(fn (array $component) => $component['available'] > 0.005)
            ->values();
        $refunds = DB::table('billing_refunds')
            ->where('billing_id', $billing->id)
            ->where('branch_id', $branchId)
            ->orderByDesc('refunded_at')
            ->get([
                'id', 'amount', 'component', 'refund_method', 'reason',
                'authorized_by_name', 'authorized_role', 'refunded_at',
            ]);

        return [
            'billing_id' => (int) $billing->id,
            'patient_name' => $billing->name,
            'receipt_number' => $billing->receipt_number,
            'total_refunded' => round((float) $refunds->sum('amount'), 2),
            'refund_methods' => $refundMethods,
            'components' => $components,
            'refunds' => $refunds,
        ];
    }

    private function refundComponentCaps(object $billing): array
    {
        $items = [
            'consultation' => max((float) ($billing->consultation_price ?? 0), 0),
            'frames' => max((float) ($billing->frame_price ?? 0), 0),
            'lenses' => max((float) ($billing->lens_price ?? 0), 0),
            'case' => max((float) ($billing->case_price ?? 0), 0),
        ];
        $total = max((float) ($billing->total_amount ?? 0), 0);
        $itemTotal = array_sum($items);

        if ($itemTotal <= 0) {
            return ['other' => round($total, 2)];
        }

        foreach ($items as $key => $itemAmount) {
            $items[$key] = round($total * ($itemAmount / $itemTotal), 2);
        }

        $difference = round($total - array_sum($items), 2);
        if (abs($difference) >= 0.01) {
            $lastKey = array_key_last($items);
            $items[$lastKey] = round(max($items[$lastKey] + $difference, 0), 2);
        }

        return $items;
    }

    private function ensureRefundExpenseSchema(): void
    {
        if (! Schema::hasTable('expenses')) {
            abort(response()->json(['message' => 'The expenses table is not available on this database.'], 503));
        }

        if (! Schema::hasColumn('expenses', 'branch_id')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->unsignedInteger('branch_id')->default(1)->index();
            });
        }
        if (! Schema::hasColumn('expenses', 'created_by')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->unsignedBigInteger('created_by')->nullable()->index();
            });
        }
        if (! Schema::hasColumn('expenses', 'source_type')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->string('source_type', 50)->nullable()->index();
            });
        }
        if (! Schema::hasColumn('expenses', 'source_id')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->unsignedBigInteger('source_id')->nullable()->index();
            });
        }

        if (Schema::hasTable('expense_categories')) {
            DB::table('expense_categories')->updateOrInsert(
                ['name' => 'Refunds'],
                array_filter([
                    'is_active' => true,
                    'created_at' => Schema::hasColumn('expense_categories', 'created_at') ? now() : null,
                    'updated_at' => Schema::hasColumn('expense_categories', 'updated_at') ? now() : null,
                ], fn ($value) => $value !== null)
            );
        }
    }

    private function ensureRefundWriteAccess(Request $request): ?JsonResponse
    {
        $role = $request->user()?->normalized_role ?? $request->user()?->role;
        if (! in_array($role, ['accountant', 'manager'], true)) {
            return response()->json(['message' => 'Only an Accountant or General Manager can authorize billing refunds.'], 403);
        }

        return null;
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
                DB::raw('COALESCE(sales_totals.total_sales_paid, 0) as sales_paid'),
                DB::raw('COALESCE(claim_totals.insurance_claimed, 0) as insurance_claimed'),
                DB::raw('COALESCE(sales_totals.total_sales_paid, 0) + COALESCE(claim_totals.insurance_claimed, 0) as total_paid'),
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
            'lens_items.*.lens_item_index' => ['nullable', 'integer', 'min:0'],
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

        $billingFrameRows = $frameItems
            ->groupBy('frame_code_id')
            ->map(fn ($items, $frameCodeId) => [
                'frame_code_id' => $frameCodeId,
                'frame_price' => $this->money($items->sum('frame_price')),
                'quantity' => $items->count(),
            ])
            ->values();

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
        $rawLensItems = collect($validated['lens_items'] ?? []);
        $lensItems = $rawLensItems
            ->map(fn ($item, $index) => ['amount' => $this->money($item['amount'] ?? 0), 'source_index' => (int) ($item['lens_item_index'] ?? $index)])
            ->filter(fn ($item) => $item['amount'] > 0)
            ->values();
        $lensPrice = $lensItems->isNotEmpty()
            ? $this->money($lensItems->sum('amount'))
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
        $userId = $request->user()?->id;

        $billingId = DB::transaction(function () use (
            $validated,
            $branchId,
            $userId,
            $billingFrameRows,
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
            $totalAmount,
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
                'status' => 'pending',
                'balance' => $totalAmount,
                'prescription_id' => $validated['prescription_id'] ?? null,
                'branch_id' => $branchId,
                'created_by' => $userId,
            ]);

            foreach ($billingFrameRows as $frameItem) {
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
                    ->where('stock', '>=', $frameItem['quantity'])
                    ->decrement('stock', $frameItem['quantity']);

                if ($productBeforeSale && Schema::hasTable('inventory_movements') && (int) $productBeforeSale->stock > 0) {
                    $stockAfter = max(0, (int) $productBeforeSale->stock - (int) $frameItem['quantity']);
                    DB::table('inventory_movements')->insert([
                        'product_id' => $productBeforeSale->id,
                        'branch_id' => $branchId,
                        'movement_type' => 'sale',
                        'quantity_change' => -1 * (int) $frameItem['quantity'],
                        'stock_before' => (int) $productBeforeSale->stock,
                        'stock_after' => $stockAfter,
                        'reference_table' => 'billing',
                        'reference_id' => $billingId,
                        'notes' => 'Frame stock reduced from billing sale.',
                        'created_by' => $userId,
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
                'pending' => $query->where('b.status', 'pending'),
                'partially_paid' => $query->where('b.status', 'partially_paid'),
                'paid' => $query->where('b.status', 'paid'),
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
                    ->orWhere('p.name', 'like', $like)
                    ->orWhere('p.surname', 'like', $like)
                    ->orWhere('p.firstname', 'like', $like)
                    ->orWhere('p.othernames', 'like', $like)
                    ->orWhere('b.receipt_number', 'like', $like)
                    ->orWhere('p.phone', 'like', $like)
                    ->orWhere('c.name', 'like', $like)
                    ->orWhere('c.phone', 'like', $like);
            });
        }
    }

    private function applyBillingSearchFilters($query, Request $request): void
    {
        $status = $request->string('status')->toString();
        $search = trim($request->string('search')->toString());

        if ($status && $status !== 'all') {
            match ($status) {
                'pending' => $query->where('b.status', 'pending'),
                'partially_paid' => $query->where('b.status', 'partially_paid'),
                'paid' => $query->where('b.status', 'paid'),
                default => $query->where('b.status', $status),
            };
        }

        if ($request->filled('date_from')) {
            $query->whereDate('b.date', '>=', $request->string('date_from')->toString());
        }

        if ($request->filled('date_to')) {
            $query->whereDate('b.date', '<=', $request->string('date_to')->toString());
        }

        if ($search === '') {
            return;
        }

        $like = '%'.$search.'%';
        $query->where(function ($matches) use ($like): void {
            $matches->where('b.folder_id', 'like', $like)
                ->orWhere('b.name', 'like', $like)
                ->orWhere('b.receipt_number', 'like', $like)
                ->orWhereExists(function ($patient) use ($like): void {
                    $patient->selectRaw('1')
                        ->from('patient_records as p_search')
                        ->whereColumn('p_search.branch_id', 'b.branch_id')
                        ->where(function ($relation): void {
                            $relation->whereColumn('p_search.id', 'b.patient_id')
                                ->orWhereColumn('p_search.folder_id', 'b.folder_id');
                        })
                        ->where(function ($patientMatches) use ($like): void {
                            $patientMatches->where('p_search.name', 'like', $like)
                                ->orWhere('p_search.surname', 'like', $like)
                                ->orWhere('p_search.firstname', 'like', $like)
                                ->orWhere('p_search.othernames', 'like', $like)
                                ->orWhere('p_search.phone', 'like', $like);
                        });
                })
                ->orWhereExists(function ($customer) use ($like): void {
                    $customer->selectRaw('1')
                        ->from('customers as c_search')
                        ->whereColumn('c_search.id', 'b.customer_id')
                        ->where(function ($customerMatches) use ($like): void {
                            $customerMatches->where('c_search.name', 'like', $like)
                                ->orWhere('c_search.phone', 'like', $like);
                        });
                });
        });
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
            ->select('s.billing_id', DB::raw("SUM(CASE WHEN s.payment_method != 'Insurance' THEN s.amount_paid ELSE 0 END) as total_sales_paid"))
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
            'total_refunded' => (float) ($record->total_refunded ?? 0),
            'insurance_claimed' => (float) ($record->insurance_claimed ?? 0),
            'calculated_balance' => (float) ($record->calculated_balance ?? 0),
            'entered_by' => $record->entered_by,
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

        $column = DB::selectOne("
            SELECT EXTRA, COLUMN_KEY
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'billing'
              AND COLUMN_NAME = 'id'
        ");

        if ($column && empty($column->COLUMN_KEY)) {
            DB::statement('ALTER TABLE billing ADD PRIMARY KEY (id)');
        }

        if ($column && ! str_contains(strtolower((string) ($column->EXTRA ?? '')), 'auto_increment')) {
            DB::statement('ALTER TABLE billing MODIFY id INT NOT NULL AUTO_INCREMENT');
        }

        if (Schema::hasTable('billing_frames') && Schema::hasColumn('billing_frames', 'id')) {
            $frameColumn = DB::selectOne("
                SELECT EXTRA, COLUMN_KEY
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'billing_frames'
                  AND COLUMN_NAME = 'id'
            ");

            if ($frameColumn && empty($frameColumn->COLUMN_KEY)) {
                DB::statement('ALTER TABLE billing_frames ADD PRIMARY KEY (id)');
            }

            if ($frameColumn && ! str_contains(strtolower((string) ($frameColumn->EXTRA ?? '')), 'auto_increment')) {
                DB::statement('ALTER TABLE billing_frames MODIFY id INT NOT NULL AUTO_INCREMENT');
            }
        }

        if (Schema::hasTable('inventory_movements') && Schema::hasColumn('inventory_movements', 'id')) {
            $movementColumn = DB::selectOne("
                SELECT EXTRA, COLUMN_KEY
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'inventory_movements'
                  AND COLUMN_NAME = 'id'
            ");

            if ($movementColumn && empty($movementColumn->COLUMN_KEY)) {
                DB::statement('ALTER TABLE inventory_movements ADD PRIMARY KEY (id)');
            }

            if ($movementColumn && ! str_contains(strtolower((string) ($movementColumn->EXTRA ?? '')), 'auto_increment')) {
                DB::statement('ALTER TABLE inventory_movements MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT');
            }
        }

        if (! Schema::hasColumn('billing', 'lens_item_count')) {
            Schema::table('billing', function (Blueprint $table): void {
                $table->unsignedInteger('lens_item_count')->default(1)->after('lens_price');
            });

            DB::table('billing')
                ->where('lens_price', '<=', 0)
                ->update(['lens_item_count' => 0]);
        }

        if (! Schema::hasColumn('billing', 'created_by')) {
            Schema::table('billing', function (Blueprint $table): void {
                $table->unsignedBigInteger('created_by')->nullable()->index();
            });
        }

        if (Schema::hasTable('patient_records') && ! Schema::hasColumn('patient_records', 'created_by')) {
            Schema::table('patient_records', function (Blueprint $table): void {
                $table->unsignedBigInteger('created_by')->nullable()->index();
            });
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
