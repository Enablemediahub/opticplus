<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Symfony\Component\HttpFoundation\Response;

class AuditLog
{
    public static function ensureTable(): void
    {
        if (Schema::hasTable('audit_logs')) {
            self::ensureIdAutoIncrement();
            return;
        }

        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('user_name', 255)->nullable();
            $table->string('user_role', 100)->nullable();
            $table->unsignedInteger('branch_id')->nullable();
            $table->string('branch_name', 120)->nullable();
            $table->string('action_type', 40);
            $table->string('http_method', 12);
            $table->string('entity_type', 120)->nullable();
            $table->string('target_identifier', 255)->nullable();
            $table->string('route_uri', 255)->nullable();
            $table->string('request_path', 255)->nullable();
            $table->string('summary', 255)->nullable();
            $table->longText('payload_json')->nullable();
            $table->unsignedSmallInteger('response_status')->default(200);
            $table->timestamp('created_at')->useCurrent();
        });
    }

    private static function ensureIdAutoIncrement(): void
    {
        $column = DB::selectOne("
            SELECT EXTRA
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'audit_logs'
              AND COLUMN_NAME = 'id'
        ");

        if (! str_contains(strtolower((string) ($column->EXTRA ?? '')), 'auto_increment')) {
            DB::statement('ALTER TABLE audit_logs MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT');
        }
    }

    public static function recordMutation(Request $request, Response $response): void
    {
        if (! self::shouldRecord($request, $response)) {
            return;
        }

        $actionType = self::resolveActionType($request);
        if (! $actionType) {
            return;
        }

        self::ensureTable();

        $user = $request->user();
        $route = $request->route();
        $routeUri = $route?->uri() ?? trim($request->path(), '/');
        $entityType = self::resolveEntityType($routeUri, $route?->parameters() ?? []);
        $targetIdentifier = self::resolveTargetIdentifier($route?->parameters() ?? []);
        $branchId = self::resolveBranchId($request);
        $payload = self::sanitizePayload($request->all());

        DB::table('audit_logs')->insert([
            'user_id' => $user?->id,
            'user_name' => $user?->name,
            'user_role' => $user?->normalized_role ?? $user?->role,
            'branch_id' => $branchId,
            'branch_name' => $user?->branch,
            'action_type' => $actionType,
            'http_method' => strtoupper($request->method()),
            'entity_type' => $entityType,
            'target_identifier' => $targetIdentifier,
            'route_uri' => $routeUri,
            'request_path' => trim($request->path(), '/'),
            'summary' => self::buildSummary($actionType, $entityType, $targetIdentifier),
            'payload_json' => $payload ? json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null,
            'response_status' => $response->getStatusCode(),
            'created_at' => now(),
        ]);
    }

    public static function logManual(
        Request $request,
        string $actionType,
        ?string $entityType = null,
        ?string $targetIdentifier = null,
        array $payload = [],
        int $responseStatus = 200
    ): void {
        $user = $request->user();
        if (! $user) {
            return;
        }

        self::ensureTable();

        $route = $request->route();
        $routeUri = $route?->uri() ?? trim($request->path(), '/');

        DB::table('audit_logs')->insert([
            'user_id' => $user?->id,
            'user_name' => $user?->name,
            'user_role' => $user?->normalized_role ?? $user?->role,
            'branch_id' => self::resolveBranchId($request),
            'branch_name' => $user?->branch,
            'action_type' => $actionType,
            'http_method' => strtoupper($request->method()),
            'entity_type' => $entityType,
            'target_identifier' => $targetIdentifier,
            'route_uri' => $routeUri,
            'request_path' => trim($request->path(), '/'),
            'summary' => self::buildSummary($actionType, $entityType, $targetIdentifier),
            'payload_json' => $payload ? json_encode(self::sanitizePayload($payload), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null,
            'response_status' => $responseStatus,
            'created_at' => now(),
        ]);
    }

    private static function shouldRecord(Request $request, Response $response): bool
    {
        $method = strtoupper($request->method());
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return false;
        }

        $status = $response->getStatusCode();
        if ($status < 200 || $status >= 400) {
            return false;
        }

        return (bool) $request->user();
    }

    private static function resolveActionType(Request $request): ?string
    {
        $method = strtoupper($request->method());
        $routeUri = $request->route()?->uri() ?? '';

        if ($method === 'DELETE') {
            return 'delete';
        }

        if (in_array($method, ['PUT', 'PATCH'], true)) {
            return 'edit';
        }

        if ($method !== 'POST') {
            return null;
        }

        return preg_match('/(update|review|decision|toggle|reset-password|mark-|picked-up|ready|assign-|process|restructure|balance|deposits)/i', $routeUri)
            ? 'edit'
            : null;
    }

    private static function resolveEntityType(?string $routeUri, array $routeParameters): ?string
    {
        if (! empty($routeParameters['resource'])) {
            return str_replace('-', '_', (string) $routeParameters['resource']);
        }

        $segments = array_values(array_filter(explode('/', preg_replace('/\{[^}]+\}/', '', (string) $routeUri) ?? '')));
        if ($segments && $segments[0] === 'v1') {
            array_shift($segments);
        }

        $ignored = ['manager', 'finance', 'insurance', 'inventory', 'customer-service', 'payroll', 'reports', 'messages'];
        $actionSegments = ['mark-paid', 'mark-pending', 'toggle-status', 'reset-password', 'picked-up', 'ready', 'update', 'review', 'decision', 'push'];
        $candidate = null;

        foreach ($segments as $segment) {
            if (in_array($segment, $ignored, true) || in_array($segment, $actionSegments, true)) {
                continue;
            }

            $candidate = $segment;
            break;
        }

        return $candidate ? str_replace('-', '_', $candidate) : null;
    }

    private static function resolveTargetIdentifier(array $routeParameters): ?string
    {
        $pairs = [];

        foreach ($routeParameters as $key => $value) {
            if ($key === 'resource') {
                continue;
            }

            if (is_scalar($value) && (string) $value !== '') {
                $pairs[] = $key.': '.(string) $value;
            }
        }

        return $pairs ? implode(', ', $pairs) : null;
    }

    private static function resolveBranchId(Request $request): ?int
    {
        $branchId = $request->input('branch_id');
        if ($branchId !== null && $branchId !== '') {
            return (int) $branchId;
        }

        return $request->user()?->branch_id ? (int) $request->user()->branch_id : null;
    }

    private static function buildSummary(string $actionType, ?string $entityType, ?string $targetIdentifier): string
    {
        $parts = [ucfirst(str_replace('_', ' ', $actionType))];

        if ($entityType) {
            $parts[] = str_replace('_', ' ', $entityType);
        }

        $summary = implode(' ', $parts);

        if ($targetIdentifier) {
            $summary .= ' ('.$targetIdentifier.')';
        }

        return $summary;
    }

    private static function sanitizePayload(mixed $value, ?string $key = null): mixed
    {
        $normalizedKey = strtolower((string) $key);
        if (in_array($normalizedKey, ['password', 'password_confirmation', 'current_password', 'token'], true)) {
            return '[redacted]';
        }

        if ($value instanceof UploadedFile) {
            return [
                'file_name' => $value->getClientOriginalName(),
                'size' => $value->getSize(),
            ];
        }

        if (is_array($value)) {
            $sanitized = [];
            foreach ($value as $childKey => $childValue) {
                $sanitized[$childKey] = self::sanitizePayload($childValue, (string) $childKey);
            }

            return $sanitized;
        }

        return $value;
    }
}
