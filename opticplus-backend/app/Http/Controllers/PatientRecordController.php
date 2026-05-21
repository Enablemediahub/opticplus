<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class PatientRecordController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $perPage = min(max((int) $request->integer('per_page', 10), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;

        $baseQuery = DB::table('patient_records as pr')
            ->leftJoin('users as assigned', 'assigned.id', '=', 'pr.assigned_optometrist_id');
        $this->applyBranchScope($baseQuery, 'pr.branch_id', $branchId);

        $this->applyFilters($baseQuery, $request);

        $total = (clone $baseQuery)->count('pr.id');
        $today = now()->toDateString();
        $weekStart = now()->startOfWeek()->toDateString();
        $monthStart = now()->startOfMonth()->toDateString();

        $statsQuery = DB::table('patient_records as pr');
        $this->applyBranchScope($statsQuery, 'pr.branch_id', $branchId);
        $this->applyFilters($statsQuery, $request);

        $databaseQuery = DB::table('patient_records as pr');
        $this->applyBranchScope($databaseQuery, 'pr.branch_id', $branchId);

        $pendingCount = (clone $statsQuery)->where('pr.status', 'pending')->count('pr.id');
        $seenCount = (clone $statsQuery)->where('pr.status', 'seen')->count('pr.id');
        $todayPendingCount = (clone $statsQuery)
            ->where('pr.status', 'pending')
            ->whereDate('pr.date', $today)
            ->count('pr.id');
        $assignedCount = (clone $statsQuery)->whereNotNull('pr.assigned_optometrist_id')->count('pr.id');
        $unassignedCount = (clone $statsQuery)->whereNull('pr.assigned_optometrist_id')->count('pr.id');
        $appointmentDueTodayCount = (clone $statsQuery)->whereDate('pr.appointment_date', $today)->count('pr.id');
        $databaseTotalCount = (clone $databaseQuery)->count('pr.id');
        $newTodayCount = (clone $databaseQuery)->whereDate('pr.date', $today)->count('pr.id');
        $newWeekCount = (clone $databaseQuery)->whereDate('pr.date', '>=', $weekStart)->count('pr.id');
        $newMonthCount = (clone $databaseQuery)->whereDate('pr.date', '>=', $monthStart)->count('pr.id');
        $statusBreakdown = (clone $statsQuery)
            ->select('pr.status', DB::raw('COUNT(pr.id) as total'))
            ->groupBy('pr.status')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($item) => [
                'label' => $item->status ?: 'Unknown',
                'count' => (int) $item->total,
            ])
            ->values();
        $sexBreakdown = (clone $statsQuery)
            ->select('pr.sex', DB::raw('COUNT(pr.id) as total'))
            ->whereNotNull('pr.sex')
            ->where('pr.sex', '!=', '')
            ->groupBy('pr.sex')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($item) => [
                'label' => $item->sex,
                'count' => (int) $item->total,
            ])
            ->values();
        $purposeBreakdown = (clone $statsQuery)
            ->select('pr.purpose', DB::raw('COUNT(pr.id) as total'))
            ->whereNotNull('pr.purpose')
            ->where('pr.purpose', '!=', '')
            ->groupBy('pr.purpose')
            ->orderByDesc('total')
            ->limit(6)
            ->get()
            ->map(fn ($item) => [
                'label' => $item->purpose,
                'count' => (int) $item->total,
            ])
            ->values();
        $residenceBreakdown = (clone $statsQuery)
            ->select('pr.residence', DB::raw('COUNT(pr.id) as total'))
            ->whereNotNull('pr.residence')
            ->where('pr.residence', '!=', '')
            ->groupBy('pr.residence')
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($item) => [
                'label' => $item->residence,
                'count' => (int) $item->total,
            ])
            ->values();

        $records = $baseQuery
            ->orderByDesc('pr.date')
            ->orderByDesc('pr.created_at')
            ->orderByDesc('pr.id')
            ->limit($perPage)
            ->offset($offset)
            ->get([
                'pr.id',
                'pr.date',
                'pr.folder_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.sex',
                'pr.dob',
                'pr.age',
                'pr.email',
                'pr.phone',
                'pr.address',
                'pr.residence',
                'pr.purpose',
                'pr.comment',
                'pr.status',
                'pr.name',
                'pr.created_at',
                'pr.appointment_date',
                'pr.branch_id',
                'pr.assigned_optometrist_id',
                'assigned.name as assigned_optometrist_name',
            ])
            ->map(fn ($record) => $this->formatPatientRecord($record, $today));

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => [
                'search' => $request->string('search')->toString(),
                'status' => $request->string('status')->toString(),
                'sex' => $request->string('sex')->toString(),
                'purpose' => $request->string('purpose')->toString(),
                'date_from' => $request->string('date_from')->toString(),
                'date_to' => $request->string('date_to')->toString(),
            ],
            'stats' => [
                'pending_count' => $pendingCount,
                'seen_count' => $seenCount,
                'today_pending_count' => $todayPendingCount,
                'total_count' => $total,
                'database_total_count' => $databaseTotalCount,
                'assigned_count' => $assignedCount,
                'unassigned_count' => $unassignedCount,
                'appointment_due_today_count' => $appointmentDueTodayCount,
                'new_today_count' => $newTodayCount,
                'new_week_count' => $newWeekCount,
                'new_month_count' => $newMonthCount,
                'seen_rate' => $total > 0 ? round(($seenCount / $total) * 100, 1) : 0,
                'status_breakdown' => $statusBreakdown,
                'sex_breakdown' => $sexBreakdown,
                'purpose_breakdown' => $purposeBreakdown,
                'residence_breakdown' => $residenceBreakdown,
            ],
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
            'records' => $records,
        ]);
    }

    public function lookup(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $search = trim($request->string('search')->toString());
        $today = now()->toDateString();

        if (mb_strlen($search) < 2) {
            return response()->json([
                'branch_id' => $branchId,
                'branch_name' => $this->branchName($branchId),
                'search' => $search,
                'records' => [],
            ]);
        }

        $searchTerm = '%'.$search.'%';

        $records = tap(
            DB::table('patient_records as pr')
                ->leftJoin('users as assigned', 'assigned.id', '=', 'pr.assigned_optometrist_id'),
            fn ($query) => $this->applyBranchScope($query, 'pr.branch_id', $branchId)
        )
            ->where(function ($query) use ($searchTerm): void {
                $query
                    ->where('pr.folder_id', 'like', $searchTerm)
                    ->orWhere('pr.surname', 'like', $searchTerm)
                    ->orWhere('pr.firstname', 'like', $searchTerm)
                    ->orWhere('pr.othernames', 'like', $searchTerm)
                    ->orWhere('pr.phone', 'like', $searchTerm)
                    ->orWhere('pr.email', 'like', $searchTerm)
                    ->orWhere('pr.name', 'like', $searchTerm);
            })
            ->orderByDesc('pr.created_at')
            ->limit(8)
            ->get([
                'pr.id',
                'pr.date',
                'pr.folder_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.sex',
                'pr.dob',
                'pr.age',
                'pr.email',
                'pr.phone',
                'pr.address',
                'pr.residence',
                'pr.purpose',
                'pr.comment',
                'pr.status',
                'pr.name',
                'pr.created_at',
                'pr.appointment_date',
                'pr.branch_id',
                'pr.assigned_optometrist_id',
                'assigned.name as assigned_optometrist_name',
            ])
            ->map(fn ($record) => $this->formatPatientRecord($record, $today));

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'search' => $search,
            'records' => $records,
        ]);
    }

    public function meta(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);

        $savedPurposes = tap(DB::table('patient_records'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereNotNull('purpose')
            ->where('purpose', '!=', '')
            ->distinct()
            ->orderBy('purpose')
            ->pluck('purpose');
        $purposes = collect($this->canonicalPurposes())
            ->merge($savedPurposes)
            ->map(fn ($purpose) => trim((string) $purpose))
            ->filter()
            ->unique()
            ->values();

        $addresses = tap(DB::table('patient_records'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereNotNull('address')
            ->where('address', '!=', '')
            ->distinct()
            ->orderBy('address')
            ->limit(20)
            ->pluck('address');

        $residences = tap(DB::table('patient_records'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereNotNull('residence')
            ->where('residence', '!=', '')
            ->distinct()
            ->orderBy('residence')
            ->limit(20)
            ->pluck('residence');

        $optometrists = tap(
            DB::table('users')->where('role', 'optometrist'),
            fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId)
        )
            ->orderBy('name')
            ->get(['id', 'name', 'username']);

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'purposes' => $purposes,
            'sexes' => ['Male', 'Female'],
            'statuses' => ['pending', 'seen'],
            'addresses' => $addresses,
            'residences' => $residences,
            'optometrists' => $optometrists,
        ]);
    }

    private function canonicalPurposes(): array
    {
        return [
            'Consultation',
            'Lens',
            'Frame',
            'Repairs',
            'Consultation + Lens',
            'Consultation + Frame',
            'Consultation + Repairs',
            'Lens + Frame',
            'Lens + Repairs',
            'Frame + Repairs',
            'Consultation + Lens + Frame',
            'Consultation + Lens + Repairs',
            'Consultation + Frame + Repairs',
            'Lens + Frame + Repairs',
            'Consultation + Lens + Frame + Repairs',
        ];
    }

    public function store(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'surname' => ['required', 'string', 'max:100'],
            'firstname' => ['required', 'string', 'max:100'],
            'othernames' => ['nullable', 'string', 'max:100'],
            'sex' => ['required', 'in:Male,Female'],
            'dob' => ['nullable', 'date'],
            'age' => ['nullable', 'integer', 'min:0', 'max:150'],
            'email' => ['nullable', 'email', 'max:100'],
            'phone' => ['required', 'string', 'max:20'],
            'address' => ['nullable', 'string', 'max:255'],
            'residence' => ['nullable', 'string', 'max:255'],
            'purpose' => ['required', 'string', 'max:50'],
            'comment' => ['nullable', 'string'],
            'appointment_date' => ['nullable', 'date'],
        ]);

        $folderId = $this->generateFolderId(
            $validated['surname'],
            $validated['firstname'],
            $validated['othernames'] ?? ''
        );

        $fullName = trim(implode(' ', array_filter([
            $validated['surname'],
            $validated['firstname'],
            $validated['othernames'] ?? null,
        ])));

        $recordId = DB::table('patient_records')->insertGetId([
            'date' => now()->toDateString(),
            'folder_id' => $folderId,
            'surname' => $validated['surname'],
            'firstname' => $validated['firstname'],
            'othernames' => $validated['othernames'] ?? null,
            'sex' => $validated['sex'],
            'dob' => $validated['dob'] ?? null,
            'age' => $validated['age'] ?? null,
            'email' => $validated['email'] ?? null,
            'phone' => $validated['phone'],
            'address' => $validated['address'] ?? null,
            'residence' => $validated['residence'] ?? null,
            'purpose' => $validated['purpose'],
            'comment' => $validated['comment'] ?? null,
            'status' => 'pending',
            'name' => $fullName,
            'appointment_date' => $validated['appointment_date'] ?? null,
            'branch_id' => $branchId,
            'created_at' => now(),
        ]);

        $record = DB::table('patient_records')->where('id', $recordId)->first();

        return response()->json([
            'message' => 'Patient record created successfully.',
            'record' => $record,
        ], 201);
    }

    public function updateStatus(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'status' => ['required', 'in:pending,seen'],
        ]);

        $updated = DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->update([
                'status' => $validated['status'],
            ]);

        if (! $updated) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        return response()->json([
            'message' => 'Patient status updated successfully.',
        ]);
    }

    public function update(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'surname' => ['required', 'string', 'max:100'],
            'firstname' => ['required', 'string', 'max:100'],
            'othernames' => ['nullable', 'string', 'max:100'],
            'sex' => ['required', 'in:Male,Female'],
            'dob' => ['nullable', 'date'],
            'age' => ['nullable', 'integer', 'min:0', 'max:150'],
            'email' => ['nullable', 'email', 'max:100'],
            'phone' => ['required', 'string', 'max:20'],
            'address' => ['nullable', 'string', 'max:255'],
            'residence' => ['nullable', 'string', 'max:255'],
            'purpose' => ['required', 'string', 'max:50'],
            'comment' => ['nullable', 'string'],
            'appointment_date' => ['nullable', 'date'],
        ]);

        $fullName = trim(implode(' ', array_filter([
            $validated['surname'],
            $validated['firstname'],
            $validated['othernames'] ?? null,
        ])));

        $updated = DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->update([
                'surname' => $validated['surname'],
                'firstname' => $validated['firstname'],
                'othernames' => $validated['othernames'] ?? null,
                'sex' => $validated['sex'],
                'dob' => $validated['dob'] ?? null,
                'age' => $validated['age'] ?? null,
                'email' => $validated['email'] ?? null,
                'phone' => $validated['phone'],
                'address' => $validated['address'] ?? null,
                'residence' => $validated['residence'] ?? null,
                'purpose' => $validated['purpose'],
                'comment' => $validated['comment'] ?? null,
                'appointment_date' => $validated['appointment_date'] ?? null,
                'name' => $fullName,
            ]);

        if (! $updated) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        $record = DB::table('patient_records')->where('id', $recordId)->first();

        return response()->json([
            'message' => 'Patient details updated successfully.',
            'record' => $record,
        ]);
    }

    public function assignOptometrist(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $validated = $request->validate([
            'assigned_optometrist_id' => ['required', 'integer'],
            'appointment_date' => ['nullable', 'date'],
        ]);

        $optometristExists = DB::table('users')
            ->where('id', $validated['assigned_optometrist_id'])
            ->where('role', 'optometrist')
            ->where('branch_id', $branchId)
            ->exists();

        if (! $optometristExists) {
            return response()->json([
                'message' => 'Selected optometrist is not valid for this branch.',
            ], 422);
        }

        $updated = DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->update([
                'assigned_optometrist_id' => $validated['assigned_optometrist_id'],
                'appointment_date' => $validated['appointment_date'] ?? now()->toDateString(),
            ]);

        if (! $updated) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        return response()->json([
            'message' => 'Optometrist assigned successfully.',
        ]);
    }

    public function prescriptions(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);

        $record = DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->first();

        if (! $record) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        $legacyPrescriptions = DB::table('glasses_prescriptions')
            ->where('folder_id', $record->folder_id)
            ->where('branch_id', $branchId)
            ->orderByDesc('date')
            ->orderByDesc('patient_id')
            ->get([
                'patient_id',
                'folder_id',
                'date',
                'sph_od',
                'sph_os',
                'cyl_od',
                'cyl_os',
                'axis_od',
                'axis_os',
                'add_od',
                'add_os',
                'ipd',
                'lens_type',
                'lens_material',
                'color',
                'notes',
                'status',
                'created_at',
                'prescription_id',
            ]);

        $formPrescriptions = $this->patientFormQuery($record->folder_id, $branchId)
            ->orderByDesc('version')
            ->orderByDesc('updated_at')
            ->get([
                'id',
                'version',
                'status',
                'updated_at',
                'form_data',
            ])
            ->map(fn ($form) => $this->formatExamFormPrescriptionRow($record, $form))
            ->filter()
            ->values();

        $prescriptions = $formPrescriptions
            ->concat($legacyPrescriptions->map(fn ($item) => (array) $item))
            ->sortByDesc(fn ($item) => ($item['date'] ?? '').'|'.($item['created_at'] ?? ''))
            ->values();

        return response()->json([
            'patient_id' => $recordId,
            'folder_id' => $record->folder_id,
            'prescriptions' => $prescriptions,
        ]);
    }

    public function storePrescription(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $record = DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->first();

        if (! $record) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        $validated = $request->validate([
            'date' => ['required', 'date'],
            'sph_od' => ['nullable', 'string', 'max:20'],
            'sph_os' => ['nullable', 'string', 'max:20'],
            'cyl_od' => ['nullable', 'string', 'max:20'],
            'cyl_os' => ['nullable', 'string', 'max:20'],
            'axis_od' => ['nullable', 'string', 'max:20'],
            'axis_os' => ['nullable', 'string', 'max:20'],
            'add_od' => ['nullable', 'string', 'max:20'],
            'add_os' => ['nullable', 'string', 'max:20'],
            'ipd' => ['nullable', 'string', 'max:30'],
            'lens_type' => ['nullable', 'string', 'max:120'],
            'lens_material' => ['nullable', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'max:40'],
        ]);

        $payload = [
            'patient_id' => $record->id,
            'folder_id' => $record->folder_id,
            'date' => $validated['date'],
            'sph_od' => $validated['sph_od'] ?? null,
            'sph_os' => $validated['sph_os'] ?? null,
            'cyl_od' => $validated['cyl_od'] ?? null,
            'cyl_os' => $validated['cyl_os'] ?? null,
            'axis_od' => $validated['axis_od'] ?? null,
            'axis_os' => $validated['axis_os'] ?? null,
            'add_od' => $validated['add_od'] ?? null,
            'add_os' => $validated['add_os'] ?? null,
            'ipd' => $validated['ipd'] ?? null,
            'lens_type' => $validated['lens_type'] ?? null,
            'lens_material' => $validated['lens_material'] ?? null,
            'color' => $validated['color'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'status' => $validated['status'] ?? 'pending',
            'branch_id' => $branchId,
            'created_at' => now(),
        ];

        if (Schema::hasTable('glasses_prescriptions') && Schema::hasColumn('glasses_prescriptions', 'prescription_id')) {
            // Older imported schemas require a billing-linked prescription_id even for standalone saves.
            $payload['prescription_id'] = 0;
        }

        DB::table('glasses_prescriptions')->insert($payload);
        $saved = DB::table('glasses_prescriptions')
            ->where('folder_id', $record->folder_id)
            ->where('date', $validated['date'])
            ->when(Schema::hasColumn('glasses_prescriptions', 'branch_id'), fn ($query) => $query->where('branch_id', $branchId))
            ->orderByDesc('created_at')
            ->first();

        return response()->json([
            'message' => 'Prescription saved successfully.',
            'prescription' => $saved,
        ], 201);
    }

    public function documents(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $record = DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->first();

        if (! $record) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        $columns = $this->ensurePatientDocumentsTable();
        $query = DB::table('patient_documents')
            ->where('folder_id', $record->folder_id);

        if ($columns['has_branch_id']) {
            $query->where('branch_id', $branchId);
        }

        $documents = $query
            ->orderByDesc($columns['has_uploaded_at'] ? 'uploaded_at' : 'created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn ($document) => $this->formatPatientDocument($document, $columns))
            ->values();

        return response()->json([
            'patient_id' => $record->id,
            'folder_id' => $record->folder_id,
            'documents' => $documents,
        ]);
    }

    public function storeDocuments(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $record = DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->first();

        if (! $record) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        $validated = $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:12'],
            'files.*' => ['file', 'max:10240', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx,xls,xlsx,csv,txt'],
            'document_type' => ['nullable', 'string', 'max:80'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $columns = $this->ensurePatientDocumentsTable();
        $directoryRelative = 'uploads/patient_documents/'.$record->folder_id;
        $directoryAbsolute = public_path($directoryRelative);

        if (! is_dir($directoryAbsolute)) {
            mkdir($directoryAbsolute, 0755, true);
        }

        $uploadedBy = optional($request->user())->id;
        $saved = [];

        foreach ($request->file('files', []) as $file) {
            $extension = strtolower((string) $file->getClientOriginalExtension());
            $filename = now()->format('YmdHis').'_'.Str::random(8).($extension !== '' ? '.'.$extension : '');
            $file->move($directoryAbsolute, $filename);

            $filePath = $directoryRelative.'/'.$filename;
            $payload = [
                'folder_id' => $record->folder_id,
            ];

            if ($columns['has_patient_id']) {
                $payload['patient_id'] = $record->id;
            }
            if ($columns['has_branch_id']) {
                $payload['branch_id'] = $branchId;
            }
            if ($columns['has_document_type']) {
                $payload['document_type'] = $validated['document_type'] ?? null;
            }
            if ($columns['has_notes']) {
                $payload['notes'] = $validated['notes'] ?? null;
            }
            if ($columns['has_original_name']) {
                $payload['original_name'] = $file->getClientOriginalName();
            }
            if ($columns['has_file_name']) {
                $payload['file_name'] = $filename;
            }
            if ($columns['has_file_path']) {
                $payload['file_path'] = $filePath;
            }
            if ($columns['has_mime_type']) {
                $payload['mime_type'] = $file->getClientMimeType();
            }
            if ($columns['has_file_size']) {
                $payload['file_size'] = $file->getSize();
            }
            if ($columns['has_uploaded_by']) {
                $payload['uploaded_by'] = $uploadedBy;
            }
            if ($columns['has_uploaded_at']) {
                $payload['uploaded_at'] = now();
            }
            if ($columns['has_created_at']) {
                $payload['created_at'] = now();
            }

            $documentId = DB::table('patient_documents')->insertGetId($payload);
            $savedDocument = DB::table('patient_documents')->where('id', $documentId)->first();
            if ($savedDocument) {
                $saved[] = $this->formatPatientDocument($savedDocument, $columns);
            }
        }

        return response()->json([
            'message' => 'Patient documents uploaded successfully.',
            'documents' => $saved,
        ], 201);
    }

    public function glassesPrescriptionIndex(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $search = trim($request->string('search')->toString());
        $perPage = min(max((int) $request->integer('per_page', 15), 5), 50);
        $page = max((int) $request->integer('page', 1), 1);
        $offset = ($page - 1) * $perPage;

        $legacyQuery = DB::table('glasses_prescriptions as gp')
            ->join('patient_records as pr', 'gp.patient_id', '=', 'pr.id');
        $this->applyBranchScope($legacyQuery, 'gp.branch_id', $branchId);
        $this->applyBranchScope($legacyQuery, 'pr.branch_id', $branchId);

        if ($search !== '') {
            $searchTerm = '%'.$search.'%';
            $legacyQuery->where(function ($query) use ($searchTerm): void {
                $query
                    ->where('pr.folder_id', 'like', $searchTerm)
                    ->orWhere('pr.surname', 'like', $searchTerm)
                    ->orWhere('pr.firstname', 'like', $searchTerm)
                    ->orWhere('pr.othernames', 'like', $searchTerm);
            });
        }

        $legacyPrescriptions = $legacyQuery
            ->orderByDesc('gp.date')
            ->orderByDesc('gp.prescription_id')
            ->get([
                'gp.prescription_id',
                'gp.patient_id',
                'gp.folder_id',
                'gp.date',
                'gp.sph_od',
                'gp.sph_os',
                'gp.cyl_od',
                'gp.cyl_os',
                'gp.axis_od',
                'gp.axis_os',
                'gp.add_od',
                'gp.add_os',
                'gp.ipd',
                'gp.lens_type',
                'gp.lens_material',
                'gp.color',
                'gp.notes',
                'gp.status',
                'gp.created_at',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
            ]);

        $formQuery = DB::table('patient_form_data as pfd')
            ->join('patient_records as pr', 'pfd.folder_id', '=', 'pr.folder_id');
        $this->applyBranchScope($formQuery, 'pfd.branch_id', $branchId);
        $this->applyBranchScope($formQuery, 'pr.branch_id', $branchId);

        if ($search !== '') {
            $searchTerm = '%'.$search.'%';
            $formQuery->where(function ($query) use ($searchTerm): void {
                $query
                    ->where('pr.folder_id', 'like', $searchTerm)
                    ->orWhere('pr.surname', 'like', $searchTerm)
                    ->orWhere('pr.firstname', 'like', $searchTerm)
                    ->orWhere('pr.othernames', 'like', $searchTerm);
            });
        }

        $formPrescriptions = $formQuery
            ->orderByDesc('pfd.version')
            ->orderByDesc('pfd.updated_at')
            ->get([
                'pfd.id as form_id',
                'pfd.folder_id',
                'pfd.version',
                'pfd.status',
                'pfd.updated_at',
                'pfd.form_data',
                'pr.id as patient_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.name',
            ])
            ->map(function ($item) {
                $record = (object) [
                    'id' => $item->patient_id,
                    'folder_id' => $item->folder_id,
                    'surname' => $item->surname,
                    'firstname' => $item->firstname,
                    'othernames' => $item->othernames,
                    'name' => $item->name,
                ];

                $form = (object) [
                    'id' => $item->form_id,
                    'version' => $item->version,
                    'status' => $item->status,
                    'updated_at' => $item->updated_at,
                    'form_data' => $item->form_data,
                ];

                return $this->formatExamFormPrescriptionRow($record, $form);
            })
            ->filter()
            ->values();

        $combined = $formPrescriptions
            ->concat($legacyPrescriptions->map(fn ($item) => (array) $item))
            ->sortByDesc(fn ($item) => ($item['date'] ?? '').'|'.($item['created_at'] ?? '').'|'.($item['prescription_id'] ?? ''))
            ->unique(fn ($item) => ($item['patient_id'] ?? 'patient').':'.($item['folder_id'] ?? 'folder'))
            ->values();

        $total = $combined->count();
        $prescriptions = $combined->slice($offset, $perPage)->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'filters' => [
                'search' => $search,
            ],
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
            'prescriptions' => $prescriptions,
        ]);
    }

    public function medicalReport(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);

        $record = DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->first();

        if (! $record) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        $formVersions = DB::table('patient_form_data')
            ->where('folder_id', $record->folder_id)
            ->orderByDesc('version')
            ->orderByDesc('updated_at')
            ->limit(10)
            ->get(['id', 'version', 'status', 'updated_at', 'form_data']);

        $latestForm = $formVersions->first();
        $latestSummary = $this->extractMedicalSummaryFromFormData($latestForm?->form_data);

        $versions = $formVersions->map(function ($item) {
            return [
                'id' => $item->id,
                'version' => $item->version,
                'status' => $item->status,
                'updated_at' => $item->updated_at,
                'summary' => $this->extractMedicalSummaryFromFormData($item->form_data),
            ];
        })->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'patient' => $this->formatPatientRecord($record, now()->toDateString()),
            'latest_form' => [
                'version' => $latestForm?->version,
                'status' => $latestForm?->status,
                'updated_at' => $latestForm?->updated_at,
                'summary' => $latestSummary,
            ],
            'form_versions' => $versions,
        ]);
    }

    public function examForm(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $record = $this->patientRecordForBranch($recordId, $branchId);

        if (! $record) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        $this->ensurePatientFormDataTable();

        $latestForm = $this->latestPatientFormRow($record->folder_id, $branchId);
        $formVersions = $this->patientFormQuery($record->folder_id, $branchId)
            ->orderByDesc('version')
            ->orderByDesc('updated_at')
            ->limit(10)
            ->get(['id', 'version', 'status', 'updated_at', 'form_data']);
        $selectedFormId = (int) $request->query('form_id', 0);
        $selectedForm = $selectedFormId > 0
            ? $this->patientFormQuery($record->folder_id, $branchId)
                ->where('id', $selectedFormId)
                ->first([
                    'id',
                    'version',
                    'status',
                    'updated_at',
                    'form_data',
                ])
            : $latestForm;
        $versions = $formVersions->map(function ($item) {
            return [
                'id' => $item->id,
                'version' => $item->version,
                'status' => $item->status,
                'updated_at' => $item->updated_at,
                'summary' => $this->extractMedicalSummaryFromFormData($item->form_data),
            ];
        })->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'patient' => $this->formatPatientRecord($record, now()->toDateString()),
            'latest_form' => [
                'id' => $latestForm?->id,
                'version' => $latestForm?->version,
                'status' => $latestForm?->status,
                'updated_at' => $latestForm?->updated_at,
                'form_data' => $this->decodePatientFormData($latestForm?->form_data),
            ],
            'selected_form' => [
                'id' => $selectedForm?->id,
                'version' => $selectedForm?->version,
                'status' => $selectedForm?->status,
                'updated_at' => $selectedForm?->updated_at,
                'form_data' => $this->decodePatientFormData($selectedForm?->form_data),
            ],
            'form_versions' => $versions,
        ]);
    }

    public function saveExamForm(Request $request, int $recordId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $record = $this->patientRecordForBranch($recordId, $branchId);

        if (! $record) {
            return response()->json([
                'message' => 'Patient record not found for this branch.',
            ], 404);
        }

        $validated = $request->validate([
            'form_data' => ['required', 'array'],
            'status' => ['required', 'in:draft,completed'],
        ]);

        $this->ensurePatientFormDataTable();

        $payload = $this->normalizeExamFormPayload($validated['form_data']);
        $status = $validated['status'];
        $userId = $request->user()?->id;
        $latestForm = $this->latestPatientFormRow($record->folder_id, $branchId);

        if ($latestForm && $latestForm->status === 'draft') {
            $updatePayload = [
                'status' => $status,
                'form_data' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'updated_by' => $userId,
                'updated_at' => now(),
            ];

            if ($this->patientFormDataHasColumn('patient_record_id')) {
                $updatePayload['patient_record_id'] = $record->id;
            }
            if ($this->patientFormDataHasColumn('user_id')) {
                $updatePayload['user_id'] = $userId;
            }

            $this->patientFormQuery($record->folder_id, $branchId)
                ->where('id', $latestForm->id)
                ->update($updatePayload);

            $savedId = $latestForm->id;
            $savedVersion = (int) $latestForm->version;
        } else {
            $nextVersion = $latestForm ? ((int) $latestForm->version + 1) : 1;
            $insertPayload = [
                'folder_id' => $record->folder_id,
                'version' => $nextVersion,
                'status' => $status,
                'form_data' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if ($this->patientFormDataHasColumn('branch_id')) {
                $insertPayload['branch_id'] = $branchId;
            }
            if ($this->patientFormDataHasColumn('patient_record_id')) {
                $insertPayload['patient_record_id'] = $record->id;
            }
            if ($this->patientFormDataHasColumn('user_id')) {
                $insertPayload['user_id'] = $userId;
            }
            if ($this->patientFormDataHasColumn('created_by')) {
                $insertPayload['created_by'] = $userId;
            }
            if ($this->patientFormDataHasColumn('updated_by')) {
                $insertPayload['updated_by'] = $userId;
            }

            $savedId = DB::table('patient_form_data')->insertGetId($insertPayload);
            $savedVersion = $nextVersion;
        }

        $savedForm = DB::table('patient_form_data')->where('id', $savedId)->first([
            'id',
            'version',
            'status',
            'updated_at',
            'form_data',
        ]);

        return response()->json([
            'message' => $status === 'draft'
                ? 'Examination form draft saved successfully.'
                : 'Examination form saved successfully.',
            'form' => [
                'id' => $savedForm?->id ?? $savedId,
                'version' => $savedForm?->version ?? $savedVersion,
                'status' => $savedForm?->status ?? $status,
                'updated_at' => $savedForm?->updated_at,
                'form_data' => $this->decodePatientFormData($savedForm?->form_data) ?? $payload,
            ],
        ]);
    }

    public function formPrescriptionSearch(Request $request): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        $search = trim($request->string('search')->toString());

        if (mb_strlen($search) < 2) {
            return response()->json([
                'branch_id' => $branchId,
                'branch_name' => $this->branchName($branchId),
                'search' => $search,
                'records' => [],
            ]);
        }

        $searchTerm = '%'.$search.'%';
        $patientRecords = tap(
            DB::table('patient_records as pr'),
            fn ($query) => $this->applyBranchScope($query, 'pr.branch_id', $branchId)
        )
            ->where(function ($query) use ($searchTerm): void {
                $query
                    ->where('pr.folder_id', 'like', $searchTerm)
                    ->orWhere('pr.surname', 'like', $searchTerm)
                    ->orWhere('pr.firstname', 'like', $searchTerm)
                    ->orWhere('pr.othernames', 'like', $searchTerm)
                    ->orWhere('pr.phone', 'like', $searchTerm)
                    ->orWhere('pr.email', 'like', $searchTerm)
                    ->orWhere('pr.name', 'like', $searchTerm);
            })
            ->orderByDesc('pr.created_at')
            ->limit(12)
            ->get([
                'pr.id',
                'pr.folder_id',
                'pr.surname',
                'pr.firstname',
                'pr.othernames',
                'pr.phone',
                'pr.email',
                'pr.sex',
                'pr.age',
                'pr.purpose',
                'pr.status',
                'pr.name',
                'pr.appointment_date',
                'pr.branch_id',
            ]);

        $records = $patientRecords->map(function ($record) {
            $latestForm = DB::table('patient_form_data')
                ->where('folder_id', $record->folder_id)
                ->orderByDesc('version')
                ->orderByDesc('updated_at')
                ->first([
                    'folder_id',
                    'version',
                    'status',
                    'updated_at',
                    'form_data',
                ]);

            $prescription = $this->extractPrescriptionFromFormData($latestForm?->form_data);

            return [
                'id' => $record->id,
                'patient_id' => $record->id,
                'folder_id' => $record->folder_id,
                'name' => trim($record->name ?: implode(' ', array_filter([
                    $record->surname,
                    $record->firstname,
                    $record->othernames,
                ]))),
                'phone' => $record->phone,
                'email' => $record->email,
                'sex' => $record->sex,
                'age' => $record->age,
                'purpose' => $record->purpose,
                'status' => $record->status,
                'appointment_date' => $record->appointment_date,
                'latest_form_version' => $latestForm?->version,
                'latest_form_status' => $latestForm?->status,
                'latest_form_updated_at' => $latestForm?->updated_at,
                'prescription' => $prescription,
                'prescription_id' => $latestForm?->version ? 'FORM-'.$record->id.'-'.$latestForm->version : null,
                'date' => $latestForm?->updated_at ? substr((string) $latestForm->updated_at, 0, 10) : null,
                'sph_od' => $prescription['od']['sphere'] ?? '',
                'cyl_od' => $prescription['od']['cylinder'] ?? '',
                'axis_od' => $prescription['od']['axis'] ?? '',
                'add_od' => $prescription['od']['add'] ?? '',
                'sph_os' => $prescription['os']['sphere'] ?? '',
                'cyl_os' => $prescription['os']['cylinder'] ?? '',
                'axis_os' => $prescription['os']['axis'] ?? '',
                'add_os' => $prescription['os']['add'] ?? '',
                'ipd' => '',
                'lens_type' => $prescription['od']['lens_type'] ?? ($prescription['os']['lens_type'] ?? ''),
                'notes' => $prescription['prescription_notes'] ?? '',
                'source' => 'exam_form',
            ];
        })->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'search' => $search,
            'records' => $records,
        ]);
    }

    private function applyFilters($query, Request $request): void
    {
        if ($request->filled('search')) {
            $search = '%'.trim($request->string('search')->toString()).'%';
            $query->where(function ($innerQuery) use ($search): void {
                $innerQuery
                    ->where('pr.folder_id', 'like', $search)
                    ->orWhere('pr.surname', 'like', $search)
                    ->orWhere('pr.firstname', 'like', $search)
                    ->orWhere('pr.othernames', 'like', $search)
                    ->orWhere('pr.phone', 'like', $search)
                    ->orWhere('pr.email', 'like', $search);
            });
        }

        if ($request->filled('status') && $request->string('status')->toString() !== 'all') {
            $query->where('pr.status', $request->string('status')->toString());
        }

        if ($request->filled('sex') && $request->string('sex')->toString() !== 'all') {
            $query->where('pr.sex', $request->string('sex')->toString());
        }

        if ($request->filled('purpose') && $request->string('purpose')->toString() !== 'all') {
            $query->where('pr.purpose', $request->string('purpose')->toString());
        }

        if ($request->filled('date_from')) {
            $query->whereDate('pr.date', '>=', $request->string('date_from')->toString());
        }

        if ($request->filled('date_to')) {
            $query->whereDate('pr.date', '<=', $request->string('date_to')->toString());
        }
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();

        if (! $user->isAdmin()) {
            return (int) $user->branch_id;
        }

        $requestedBranchId = (int) $request->integer('branch_id');

        return $requestedBranchId >= 0 ? $requestedBranchId : 1;
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

    private function patientRecordForBranch(int $recordId, int $branchId): ?object
    {
        return DB::table('patient_records')
            ->where('id', $recordId)
            ->where('branch_id', $branchId)
            ->first();
    }

    private function ensurePatientFormDataTable(): void
    {
        if (! Schema::hasTable('patient_form_data')) {
            Schema::create('patient_form_data', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('patient_record_id')->nullable()->index();
                $table->string('folder_id', 80)->index();
                $table->unsignedBigInteger('branch_id')->default(1)->index();
                $table->unsignedInteger('version')->default(1);
                $table->string('status', 30)->default('draft')->index();
                $table->longText('form_data')->nullable();
                $table->unsignedBigInteger('created_by')->nullable()->index();
                $table->unsignedBigInteger('updated_by')->nullable()->index();
                $table->timestamps();
            });

            return;
        }

        Schema::table('patient_form_data', function (Blueprint $table): void {
            if (! Schema::hasColumn('patient_form_data', 'patient_record_id')) {
                $table->unsignedBigInteger('patient_record_id')->nullable()->index()->after('id');
            }
            if (! Schema::hasColumn('patient_form_data', 'folder_id')) {
                $table->string('folder_id', 80)->nullable()->index()->after('patient_record_id');
            }
            if (! Schema::hasColumn('patient_form_data', 'branch_id')) {
                $table->unsignedBigInteger('branch_id')->default(1)->index()->after('folder_id');
            }
            if (! Schema::hasColumn('patient_form_data', 'version')) {
                $table->unsignedInteger('version')->default(1)->after('branch_id');
            }
            if (! Schema::hasColumn('patient_form_data', 'status')) {
                $table->string('status', 30)->default('draft')->index()->after('version');
            }
            if (! Schema::hasColumn('patient_form_data', 'form_data')) {
                $table->longText('form_data')->nullable()->after('status');
            }
            if (! Schema::hasColumn('patient_form_data', 'created_by')) {
                $table->unsignedBigInteger('created_by')->nullable()->index()->after('form_data');
            }
            if (! Schema::hasColumn('patient_form_data', 'updated_by')) {
                $table->unsignedBigInteger('updated_by')->nullable()->index()->after('created_by');
            }
            if (! Schema::hasColumn('patient_form_data', 'created_at')) {
                $table->timestamp('created_at')->nullable()->after('updated_by');
            }
            if (! Schema::hasColumn('patient_form_data', 'updated_at')) {
                $table->timestamp('updated_at')->nullable()->after('created_at');
            }
        });
    }

    private function patientFormQuery(string $folderId, int $branchId)
    {
        $query = DB::table('patient_form_data')->where('folder_id', $folderId);

        if ($this->patientFormDataHasColumn('branch_id') && $branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        return $query;
    }

    private function latestPatientFormRow(string $folderId, int $branchId): ?object
    {
        return $this->patientFormQuery($folderId, $branchId)
            ->orderByDesc('version')
            ->orderByDesc('updated_at')
            ->first([
                'id',
                'version',
                'status',
                'updated_at',
                'form_data',
            ]);
    }

    private function patientFormDataHasColumn(string $column): bool
    {
        return Schema::hasTable('patient_form_data') && Schema::hasColumn('patient_form_data', $column);
    }

    private function decodePatientFormData(?string $formData): ?array
    {
        if (! $formData) {
            return null;
        }

        $decoded = json_decode($formData, true);

        return is_array($decoded) ? $decoded : null;
    }

    private function normalizeExamFormPayload(array $payload): array
    {
        $subjective = $payload['refraction']['subjective'] ?? [];
        $spectacle = $payload['spectacle_rx'] ?? [];

        foreach (['od', 'os'] as $eye) {
            $subjectiveEye = $subjective[$eye] ?? [];
            $spectacleEye = $spectacle[$eye] ?? [];

            foreach (['sphere', 'cylinder', 'axis', 'add', 'va'] as $field) {
                $subjectiveValue = trim((string) ($subjectiveEye[$field] ?? ''));
                $spectacleValue = trim((string) ($spectacleEye[$field] ?? ''));

                if ($subjectiveValue !== '' && $spectacleValue === '') {
                    $spectacleEye[$field] = $subjectiveValue;
                } elseif ($spectacleValue !== '' && $subjectiveValue === '') {
                    $subjectiveEye[$field] = $spectacleValue;
                }
            }

            $subjective[$eye] = $subjectiveEye;
            $spectacle[$eye] = $spectacleEye;
        }

        $payload['refraction']['subjective'] = $subjective;
        $payload['spectacle_rx'] = $spectacle;
        $payload['diagnosis'] = $payload['diagnosis'] ?? [];

        if (blank($payload['diagnosis']['prescription'] ?? null)) {
            $payload['diagnosis']['prescription'] = $this->buildPrescriptionSummaryFromEyes($spectacle, $subjective);
        }

        return $payload;
    }

    private function ensureWritableBranch(int $branchId): ?JsonResponse
    {
        if ($branchId !== 0) {
            return null;
        }

        return response()->json([
            'message' => 'Merged mode is read-only. Switch to a branch before creating or updating patient records.',
        ], 422);
    }

    private function ensurePatientDocumentsTable(): array
    {
        if (! Schema::hasTable('patient_documents')) {
            Schema::create('patient_documents', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('patient_id')->nullable()->index();
                $table->string('folder_id', 60)->index();
                $table->unsignedInteger('branch_id')->nullable()->index();
                $table->string('document_type', 80)->nullable();
                $table->string('original_name', 255)->nullable();
                $table->string('file_name', 255)->nullable();
                $table->string('file_path', 500)->nullable();
                $table->string('mime_type', 120)->nullable();
                $table->unsignedBigInteger('file_size')->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('uploaded_by')->nullable()->index();
                $table->timestamp('uploaded_at')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        } else {
            Schema::table('patient_documents', function (Blueprint $table): void {
                if (! Schema::hasColumn('patient_documents', 'patient_id')) {
                    $table->unsignedBigInteger('patient_id')->nullable()->index()->after('id');
                }
                if (! Schema::hasColumn('patient_documents', 'branch_id')) {
                    $table->unsignedInteger('branch_id')->nullable()->index()->after('folder_id');
                }
                if (! Schema::hasColumn('patient_documents', 'document_type')) {
                    $table->string('document_type', 80)->nullable()->after('branch_id');
                }
                if (! Schema::hasColumn('patient_documents', 'original_name')) {
                    $table->string('original_name', 255)->nullable()->after('document_type');
                }
                if (! Schema::hasColumn('patient_documents', 'file_name')) {
                    $table->string('file_name', 255)->nullable()->after('original_name');
                }
                if (! Schema::hasColumn('patient_documents', 'file_path')) {
                    $table->string('file_path', 500)->nullable()->after('file_name');
                }
                if (! Schema::hasColumn('patient_documents', 'mime_type')) {
                    $table->string('mime_type', 120)->nullable()->after('file_path');
                }
                if (! Schema::hasColumn('patient_documents', 'file_size')) {
                    $table->unsignedBigInteger('file_size')->nullable()->after('mime_type');
                }
                if (! Schema::hasColumn('patient_documents', 'notes')) {
                    $table->text('notes')->nullable()->after('file_size');
                }
                if (! Schema::hasColumn('patient_documents', 'uploaded_by')) {
                    $table->unsignedBigInteger('uploaded_by')->nullable()->index()->after('notes');
                }
                if (! Schema::hasColumn('patient_documents', 'created_at')) {
                    $table->timestamp('created_at')->useCurrent()->after('uploaded_by');
                }
                if (! Schema::hasColumn('patient_documents', 'uploaded_at')) {
                    $table->timestamp('uploaded_at')->nullable()->after('uploaded_by');
                }
            });
        }

        return [
            'has_patient_id' => Schema::hasColumn('patient_documents', 'patient_id'),
            'has_branch_id' => Schema::hasColumn('patient_documents', 'branch_id'),
            'has_document_type' => Schema::hasColumn('patient_documents', 'document_type'),
            'has_notes' => Schema::hasColumn('patient_documents', 'notes'),
            'has_original_name' => Schema::hasColumn('patient_documents', 'original_name'),
            'has_file_name' => Schema::hasColumn('patient_documents', 'file_name'),
            'has_file_path' => Schema::hasColumn('patient_documents', 'file_path'),
            'has_mime_type' => Schema::hasColumn('patient_documents', 'mime_type'),
            'has_file_size' => Schema::hasColumn('patient_documents', 'file_size'),
            'has_uploaded_by' => Schema::hasColumn('patient_documents', 'uploaded_by'),
            'has_uploaded_at' => Schema::hasColumn('patient_documents', 'uploaded_at'),
            'has_created_at' => Schema::hasColumn('patient_documents', 'created_at'),
        ];
    }

    private function formatPatientDocument(object $document, array $columns): array
    {
        $filePath = $columns['has_file_path'] ? ($document->file_path ?? '') : '';
        $basename = $columns['has_file_name']
            ? ($document->file_name ?? '')
            : basename((string) $filePath);
        $originalName = $columns['has_original_name']
            ? ($document->original_name ?? $basename)
            : ($basename !== '' ? $basename : 'Document');

        return [
            'id' => $document->id,
            'patient_id' => $columns['has_patient_id'] ? ($document->patient_id ?? null) : null,
            'folder_id' => $document->folder_id ?? null,
            'document_type' => $columns['has_document_type'] ? ($document->document_type ?? null) : null,
            'notes' => $columns['has_notes'] ? ($document->notes ?? null) : null,
            'original_name' => $originalName,
            'file_name' => $basename,
            'file_path' => $filePath,
            'file_url' => $filePath !== '' ? url('/'.$filePath) : null,
            'mime_type' => $columns['has_mime_type'] ? ($document->mime_type ?? null) : null,
            'file_size' => $columns['has_file_size'] ? (int) ($document->file_size ?? 0) : 0,
            'uploaded_at' => $columns['has_uploaded_at'] ? ($document->uploaded_at ?? null) : null,
            'created_at' => $columns['has_created_at'] ? ($document->created_at ?? null) : null,
        ];
    }

    private function generateFolderId(string $surname, string $firstname, string $othernames = ''): string
    {
        $initials = Str::upper(Str::substr(trim($surname), 0, 1))
            .Str::upper(Str::substr(trim($firstname), 0, 1))
            .Str::upper(Str::substr(trim($othernames), 0, 1));

        $year = now()->format('Y');
        $count = ((int) DB::table('patient_records')->count()) + 1;
        $sequence = str_pad((string) $count, 4, '0', STR_PAD_LEFT);

        return "BOC-{$initials}/{$sequence}/{$year}";
    }

    private function formatPatientRecord(object $record, string $today): array
    {
        $assignedOptometristName = property_exists($record, 'assigned_optometrist_name')
            ? $record->assigned_optometrist_name
            : null;

        return [
            'id' => $record->id,
            'date' => $record->date,
            'folder_id' => $record->folder_id,
            'surname' => $record->surname,
            'firstname' => $record->firstname,
            'othernames' => $record->othernames,
            'sex' => $record->sex,
            'dob' => $record->dob,
            'age' => $record->age,
            'email' => $record->email,
            'phone' => $record->phone,
            'address' => $record->address,
            'residence' => $record->residence,
            'purpose' => $record->purpose,
            'comment' => $record->comment,
            'status' => $record->status,
            'name' => trim($record->name ?: implode(' ', array_filter([
                $record->surname,
                $record->firstname,
                $record->othernames,
            ]))),
            'created_at' => $record->created_at,
            'appointment_date' => $record->appointment_date,
            'branch_id' => $record->branch_id,
            'assigned_optometrist_id' => $record->assigned_optometrist_id,
            'assigned_optometrist_name' => $assignedOptometristName,
            'is_today_pending' => $record->status === 'pending' && $record->date === $today,
        ];
    }

    private function extractPrescriptionFromFormData(?string $formData): ?array
    {
        if (! $formData) {
            return null;
        }

        $decoded = json_decode($formData, true);
        if (! is_array($decoded)) {
            return null;
        }

        $rx = $decoded['spectacle_rx'] ?? [];
        $diagnosis = $decoded['diagnosis'] ?? [];
        $refraction = $decoded['refraction']['subjective'] ?? [];

        $od = $this->normalizeEyePrescription($rx['od'] ?? $refraction['od'] ?? []);
        $os = $this->normalizeEyePrescription($rx['os'] ?? $refraction['os'] ?? []);

        $hasContent = array_filter([
            $od['sphere'],
            $od['cylinder'],
            $od['axis'],
            $od['add'],
            $os['sphere'],
            $os['cylinder'],
            $os['axis'],
            $os['add'],
            $diagnosis['prescription'] ?? null,
            $diagnosis['diagnosis'] ?? null,
        ], fn ($value) => filled($value));

        if (! $hasContent) {
            return null;
        }

        return [
            'od' => $od,
            'os' => $os,
            'diagnosis' => $diagnosis['diagnosis'] ?? '',
            'prescription_notes' => $diagnosis['prescription'] ?? '',
            'management_plan' => $diagnosis['management_plan'] ?? '',
            'followup_date' => $diagnosis['followup_date'] ?? '',
            'followup_notes' => $diagnosis['followup_notes'] ?? '',
        ];
    }

    private function normalizeEyePrescription(array $eye): array
    {
        return [
            'sphere' => (string) ($eye['sphere'] ?? ''),
            'cylinder' => (string) ($eye['cylinder'] ?? ''),
            'axis' => (string) ($eye['axis'] ?? ''),
            'add' => (string) ($eye['add'] ?? ''),
            'va' => (string) ($eye['va'] ?? ''),
            'lens_type' => (string) ($eye['lens_type'] ?? ''),
        ];
    }

    private function extractMedicalSummaryFromFormData(?string $formData): array
    {
        if (! $formData) {
            return [
                'chief_complaint' => '',
                'diagnosis' => '',
                'management_plan' => '',
                'prescription' => '',
                'followup_date' => '',
                'followup_notes' => '',
                'medical_flags' => [],
            ];
        }

        $decoded = json_decode($formData, true);
        if (! is_array($decoded)) {
            return [
                'chief_complaint' => '',
                'diagnosis' => '',
                'management_plan' => '',
                'prescription' => '',
                'followup_date' => '',
                'followup_notes' => '',
                'medical_flags' => [],
            ];
        }

        $diagnosis = $decoded['diagnosis'] ?? [];
        $caseHistory = $decoded['case_history'] ?? [];
        $medicalHistory = $decoded['medical_history'] ?? [];

        return [
            'chief_complaint' => (string) ($caseHistory['cc'] ?? ''),
            'diagnosis' => (string) ($diagnosis['diagnosis'] ?? ''),
            'management_plan' => (string) ($diagnosis['management_plan'] ?? ''),
            'prescription' => (string) (($diagnosis['prescription'] ?? '') ?: $this->buildPrescriptionSummaryFromEyes($decoded['spectacle_rx'] ?? [], $decoded['refraction']['subjective'] ?? [])),
            'followup_date' => (string) ($diagnosis['followup_date'] ?? ''),
            'followup_notes' => (string) ($diagnosis['followup_notes'] ?? ''),
            'medical_flags' => $this->extractActiveMedicalFlags($medicalHistory),
        ];
    }

    private function buildPrescriptionSummaryFromEyes(array $eyes, array $fallbackEyes = []): string
    {
        $lines = [];

        foreach (['od' => 'OD', 'os' => 'OS'] as $key => $label) {
            $primaryEye = $this->normalizeEyePrescription($eyes[$key] ?? []);
            $fallbackEye = $this->normalizeEyePrescription($fallbackEyes[$key] ?? []);
            $eye = array_filter([$primaryEye['sphere'], $primaryEye['cylinder'], $primaryEye['axis'], $primaryEye['add'], $primaryEye['va']], fn ($value) => filled($value))
                ? $primaryEye
                : $fallbackEye;
            $parts = array_filter([
                $eye['sphere'],
                $eye['cylinder'],
                $eye['axis'] !== '' ? 'x '.$eye['axis'] : '',
                $eye['add'] !== '' ? 'ADD '.$eye['add'] : '',
                $eye['va'] !== '' ? 'VA '.$eye['va'] : '',
            ], fn ($value) => filled($value));

            if ($parts !== []) {
                $lines[] = $label.': '.implode(' ', $parts);
            }
        }

        return implode("\n", $lines);
    }

    private function formatExamFormPrescriptionRow(object $record, object $form): ?array
    {
        $prescription = $this->extractPrescriptionFromFormData($form->form_data ?? null);

        if (! $prescription) {
            return null;
        }

        return [
            'patient_id' => $record->id,
            'folder_id' => $record->folder_id,
            'date' => $form->updated_at ? substr((string) $form->updated_at, 0, 10) : null,
            'sph_od' => $prescription['od']['sphere'] ?? '',
            'sph_os' => $prescription['os']['sphere'] ?? '',
            'cyl_od' => $prescription['od']['cylinder'] ?? '',
            'cyl_os' => $prescription['os']['cylinder'] ?? '',
            'axis_od' => $prescription['od']['axis'] ?? '',
            'axis_os' => $prescription['os']['axis'] ?? '',
            'add_od' => $prescription['od']['add'] ?? '',
            'add_os' => $prescription['os']['add'] ?? '',
            'ipd' => '',
            'lens_type' => $prescription['od']['lens_type'] ?? ($prescription['os']['lens_type'] ?? ''),
            'lens_material' => null,
            'color' => null,
            'notes' => $prescription['prescription_notes'] ?? '',
            'status' => $form->status ?? 'completed',
            'created_at' => $form->updated_at,
            'prescription_id' => 'FORM-'.$record->id.'-'.$form->version,
            'source' => 'exam_form',
            'form_version' => $form->version,
            'surname' => $record->surname ?? null,
            'firstname' => $record->firstname ?? null,
            'othernames' => $record->othernames ?? null,
            'name' => $record->name ?? null,
        ];
    }

    private function extractActiveMedicalFlags(array $medicalHistory): array
    {
        $labels = [];
        foreach (['pmhx', 'fmhx', 'fohx', 'pohx'] as $group) {
            $values = $medicalHistory[$group] ?? [];
            if (! is_array($values)) {
                continue;
            }

            foreach ($values as $key => $enabled) {
                if (! $enabled) {
                    continue;
                }

                $labels[] = strtoupper($group).': '.Str::upper((string) $key);
            }
        }

        return array_values($labels);
    }
}
