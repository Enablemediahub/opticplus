<?php

namespace Tests\Feature;

use App\Http\Controllers\ManagerNotificationController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ManagerHrNotificationCountsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('hr_kpi_assessments');
        Schema::dropIfExists('hr_requests');
        Schema::dropIfExists('employees_comprehensive');

        Schema::create('employees_comprehensive', function (Blueprint $table): void {
            $table->unsignedInteger('id')->primary();
            $table->unsignedInteger('branch_id');
        });
        Schema::create('hr_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id');
            $table->string('status');
        });
        Schema::create('hr_kpi_assessments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id');
            $table->text('employee_comment')->nullable();
            $table->text('manager_response')->nullable();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('hr_kpi_assessments');
        Schema::dropIfExists('hr_requests');
        Schema::dropIfExists('employees_comprehensive');

        parent::tearDown();
    }

    public function test_manager_notifications_include_branch_scoped_hr_requests_and_unanswered_staff_messages(): void
    {
        DB::table('employees_comprehensive')->insert([
            ['id' => 12, 'branch_id' => 1],
            ['id' => 24, 'branch_id' => 2],
        ]);
        DB::table('hr_requests')->insert([
            ['employee_id' => 12, 'status' => 'pending'],
            ['employee_id' => 24, 'status' => 'pending'],
            ['employee_id' => 12, 'status' => 'approved'],
        ]);
        DB::table('hr_kpi_assessments')->insert([
            ['employee_id' => 12, 'employee_comment' => 'Please clarify my score.', 'manager_response' => null],
            ['employee_id' => 12, 'employee_comment' => 'Thank you.', 'manager_response' => 'Received.'],
            ['employee_id' => 24, 'employee_comment' => 'Question from other branch.', 'manager_response' => null],
        ]);
        $user = new class
        {
            public string $normalized_role = 'manager';
            public int $branch_id = 1;

            public function isAdmin(): bool
            {
                return false;
            }
        };
        $request = Request::create('/api/v1/manager/notifications', 'GET');
        $request->setUserResolver(fn () => $user);

        $counts = (new ManagerNotificationController)->summary($request)->getData(true)['counts'];

        $this->assertSame(1, $counts['hr_requests']);
        $this->assertSame(1, $counts['staff_messages']);
        $this->assertSame(
            $counts['memos'] + $counts['expenses'] + $counts['sms_reviews'] + 2,
            $counts['total'],
        );
    }
}
