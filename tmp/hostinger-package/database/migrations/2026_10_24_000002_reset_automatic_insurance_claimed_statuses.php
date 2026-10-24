<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Claims were automatically saved as "claimed" before external submission was tracked.
        DB::table('insurance_claims')->where('status', 'claimed')->update(['status' => 'pending']);
    }

    public function down(): void
    {
        // Intentionally do not restore the old status: it did not reliably indicate submission.
    }
};
