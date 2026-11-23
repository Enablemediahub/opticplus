<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StaffHrController extends Controller
{
    public function mySignature(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $signature = DB::table('hr_staff_signatures')->where('employee_id', $employee->id)->first();
        if (! $signature || ! Storage::disk('local')->exists($signature->file_path)) {
            return response()->json(['signature' => null]);
        }
        $contents = Storage::disk('local')->get($signature->file_path);
        return response()->json([
            'signature' => 'data:'.$signature->mime_type.';base64,'.base64_encode($contents),
            'updated_at' => $signature->updated_at,
        ]);
    }

    public function saveSignature(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $validated = $request->validate([
            'signature' => ['required', 'file', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
        ]);
        $old = DB::table('hr_staff_signatures')->where('employee_id', $employee->id)->first();
        $file = $validated['signature'];
        $path = $file->store('hr-signatures', 'local');
        $mime = $file->getMimeType() ?: 'image/png';
        if ($old) {
            DB::table('hr_staff_signatures')->where('employee_id', $employee->id)->update([
                'file_path' => $path,
                'mime_type' => $mime,
                'updated_at' => now(),
            ]);
            if ($old->file_path !== $path) Storage::disk('local')->delete($old->file_path);
        } else {
            DB::table('hr_staff_signatures')->insert([
                'employee_id' => $employee->id,
                'file_path' => $path,
                'mime_type' => $mime,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        return $this->mySignature($request)->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function deleteSignature(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $signature = DB::table('hr_staff_signatures')->where('employee_id', $employee->id)->first();
        if ($signature) {
            DB::table('hr_staff_signatures')->where('employee_id', $employee->id)->delete();
            Storage::disk('local')->delete($signature->file_path);
        }
        return response()->json(['message' => 'Saved signature removed.', 'signature' => null]);
    }

    public function myLetters(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        if (! $this->letterSignatureWorkflowReady()) {
            return response()->json([
                'message' => 'Staff letter signing is not configured. Run the latest database migrations, including 2026_11_23_000001_add_staff_letter_signature_workflow.',
            ], 503);
        }

        $letters = DB::table('hr_letters as letter')
            ->leftJoin('hr_letter_signatures as signing', function ($join) use ($employee): void {
                $join->on('signing.letter_id', '=', 'letter.id')
                    ->where('signing.employee_id', '=', $employee->id);
            })
            ->where('letter.status', 'published')
            ->where(function ($query) use ($employee): void {
                $query->where('letter.employee_id', $employee->id)
                    ->orWhere(function ($circular) use ($employee): void {
                        $circular->whereNull('letter.employee_id')->where(function ($role) use ($employee): void {
                            $role->whereNull('letter.target_role')
                                ->orWhereRaw('LOWER(TRIM(letter.target_role)) = ?', [mb_strtolower(trim((string) $employee->job_title))]);
                        });
                    });
            })
            ->orderByDesc('letter.published_at')
            ->get([
                'letter.id',
                'letter.title',
                'letter.body',
                'letter.published_at',
                'letter.attachment_name',
                'letter.requires_signature',
                'signing.signed_at',
                'signing.signature_path',
                'signing.mime_type as signature_mime_type',
            ])
            ->map(function ($letter) use ($employee) {
                $letter->body = strtr($letter->body, [
                    '{employee_name}' => $employee->ghana_card_name,
                    '{staff_id}' => $employee->staff_id,
                    '{job_title}' => $employee->job_title,
                    '{department}' => $employee->department,
                    '{date}' => $letter->published_at ? \Illuminate\Support\Carbon::parse($letter->published_at)->format('j F Y') : now()->format('j F Y'),
                ]);
                $letter->signed_signature = null;
                if ($letter->signed_at && $letter->signature_path) {
                    if (! Storage::disk('local')->exists($letter->signature_path)) {
                        abort(500, 'A submitted letter signature is missing from private storage.');
                    }
                    $contents = Storage::disk('local')->get($letter->signature_path);
                    $letter->signed_signature = 'data:'.$letter->signature_mime_type.';base64,'.base64_encode($contents);
                }
                unset($letter->signature_path, $letter->signature_mime_type);

                return $letter;
            });

        $managerSignature = $this->managerLetterSignatureData();

        return response()->json([
            'letters' => $letters,
            'manager_signature' => $managerSignature['data'] ?? null,
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function signLetter(Request $request, int $letterId): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        if (! $this->letterSignatureWorkflowReady()) {
            return response()->json([
                'message' => 'Staff letter signing is not configured. Run the latest database migrations, including 2026_11_23_000001_add_staff_letter_signature_workflow.',
            ], 503);
        }

        $signedPath = null;
        try {
            $signedAt = DB::transaction(function () use ($employee, $letterId, &$signedPath) {
                $letter = DB::table('hr_letters')
                    ->where('id', $letterId)
                    ->where('status', 'published')
                    ->where(function ($query) use ($employee): void {
                        $query->where('employee_id', $employee->id)
                            ->orWhere(function ($circular) use ($employee): void {
                                $circular->whereNull('employee_id')->where(function ($role) use ($employee): void {
                                    $role->whereNull('target_role')
                                        ->orWhereRaw('LOWER(TRIM(target_role)) = ?', [mb_strtolower(trim((string) $employee->job_title))]);
                                });
                            });
                    })
                    ->lockForUpdate()
                    ->first();
                if (! $letter) {
                    return response()->json(['message' => 'This letter is not available to your account.'], 404);
                }
                if (! $letter->requires_signature) {
                    return response()->json(['message' => 'This letter does not require a staff signature.'], 422);
                }

                $existing = DB::table('hr_letter_signatures')
                    ->where('letter_id', $letterId)
                    ->where('employee_id', $employee->id)
                    ->lockForUpdate()
                    ->first();
                if ($existing) {
                    return response()->json([
                        'message' => 'Your signature has already been submitted for this letter.',
                        'signed_at' => $existing->signed_at,
                    ], 409);
                }

                $signature = DB::table('hr_staff_signatures')->where('employee_id', $employee->id)->first();
                if (! $signature || ! Storage::disk('local')->exists($signature->file_path)) {
                    return response()->json(['message' => 'Save your reusable signature before signing this letter.'], 422);
                }

                $extension = match ($signature->mime_type) {
                    'image/jpeg' => 'jpg',
                    'image/webp' => 'webp',
                    default => 'png',
                };
                $signedPath = sprintf('hr-letter-signatures/%d/%d-%s.%s', $letterId, $employee->id, bin2hex(random_bytes(12)), $extension);
                if (! Storage::disk('local')->copy($signature->file_path, $signedPath)) {
                    $signedPath = null;
                    return response()->json(['message' => 'Your signature could not be attached to the letter. Please try again.'], 500);
                }

                $signedAt = now();
                DB::table('hr_letter_signatures')->insert([
                    'letter_id' => $letterId,
                    'employee_id' => $employee->id,
                    'signature_path' => $signedPath,
                    'mime_type' => $signature->mime_type,
                    'signed_at' => $signedAt,
                    'created_at' => $signedAt,
                    'updated_at' => $signedAt,
                ]);

                return $signedAt;
            });
        } catch (\Throwable $error) {
            if ($signedPath) {
                Storage::disk('local')->delete($signedPath);
            }
            throw $error;
        }

        if ($signedAt instanceof JsonResponse) {
            return $signedAt;
        }

        $signedRecord = DB::table('hr_letter_signatures')
            ->where('letter_id', $letterId)
            ->where('employee_id', $employee->id)
            ->first();
        if (! $signedRecord || ! Storage::disk('local')->exists($signedRecord->signature_path)) {
            abort(500, 'The submitted letter signature is missing from private storage.');
        }

        return response()->json([
            'message' => 'Your signature has been submitted to HR.',
            'signed_at' => $signedAt,
            'signed_signature' => 'data:'.$signedRecord->mime_type.';base64,'.base64_encode(Storage::disk('local')->get($signedRecord->signature_path)),
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function myCommunications(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        if (! Schema::hasTable('hr_staff_communications') || ! Schema::hasTable('hr_staff_communication_reads')) {
            return response()->json(['communications' => [], 'unread_count' => 0])
                ->header('Cache-Control', 'private, no-store, max-age=0');
        }

        $communications = DB::table('hr_staff_communications as communication')
            ->leftJoin('hr_staff_communication_reads as read_record', function ($join) use ($employee): void {
                $join->on('read_record.communication_id', '=', 'communication.id')
                    ->where('read_record.employee_id', '=', $employee->id);
            })
            ->whereNotNull('communication.published_at')
            ->where(fn ($query) => $query->whereNull('communication.employee_id')
                ->orWhere('communication.employee_id', $employee->id))
            ->orderByDesc('communication.published_at')
            ->get([
                'communication.id',
                'communication.title',
                'communication.message',
                'communication.attachment_name',
                'communication.published_at',
                'read_record.read_at',
            ]);

        return response()->json([
            'communications' => $communications,
            'unread_count' => $communications->whereNull('read_at')->count(),
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function markCommunicationRead(Request $request, int $communicationId): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        if (! Schema::hasTable('hr_staff_communications') || ! Schema::hasTable('hr_staff_communication_reads')) {
            return response()->json(['message' => 'Staff communications are not configured yet.'], 503);
        }
        $communication = DB::table('hr_staff_communications')
            ->where('id', $communicationId)
            ->whereNotNull('published_at')
            ->where(fn ($query) => $query->whereNull('employee_id')->orWhere('employee_id', $employee->id))
            ->first();
        if (! $communication) {
            return response()->json(['message' => 'This message or document is not available to your account.'], 404);
        }

        $now = now();
        DB::table('hr_staff_communication_reads')->insertOrIgnore([
            'communication_id' => $communicationId,
            'employee_id' => $employee->id,
            'read_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $readAt = DB::table('hr_staff_communication_reads')
            ->where('communication_id', $communicationId)
            ->where('employee_id', $employee->id)
            ->value('read_at');

        return response()->json(['read_at' => $readAt]);
    }

    public function downloadMyCommunicationAttachment(Request $request, int $communicationId): StreamedResponse|JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        if (! Schema::hasTable('hr_staff_communications')) {
            return response()->json(['message' => 'Staff communications are not configured yet.'], 503);
        }
        $communication = DB::table('hr_staff_communications')
            ->where('id', $communicationId)
            ->whereNotNull('published_at')
            ->where(fn ($query) => $query->whereNull('employee_id')->orWhere('employee_id', $employee->id))
            ->first();

        return $this->downloadAttachment($communication);
    }

    public function viewMyCommunicationAttachment(Request $request, int $communicationId): StreamedResponse|JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        if (! Schema::hasTable('hr_staff_communications')) {
            return response()->json(['message' => 'Staff communications are not configured yet.'], 503);
        }
        $communication = DB::table('hr_staff_communications')
            ->where('id', $communicationId)
            ->whereNotNull('published_at')
            ->where(fn ($query) => $query->whereNull('employee_id')->orWhere('employee_id', $employee->id))
            ->first();

        return $this->viewCommunicationAttachment($communication);
    }

    public function createCommunication(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! Schema::hasTable('hr_staff_communications') || ! Schema::hasTable('hr_staff_communication_reads')) {
            return response()->json([
                'message' => 'Run database/manual_sql/hr_staff_communications.sql before sending staff messages or documents.',
            ], 503);
        }

        $validated = $request->validate([
            'employee_id' => ['nullable', 'integer', Rule::exists('employees_comprehensive', 'id')->where('status', 'active')],
            'title' => ['required', 'string', 'max:180'],
            'message' => ['nullable', 'string', 'max:10000'],
            'attachment' => ['nullable', 'file', 'mimes:pdf', 'max:20480'],
        ]);
        $message = trim((string) ($validated['message'] ?? ''));
        if ($message === '' && ! $request->hasFile('attachment')) {
            return response()->json(['message' => 'Add a message or attach a PDF before publishing.'], 422);
        }

        $attachmentPath = null;
        $attachmentName = null;
        if ($request->hasFile('attachment')) {
            $file = $request->file('attachment');
            $attachmentPath = $file->store('hr-staff-communications', 'local');
            if (! $attachmentPath) {
                return response()->json(['message' => 'The PDF could not be saved. Check private storage permissions and try again.'], 500);
            }
            $attachmentName = mb_substr(
                preg_replace('/[\x00-\x1F\x7F]/u', '', basename($file->getClientOriginalName())),
                0,
                255,
            );
        }

        $id = DB::table('hr_staff_communications')->insertGetId([
            'employee_id' => $validated['employee_id'] ?? null,
            'title' => $validated['title'],
            'message' => $message !== '' ? $message : null,
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'created_by' => $request->user()->id,
            'published_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Staff update published.', 'id' => $id], 201);
    }

    public function deleteCommunication(Request $request, int $communicationId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! Schema::hasTable('hr_staff_communications') || ! Schema::hasTable('hr_staff_communication_reads')) {
            return response()->json(['message' => 'Staff communications are not configured yet.'], 503);
        }
        $communication = DB::table('hr_staff_communications')->where('id', $communicationId)->first();
        if (! $communication) {
            return response()->json(['message' => 'Staff update not found.'], 404);
        }

        DB::table('hr_staff_communication_reads')->where('communication_id', $communicationId)->delete();
        DB::table('hr_staff_communications')->where('id', $communicationId)->delete();
        if ($communication->attachment_path) {
            Storage::disk('local')->delete($communication->attachment_path);
        }

        return response()->json(['message' => 'Staff update removed.']);
    }

    public function managerLetterSignature(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! Schema::hasTable('hr_letter_manager_signatures')) {
            return response()->json([
                'message' => 'Run database/manual_sql/hr_letter_manager_signature.sql before uploading a reusable letter signature.',
            ], 503);
        }

        $signature = $this->managerLetterSignatureData();

        return response()->json([
            'signature' => $signature['data'] ?? null,
            'updated_at' => $signature['updated_at'] ?? null,
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function saveManagerLetterSignature(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! Schema::hasTable('hr_letter_manager_signatures')) {
            return response()->json([
                'message' => 'Run database/manual_sql/hr_letter_manager_signature.sql before uploading a reusable letter signature.',
            ], 503);
        }

        $validated = $request->validate([
            'signature' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
        ]);
        $old = DB::table('hr_letter_manager_signatures')->where('id', 1)->first();
        $file = $validated['signature'];
        $path = $file->store('hr-letter-manager-signatures', 'local');
        if (! $path) {
            return response()->json(['message' => 'The signature image could not be saved. Check private storage permissions and try again.'], 500);
        }

        $now = now();
        if ($old) {
            DB::table('hr_letter_manager_signatures')->where('id', 1)->update([
                'file_path' => $path,
                'mime_type' => $file->getMimeType() ?: 'image/png',
                'updated_at' => $now,
            ]);
        } else {
            DB::table('hr_letter_manager_signatures')->insert([
                'id' => 1,
                'file_path' => $path,
                'mime_type' => $file->getMimeType() ?: 'image/png',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
        if ($old && $old->file_path !== $path) {
            Storage::disk('local')->delete($old->file_path);
        }

        $signature = $this->managerLetterSignatureData();

        return response()->json([
            'message' => 'Reusable General Manager letter signature saved. It will appear on letters available to staff.',
            'signature' => $signature['data'] ?? null,
            'updated_at' => $signature['updated_at'] ?? null,
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function deleteManagerLetterSignature(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! Schema::hasTable('hr_letter_manager_signatures')) {
            return response()->json([
                'message' => 'Run database/manual_sql/hr_letter_manager_signature.sql before managing the reusable letter signature.',
            ], 503);
        }

        $signature = DB::table('hr_letter_manager_signatures')->where('id', 1)->first();
        if ($signature) {
            DB::table('hr_letter_manager_signatures')->where('id', 1)->delete();
            Storage::disk('local')->delete($signature->file_path);
        }

        return response()->json(['message' => 'Reusable General Manager letter signature removed.']);
    }

    public function payroll(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $kpiAllowances = DB::table('hr_kpi_results as result')
            ->join('hr_kpi_rules as rule', 'rule.id', '=', 'result.rule_id')
            ->where('result.employee_id', $employee->id)
            ->where('result.status', 'published')
            ->orderByDesc('result.period')
            ->get(['result.period', 'result.score', 'result.calculated_allowance', 'rule.title']);
        if (! \Illuminate\Support\Facades\Schema::hasTable('payroll_history')) {
            return response()->json(['current_salary' => (float) $employee->salary, 'payroll' => [], 'kpi_allowances' => $kpiAllowances, 'currency' => 'GHS']);
        }
        $columns = ['id', 'employee_id', 'gross_salary', 'advance_deduction', 'net_salary', 'pay_month', 'pay_year', 'payment_date', 'payment_method'];
        foreach (['declared_salary', 'allowance_amount', 'declared_paid', 'allowance_paid'] as $optional) {
            if (\Illuminate\Support\Facades\Schema::hasColumn('payroll_history', $optional)) {
                $columns[] = $optional;
            }
        }

        $records = DB::table('payroll_history')
            ->where('employee_id', $employee->id)
            ->orderByDesc('pay_year')
            ->orderByDesc('pay_month')
            ->orderByDesc('id')
            ->limit(36)
            ->get($columns);
        return response()->json([
            'current_salary' => (float) $employee->salary,
            'payroll' => $records,
            'kpi_allowances' => $kpiAllowances,
            'currency' => 'GHS',
        ]);
    }

    public function myRequests(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $requests = DB::table('hr_requests')
            ->where('employee_id', $employee->id)
            ->orderByDesc('submitted_at')
            ->get(['id', 'request_type', 'leave_type', 'start_date', 'end_date', 'working_days_requested', 'working_days_approved', 'leave_remuneration', 'handover_person', 'outstanding_duties', 'notification_date', 'reason', 'attachment_name', 'status', 'review_note', 'reviewed_at', 'submitted_at']);
        return response()->json(['requests' => $requests]);
    }

    public function myLeave(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $year = (int) now()->format('Y');
        $entitlement = $this->ensureLeaveEntitlement($employee, $year);
        $approved = DB::table('hr_requests')->where('employee_id', $employee->id)->where('leave_year', $year)
            ->where('request_type', 'leave')->where('leave_type', 'annual')->where('status', 'approved')
            ->selectRaw('COALESCE(SUM(GREATEST(working_days_approved - interrupted_working_days, 0)), 0) as days')->value('days');
        $pending = DB::table('hr_requests')->where('employee_id', $employee->id)->where('leave_year', $year)
            ->where('request_type', 'leave')->where('leave_type', 'annual')->where('status', 'pending')
            ->sum('working_days_requested');
        $holidays = DB::table('hr_public_holidays')->whereBetween('holiday_date', [$year.'-01-01', ($year + 1).'-12-31'])
            ->orderBy('holiday_date')->get(['holiday_date', 'name']);
        $workingDays = $entitlement ? json_decode($entitlement->working_days ?: '[]', true) : [1, 2, 3, 4, 5, 6];
        if (! is_array($workingDays) || ! count($workingDays)) $workingDays = [1, 2, 3, 4, 5, 6];
        $daysEntitled = (float) ($entitlement->entitlement_days ?? 0);
        $carry = (float) ($entitlement->carried_forward_days ?? 0);
        $used = (float) $approved;

        return response()->json([
            'year' => $year,
            'entitlement_days' => $daysEntitled,
            'carried_forward_days' => $carry,
            'days_used' => $used,
            'pending_days' => (float) $pending,
            'days_available' => max(0, $daysEntitled + $carry - $used - (float) $pending),
            'working_days' => array_values(array_map('intval', $workingDays)),
            'public_holidays' => $holidays,
            'adjustment_note' => $entitlement->adjustment_note ?? null,
        ]);
    }

    public function submitRequest(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $validated = $request->validate([
            'request_type' => ['required', Rule::in(['leave', 'excuse_duty', 'medical_report'])],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'reason' => ['required', 'string', 'max:5000'],
            'leave_type' => ['required_if:request_type,leave', 'nullable', Rule::in(['annual', 'sick', 'maternity', 'compassionate', 'unpaid', 'other'])],
            'working_days_requested' => ['nullable', 'numeric', 'min:0', 'max:366'],
            'handover_person' => ['nullable', 'string', 'max:180'],
            'outstanding_duties' => ['nullable', 'string', 'max:1200'],
            'notification_date' => ['nullable', 'date'],
            'attachment' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ]);

        $leaveYear = (int) Carbon::parse($validated['start_date'])->format('Y');
        $leaveType = $validated['request_type'] === 'leave' ? $validated['leave_type'] : null;
        $daysRequested = null;
        if ($validated['request_type'] === 'leave' && $leaveType === 'annual') {
            $start = Carbon::parse($validated['start_date'])->startOfDay();
            $end = Carbon::parse($validated['end_date'])->startOfDay();
            if ($start->year !== $end->year) return response()->json(['message' => 'Submit annual leave dates within one calendar year. Split requests that cross into another year.'], 422);
            $entitlement = $this->ensureLeaveEntitlement($employee, $leaveYear);
            $daysRequested = $this->countScheduledWorkingDays($start, $end, $entitlement->working_days);
            if ($daysRequested < 1) return response()->json(['message' => 'The selected dates contain no scheduled working days.'], 422);
            $declaredDays = (float) ($validated['working_days_requested'] ?? $daysRequested);
            if (abs($declaredDays - $daysRequested) > 0.01) {
                return response()->json(['message' => 'The requested working-day count changed. Refresh the form and review the updated count.'], 422);
            }
            $this->assertAnnualLeaveBalance($employee->id, $leaveYear, $daysRequested);
        }

        $attachmentPath = null;
        $attachmentName = null;
        if ($request->hasFile('attachment')) {
            $file = $request->file('attachment');
            $attachmentPath = $file->store('hr-private', 'local');
            $attachmentName = mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', '', basename($file->getClientOriginalName())), 0, 255);
        }

        $id = DB::table('hr_requests')->insertGetId([
            'employee_id' => $employee->id,
            'request_type' => $validated['request_type'],
            'leave_type' => $leaveType,
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'],
            'working_days_requested' => $daysRequested,
            'handover_person' => $validated['handover_person'] ?? null,
            'outstanding_duties' => $validated['outstanding_duties'] ?? null,
            'notification_date' => $validated['notification_date'] ?? null,
            'leave_year' => $leaveType === 'annual' ? $leaveYear : null,
            'reason' => $validated['reason'],
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'status' => 'pending',
            'submitted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Your HR request has been submitted.', 'id' => $id], 201);
    }

    public function myKpi(Request $request): JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $results = DB::table('hr_kpi_results as result')
            ->join('hr_kpi_rules as rule', 'rule.id', '=', 'result.rule_id')
            ->where('result.employee_id', $employee->id)
            ->where('result.status', 'published')
            ->orderByDesc('result.period')
            ->get([
                'result.id', 'result.period', 'result.score', 'result.calculated_allowance', 'result.status',
                'rule.title', 'rule.description', 'rule.target_value',
            ]);

        $assessments = collect();
        if ($this->hasKpiFramework()) {
            $assessments = DB::table('hr_kpi_assessments')
                ->where('employee_id', $employee->id)
                ->where('status', 'published')
                ->orderByDesc('period')
                ->get();
            $itemsByAssessment = DB::table('hr_kpi_assessment_items')
                ->whereIn('assessment_id', $assessments->pluck('id'))
                ->orderBy('id')
                ->get()
                ->groupBy('assessment_id');
            $assessments = $assessments->map(function ($assessment) use ($itemsByAssessment) {
                $assessment->items = $itemsByAssessment->get($assessment->id, collect())->values();

                return $assessment;
            });
        }

        return response()->json(['results' => $results, 'assessments' => $assessments]);
    }

    public function commentOnKpiAssessment(Request $request, int $assessmentId): JsonResponse
    {
        if (! $this->hasKpiFramework()) {
            return response()->json(['message' => 'The KPI scorecard framework is not configured yet.'], 503);
        }
        $employee = $request->attributes->get('staff_portal_account');
        $validated = $request->validate([
            'employee_comment' => ['required', 'string', 'max:5000'],
        ]);
        $assessment = DB::table('hr_kpi_assessments')
            ->where('id', $assessmentId)
            ->where('employee_id', $employee->id)
            ->where('status', 'published')
            ->first();
        if (! $assessment) {
            return response()->json(['message' => 'Published KPI assessment not found.'], 404);
        }
        DB::table('hr_kpi_assessments')->where('id', $assessmentId)->update([
            'employee_comment' => trim($validated['employee_comment']),
            'employee_comment_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Your comment was sent to the General Manager.']);
    }

    public function downloadMyAttachment(Request $request, int $requestId): StreamedResponse|JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $record = DB::table('hr_requests')->where('id', $requestId)->where('employee_id', $employee->id)->first();
        return $this->downloadAttachment($record);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;

        $requiredSchema = [
            'employees_comprehensive' => ['id', 'status', 'ghana_card_name', 'staff_id', 'job_title', 'department', 'branch', 'salary', 'photo_path', 'date_employed'],
            'hr_letters' => ['id', 'employee_id', 'target_role', 'title', 'body', 'attachment_path', 'attachment_name', 'requires_signature', 'status', 'created_by', 'published_at', 'created_at', 'updated_at'],
            'hr_letter_templates' => ['id', 'title', 'body', 'requires_signature', 'active', 'created_by', 'created_at', 'updated_at'],
            'hr_letter_signatures' => ['id', 'letter_id', 'employee_id', 'signature_path', 'mime_type', 'signed_at', 'created_at', 'updated_at'],
            'hr_requests' => ['id', 'employee_id', 'request_type', 'start_date', 'end_date', 'reason', 'attachment_path', 'attachment_name', 'status', 'review_note', 'reviewed_by', 'reviewed_at', 'submitted_at', 'created_at', 'updated_at'],
            'hr_kpi_rules' => ['id', 'title', 'description', 'target_value', 'full_score_allowance', 'active', 'created_by', 'created_at', 'updated_at'],
            'hr_kpi_results' => ['id', 'employee_id', 'rule_id', 'period', 'score', 'calculated_allowance', 'status', 'notes', 'evaluated_by', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at'],
        ];
        $missingSchema = [];
        foreach ($requiredSchema as $table => $columns) {
            if (! Schema::hasTable($table)) {
                $missingSchema[] = $table;
                continue;
            }
            foreach (array_diff($columns, Schema::getColumnListing($table)) as $column) {
                $missingSchema[] = $table.'.'.$column;
            }
        }
        if ($missingSchema) {
            return response()->json([
                'message' => 'HR Space cannot load because its database setup is incomplete. Missing: '.implode(', ', $missingSchema).'. Apply the required HR Space schema and upgrade SQL files from database/manual_sql, then reload.',
                'missing_schema' => $missingSchema,
            ], 503);
        }

        $letters = DB::table('hr_letters as letter')
            ->leftJoin('employees_comprehensive as employee', 'employee.id', '=', 'letter.employee_id')
            ->orderByDesc('letter.updated_at')
            ->get(['letter.*', 'employee.ghana_card_name as employee_name', 'employee.staff_id']);
        $letterSignatures = DB::table('hr_letter_signatures as signing')
            ->join('employees_comprehensive as employee', 'employee.id', '=', 'signing.employee_id')
            ->orderBy('signing.signed_at')
            ->get([
                'signing.letter_id',
                'signing.employee_id',
                'signing.signed_at',
                'employee.ghana_card_name as employee_name',
                'employee.staff_id',
            ])
            ->groupBy('letter_id');
        $letters = $letters->map(function ($letter) use ($letterSignatures) {
            $letter->signatures = $letterSignatures->get($letter->id, collect())->values();

            return $letter;
        });
        $templates = DB::table('hr_letter_templates')->orderByDesc('active')->orderBy('title')->get();
        $requests = DB::table('hr_requests as item')
            ->join('employees_comprehensive as employee', 'employee.id', '=', 'item.employee_id')
            ->orderByRaw("CASE WHEN item.status = 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('item.submitted_at')
            ->get(['item.*', 'employee.ghana_card_name as employee_name', 'employee.staff_id', 'employee.job_title']);
        $employees = DB::table('employees_comprehensive')
            ->where('status', 'active')
            ->orderBy('ghana_card_name')
            ->get(['id', 'staff_id', 'ghana_card_name', 'job_title', 'department', 'branch', 'salary', 'photo_path', 'date_employed'])
            ->map(function ($employee) {
                $employee->photo_url = $employee->photo_path ? rtrim(config('app.url'), '/').'/'.ltrim($employee->photo_path, '/') : null;
                return $employee;
            });
        $leaveYear = (int) now()->format('Y');
        $leaveSchemaColumns = ['leave_year', 'leave_type', 'working_days_requested', 'working_days_approved', 'interrupted_working_days'];
        $leaveTrackingReady = Schema::hasTable('hr_leave_entitlements')
            && Schema::hasTable('hr_public_holidays')
            && collect($leaveSchemaColumns)->every(fn ($column) => Schema::hasColumn('hr_requests', $column));
        if ($leaveTrackingReady) {
            foreach ($employees as $employee) $this->ensureLeaveEntitlement($employee, $leaveYear);
            $leaveEntitlements = DB::table('hr_leave_entitlements as entitlement')
                ->join('employees_comprehensive as employee', 'employee.id', '=', 'entitlement.employee_id')
                ->where('entitlement.leave_year', $leaveYear)
                ->orderBy('employee.ghana_card_name')
                ->get(['entitlement.*', 'employee.ghana_card_name as employee_name', 'employee.staff_id'])
                ->map(function ($entitlement) {
                    $entitlement->working_days = json_decode($entitlement->working_days ?: '[]', true) ?: [1, 2, 3, 4, 5, 6];
                    $entitlement->days_used = (float) DB::table('hr_requests')->where('employee_id', $entitlement->employee_id)
                        ->where('leave_year', $entitlement->leave_year)->where('request_type', 'leave')->where('leave_type', 'annual')->where('status', 'approved')
                        ->selectRaw('COALESCE(SUM(GREATEST(working_days_approved - interrupted_working_days, 0)), 0) as used')->value('used');
                    $entitlement->days_pending = (float) DB::table('hr_requests')->where('employee_id', $entitlement->employee_id)
                        ->where('leave_year', $entitlement->leave_year)->where('request_type', 'leave')->where('leave_type', 'annual')->where('status', 'pending')->sum('working_days_requested');
                    $entitlement->days_available = max(0, (float) $entitlement->entitlement_days + (float) $entitlement->carried_forward_days - $entitlement->days_used - $entitlement->days_pending);
                    return $entitlement;
                });
            $publicHolidays = DB::table('hr_public_holidays')
                ->whereBetween('holiday_date', [$leaveYear.'-01-01', ($leaveYear + 1).'-12-31'])
                ->orderBy('holiday_date')->get();
        } else {
            $leaveEntitlements = collect();
            $publicHolidays = collect();
        }
        $rules = DB::table('hr_kpi_rules')->orderByDesc('active')->orderBy('title')->get();
        $results = DB::table('hr_kpi_results as result')
            ->join('employees_comprehensive as employee', 'employee.id', '=', 'result.employee_id')
            ->join('hr_kpi_rules as rule', 'rule.id', '=', 'result.rule_id')
            ->orderByDesc('result.period')->orderByDesc('result.updated_at')
            ->limit(300)
            ->get(['result.*', 'employee.ghana_card_name as employee_name', 'employee.staff_id', 'rule.title as rule_title']);

        $kpiFrameworkReady = $this->hasKpiFramework();
        $scorecards = collect();
        $assessments = collect();
        $payoutBands = collect();
        if ($kpiFrameworkReady) {
            $scorecards = DB::table('hr_kpi_scorecards')
                ->orderBy('role_title')
                ->orderBy('branch')
                ->get();
            $itemsByScorecard = DB::table('hr_kpi_scorecard_items')
                ->whereIn('scorecard_id', $scorecards->pluck('id'))
                ->where('active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get()
                ->groupBy('scorecard_id');
            $scorecards = $scorecards->map(function ($scorecard) use ($itemsByScorecard) {
                $scorecard->items = $itemsByScorecard->get($scorecard->id, collect())->values();

                return $scorecard;
            });
            $assessments = DB::table('hr_kpi_assessments as assessment')
                ->join('employees_comprehensive as employee', 'employee.id', '=', 'assessment.employee_id')
                ->orderByDesc('assessment.period')
                ->orderByDesc('assessment.updated_at')
                ->limit(300)
                ->get([
                    'assessment.*',
                    'employee.ghana_card_name as employee_name',
                    'employee.staff_id',
                    'employee.job_title',
                    'employee.branch as employee_branch',
                ]);
            $assessmentItemsById = DB::table('hr_kpi_assessment_items')
                ->whereIn('assessment_id', $assessments->pluck('id'))
                ->orderBy('id')
                ->get()
                ->groupBy('assessment_id');
            $assessments = $assessments->map(function ($assessment) use ($assessmentItemsById) {
                $assessment->items = $assessmentItemsById->get($assessment->id, collect())->values();

                return $assessment;
            });
            $payoutBands = DB::table('hr_kpi_allowance_bands')
                ->orderBy('minimum_score')
                ->get();
        }

        $communicationsReady = Schema::hasTable('hr_staff_communications')
            && Schema::hasTable('hr_staff_communication_reads');
        $communications = $communicationsReady
            ? DB::table('hr_staff_communications as communication')
                ->leftJoin('employees_comprehensive as employee', 'employee.id', '=', 'communication.employee_id')
                ->orderByDesc('communication.published_at')
                ->get([
                    'communication.id',
                    'communication.employee_id',
                    'communication.title',
                    'communication.message',
                    'communication.attachment_name',
                    'communication.published_at',
                    'employee.ghana_card_name as employee_name',
                    'employee.staff_id',
                ])
            : collect();

        return response()->json(array_merge(
            compact('letters', 'templates', 'requests', 'employees', 'rules', 'results', 'leaveEntitlements', 'publicHolidays', 'leaveYear', 'leaveTrackingReady', 'communications', 'communicationsReady'),
            compact('kpiFrameworkReady', 'scorecards', 'assessments', 'payoutBands'),
        ))
            ->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function saveLeaveEntitlement(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees_comprehensive', 'id')->where('status', 'active')],
            'leave_year' => ['required', 'integer', 'between:2020,2100'],
            'entitlement_days' => ['required', 'numeric', 'min:0', 'max:366'],
            'carried_forward_days' => ['nullable', 'numeric', 'min:0', 'max:366'],
            'working_days' => ['required', 'array', 'min:1', 'max:7'],
            'working_days.*' => ['required', 'integer', 'between:1,6'],
            'adjustment_note' => ['nullable', 'string', 'max:1500'],
        ]);
        if ((float) $validated['entitlement_days'] < 15 && empty(trim((string) ($validated['adjustment_note'] ?? '')))) {
            return response()->json(['message' => 'Add a note explaining the reviewed entitlement adjustment below the 15-day baseline.'], 422);
        }
        $workdays = array_values(array_unique(array_map('intval', $validated['working_days'])));
        sort($workdays);
        $existing = DB::table('hr_leave_entitlements')->where('employee_id', $validated['employee_id'])->where('leave_year', $validated['leave_year'])->first();
        $entitlementData = [
                'entitlement_days' => $validated['entitlement_days'],
                'carried_forward_days' => $validated['carried_forward_days'] ?? 0,
                'working_days' => json_encode($workdays),
                'adjustment_note' => $validated['adjustment_note'] ?? null,
                'entitlement_start_date' => Carbon::create((int) $validated['leave_year'], 1, 1)->toDateString(),
                'updated_by' => $request->user()->id,
                'updated_at' => now(),
            ];
        if ($existing) {
            DB::table('hr_leave_entitlements')->where('id', $existing->id)->update($entitlementData);
        } else {
            DB::table('hr_leave_entitlements')->insert($entitlementData + [
                'employee_id' => $validated['employee_id'],
                'leave_year' => $validated['leave_year'],
                'created_at' => now(),
            ]);
        }
        return response()->json(['message' => 'Annual leave entitlement and working-week schedule saved.']);
    }

    public function savePublicHoliday(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate([
            'holiday_date' => ['required', 'date', Rule::unique('hr_public_holidays', 'holiday_date')],
            'name' => ['required', 'string', 'max:180'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        DB::table('hr_public_holidays')->insert($validated + ['created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now()]);
        return response()->json(['message' => 'Public holiday added to the leave calendar.'], 201);
    }

    public function deletePublicHoliday(Request $request, int $holidayId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $deleted = DB::table('hr_public_holidays')->where('id', $holidayId)->delete();
        return $deleted ? response()->json(['message' => 'Public holiday removed.']) : response()->json(['message' => 'Public holiday not found.'], 404);
    }

    public function saveLetterTemplate(Request $request, ?int $templateId = null): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'body' => ['required', 'string', 'max:50000'],
            'requires_signature' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
        ]);
        $data = [
            'title' => $validated['title'],
            'body' => $validated['body'],
            'requires_signature' => $validated['requires_signature'] ?? false,
            'active' => $validated['active'] ?? true,
            'updated_at' => now(),
        ];
        if ($templateId) {
            if (! DB::table('hr_letter_templates')->where('id', $templateId)->exists()) return response()->json(['message' => 'Letter template not found.'], 404);
            DB::table('hr_letter_templates')->where('id', $templateId)->update($data);
            return response()->json(['message' => 'Letter template updated.']);
        }
        DB::table('hr_letter_templates')->insert($data + ['created_by' => $request->user()->id, 'created_at' => now()]);
        return response()->json(['message' => 'Reusable letter template saved.'], 201);
    }

    public function saveLetter(Request $request, ?int $letterId = null): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate([
            'employee_id' => ['nullable', 'integer', Rule::exists('employees_comprehensive', 'id')->where('status', 'active')],
            'target_role' => ['nullable', 'string', 'max:180'],
            'title' => ['required', 'string', 'max:180'],
            'body' => ['required', 'string', 'max:50000'],
            'requires_signature' => ['sometimes', 'boolean'],
            'attachment' => ['nullable', 'file', 'mimes:pdf,doc,docx,png,jpg,jpeg', 'max:15360'],
        ]);

        $data = [
            'employee_id' => $validated['employee_id'] ?? null,
            'target_role' => empty($validated['employee_id']) ? ($validated['target_role'] ?? null) : null,
            'title' => $validated['title'],
            'body' => $validated['body'],
            'requires_signature' => $validated['requires_signature'] ?? false,
            'updated_at' => now(),
        ];
        if ($letterId) {
            $letter = DB::table('hr_letters')->where('id', $letterId)->first();
            if (! $letter) return response()->json(['message' => 'Letter not found.'], 404);
            if ($letter->status === 'published') return response()->json(['message' => 'Unpublish a letter before editing it.'], 422);
            if (DB::table('hr_letter_signatures')->where('letter_id', $letterId)->exists()) {
                return response()->json(['message' => 'A letter with submitted signatures cannot be changed. Create a new letter to preserve the signed record.'], 422);
            }
            if ($request->hasFile('attachment')) {
                if ($letter->attachment_path) Storage::disk('local')->delete($letter->attachment_path);
                $data['attachment_path'] = $request->file('attachment')->store('hr-letters', 'local');
                $data['attachment_name'] = mb_substr(preg_replace('/[\\x00-\\x1F\\x7F]/u', '', basename($request->file('attachment')->getClientOriginalName())), 0, 255);
            }
            DB::table('hr_letters')->where('id', $letterId)->update($data);
            return response()->json(['message' => 'Draft letter updated.', 'id' => $letterId]);
        }

        if ($request->hasFile('attachment')) {
            $data['attachment_path'] = $request->file('attachment')->store('hr-letters', 'local');
            $data['attachment_name'] = mb_substr(preg_replace('/[\\x00-\\x1F\\x7F]/u', '', basename($request->file('attachment')->getClientOriginalName())), 0, 255);
        }

        $id = DB::table('hr_letters')->insertGetId($data + [
            'status' => 'draft',
            'created_by' => $request->user()->id,
            'created_at' => now(),
        ]);
        return response()->json(['message' => 'Draft letter created.', 'id' => $id], 201);
    }

    public function deleteLetter(Request $request, int $letterId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $letter = DB::table('hr_letters')->where('id', $letterId)->first();
        if (! $letter) return response()->json(['message' => 'Letter not found.'], 404);
        if ($letter->status === 'published') return response()->json(['message' => 'Unpublish the letter before deleting it.'], 422);
        if (DB::table('hr_letter_signatures')->where('letter_id', $letterId)->exists()) {
            return response()->json(['message' => 'A letter with submitted signatures cannot be deleted.'], 422);
        }
        if ($letter->attachment_path) Storage::disk('local')->delete($letter->attachment_path);
        DB::table('hr_letters')->where('id', $letterId)->delete();
        return response()->json(['message' => 'Draft letter deleted.']);
    }

    public function deleteLetterTemplate(Request $request, int $templateId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $deleted = DB::table('hr_letter_templates')->where('id', $templateId)->delete();
        return $deleted ? response()->json(['message' => 'Letter template deleted.']) : response()->json(['message' => 'Letter template not found.'], 404);
    }

    public function downloadAdminLetterAttachment(Request $request, int $letterId): StreamedResponse|JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        return $this->downloadLetterAttachment(DB::table('hr_letters')->where('id', $letterId)->first());
    }

    public function viewSignedLetter(Request $request, int $letterId, int $employeeId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $submission = DB::table('hr_letter_signatures as signing')
            ->join('hr_letters as letter', 'letter.id', '=', 'signing.letter_id')
            ->join('employees_comprehensive as employee', 'employee.id', '=', 'signing.employee_id')
            ->where('signing.letter_id', $letterId)
            ->where('signing.employee_id', $employeeId)
            ->first([
                'letter.title',
                'letter.body',
                'letter.published_at',
                'signing.signature_path',
                'signing.mime_type',
                'signing.signed_at',
                'employee.ghana_card_name',
                'employee.staff_id',
                'employee.job_title',
                'employee.department',
            ]);
        if (! $submission) {
            return response()->json(['message' => 'The signed letter was not found.'], 404);
        }
        if (! Storage::disk('local')->exists($submission->signature_path)) {
            return response()->json(['message' => 'The submitted signature is missing from private storage.'], 500);
        }

        $submission->body = strtr($submission->body, [
            '{employee_name}' => $submission->ghana_card_name,
            '{staff_id}' => $submission->staff_id,
            '{job_title}' => $submission->job_title,
            '{department}' => $submission->department,
            '{date}' => $submission->published_at
                ? Carbon::parse($submission->published_at)->format('j F Y')
                : Carbon::parse($submission->signed_at)->format('j F Y'),
        ]);
        $managerSignature = $this->managerLetterSignatureData();

        return response()->json([
            'letter' => ['title' => $submission->title, 'body' => $submission->body],
            'employee' => [
                'name' => $submission->ghana_card_name,
                'staff_id' => $submission->staff_id,
            ],
            'signature' => 'data:'.$submission->mime_type.';base64,'.base64_encode(Storage::disk('local')->get($submission->signature_path)),
            'signed_at' => $submission->signed_at,
            'manager_signature' => $managerSignature['data'] ?? null,
        ])->header('Cache-Control', 'private, no-store, max-age=0');
    }

    public function downloadMyLetterAttachment(Request $request, int $letterId): StreamedResponse|JsonResponse
    {
        $employee = $request->attributes->get('staff_portal_account');
        $record = DB::table('hr_letters')->where('id', $letterId)->where('status', 'published')
            ->where(function ($query) use ($employee): void {
                $query->where('employee_id', $employee->id)
                    ->orWhere(function ($circular) use ($employee): void {
                        $circular->whereNull('employee_id')->where(function ($role) use ($employee): void {
                            $role->whereNull('target_role')
                                ->orWhereRaw('LOWER(TRIM(target_role)) = ?', [mb_strtolower(trim((string) $employee->job_title))]);
                        });
                    });
            })->first();
        return $this->downloadLetterAttachment($record);
    }

    public function publishLetter(Request $request, int $letterId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $letter = DB::table('hr_letters')->where('id', $letterId)->first();
        if (! $letter) return response()->json(['message' => 'Letter not found.'], 404);
        $status = $letter->status === 'published' ? 'draft' : 'published';
        DB::table('hr_letters')->where('id', $letterId)->update([
            'status' => $status,
            'published_at' => $status === 'published' ? now() : null,
            'updated_at' => now(),
        ]);
        return response()->json(['message' => $status === 'published' ? 'Letter published to the selected employee.' : 'Letter unpublished.', 'status' => $status]);
    }

    public function decideRequest(Request $request, int $requestId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected'])],
            'review_note' => ['nullable', 'string', 'max:3000'],
            'leave_remuneration' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
        ]);
        $record = DB::table('hr_requests')->where('id', $requestId)->where('status', 'pending')->first();
        if (! $record) return response()->json(['message' => 'Pending HR request not found.'], 404);
        $update = [
            'status' => $validated['status'],
            'review_note' => $validated['review_note'] ?? null,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ];
        if ($validated['status'] === 'approved' && $record->request_type === 'leave' && $record->leave_type === 'annual') {
            if (! isset($validated['leave_remuneration'])) {
                return response()->json(['message' => 'Record the normal remuneration paid for this approved annual leave before approving it.'], 422);
            }
            $this->assertAnnualLeaveBalance((int) $record->employee_id, (int) $record->leave_year, (float) $record->working_days_requested, $requestId);
            $update['working_days_approved'] = $record->working_days_requested;
            $update['leave_remuneration'] = $validated['leave_remuneration'];
        }
        DB::table('hr_requests')->where('id', $requestId)->update($update);
        return response()->json(['message' => 'Request decision recorded.']);
    }

    public function recordLeaveInterruption(Request $request, int $requestId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate([
            'interrupted_working_days' => ['required', 'numeric', 'min:0', 'max:366'],
            'interruption_note' => ['required', 'string', 'max:2000'],
        ]);
        $record = DB::table('hr_requests')->where('id', $requestId)->where('request_type', 'leave')
            ->where('leave_type', 'annual')->where('status', 'approved')->first();
        if (! $record) return response()->json(['message' => 'Approved annual leave record not found.'], 404);
        if ((float) $validated['interrupted_working_days'] > (float) ($record->working_days_approved ?? 0)) {
            return response()->json(['message' => 'Interrupted days cannot exceed the approved leave days.'], 422);
        }
        $note = trim((string) $record->review_note);
        $note .= ($note ? "\n\n" : '').'Leave interruption recorded '.now()->format('j M Y').': '.$validated['interruption_note'];
        DB::table('hr_requests')->where('id', $requestId)->update([
            'interrupted_working_days' => $validated['interrupted_working_days'],
            'review_note' => $note,
            'updated_at' => now(),
        ]);
        return response()->json(['message' => 'Unused leave has been restored to the employee balance. Record the rescheduled dates in a new leave request.']);
    }

    public function downloadAdminAttachment(Request $request, int $requestId): StreamedResponse|JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        return $this->downloadAttachment(DB::table('hr_requests')->where('id', $requestId)->first());
    }

    public function saveKpiScorecard(Request $request, ?int $scorecardId = null): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! $this->hasKpiFramework()) {
            return response()->json(['message' => 'Run database/manual_sql/hr_kpi_scorecard_framework.sql before managing role scorecards.'], 503);
        }

        $validated = $request->validate([
            'role_title' => ['required', 'string', 'max:180'],
            'branch' => ['nullable', 'string', 'max:120'],
            'max_monthly_allowance' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'active' => ['sometimes', 'boolean'],
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.title' => ['required', 'string', 'max:180'],
            'items.*.description' => ['nullable', 'string', 'max:3000'],
            'items.*.weight' => ['required', 'integer', 'between:1,100'],
            'items.*.target_description' => ['required', 'string', 'max:3000'],
            'items.*.target_value' => ['nullable', 'numeric', 'min:0'],
            'items.*.target_unit' => ['nullable', 'string', 'max:40'],
            'items.*.direction' => ['required', Rule::in(['higher', 'lower', 'quality'])],
        ]);
        if (array_sum(array_column($validated['items'], 'weight')) !== 100) {
            return response()->json(['message' => 'KPI weights must add up to exactly 100 points.'], 422);
        }
        $roleTitle = trim($validated['role_title']);
        $branch = trim((string) ($validated['branch'] ?? '*')) ?: '*';
        $duplicate = DB::table('hr_kpi_scorecards')
            ->whereRaw('LOWER(role_title) = ?', [mb_strtolower($roleTitle)])
            ->whereRaw('LOWER(branch) = ?', [mb_strtolower($branch)])
            ->when($scorecardId, fn ($query) => $query->where('id', '<>', $scorecardId))
            ->exists();
        if ($duplicate) {
            return response()->json(['message' => 'A scorecard already exists for this role and branch. Edit that scorecard instead.'], 422);
        }

        $userId = $request->user()->id;
        $scorecard = DB::transaction(function () use ($validated, $scorecardId, $roleTitle, $branch, $userId): object {
            $now = now();
            if ($scorecardId) {
                $scorecard = DB::table('hr_kpi_scorecards')->where('id', $scorecardId)->first();
                if (! $scorecard) abort(404, 'KPI scorecard not found.');
                DB::table('hr_kpi_scorecards')->where('id', $scorecardId)->update([
                    'role_title' => $roleTitle,
                    'branch' => $branch,
                    'max_monthly_allowance' => $validated['max_monthly_allowance'],
                    'active' => $validated['active'] ?? true,
                    'updated_by' => $userId,
                    'updated_at' => $now,
                ]);
                $scorecard->id = $scorecardId;
            } else {
                $scorecard = (object) [
                    'id' => DB::table('hr_kpi_scorecards')->insertGetId([
                        'role_title' => $roleTitle,
                        'branch' => $branch,
                        'max_monthly_allowance' => $validated['max_monthly_allowance'],
                        'active' => $validated['active'] ?? true,
                        'created_by' => $userId,
                        'updated_by' => $userId,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]),
                ];
            }

            $submittedIds = array_values(array_filter(array_map(
                fn ($item) => isset($item['id']) ? (int) $item['id'] : null,
                $validated['items'],
            )));
            if (count($submittedIds) !== count(array_unique($submittedIds))) {
                abort(422, 'A KPI criterion may only appear once in a scorecard.');
            }
            if ($submittedIds) {
                $ownedCount = DB::table('hr_kpi_scorecard_items')
                    ->where('scorecard_id', $scorecard->id)
                    ->whereIn('id', $submittedIds)
                    ->count();
                if ($ownedCount !== count($submittedIds)) {
                    abort(422, 'A KPI criterion does not belong to this scorecard.');
                }
            }

            DB::table('hr_kpi_scorecard_items')
                ->where('scorecard_id', $scorecard->id)
                ->update(['active' => false, 'updated_at' => $now]);
            foreach ($validated['items'] as $sortOrder => $item) {
                $itemData = [
                    'scorecard_id' => $scorecard->id,
                    'title' => trim($item['title']),
                    'description' => $item['description'] ?? null,
                    'weight' => $item['weight'],
                    'target_description' => $item['target_description'] ?? null,
                    'target_value' => $item['target_value'] ?? null,
                    'target_unit' => $item['target_unit'] ?? null,
                    'direction' => $item['direction'],
                    'sort_order' => $sortOrder,
                    'active' => true,
                    'updated_at' => $now,
                ];
                if (! empty($item['id'])) {
                    DB::table('hr_kpi_scorecard_items')->where('id', $item['id'])->update($itemData);
                } else {
                    DB::table('hr_kpi_scorecard_items')->insert($itemData + ['created_at' => $now]);
                }
            }

            return $scorecard;
        });

        return response()->json([
            'message' => 'Role scorecard saved. Existing assessments keep their original criteria.',
            'id' => $scorecard->id,
        ], $scorecardId ? 200 : 201);
    }

    public function saveKpiAllowanceBands(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! $this->hasKpiFramework()) {
            return response()->json(['message' => 'Run database/manual_sql/hr_kpi_scorecard_framework.sql before managing payout bands.'], 503);
        }
        $validated = $request->validate([
            'bands' => ['required', 'array', 'min:1', 'max:20'],
            'bands.*.minimum_score' => ['required', 'numeric', 'between:0,100'],
            'bands.*.payout_percent' => ['required', 'numeric', 'between:0,100'],
            'bands.*.label' => ['required', 'string', 'max:80'],
        ]);
        $minimumScores = array_map(fn ($band) => number_format((float) $band['minimum_score'], 2, '.', ''), $validated['bands']);
        if (count($minimumScores) !== count(array_unique($minimumScores)) || ! in_array('0.00', $minimumScores, true)) {
            return response()->json(['message' => 'Use unique score thresholds and include a band beginning at score 0.'], 422);
        }

        DB::transaction(function () use ($validated): void {
            DB::table('hr_kpi_allowance_bands')->delete();
            $now = now();
            foreach ($validated['bands'] as $sortOrder => $band) {
                DB::table('hr_kpi_allowance_bands')->insert([
                    'minimum_score' => $band['minimum_score'],
                    'payout_percent' => $band['payout_percent'],
                    'label' => trim($band['label']),
                    'sort_order' => $sortOrder,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        });

        return response()->json(['message' => 'KPI allowance bands saved. New assessments will use these bands.']);
    }

    public function saveKpiAssessment(Request $request, ?int $assessmentId = null): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! $this->hasKpiFramework()) {
            return response()->json(['message' => 'Run database/manual_sql/hr_kpi_scorecard_framework.sql before scoring staff.'], 503);
        }
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees_comprehensive', 'id')->where('status', 'active')],
            'scorecard_id' => ['required', 'integer'],
            'period' => ['required', 'date_format:Y-m'],
            'targets_confirmed' => ['nullable', 'accepted'],
            'summary_notes' => ['nullable', 'string', 'max:5000'],
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.scorecard_item_id' => ['required', 'integer'],
            'items.*.rating' => ['nullable', 'integer', 'between:0,5'],
            'items.*.evidence' => ['nullable', 'string', 'max:5000'],
            'items.*.notes' => ['nullable', 'string', 'max:3000'],
        ]);
        $employee = DB::table('employees_comprehensive')
            ->where('id', $validated['employee_id'])
            ->where('status', 'active')
            ->first();
        $existing = $assessmentId
            ? DB::table('hr_kpi_assessments')->where('id', $assessmentId)->first()
            : DB::table('hr_kpi_assessments')
                ->where('employee_id', $employee->id)
                ->where('period', $validated['period'])
                ->first();
        if ($assessmentId && (! $existing || (int) $existing->employee_id !== (int) $employee->id)) {
            return response()->json(['message' => 'KPI assessment not found for this employee.'], 404);
        }
        if ($existing && $existing->status !== 'draft') {
            return response()->json(['message' => 'Reopen this reviewed assessment before editing it.'], 422);
        }
        $targetsReconfirmed = (bool) ($validated['targets_confirmed'] ?? false)
            && (! $existing || $existing->period !== $validated['period'] || ! $existing->targets_confirmed_at);
        if ((! $existing || $existing->period !== $validated['period']) && ! $targetsReconfirmed) {
            return response()->json(['message' => 'Confirm that the monthly targets were agreed and communicated before this period began.'], 422);
        }
        $periodConflict = DB::table('hr_kpi_assessments')
            ->where('employee_id', $employee->id)
            ->where('period', $validated['period'])
            ->when($existing, fn ($query) => $query->where('id', '<>', $existing->id))
            ->exists();
        if ($periodConflict) {
            return response()->json(['message' => 'This employee already has an assessment for that month.'], 422);
        }
        $usesSavedCriteria = $existing && (int) $existing->scorecard_id === (int) $validated['scorecard_id'];
        $scorecard = DB::table('hr_kpi_scorecards')
            ->where('id', $validated['scorecard_id'])
            ->when(! $usesSavedCriteria, fn ($query) => $query->where('active', true))
            ->first();
        if (! $scorecard) {
            return response()->json(['message' => 'Active KPI scorecard not found.'], 404);
        }
        if (! $usesSavedCriteria && mb_strtolower(trim((string) $employee->job_title)) !== mb_strtolower(trim($scorecard->role_title))) {
            return response()->json(['message' => 'This scorecard is for a different staff role.'], 422);
        }
        if (! $usesSavedCriteria && $scorecard->branch !== '*' && mb_strtolower(trim((string) $employee->branch)) !== mb_strtolower(trim($scorecard->branch))) {
            return response()->json(['message' => 'This scorecard is for a different branch.'], 422);
        }

        $templateItems = $usesSavedCriteria
            ? DB::table('hr_kpi_assessment_items')
                ->where('assessment_id', $existing->id)
                ->orderBy('id')
                ->get()
                ->map(fn ($item) => (object) [
                    'id' => $item->scorecard_item_id,
                    'title' => $item->title_snapshot,
                    'description' => $item->description_snapshot,
                    'weight' => $item->weight,
                    'target_description' => $item->target_description_snapshot,
                    'target_value' => $item->target_value_snapshot,
                    'target_unit' => $item->target_unit_snapshot,
                    'direction' => $item->direction_snapshot,
                ])
            : DB::table('hr_kpi_scorecard_items')
                ->where('scorecard_id', $scorecard->id)
                ->where('active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get();
        $submittedItemIds = array_map(
            fn ($item) => (int) $item['scorecard_item_id'],
            $validated['items'],
        );
        $templateItemIds = $templateItems->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (count($submittedItemIds) !== count(array_unique($submittedItemIds))
            || count($submittedItemIds) !== count($templateItemIds)
            || array_diff($templateItemIds, $submittedItemIds)
            || array_diff($submittedItemIds, $templateItemIds)) {
            return response()->json(['message' => 'Include each assessment criterion exactly once.'], 422);
        }
        $bands = DB::table('hr_kpi_allowance_bands')->orderByDesc('minimum_score')->get();
        if ($bands->isEmpty()) {
            return response()->json(['message' => 'Configure at least one KPI allowance band before scoring staff.'], 503);
        }

        $itemsById = collect($validated['items'])->keyBy(fn ($item) => (int) $item['scorecard_item_id']);
        $totalScore = 0;
        $assessmentItems = [];
        foreach ($templateItems as $templateItem) {
            $input = $itemsById->get((int) $templateItem->id);
            $rating = isset($input['rating']) ? (int) $input['rating'] : null;
            $earnedPoints = $rating === null ? 0 : round((int) $templateItem->weight * $rating / 5, 2);
            $totalScore += $earnedPoints;
            $assessmentItems[] = [
                'scorecard_item_id' => $templateItem->id,
                'title_snapshot' => $templateItem->title,
                'description_snapshot' => $templateItem->description,
                'weight' => $templateItem->weight,
                'target_description_snapshot' => $templateItem->target_description,
                'target_value_snapshot' => $templateItem->target_value,
                'target_unit_snapshot' => $templateItem->target_unit,
                'direction_snapshot' => $templateItem->direction,
                'rating' => $rating,
                'earned_points' => $earnedPoints,
                'evidence' => $input['evidence'] ?? null,
                'notes' => $input['notes'] ?? null,
            ];
        }
        $totalScore = round($totalScore, 2);
        $band = $bands->first(fn ($item) => (float) $item->minimum_score <= $totalScore);
        if (! $band) {
            return response()->json(['message' => 'The configured KPI payout bands do not cover the assessment score.'], 422);
        }
        $allowancePercent = (float) $band->payout_percent;
        $maxMonthlyAllowance = $usesSavedCriteria
            ? (float) $existing->max_monthly_allowance
            : (float) $scorecard->max_monthly_allowance;
        $roleTitleSnapshot = $usesSavedCriteria ? $existing->role_title_snapshot : $scorecard->role_title;
        $branchSnapshot = $usesSavedCriteria ? $existing->branch_snapshot : $employee->branch;
        $targetsConfirmedAt = $targetsReconfirmed ? now() : ($existing->targets_confirmed_at ?? null);
        $targetsConfirmedBy = $targetsReconfirmed ? $request->user()->id : ($existing->targets_confirmed_by ?? null);
        $calculatedAllowance = round($maxMonthlyAllowance * $allowancePercent / 100, 2);

        $id = DB::transaction(function () use ($existing, $employee, $scorecard, $validated, $request, $totalScore, $allowancePercent, $calculatedAllowance, $assessmentItems, $maxMonthlyAllowance, $roleTitleSnapshot, $branchSnapshot, $targetsConfirmedAt, $targetsConfirmedBy): int {
            $now = now();
            $assessmentData = [
                'employee_id' => $employee->id,
                'scorecard_id' => $scorecard->id,
                'period' => $validated['period'],
                'role_title_snapshot' => $roleTitleSnapshot,
                'branch_snapshot' => $branchSnapshot,
                'max_monthly_allowance' => $maxMonthlyAllowance,
                'total_score' => $totalScore,
                'allowance_percent' => $allowancePercent,
                'calculated_allowance' => $calculatedAllowance,
                'status' => 'draft',
                'summary_notes' => $validated['summary_notes'] ?? null,
                'targets_confirmed_at' => $targetsConfirmedAt,
                'targets_confirmed_by' => $targetsConfirmedBy,
                'evaluated_by' => $request->user()->id,
                'reviewed_by' => null,
                'reviewed_at' => null,
                'published_at' => null,
                'updated_at' => $now,
            ];
            if ($existing) {
                DB::table('hr_kpi_assessments')->where('id', $existing->id)->update($assessmentData);
                $id = (int) $existing->id;
                DB::table('hr_kpi_assessment_items')->where('assessment_id', $id)->delete();
            } else {
                $id = (int) DB::table('hr_kpi_assessments')->insertGetId($assessmentData + ['created_at' => $now]);
            }
            foreach ($assessmentItems as $item) {
                DB::table('hr_kpi_assessment_items')->insert($item + [
                    'assessment_id' => $id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            return $id;
        });

        return response()->json([
            'message' => 'KPI assessment saved as a draft.',
            'id' => $id,
            'total_score' => $totalScore,
            'allowance_percent' => $allowancePercent,
            'calculated_allowance' => $calculatedAllowance,
        ], $existing ? 200 : 201);
    }

    public function reviewKpiAssessment(Request $request, int $assessmentId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! $this->hasKpiFramework()) {
            return response()->json(['message' => 'The KPI scorecard framework is not configured yet.'], 503);
        }
        $validated = $request->validate(['status' => ['required', Rule::in(['approved', 'published'])]]);
        $assessment = DB::table('hr_kpi_assessments')->where('id', $assessmentId)->first();
        if (! $assessment) return response()->json(['message' => 'KPI assessment not found.'], 404);
        if (($validated['status'] === 'approved' && $assessment->status !== 'draft')
            || ($validated['status'] === 'published' && $assessment->status !== 'approved')) {
            return response()->json(['message' => 'KPI assessments must move from draft to approved to published.'], 422);
        }
        if ($validated['status'] === 'approved') {
            if (! $assessment->targets_confirmed_at) {
                return response()->json(['message' => 'Confirm that the monthly targets were agreed and communicated before approving this assessment.'], 422);
            }
            $itemSummary = DB::table('hr_kpi_assessment_items')
                ->where('assessment_id', $assessmentId)
                ->selectRaw('COUNT(*) as item_count, SUM(weight) as total_weight')
                ->first();
            $incomplete = DB::table('hr_kpi_assessment_items')
                ->where('assessment_id', $assessmentId)
                ->where(function ($query): void {
                    $query->whereNull('rating')
                        ->orWhereNull('evidence')
                        ->orWhereRaw("TRIM(evidence) = ''");
                })
                ->exists();
            if (! $itemSummary || (int) $itemSummary->item_count === 0 || (int) $itemSummary->total_weight !== 100 || $incomplete) {
                return response()->json(['message' => 'Every criterion must have a whole-number rating and supporting evidence before approval.'], 422);
            }
            $isGeneralManager = preg_match('/\b(general\s+manager|gm)\b/i', $assessment->role_title_snapshot) === 1;
            if ($isGeneralManager && (int) $assessment->evaluated_by === (int) $request->user()->id) {
                return response()->json(['message' => 'The General Manager’s assessment must be approved by a different Board-designated reviewer.'], 422);
            }
            DB::table('hr_kpi_assessments')->where('id', $assessmentId)->update([
                'status' => 'approved',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            DB::table('hr_kpi_assessments')->where('id', $assessmentId)->update([
                'status' => 'published',
                'published_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json(['message' => 'KPI assessment '.$validated['status'].'.']);
    }

    public function reopenKpiAssessment(Request $request, int $assessmentId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! $this->hasKpiFramework()) {
            return response()->json(['message' => 'The KPI scorecard framework is not configured yet.'], 503);
        }
        $updated = DB::table('hr_kpi_assessments')
            ->where('id', $assessmentId)
            ->whereIn('status', ['approved', 'published'])
            ->update([
                'status' => 'draft',
                'reviewed_by' => null,
                'reviewed_at' => null,
                'published_at' => null,
                'updated_at' => now(),
            ]);
        if (! $updated) return response()->json(['message' => 'Reviewed KPI assessment not found.'], 404);

        return response()->json(['message' => 'KPI assessment returned to draft for correction.']);
    }

    public function respondToKpiAssessment(Request $request, int $assessmentId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        if (! $this->hasKpiFramework()) {
            return response()->json(['message' => 'The KPI scorecard framework is not configured yet.'], 503);
        }
        $validated = $request->validate(['manager_response' => ['nullable', 'string', 'max:5000']]);
        $assessment = DB::table('hr_kpi_assessments')
            ->where('id', $assessmentId)
            ->where('status', 'published')
            ->first();
        if (! $assessment) return response()->json(['message' => 'Published KPI assessment not found.'], 404);
        DB::table('hr_kpi_assessments')->where('id', $assessmentId)->update([
            'manager_response' => trim((string) ($validated['manager_response'] ?? '')) ?: null,
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Response saved for the employee.']);
    }

    public function saveKpiRule(Request $request, ?int $ruleId = null): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:5000'],
            'target_value' => ['nullable', 'numeric', 'min:0'],
            'full_score_allowance' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'active' => ['sometimes', 'boolean'],
        ]);
        $data = [
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'target_value' => $validated['target_value'] ?? null,
            'full_score_allowance' => $validated['full_score_allowance'],
            'active' => $validated['active'] ?? true,
            'updated_at' => now(),
        ];
        if ($ruleId) {
            if (! DB::table('hr_kpi_rules')->where('id', $ruleId)->exists()) return response()->json(['message' => 'KPI rule not found.'], 404);
            DB::table('hr_kpi_rules')->where('id', $ruleId)->update($data);
            return response()->json(['message' => 'KPI rule updated.', 'id' => $ruleId]);
        }
        $id = DB::table('hr_kpi_rules')->insertGetId($data + ['created_by' => $request->user()->id, 'created_at' => now()]);
        return response()->json(['message' => 'KPI rule created.', 'id' => $id], 201);
    }

    public function scoreKpi(Request $request): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees_comprehensive', 'id')->where('status', 'active')],
            'rule_id' => ['required', 'integer', Rule::exists('hr_kpi_rules', 'id')->where('active', true)],
            'period' => ['required', 'date_format:Y-m'],
            'score' => ['required', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $rule = DB::table('hr_kpi_rules')->where('id', $validated['rule_id'])->where('active', true)->first();
        $existing = DB::table('hr_kpi_results')->where('employee_id', $validated['employee_id'])->where('rule_id', $rule->id)->where('period', $validated['period'])->first();
        if ($existing && $existing->status !== 'draft') return response()->json(['message' => 'Only draft scores can be edited.'], 422);
        $result = [
            'employee_id' => $validated['employee_id'],
            'rule_id' => $rule->id,
            'period' => $validated['period'],
            'score' => $validated['score'],
            'calculated_allowance' => round((float) $rule->full_score_allowance * (float) $validated['score'] / 100, 2),
            'status' => 'draft',
            'notes' => $validated['notes'] ?? null,
            'evaluated_by' => $request->user()->id,
            'updated_at' => now(),
        ];
        if ($existing) {
            DB::table('hr_kpi_results')->where('id', $existing->id)->update($result);
            $id = $existing->id;
        } else {
            $id = DB::table('hr_kpi_results')->insertGetId($result + ['created_at' => now()]);
        }
        return response()->json(['message' => 'KPI score saved as a draft.', 'id' => $id, 'calculated_allowance' => $result['calculated_allowance']], $existing ? 200 : 201);
    }

    public function reviewKpi(Request $request, int $resultId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $validated = $request->validate(['status' => ['required', Rule::in(['approved', 'published'])]]);
        $result = DB::table('hr_kpi_results')->where('id', $resultId)->first();
        if (! $result) return response()->json(['message' => 'KPI result not found.'], 404);
        if (($validated['status'] === 'approved' && $result->status !== 'draft') || ($validated['status'] === 'published' && $result->status !== 'approved')) {
            return response()->json(['message' => 'KPI results must move from draft to approved to published.'], 422);
        }
        DB::table('hr_kpi_results')->where('id', $resultId)->update([
            'status' => $validated['status'],
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(['message' => 'KPI result '.$validated['status'].'.']);
    }

    public function reopenKpi(Request $request, int $resultId): JsonResponse
    {
        if ($denied = $this->requireManager($request)) return $denied;
        $updated = DB::table('hr_kpi_results')->where('id', $resultId)->whereIn('status', ['approved', 'published'])->update([
            'status' => 'draft',
            'reviewed_by' => null,
            'reviewed_at' => null,
            'updated_at' => now(),
        ]);
        if (! $updated) return response()->json(['message' => 'Reviewed KPI result not found.'], 404);
        return response()->json(['message' => 'KPI result returned to draft for correction.']);
    }

    private function managerLetterSignatureData(): ?array
    {
        if (! Schema::hasTable('hr_letter_manager_signatures')) {
            return null;
        }

        $signature = DB::table('hr_letter_manager_signatures')->where('id', 1)->first();
        if (! $signature || ! Storage::disk('local')->exists($signature->file_path)) {
            return null;
        }

        $contents = Storage::disk('local')->get($signature->file_path);
        return [
            'data' => 'data:'.$signature->mime_type.';base64,'.base64_encode($contents),
            'updated_at' => $signature->updated_at,
        ];
    }

    private function letterSignatureWorkflowReady(): bool
    {
        return Schema::hasColumn('hr_letters', 'requires_signature')
            && Schema::hasColumn('hr_letter_templates', 'requires_signature')
            && Schema::hasTable('hr_letter_signatures');
    }

    private function hasKpiFramework(): bool
    {
        return collect([
            'hr_kpi_scorecards',
            'hr_kpi_scorecard_items',
            'hr_kpi_allowance_bands',
            'hr_kpi_assessments',
            'hr_kpi_assessment_items',
        ])->every(fn ($table) => Schema::hasTable($table));
    }

    private function requireManager(Request $request): ?JsonResponse
    {
        return $request->user()?->normalized_role === 'manager'
            ? null
            : response()->json(['message' => 'Only the General Manager can manage HR Space.'], 403);
    }

    private function ensureLeaveEntitlement(object $employee, int $year): object
    {
        $existing = DB::table('hr_leave_entitlements')->where('employee_id', $employee->id)->where('leave_year', $year)->first();
        if ($existing) return $existing;

        DB::table('hr_leave_entitlements')->insertOrIgnore([
            'employee_id' => $employee->id,
            'leave_year' => $year,
            'entitlement_days' => 15,
            'carried_forward_days' => 0,
            'working_days' => json_encode([1, 2, 3, 4, 5, 6]),
            'adjustment_note' => 'Default statutory baseline: 15 paid working days. Confirm the individual work schedule and applicable entitlement.',
            'entitlement_start_date' => Carbon::create($year, 1, 1)->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return DB::table('hr_leave_entitlements')->where('employee_id', $employee->id)->where('leave_year', $year)->first();
    }

    private function countScheduledWorkingDays(Carbon $start, Carbon $end, ?string $workingDaysJson): float
    {
        $workdays = json_decode($workingDaysJson ?: '[]', true);
        if (! is_array($workdays) || ! count($workdays)) $workdays = [1, 2, 3, 4, 5, 6];
        $workdays = array_map('intval', $workdays);
        $holidays = DB::table('hr_public_holidays')->whereBetween('holiday_date', [$start->toDateString(), $end->toDateString()])
            ->pluck('holiday_date')->map(fn ($date) => (string) $date)->flip()->all();
        $days = 0;
        for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
            if ($day->dayOfWeek !== Carbon::SUNDAY && in_array($day->dayOfWeek, $workdays, true) && ! isset($holidays[$day->toDateString()])) $days++;
        }
        return (float) $days;
    }

    private function assertAnnualLeaveBalance(int $employeeId, int $year, float $requestedDays, ?int $excludeRequestId = null): void
    {
        $entitlement = DB::table('hr_leave_entitlements')->where('employee_id', $employeeId)->where('leave_year', $year)->first();
        if (! $entitlement) abort(422, 'Annual leave entitlement has not been set for this year. Contact the General Manager.');
        $used = (float) DB::table('hr_requests')->where('employee_id', $employeeId)->where('leave_year', $year)
            ->where('request_type', 'leave')->where('leave_type', 'annual')->where('status', 'approved')
            ->selectRaw('COALESCE(SUM(GREATEST(working_days_approved - interrupted_working_days, 0)), 0) as used')->value('used');
        $pendingQuery = DB::table('hr_requests')->where('employee_id', $employeeId)->where('leave_year', $year)
            ->where('request_type', 'leave')->where('leave_type', 'annual')->where('status', 'pending');
        if ($excludeRequestId) $pendingQuery->where('id', '!=', $excludeRequestId);
        $pending = (float) $pendingQuery->sum('working_days_requested');
        $available = (float) $entitlement->entitlement_days + (float) $entitlement->carried_forward_days - $used - $pending;
        if ($requestedDays > $available + 0.001) {
            abort(422, 'This request exceeds your available annual leave balance of '.number_format(max(0, $available), 2).' working days. Contact the General Manager to review your entitlement.');
        }
    }

    private function downloadAttachment(?object $record): StreamedResponse|JsonResponse
    {
        if (! $record || ! $record->attachment_path || ! Storage::disk('local')->exists($record->attachment_path)) {
            return response()->json(['message' => 'The requested attachment was not found.'], 404);
        }
        $response = Storage::disk('local')->download($record->attachment_path, $record->attachment_name ?: 'hr-attachment');
        $response->headers->set('Cache-Control', 'private, no-store, max-age=0');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        return $response;
    }

    private function viewCommunicationAttachment(?object $record): StreamedResponse|JsonResponse
    {
        if (! $record || ! $record->attachment_path || ! Storage::disk('local')->exists($record->attachment_path)) {
            return response()->json(['message' => 'The requested staff PDF was not found.'], 404);
        }
        $response = Storage::disk('local')->response(
            $record->attachment_path,
            $record->attachment_name ?: 'staff-document.pdf',
            [
                'Content-Type' => 'application/pdf',
                'Cache-Control' => 'private, no-store, max-age=0',
                'X-Content-Type-Options' => 'nosniff',
            ],
            'inline',
        );
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
    }

    private function downloadLetterAttachment(?object $record): StreamedResponse|JsonResponse
    {
        if (! $record || ! $record->attachment_path || ! Storage::disk('local')->exists($record->attachment_path)) {
            return response()->json(['message' => 'The requested letter attachment was not found.'], 404);
        }
        $response = Storage::disk('local')->download($record->attachment_path, $record->attachment_name ?: 'hr-letter');
        $response->headers->set('Cache-Control', 'private, no-store, max-age=0');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        return $response;
    }
}
