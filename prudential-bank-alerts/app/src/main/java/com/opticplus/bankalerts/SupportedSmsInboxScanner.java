package com.opticplus.bankalerts;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;

final class SupportedSmsInboxScanner {
    private static final int MAX_MESSAGES = 20;

    private SupportedSmsInboxScanner() {}

    static ScanResult scan(Context context, AlertDatabase database) {
        Uri inboxUri = Telephony.Sms.Inbox.CONTENT_URI;
        String[] projection = {
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
        };
        String selection = "(UPPER(TRIM(" + Telephony.Sms.ADDRESS + ")) = ? OR "
                + "UPPER(TRIM(" + Telephony.Sms.ADDRESS + ")) = ? OR "
                + "UPPER(TRIM(" + Telephony.Sms.ADDRESS + ")) = ? OR "
                + "UPPER(TRIM(" + Telephony.Sms.ADDRESS + ")) = ? OR "
                + Telephony.Sms.ADDRESS + " LIKE ? COLLATE NOCASE)";
        String[] selectionArgs = { "PRUDENTIAL", "GTBANK", "170", "MOBILEMONEY", "MTN%" };
        int examined = 0;
        int parsed = 0;
        int imported = 0;

        try (Cursor cursor = context.getContentResolver().query(
                inboxUri,
                projection,
                selection,
                selectionArgs,
                Telephony.Sms.DATE + " DESC LIMIT " + MAX_MESSAGES
        )) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    examined++;
                    BankAlert alert = BankSmsParser.parse(
                            cursor.getString(0),
                            cursor.getString(1),
                            cursor.getLong(2)
                    );
                    if (alert != null) {
                        parsed++;
                        if (database.insertIfNew(alert)) {
                            imported++;
                        }
                    }
                }
            }
        }

        return new ScanResult(examined, parsed, imported);
    }

    static final class ScanResult {
        final int examinedCount;
        final int parsedCount;
        final int importedCount;

        ScanResult(int examinedCount, int parsedCount, int importedCount) {
            this.examinedCount = examinedCount;
            this.parsedCount = parsedCount;
            this.importedCount = importedCount;
        }
    }
}
