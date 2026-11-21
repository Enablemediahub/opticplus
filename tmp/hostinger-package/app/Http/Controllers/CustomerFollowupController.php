<?php

namespace App\Http\Controllers;

use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class CustomerFollowupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if ($denied = $this->authorizeCustomerCare($request)) {
            return $denied;
        }

        $validated = $request->validate([
            'status' => ['nullable', 'in:queue,due,upcoming,overdue,completed,complaints,all'],
            'search' => ['nullable', 'string', 'max:120'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'kpi_month' => ['nullable', 'date_format:Y-m'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:8', 'max:50'],
        ]);
        if (! empty($validated['date_from']) && ! empty($validated['date_to']) && $validated['date_to'] < $validated['date_from']) {
            return response()->json(['message' => 'The end date must be on or after the start date.'], 422);
        }

        $branchId = $this->resolveBranchId($request);
        $today = today()->toDateString();
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 20);
        $month = $validated['kpi_month'] ?? now()->format('Y-m');
        $monthStart = Carbon::createFromFormat('Y-m-d', $month.'-01')->startOfMonth();
        $monthEnd = $monthStart->copy()->endOfMonth();
        $status = $validated['status'] ?? 'queue';

        $query = DB::table('customer_followups as f')
            ->leftJoin('billing as b', 'b.id', '=', 'f.billing_id')
            ->leftJoin('patient_records as pr', 'pr.id', '=', 'f.patient_id');
        $this->applyBranchScope($query, 'f.branch_id', $branchId);

        if (! empty($validated['search'])) {
            $like = '%'.trim($validated['search']).'%';
            $query->where(function ($searchQuery) use ($like): void {
                $searchQuery->where('b.name', 'like', $like)
                    ->orWhere('pr.name', 'like', $like)
                    ->orWhere('f.folder_id', 'like', $like)
                    ->orWhere('pr.phone', 'like', $like)
                    ->orWhere('b.receipt_number', 'like', $like);
            });
        }

        if (! empty($validated['date_from'])) {
            $query->whereDate('f.due_at', '>=', $validated['date_from']);
        }
        if (! empty($validated['date_to'])) {
            $query->whereDate('f.due_at', '<=', $validated['date_to']);
        }

        match ($status) {
            'queue' => $query->where(function ($queueQuery): void {
                $queueQuery->where('f.status', 'pending')
                    ->orWhere('f.complaint_status', 'open');
            }),
            'due' => $query->where('f.status', 'pending')->whereDate('f.due_at', '=', $today),
            'upcoming' => $query->where('f.status', 'pending')->whereDate('f.due_at', '>', $today),
            'overdue' => $query->where('f.status', 'pending')->whereDate('f.due_at', '<', $today),
            'completed' => $query->where('f.status', 'completed'),
            'complaints' => $query->where('f.complaint_status', 'open'),
            default => null,
        };

        $total = (clone $query)->count('f.id');
        $records = $query
            ->orderByRaw("CASE
                WHEN f.complaint_status = 'open' THEN 0
                WHEN f.status = 'pending' AND f.due_at < ? THEN 1
                WHEN f.status = 'pending' AND f.due_at = ? THEN 2
                WHEN f.status = 'pending' THEN 3
                ELSE 4
            END", [$today, $today])
            ->orderBy('f.due_at')
            ->orderBy('f.id')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage)
            ->get([
                'f.id',
                'f.branch_id',
                'f.billing_id',
                'f.patient_id',
                'f.folder_id',
                'f.pickup_at',
                'f.milestone',
                'f.due_at',
                'f.status',
                'f.attempt_count',
                'f.last_attempt_at',
                'f.next_attempt_at',
                'f.completed_at',
                'f.complaint_status',
                'f.complaint_resolution_notes',
                'b.receipt_number',
                'b.balance',
                'pr.phone',
                DB::raw("COALESCE(NULLIF(b.name, ''), NULLIF(pr.name, ''), CONCAT_WS(' ', pr.surname, pr.firstname, pr.othernames)) as patient_name"),
            ]);

        $attemptsByFollowup = collect();
        if ($records->isNotEmpty()) {
            $attemptsByFollowup = DB::table('customer_followup_attempts as attempt')
                ->leftJoin('users as user', 'user.id', '=', 'attempt.attempted_by')
                ->whereIn('attempt.followup_id', $records->pluck('id'))
                ->orderByDesc('attempt.attempted_at')
                ->get([
                    'attempt.id',
                    'attempt.followup_id',
                    'attempt.attempted_by',
                    'attempt.attempted_at',
                    'attempt.contact_result',
                    'attempt.wearing_frequency',
                    'attempt.vision_response',
                    'attempt.complaint_category',
                    'attempt.complaint_notes',
                    'attempt.needs_optometrist_review',
                    'attempt.next_attempt_at',
                    'attempt.call_notes',
                    'user.name as staff_name',
                ])
                ->groupBy('followup_id');
        }

        $records = $records->map(function ($record) use ($attemptsByFollowup): object {
            $record->milestone_label = match ($record->milestone) {
                'week_1' => '1-week check-in',
                'six_months' => '6-month check-up',
                'two_years' => '2-year check-up',
                default => 'Customer check-in',
            };
            $record->attempts = $attemptsByFollowup->get($record->id, collect())->values();

            return $record;
        });

        $stats = $this->queueStats($branchId, $monthStart, $monthEnd);
        $kpiEvidence = $this->staffKpiEvidence($branchId, $monthStart, $monthEnd, $request);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => [
                'status' => $status,
                'search' => $validated['search'] ?? '',
                'date_from' => $validated['date_from'] ?? '',
                'date_to' => $validated['date_to'] ?? '',
                'kpi_month' => $month,
            ],
            'stats' => $stats,
            'kpi_evidence' => $kpiEvidence,
            'followups' => $records,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function recordAttempt(Request $request, int $followupId): JsonResponse
    {
        if ($denied = $this->authorizeCustomerCare($request)) {
            return $denied;
        }

        $validated = $request->validate([
            'contact_result' => ['required', 'in:reached,no_answer,callback_requested,wrong_number,unreachable'],
            'wearing_frequency' => ['nullable', 'in:daily,most_days,sometimes,not_using,not_asked'],
            'vision_response' => ['nullable', 'in:improved,same,worse,unsure,not_asked'],
            'complaint_category' => ['required', 'in:none,blurred_vision,headache,discomfort_fit,adaptation,damage,other'],
            'complaint_notes' => ['nullable', 'string', 'max:3000'],
            'needs_optometrist_review' => ['nullable', 'boolean'],
            'next_attempt_at' => ['nullable', 'date'],
            'call_notes' => ['nullable', 'string', 'max:3000'],
        ]);
        if ($validated['contact_result'] === 'callback_requested' && empty($validated['next_attempt_at'])) {
            return response()->json(['message' => 'Choose a date and time for the requested callback.'], 422);
        }

        $branchId = $this->resolveBranchId($request);
        $userId = (int) $request->user()->id;
        $attemptedAt = now();
        $nextAttemptAt = ! empty($validated['next_attempt_at'])
            ? Carbon::parse($validated['next_attempt_at'])->format('Y-m-d H:i:s')
            : null;

        $updated = DB::transaction(function () use ($branchId, $followupId, $userId, $validated, $attemptedAt, $nextAttemptAt): bool {
            $followup = DB::table('customer_followups')
                ->where('id', $followupId)
                ->lockForUpdate()
                ->first();
            if (! $followup || ($branchId > 0 && (int) $followup->branch_id !== $branchId)) {
                return false;
            }

            DB::table('customer_followup_attempts')->insert([
                'followup_id' => $followupId,
                'attempted_by' => $userId,
                'attempted_at' => $attemptedAt,
                'contact_result' => $validated['contact_result'],
                'wearing_frequency' => $validated['wearing_frequency'] ?? null,
                'vision_response' => $validated['vision_response'] ?? null,
                'complaint_category' => $validated['complaint_category'],
                'complaint_notes' => $validated['complaint_notes'] ?? null,
                'needs_optometrist_review' => (bool) ($validated['needs_optometrist_review'] ?? false),
                'next_attempt_at' => $nextAttemptAt,
                'call_notes' => $validated['call_notes'] ?? null,
                'created_at' => $attemptedAt,
                'updated_at' => $attemptedAt,
            ]);

            $reached = $validated['contact_result'] === 'reached';
            $hasComplaint = $validated['complaint_category'] !== 'none';
            DB::table('customer_followups')->where('id', $followupId)->update([
                'attempt_count' => (int) $followup->attempt_count + 1,
                'last_attempt_at' => $attemptedAt,
                'next_attempt_at' => $reached ? null : $nextAttemptAt,
                'status' => $reached ? 'completed' : $followup->status,
                'completed_at' => $reached ? ($followup->completed_at ?? $attemptedAt) : $followup->completed_at,
                'completed_by' => $reached ? ($followup->completed_by ?? $userId) : $followup->completed_by,
                'complaint_status' => $hasComplaint ? 'open' : $followup->complaint_status,
                'updated_at' => $attemptedAt,
            ]);

            return true;
        });

        if (! $updated) {
            return response()->json(['message' => 'Follow-up was not found for your branch.'], 404);
        }

        AuditLog::logManual($request, 'create', 'customer follow-up', 'followup_id: '.$followupId, [
            'contact_result' => $validated['contact_result'],
            'complaint_category' => $validated['complaint_category'],
        ]);

        return response()->json([
            'message' => $validated['contact_result'] === 'reached'
                ? 'Check-up recorded and this milestone marked complete.'
                : 'Call attempt recorded. The follow-up remains in the queue.',
        ]);
    }

    public function resolveComplaint(Request $request, int $followupId): JsonResponse
    {
        if ($denied = $this->authorizeCustomerCare($request, true)) {
            return $denied;
        }

        $validated = $request->validate([
            'resolution_notes' => ['required', 'string', 'max:3000'],
        ]);
        $branchId = $this->resolveBranchId($request);
        $followup = DB::table('customer_followups')
            ->where('id', $followupId)
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->first(['id', 'complaint_status']);
        if (! $followup) {
            return response()->json(['message' => 'Follow-up was not found for this branch.'], 404);
        }
        if ($followup->complaint_status !== 'open') {
            return response()->json(['message' => 'This follow-up has no open complaint to resolve.'], 422);
        }

        $resolvedAt = now();
        DB::table('customer_followups')->where('id', $followupId)->update([
            'complaint_status' => 'resolved',
            'complaint_resolution_notes' => trim($validated['resolution_notes']),
            'complaint_resolved_by' => $request->user()->id,
            'complaint_resolved_at' => $resolvedAt,
            'updated_at' => $resolvedAt,
        ]);

        AuditLog::logManual($request, 'edit', 'customer follow-up complaint', 'followup_id: '.$followupId, [
            'complaint_status' => 'resolved',
        ]);

        return response()->json(['message' => 'Complaint follow-through recorded.']);
    }

    private function queueStats(int $branchId, Carbon $monthStart, Carbon $monthEnd): array
    {
        $base = DB::table('customer_followups');
        $this->applyBranchScope($base, 'branch_id', $branchId);
        $monthStartString = $monthStart->toDateString();
        $monthEndString = $monthEnd->toDateString();
        $completedStart = $monthStart->copy()->startOfDay();
        $completedEnd = $monthEnd->copy()->endOfDay();

        $dueThisMonth = (clone $base)->whereBetween('due_at', [$monthStartString, $monthEndString])->count();
        $completedDueThisMonth = (clone $base)
            ->whereBetween('due_at', [$monthStartString, $monthEndString])
            ->where('status', 'completed')
            ->count();
        $completedOnTime = (clone $base)
            ->whereBetween('due_at', [$monthStartString, $monthEndString])
            ->where('status', 'completed')
            ->whereRaw('DATE(completed_at) <= due_at')
            ->count();

        return [
            'due_today' => (clone $base)->where('status', 'pending')->whereDate('due_at', today())->count(),
            'overdue' => (clone $base)->where('status', 'pending')->whereDate('due_at', '<', today())->count(),
            'upcoming' => (clone $base)->where('status', 'pending')->whereDate('due_at', '>', today())->count(),
            'open_complaints' => (clone $base)->where('complaint_status', 'open')->count(),
            'completed_this_month' => (clone $base)->where('status', 'completed')->whereBetween('completed_at', [$completedStart, $completedEnd])->count(),
            'due_this_month' => $dueThisMonth,
            'completed_due_this_month' => $completedDueThisMonth,
            'on_time_due_this_month' => $completedOnTime,
            'completion_rate' => $dueThisMonth > 0 ? round($completedDueThisMonth / $dueThisMonth * 100, 1) : 0.0,
            'on_time_rate' => $dueThisMonth > 0 ? round($completedOnTime / $dueThisMonth * 100, 1) : 0.0,
        ];
    }

    private function staffKpiEvidence(int $branchId, Carbon $monthStart, Carbon $monthEnd, Request $request): array
    {
        $user = $request->user();
        $role = strtolower((string) ($user?->normalized_role ?? $user?->role ?? ''));
        $start = $monthStart->copy()->startOfDay();
        $end = $monthEnd->copy()->endOfDay();
        $staffQuery = DB::table('users')
            ->where('role', 'receptionist')
            ->where(fn ($query) => $query->whereNull('employee_status')->orWhereIn('employee_status', ['', 'active']));

        if ($role === 'receptionist') {
            $staffQuery->where('id', $user->id);
        } elseif ($branchId > 0) {
            $staffQuery->where('branch_id', $branchId);
        }

        $metrics = $staffQuery->get(['id as user_id', 'name as staff_name'])
            ->mapWithKeys(fn ($staff) => [
                (int) $staff->user_id => $this->emptyStaffKpiMetrics((int) $staff->user_id, $staff->staff_name),
            ]);
        $attempts = DB::table('customer_followup_attempts as attempt')
            ->join('customer_followups as followup', 'followup.id', '=', 'attempt.followup_id')
            ->join('users as staff', 'staff.id', '=', 'attempt.attempted_by')
            ->where('staff.role', 'receptionist')
            ->whereBetween('attempt.attempted_at', [$start, $end])
            ->when($branchId > 0, fn ($query) => $query->where('followup.branch_id', $branchId))
            ->when($role === 'receptionist', fn ($query) => $query->where('attempt.attempted_by', $user->id))
            ->groupBy('staff.id', 'staff.name')
            ->get([
                'staff.id as user_id',
                'staff.name as staff_name',
                DB::raw('COUNT(*) as calls_logged'),
                DB::raw("COUNT(DISTINCT CASE WHEN attempt.contact_result = 'reached' THEN attempt.followup_id END) as patients_reached"),
                DB::raw("COUNT(DISTINCT CASE WHEN attempt.complaint_category <> 'none' THEN attempt.followup_id END) as complaints_logged"),
            ]);
        foreach ($attempts as $attempt) {
            $id = (int) $attempt->user_id;
            $staffMetrics = $metrics->get($id) ?? $this->emptyStaffKpiMetrics($id, $attempt->staff_name);
            $staffMetrics['calls_logged'] = (int) $attempt->calls_logged;
            $staffMetrics['patients_reached'] = (int) $attempt->patients_reached;
            $staffMetrics['complaints_logged'] = (int) $attempt->complaints_logged;
            $metrics->put($id, $staffMetrics);
        }

        $completed = DB::table('customer_followups as followup')
            ->join('users as staff', 'staff.id', '=', 'followup.completed_by')
            ->where('staff.role', 'receptionist')
            ->where('followup.status', 'completed')
            ->whereBetween('followup.due_at', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->when($branchId > 0, fn ($query) => $query->where('followup.branch_id', $branchId))
            ->when($role === 'receptionist', fn ($query) => $query->where('followup.completed_by', $user->id))
            ->groupBy('staff.id', 'staff.name')
            ->get([
                'staff.id as user_id',
                'staff.name as staff_name',
                DB::raw('COUNT(*) as checkups_completed'),
                DB::raw('SUM(CASE WHEN DATE(followup.completed_at) <= followup.due_at THEN 1 ELSE 0 END) as completed_on_time'),
            ]);
        foreach ($completed as $completion) {
            $id = (int) $completion->user_id;
            $staffMetrics = $metrics->get($id) ?? $this->emptyStaffKpiMetrics($id, $completion->staff_name);
            $staffMetrics['checkups_completed'] = (int) $completion->checkups_completed;
            $staffMetrics['completed_on_time'] = (int) $completion->completed_on_time;
            $metrics->put($id, $staffMetrics);
        }

        return ['staff' => $metrics->sortBy('staff_name')->values()->all()];
    }

    private function emptyStaffKpiMetrics(int $userId, string $staffName): array
    {
        return [
            'user_id' => $userId,
            'staff_name' => $staffName,
            'calls_logged' => 0,
            'patients_reached' => 0,
            'complaints_logged' => 0,
            'checkups_completed' => 0,
            'completed_on_time' => 0,
        ];
    }

    private function authorizeCustomerCare(Request $request, bool $managerOnly = false): ?JsonResponse
    {
        $user = $request->user();
        $role = strtolower((string) ($user?->normalized_role ?? $user?->role ?? ''));
        if ($role === 'manager' || (! $managerOnly && $role === 'receptionist')) {
            if ($role === 'receptionist' && ! in_array((int) $user->branch_id, [1, 2], true)) {
                return response()->json(['message' => 'A valid branch must be assigned to access customer follow-ups.'], 403);
            }

            return null;
        }

        return response()->json(['message' => 'Only the General Manager and receptionists can access customer follow-ups.'], 403);
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();
        if (strtolower((string) ($user?->normalized_role ?? $user?->role ?? '')) !== 'manager') {
            return (int) ($user->branch_id ?? 0);
        }

        $requestedBranchId = (int) $request->integer('branch_id');

        return in_array($requestedBranchId, [0, 1, 2], true) ? $requestedBranchId : 1;
    }

    private function applyBranchScope($query, string $column, int $branchId): void
    {
        if ($branchId > 0) {
            $query->where($column, $branchId);
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
