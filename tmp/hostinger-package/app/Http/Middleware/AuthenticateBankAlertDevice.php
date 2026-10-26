<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateBankAlertDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token || ! preg_match('/^[A-Za-z0-9_]{40,100}$/', $token)) {
            return response()->json(['message' => 'A valid bank-alert device token is required.'], 401);
        }

        $device = DB::table('bank_sms_devices')
            ->where('token_hash', hash('sha256', $token))
            ->whereNull('revoked_at')
            ->first();
        if (! $device) {
            return response()->json(['message' => 'The bank-alert device token is invalid or revoked.'], 401);
        }

        $request->attributes->set('bank_alert_device_id', (int) $device->id);

        return $next($request);
    }
}
