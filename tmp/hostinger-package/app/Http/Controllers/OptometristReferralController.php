<?php

namespace App\Http\Controllers;

use Illuminate\Database\Query\JoinClause;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OptometristReferralController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = strtolower((string) ($user?->normalized_role ?? $user?->role ?? ''));
        if ($role !== 'optometrist') {
            return response()->json(['message' => 'Only optometrists can access clinical referrals.'], 403);
        }

        $branchId = (int) ($user->branch_id ?? 0);
        if (! in_array($branchId, [1, 2], true)) {
            return response()->json(['message' => 'A valid branch must be assigned to access clinical referrals.'], 403);
        }

        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:8', 'max:50'],
        ]);
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 20);

        $query = DB::table('customer_followup_attempts as attempt')
            ->join('customer_followups as followup', 'followup.id', '=', 'attempt.followup_id')
            ->join('patient_records as patient', function (JoinClause $join): void {
                $join->on('patient.id', '=', 'followup.patient_id')
                    ->orOn(function (JoinClause $fallback): void {
                        $fallback->on('patient.folder_id', '=', 'followup.folder_id')
                            ->whereNull('followup.patient_id');
                    });
            })
            ->leftJoin('users as receptionist', 'receptionist.id', '=', 'attempt.attempted_by')
            ->leftJoin('billing as b', 'b.id', '=', 'followup.billing_id')
            ->where('attempt.needs_optometrist_review', true)
            ->where('followup.branch_id', $branchId)
            ->where('patient.branch_id', $branchId)
            ->where('patient.assigned_optometrist_id', (int) $user->id);

        if (! empty($validated['search'])) {
            $terms = preg_split('/\s+/', trim($validated['search'])) ?: [];
            $query->where(function ($searchQuery) use ($terms): void {
                foreach ($terms as $term) {
                    $like = '%'.$term.'%';
                    $searchQuery->where(function ($termQuery) use ($like): void {
                        $termQuery->where('patient.name', 'like', $like)
                            ->orWhere('patient.surname', 'like', $like)
                            ->orWhere('patient.firstname', 'like', $like)
                            ->orWhere('patient.othernames', 'like', $like)
                            ->orWhere('patient.folder_id', 'like', $like)
                            ->orWhere('b.receipt_number', 'like', $like);
                    });
                }
            });
        }

        $total = (clone $query)->count('attempt.id');
        $referrals = $query
            ->orderByDesc('attempt.attempted_at')
            ->orderByDesc('attempt.id')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage)
            ->get([
                'attempt.id',
                'attempt.followup_id',
                'attempt.attempted_at',
                'attempt.contact_result',
                'attempt.vision_response',
                'attempt.wearing_frequency',
                'attempt.complaint_category',
                'attempt.complaint_notes',
                'attempt.call_notes',
                'attempt.next_attempt_at',
                'receptionist.name as referred_by',
                'followup.billing_id',
                'followup.pickup_at',
                'followup.milestone',
                'followup.due_at',
                'followup.status as checkin_status',
                'followup.complaint_status',
                'b.receipt_number',
                'patient.id as patient_id',
                'patient.folder_id',
                'patient.name',
                'patient.surname',
                'patient.firstname',
                'patient.othernames',
            ])
            ->map(function (object $referral): object {
                $referral->milestone_label = match ($referral->milestone) {
                    'week_1' => '1-week check-in',
                    'six_months' => '6-month check-up',
                    'two_years' => '2-year check-up',
                    default => 'Customer check-in',
                };
                $referral->patient_name = trim((string) ($referral->name ?: implode(' ', array_filter([
                    $referral->surname,
                    $referral->firstname,
                    $referral->othernames,
                ]))));
                unset($referral->name, $referral->surname, $referral->firstname, $referral->othernames);

                return $referral;
            });

        return response()->json([
            'branch_id' => $branchId,
            'referrals' => $referrals,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
        ]);
    }
}
