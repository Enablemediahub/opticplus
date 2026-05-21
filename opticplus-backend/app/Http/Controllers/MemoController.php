<?php

namespace App\Http\Controllers;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class MemoController extends Controller
{
    public function meta(Request $request): JsonResponse
    {
        $this->ensureMemoTables();

        $branchId = $this->resolveBranchId($request);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'categories' => ['operations', 'finance', 'inventory', 'management', 'payroll', 'debt'],
            'priorities' => ['low', 'medium', 'high', 'urgent'],
            'statuses' => ['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'archived'],
            'approval_statuses' => ['pending', 'approved', 'rejected'],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->ensureMemoTables();

        $branchId = $this->resolveBranchId($request);
        $user = $request->user();
        $perPage = min(max((int) $request->integer('per_page', 12), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $status = trim($request->string('status')->toString());
        $category = trim($request->string('category')->toString());
        $search = trim($request->string('search')->toString());
        $scope = trim($request->string('scope')->toString() ?: 'workspace');

        $baseQuery = $this->memoQuery($branchId);

        if ($scope === 'mine') {
            $baseQuery->where('m.created_by_id', $user->id);
        } elseif ($scope === 'approvals') {
            $baseQuery->where('m.requires_approval', 1)->where('m.approval_status', 'pending');
        } elseif (! $user->isAdmin() && $user->normalized_role === 'accountant') {
            $baseQuery->where(function ($query) use ($user) {
                $query->where('m.created_by_id', $user->id)
                    ->orWhere('m.approval_status', 'approved')
                    ->orWhere('m.approval_status', 'rejected');
            });
        }

        if ($status !== '' && $status !== 'all') {
            $baseQuery->where('m.status', $status);
        }

        if ($category !== '' && $category !== 'all') {
            $baseQuery->where('m.category', $category);
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $baseQuery->where(function ($query) use ($like) {
                $query->where('m.subject', 'like', $like)
                    ->orWhere('m.body', 'like', $like)
                    ->orWhere('m.reference', 'like', $like)
                    ->orWhere('m.memo_to', 'like', $like)
                    ->orWhere('m.memo_from', 'like', $like);
            });
        }

        $total = (clone $baseQuery)->count('m.id');
        $records = (clone $baseQuery)
            ->orderByRaw("
                CASE
                    WHEN m.approval_status = 'pending' THEN 0
                    WHEN m.priority = 'urgent' THEN 1
                    WHEN m.priority = 'high' THEN 2
                    ELSE 3
                END
            ")
            ->orderByDesc('m.created_at')
            ->limit($perPage)
            ->offset($offset)
            ->get($this->memoSelectColumns())
            ->map(fn ($memo) => $this->serializeMemo($memo));

        $pendingApprovals = $this->memoQuery($branchId)
            ->where('m.requires_approval', 1)
            ->where('m.approval_status', 'pending')
            ->orderByDesc('m.created_at')
            ->limit(6)
            ->get($this->memoSelectColumns())
            ->map(fn ($memo) => $this->serializeMemo($memo));

        $myDrafts = $this->memoQuery($branchId)
            ->where('m.created_by_id', $user->id)
            ->where('m.status', 'draft')
            ->orderByDesc('m.updated_at')
            ->limit(6)
            ->get($this->memoSelectColumns())
            ->map(fn ($memo) => $this->serializeMemo($memo));

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'stats' => [
                'total' => (int) tap($this->memoQuery($branchId), fn ($query) => $this->applyRoleVisibility($query, $user))->count('m.id'),
                'pending_approval' => (int) tap($this->memoQuery($branchId)->where('m.approval_status', 'pending'), fn ($query) => $this->applyRoleVisibility($query, $user))->count('m.id'),
                'approved' => (int) tap($this->memoQuery($branchId)->where('m.approval_status', 'approved'), fn ($query) => $this->applyRoleVisibility($query, $user))->count('m.id'),
                'rejected' => (int) tap($this->memoQuery($branchId)->where('m.approval_status', 'rejected'), fn ($query) => $this->applyRoleVisibility($query, $user))->count('m.id'),
            ],
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
            'memos' => $records,
            'pending_approvals' => $pendingApprovals,
            'my_drafts' => $myDrafts,
        ]);
    }

    public function show(Request $request, int $memoId): JsonResponse
    {
        $this->ensureMemoTables();

        $branchId = $this->resolveBranchId($request);
        $user = $request->user();

        $memo = $this->memoQuery($branchId)
            ->where('m.id', $memoId)
            ->first($this->memoSelectColumns());

        if (! $memo) {
            return response()->json(['message' => 'Memo not found for this branch.'], 404);
        }

        if (! $this->canViewMemo($memo, $user)) {
            return response()->json(['message' => 'You do not have access to this memo.'], 403);
        }

        $attachments = DB::table('memo_attachments')
            ->where('memo_id', $memoId)
            ->orderBy('id')
            ->get()
            ->map(fn ($file) => [
                'id' => $file->id,
                'original_name' => $file->original_name,
                'file_type' => $file->file_type,
                'file_size' => (int) $file->file_size,
                'file_path' => $file->file_path,
                'file_url' => $this->buildPublicAssetUrl($file->file_path),
            ]);

        $approvalTrail = DB::table('memo_approvals')
            ->where('memo_id', $memoId)
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
            'memo' => $this->serializeMemo($memo),
            'attachments' => $attachments,
            'approvals' => $approvalTrail,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureMemoTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'memo_to' => ['required', 'string'],
            'memo_from' => ['required', 'string', 'max:255'],
            'memo_date' => ['required', 'date'],
            'reference' => ['nullable', 'string', 'max:100'],
            'body' => ['required', 'string'],
            'cc' => ['nullable', 'string'],
            'priority' => ['nullable', 'in:low,medium,high,urgent'],
            'category' => ['nullable', 'in:operations,finance,inventory,management,payroll,debt'],
            'requires_approval' => ['nullable', 'boolean'],
            'save_as_draft' => ['nullable', 'boolean'],
            'accountant_signature' => ['nullable', 'image', 'max:4096'],
            'attachments.*' => ['nullable', 'file', 'max:10240'],
        ]);

        $user = $request->user();
        $requiresApproval = (bool) ($validated['requires_approval'] ?? true);
        $saveAsDraft = (bool) ($validated['save_as_draft'] ?? false);
        $signaturePath = null;
        $memoDate = $validated['memo_date'];
        $reference = $this->generateMemoReference($branchId, $memoDate, $validated['reference'] ?? null);

        if (! $saveAsDraft) {
            $request->validate([
                'accountant_signature' => ['required', 'image', 'max:4096'],
            ]);
            $signaturePath = $this->storeUpload($request->file('accountant_signature'), 'memo-signatures', 'accountant_'.$user->id);
        } elseif ($request->hasFile('accountant_signature')) {
            $signaturePath = $this->storeUpload($request->file('accountant_signature'), 'memo-signatures', 'accountant_'.$user->id);
        }

        $status = $saveAsDraft ? 'draft' : ($requiresApproval ? 'pending_approval' : 'sent');
        $approvalStatus = $saveAsDraft ? 'pending' : ($requiresApproval ? 'pending' : 'approved');

        DB::beginTransaction();

        try {
            $memoId = DB::table('memos')->insertGetId([
                'branch_id' => $branchId,
                'subject' => trim($validated['subject']),
                'category' => $validated['category'] ?? 'finance',
                'memo_to' => trim($validated['memo_to']),
                'memo_from' => trim($validated['memo_from']),
                'memo_date' => $memoDate,
                'reference' => $reference,
                'body' => trim($validated['body']),
                'cc' => trim((string) ($validated['cc'] ?? '')),
                'status' => $status,
                'created_by' => $user->name,
                'created_by_id' => $user->id,
                'approval_status' => $approvalStatus,
                'digital_signature' => $signaturePath,
                'gm_signature' => null,
                'requires_approval' => $requiresApproval ? 1 : 0,
                'priority' => $validated['priority'] ?? 'medium',
                'has_attachments' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $hasAttachments = $this->storeAttachments($request, $memoId, $user->id, $branchId);

            if ($hasAttachments) {
                DB::table('memos')->where('id', $memoId)->update(['has_attachments' => 1]);
            }

            DB::table('memo_approvals')->insert([
                'memo_id' => $memoId,
                'branch_id' => $branchId,
                'approver_id' => $user->id,
                'approver_name' => $user->name,
                'approver_role' => $user->normalized_role,
                'action' => $saveAsDraft ? 'reviewed' : 'submitted',
                'notes' => $saveAsDraft ? 'Draft memo saved.' : 'Memo submitted for General Manager review.',
                'signature_path' => $signaturePath,
                'created_at' => now(),
            ]);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Unable to save the memo right now.',
                'error' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'message' => $saveAsDraft ? 'Memo draft saved successfully.' : 'Memo saved and forwarded for approval.',
            'memo_id' => $memoId,
            'reference' => $reference,
        ], 201);
    }

    public function update(Request $request, int $memoId): JsonResponse
    {
        $this->ensureMemoTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'memo_to' => ['required', 'string'],
            'memo_from' => ['required', 'string', 'max:255'],
            'memo_date' => ['required', 'date'],
            'reference' => ['nullable', 'string', 'max:100'],
            'body' => ['required', 'string'],
            'cc' => ['nullable', 'string'],
            'priority' => ['nullable', 'in:low,medium,high,urgent'],
            'category' => ['nullable', 'in:operations,finance,inventory,management,payroll,debt'],
            'requires_approval' => ['nullable', 'boolean'],
            'save_as_draft' => ['nullable', 'boolean'],
            'accountant_signature' => ['nullable', 'image', 'max:4096'],
            'attachments.*' => ['nullable', 'file', 'max:10240'],
        ]);

