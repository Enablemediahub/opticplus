<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ManagerController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $today = Carbon::today();
        $weekStart = $today->copy()->startOfWeek();
        $monthStart = $today->copy()->startOfMonth();
        $previousMonthStart = $monthStart->copy()->subMonth();
        $previousMonthEnd = $monthStart->copy()->subDay();

        $todaySales = (float) tap(DB::table('sales')->whereDate('date', $today), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount_paid');

        $todayInsuranceSales = (float) tap(DB::table('insurance_claims')->whereDate('date', $today), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount_paid');

        $todayPatients = (int) tap(DB::table('patient_records')->whereDate('created_at', $today), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count();

        $todayExpenses = (float) tap(DB::table('expenses')->whereDate('date', $today), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount');

        $activeStaffToday = (int) tap(DB::table('attendance')->whereDate('date', $today), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->distinct()->count('staff_id');

        $monthlySales = (float) tap(DB::table('sales')->whereBetween('date', [$monthStart->toDateString(), $today->toDateString()]), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount_paid');

        $monthlyPatients = (int) tap(DB::table('patient_records')->whereBetween(DB::raw('DATE(created_at)'), [$monthStart->toDateString(), $today->toDateString()]), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count();

        $monthlyExpenses = (float) tap(DB::table('expenses')->whereBetween('date', [$monthStart->toDateString(), $today->toDateString()]), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount');

        $previousSales = (float) tap(DB::table('sales')->whereBetween('date', [$previousMonthStart->toDateString(), $previousMonthEnd->toDateString()]), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount_paid');

        $previousPatients = (int) tap(DB::table('patient_records')->whereBetween(DB::raw('DATE(created_at)'), [$previousMonthStart->toDateString(), $previousMonthEnd->toDateString()]), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count();

        $previousExpenses = (float) tap(DB::table('expenses')->whereBetween('date', [$previousMonthStart->toDateString(), $previousMonthEnd->toDateString()]), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount');

        $pendingAppointments = (int) tap(DB::table('appointments')->where('status', 'pending'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count();

        $lowStockCount = (int) tap(DB::table('products')->where('stock', '<', 10), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count();

        $todayAttendance = tap(
            DB::table('attendance')
                ->whereDate('date', $today)
                ->orderByDesc('clock_in_time')
                ->limit(8),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->get([
                'id',
                'name',
                'staff_id',
                'clock_in_time',
                'clock_out_time',
                'location_verified',
            ]);

        $recentAppointments = tap(
            DB::table('appointments')
                ->whereDate('appointment_date', '>=', $today->copy()->subDays(7)->toDateString())
                ->orderByDesc('appointment_date')
                ->limit(6),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->get()
            ->map(fn ($item) => [
                'type' => 'Appointment',
                'ref_id' => 'Apt-'.$item->id,
                'name' => $item->name,
                'date' => $item->appointment_date,
                'status' => $item->status,
            ]);

        $recentPatients = tap(
            DB::table('patient_records')
                ->whereBetween(DB::raw('DATE(created_at)'), [$today->copy()->subDays(7)->toDateString(), $today->toDateString()])
                ->orderByDesc('created_at')
                ->limit(6),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )->get()
            ->map(fn ($item) => [
                'type' => 'Patient',
                'ref_id' => 'Pat-'.$item->id,
                'name' => trim($item->name ?: implode(' ', array_filter([$item->surname, $item->firstname, $item->othernames]))),
                'date' => Carbon::parse($item->created_at)->toDateString(),
                'status' => $item->status,
            ]);

        $recentOperations = $recentAppointments
            ->concat($recentPatients)
            ->sortByDesc('date')
            ->take(8)
            ->values();

        $weeklyPerformance = collect(range(0, 6))
            ->map(function (int $index) use ($weekStart, $branchId) {
                $date = $weekStart->copy()->addDays($index)->toDateString();

                return [
                    'label' => Carbon::parse($date)->format('D'),
                    'sales' => (float) tap(DB::table('sales')->whereDate('date', $date), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->sum('amount_paid'),
                    'patients' => (int) tap(DB::table('patient_records')->whereDate('created_at', $date), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count(),
                ];
            });

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => [
                'today_sales' => $todaySales,
                'today_insurance_sales' => $todayInsuranceSales,
                'today_sales_plus_insurance' => round($todaySales + $todayInsuranceSales, 2),
                'today_patients' => $todayPatients,
                'today_expenses' => $todayExpenses,
                'active_staff' => $activeStaffToday,
                'monthly_sales' => $monthlySales,
                'monthly_patients' => $monthlyPatients,
                'monthly_expenses' => $monthlyExpenses,
                'pending_appointments' => $pendingAppointments,
                'low_stock_count' => $lowStockCount,
            ],
            'changes' => [
                'sales' => $this->percentageChange($monthlySales, $previousSales),
                'patients' => $this->percentageChange($monthlyPatients, $previousPatients),
                'expenses' => $this->percentageChange($monthlyExpenses, $previousExpenses),
            ],
            'today_attendance' => $todayAttendance,
            'recent_operations' => $recentOperations,
            'weekly_performance' => $weeklyPerformance,
            'quick_links' => [
                ['title' => 'Patient Records', 'view' => 'Patients', 'note' => 'View and manage patient data'],
                ['title' => 'Staff Profiles', 'view' => 'Staff Profiles', 'note' => 'View employee records and attendance'],
                ['title' => 'Inventory', 'view' => 'Inventory', 'note' => 'Monitor stock levels and alerts'],
                ['title' => 'Billing', 'view' => 'Billing', 'note' => 'Review invoices and payment status'],
                ['title' => 'Revenue Tracking', 'view' => 'Revenue Tracking', 'note' => 'Track realized sales and insurance-inclusive revenue'],
                ['title' => 'Insurance Claims', 'view' => 'Insurance Claims', 'note' => 'Monitor insurer balances and settlement status'],
                ['title' => 'Users', 'view' => 'Users', 'note' => 'Manage portal access and permissions'],
            ],
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $search = trim($request->string('search')->toString());
        $role = trim($request->string('role')->toString());
        $status = trim($request->string('status')->toString());

        $query = DB::table('users');
        $this->applyBranchScope($query, 'branch_id', $branchId);

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $term = '%'.$search.'%';
                $inner->where('name', 'like', $term)
                    ->orWhere('username', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('phone', 'like', $term);
            });
        }

        if ($role !== '' && $role !== 'all') {
            $query->where('role', $role);
        }

        if ($status !== '' && $status !== 'all') {
            if ($status === 'inactive') {
                $query->where(function ($inner) {
                    $inner->where('employee_status', 'inactive')
                        ->orWhereNull('employee_status')
                        ->orWhere('employee_status', '');
                });
            } else {
                $query->where('employee_status', $status);
            }
        }

        $total = (clone $query)->count();

        $records = (clone $query)
            ->orderByDesc('id')
            ->limit($perPage)
            ->offset($offset)
            ->get();

        $enriched = $records->map(fn ($user) => $this->serializeManagedUser($user));

        $statsBase = DB::table('users');
        $this->applyBranchScope($statsBase, 'branch_id', $branchId);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => [
                'total' => (int) $statsBase->count(),
                'active' => (int) (clone $statsBase)->where('employee_status', 'active')->count(),
                'inactive' => (int) (clone $statsBase)->where(function ($query) {
                    $query->where('employee_status', 'inactive')
                        ->orWhereNull('employee_status')
                        ->orWhere('employee_status', '');
                })->count(),
            ],
            'roles' => tap(DB::table('users')->distinct()->orderBy('role'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->pluck('role'),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
            'records' => $enriched,
        ]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => [
                'required',
                'string',
                'max:255',
                Rule::unique('users', 'username')->where(fn ($query) => $query->where('branch_id', $branchId)),
            ],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', 'string', 'max:100'],
            'employee_status' => ['nullable', 'in:active,inactive'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email')->where(fn ($query) => $query->where('branch_id', $branchId)),
            ],
        ]);

        $userId = DB::table('users')->insertGetId([
            'name' => $validated['name'],
            'username' => $validated['username'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'employee_status' => $validated['employee_status'] ?? 'active',
            'phone' => $validated['phone'] ?? null,
            'email' => $validated['email'] ?? null,
            'branch_id' => $branchId,
            'branch' => $this->branchName($branchId),
            'profile_image' => 'default_profile.png',
        ]);

        $user = DB::table('users')->where('id', $userId)->first();

        return response()->json([
            'message' => 'User added successfully.',
            'record' => $this->serializeManagedUser($user),
        ], 201);
    }

    public function updateUser(Request $request, int $userId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        $user = DB::table('users')->where('id', $userId)->where('branch_id', $branchId)->first();

        abort_if(! $user, 404, 'User not found.');

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => [
                'required',
                'string',
                'max:255',
                Rule::unique('users', 'username')
                    ->ignore($userId)
                    ->where(fn ($query) => $query->where('branch_id', $branchId)),
            ],
            'role' => ['required', 'string', 'max:100'],
            'password' => ['nullable', 'string', 'min:8'],
            'employee_status' => ['nullable', 'in:active,inactive'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email')
                    ->ignore($userId)
                    ->where(fn ($query) => $query->where('branch_id', $branchId)),
            ],
            'profile_image' => ['nullable', 'image', 'max:4096'],
        ]);

        $updates = [
            'name' => $validated['name'],
            'username' => $validated['username'],
            'role' => $validated['role'],
            'employee_status' => $validated['employee_status'] ?? 'active',
            'phone' => $validated['phone'] ?? null,
            'email' => $validated['email'] ?? null,
            'branch' => $this->branchName($branchId),
        ];

        if (! empty($validated['password'])) {
            $updates['password'] = Hash::make($validated['password']);
        }

        if ($request->hasFile('profile_image')) {
            $profilePath = $this->storeUserProfileImage($request, $userId);

            if (! empty($user->profile_image) && str_starts_with((string) $user->profile_image, 'uploads/profile-images/')) {
                $existing = $this->publicAssetPath($user->profile_image);
                if (is_file($existing)) {
                    @unlink($existing);
                }
            }

            $updates['profile_image'] = $profilePath;
        }

        DB::table('users')->where('id', $userId)->update($updates);

        return response()->json([
            'message' => 'User updated successfully.',
            'record' => $this->serializeManagedUser(DB::table('users')->where('id', $userId)->first()),
        ]);
    }

    public function toggleUserStatus(Request $request, int $userId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        $user = DB::table('users')->where('id', $userId)->where('branch_id', $branchId)->first();

        abort_if(! $user, 404, 'User not found.');

        $nextStatus = ($user->employee_status ?? 'inactive') === 'active' ? 'inactive' : 'active';

        DB::table('users')->where('id', $userId)->update([
            'employee_status' => $nextStatus,
        ]);

        return response()->json([
            'message' => "User status changed to {$nextStatus}.",
            'record' => $this->serializeManagedUser(DB::table('users')->where('id', $userId)->first()),
        ]);
    }

    public function resetUserPassword(Request $request, int $userId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        $user = DB::table('users')->where('id', $userId)->where('branch_id', $branchId)->first();

        abort_if(! $user, 404, 'User not found.');

        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        DB::table('users')->where('id', $userId)->update([
            'password' => Hash::make($validated['password']),
        ]);

        return response()->json([
            'message' => 'Password reset successfully.',
            'record' => $this->serializeManagedUser(DB::table('users')->where('id', $userId)->first()),
        ]);
    }

    public function deleteUser(Request $request, int $userId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        abort_if((int) $request->user()->id === $userId, 422, 'You cannot delete your own account.');

        $deleted = DB::table('users')
            ->where('id', $userId)
            ->where('branch_id', $branchId)
            ->delete();

        abort_if(! $deleted, 404, 'User not found.');

        return response()->json([
            'message' => 'User deleted successfully.',
        ]);
    }

    public function employees(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $search = trim($request->string('search')->toString());
        $department = trim($request->string('department')->toString());
        $status = trim($request->string('status')->toString());

        $query = DB::table('employees_comprehensive');
        $this->applyBranchScope($query, 'branch_id', $branchId);

        if ($search !== '') {
            $term = '%'.$search.'%';
            $query->where(function ($inner) use ($term) {
                $inner->where('ghana_card_name', 'like', $term)
                    ->orWhere('staff_id', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('phone_number', 'like', $term)
                    ->orWhere('job_title', 'like', $term);
            });
        }

        if ($department !== '' && $department !== 'all') {
            $query->where('department', $department);
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        $total = (clone $query)->count();
        $records = (clone $query)
            ->orderByDesc('id')
            ->limit($perPage)
            ->offset($offset)
            ->get();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => [
                'total' => (int) tap(DB::table('employees_comprehensive'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count(),
                'active' => (int) tap(DB::table('employees_comprehensive')->where('status', 'active'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count(),
                'departments' => (int) tap(DB::table('employees_comprehensive')->distinct(), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->count('department'),
            ],
            'departments' => tap(DB::table('employees_comprehensive')
                ->whereNotNull('department')
                ->where('department', '!=', '')
                ->distinct()
                ->orderBy('department'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->pluck('department'),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
            'records' => $records->map(fn ($employee) => $this->serializeEmployee($employee)),
        ]);
    }

    public function employeeDetail(Request $request, int $employeeId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $employee = tap(
            DB::table('employees_comprehensive')->where('id', $employeeId),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )
            ->first();

        abort_if(! $employee, 404, 'Employee not found.');

        $attendance = tap(
            DB::table('attendance'),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )
            ->where(function ($query) use ($employee) {
                $query->where('staff_id', $employee->staff_id)
                    ->orWhere('name', $employee->ghana_card_name);
            })
            ->orderByDesc('date')
            ->limit(10)
            ->get();

        $linkedUser = $this->findLinkedUserForEmployee($employee);

        return response()->json([
            'employee' => $this->serializeEmployee($employee),
            'linked_user' => $linkedUser ? $this->serializeManagedUser($linkedUser) : null,
            'attendance' => $attendance,
        ]);
    }

    public function updateEmployee(Request $request, int $employeeId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $employee = DB::table('employees_comprehensive')
            ->where('id', $employeeId)
            ->where('branch_id', $branchId)
            ->first();

        abort_if(! $employee, 404, 'Employee not found.');

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'job_title' => ['nullable', 'string', 'max:255'],
            'department' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'in:active,inactive'],
            'branch' => ['nullable', 'string', 'max:100'],
            'date_employed' => ['nullable', 'date'],
            'ssnit_number' => ['nullable', 'string', 'max:100'],
            'tin_number' => ['nullable', 'string', 'max:100'],
            'salary' => ['nullable', 'numeric'],
            'qualification' => ['nullable', 'string', 'max:255'],
            'institution' => ['nullable', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'max:4096'],
        ]);

        $updates = [
            'ghana_card_name' => $validated['name'],
            'email' => $validated['email'] ?? null,
            'phone_number' => $validated['phone'] ?? null,
            'job_title' => $validated['job_title'] ?? null,
            'department' => $validated['department'] ?? null,
            'status' => $validated['status'] ?? 'active',
            'branch' => $validated['branch'] ?? $employee->branch ?? $this->branchName($branchId),
            'date_employed' => $validated['date_employed'] ?? null,
            'ssnit_number' => $validated['ssnit_number'] ?? null,
            'tin_number' => $validated['tin_number'] ?? null,
            'salary' => array_key_exists('salary', $validated) ? $validated['salary'] : null,
            'highest_qualification' => $validated['qualification'] ?? null,
            'institution' => $validated['institution'] ?? null,
        ];

        if ($request->hasFile('photo')) {
            $photoPath = $this->storeEmployeePhoto($request, $employeeId);

            if (! empty($employee->photo_path) && str_starts_with((string) $employee->photo_path, 'uploads/staff-profiles/')) {
                $existing = $this->publicAssetPath($employee->photo_path);
                if (is_file($existing)) {
                    @unlink($existing);
                }
            }

            $updates['photo_path'] = $photoPath;
        }

        DB::table('employees_comprehensive')
            ->where('id', $employeeId)
            ->update($updates);

        $freshEmployee = DB::table('employees_comprehensive')->where('id', $employeeId)->first();
        $attendance = tap(
            DB::table('attendance'),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )
            ->where(function ($query) use ($freshEmployee) {
                $query->where('staff_id', $freshEmployee->staff_id)
                    ->orWhere('name', $freshEmployee->ghana_card_name);
            })
            ->orderByDesc('date')
            ->limit(10)
            ->get();

        $linkedUser = $this->findLinkedUserForEmployee($freshEmployee);

        return response()->json([
            'message' => 'Staff profile updated successfully.',
            'employee' => $this->serializeEmployee($freshEmployee),
            'linked_user' => $linkedUser ? $this->serializeManagedUser($linkedUser) : null,
            'attendance' => $attendance,
        ]);
    }

    private function serializeManagedUser(object $user): array
    {
        $employee = $this->findEmployeeForUser($user);
        $profilePath = $user->profile_image ?: $employee?->photo_path;

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'role' => $user->role,
            'employee_status' => $user->employee_status ?: 'inactive',
            'phone' => $user->phone,
            'email' => $user->email,
            'branch' => $user->branch ?: $this->branchName((int) $user->branch_id),
            'branch_id' => (int) $user->branch_id,
            'profile_image' => $user->profile_image,
            'profile_image_url' => $this->buildPublicAssetUrl($profilePath),
            'staff_id' => $employee?->staff_id,
            'job_title' => $employee?->job_title,
            'department' => $employee?->department,
        ];
    }

    private function serializeEmployee(object $employee): array
    {
        return [
            'id' => $employee->id,
            'staff_id' => $employee->staff_id,
            'name' => $employee->ghana_card_name,
            'email' => $employee->email,
            'phone' => $employee->phone_number,
            'job_title' => $employee->job_title,
            'department' => $employee->department,
            'branch' => $employee->branch,
            'branch_id' => $employee->branch_id,
            'status' => $employee->status,
            'date_employed' => $employee->date_employed ?? null,
            'salary' => $employee->salary ?? null,
            'ssnit_number' => $employee->ssnit_number ?? null,
            'tin_number' => $employee->tin_number ?? null,
            'photo_url' => $employee->photo_path ? rtrim(config('app.url'), '/').'/'.ltrim($employee->photo_path, '/') : null,
            'qualification' => $employee->highest_qualification ?? null,
            'institution' => $employee->institution ?? null,
        ];
    }

    private function findEmployeeForUser(object $user): ?object
    {
        $candidates = [
            ['email', $user->email ? mb_strtolower(trim($user->email)) : null],
            ['email', $user->username ? mb_strtolower(trim($user->username)) : null],
            ['phone_number', $this->normalizePhone($user->phone)],
            ['ghana_card_name', $user->name ? mb_strtolower(trim($user->name)) : null],
        ];

        foreach ($candidates as [$column, $value]) {
            if (! $value) {
                continue;
            }

            $match = DB::table('employees_comprehensive')
                ->where('branch_id', $user->branch_id)
                ->when(
                    $column === 'phone_number',
                    fn ($query) => $query->whereRaw("REPLACE(REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '(', ''), ')', '') = ?", [$value]),
                    fn ($query) => $query->whereRaw("LOWER({$column}) = ?", [$value]),
                )
                ->first();

            if ($match) {
                return $match;
            }
        }

        return null;
    }

    private function findLinkedUserForEmployee(object $employee): ?object
    {
        $phone = $this->normalizePhone($employee->phone_number);

        return DB::table('users')
            ->where('branch_id', $employee->branch_id)
            ->where(function ($query) use ($employee, $phone) {
                if ($employee->email) {
                    $query->orWhereRaw('LOWER(email) = ?', [mb_strtolower(trim($employee->email))]);
                    $query->orWhereRaw('LOWER(username) = ?', [mb_strtolower(trim($employee->email))]);
                }

                if ($phone) {
                    $query->orWhereRaw("REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?", [$phone]);
                }

                $query->orWhereRaw('LOWER(name) = ?', [mb_strtolower(trim($employee->ghana_card_name))]);
            })
            ->first();
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();
        $requestedBranchId = (int) $request->integer('branch_id');

        return $user->isAdmin()
            ? (($requestedBranchId >= 0) ? $requestedBranchId : (int) ($user->branch_id ?: 1))
            : (int) $user->branch_id;
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
            'message' => 'Merged mode is read-only. Switch to a branch before changing users or access settings.',
        ], 422);
    }

    private function percentageChange(float|int $current, float|int $previous): float
    {
        if ((float) $previous === 0.0) {
            return 0;
        }

        return round(((($current - $previous) / $previous) * 100), 1);
    }

    private function normalizePhone(?string $phone): ?string
    {
        if (! $phone) {
            return null;
        }

        return preg_replace('/\D+/', '', $phone) ?: null;
    }

    private function storeEmployeePhoto(Request $request, int $employeeId): string
    {
        $file = $request->file('photo');
        $directory = $this->publicAssetPath('uploads/staff-profiles');

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $filename = 'staff_'.$employeeId.'_'.time().'.'.$file->getClientOriginalExtension();
        $file->move($directory, $filename);

        return 'uploads/staff-profiles/'.$filename;
    }

    private function storeUserProfileImage(Request $request, int $userId): string
    {
        $file = $request->file('profile_image');
        $directory = $this->publicAssetPath('uploads/profile-images');

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $filename = 'profile_'.$userId.'_'.time().'.'.$file->getClientOriginalExtension();
        $file->move($directory, $filename);

        return 'uploads/profile-images/'.$filename;
    }

    private function buildPublicAssetUrl(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        if (Str::startsWith($path, ['http://', 'https://'])) {
            return $path;
        }

        return rtrim(config('app.url'), '/').'/'.ltrim($path, '/');
    }

    private function publicAssetPath(string $relativePath): string
    {
        $relativePath = ltrim($relativePath, '/\\');
        $productionWebRoot = base_path('public_html');

        $webRoot = is_dir($productionWebRoot)
            ? $productionWebRoot
            : public_path();

        return $webRoot.DIRECTORY_SEPARATOR.str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath);
    }
}
