<?php

namespace Tests\Feature;

use App\Http\Controllers\StaffHrController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class StaffHrLeaveCalendarEntitlementsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        DB::connection()->getPdo()->sqliteCreateFunction('GREATEST', fn (...$values) => max(...$values));
        Schema::dropIfExists('hr_public_holidays');
        Schema::dropIfExists('hr_leave_entitlements');
        Schema::dropIfExists('hr_requests');
        Schema::create('hr_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id');
            $table->unsignedSmallInteger('leave_year')->nullable();
            $table->string('request_type');
            $table->string('leave_type')->nullable();
            $table->string('status');
            $table->decimal('working_days_approved', 6, 2)->nullable();
            $table->decimal('interrupted_working_days', 6, 2)->default(0);
            $table->decimal('working_days_requested', 6, 2)->nullable();
        });
        Schema::create('hr_leave_entitlements', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id');
            $table->unsignedSmallInteger('leave_year');
            $table->decimal('entitlement_days', 7, 2)->default(15);
            $table->decimal('carried_forward_days', 7, 2)->default(0);
            $table->text('working_days')->nullable();
            $table->text('adjustment_note')->nullable();
            $table->date('entitlement_start_date')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
            $table->unique(['employee_id', 'leave_year']);
        });
        Schema::create('hr_public_holidays', function (Blueprint $table): void {
            $table->id();
            $table->date('holiday_date')->unique();
            $table->string('name');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('hr_public_holidays');
        Schema::dropIfExists('hr_leave_entitlements');
        Schema::dropIfExists('hr_requests');

        parent::tearDown();
    }

    public function test_calendar_year_entitlement_does_not_depend_on_date_employed(): void
    {
        $staffRequest = Request::create('/api/v1/staff/leave', 'GET');
        $staffRequest->attributes->set('staff_portal_account', (object) [
            'id' => 12,
            'date_employed' => now()->format('Y').'-01-05',
        ]);

        $response = (new StaffHrController)->myLeave($staffRequest)->getData(true);

        $this->assertSame((int) now()->format('Y'), $response['year']);
        $this->assertSame(15.0, (float) $response['entitlement_days']);
        $this->assertSame(15.0, (float) $response['days_available']);
        $this->assertArrayNotHasKey('eligible_on', $response);
        $this->assertSame(now()->startOfYear()->toDateString(), DB::table('hr_leave_entitlements')->value('entitlement_start_date'));
    }
}
