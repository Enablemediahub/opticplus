<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('working_capital_liabilities')) {
            return;
        }

        if (! Schema::hasColumn('working_capital_liabilities', 'entry_side')) {
            Schema::table('working_capital_liabilities', function (Blueprint $table): void {
                $table->enum('entry_side', ['current_asset', 'current_liability'])
                    ->default('current_liability')
                    ->after('branch_id')
                    ->index();
            });
        }

        DB::statement("ALTER TABLE working_capital_liabilities MODIFY liability_type ENUM('trade_creditors','staff_creditors','accrued_expenses','other_actuals','cash_in_hand','cash_in_momo','cash_at_bank') NOT NULL");
    }

    public function down(): void
    {
        if (! Schema::hasTable('working_capital_liabilities')) {
            return;
        }

        DB::table('working_capital_liabilities')
            ->whereIn('liability_type', ['cash_in_hand', 'cash_in_momo', 'cash_at_bank'])
            ->delete();
        DB::statement("ALTER TABLE working_capital_liabilities MODIFY liability_type ENUM('trade_creditors','staff_creditors','accrued_expenses','other_actuals') NOT NULL");

        if (Schema::hasColumn('working_capital_liabilities', 'entry_side')) {
            Schema::table('working_capital_liabilities', function (Blueprint $table): void {
                $table->dropColumn('entry_side');
            });
        }
    }
};