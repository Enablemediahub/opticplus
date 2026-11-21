<?php

namespace Tests\Feature;

use App\Http\Controllers\CustomerServiceController;
use App\Http\Controllers\OptometristReferralController;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class OptometristReferralControllerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('users', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->string('role');
            $table->unsignedInteger('branch_id')->nullable();
        });
        Schema::create('patient_records', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->unsignedInteger('branch_id');
            $table->unsignedBigInteger('assigned_optometrist_id')->nullable();
            $table->string('folder_id');
            $table->string('name')->nullable();
            $table->string('surname')->nullable();
            $table->string('firstname')->nullable();
            $table->string('othernames')->nullable();
        });
        Schema::create('billing', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->string('receipt_number')->nullable();
        });
        Schema::create('customer_followups', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->unsignedInteger('branch_id');
            $table->unsignedBigInteger('billing_id');
            $table->unsignedBigInteger('patient_id')->nullable();
            $table->string('folder_id')->nullable();
            $table->dateTime('pickup_at');
            $table->string('milestone');
            $table->date('due_at');
            $table->string('status');
            $table->string('complaint_status');
        });
        Schema::create('customer_followup_attempts', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->unsignedBigInteger('followup_id');
            $table->unsignedBigInteger('attempted_by');
            $table->dateTime('attempted_at');
            $table->string('contact_result');
            $table->string('vision_response')->nullable();
            $table->string('wearing_frequency')->nullable();
            $table->string('complaint_category');
            $table->text('complaint_notes')->nullable();
            $table->boolean('needs_optometrist_review');
            $table->text('call_notes')->nullable();
            $table->dateTime('next_attempt_at')->nullable();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('customer_followup_attempts');
        Schema::dropIfExists('customer_followups');
        Schema::dropIfExists('billing');
        Schema::dropIfExists('patient_records');
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_it_only_returns_referred_concerns_for_the_assigned_optometrist_in_their_branch(): void
    {
        DB::table('users')->insert([
            ['id' => 10, 'name' => 'Assigned Optometrist', 'role' => 'optometrist', 'branch_id' => 1],
            ['id' => 11, 'name' => 'Receptionist', 'role' => 'receptionist', 'branch_id' => 1],
        ]);
        DB::table('patient_records')->insert([
            ['id' => 101, 'branch_id' => 1, 'assigned_optometrist_id' => 10, 'folder_id' => 'F-101', 'name' => 'Assigned Patient', 'surname' => null, 'firstname' => null, 'othernames' => null],
            ['id' => 102, 'branch_id' => 1, 'assigned_optometrist_id' => 12, 'folder_id' => 'F-102', 'name' => 'Other Optometrist Patient', 'surname' => null, 'firstname' => null, 'othernames' => null],
            ['id' => 103, 'branch_id' => 2, 'assigned_optometrist_id' => 10, 'folder_id' => 'F-103', 'name' => 'Other Branch Patient', 'surname' => null, 'firstname' => null, 'othernames' => null],
            ['id' => 104, 'branch_id' => 1, 'assigned_optometrist_id' => null, 'folder_id' => 'F-104', 'name' => 'Unassigned Patient', 'surname' => null, 'firstname' => null, 'othernames' => null],
            ['id' => 105, 'branch_id' => 1, 'assigned_optometrist_id' => 10, 'folder_id' => 'F-105', 'name' => null, 'surname' => 'Folder', 'firstname' => 'Assigned', 'othernames' => null],
        ]);
        DB::table('billing')->insert([
            ['id' => 201, 'receipt_number' => 'R-201'],
            ['id' => 202, 'receipt_number' => 'R-202'],
            ['id' => 203, 'receipt_number' => 'R-203'],
            ['id' => 204, 'receipt_number' => 'R-204'],
            ['id' => 205, 'receipt_number' => 'R-205'],
        ]);
        DB::table('customer_followups')->insert([
            ['id' => 301, 'branch_id' => 1, 'billing_id' => 201, 'patient_id' => 101, 'folder_id' => 'F-101', 'pickup_at' => '2026-01-01 10:00:00', 'milestone' => 'week_1', 'due_at' => '2026-01-08', 'status' => 'completed', 'complaint_status' => 'open'],
            ['id' => 302, 'branch_id' => 1, 'billing_id' => 202, 'patient_id' => 102, 'folder_id' => 'F-102', 'pickup_at' => '2026-01-01 10:00:00', 'milestone' => 'week_1', 'due_at' => '2026-01-08', 'status' => 'completed', 'complaint_status' => 'open'],
            ['id' => 303, 'branch_id' => 2, 'billing_id' => 203, 'patient_id' => 103, 'folder_id' => 'F-103', 'pickup_at' => '2026-01-01 10:00:00', 'milestone' => 'week_1', 'due_at' => '2026-01-08', 'status' => 'completed', 'complaint_status' => 'open'],
            ['id' => 304, 'branch_id' => 1, 'billing_id' => 204, 'patient_id' => 104, 'folder_id' => 'F-104', 'pickup_at' => '2026-01-01 10:00:00', 'milestone' => 'week_1', 'due_at' => '2026-01-08', 'status' => 'completed', 'complaint_status' => 'open'],
            ['id' => 305, 'branch_id' => 1, 'billing_id' => 205, 'patient_id' => null, 'folder_id' => 'F-105', 'pickup_at' => '2026-01-01 10:00:00', 'milestone' => 'week_1', 'due_at' => '2026-01-08', 'status' => 'completed', 'complaint_status' => 'open'],
        ]);
        DB::table('customer_followup_attempts')->insert([
            ['id' => 401, 'followup_id' => 301, 'attempted_by' => 11, 'attempted_at' => '2026-01-09 10:00:00', 'contact_result' => 'reached', 'vision_response' => 'worse', 'wearing_frequency' => 'daily', 'complaint_category' => 'blurred_vision', 'complaint_notes' => 'Vision concern', 'needs_optometrist_review' => true],
            ['id' => 402, 'followup_id' => 302, 'attempted_by' => 11, 'attempted_at' => '2026-01-09 10:00:00', 'contact_result' => 'reached', 'vision_response' => 'worse', 'wearing_frequency' => 'daily', 'complaint_category' => 'blurred_vision', 'complaint_notes' => 'Assigned to another optometrist', 'needs_optometrist_review' => true],
            ['id' => 403, 'followup_id' => 303, 'attempted_by' => 11, 'attempted_at' => '2026-01-09 10:00:00', 'contact_result' => 'reached', 'vision_response' => 'worse', 'wearing_frequency' => 'daily', 'complaint_category' => 'blurred_vision', 'complaint_notes' => 'Other branch', 'needs_optometrist_review' => true],
            ['id' => 404, 'followup_id' => 304, 'attempted_by' => 11, 'attempted_at' => '2026-01-09 10:00:00', 'contact_result' => 'reached', 'vision_response' => 'worse', 'wearing_frequency' => 'daily', 'complaint_category' => 'blurred_vision', 'complaint_notes' => 'Unassigned patient', 'needs_optometrist_review' => true],
            ['id' => 405, 'followup_id' => 305, 'attempted_by' => 11, 'attempted_at' => '2026-01-08 10:00:00', 'contact_result' => 'reached', 'vision_response' => 'worse', 'wearing_frequency' => 'daily', 'complaint_category' => 'blurred_vision', 'complaint_notes' => 'Resolved using folder assignment', 'needs_optometrist_review' => true],
        ]);

        $user = (new User())->forceFill(['id' => 10, 'role' => 'optometrist', 'branch_id' => 1]);
        $request = Request::create('/api/v1/optometrist/referrals');
        $request->setUserResolver(fn (): User => $user);

        $response = (new OptometristReferralController())->index($request);
        $data = $response->getData(true);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(2, $data['pagination']['total']);
        $this->assertSame('Assigned Patient', $data['referrals'][0]['patient_name']);
        $this->assertSame('Vision concern', $data['referrals'][0]['complaint_notes']);
        $this->assertSame('Folder Assigned', $data['referrals'][1]['patient_name']);

        $searchRequest = Request::create('/api/v1/optometrist/referrals', 'GET', ['search' => 'Folder Assigned']);
        $searchRequest->setUserResolver(fn (): User => $user);
        $searchResponse = (new OptometristReferralController())->index($searchRequest);

        $this->assertSame(1, $searchResponse->getData(true)['pagination']['total']);
    }

    public function test_it_denies_non_optometrists_from_the_referral_inbox_and_customer_service_dashboard(): void
    {
        $receptionist = (new User())->forceFill(['id' => 10, 'role' => 'receptionist', 'branch_id' => 1]);
        $referralRequest = Request::create('/api/v1/optometrist/referrals');
        $referralRequest->setUserResolver(fn (): User => $receptionist);
        $optometrist = (new User())->forceFill(['id' => 11, 'role' => 'optometrist', 'branch_id' => 1]);
        $customerServiceRequest = Request::create('/api/v1/customer-service');
        $customerServiceRequest->setUserResolver(fn (): User => $optometrist);

        $referralResponse = (new OptometristReferralController())->index($referralRequest);
        $customerServiceResponse = (new CustomerServiceController())->dashboard($customerServiceRequest);

        $this->assertSame(403, $referralResponse->getStatusCode());
        $this->assertSame(403, $customerServiceResponse->getStatusCode());
    }
}
