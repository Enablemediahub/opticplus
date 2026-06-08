<?php

namespace App\Http\Controllers;

use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = strtolower(trim((string) ($user?->normalized_role ?? $user?->role)));

        if ($role !== 'manager' && ! ($user?->is_admin ?? false)) {
            return response()->json([
                'message' => 'Only the General Manager can access the audit log.',
            ], 403);
        }

        AuditLog::ensureTable();

        $perPage = min(max((int) $request->integer('per_page', 15), 10), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $search = trim((string) $request->input('search', ''));
        $actionType = trim((string) $request->input('action_type', 'all'));
        $branchId = $user?->isAdmin()
            ? (int) $request->integer('branch_id', 0)
            : (int) ($user?->branch_id ?? 0);

        $query = DB::table('audit_logs')
            ->when($branchId > 0, fn ($builder) => $builder->where('branch_id', $branchId))
            ->when($actionType && $actionType !== 'all', fn ($builder) => $builder->where('action_type', $actionType))
            ->when($search !== '', function ($builder) use ($search): void {
                $builder->where(function ($nested) use ($search): void {
                    $like = '%'.$search.'%';
                    $nested->where('user_name', 'like', $like)
                        ->orWhere('user_role', 'like', $like)
                        ->orWhere('entity_type', 'like', $like)
                        ->orWhere('target_identifier', 'like', $like)
                        ->orWhere('route_uri', 'like', $like)
                        ->orWhere('summary', 'like', $like);
                });
            });

        $total = (clone $query)->count();
        $records = $query
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($perPage)
            ->offset($offset)
            ->get()
            ->map(function ($record) {
                $record->payload = $record->payload_json ? json_decode($record->payload_json, true) : null;

                return $record;
            })
            ->values();

        return response()->json([
            'records' => $records,
            'filters' => [
                'search' => $search,
                'action_type' => $actionType,
                'branch_id' => $branchId,
            ],
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
            'branch_name' => $branchId > 0
                ? ($user?->branch ?? 'Active branch')
                : 'Merged',
        ]);
    }
}
