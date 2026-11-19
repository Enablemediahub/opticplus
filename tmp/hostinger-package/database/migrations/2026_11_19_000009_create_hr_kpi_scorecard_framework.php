<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hr_kpi_scorecards', function (Blueprint $table): void {
            $table->id();
            $table->string('role_title', 180);
            $table->string('branch', 120)->default('*');
            $table->decimal('max_monthly_allowance', 12, 2)->default(0);
            $table->boolean('active')->default(true)->index();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
            $table->unique(['role_title', 'branch'], 'hr_kpi_scorecards_role_branch_unique');
        });

        Schema::create('hr_kpi_scorecard_items', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('scorecard_id')->index();
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
            $table->unsignedInteger('employee_id')->index();
            $table->unsignedBigInteger('scorecard_id')->nullable()->index();
            $table->char('period', 7)->index();
            $table->string('role_title_snapshot', 180);
            $table->string('branch_snapshot', 120)->nullable();
            $table->decimal('max_monthly_allowance', 12, 2)->default(0);
            $table->decimal('total_score', 5, 2)->default(0);
            $table->decimal('allowance_percent', 5, 2)->default(0);
            $table->decimal('calculated_allowance', 12, 2)->default(0);
            $table->string('status', 24)->default('draft')->index();
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
            $table->unsignedBigInteger('assessment_id')->index();
            $table->unsignedBigInteger('scorecard_item_id')->nullable()->index();
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

        $now = now();
        $bands = [
            [0, 0, 'Unsatisfactory'],
            [70, 20, 'Needs improvement'],
            [75, 40, 'Satisfactory'],
            [80, 60, 'Good'],
            [85, 75, 'Very good'],
            [90, 90, 'Excellent'],
            [95, 100, 'Outstanding'],
        ];
        foreach ($bands as $sortOrder => [$minimumScore, $payoutPercent, $label]) {
            DB::table('hr_kpi_allowance_bands')->insert([
                'minimum_score' => $minimumScore,
                'payout_percent' => $payoutPercent,
                'label' => $label,
                'sort_order' => $sortOrder,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $scorecards = [
            'General Manager' => [
                ['Financial performance and sales oversight', 20, 'Achievement against approved monthly branch sales targets, expense control and financial performance monitoring.'],
                ['Operational management', 20, 'Smooth running of both branches, equipment, facilities, systems and daily operations.'],
                ['Staff management and HR compliance', 15, 'Attendance management, staff supervision, performance reviews, leave records and timely HR action.'],
                ['Financial controls and reporting', 15, 'Accuracy and timely submission of management reports, cash controls, banking and follow-up of financial discrepancies.'],
                ['Customer service and service quality', 10, 'Complaint resolution, customer experience and service standards across branches.'],
                ['Strategic execution and Board directives', 15, 'Delivery of Board-approved projects, budgets, decisions and operational improvements.'],
                ['Compliance and risk management', 5, 'Regulatory matters, documentation, safety and business risk escalation.'],
            ],
            'Optometrist' => [
                ['Clinical quality and professional standards', 30, 'Appropriate examinations, accurate clinical records, professional judgement and adherence to clinical standards.'],
                ['Patient experience and communication', 20, 'Patient satisfaction, clear explanations, respectful treatment and appropriate follow-up.'],
                ['Patient records and digital documentation', 15, 'Completeness, accuracy and timely entry of examination findings and prescriptions.'],
                ['Punctuality and availability', 10, 'Attendance, punctuality and availability during agreed working hours.'],
                ['Equipment and clinical room management', 10, 'Care of equipment, cleanliness, reporting faults and readiness of the examination room.'],
                ['Teamwork and coordination', 10, 'Effective coordination with reception, technician and other staff.'],
                ['Professional development and compliance', 5, 'Professional registration, training and continuing professional development.'],
            ],
            'Accountant' => [
                ['Financial reporting', 25, 'Timely and accurate daily, weekly and monthly financial reports.'],
                ['Bank and cash reconciliation compliance', 20, 'Reconciliation of bank accounts, cash, mobile money and sales records.'],
                ['Payroll and statutory compliance', 15, 'Accurate payroll preparation and timely PAYE, pension and other required submissions or payments.'],
                ['Expense and payment control', 15, 'Proper documentation, authorisation and monitoring of company expenses and payments.'],
                ['Receivables and insurance claims', 10, 'Monitoring outstanding insurance claims, follow-ups and debtor records.'],
                ['Financial records and documentation', 10, 'Accurate filing, supporting documents and audit readiness.'],
                ['Management support', 5, 'Timely financial advice, cash-flow information and responses to management requests.'],
            ],
            'Technician' => [
                ['Technical quality and accuracy', 25, 'Correct lens fitting, edging, adjustments, repairs and reduction of avoidable technical errors.'],
                ['Job turnaround time', 20, 'Completion of jobs within agreed delivery timelines.'],
                ['Lens procurement and supplier coordination', 15, 'Timely ordering, supplier follow-up, correct specifications and procurement documentation.'],
                ['Workshop organisation and equipment care', 10, 'Cleanliness, equipment maintenance, safe operation and reporting of faults.'],
                ['Job records and accountability', 10, 'Accurate records of jobs received, completed, delayed, remade and repaired.'],
                ['Teamwork and communication', 10, 'Updates to reception, showroom and management about job progress and delays.'],
                ['Stock and material control', 10, 'Responsible use and tracking of workshop materials, lenses and other assigned stock.'],
            ],
            'Receptionist/Cashier' => [
                ['Customer service and reception', 20, 'Welcoming patients, communication, professionalism and customer feedback.'],
                ['Patient registration and data accuracy', 20, 'Accurate registration, patient details and record updates.'],
                ['Billing and cash accuracy', 20, 'Correct billing, authorised discounts, receipt issuance and cash/payment reconciliation.'],
                ['Appointment and patient-flow management', 15, 'Efficient scheduling, coordination with the Optometrist and reduction of avoidable waiting delays.'],
                ['Digital records and documentation', 10, 'Timely and complete entry of transactions and patient information.'],
                ['Attendance and punctuality', 10, 'Compliance with the employee’s agreed working schedule, including any branch-specific schedule.'],
                ['Teamwork and communication', 5, 'Coordination with the Optometrist, Technician and Showroom Attendant.'],
            ],
            'Showroom Attendant' => [
                ['Customer engagement and service', 20, 'How customers are welcomed, assisted and treated.'],
                ['Sales and approved branch targets', 25, 'Achievement of agreed frame and showroom sales targets, with proper transaction records.'],
                ['Product knowledge', 15, 'Knowledge of frames, product features, pricing and available options.'],
                ['Showroom presentation', 15, 'Cleanliness, arrangement, display standards and general showroom appearance.'],
                ['Stock management', 10, 'Accurate stock handling, identification of missing or damaged items and stock-count support.'],
                ['Teamwork and coordination', 10, 'Working with reception, Optometrist and Technician to complete customer orders.'],
                ['Attendance and punctuality', 5, 'Compliance with agreed working hours.'],
            ],
        ];

        foreach ($scorecards as $roleTitle => $items) {
            $scorecardId = DB::table('hr_kpi_scorecards')->insertGetId([
                'role_title' => $roleTitle,
                'branch' => '*',
                'max_monthly_allowance' => 0,
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            foreach ($items as $sortOrder => [$title, $weight, $description]) {
                DB::table('hr_kpi_scorecard_items')->insert([
                    'scorecard_id' => $scorecardId,
                    'title' => $title,
                    'description' => $description,
                    'weight' => $weight,
                    'target_description' => 'Set and communicate a measurable target before the month begins. Define the evidence and how exceptional circumstances will be handled.',
                    'direction' => 'quality',
                    'sort_order' => $sortOrder,
                    'active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_kpi_assessment_items');
        Schema::dropIfExists('hr_kpi_assessments');
        Schema::dropIfExists('hr_kpi_allowance_bands');
        Schema::dropIfExists('hr_kpi_scorecard_items');
        Schema::dropIfExists('hr_kpi_scorecards');
    }
};
