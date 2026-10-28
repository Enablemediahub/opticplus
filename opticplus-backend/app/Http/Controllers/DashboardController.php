<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $today = Carbon::today()->toDateString();
        $weekStart = Carbon::today()->startOfWeek(Carbon::MONDAY);
        $weekDays = collect(range(0, 5))->map(fn ($offset) => $weekStart->copy()->addDays($offset));

        $appointmentsQuery = DB::table('appointments');
        $billingQuery = DB::table('billing');
        $attendanceQuery = DB::table('attendance');
        $salesQuery = DB::table('sales');
        $expensesQuery = DB::table('expenses');
        $this->applyBranchScope($appointmentsQuery, 'branch_id', $branchId);
        $this->applyBranchScope($billingQuery, 'branch_id', $branchId);
        $this->applyBranchScope($attendanceQuery, 'branch_id', $branchId);
        $this->applyBranchScope($salesQuery, 'branch_id', $branchId);
        $this->applyBranchScope($expensesQuery, 'branch_id', $branchId);

        $financeQuery = DB::table('bank_balance');
        $this->applyBranchScope($financeQuery, 'branch_id', $branchId);
        $finance = $financeQuery
            ->select('balance', 'last_updated')
            ->first();

        $todayRevenue = (float) (clone $salesQuery)
            ->whereDate('date', $today)
            ->where('payment_method', '!=', 'Insurance')
            ->sum('amount_paid');
        $todayInsuranceRevenue = $this->insuranceClaimTotalForDate($branchId, $today);
        $todayExpenses = (float) (clone $expensesQuery)
            ->whereDate('date', $today)
            ->sum('amount');
        $todayProductCosts = $this->dailyProductCosts($branchId, $today);
        $todayPaymentMix = (clone $salesQuery)
            ->whereDate('date', $today)
            ->selectRaw("
                COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount_paid ELSE 0 END), 0) as cash_paid,
                COALESCE(SUM(CASE WHEN payment_method = 'Mobile Money' THEN amount_paid ELSE 0 END), 0) as mobile_paid,
                COALESCE(SUM(CASE WHEN payment_method LIKE 'Paystack%' THEN amount_paid ELSE 0 END), 0) as paystack_paid,
                0 as insurance_paid
            ")
            ->first();
        $todayPaymentMix->insurance_paid = $todayInsuranceRevenue;

        $depositsTodayQuery = DB::table('bank_deposits')
            ->whereDate('date', $today)
            ->selectRaw('SUM(amount) as amount');
        $this->applyBranchScope($depositsTodayQuery, 'branch_id', $branchId);
        $depositsToday = (float) ($depositsTodayQuery->value('amount') ?? 0);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => [
                'patients_today' => (int) tap(
                    DB::table('billing')->whereDate('date', $today),
                    fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
                )->distinct()->count('patient_id'),
                'revenue_today' => $todayRevenue,
                'expenses_today' => $todayExpenses,
                'insurance_revenue_today' => $todayInsuranceRevenue,
                'lens_cost_to_set_aside_today' => $todayProductCosts['lens_cost'],
                'frame_cost_to_set_aside_today' => $todayProductCosts['frame_cost'],
                'unpriced_lens_sales_today' => $todayProductCosts['unpriced_lens_sales'],
                'unpriced_frame_sales_today' => $todayProductCosts['unpriced_frame_sales'],
                'appointments_today' => (int) (clone $appointmentsQuery)
                    ->whereDate('appointment_date', $today)
                    ->count(),
                'completed_prescriptions' => $this->completedPrescriptionCount($branchId),
                'attendance_verified_rate' => $this->attendanceRate(clone $attendanceQuery, $today),
            ],
            'weekly_appointments' => $weekDays->map(fn ($date) => [
                'label' => $date->format('D'),
                'count' => (int) (clone $appointmentsQuery)->whereDate('appointment_date', $date->toDateString())->count(),
            ])->values(),
            'finance' => [
                'bank_balance' => (float) ($finance->balance ?? 0),
                'deposits_today' => (float) $depositsToday,
                'last_updated' => $finance->last_updated ?? null,
                'payment_mix_today' => [
                    'cash_paid' => (float) ($todayPaymentMix->cash_paid ?? 0),
                    'mobile_paid' => (float) ($todayPaymentMix->mobile_paid ?? 0),
                    'paystack_paid' => (float) ($todayPaymentMix->paystack_paid ?? 0),
                    'insurance_paid' => (float) ($todayPaymentMix->insurance_paid ?? 0),
                ],
            ],
            'appointments' => (clone $appointmentsQuery)
                ->orderByDesc('appointment_date')
                ->orderByDesc('appointment_time')
                ->limit(8)
                ->get([
                    'id',
                    'name as patient',
                    'doctor as optometrist',
                    'appointment_date',
                    'appointment_time',
                    'status',
                ]),
            'payments' => (clone $billingQuery)
                ->orderByDesc('date')
                ->orderByDesc('id')
                ->limit(8)
                ->get([
                    'id',
                    'name as patient',
                    'total_amount as amount',
                    'status',
                    'date',
                    'receipt_number',
                ]),
            'attendance' => (clone $attendanceQuery)
                ->orderByDesc('clock_in_time')
                ->limit(8)
                ->get([
                    'id',
                    'name as staff',
                    'clock_in_time',
                    'clock_out_time',
                    'location_verified',
                    'date',
                ]),
        ]);
    }

    private function dailyProductCosts(int $branchId, string $date): array
    {
        $totals = [
            'lens_cost' => 0.0,
            'frame_cost' => 0.0,
            'unpriced_lens_sales' => 0.0,
            'unpriced_frame_sales' => 0.0,
        ];

        if (
            Schema::hasTable('billing')
            && Schema::hasTable('lens_costs')
            && Schema::hasColumn('billing', 'lens_price')
            && Schema::hasColumn('lens_costs', 'billing_id')
            && Schema::hasColumn('lens_costs', 'branch_id')
            && Schema::hasColumn('lens_costs', 'cost_price')
        ) {
            $lensCosts = tap(
                DB::table('billing as b')
                    ->leftJoin('lens_costs as lc', function ($join): void {
                        $join->on('lc.billing_id', '=', 'b.id')
                            ->on('lc.branch_id', '=', 'b.branch_id');
                    })
                    ->whereDate('b.date', $date)
                    ->where('b.lens_price', '>', 0),
                fn ($query) => $this->applyBranchScope($query, 'b.branch_id', $branchId)
            )->selectRaw('
                SUM(CASE WHEN lc.cost_price IS NOT NULL THEN lc.cost_price ELSE 0 END) as known_cost,
                SUM(CASE WHEN lc.cost_price IS NULL THEN b.lens_price ELSE 0 END) as unpriced_sales
            ')->first();

            $totals['lens_cost'] = round((float) ($lensCosts->known_cost ?? 0), 2);
            $totals['unpriced_lens_sales'] = round((float) ($lensCosts->unpriced_sales ?? 0), 2);
        }

        if (
            Schema::hasTable('billing')
            && Schema::hasTable('billing_frames')
            && Schema::hasTable('products')
            && Schema::hasColumn('billing_frames', 'billing_id')
            && Schema::hasColumn('billing_frames', 'frame_code_id')
            && Schema::hasColumn('billing_frames', 'frame_price')
            && Schema::hasColumn('products', 'code')
            && Schema::hasColumn('products', 'branch_id')
            && Schema::hasColumn('products', 'cost_price')
        ) {
            $frameCosts = tap(
                DB::table('billing_frames as bf')
                    ->join('billing as b', 'bf.billing_id', '=', 'b.id')
                    ->leftJoin('products as p', function ($join): void {
                        $join->on('p.code', '=', 'bf.frame_code_id')
                            ->on('p.branch_id', '=', 'b.branch_id');
                    })
                    ->whereDate('b.date', $date),
                fn ($query) => $this->applyBranchScope($query, 'b.branch_id', $branchId)
            )->selectRaw('
                SUM(CASE WHEN p.cost_price IS NOT NULL THEN p.cost_price ELSE 0 END) as known_cost,
                SUM(CASE WHEN p.cost_price IS NULL THEN COALESCE(bf.frame_price, 0) ELSE 0 END) as unpriced_sales
            ')->first();

            $totals['frame_cost'] = round((float) ($frameCosts->known_cost ?? 0), 2);
            $totals['unpriced_frame_sales'] = round((float) ($frameCosts->unpriced_sales ?? 0), 2);
        }

        return $totals;
    }

    private function attendanceRate($query, string $today): float
    {
        $total = (int) $query->whereDate('date', $today)->count();

        if ($total === 0) {
            return 0;
        }

        $verified = (int) (clone $query)
            ->whereDate('date', $today)
            ->where('location_verified', 1)
            ->count();

        return round(($verified / $total) * 100, 1);
    }

    private function completedPrescriptionCount(int $branchId): int
    {
        $legacyCount = (int) tap(
            DB::table('glasses_prescriptions')->where('status', 'completed'),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->count();

        if (! Schema::hasTable('patient_form_data')) {
            return $legacyCount;
        }

        $formQuery = DB::table('patient_form_data')->where('status', 'completed');
        $this->applyBranchScope($formQuery, 'branch_id', $branchId);

        $formCount = $formQuery
            ->get(['form_data'])
            ->filter(fn ($form) => $this->formHasPrescription($form->form_data ?? null))
            ->count();

        return $legacyCount + $formCount;
    }

    private function formHasPrescription(?string $formData): bool
    {
        if (! $formData) {
            return false;
        }

        $decoded = json_decode($formData, true);
        if (! is_array($decoded)) {
            return false;
        }

        $diagnosisPrescription = trim((string) data_get($decoded, 'diagnosis.prescription', ''));
        if ($diagnosisPrescription !== '') {
            return true;
        }

        foreach (['od', 'os'] as $eye) {
            foreach (['sphere', 'cylinder', 'axis', 'add', 'va'] as $field) {
                $spectacleValue = trim((string) data_get($decoded, "spectacle_rx.{$eye}.{$field}", ''));
                $subjectiveValue = trim((string) data_get($decoded, "refraction.subjective.{$eye}.{$field}", ''));

                if ($spectacleValue !== '' || $subjectiveValue !== '') {
                    return true;
                }
            }
        }

        return false;
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();
        $requestedBranchId = (int) $request->integer('branch_id');

        if ($user->isAdmin()) {
            return ($requestedBranchId >= 0) ? $requestedBranchId : (int) ($user->branch_id ?: 1);
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

    private function insuranceClaimTotalForDate(int $branchId, string $date): float
    {
        return (float) tap(
            DB::table('insurance_claims')->whereDate('date', $date),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->sum('amount_paid');
    }

    private function applyBranchScope($query, string $column, int $branchId): void
    {
        if ($branchId > 0) {
            $query->where($column, $branchId);
        }
    }
}
