<?php

namespace Tests\Feature;

use App\Http\Controllers\BankAlertController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class BankAlertSharedAccountTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('bank_accounts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('branch_id');
            $table->string('bank_name', 80);
            $table->string('account_suffix', 4);
            $table->string('account_label', 80)->nullable();
            $table->decimal('reported_balance', 12, 2)->nullable();
            $table->timestamp('reported_balance_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['branch_id', 'bank_name', 'account_suffix']);
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('bank_accounts');

        parent::tearDown();
    }

    public function test_existing_gtbank_account_is_shared_with_both_branches_idempotently(): void
    {
        DB::table('bank_accounts')->insert([
            'branch_id' => 2,
            'bank_name' => 'GTBank',
            'account_suffix' => '5951',
            'account_label' => 'Operating account',
            'reported_balance' => 125.50,
            'reported_balance_at' => '2026-11-10 12:00:00',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $controller = new BankAlertController;
        $method = new \ReflectionMethod($controller, 'ensureSharedGtBankAccounts');
        $method->invoke($controller);
        $method->invoke($controller);

        $accounts = DB::table('bank_accounts')->where('bank_name', 'GTBank')->orderBy('branch_id')->get();

        $this->assertCount(2, $accounts);
        $this->assertSame([1, 2], $accounts->pluck('branch_id')->map(fn ($id): int => (int) $id)->all());
        $this->assertEquals(125.50, (float) $accounts[0]->reported_balance);
        $this->assertEquals(125.50, (float) $accounts[1]->reported_balance);
    }
}
