<?php

namespace App\Console\Commands;

use App\Services\BsmiTransactionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncBsmiTransactionsCommand extends Command
{
    protected $signature = 'bsmi:sync {billing_id? : Sync a single billing ID} {--all : Rebuild BSMI rows for every billing that has frame lines}';

    protected $description = 'Rebuild bsmi_transactions from billing_frames and cash-like sales (Cash, Mobile Money, Paystack)';

    public function handle(BsmiTransactionService $bsmi): int
    {
        if ($this->argument('billing_id')) {
            $id = (int) $this->argument('billing_id');
            $bsmi->syncForBilling($id);
            $count = \Illuminate\Support\Facades\DB::table('bsmi_transactions')->where('billing_id', $id)->count();
            $this->info("Billing {$id}: {$count} BSMI row(s).");

            return self::SUCCESS;
        }

        if ($this->option('all')) {
            $bsmi->syncAllBillings();
            $rows = (int) DB::table('bsmi_transactions')->count();
            $this->info("BSMI sync complete. Total BSMI rows: {$rows}.");

            return self::SUCCESS;
        }

        $this->error('Specify a billing_id or use --all');

        return self::FAILURE;
    }
}
