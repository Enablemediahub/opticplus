<?php

namespace App\Http\Controllers;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ExecutiveReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->ensureReportWorkflowTables();

        $branchId = $this->resolveBranchId($request);
        $user = $request->user();
        $role = $this->normalizedRole($user);
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 50);

        $workspaceQuery = $this->reportQuery($branchId);
        $this->applyRoleVisibility($workspaceQuery, $user);

        $records = (clone $workspaceQuery)
            ->orderByRaw("
                CASE
                    WHEN r.status = 'submitted' THEN 0
                    WHEN r.status = 'validated' THEN 1
                    WHEN r.status = 'pushed_to_ceo' THEN 2
                    ELSE 3
                END
            ")
            ->orderByDesc('r.created_at')
            ->limit($perPage)
            ->get($this->reportSelectColumns())
            ->map(fn ($report) => $this->serializeReport($report));

        $pendingValidation = collect();
        $validatedReports = collect();
        $ceoInbox = collect();

        if ($role === 'manager' || $user->isAdmin()) {
            $pendingValidation = $this->reportQuery($branchId)
                ->where('r.status', 'submitted')
                ->orderByDesc('r.created_at')
                ->limit(8)
                ->get($this->reportSelectColumns())
                ->map(fn ($report) => $this->serializeReport($report));

            $validatedReports = $this->reportQuery($branchId)
                ->whereIn('r.status', ['validated', 'pushed_to_ceo', 'rejected'])
                ->orderByDesc('r.updated_at')
                ->limit(8)
                ->get($this->reportSelectColumns())
                ->map(fn ($report) => $this->serializeReport($report));
        }

        if (in_array($role, ['ceo', 'director'], true)) {
            $ceoInbox = $this->reportQuery($branchId)
                ->where('r.status', 'pushed_to_ceo')
                ->orderByDesc('r.pushed_to_ceo_at')
                ->limit(12)
                ->get($this->reportSelectColumns())
                ->map(fn ($report) => $this->serializeReport($report));
        }

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'role' => $role,
            'stats' => [
                'submitted' => (int) (clone $workspaceQuery)->where('r.status', 'submitted')->count('r.id'),
                'validated' => (int) (clone $workspaceQuery)->where('r.status', 'validated')->count('r.id'),
                'pushed_to_ceo' => (int) (clone $workspaceQuery)->where('r.status', 'pushed_to_ceo')->count('r.id'),
                'rejected' => (int) (clone $workspaceQuery)->where('r.status', 'rejected')->count('r.id'),
            ],
            'reports' => $records,
            'pending_validation' => $pendingValidation,
            'validated_reports' => $validatedReports,
            'ceo_inbox' => $ceoInbox,
        ]);
    }

    public function show(Request $request, int $reportId): JsonResponse
    {
        $this->ensureReportWorkflowTables();

        $branchId = $this->resolveBranchId($request);
        $user = $request->user();
        $report = $this->reportQuery($branchId)
            ->where('r.id', $reportId)
            ->first($this->reportSelectColumns());

        if (! $report) {
            return response()->json(['message' => 'Report submission not found.'], 404);
        }

        if (! $this->canViewReport($report, $user)) {
            return response()->json(['message' => 'You do not have access to this report submission.'], 403);
        }

        $approvalTrail = DB::table('financial_report_approvals')
            ->where('report_id', $reportId)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($row) => [
                'id' => $row->id,
                'approver_name' => $row->approver_name,
                'approver_role' => $row->approver_role,
                'action' => $row->action,
                'notes' => $row->notes,
                'signature_path' => $row->signature_path,
                'signature_url' => $this->buildPublicAssetUrl($row->signature_path),
                'created_at' => $row->created_at,
            ]);

        return response()->json([
            'report' => $this->serializeReport($report),
            'payload' => $this->decodePayload($report->payload_json),
            'approvals' => $approvalTrail,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureReportWorkflowTables();

        $user = $request->user();
        $role = $this->normalizedRole($user);
        if (! in_array($role, ['accountant'], true) && ! $user->isAdmin()) {
            return response()->json(['message' => 'Only the accountant can submit a final report for validation.'], 403);
        }

        $validated = $request->validate([
            'branch_id' => ['required', 'integer'],
            'title' => ['required', 'string', 'max:255'],
            'report_type' => ['required', 'string', 'max:50'],
            'month' => ['required', 'string', 'max:20'],
            'comparison_branch_id' => ['nullable', 'integer'],
            'comparison_month' => ['nullable', 'string', 'max:20'],
            'accountant_notes' => ['nullable', 'string'],
            'payload_json' => ['required', 'string'],
            'accountant_signature' => ['required', 'image', 'max:4096'],
        ]);

        $branchId = $this->sanitizeBranchId((int) $validated['branch_id']);
        $signaturePath = $this->storeUpload($request->file('accountant_signature'), 'report-signatures', 'accountant_'.$user->id);

        $comparisonBranchId = array_key_exists('comparison_branch_id', $validated) && $validated['comparison_branch_id'] !== null
            ? $this->sanitizeBranchId((int) $validated['comparison_branch_id'])
            : null;

        $reportId = DB::table('financial_reports')->insertGetId([
            'branch_id' => $branchId,
            'title' => trim($validated['title']),
            'report_type' => trim($validated['report_type']),
            'month' => trim($validated['month']),
            'comparison_branch_id' => $comparisonBranchId,
            'comparison_month' => trim((string) ($validated['comparison_month'] ?? '')) ?: null,
            'prepared_by_name' => $user->name,
            'prepared_by_id' => $user->id,
            'prepared_by_role' => $role,
            'status' => 'submitted',
            'accountant_notes' => trim((string) ($validated['accountant_notes'] ?? '')) ?: null,
            'accountant_signature' => $signaturePath,
            'payload_json' => $validated['payload_json'],
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('financial_report_approvals')->insert([
            'report_id' => $reportId,
            'approver_id' => $user->id,
            'approver_name' => $user->name,
            'approver_role' => $role,
            'action' => 'submitted',
            'notes' => trim((string) ($validated['accountant_notes'] ?? '')) ?: 'Submitted to General Manager for validation.',
            'signature_path' => $signaturePath,
            'created_at' => now(),
        ]);

        return response()->json([
            'message' => 'Final report submitted to the General Manager for validation.',
            'report_id' => $reportId,
        ], 201);
    }

    public function review(Request $request, int $reportId): JsonResponse
    {
        $this->ensureReportWorkflowTables();

        $user = $request->user();
        $role = $this->normalizedRole($user);
        if ($role !== 'manager' && ! $user->isAdmin()) {
            return response()->json(['message' => 'Only the General Manager can validate or reject submitted reports.'], 403);
        }

        $validated = $request->validate([
            'decision' => ['required', 'in:validated,rejected'],
            'gm_notes' => ['nullable', 'string'],
            'gm_signature' => ['required', 'image', 'max:4096'],
        ]);

        $report = DB::table('financial_reports')->where('id', $reportId)->first();
        if (! $report) {
            return response()->json(['message' => 'Report submission not found.'], 404);
        }

        $signaturePath = $this->storeUpload($request->file('gm_signature'), 'report-signatures', 'gm_'.$user->id);
        $decision = $validated['decision'];

        DB::table('financial_reports')
            ->where('id', $reportId)
            ->update([
                'status' => $decision,
                'gm_notes' => trim((string) ($validated['gm_notes'] ?? '')) ?: null,
                'gm_signature' => $signaturePath,
                'validated_by_name' => $user->name,
                'validated_by_id' => $user->id,
                'validated_at' => now(),
                'updated_at' => now(),
            ]);

        DB::table('financial_report_approvals')->insert([
            'report_id' => $reportId,
            'approver_id' => $user->id,
            'approver_name' => $user->name,
            'approver_role' => $role,
            'action' => $decision,
            'notes' => trim((string) ($validated['gm_notes'] ?? '')) ?: ($decision === 'validated' ? 'Validated by General Manager.' : 'Rejected by General Manager.'),
            'signature_path' => $signaturePath,
            'created_at' => now(),
        ]);

        return response()->json([
            'message' => $decision === 'validated'
                ? 'Report validated successfully. You can now push it to the CEO.'
                : 'Report rejected and returned to the accountant.',
        ]);
    }

    public function pushToCeo(Request $request, int $reportId): JsonResponse
    {
        $this->ensureReportWorkflowTables();

        $user = $request->user();
        $role = $this->normalizedRole($user);
        if ($role !== 'manager' && ! $user->isAdmin()) {
            return response()->json(['message' => 'Only the General Manager can push validated reports to the CEO.'], 403);
        }

        $validated = $request->validate([
            'push_notes' => ['nullable', 'string'],
        ]);

        $report = DB::table('financial_reports')->where('id', $reportId)->first();
        if (! $report) {
            return response()->json(['message' => 'Report submission not found.'], 404);
        }

        if ($report->status !== 'validated') {
            return response()->json(['message' => 'Only validated reports can be pushed to the CEO.'], 422);
        }

        DB::table('financial_reports')
            ->where('id', $reportId)
            ->update([
                'status' => 'pushed_to_ceo',
                'pushed_to_ceo_by_name' => $user->name,
                'pushed_to_ceo_by_id' => $user->id,
                'pushed_to_ceo_at' => now(),
                'updated_at' => now(),
            ]);

        DB::table('financial_report_approvals')->insert([
            'report_id' => $reportId,
            'approver_id' => $user->id,
            'approver_name' => $user->name,
            'approver_role' => $role,
            'action' => 'pushed_to_ceo',
            'notes' => trim((string) ($validated['push_notes'] ?? '')) ?: 'Validated report pushed to the CEO.',
            'signature_path' => $report->gm_signature,
            'created_at' => now(),
        ]);

        return response()->json([
            'message' => 'Validated report pushed to the CEO successfully.',
        ]);
    }

    private function reportQuery(int $branchId)
    {
        $query = DB::table('financial_reports as r');
        $this->applyBranchScope($query, 'r.branch_id', $branchId);

        return $query;
    }

    private function reportSelectColumns(): array
    {
        return [
            'r.id',
            'r.branch_id',
            'r.title',
            'r.report_type',
            'r.month',
            'r.comparison_branch_id',
            'r.comparison_month',
            'r.prepared_by_name',
            'r.prepared_by_id',
            'r.prepared_by_role',
            'r.status',
            'r.accountant_notes',
            'r.accountant_signature',
            'r.gm_notes',
            'r.gm_signature',
            'r.validated_by_name',
            'r.validated_by_id',
            'r.validated_at',
            'r.pushed_to_ceo_by_name',
            'r.pushed_to_ceo_by_id',
            'r.pushed_to_ceo_at',
            'r.payload_json',
            'r.created_at',
            'r.updated_at',
        ];
    }

    private function serializeReport(object $report): array
    {
        return [
            'id' => (int) $report->id,
            'branch_id' => (int) $report->branch_id,
            'branch_name' => $this->branchName((int) $report->branch_id),
            'title' => $report->title,
            'report_type' => $report->report_type,
            'month' => $report->month,
            'comparison_branch_id' => $report->comparison_branch_id !== null ? (int) $report->comparison_branch_id : null,
            'comparison_branch_name' => $report->comparison_branch_id !== null ? $this->branchName((int) $report->comparison_branch_id) : null,
            'comparison_month' => $report->comparison_month,
            'prepared_by_name' => $report->prepared_by_name,
            'prepared_by_id' => $report->prepared_by_id ? (int) $report->prepared_by_id : null,
            'prepared_by_role' => $report->prepared_by_role,
            'status' => $report->status,
            'accountant_notes' => $report->accountant_notes,
            'accountant_signature_url' => $this->buildPublicAssetUrl($report->accountant_signature),
            'gm_notes' => $report->gm_notes,
            'gm_signature_url' => $this->buildPublicAssetUrl($report->gm_signature),
            'validated_by_name' => $report->validated_by_name,
            'validated_by_id' => $report->validated_by_id ? (int) $report->validated_by_id : null,
            'validated_at' => $report->validated_at,
            'pushed_to_ceo_by_name' => $report->pushed_to_ceo_by_name,
            'pushed_to_ceo_by_id' => $report->pushed_to_ceo_by_id ? (int) $report->pushed_to_ceo_by_id : null,
            'pushed_to_ceo_at' => $report->pushed_to_ceo_at,
            'created_at' => $report->created_at,
            'updated_at' => $report->updated_at,
        ];
    }

    private function canViewReport(object $report, object $user): bool
    {
        $role = $this->normalizedRole($user);
        if ($user->isAdmin() || $role === 'manager') {
            return true;
        }

        if ($role === 'accountant') {
            return (int) $report->prepared_by_id === (int) $user->id;
        }

        if (in_array($role, ['ceo', 'director'], true)) {
            return $report->status === 'pushed_to_ceo';
        }

        return false;
    }

    private function applyRoleVisibility($query, object $user): void
    {
        $role = $this->normalizedRole($user);

        if ($user->isAdmin() || $role === 'manager') {
            return;
        }

        if ($role === 'accountant') {
            $query->where('r.prepared_by_id', $user->id);
            return;
        }

        if (in_array($role, ['ceo', 'director'], true)) {
            $query->where('r.status', 'pushed_to_ceo');
            return;
        }

        $query->whereRaw('1 = 0');
    }

    private function ensureReportWorkflowTables(): void
    {
        if (! Schema::hasTable('financial_reports')) {
            Schema::create('financial_reports', function (Blueprint $table): void {
                $table->id();
                $table->unsignedInteger('branch_id')->default(1)->index();
                $table->string('title');
                $table->string('report_type', 50);
                $table->string('month', 20);
                $table->unsignedInteger('comparison_branch_id')->nullable();
                $table->string('comparison_month', 20)->nullable();
                $table->string('prepared_by_name');
                $table->unsignedBigInteger('prepared_by_id')->nullable()->index();
                $table->string('prepared_by_role', 50);
                $table->enum('status', ['submitted', 'validated', 'rejected', 'pushed_to_ceo'])->default('submitted')->index();
                $table->text('accountant_notes')->nullable();
                $table->string('accountant_signature')->nullable();
                $table->text('gm_notes')->nullable();
                $table->string('gm_signature')->nullable();
                $table->string('validated_by_name')->nullable();
                $table->unsignedBigInteger('validated_by_id')->nullable()->index();
                $table->timestamp('validated_at')->nullable();
                $table->string('pushed_to_ceo_by_name')->nullable();
                $table->unsignedBigInteger('pushed_to_ceo_by_id')->nullable()->index();
                $table->timestamp('pushed_to_ceo_at')->nullable();
                $table->longText('payload_json');
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable()->useCurrentOnUpdate()->useCurrent();
            });
        }

        if (! Schema::hasTable('financial_report_approvals')) {
            Schema::create('financial_report_approvals', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('report_id')->index();
                $table->unsignedBigInteger('approver_id')->nullable()->index();
                $table->string('approver_name');
                $table->string('approver_role', 50);
                $table->enum('action', ['submitted', 'validated', 'rejected', 'pushed_to_ceo']);
                $table->text('notes')->nullable();
                $table->string('signature_path')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }
    }

    private function decodePayload(?string $payload): array
    {
        if (! $payload) {
            return [];
        }

        try {
            return json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return [];
        }
    }

    private function storeUpload($file, string $folder, string $prefix): string
    {
        $directory = public_path('uploads/'.$folder);
        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $extension = $file->getClientOriginalExtension() ?: 'dat';
        $filename = $prefix.'_'.time().'_'.Str::random(6).'.'.$extension;
        $file->move($directory, $filename);

        return 'uploads/'.$folder.'/'.$filename;
    }

    private function resolveBranchId(Request $request): int
    {
        return $this->sanitizeBranchId((int) $request->integer('branch_id', $request->user()?->branch_id ?? 1));
    }

    private function sanitizeBranchId(int $branchId): int
    {
        return in_array($branchId, [0, 1, 2], true) ? $branchId : 1;
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

    private function normalizedRole(?object $user): string
    {
        return (string) ($user?->normalized_role ?? $user?->role ?? '');
    }
}
