package com.opticplus.bankalerts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

final class PrudentialSmsReceiver extends BroadcastReceiver {
    private static final String TAG = "BankAlertSmsReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) {
            return;
        }

        String sender = messages[0].getOriginatingAddress();
        if (sender == null) {
            return;
        }

        StringBuilder body = new StringBuilder();
        for (SmsMessage message : messages) {
            body.append(message.getMessageBody());
        }

        BankAlert alert = BankSmsParser.parse(sender, body.toString(), System.currentTimeMillis());
        if (alert == null) {
            return;
        }

        Context appContext = context.getApplicationContext();
        PendingResult pendingResult = goAsync();
        Thread syncQueueThread = new Thread(() -> {
            try {
                AlertDatabase database = new AlertDatabase(appContext);
                boolean inserted;
                try {
                    inserted = database.insertIfNew(alert);
                } finally {
                    database.close();
                }

                if (inserted) {
                    appContext.sendBroadcast(new Intent(MainActivity.ACTION_ALERT_STORED)
                            .setPackage(appContext.getPackageName()));
                }
                BankAlertSync.ensureBackgroundWorkScheduled(appContext);
                BankAlertSync.enqueue(appContext).getResult().get(10, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                Log.e(TAG, "Interrupted while queueing a bank alert for background sync.", exception);
            } catch (ExecutionException | TimeoutException | RuntimeException exception) {
                Log.e(TAG, "Could not queue a bank alert for background sync.", exception);
            } finally {
                pendingResult.finish();
            }
        }, "bank-alert-sms-sync-queue");
        syncQueueThread.start();
    }
}
