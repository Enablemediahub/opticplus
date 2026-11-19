<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateStaffPortal
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        $session = $token ? Cache::get($this->cacheKey($token)) : null;

        if (! is_array($session) || empty($session['account_id'])) {
            return response()->json(['message' => 'Staff portal authentication is required.'], Response::HTTP_UNAUTHORIZED);
        }

        $account = DB::table('staff_portal_accounts as spa')
            ->join('employees_comprehensive as employee', 'employee.id', '=', 'spa.employee_id')
            ->where('spa.id', $session['account_id'])
            ->where('employee.status', 'active')
            ->select('spa.id as account_id', 'spa.staff_id', 'spa.must_change_password', 'spa.session_version', 'employee.*')
            ->first();

        if (! $account || (int) $session['session_version'] !== (int) $account->session_version) {
            Cache::forget($this->cacheKey($token));
            return response()->json(['message' => 'Staff portal account is unavailable.'], Response::HTTP_UNAUTHORIZED);
        }

        $request->attributes->set('staff_portal_token', $token);
        $request->attributes->set('staff_portal_account', $account);

        if ($account->must_change_password && ! in_array($request->route()?->getName(), ['staff.password.change', 'staff.logout'], true)) {
            return response()->json(['message' => 'Change your temporary PIN before using the staff portal.'], 423)
                ->header('Cache-Control', 'private, no-store, max-age=0');
        }

        $response = $next($request);
        $response->headers->set('Cache-Control', 'private, no-store, max-age=0');
        $response->headers->set('Pragma', 'no-cache');

        return $response;
    }

    private function cacheKey(string $token): string
    {
        return 'opticplus_staff_portal_token:'.$token;
    }
}
