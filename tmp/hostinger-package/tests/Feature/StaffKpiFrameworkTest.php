<?php

namespace Tests\Feature;

use App\Http\Controllers\StaffHrController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class StaffKpiFrameworkTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            'hr_kpi_assessment_items',
            'hr_kpi_assessments',
            'hr_kpi_allowance_bands',
            'hr_kpi_scorecard_items',
            'hr_kpi_scorecards',
            'employees_comprehensive',
        ] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::create('employees_comprehensive', function (Blueprint $table): void {
            $table->unsignedInteger('id')->primary();
            $table->string('status', 24);
            $table->string('job_title', 180)->nullable();
            $table->string('branch', 120)->nullable();
        });
        Schema::create('hr_kpi_scorecards', function (Blueprint $table): void {
            $table->id();
            $table->string('role_title', 180);
            $table->string('branch', 120)->default('*');
            $table->decimal('max_monthly_allowance', 12, 2)->default(0);
            $table->boolean('active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
            $table->unique(['role_title', 'branch'], 'hr_kpi_scorecards_role_branch_unique');
        });
        Schema::create('hr_kpi_scorecard_items', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('scorecard_id');
            $table->string('title', 180);
            $table->text('description')->nullable();
            $table->unsignedTinyInteger('weight');
            $table->text('target_description')->nullable();
            $table->decimal('target_value', 12, 2)->nullable();
            $table->string('target_unit', 40)->nullable();
            $table->string('direction', 16)->default('quality');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('hr_kpi_allowance_bands', function (Blueprint $table): void {
            $table->id();
            $table->decimal('minimum_score', 5, 2)->unique();
            $table->decimal('payout_percent', 5, 2);
            $table->string('label', 80);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
        Schema::create('hr_kpi_assessments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id');
            $table->unsignedBigInteger('scorecard_id')->nullable();
            $table->char('period', 7);
            $table->string('role_title_snapshot', 180);
            $table->string('branch_snapshot', 120)->nullable();
            $table->decimal('max_monthly_allowance', 12, 2)->default(0);
            $table->decimal('total_score', 5, 2)->default(0);
            $table->decimal('allowance_percent', 5, 2)->default(0);
            $table->decimal('calculated_allowance', 12, 2)->default(0);
            $table->string('status', 24)->default('draft');
            $table->text('summary_notes')->nullable();
            $table->timestamp('targets_confirmed_at')->nullable();
            $table->unsignedBigInteger('targets_confirmed_by')->nullable();
            $table->text('employee_comment')->nullable();
            $table->timestamp('employee_comment_at')->nullable();
            $table->text('manager_response')->nullable();
            $table->unsignedBigInteger('evaluated_by')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->unique(['employee_id', 'period'], 'hr_kpi_assessment_employee_period_unique');
        });
        Schema::create('hr_kpi_assessment_items', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('assessment_id');
            $table->unsignedBigInteger('scorecard_item_id')->nullable();
            $table->string('title_snapshot', 180);
            $table->text('description_snapshot')->nullable();
            $table->unsignedTinyInteger('weight');
            $table->text('target_description_snapshot')->nullable();
            $table->decimal('target_value_snapshot', 12, 2)->nullable();
            $table->string('target_unit_snapshot', 40)->nullable();
            $table->string('direction_snapshot', 16)->default('quality');
            $table->unsignedTinyInteger('rating')->nullable();
            $table->decimal('earned_points', 5, 2)->default(0);
            $table->text('evidence')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        foreach ([
            'hr_kpi_assessment_items',
            'hr_kpi_assessments',
            'hr_kpi_allowance_bands',
            'hr_kpi_scorecard_items',
            'hr_kpi_scorecards',
            'employees_comprehensive',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_monthly_score_is_weighted_and_published_assessment_accepts_employee_feedback(): void
    {
        $this->createEmployee(12, 'Accountant', 'Madina');
        $scorecardId = $this->createScorecard('Accountant', 'Madina', 500);
        $firstItemId = $this->createScorecardItem($scorecardId, 'Financial reporting', 20);
        $secondItemId = $this->createScorecardItem($scorecardId, 'Reconciliation', 80, 1);
        $this->createBand(0, 0);
        $this->createBand(80, 60);
        $this->createBand(95, 100);
        $controller = new StaffHrController;
        $payload = [
            'employee_id' => 12,
            'scorecard_id' => $scorecardId,
            'period' => '2026-10',
            'targets_confirmed' => true,
            'items' => [
                ['scorecard_item_id' => $firstItemId, 'rating' => 5, 'evidence' => 'Monthly report submitted on time.'],
                ['scorecard_item_id' => $secondItemId, 'rating' => 4, 'evidence' => 'Signed bank and cash reconciliations.'],
            ],
        ];

        $saved = $controller->saveKpiAssessment($this->managerRequest('POST', $payload));
        $savedData = $saved->getData(true);
        $this->assertSame(201, $saved->getStatusCode());
        $this->assertSame(84.0, (float) $savedData['total_score']);
        $this->assertSame(60.0, (float) $savedData['allowance_percent']);
        $this->assertSame(300.0, (float) $savedData['calculated_allowance']);

        $assessmentId = (int) $savedData['id'];
        $approved = $controller->reviewKpiAssessment(
            $this->managerRequest('PATCH', ['status' => 'approved']),
            $assessmentId,
        );
        $this->assertSame(200, $approved->getStatusCode());
        $published = $controller->reviewKpiAssessment(
            $this->managerRequest('PATCH', ['status' => 'published']),
            $assessmentId,
        );
        $this->assertSame(200, $published->getStatusCode());

        $commentRequest = Request::create('/api/v1/staff/kpi-assessments/'.$assessmentId.'/comment', 'POST', [
            'employee_comment' => 'Please review the reconciliation evidence.',
        ]);
        $commentRequest->attributes->set('staff_portal_account', (object) ['id' => 12]);
        $commented = $controller->commentOnKpiAssessment($commentRequest, $assessmentId);

        $this->assertSame(200, $commented->getStatusCode());
        $this->assertSame('Please review the reconciliation evidence.', DB::table('hr_kpi_assessments')->where('id', $assessmentId)->value('employee_comment'));
    }

    public function test_general_manager_cannot_approve_their_own_assessment(): void
    {
        $this->createEmployee(14, 'General Manager', 'Labadi');
        $scorecardId = $this->createScorecard('General Manager', '*', 0);
        $itemId = $this->createScorecardItem($scorecardId, 'Financial performance', 100);
        $this->createBand(0, 0);
        $controller = new StaffHrController;
        $saved = $controller->saveKpiAssessment($this->managerRequest('POST', [
            'employee_id' => 14,
            'scorecard_id' => $scorecardId,
            'period' => '2026-10',
            'targets_confirmed' => true,
            'items' => [['scorecard_item_id' => $itemId, 'rating' => 5, 'evidence' => 'Board report and branch results.']],
        ]));
        $assessmentId = (int) $saved->getData(true)['id'];

        $response = $controller->reviewKpiAssessment(
            $this->managerRequest('PATCH', ['status' => 'approved']),
            $assessmentId,
        );

        $this->assertSame(422, $response->getStatusCode());
        $this->assertSame('draft', DB::table('hr_kpi_assessments')->where('id', $assessmentId)->value('status'));
    }

    public function test_assessment_cannot_be_approved_without_confirmed_monthly_targets(): void
    {
        $this->createEmployee(15, 'Accountant', 'Madina');
        $scorecardId = $this->createScorecard('Accountant', 'Madina', 0);
        $itemId = $this->createScorecardItem($scorecardId, 'Financial reporting', 100);
        $this->createBand(0, 0);
        $controller = new StaffHrController;
        $saved = $controller->saveKpiAssessment($this->managerRequest('POST', [
            'employee_id' => 15,
            'scorecard_id' => $scorecardId,
            'period' => '2026-10',
            'items' => [['scorecard_item_id' => $itemId, 'rating' => 5, 'evidence' => 'Monthly report submitted.']],
        ]));
        $assessmentId = (int) $saved->getData(true)['id'];

        $response = $controller->reviewKpiAssessment(
            $this->managerRequest('PATCH', ['status' => 'approved']),
            $assessmentId,
        );

        $this->assertSame(422, $response->getStatusCode());
        $this->assertSame('draft', DB::table('hr_kpi_assessments')->where('id', $assessmentId)->value('status'));
    }

    private function createEmployee(int $id, string $roleTitle, string $branch): void
    {
        DB::table('employees_comprehensive')->insert([
            'id' => $id,
            'status' => 'active',
            'job_title' => $roleTitle,
            'branch' => $branch,
        ]);
    }

    private function createScorecard(string $roleTitle, string $branch, float $allowance): int
    {
        return (int) DB::table('hr_kpi_scorecards')->insertGetId([
            'role_title' => $roleTitle,
            'branch' => $branch,
            'max_monthly_allowance' => $allowance,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createScorecardItem(int $scorecardId, string $title, int $weight, int $sortOrder = 0): int
    {
        return (int) DB::table('hr_kpi_scorecard_items')->insertGetId([
            'scorecard_id' => $scorecardId,
            'title' => $title,
            'description' => $title,
            'weight' => $weight,
            'target_description' => 'Target agreed before the month.',
            'direction' => 'higher',
            'sort_order' => $sortOrder,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createBand(float $minimumScore, float $payoutPercent): void
    {
        DB::table('hr_kpi_allowance_bands')->insert([
            'minimum_score' => $minimumScore,
            'payout_percent' => $payoutPercent,
            'label' => 'Band '.$minimumScore,
            'sort_order' => (int) $minimumScore,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function managerRequest(string $method, array $payload): Request
    {
        $request = Request::create('/api/v1/manager/hr-space/kpi-assessments', $method, $payload);
        $request->setUserResolver(fn () => (object) ['id' => 77, 'normalized_role' => 'manager']);

        return $request;
    }
}
