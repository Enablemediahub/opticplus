<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class StaffPortalController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'staff_id' => ['required', 'string', 'max:20'],
            'password' => ['required', 'string', 'max:128'],
        ]);

        $staffId = mb_strtoupper(trim($validated['staff_id']));
        $account = DB::table('staff_portal_accounts')->where('staff_id', $staffId)->first();
        $genericFailure = response()->json(['message' => 'The staff ID or PIN is incorrect.'], 422);

        if (! $account) {
            return $genericFailure;
        }

        if ($account->locked_until && now()->lt($account->locked_until)) {
            return response()->json(['message' => 'Sign-in is temporarily locked. Try again later.'], 429);
        }

        if (! Hash::check($validated['password'], $account->password)) {
            $failures = (int) $account->failed_attempts + 1;
            DB::table('staff_portal_accounts')->where('id', $account->id)->update([
                'failed_attempts' => $failures >= 5 ? 0 : $failures,
                'locked_until' => $failures >= 5 ? now()->addMinutes(15) : null,
                'updated_at' => now(),
            ]);
            return $genericFailure;
        }

        $employee = DB::table('employees_comprehensive')
            ->where('id', $account->employee_id)
            ->where('staff_id', $staffId)
            ->where('status', 'active')
            ->first();

        if (! $employee) {
            return $genericFailure;
        }

        $token = Str::random(80);
        Cache::put($this->cacheKey($token), [
            'account_id' => (int) $account->id,
            'session_version' => (int) $account->session_version,
        ], now()->addHours(8));
        DB::table('staff_portal_accounts')->where('id', $account->id)->update([
            'failed_attempts' => 0,
            'locked_until' => null,
            'last_login_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'token' => $token,
            'must_change_password' => (bool) $account->must_change_password,
            'employee' => $this->serializeEmployee($employee),
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'must_change_password' => (bool) $request->attributes->get('staff_portal_account')->must_change_password,
            'employee' => $this->serializeEmployee($request->attributes->get('staff_portal_account')),
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $account = $request->attributes->get('staff_portal_account');
        $validated = $request->validate([
            'current_password' => ['required', 'string', 'max:128'],
            'password' => ['required', 'string', 'min:6', 'max:128', 'confirmed'],
        ]);
        $stored = DB::table('staff_portal_accounts')->where('id', $account->account_id)->first();

        if (! $stored || ! Hash::check($validated['current_password'], $stored->password)) {
            return response()->json(['message' => 'The current PIN or password is incorrect.'], 422);
        }

        DB::table('staff_portal_accounts')->where('id', $account->account_id)->update([
            'password' => Hash::make($validated['password']),
            'must_change_password' => false,
            'session_version' => DB::raw('session_version + 1'),
            'updated_at' => now(),
        ]);
        $version = (int) DB::table('staff_portal_accounts')->where('id', $account->account_id)->value('session_version');
        Cache::put($this->cacheKey($request->attributes->get('staff_portal_token')), [
            'account_id' => (int) $account->account_id,
            'session_version' => $version,
        ], now()->addHours(8));

        return response()->json(['message' => 'Your staff portal password has been updated.']);
    }

    public function provision(Request $request, int $employeeId): JsonResponse
    {
        $admin = $request->user();
        if (! $admin || ! in_array($admin->normalized_role, ['manager'], true)) {
            return response()->json(['message' => 'Only a General Manager can provision staff portal access.'], 403);
        }

        $employee = DB::table('employees_comprehensive')
            ->where('id', $employeeId)
            ->where('status', 'active')
            ->first();

        if (! $employee || ! $employee->staff_id) {
            return response()->json(['message' => 'An active employee with a staff ID is required.'], 422);
        }

        $existing = DB::table('staff_portal_accounts')->where('employee_id', $employee->id)->first();
        $accountData = [
            'staff_id' => mb_strtoupper(trim($employee->staff_id)),
            'password' => Hash::make('1234'),
            'must_change_password' => true,
            'failed_attempts' => 0,
            'locked_until' => null,
            'updated_at' => now(),
        ];
        if ($existing) {
            DB::table('staff_portal_accounts')->where('id', $existing->id)->update([
                ...$accountData,
                'session_version' => DB::raw('session_version + 1'),
            ]);
        } else {
            DB::table('staff_portal_accounts')->insert([
                ...$accountData,
                'employee_id' => $employee->id,
                'session_version' => 1,
                'created_at' => now(),
            ]);
        }

        return response()->json([
            'message' => 'Staff portal access was provisioned. Share the temporary PIN 1234 securely; the employee must change it at first sign-in.',
            'staff_id' => $employee->staff_id,
        ], 201);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->attributes->get('staff_portal_token');
        if ($token) {
            Cache::forget($this->cacheKey($token));
        }

        return response()->json(['message' => 'Signed out.']);
    }

    private function serializeEmployee(object $employee): array
    {
        return [
            'id' => (int) $employee->id,
            'staff_id' => $employee->staff_id,
            'name' => $employee->ghana_card_name,
            'job_title' => $employee->job_title,
            'department' => $employee->department,
            'branch' => $employee->branch,
            'branch_id' => $employee->branch_id ?? null,
            'email' => $employee->email,
            'phone' => $employee->phone_number,
            'date_employed' => $employee->date_employed,
            'photo_url' => ! empty($employee->photo_path) ? rtrim(config('app.url'), '/').'/'.ltrim($employee->photo_path, '/') : null,
        ];
    }

    private function cacheKey(string $token): string
    {
        return 'opticplus_staff_portal_token:'.$token;
    }
}
