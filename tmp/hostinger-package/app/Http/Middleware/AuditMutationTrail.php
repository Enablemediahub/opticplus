<?php

namespace App\Http\Middleware;

use App\Support\AuditLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuditMutationTrail
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        AuditLog::recordMutation($request, $response);

        return $response;
    }
}
