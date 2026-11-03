<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('patient_folder_id_allocations')) {
            Schema::create('patient_folder_id_allocations', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->string('folder_id', 60)->nullable()->unique();
                $table->char('initials', 3);
                $table->char('issued_year', 4);
                $table->string('status', 16)->default('reserved')->index();
                $table->unsignedInteger('patient_record_id')->nullable()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('patient_records')) {
            return;
        }

        $highestSequence = 0;
        foreach (DB::table('patient_records')->pluck('folder_id') as $folderId) {
            if (preg_match('/^BOC-[A-Z0-9]{2,3}\/([0-9]{4,})\/[0-9]{4}$/i', (string) $folderId, $matches)) {
                $highestSequence = max($highestSequence, (int) $matches[1]);
            }
        }

        if ($highestSequence > 0) {
            DB::table('patient_folder_id_allocations')->insertOrIgnore([
                'id' => $highestSequence,
                'folder_id' => null,
                'initials' => 'LEG',
                'issued_year' => '0000',
                'status' => 'legacy',
                'patient_record_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_folder_id_allocations');
    }
};
