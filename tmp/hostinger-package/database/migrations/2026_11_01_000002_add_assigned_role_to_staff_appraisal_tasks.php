<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('staff_appraisal_tasks', 'assigned_role')) {
            Schema::table('staff_appraisal_tasks', function (Blueprint $table): void {
                $table->string('assigned_role', 40)->nullable()->after('measurement');
            });
        }

        DB::table('staff_appraisal_tasks as t')
            ->join('staff_appraisal_assignments as a', 'a.task_id', '=', 't.id')
            ->whereNull('t.assigned_role')
            ->update(['t.assigned_role' => DB::raw('a.role_snapshot')]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('staff_appraisal_tasks', 'assigned_role')) {
            Schema::table('staff_appraisal_tasks', function (Blueprint $table): void {
                $table->dropColumn('assigned_role');
            });
        }
    }
};
