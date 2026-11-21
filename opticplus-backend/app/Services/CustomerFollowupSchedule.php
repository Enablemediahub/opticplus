<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class CustomerFollowupSchedule
{
    public function milestones(Carbon $pickupAt): array
    {
        return [
            [
                'milestone' => 'week_1',
                'due_at' => $pickupAt->copy()->addWeek()->toDateString(),
            ],
            [
                'milestone' => 'six_months',
                'due_at' => $pickupAt->copy()->addMonthsNoOverflow(6)->toDateString(),
            ],
            [
                'milestone' => 'two_years',
                'due_at' => $pickupAt->copy()->addYearsNoOverflow(2)->toDateString(),
            ],
        ];
    }

    public function scheduleForPickup(
        int $billingId,
        int $branchId,
        ?int $patientId,
        ?string $folderId,
        int $createdBy,
    ): void {
        $pickupAt = now();
        $timestamps = [
            'branch_id' => $branchId,
            'billing_id' => $billingId,
            'patient_id' => $patientId,
            'folder_id' => $folderId,
            'pickup_at' => $pickupAt,
            'status' => 'pending',
            'complaint_status' => 'none',
            'created_by' => $createdBy,
            'created_at' => $pickupAt,
            'updated_at' => $pickupAt,
        ];
        $followups = array_map(
            fn (array $milestone): array => $timestamps + [
                'milestone' => $milestone['milestone'],
                'due_at' => $milestone['due_at'],
            ],
            $this->milestones($pickupAt),
        );

        DB::table('customer_followups')->insertOrIgnore($followups);
    }
}
