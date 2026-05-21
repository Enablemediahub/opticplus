<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BsmiTransactionService
{
    /** @var list<string> */
    public const CASH_LIKE_SALES_METHODS = ['Cash', 'Mobile Money', 'Paystack'];

    public function syncForBilling(int $billingId, ?int $soldByUserId = null): void
    {
        if (! Schema::hasTable('bsmi_transactions')) {
            return;
        }

        $billing = DB::table('billing')->where('id', $billingId)->first();
        if (! $billing) {
            return;
        }

        $branchId = (int) $billing->branch_id;

        $cashPaid = (float) DB::table('sales')
            ->where('billing_id', $billingId)
            ->whereIn('payment_method', self::CASH_LIKE_SALES_METHODS)
            ->sum('amount_paid');

        DB::table('bsmi_transactions')->where('billing_id', $billingId)->delete();

        if ($cashPaid <= 0) {
            return;
        }

        $frames = DB::table('billing_frames')
            ->where('billing_id', $billingId)
            ->orderBy('id')
            ->get();

        if ($frames->isEmpty()) {
            return;
        }

        $firstSale = DB::table('sales')
            ->where('billing_id', $billingId)
            ->whereIn('payment_method', self::CASH_LIKE_SALES_METHODS)
            ->orderBy('date')
            ->orderBy('id')
            ->first();

        $paymentMethod = (string) ($firstSale->payment_method ?? 'Cash');
        $createdAt = $firstSale && ! empty($firstSale->created_at)
            ? Carbon::parse($firstSale->created_at)
            : Carbon::parse((string) $billing->date)->startOfDay();

        $branchLabel = $this->branchLabel($branchId);
        $totalFramePrice = (float) $frames->sum(fn ($f) => (float) $f->frame_price);

        $soldBy = $soldByUserId ?? (int) DB::table('users')->orderBy('id')->value('id');
        if ($soldBy <= 0) {
            return;
        }

        foreach ($frames as $frame) {
            $frameBranchId = (int) ($frame->branch_id ?: $branchId);
            $product = DB::table('products')
                ->where('branch_id', $frameBranchId)
                ->where('code', $frame->frame_code_id)
                ->first(['min_price']);

            $minPrice = $product ? round((float) $product->min_price, 2) : 0.0;
            $sellingPrice = round((float) $frame->frame_price, 2);
            $surplus = round(max(0.0, $sellingPrice - $minPrice), 2);

            $cashAmount = $totalFramePrice > 0
                ? round(min($sellingPrice, $cashPaid * ($sellingPrice / $totalFramePrice)), 2)
                : 0.0;

            // margin, staff_share, reinvestment_share, tax_share, operational_share are GENERATED STORED columns in MySQL.
            DB::table('bsmi_transactions')->insert([
                'billing_id' => $billingId,
                'frame_code' => $frame->frame_code_id,
                'min_price' => $minPrice,
                'selling_price' => $sellingPrice,
                'sold_by' => $soldBy,
                'branch' => $branchLabel,
                'created_at' => $createdAt,
                'amount_allocated' => $surplus,
                'lens_paid' => 0,
                'frame_min_paid' => $minPrice,
                'surplus_for_bsmi' => $surplus,
                'payment_method' => $paymentMethod,
                'insurance_amount' => 0,
                'insurance_status' => 'none',
                'cash_amount' => $cashAmount,
                'branch_id' => $branchId,
            ]);
        }
    }

    public function syncAllBillings(): void
    {
        if (! Schema::hasTable('bsmi_transactions') || ! Schema::hasTable('billing_frames')) {
            return;
        }

        $billingIds = DB::table('billing_frames')
            ->distinct()
            ->pluck('billing_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        foreach ($billingIds as $billingId) {
            $this->syncForBilling($billingId);
        }
    }

    private function branchLabel(int $branchId): string
    {
        return match ($branchId) {
            0 => 'Merged Branches',
            1 => 'Labadi',
            2 => 'Madina',
            default => 'Branch '.$branchId,
        };
    }
}