        $user = $request->user();
        $memo = DB::table('memos')
            ->where('id', $memoId)
            ->where('branch_id', $branchId)
            ->first();

        if (! $memo) {
            return response()->json(['message' => 'Memo not found for this branch.'], 404);
        }

        if ((int) $memo->created_by_id !== (int) $user->id && ! $user->isAdmin()) {
            return response()->json(['message' => 'You can only update memos that you created.'], 403);
        }

        if (($memo->status ?? 'draft') !== 'draft') {
            return response()->json(['message' => 'Only draft memos can be edited or sent from this workspace.'], 422);
        }

        $requiresApproval = (bool) ($validated['requires_approval'] ?? true);
        $saveAsDraft = (bool) ($validated['save_as_draft'] ?? false);
        $signaturePath = $memo->digital_signature;
        $memoDate = $validated['memo_date'];
        $reference = $this->generateMemoReference($branchId, $memoDate, $validated['reference'] ?? $memo->reference);

        if ($request->hasFile('accountant_signature')) {
            $signaturePath = $this->storeUpload($request->file('accountant_signature'), 'memo-signatures', 'accountant_'.$user->id);
        }

        if (! $saveAsDraft && ! $signaturePath) {
            return response()->json([
                'message' => 'Upload the accountant signature before sending this draft.',
            ], 422);
        }

