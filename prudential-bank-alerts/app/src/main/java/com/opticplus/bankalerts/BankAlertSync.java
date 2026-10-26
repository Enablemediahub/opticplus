package com.opticplus.bankalerts;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

final class BankAlertSync {
    private BankAlertSync() {}

    static void enqueue(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BankAlertSyncWorker.class)
                .setConstraints(constraints)
                .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
                "prudential-bank-alert-sync",
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                request
        );
    }
}
