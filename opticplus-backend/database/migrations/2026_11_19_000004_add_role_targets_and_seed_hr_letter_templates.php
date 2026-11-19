<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hr_letters', function ($table): void {
            $table->string('target_role', 180)->nullable()->after('employee_id')->index();
        });

        $templates = [
            [
                'title' => '2027 Employment Renewal Letter',
                'body' => "Date: {date}\nTo: {employee_name}\nPosition: {job_title}\n\nSUBJECT: RENEWAL OF EMPLOYMENT FOR THE 2027 WORKING YEAR\n\nDear {employee_name},\n\nFollowing a review of the Company's staffing requirements and your employment, Bealet Optical Centre Limited is pleased to offer you a renewal of your employment as {job_title} for the 2027 working year.\n\nYour renewed employment shall commence on [START DATE], subject to the terms and conditions contained in the attached Employment Renewal Agreement.\n\nYour agreed net monthly remuneration shall be GH₵[AMOUNT], subject to the payroll and statutory treatment stated in the agreement. Your responsibilities, reporting arrangements and performance expectations are outlined in your attached Job Description.\n\nAs part of the Company's commitment to improving productivity and rewarding excellent performance, you may also qualify for additional monthly performance-based allowances upon achieving approved targets.\n\nPlease read the attached documents carefully, sign where indicated and return the signed copies to Management by [RETURN DATE].\n\nWe appreciate your contribution to Bealet Optical Centre and look forward to your continued commitment and professionalism.\n\nYours faithfully,\n\nAUTHORISED SIGNATORY\nFor: Bealet Optical Centre Limited",
            ],
            [
                'title' => 'Probation Confirmation Letter',
                'body' => "Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: CONFIRMATION OF APPOINTMENT\n\nDear {employee_name},\n\nFollowing the review of your performance during the probation period, Management is pleased to confirm your appointment as {job_title} with effect from [EFFECTIVE DATE].\n\nYour employment shall continue under the terms of your employment agreement and the Company's Conditions of Service.\n\nWe congratulate you and look forward to your continued contribution.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited",
            ],
            [
                'title' => 'Contract Amendment Letter',
                'body' => "Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: AMENDMENT TO EMPLOYMENT TERMS\n\nDear {employee_name},\n\nThis letter confirms the following agreed amendment to your employment terms:\n\n[STATE AMENDMENT]\n\nThe amendment shall take effect from [EFFECTIVE DATE]. All other provisions of your existing employment agreement shall remain unchanged, subject to applicable law.\n\nPlease sign below to acknowledge and agree to this amendment.\n\nEmployer: ______________________________\nEmployee: ______________________________\nDate: __________________________________\n\nFor: Bealet Optical Centre Limited",
            ],
            [
                'title' => 'Query Letter — Request for Written Explanation',
                'body' => "Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: REQUEST FOR WRITTEN EXPLANATION\n\nDear {employee_name},\n\nManagement wishes to seek clarification concerning the following reported incident:\n\n[STATE FACTS OF INCIDENT]\n\nYou are requested to submit a written explanation by [RESPONSE DEADLINE]. No final conclusion has been reached at this stage. You are encouraged to provide any relevant information or supporting documentation.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited",
            ],
            [
                'title' => 'Written Warning Letter',
                'body' => "Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: FORMAL WRITTEN WARNING\n\nDear {employee_name},\n\nFollowing the investigation into [INCIDENT], including consideration of your response dated [RESPONSE DATE], Management has determined that [STATE FINDING AND REASONS]. This conduct falls below the standards expected of employees of Bealet Optical Centre Limited.\n\nYou are hereby issued a [FIRST/FINAL] written warning. You are expected to take immediate corrective action by:\n\n[STATE REQUIRED IMPROVEMENT]\n\nFurther similar misconduct may result in additional disciplinary action, subject to applicable law and fair procedure.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited",
            ],
            [
                'title' => 'Resignation Acceptance Letter',
                'body' => "Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: ACKNOWLEDGEMENT OF RESIGNATION\n\nDear {employee_name},\n\nThe Company acknowledges receipt of your resignation dated [RESIGNATION DATE]. Your proposed final working day shall be [FINAL WORKING DAY], subject to the applicable notice provisions.\n\nYou are required to complete the necessary handover and return all company property. Your final remuneration and other outstanding entitlements will be processed in accordance with applicable law.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited",
            ],
            [
                'title' => 'Employment Non-Renewal Letter',
                'body' => "Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: NOTICE OF NON-RENEWAL OF EMPLOYMENT\n\nDear {employee_name},\n\nWe refer to your employment agreement dated [AGREEMENT DATE]. The Company hereby notifies you that it does not intend to offer a further renewal following the expiry of the agreement on [EXPIRY DATE].\n\nThe Company will arrange the necessary handover and clearance procedures. All outstanding remuneration and other lawful entitlements shall be settled in accordance with applicable law.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited\n\nGM REVIEW REQUIRED: Review this notice against the employee's actual continuous service and contractual circumstances before issue.",
            ],
        ];

        foreach ($templates as $template) {
            if (! DB::table('hr_letter_templates')->where('title', $template['title'])->exists()) {
                DB::table('hr_letter_templates')->insert($template + [
                    'active' => true,
                    'created_by' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('hr_letters', function ($table): void {
            $table->dropIndex(['target_role']);
            $table->dropColumn('target_role');
        });
    }
};
