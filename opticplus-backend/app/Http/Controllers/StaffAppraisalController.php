<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StaffAppraisalController extends Controller
{
    private const STAFF_ROLES = ['receptionist', 'accountant', 'technician'];

    public function manage(Request $request): JsonResponse
    {
        if (! $this->isManager($request)) {
            return response()->json(['message' => 'Only the General Manager can manage staff appraisals.'], 403);
        }

        $branchId = $this->managerBranchId($request);
        $setting = $branchId > 0
            ? DB::table('staff_appraisal_settings')->where('branch_id', $branchId)->first()
            : null;
        $periods = DB::table('staff_appraisal_periods')
            ->when($branchId > 0, fn ($query) => $query->whereIn('branch_id', [$branchId, 0]))
            ->orderByDesc('start_date')
            ->orderByDesc('id')
            ->limit(60)
            ->get()
            ->map(fn ($period) => $this->managerPeriodPayload($period));
        $staffQuery = DB::table('users')->whereIn('role', self::STAFF_ROLES);
        $staffQuery->where(function ($query) use ($branchId): void { $this->scopeStaffToBranch($query, $branchId); });
        $staff = $staffQuery
            ->where(fn ($query) => $query->whereNull('employee_status')->orWhere('employee_status', '')->orWhere('employee_status', 'active'))
            ->orderBy('name')
            ->get(['id', 'name', 'username', 'email', 'phone', 'role', 'branch_id', 'profile_image'])
            ->map(function ($user): array {
                $employee = $this->findEmployeeProfile($user);
                $photoPath = $employee?->photo_path ?: $user->profile_image;
                $photoUrl = $photoPath && ! str_starts_with((string) $photoPath, 'http')
                    ? rtrim(config('app.url'), '/').'/'.ltrim((string) $photoPath, '/')
                    : $photoPath;

                return [
                    'id' => (int) $user->id,
                    'name' => $user->name,
                    'username' => $user->username,
                    'role' => $user->role,
                    'branch_id' => (int) ($user->branch_id ?? 0),
                    'assignment_scope' => in_array($user->role, ['accountant', 'technician'], true) || (int) $user->branch_id === 0
                        ? 'Merged branches'
                        : $this->branchLabel((int) $user->branch_id),
                    'photo_url' => $photoUrl,
                    'job_title' => $employee?->job_title,
                ];
            });

        $scoreSummary = $this->scoreSummary($branchId);

        return response()->json([
            'branch_id' => $branchId,
            'enabled' => $setting
                ? (bool) $setting->is_enabled
                : $periods->contains(fn ($period) => (int) ($period['branch_id'] ?? -1) === $branchId && ($period['status'] ?? null) === 'active'),
            'staff' => $staff,
            'periods' => $periods,
            'score_summary' => $scoreSummary,
        ]);
    }

    public function setEnabled(Request $request): JsonResponse
    {
        if (! $this->isManager($request)) {
            return response()->json(['message' => 'Only the General Manager can change appraisal settings.'], 403);
        }
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        $branchId = $this->managerBranchId($request);
        DB::table('staff_appraisal_settings')->updateOrInsert(
            ['branch_id' => $branchId],
            ['is_enabled' => (bool) $data['enabled'], 'updated_by' => $request->user()->id, 'updated_at' => now(), 'created_at' => now()]
        );

        return response()->json(['enabled' => (bool) $data['enabled']]);
    }

    public function storePeriod(Request $request): JsonResponse
    {
        if (! $this->isManager($request)) {
            return response()->json(['message' => 'Only the General Manager can create appraisal periods.'], 403);
        }
        $branchId = $this->managerBranchId($request);
        $this->normalizeAssignedUsers($request);
        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'period_type' => ['required', 'in:daily,weekly,monthly'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'tasks' => ['required', 'array', 'min:1', 'max:40'],
            'tasks.*.title' => ['required', 'string', 'max:180'],
            'tasks.*.description' => ['nullable', 'string', 'max:2000'],
            'tasks.*.measurement' => ['required', 'in:checklist,target'],
            'tasks.*.target_value' => ['nullable', 'numeric', 'min:0.01'],
            'tasks.*.unit' => ['nullable', 'string', 'max:40'],
            'tasks.*.weight' => ['required', 'numeric', 'min:0.1', 'max:100'],
            'tasks.*.assigned_role' => ['nullable', 'in:receptionist,accountant,technician'],
            'tasks.*.assigned_user_ids' => ['nullable', 'array', 'min:1'],
            'tasks.*.assigned_user_ids.*' => ['integer'],
        ]);

        foreach ($data['tasks'] as $index => $task) {
            if (($task['measurement'] === 'target' && empty($task['target_value'])) || empty($task['assigned_user_ids'])) {
                return response()->json(['message' => 'Each task needs a target value when measured as a target and at least one selected staff member.'], 422);
            }
        }

        $staffQuery = DB::table('users')->whereIn('role', self::STAFF_ROLES)
            ->where(function ($query) use ($branchId): void { $this->scopeStaffToBranch($query, $branchId); });
        $activeStaffIds = (clone $staffQuery)
            ->where(fn ($query) => $query->whereNull('employee_status')->orWhere('employee_status', '')->orWhere('employee_status', 'active'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
        foreach ($data['tasks'] as $task) {
            if (array_diff(array_map('intval', $task['assigned_user_ids']), $activeStaffIds)) {
                return response()->json(['message' => 'One or more selected users are inactive or are not available for this branch. Refresh the user list and try again.'], 422);
            }
        }

        $periodId = DB::transaction(function () use ($data, $branchId, $request, $activeStaffIds): int {
            $periodId = DB::table('staff_appraisal_periods')->insertGetId([
                'branch_id' => $branchId,
                'title' => trim($data['title']),
                'period_type' => $data['period_type'],
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                'status' => 'active',
                'created_by' => $request->user()->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            foreach ($data['tasks'] as $position => $task) {
                $taskId = DB::table('staff_appraisal_tasks')->insertGetId([
                    'period_id' => $periodId,
                    'title' => trim($task['title']),
                    'description' => isset($task['description']) ? trim($task['description']) : null,
                    'target_value' => $task['measurement'] === 'target' ? $task['target_value'] : null,
                    'unit' => $task['measurement'] === 'target' ? ($task['unit'] ?? null) : null,
                    'weight' => $task['weight'],
                    'measurement' => $task['measurement'],
                    'assigned_role' => null,
                    'sort_order' => $position,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $assignedIds = ! empty($task['assigned_user_ids'])
                    ? array_values(array_intersect($activeStaffIds, array_map('intval', $task['assigned_user_ids'])))
                    : DB::table('users')->where('role', $task['assigned_role'])
                        ->where(function ($query) use ($branchId): void { $this->scopeStaffToBranch($query, $branchId); })
                        ->where(fn ($query) => $query->whereNull('employee_status')->orWhere('employee_status', '')->orWhere('employee_status', 'active'))
                        ->pluck('id')->map(fn ($id) => (int) $id)->all();
                foreach ($assignedIds as $userId) {
                    $user = DB::table('users')->where('id', $userId)->first(['role']);
                    if (! $user || ! in_array($user->role, self::STAFF_ROLES, true)) continue;
                    DB::table('staff_appraisal_assignments')->insert([
                        'task_id' => $taskId,
                        'user_id' => $userId,
                        'role_snapshot' => $user->role,
                        'status' => 'pending',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            return (int) $periodId;
        });

        return response()->json(['message' => 'Appraisal period created.', 'period_id' => $periodId], 201);
    }

    public function mine(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user?->normalized_role ?? $user?->role, self::STAFF_ROLES, true)) {
            return response()->json(['enabled' => false, 'periods' => []]);
        }
        $branchId = (int) $user->branch_id;
        $periods = DB::table('staff_appraisal_periods')
            ->where(function ($query) use ($branchId, $user): void {
                if ($branchId === 0 || in_array($user?->normalized_role ?? $user?->role, ['accountant', 'technician'], true)) {
                    $query->where('branch_id', '>=', 0);
                    return;
                }
                $query->where('branch_id', 0)->orWhere('branch_id', $branchId);
                if (Schema::hasTable('user_branches')) {
                    $query->orWhereExists(fn ($branches) => $branches->selectRaw('1')->from('user_branches')
                        ->where('user_branches.user_id', $user->id)
                        ->whereColumn('user_branches.branch_id', 'staff_appraisal_periods.branch_id'));
                }
            })
            ->where(fn ($query) => $query->where(fn ($active) => $active->where('status', 'active')->whereDate('start_date', '<=', today())->whereDate('end_date', '>=', today()))
                ->orWhere(fn ($final) => $final->where('status', 'finalized')->whereDate('end_date', '>=', today()->subDays(45))))
            ->whereExists(fn ($query) => $query->selectRaw('1')->from('staff_appraisal_tasks as t')
                ->join('staff_appraisal_assignments as a', 'a.task_id', '=', 't.id')
                ->whereColumn('t.period_id', 'staff_appraisal_periods.id')->where('a.user_id', $user->id))
            ->orderByDesc('start_date')->get()
            ->filter(function ($period): bool {
                if ($period->status === 'finalized') return true;
                $setting = DB::table('staff_appraisal_settings')->where('branch_id', $period->branch_id)->first(['is_enabled']);
                return $setting === null || (bool) $setting->is_enabled;
            })
            ->map(fn ($period) => $this->staffPeriodPayload($period, (int) $user->id));
        $enabled = $periods->contains(fn ($period) => $period['status'] === 'active');

        return response()->json(['enabled' => $enabled, 'periods' => $periods]);
    }

    public function updatePeriod(Request $request, int $periodId): JsonResponse
    {
        if (! $this->isManager($request)) {
            return response()->json(['message' => 'Only the General Manager can edit appraisal periods.'], 403);
        }
        $branchId = $this->managerBranchId($request);
        $period = DB::table('staff_appraisal_periods')->where('id', $periodId)
            ->when($branchId > 0, fn ($query) => $query->whereIn('branch_id', [$branchId, 0]))
            ->first();
        if (! $period) return response()->json(['message' => 'Appraisal period not found.'], 404);
        if ($period->status === 'finalized') return response()->json(['message' => 'Finalized appraisal periods are locked.'], 422);

        $this->normalizeAssignedUsers($request);
        $data = $request->validate([
            'branch_id' => ['sometimes', 'integer', 'in:0,1,2'],
            'title' => ['required', 'string', 'max:160'],
            'period_type' => ['required', 'in:daily,weekly,monthly'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'tasks' => ['required', 'array', 'min:1', 'max:40'],
            'tasks.*.id' => ['nullable', 'integer'],
            'tasks.*.title' => ['required', 'string', 'max:180'],
            'tasks.*.description' => ['nullable', 'string', 'max:2000'],
            'tasks.*.measurement' => ['required', 'in:checklist,target'],
            'tasks.*.target_value' => ['nullable', 'numeric', 'min:0.01'],
            'tasks.*.unit' => ['nullable', 'string', 'max:40'],
            'tasks.*.weight' => ['required', 'numeric', 'min:0.1', 'max:100'],
            'tasks.*.assigned_role' => ['nullable', 'in:receptionist,accountant,technician'],
            'tasks.*.assigned_user_ids' => ['nullable', 'array', 'min:1'],
            'tasks.*.assigned_user_ids.*' => ['integer'],
        ]);
        $targetBranchId = (int) ($data['branch_id'] ?? $period->branch_id);
        foreach ($data['tasks'] as $task) {
            if (($task['measurement'] === 'target' && empty($task['target_value'])) || empty($task['assigned_user_ids'])) {
                return response()->json(['message' => 'Each task needs a target value when measured as a target and at least one selected staff member.'], 422);
            }
        }

        $activeStaffIds = DB::table('users')->whereIn('role', self::STAFF_ROLES)
            ->where(function ($query) use ($targetBranchId): void { $this->scopeStaffToBranch($query, $targetBranchId); })
            ->where(fn ($query) => $query->whereNull('employee_status')->orWhere('employee_status', '')->orWhere('employee_status', 'active'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
        foreach ($data['tasks'] as $task) {
            if (array_diff(array_map('intval', $task['assigned_user_ids']), $activeStaffIds)) {
                return response()->json(['message' => 'One or more selected users are inactive or are not available for this branch. Refresh the user list and try again.'], 422);
            }
        }

        DB::transaction(function () use ($period, $periodId, $targetBranchId, $data, $activeStaffIds): void {
            DB::table('staff_appraisal_periods')->where('id', $periodId)->update([
                'branch_id' => $targetBranchId,
                'title' => trim($data['title']),
                'period_type' => $data['period_type'],
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                'updated_at' => now(),
            ]);
            $keptTaskIds = [];
            foreach ($data['tasks'] as $position => $task) {
                $taskValues = [
                    'title' => trim($task['title']),
                    'description' => isset($task['description']) ? trim($task['description']) : null,
                    'target_value' => $task['measurement'] === 'target' ? $task['target_value'] : null,
                    'unit' => $task['measurement'] === 'target' ? ($task['unit'] ?? null) : null,
                    'weight' => $task['weight'],
                    'measurement' => $task['measurement'],
                    'assigned_role' => null,
                    'sort_order' => $position,
                    'updated_at' => now(),
                ];
                if (! empty($task['id'])) {
                    $taskId = (int) $task['id'];
                    $owned = DB::table('staff_appraisal_tasks')->where('id', $taskId)->where('period_id', $periodId)->exists();
                    abort_unless($owned, 404, 'An appraisal task could not be found.');
                    DB::table('staff_appraisal_tasks')->where('id', $taskId)->update($taskValues);
                } else {
                    $taskValues['period_id'] = $periodId;
                    $taskValues['created_at'] = now();
                    $taskId = (int) DB::table('staff_appraisal_tasks')->insertGetId($taskValues);
                }
                $keptTaskIds[] = $taskId;

                $assignedIds = ! empty($task['assigned_user_ids'])
                    ? array_values(array_intersect($activeStaffIds, array_map('intval', $task['assigned_user_ids'])))
                    : DB::table('users')->where('role', $task['assigned_role'])
                        ->where(function ($query) use ($branchId): void { $this->scopeStaffToBranch($query, $branchId); })
                        ->where(fn ($query) => $query->whereNull('employee_status')->orWhere('employee_status', '')->orWhere('employee_status', 'active'))
                        ->pluck('id')->map(fn ($id) => (int) $id)->all();
                $existingAssignments = DB::table('staff_appraisal_assignments')->where('task_id', $taskId)->get(['id', 'user_id'])->keyBy('user_id');
                DB::table('staff_appraisal_assignments')->where('task_id', $taskId)->whereNotIn('user_id', $assignedIds ?: [-1])->delete();
                foreach ($assignedIds as $userId) {
                    if ($existingAssignments->has($userId)) {
                        DB::table('staff_appraisal_assignments')->where('id', $existingAssignments->get($userId)->id)->update(['role_snapshot' => DB::table('users')->where('id', $userId)->value('role'), 'updated_at' => now()]);
                        continue;
                    }
                    $role = DB::table('users')->where('id', $userId)->value('role');
                    DB::table('staff_appraisal_assignments')->insert([
                        'task_id' => $taskId,
                        'user_id' => $userId,
                        'role_snapshot' => $role,
                        'status' => 'pending',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
            DB::table('staff_appraisal_tasks')->where('period_id', $period->id)->whereNotIn('id', $keptTaskIds)->delete();
        });

        return response()->json(['message' => 'Appraisal period updated.']);
    }

    public function deletePeriod(Request $request, int $periodId): JsonResponse
    {
        if (! $this->isManager($request)) {
            return response()->json(['message' => 'Only the General Manager can delete appraisal periods.'], 403);
        }
        $branchId = $this->managerBranchId($request);
        $deleted = DB::table('staff_appraisal_periods')->where('id', $periodId)
            ->when($branchId > 0, fn ($query) => $query->whereIn('branch_id', [$branchId, 0]))
            ->delete();
        if (! $deleted) return response()->json(['message' => 'Appraisal period not found.'], 404);

        return response()->json(['message' => 'Appraisal period and its task records were deleted.']);
    }

    public function updateProgress(Request $request, int $assignmentId): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user?->normalized_role ?? $user?->role, self::STAFF_ROLES, true)) {
            return response()->json(['message' => 'This appraisal is not assigned to your role.'], 403);
        }
        $data = $request->validate([
            'status' => ['required', 'in:pending,in_progress,completed'],
            'achieved_value' => ['nullable', 'numeric', 'min:0'],
            'staff_note' => ['nullable', 'string', 'max:2000'],
            'acknowledge' => ['sometimes', 'boolean'],
        ]);
        $assignment = DB::table('staff_appraisal_assignments as a')
            ->join('staff_appraisal_tasks as t', 't.id', '=', 'a.task_id')
            ->join('staff_appraisal_periods as p', 'p.id', '=', 't.period_id')
            ->where('a.id', $assignmentId)->where('a.user_id', $user->id)
            ->where('p.status', 'active')
            ->first(['a.id', 't.measurement', 't.target_value', 'p.branch_id', 'p.end_date']);
        if (! $assignment || $assignment->end_date < today()->toDateString()) {
            return response()->json(['message' => 'This appraisal period is no longer open.'], 404);
        }
        $setting = DB::table('staff_appraisal_settings')->where('branch_id', $assignment->branch_id)->first(['is_enabled']);
        if ($setting !== null && ! (bool) $setting->is_enabled) {
            return response()->json(['message' => 'Staff appraisals are currently paused.'], 403);
        }
        if ($assignment->measurement === 'target' && empty($data['acknowledge']) && ! array_key_exists('achieved_value', $data)) {
            return response()->json(['message' => 'Enter your achieved figure for this target.'], 422);
        }
        $status = $data['status'];
        if ($assignment->measurement === 'target' && array_key_exists('achieved_value', $data)) {
            $achievement = (float) ($data['achieved_value'] ?? 0);
            $status = $achievement >= (float) $assignment->target_value ? 'completed' : ($achievement > 0 ? 'in_progress' : 'pending');
        }
        $updates = [
            'status' => $status,
            'updated_at' => now(),
        ];
        if (array_key_exists('achieved_value', $data)) $updates['achieved_value'] = $data['achieved_value'];
        if (array_key_exists('staff_note', $data)) $updates['staff_note'] = trim((string) $data['staff_note']);
        if (! empty($data['acknowledge'])) {
            $updates['acknowledged_at'] = DB::table('staff_appraisal_assignments')->where('id', $assignmentId)->value('acknowledged_at') ?? now();
        }
        $updates += [
            'submitted_at' => $status === 'completed' ? now() : null,
        ];
        DB::table('staff_appraisal_assignments')->where('id', $assignmentId)->update($updates);

        return response()->json(['message' => 'Appraisal progress saved.']);
    }

    public function reviewAssignment(Request $request, int $assignmentId): JsonResponse
    {
        if (! $this->isManager($request)) {
            return response()->json(['message' => 'Only the General Manager can review appraisal results.'], 403);
        }
        $data = $request->validate(['manager_score' => ['nullable', 'numeric', 'min:0', 'max:100'], 'manager_note' => ['nullable', 'string', 'max:2000']]);
        $branchId = $this->managerBranchId($request);
        $exists = DB::table('staff_appraisal_assignments as a')
            ->join('staff_appraisal_tasks as t', 't.id', '=', 'a.task_id')
            ->join('staff_appraisal_periods as p', 'p.id', '=', 't.period_id')
            ->where('a.id', $assignmentId)
            ->when($branchId > 0, fn ($query) => $query->whereIn('p.branch_id', [$branchId, 0]))
            ->exists();
        if (! $exists) return response()->json(['message' => 'Appraisal assignment not found.'], 404);
        DB::table('staff_appraisal_assignments')->where('id', $assignmentId)->update([
            'manager_score' => $data['manager_score'] ?? null,
            'manager_note' => isset($data['manager_note']) ? trim($data['manager_note']) : null,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Appraisal review saved.']);
    }

    public function finalize(Request $request, int $periodId): JsonResponse
    {
        if (! $this->isManager($request)) {
            return response()->json(['message' => 'Only the General Manager can finalize appraisal periods.'], 403);
        }
        $branchId = $this->managerBranchId($request);
        $updated = DB::table('staff_appraisal_periods')->where('id', $periodId)
            ->when($branchId > 0, fn ($query) => $query->whereIn('branch_id', [$branchId, 0]))
            ->where('status', 'active')
            ->update(['status' => 'finalized', 'finalized_at' => now(), 'updated_at' => now()]);
        if (! $updated) return response()->json(['message' => 'Active appraisal period not found.'], 404);

        return response()->json(['message' => 'Appraisal period finalized.']);
    }

    public function reopen(Request $request, int $periodId): JsonResponse
    {
        if (! $this->isManager($request)) {
            return response()->json(['message' => 'Only the General Manager can reopen appraisal periods.'], 403);
        }
        $branchId = $this->managerBranchId($request);
        $updated = DB::table('staff_appraisal_periods')->where('id', $periodId)
            ->when($branchId > 0, fn ($query) => $query->whereIn('branch_id', [$branchId, 0]))
            ->where('status', 'finalized')
            ->update(['status' => 'active', 'finalized_at' => null, 'updated_at' => now()]);
        if (! $updated) return response()->json(['message' => 'Finalized appraisal period not found.'], 404);

        return response()->json(['message' => 'Appraisal period reopened. Existing progress and reviews were kept.']);
    }

    private function managerPeriodPayload(object $period): array
    {
        $tasks = DB::table('staff_appraisal_tasks')->where('period_id', $period->id)->orderBy('sort_order')->get()->map(function ($task): array {
            $assignments = DB::table('staff_appraisal_assignments as a')->join('users as u', 'u.id', '=', 'a.user_id')
                ->where('a.task_id', $task->id)->orderBy('u.name')
                ->get(['a.id', 'a.user_id', 'a.role_snapshot', 'a.status', 'a.achieved_value', 'a.staff_note', 'a.manager_score', 'a.manager_note', 'a.acknowledged_at', 'u.name', 'u.username']);
            return [...(array) $task, 'assignments' => $assignments];
        });

        return [...(array) $period, 'tasks' => $tasks];
    }

    private function scoreSummary(int $branchId): array
    {
        $today = now();
        $todayString = $today->toDateString();
        $ranges = [
            'week' => [$today->copy()->startOfWeek(Carbon::MONDAY)->toDateString(), $today->copy()->endOfWeek(Carbon::SUNDAY)->toDateString()],
            'month' => [$today->copy()->startOfMonth()->toDateString(), $today->copy()->endOfMonth()->toDateString()],
            'year' => [$today->copy()->startOfYear()->toDateString(), $today->copy()->endOfYear()->toDateString()],
        ];
        $scoreExpression = "CASE WHEN a.manager_score IS NOT NULL THEN LEAST(a.manager_score, 100) WHEN t.measurement = 'target' THEN CASE WHEN t.target_value > 0 THEN LEAST((COALESCE(a.achieved_value, 0) / t.target_value) * 100, 100) ELSE 0 END WHEN a.status = 'completed' THEN 100 WHEN a.status = 'in_progress' THEN 50 ELSE 0 END";
        $summary = [];

        foreach ($ranges as $key => [$rangeStart, $rangeEnd]) {
            $summary[$key] = DB::table('staff_appraisal_periods as p')
                ->join('staff_appraisal_tasks as t', 't.period_id', '=', 'p.id')
                ->join('staff_appraisal_assignments as a', 'a.task_id', '=', 't.id')
                ->when($branchId > 0, fn ($query) => $query->whereIn('p.branch_id', [$branchId, 0]))
                ->whereDate('p.start_date', '<=', $todayString)
                ->whereDate('p.start_date', '<=', $rangeEnd)
                ->whereDate('p.end_date', '>=', $rangeStart)
                ->groupBy('a.user_id')
                ->select('a.user_id')
                ->selectRaw("SUM(t.weight * ({$scoreExpression})) as weighted_points")
                ->selectRaw('SUM(t.weight) as total_weight')
                ->selectRaw('COUNT(*) as goal_count')
                ->selectRaw("SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed_count")
                ->get()
                ->keyBy('user_id');
        }

        return $summary;
    }

    private function findEmployeeProfile(object $user): ?object
    {
        $candidates = [
            ['email', $user->email ?? null],
            ['email', $user->username ?? null],
            ['phone_number', $user->phone ?? null],
            ['ghana_card_name', $user->name ?? null],
        ];
        $branchId = (int) ($user->branch_id ?? 0);

        foreach ($candidates as [$column, $value]) {
            $value = is_string($value) ? trim($value) : '';
            if ($value === '') continue;
            $normalizedValue = $column === 'phone_number' ? preg_replace('/\D+/', '', $value) : mb_strtolower($value);
            if ($normalizedValue === '') continue;

            foreach ($branchId > 0 ? [true, false] : [false] as $restrictToBranch) {
                $employee = DB::table('employees_comprehensive')
                    ->select('photo_path', 'job_title')
                    ->when($restrictToBranch, fn ($query) => $query->where('branch_id', $branchId))
                    ->whereNotNull($column)
                    ->where($column, '!=', '')
                    ->whereRaw(
                        $column === 'phone_number'
                            ? "REPLACE(REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '(', ''), ')', '') = ?"
                            : "LOWER({$column}) = ?",
                        [$normalizedValue]
                    )
                    ->first();
                if ($employee) return $employee;
            }
        }

        return null;
    }

    private function staffPeriodPayload(object $period, int $userId): array
    {
        $tasks = DB::table('staff_appraisal_tasks as t')
            ->join('staff_appraisal_assignments as a', 'a.task_id', '=', 't.id')
            ->where('t.period_id', $period->id)->where('a.user_id', $userId)->orderBy('t.sort_order')
            ->get(['t.id as task_id', 't.title', 't.description', 't.target_value', 't.unit', 't.weight', 't.measurement', 'a.id as assignment_id', 'a.status', 'a.achieved_value', 'a.staff_note', 'a.manager_score', 'a.manager_note', 'a.acknowledged_at', 'a.reviewed_at'])
            ->map(fn ($task) => [...(array) $task, 'earned_percent' => $this->earnedPercent($task)]);
        $totalWeight = (float) $tasks->sum('weight');
        $score = $totalWeight > 0 ? round((float) $tasks->sum(fn ($task) => (float) $task['weight'] * $task['earned_percent']) / $totalWeight, 1) : 0.0;

        return [...(array) $period, 'tasks' => $tasks, 'score' => $score, 'is_final' => $period->status === 'finalized'];
    }

    private function earnedPercent(object $task): float
    {
        if ($task->manager_score !== null) return (float) $task->manager_score;
        if ($task->measurement === 'target') {
            return (float) $task->target_value > 0 ? min((float) ($task->achieved_value ?? 0) / (float) $task->target_value * 100, 100) : 0.0;
        }

        return $task->status === 'completed' ? 100.0 : ($task->status === 'in_progress' ? 50.0 : 0.0);
    }

    private function scopeStaffToBranch($query, int $branchId): void
    {
        if ($branchId === 0) return;
        $query->where(function ($branchQuery) use ($branchId): void {
            $branchQuery->where('branch_id', $branchId)
                ->orWhere('branch_id', 0)
                ->orWhereIn('role', ['accountant', 'technician']);

            if (Schema::hasTable('user_branches')) {
                $branchQuery->orWhereExists(fn ($branches) => $branches->selectRaw('1')
                    ->from('user_branches')
                    ->whereColumn('user_branches.user_id', 'users.id')
                    ->where('user_branches.branch_id', $branchId));
            }
        });
    }

    private function normalizeAssignedUsers(Request $request): void
    {
        $tasks = $request->input('tasks');
        if (! is_array($tasks)) return;

        foreach ($tasks as &$task) {
            if (! is_array($task) || ! is_array($task['assigned_user_ids'] ?? null)) continue;
            $task['assigned_user_ids'] = array_values(array_unique($task['assigned_user_ids'], SORT_REGULAR));
        }
        unset($task);

        $request->merge(['tasks' => $tasks]);
    }

    private function branchLabel(int $branchId): string
    {
        return match ($branchId) {
            1 => 'Labadi',
            2 => 'Madina',
            default => 'Branch '.$branchId,
        };
    }

    private function isManager(Request $request): bool
    {
        return ($request->user()?->normalized_role ?? $request->user()?->role) === 'manager';
    }

    private function managerBranchId(Request $request): int
    {
        return (int) $request->input('branch_id', $request->query('branch_id', $request->user()?->branch_id ?? 0));
    }
}
