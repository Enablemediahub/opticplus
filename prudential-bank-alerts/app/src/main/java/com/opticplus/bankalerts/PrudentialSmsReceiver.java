package com.opticplus.bankalerts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

final class PrudentialSmsReceiver extends BroadcastReceiver {
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

        AlertDatabase database = new AlertDatabase(context);
        boolean inserted = false;
        try {
            inserted = database.insertIfNew(alert);
        } finally {
            database.close();
        }
        if (inserted) {
            context.sendBroadcast(new Intent(MainActivity.ACTION_ALERT_STORED)
                    .setPackage(context.getPackageName()));
            BankAlertSync.enqueue(context);
        }
    }
}
