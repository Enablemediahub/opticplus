package com.opticplus.bankalerts;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.ExistingPeriodicWorkPolicy;

import java.util.concurrent.TimeUnit;

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

    static void schedulePeriodic(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                BankAlertSyncWorker.class,
                15,
                TimeUnit.MINUTES
        ).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "prudential-bank-alert-periodic-sync",
                ExistingPeriodicWorkPolicy.KEEP,
                request
        );
    }

    static void ensureRefreshPollScheduled(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BankAlertSyncWorker.class)
                .setConstraints(constraints)
                .setInitialDelay(5, TimeUnit.MINUTES)
                .setInputData(new Data.Builder().putBoolean("remote_refresh_poll", true).build())
                .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
                "prudential-bank-alert-refresh-poll",
                ExistingWorkPolicy.KEEP,
                request
        );
    }

    static void scheduleNextRefreshPoll(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BankAlertSyncWorker.class)
                .setConstraints(constraints)
                .setInitialDelay(5, TimeUnit.MINUTES)
                .setInputData(new Data.Builder().putBoolean("remote_refresh_poll", true).build())
                .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
                "prudential-bank-alert-refresh-poll",
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                request
        );
    }
}
