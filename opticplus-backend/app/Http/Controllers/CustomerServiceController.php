<?php

namespace App\Http\Controllers;

use Illuminate\Support\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

class CustomerServiceController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        $this->ensureSmsTemplateSchema();
        $branchId = $this->resolveBranchId($request);
        $patientRecordsHasEmail = Schema::hasColumn('patient_records', 'email');
        $patientRecordsHasPhone = Schema::hasColumn('patient_records', 'phone');
        $search = trim($request->string('search')->toString());
        $status = $request->string('status')->toString() ?: 'all';
        $paymentStatus = $request->string('payment_status')->toString() ?: 'all';
        $dateFrom = $request->string('date_from')->toString();
        $dateTo = $request->string('date_to')->toString();
        $page = max((int) $request->integer('page', 1), 1);
        $perPage = min(max((int) $request->integer('per_page', 12), 8), 30);
        $offset = ($page - 1) * $perPage;

        $query = DB::table('billing as b')
            ->leftJoin('patient_records as pr', 'b.folder_id', '=', 'pr.folder_id')
            ->leftJoin('glasses_prescriptions as gp', function ($join) use ($branchId): void {
                $join->on('b.id', '=', 'gp.prescription_id');
                if ($branchId > 0) {
                    $join->where('gp.branch_id', '=', $branchId);
                }
            })
            ->where(function ($inner): void {
                $inner->where('b.lens_price', '>', 0)
                    ->orWhere('b.total_amount', '>', 0);
            });
        $this->applyBranchScope($query, 'b.branch_id', $branchId);

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($inner) use ($like, $patientRecordsHasEmail, $patientRecordsHasPhone): void {
                $inner->where('b.name', 'like', $like)
                    ->orWhere('b.folder_id', 'like', $like)
                    ->orWhere('b.receipt_number', 'like', $like);

                if ($patientRecordsHasPhone) {
                    $inner->orWhere('pr.phone', 'like', $like);
                }

                if ($patientRecordsHasEmail) {
                    $inner->orWhere('pr.email', 'like', $like);
                }
            });
        }

        if ($status !== 'all') {
            if ($status === 'not_ready') {
                $query->where(function ($inner): void {
                    $inner->whereNull('gp.status')
                        ->orWhereIn('gp.status', ['pending', '']);
                });
            } else {
                $query->where('gp.status', $status);
            }
        }

        if ($paymentStatus !== 'all') {
            match ($paymentStatus) {
                'paid' => $query->where('b.balance', '<=', 0),
                'partial' => $query->where('b.balance', '>', 0)->whereColumn('b.balance', '<', 'b.total_amount'),
                'owing' => $query->where('b.balance', '>', 0),
                default => null,
            };
        }

        if ($dateFrom !== '') {
            $query->whereDate('b.date', '>=', $dateFrom);
        }

        if ($dateTo !== '') {
            $query->whereDate('b.date', '<=', $dateTo);
        }

        $total = count((clone $query)->get(['b.id']));

        $recordColumns = [
            'b.id as billing_id',
            'b.branch_id',
            'b.patient_id',
            'b.folder_id',
            'b.name as patient_name',
            'b.total_amount',
            'b.balance',
            'b.date as billing_date',
            'b.status as billing_status',
            'b.health_insurance',
            'b.receipt_number',
            'gp.status as pickup_status',
            'gp.created_at as pickup_created_at',
            'gp.prescription_id',
        ];

        if ($patientRecordsHasPhone) {
            $recordColumns[] = 'pr.phone';
        } else {
            $recordColumns[] = DB::raw('NULL as phone');
        }

        if ($patientRecordsHasEmail) {
            $recordColumns[] = 'pr.email';
        } else {
            $recordColumns[] = DB::raw('NULL as email');
        }

        $records = $query
            ->orderByRaw("
                CASE
                    WHEN gp.status = 'ready' THEN 1
                    WHEN gp.status = 'notified' THEN 2
                    WHEN gp.status = 'picked_up' THEN 3
                    ELSE 4
                END
            ")
            ->orderByDesc('b.date')
            ->limit($perPage)
            ->offset($offset)
            ->get($recordColumns)
            ->map(function ($record) {
                $record->payment_status_display = match (true) {
                    (float) $record->balance <= 0 => 'Paid in Full',
                    (float) $record->balance < (float) $record->total_amount => 'Partial Payment',
                    default => 'Balance Remaining',
                };

                $record->pickup_status_display = match ($record->pickup_status) {
                    'ready' => 'Ready for Pickup',
                    'notified' => 'Notified',
                    'picked_up' => 'Picked Up',
                    default => 'Not Ready',
                };

                $record->branch_name = $this->branchName((int) ($record->branch_id ?? 0));

                return $record;
            });

        $templates = $this->templateQuery($branchId)
            ->orderByRaw('CASE WHEN branch_id IS NULL THEN 0 ELSE 1 END')
            ->orderBy('template_name')
            ->get([
                'id',
                'template_name',
                'message_text',
                'branch_id',
                'updated_at',
            ])
            ->map(function ($template) {
                $template->is_shared = $template->branch_id === null;
                $template->scope_label = $template->is_shared
                    ? 'Shared'
                    : $this->branchName((int) $template->branch_id);

                return $template;
            });

        $upcomingBirthdays = collect($this->upcomingBirthdayContacts($branchId, 10));
        $readyForPickup = tap(DB::table('billing as b'), function ($query) use ($branchId): void {
                $this->applyBranchScope($query, 'b.branch_id', $branchId);
            })
            ->leftJoin('patient_records as pr', 'b.folder_id', '=', 'pr.folder_id')
            ->leftJoin('glasses_prescriptions as gp', function ($join) use ($branchId): void {
                $join->on('b.id', '=', 'gp.prescription_id');
                if ($branchId > 0) {
                    $join->where('gp.branch_id', '=', $branchId);
                }
            })
            ->whereIn('gp.status', ['ready', 'notified'])
            ->orderByRaw("
                CASE
                    WHEN gp.status = 'ready' THEN 1
                    WHEN gp.status = 'notified' THEN 2
                    ELSE 3
                END
            ")
            ->orderByDesc('b.date')
            ->limit(10)
            ->get([
                'b.id as billing_id',
                'b.branch_id',
                'b.patient_id',
                'b.folder_id',
                'b.name as patient_name',
                'b.receipt_number',
                'b.balance',
                'b.date as billing_date',
                'pr.phone',
                'gp.status as pickup_status',
            ])
            ->map(function ($record) {
                $record->pickup_status_display = match ($record->pickup_status) {
                    'ready' => 'Ready for Pickup',
                    'notified' => 'Notified',
                    default => 'Not Ready',
                };
                $record->branch_name = $this->branchName((int) ($record->branch_id ?? 0));

                return $record;
            });

        return response()->json([
            'branch_id' => $branchId,
            'branch_name' => $this->branchName($branchId),
            'is_merged_view' => $branchId === 0,
            'filters' => [
                'search' => $search,
                'status' => $status,
                'payment_status' => $paymentStatus,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ],
            'stats' => [
                'ready_count' => (int) tap(DB::table('glasses_prescriptions'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->where('status', 'ready')->count(),
                'notified_count' => (int) tap(DB::table('glasses_prescriptions'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->where('status', 'notified')->count(),
                'picked_up_count' => (int) tap(DB::table('glasses_prescriptions'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))->where('status', 'picked_up')->count(),
                'templates_count' => $templates->count(),
                'upcoming_birthdays_count' => $upcomingBirthdays->count(),
            ],
            'integrations' => [
                'arkesel_configured' => $this->arkeselConfigured(),
            ],
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil(max($total, 1) / $perPage),
            ],
            'pickup_records' => $records,
            'ready_for_pickup' => $readyForPickup,
            'upcoming_birthdays' => $upcomingBirthdays,
            'templates' => $templates,
        ]);
    }

    public function storeTemplate(Request $request): JsonResponse
    {
        $this->ensureSmsTemplateSchema();
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        $validated = $request->validate([
            'template_name' => ['required', 'string', 'max:100'],
            'message_text' => ['required', 'string', 'max:5000'],
            'is_shared' => ['nullable', 'boolean'],
        ]);

        $isShared = (bool) ($validated['is_shared'] ?? false);

        $id = DB::table('sms_templates')->insertGetId([
            'template_name' => $validated['template_name'],
            'message_text' => $validated['message_text'],
            'branch_id' => $isShared ? null : $branchId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'message' => 'Template saved successfully.',
            'template_id' => $id,
        ], 201);
    }

    public function updateTemplate(Request $request, int $templateId): JsonResponse
    {
        $this->ensureSmsTemplateSchema();
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        $validated = $request->validate([
            'template_name' => ['required', 'string', 'max:100'],
            'message_text' => ['required', 'string', 'max:5000'],
            'is_shared' => ['nullable', 'boolean'],
        ]);

        $isShared = (bool) ($validated['is_shared'] ?? false);

        $this->templateQuery($branchId)
            ->where('id', $templateId)
            ->update([
                'template_name' => $validated['template_name'],
                'message_text' => $validated['message_text'],
                'branch_id' => $isShared ? null : $branchId,
                'updated_at' => now(),
            ]);

        return response()->json([
            'message' => 'Template updated successfully.',
        ]);
    }

    public function deleteTemplate(Request $request, int $templateId): JsonResponse
    {
        $this->ensureSmsTemplateSchema();
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $this->templateQuery($branchId)
            ->where('id', $templateId)
            ->delete();

        return response()->json([
            'message' => 'Template deleted successfully.',
        ]);
    }

    public function sendMessage(Request $request): JsonResponse
    {
        $this->ensureSmsTemplateSchema();
        $branchId = $this->resolveBranchId($request);
        $validated = $request->validate([
            'mode' => ['required', 'in:single,bulk'],
            'template_id' => ['nullable', 'integer'],
            'message' => ['nullable', 'string', 'max:5000'],
            'phone' => ['nullable', 'string', 'max:50'],
            'patient_id' => ['nullable', 'integer'],
            'recipient_type' => ['nullable', 'in:all_patients,birthday_patients,glasses_ready,national_holidays'],
            'mark_notified' => ['nullable', 'boolean'],
        ]);

        $templateMessage = '';
        if (! empty($validated['template_id'])) {
            $templateQuery = $this->templateQuery($branchId)
                ->where('id', $validated['template_id']);
            $templateMessage = (string) $templateQuery->value('message_text');
        }

        $message = trim((string) ($validated['message'] ?? $templateMessage));
        if ($message === '') {
            return response()->json([
                'message' => 'Enter a message or choose a template first.',
            ], 422);
        }

        if (! $this->arkeselConfigured()) {
            return response()->json([
                'message' => 'Arkesel is not configured yet. Add ARKESEL_API_KEY and ARKESEL_SENDER_ID to the backend .env file first.',
            ], 503);
        }

        if ($validated['mode'] === 'single') {
            if (empty($validated['phone'])) {
                return response()->json(['message' => 'Phone number is required.'], 422);
            }

            $recipient = $this->normalizeGhanaPhone($validated['phone']);
            if (! $recipient) {
                return response()->json(['message' => 'Enter a valid Ghana phone number for SMS sending.'], 422);
            }

            try {
                $dispatch = $this->dispatchSms([$recipient], $message);
            } catch (\RuntimeException $exception) {
                return response()->json([
                    'message' => $exception->getMessage(),
                ], 502);
            }

            if (! empty($validated['mark_notified']) && ! empty($validated['patient_id'])) {
                $notificationQuery = DB::table('glasses_prescriptions')
                    ->where('patient_id', $validated['patient_id'])
                    ->where('status', 'ready');
                $this->applyBranchScope($notificationQuery, 'branch_id', $branchId);
                $notificationQuery->update(['status' => 'notified']);
            }

            return response()->json([
                'message' => 'Message sent successfully.',
                'dispatch_mode' => 'single',
                'recipients' => 1,
                'preview_message' => $message,
                'provider' => 'arkesel',
                'provider_response' => $dispatch,
            ]);
        }

        $recipientType = $validated['recipient_type'] ?? 'all_patients';
        $recipientQuery = DB::table('patient_records')
            ->whereNotNull('phone');
        $this->applyBranchScope($recipientQuery, 'patient_records.branch_id', $branchId);

        if ($recipientType === 'birthday_patients') {
            $numbers = collect($this->upcomingBirthdayContacts($branchId, 100))
                ->pluck('phone')
                ->map(fn ($phone) => $this->normalizeGhanaPhone($phone))
                ->filter()
                ->unique()
                ->values()
                ->all();

            if (! count($numbers)) {
                return response()->json([
                    'message' => 'No valid recipient phone numbers were found for the selected recipient group.',
                ], 422);
            }

            try {
                $dispatch = $this->dispatchSms($numbers, $message);
            } catch (\RuntimeException $exception) {
                return response()->json([
                    'message' => $exception->getMessage(),
                ], 502);
            }

            return response()->json([
                'message' => 'Bulk message sent successfully.',
                'dispatch_mode' => 'bulk',
                'recipient_type' => $recipientType,
                'recipients' => count($numbers),
                'preview_message' => $message,
                'provider' => 'arkesel',
                'provider_response' => $dispatch,
            ]);
        }

        if ($recipientType === 'glasses_ready') {
            $recipientQuery
                ->join('glasses_prescriptions as gp', function ($join) use ($branchId): void {
                    $join->on('patient_records.id', '=', 'gp.patient_id')
                        ->whereIn('gp.status', ['ready', 'notified']);
                    if ($branchId > 0) {
                        $join->where('gp.branch_id', '=', $branchId);
                    }
                })
                ->select('patient_records.id', 'patient_records.firstname', 'patient_records.phone');
        } else {
            $recipientQuery->select('id', 'firstname', 'phone');
        }

        $recipients = $recipientQuery->distinct()->get();
        $numbers = $recipients
            ->map(fn ($recipient) => $this->normalizeGhanaPhone($recipient->phone ?? null))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (! count($numbers)) {
            return response()->json([
                'message' => 'No valid recipient phone numbers were found for the selected recipient group.',
            ], 422);
        }

        try {
            $dispatch = $this->dispatchSms($numbers, $message);
        } catch (\RuntimeException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 502);
        }

        if (! empty($validated['mark_notified']) && $recipientType === 'glasses_ready') {
            $readyQuery = DB::table('glasses_prescriptions')
                ->where('status', 'ready');
            $this->applyBranchScope($readyQuery, 'branch_id', $branchId);
            $readyQuery->update(['status' => 'notified']);
        }

        return response()->json([
            'message' => 'Bulk message sent successfully.',
            'dispatch_mode' => 'bulk',
            'recipient_type' => $recipientType,
            'recipients' => count($numbers),
            'preview_message' => $message,
            'provider' => 'arkesel',
            'provider_response' => $dispatch,
        ]);
    }

    public function markReady(Request $request, int $billingId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }
        $billing = DB::table('billing')
            ->where('branch_id', $branchId)
            ->where('id', $billingId)
            ->first(['id', 'patient_id', 'folder_id', 'date', 'lens_price']);

        if (! $billing) {
            return response()->json(['message' => 'Billing record not found.'], 404);
        }

        $prescriptionTable = DB::table('glasses_prescriptions');
        $hasBranchColumn = Schema::hasColumn('glasses_prescriptions', 'branch_id');
        $hasStatusColumn = Schema::hasColumn('glasses_prescriptions', 'status');
        $hasLensPriceColumn = Schema::hasColumn('glasses_prescriptions', 'lens_price');
        $hasCreatedAtColumn = Schema::hasColumn('glasses_prescriptions', 'created_at');
        $hasUpdatedAtColumn = Schema::hasColumn('glasses_prescriptions', 'updated_at');

        $matchColumns = ['prescription_id'];
        if ($billing->patient_id) {
            $matchColumns[] = 'patient_id';
        }
        if ($billing->folder_id) {
            $matchColumns[] = 'folder_id';
        }
        if ($hasBranchColumn) {
            $matchColumns[] = 'branch_id';
        }

        $existingQuery = $prescriptionTable->where('prescription_id', $billing->id);
        if ($hasBranchColumn) {
            $existingQuery->where('branch_id', $branchId);
        }

        if ($billing->patient_id) {
            $existingQuery->orWhere(function ($query) use ($billing): void {
                $query->where('patient_id', $billing->patient_id);
            });
        }

        if ($billing->folder_id) {
            $existingQuery->orWhere(function ($query) use ($billing): void {
                $query->where('folder_id', $billing->folder_id);
            });
        }

        $existing = $existingQuery
            ->orderByDesc('prescription_id')
            ->first($matchColumns);

        $payload = [
            'prescription_id' => $billing->id,
            'patient_id' => $billing->patient_id ?: 0,
            'folder_id' => $billing->folder_id ?: '',
            'date' => $billing->date ?: now()->toDateString(),
        ];

        if ($hasBranchColumn) {
            $payload['branch_id'] = $branchId;
        }

        if ($hasStatusColumn) {
            $payload['status'] = 'ready';
        }

        if ($hasLensPriceColumn) {
            $payload['lens_price'] = $billing->lens_price ?? 0;
        }

        if ($hasUpdatedAtColumn) {
            $payload['updated_at'] = now();
        }

        if ($existing) {
            $updateQuery = $prescriptionTable->where('prescription_id', $existing->prescription_id);

            if (property_exists($existing, 'patient_id') && $existing->patient_id !== null) {
                $updateQuery->where('patient_id', $existing->patient_id);
            }

            if ($hasBranchColumn && property_exists($existing, 'branch_id')) {
                $updateQuery->where('branch_id', $existing->branch_id);
            }

            $updateQuery->update($payload);
        } else {
            if ($hasCreatedAtColumn) {
                $payload['created_at'] = now();
            }

            $prescriptionTable->insert($payload);
        }

        return response()->json([
            'message' => 'Marked as ready for pickup.',
        ]);
    }

    public function markPickedUp(Request $request, int $billingId): JsonResponse
    {
        $branchId = $this->resolveBranchId($request);
        if ($response = $this->ensureWritableBranch($branchId)) {
            return $response;
        }

        $updateQuery = DB::table('glasses_prescriptions')
            ->where('prescription_id', $billingId);

        if (Schema::hasColumn('glasses_prescriptions', 'branch_id')) {
            $updateQuery->where('branch_id', $branchId);
        }

        $payload = ['status' => 'picked_up'];
        if (Schema::hasColumn('glasses_prescriptions', 'updated_at')) {
            $payload['updated_at'] = now();
        }

        $updateQuery->update($payload);

        return response()->json([
            'message' => 'Pickup confirmed successfully.',
        ]);
    }

    private function resolveBranchId(Request $request): int
    {
        $user = $request->user();

        if (! $user->isAdmin()) {
            return (int) $user->branch_id;
        }

        $requestedBranchId = (int) $request->integer('branch_id');

        return in_array($requestedBranchId, [0, 1, 2], true) ? $requestedBranchId : 1;
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
            'message' => 'Merged mode is read-only. Switch to a branch before changing customer service records or templates.',
        ], 422);
    }

    private function arkeselConfigured(): bool
    {
        return filled(config('services.arkesel.api_key')) && filled(config('services.arkesel.sender_id'));
    }

    private function templateQuery(int $branchId)
    {
        $query = DB::table('sms_templates');

        if ($branchId === 0) {
            return $query;
        }

        return $query->where(function ($inner) use ($branchId): void {
            $inner->where('branch_id', $branchId)
                ->orWhereNull('branch_id');
        });
    }

    private function ensureSmsTemplateSchema(): void
    {
        if (! Schema::hasTable('sms_templates')) {
            Schema::create('sms_templates', function (Blueprint $table): void {
                $table->id();
                $table->string('template_name', 100);
                $table->text('message_text');
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('sms_templates', 'branch_id')) {
            Schema::table('sms_templates', function (Blueprint $table): void {
                $table->unsignedInteger('branch_id')->nullable()->index()->after('message_text');
            });
        }

        if (! DB::table('sms_templates')->exists()) {
            foreach ($this->defaultSmsTemplates() as $template) {
                DB::table('sms_templates')->insert([
                    'template_name' => $template['template_name'],
                    'message_text' => $template['message_text'],
                    'branch_id' => $template['branch_id'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    private function defaultSmsTemplates(): array
    {
        return [
            [
                'branch_id' => 1,
                'template_name' => 'Pickup Ready',
                'message_text' => 'Your glasses are ready for pickup. Kindly visit Bealet Optical Centre, Labadi Branch, at your convenience. Thank you.',
            ],
            [
                'branch_id' => null,
                'template_name' => 'Birthday Greeting',
                'message_text' => 'Happy birthday from Bealet Optical Centre. We wish you a joyful celebration and clear vision always.',
            ],
            [
                'branch_id' => 2,
                'template_name' => 'Pickup Ready',
                'message_text' => 'Your glasses are ready for pickup. Kindly visit Bealet Optical Centre, Madina Branch, at your convenience. Thank you.',
            ],
            [
                'branch_id' => null,
                'template_name' => 'General Follow-up',
                'message_text' => 'Thank you for choosing Bealet Optical Centre. Kindly contact us if you need any follow-up support with your eye care or eyewear.',
            ],
        ];
    }

    private function upcomingBirthdayContacts(int $branchId, int $limit = 10): array
    {
        $today = Carbon::today();

        return tap(DB::table('patient_records'), fn ($query) => $this->applyBranchScope($query, 'branch_id', $branchId))
            ->whereNotNull('dob')
            ->where('dob', '!=', '')
            ->orderBy('surname')
            ->orderBy('firstname')
            ->get([
                'id',
                'branch_id',
                'folder_id',
                'surname',
                'firstname',
                'othernames',
                'name',
                'phone',
                'dob',
            ])
            ->map(function ($record) use ($today) {
                try {
                    $dob = Carbon::parse((string) $record->dob);
                } catch (\Throwable) {
                    return null;
                }

                $nextBirthday = $dob->copy()->year($today->year);
                if ($nextBirthday->lt($today)) {
                    $nextBirthday->addYear();
                }

                $daysUntil = $today->diffInDays($nextBirthday, false);
                if ($daysUntil < 0 || $daysUntil > 30) {
                    return null;
                }

                return [
                    'patient_id' => (int) $record->id,
                    'branch_id' => (int) ($record->branch_id ?? 0),
                    'branch_name' => $this->branchName((int) ($record->branch_id ?? 0)),
                    'folder_id' => $record->folder_id,
                    'name' => trim((string) ($record->name ?: implode(' ', array_filter([
                        $record->surname,
                        $record->firstname,
                        $record->othernames,
                    ])))),
                    'phone' => $record->phone,
                    'dob' => $record->dob,
                    'birthday_label' => $nextBirthday->format('M j'),
                    'days_until_birthday' => $daysUntil,
                ];
            })
            ->filter()
            ->sortBy([
                ['days_until_birthday', 'asc'],
                ['name', 'asc'],
            ])
            ->take($limit)
            ->values()
            ->all();
    }

    private function dispatchSms(array $recipients, string $message): array
    {
        $baseUrl = rtrim((string) config('services.arkesel.base_url'), '/');
        $endpoint = $baseUrl.'/sms/send';
        $senderId = trim((string) config('services.arkesel.sender_id'));
        if ($senderId !== '' && mb_strlen($senderId) > 11) {
            throw new \RuntimeException(sprintf(
                'Arkesel sender IDs must be 11 characters or fewer (Arkesel API limit). Shorten ARKESEL_SENDER_ID in your `.env` to a sender Arkesel has approved — current value is %d characters.',
                mb_strlen($senderId),
            ));
        }

        $response = Http::timeout(30)
            ->withHeaders([
                'api-key' => (string) config('services.arkesel.api_key'),
                'Accept' => 'application/json',
            ])
            ->post($endpoint, [
                'sender' => $senderId,
                'message' => $message,
                'recipients' => array_values($recipients),
            ]);

        if (! $response->successful()) {
            $payload = $response->json();

            throw new \RuntimeException(
                $payload['message']
                    ?? $payload['error']
                    ?? 'Arkesel rejected the SMS request. Check your API key, sender ID, and recipient numbers.',
            );
        }

        return $response->json() ?? ['status' => true];
    }

    private function normalizeGhanaPhone(?string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone);
        if (! $digits) {
            return null;
        }

        if (str_starts_with($digits, '233') && strlen($digits) === 12) {
            return $digits;
        }

        if (str_starts_with($digits, '0') && strlen($digits) === 10) {
            return '233'.substr($digits, 1);
        }

        if (strlen($digits) === 9) {
            return '233'.$digits;
        }

        return null;
    }
}
