<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hr_requests', function (Blueprint $table): void {
            $table->string('leave_type', 32)->nullable()->after('request_type');
            $table->decimal('working_days_requested', 6, 2)->nullable()->after('end_date');
            $table->string('handover_person', 180)->nullable()->after('working_days_requested');
            $table->text('outstanding_duties')->nullable()->after('handover_person');
            $table->date('notification_date')->nullable()->after('outstanding_duties');
            $table->decimal('working_days_approved', 6, 2)->nullable()->after('notification_date');
            $table->decimal('leave_remuneration', 12, 2)->default(0)->after('working_days_approved');
            $table->decimal('interrupted_working_days', 6, 2)->default(0)->after('leave_remuneration');
            $table->unsignedSmallInteger('leave_year')->nullable()->after('interrupted_working_days')->index();
        });

        Schema::create('hr_leave_entitlements', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->index();
            $table->unsignedSmallInteger('leave_year');
            $table->decimal('entitlement_days', 7, 2)->default(15);
            $table->decimal('carried_forward_days', 7, 2)->default(0);
            $table->text('working_days')->nullable();
            $table->text('adjustment_note')->nullable();
            $table->date('entitlement_start_date')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
            $table->unique(['employee_id', 'leave_year'], 'hr_leave_employee_year_unique');
        });

        Schema::create('hr_public_holidays', function (Blueprint $table): void {
            $table->id();
            $table->date('holiday_date')->unique();
            $table->string('name', 180);
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_public_holidays');
        Schema::dropIfExists('hr_leave_entitlements');
        Schema::table('hr_requests', function (Blueprint $table): void {
            $table->dropIndex(['leave_year']);
            $table->dropColumn([
                'leave_type',
                'working_days_requested',
                'handover_person',
                'outstanding_duties',
                'notification_date',
                'working_days_approved',
                'leave_remuneration',
                'interrupted_working_days',
                'leave_year',
            ]);
        });
    }
};