        $status = $saveAsDraft ? 'draft' : ($requiresApproval ? 'pending_approval' : 'sent');
        $approvalStatus = $saveAsDraft ? 'pending' : ($requiresApproval ? 'pending' : 'approved');

        DB::beginTransaction();

        try {
            DB::table('memos')
                ->where('id', $memoId)
                ->update([
                    'subject' => trim($validated['subject']),
                    'category' => $validated['category'] ?? 'finance',
                    'memo_to' => trim($validated['memo_to']),
                    'memo_from' => trim($validated['memo_from']),
                    'memo_date' => $memoDate,
                    'reference' => $reference,
                    'body' => trim($validated['body']),
                    'cc' => trim((string) ($validated['cc'] ?? '')),
                    'status' => $status,
                    'approval_status' => $approvalStatus,
                    'digital_signature' => $signaturePath,
                    'requires_approval' => $requiresApproval ? 1 : 0,
                    'priority' => $validated['priority'] ?? 'medium',
                    'approved_by' => null,
                    'approved_by_id' => null,
                    'approved_at' => null,
                    'approval_notes' => null,
                    'gm_signature' => null,
                    'updated_at' => now(),
                ]);

            $hasNewAttachments = $this->storeAttachments($request, $memoId, $user->id, $branchId);
            if ($hasNewAttachments || (bool) $memo->has_attachments) {
                DB::table('memos')->where('id', $memoId)->update(['has_attachments' => 1]);
            }

            DB::table('memo_approvals')->insert([
                'memo_id' => $memoId,
                'branch_id' => $branchId,
                'approver_id' => $user->id,
                'approver_name' => $user->name,
                'approver_role' => $user->normalized_role,
                'action' => $saveAsDraft ? 'reviewed' : 'submitted',
                'notes' => $saveAsDraft ? 'Draft memo updated.' : 'Draft memo sent for General Manager review.',
                'signature_path' => $signaturePath,
                'created_at' => now(),
            ]);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Unable to update the memo right now.',
                'error' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'message' => $saveAsDraft ? 'Memo draft updated successfully.' : 'Draft memo sent for approval successfully.',
            'memo_id' => $memoId,
            'reference' => $reference,
        ]);
    }

    public function decide(Request $request, int $memoId): JsonResponse
    {
        $this->ensureMemoTables();

        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $user = $request->user();
        if (! in_array($user->normalized_role, ['manager', 'ceo'], true) && ! $user->isAdmin()) {
            return response()->json(['message' => 'Only the General Manager or CEO can approve or reject memos.'], 403);
        }

        $validated = $request->validate([
            'decision' => ['required', 'in:approved,rejected'],
            'approval_notes' => ['nullable', 'string'],
            'gm_signature' => ['required', 'image', 'max:4096'],
        ]);

        $memo = DB::table('memos')
            ->where('id', $memoId)
            ->where('branch_id', $branchId)
            ->first();

        if (! $memo) {
            return response()->json(['message' => 'Memo not found for this branch.'], 404);
        }

        $signaturePath = $this->storeUpload($request->file('gm_signature'), 'memo-signatures', 'gm_'.$user->id);
        $decision = $validated['decision'];

        DB::table('memos')
            ->where('id', $memoId)
            ->update([
                'status' => $decision === 'approved' ? 'approved' : 'rejected',
                'approval_status' => $decision,
                'approved_by' => $user->name,
                'approved_by_id' => $user->id,
                'approved_at' => now(),
                'approval_notes' => $validated['approval_notes'] ?? null,
                'gm_signature' => $signaturePath,
                'updated_at' => now(),
            ]);

        DB::table('memo_approvals')->insert([
            'memo_id' => $memoId,
            'branch_id' => $branchId,
            'approver_id' => $user->id,
            'approver_name' => $user->name,
            'approver_role' => $user->normalized_role,
            'action' => $decision,
            'notes' => $validated['approval_notes'] ?? ($decision === 'approved' ? 'Approved by General Manager.' : 'Rejected by General Manager.'),
            'signature_path' => $signaturePath,
            'created_at' => now(),
        ]);

        return response()->json([
            'message' => $decision === 'approved' ? 'Memo approved successfully.' : 'Memo rejected successfully.',
        ]);
    }

    private function memoQuery(int $branchId)
    {
        $query = DB::table('memos as m');
        $this->applyBranchScope($query, 'm.branch_id', $branchId);

        return $query;
    }

    private function memoSelectColumns(): array
    {
        return [
            'm.id',
            'm.branch_id',
            'm.subject',
            'm.category',
            'm.memo_to',
            'm.memo_from',
            'm.memo_date',
            'm.reference',
            'm.body',
            'm.cc',
            'm.status',
            'm.created_by',
            'm.created_by_id',
            'm.created_at',
            'm.updated_at',
            'm.approval_status',
            'm.approved_by',
            'm.approved_by_id',
            'm.approved_at',
            'm.approval_notes',
            'm.digital_signature',
            'm.gm_signature',
            'm.requires_approval',
            'm.priority',
            'm.has_attachments',
        ];
    }

    private function serializeMemo(object $memo): array
    {
        return [
            'id' => $memo->id,
            'branch_id' => (int) $memo->branch_id,
            'branch_name' => $this->branchName((int) $memo->branch_id),
            'subject' => $memo->subject,
            'category' => $memo->category ?: 'finance',
            'memo_to' => $memo->memo_to,
            'memo_from' => $memo->memo_from,
            'memo_date' => $memo->memo_date,
            'reference' => $memo->reference,
            'body' => $memo->body,
            'cc' => $memo->cc,
            'status' => $memo->status,
            'created_by' => $memo->created_by,
            'created_by_id' => $memo->created_by_id ? (int) $memo->created_by_id : null,
            'created_at' => $memo->created_at,
            'updated_at' => $memo->updated_at,
            'approval_status' => $memo->approval_status ?: 'pending',
            'approved_by' => $memo->approved_by,
            'approved_by_id' => $memo->approved_by_id ? (int) $memo->approved_by_id : null,
            'approved_at' => $memo->approved_at,
            'approval_notes' => $memo->approval_notes,
            'digital_signature' => $memo->digital_signature,
            'digital_signature_url' => $this->buildPublicAssetUrl($memo->digital_signature),
            'gm_signature' => $memo->gm_signature,
            'gm_signature_url' => $this->buildPublicAssetUrl($memo->gm_signature),
            'requires_approval' => (bool) $memo->requires_approval,
            'priority' => $memo->priority ?: 'medium',
            'has_attachments' => (bool) $memo->has_attachments,
        ];
    }

    private function storeAttachments(Request $request, int $memoId, int $userId, int $branchId): bool
    {
        if (! $request->hasFile('attachments')) {
            return false;
        }

        $storedAny = false;

        foreach ((array) $request->file('attachments') as $index => $file) {
            if (! $file) {
                continue;
            }

            $originalName = $file->getClientOriginalName();
            $mimeType = $file->getClientMimeType() ?: 'application/octet-stream';
            $fileSize = (int) $file->getSize();
            $path = $this->storeUpload($file, 'memo-attachments', 'memo_'.$memoId.'_'.$index);

            DB::table('memo_attachments')->insert([
                'memo_id' => $memoId,
                'branch_id' => $branchId,
                'file_name' => basename($path),
                'original_name' => $originalName,
                'file_path' => $path,
                'file_type' => $mimeType,
                'file_size' => $fileSize,
                'uploaded_by' => $userId,
                'uploaded_at' => now(),
            ]);

            $storedAny = true;
        }

        return $storedAny;
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

    private function applyRoleVisibility($query, object $user): void
    {
        if ($user->isAdmin() || in_array($user->normalized_role, ['manager', 'ceo'], true)) {
            return;
        }

        if ($user->normalized_role === 'accountant') {
            $query->where(function ($inner) use ($user) {
                $inner->where('m.created_by_id', $user->id)
                    ->orWhere('m.approval_status', 'approved')
                    ->orWhere('m.approval_status', 'rejected');
            });
        }
    }

    private function canViewMemo(object $memo, object $user): bool
    {
        if ($user->isAdmin() || in_array($user->normalized_role, ['manager', 'ceo'], true)) {
            return true;
        }

        return (int) $memo->created_by_id === (int) $user->id;
    }

    private function ensureMemoTables(): void
    {
        if (! Schema::hasTable('memos')) {
            Schema::create('memos', function (Blueprint $table): void {
                $table->id();
                $table->unsignedInteger('branch_id')->default(1)->index();
                $table->string('subject');
                $table->string('category', 50)->default('finance');
                $table->text('memo_to');
                $table->string('memo_from');
                $table->date('memo_date');
                $table->string('reference', 100)->nullable();
                $table->text('body');
                $table->text('cc')->nullable();
                $table->enum('status', ['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'archived'])->default('draft')->index();
                $table->string('created_by');
                $table->unsignedBigInteger('created_by_id')->nullable()->index();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable()->useCurrentOnUpdate()->useCurrent();
                $table->enum('approval_status', ['pending', 'approved', 'rejected'])->default('pending')->index();
                $table->string('approved_by')->nullable();
                $table->unsignedBigInteger('approved_by_id')->nullable()->index();
                $table->timestamp('approved_at')->nullable();
                $table->text('approval_notes')->nullable();
                $table->string('digital_signature')->nullable();
                $table->string('gm_signature')->nullable();
                $table->boolean('requires_approval')->default(true);
                $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
                $table->boolean('has_attachments')->default(false);
            });
        }

        $this->ensureTableColumn('memos', 'branch_id', fn (Blueprint $table) => $table->unsignedInteger('branch_id')->default(1)->after('id')->index());
        $this->ensureTableColumn('memos', 'category', fn (Blueprint $table) => $table->string('category', 50)->default('finance')->after('subject'));
        $this->ensureTableColumn('memos', 'memo_to', fn (Blueprint $table) => $table->text('memo_to')->nullable()->after('category'));
        $this->ensureTableColumn('memos', 'memo_from', fn (Blueprint $table) => $table->string('memo_from')->nullable()->after('memo_to'));
        $this->ensureTableColumn('memos', 'memo_date', fn (Blueprint $table) => $table->date('memo_date')->nullable()->after('memo_from'));
        $this->ensureTableColumn('memos', 'reference', fn (Blueprint $table) => $table->string('reference', 100)->nullable()->after('memo_date'));
        $this->ensureTableColumn('memos', 'cc', fn (Blueprint $table) => $table->text('cc')->nullable()->after('body'));
        $this->ensureTableColumn('memos', 'status', fn (Blueprint $table) => $table->string('status', 30)->default('draft')->after('cc')->index());
        $this->ensureTableColumn('memos', 'created_by', fn (Blueprint $table) => $table->string('created_by')->nullable()->after('status'));
        $this->ensureTableColumn('memos', 'created_by_id', fn (Blueprint $table) => $table->unsignedBigInteger('created_by_id')->nullable()->after('created_by')->index());
        $this->ensureTableColumn('memos', 'approval_status', fn (Blueprint $table) => $table->string('approval_status', 30)->default('pending')->after('updated_at')->index());
        $this->ensureTableColumn('memos', 'approved_by', fn (Blueprint $table) => $table->string('approved_by')->nullable()->after('approval_status'));
        $this->ensureTableColumn('memos', 'approved_by_id', fn (Blueprint $table) => $table->unsignedBigInteger('approved_by_id')->nullable()->after('approved_by')->index());
        $this->ensureTableColumn('memos', 'approved_at', fn (Blueprint $table) => $table->timestamp('approved_at')->nullable()->after('approved_by_id'));
        $this->ensureTableColumn('memos', 'approval_notes', fn (Blueprint $table) => $table->text('approval_notes')->nullable()->after('approved_at'));
        $this->ensureTableColumn('memos', 'digital_signature', fn (Blueprint $table) => $table->string('digital_signature')->nullable()->after('approval_notes'));
        $this->ensureTableColumn('memos', 'gm_signature', fn (Blueprint $table) => $table->string('gm_signature')->nullable()->after('digital_signature'));
        $this->ensureTableColumn('memos', 'requires_approval', fn (Blueprint $table) => $table->boolean('requires_approval')->default(true)->after('gm_signature'));
        $this->ensureTableColumn('memos', 'priority', fn (Blueprint $table) => $table->string('priority', 20)->default('medium')->after('requires_approval'));
        $this->ensureTableColumn('memos', 'has_attachments', fn (Blueprint $table) => $table->boolean('has_attachments')->default(false)->after('priority'));

        if (! Schema::hasTable('memo_attachments')) {
            Schema::create('memo_attachments', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('memo_id')->index();
                $table->unsignedInteger('branch_id')->default(1)->index();
                $table->string('file_name');
                $table->string('original_name');
                $table->string('file_path', 500);
                $table->string('file_type', 100);
                $table->unsignedBigInteger('file_size');
                $table->unsignedBigInteger('uploaded_by')->nullable()->index();
                $table->timestamp('uploaded_at')->useCurrent();
            });
        }

        $this->ensureTableColumn('memo_attachments', 'branch_id', fn (Blueprint $table) => $table->unsignedInteger('branch_id')->default(1)->after('memo_id')->index());
        $this->ensureTableColumn('memo_attachments', 'file_name', fn (Blueprint $table) => $table->string('file_name')->nullable()->after('memo_id'));
        $this->ensureTableColumn('memo_attachments', 'original_name', fn (Blueprint $table) => $table->string('original_name')->nullable()->after('file_name'));
        $this->ensureTableColumn('memo_attachments', 'file_path', fn (Blueprint $table) => $table->string('file_path', 500)->nullable()->after('original_name'));
        $this->ensureTableColumn('memo_attachments', 'file_type', fn (Blueprint $table) => $table->string('file_type', 100)->nullable()->after('file_path'));
        $this->ensureTableColumn('memo_attachments', 'file_size', fn (Blueprint $table) => $table->unsignedBigInteger('file_size')->nullable()->after('file_type'));
        $this->ensureTableColumn('memo_attachments', 'uploaded_by', fn (Blueprint $table) => $table->unsignedBigInteger('uploaded_by')->nullable()->after('file_size')->index());
        $this->ensureTableColumn('memo_attachments', 'uploaded_at', fn (Blueprint $table) => $table->timestamp('uploaded_at')->nullable()->after('uploaded_by'));

        if (! Schema::hasTable('memo_approvals')) {
            Schema::create('memo_approvals', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('memo_id')->index();
                $table->unsignedInteger('branch_id')->default(1)->index();
                $table->unsignedBigInteger('approver_id')->nullable()->index();
                $table->string('approver_name');
                $table->string('approver_role', 50);
                $table->enum('action', ['submitted', 'approved', 'rejected', 'reviewed', 'forwarded']);
                $table->text('notes')->nullable();
                $table->string('signature_path')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        $this->ensureTableColumn('memo_approvals', 'branch_id', fn (Blueprint $table) => $table->unsignedInteger('branch_id')->default(1)->after('memo_id')->index());
        $this->ensureTableColumn('memo_approvals', 'approver_id', fn (Blueprint $table) => $table->unsignedBigInteger('approver_id')->nullable()->after('memo_id')->index());
        $this->ensureTableColumn('memo_approvals', 'approver_name', fn (Blueprint $table) => $table->string('approver_name')->nullable()->after('approver_id'));
        $this->ensureTableColumn('memo_approvals', 'approver_role', fn (Blueprint $table) => $table->string('approver_role', 50)->nullable()->after('approver_name'));
        $this->ensureTableColumn('memo_approvals', 'action', fn (Blueprint $table) => $table->string('action', 30)->nullable()->after('approver_role'));
        $this->ensureTableColumn('memo_approvals', 'notes', fn (Blueprint $table) => $table->text('notes')->nullable()->after('action'));
        $this->ensureTableColumn('memo_approvals', 'signature_path', fn (Blueprint $table) => $table->string('signature_path')->nullable()->after('notes'));
        $this->ensureTableColumn('memo_approvals', 'created_at', fn (Blueprint $table) => $table->timestamp('created_at')->nullable()->after('signature_path'));
    }

    private function ensureTableColumn(string $tableName, string $columnName, \Closure $definition): void
    {
        if (Schema::hasColumn($tableName, $columnName)) {
            return;
        }

        Schema::table($tableName, function (Blueprint $table) use ($definition): void {
            $definition($table);
        });
    }

    private function generateMemoReference(int $branchId, string $memoDate, ?string $reference = null): string
    {
        $trimmed = trim((string) $reference);
        if ($trimmed !== '') {
            return $trimmed;
        }

        $timestamp = strtotime($memoDate) ?: time();
        $month = strtoupper(date('M', $timestamp));
        $year = date('Y', $timestamp);
        $prefix = "MEMO-{$month}-{$year}-";

        $lastReference = DB::table('memos')
            ->when($branchId > 0, fn ($query) => $query->where('branch_id', $branchId))
            ->where('reference', 'like', $prefix.'%')
            ->orderByDesc('id')
            ->value('reference');

        $nextNumber = 1;
        if (is_string($lastReference) && preg_match('/(\d+)$/', $lastReference, $matches)) {
            $nextNumber = ((int) $matches[1]) + 1;
        }

        return $prefix.str_pad((string) $nextNumber, 2, '0', STR_PAD_LEFT);
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
            'message' => 'Merged mode is read-only. Switch to a branch before creating or approving memos.',
        ], 422);
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
}
