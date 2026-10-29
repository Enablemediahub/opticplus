package com.opticplus.bankalerts;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

final class AlertDatabase extends SQLiteOpenHelper {
    private static final String DATABASE_NAME = "bank_alerts.db";
    private static final int DATABASE_VERSION = 2;

    AlertDatabase(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase database) {
        database.execSQL(
                "CREATE TABLE alerts (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                        "sender TEXT NOT NULL, " +
                        "direction TEXT NOT NULL, " +
                        "amount TEXT NOT NULL, " +
                        "account_suffix TEXT NOT NULL, " +
                        "transaction_reference TEXT NOT NULL, " +
                        "transaction_date TEXT NOT NULL, " +
                        "available_balance TEXT NOT NULL, " +
                        "received_at INTEGER NOT NULL, " +
                        "synced INTEGER NOT NULL DEFAULT 0, " +
                        "UNIQUE(sender, account_suffix, transaction_reference))"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            database.execSQL("ALTER TABLE alerts ADD COLUMN synced INTEGER NOT NULL DEFAULT 0");
        }
    }

    boolean insertIfNew(BankAlert alert) {
        ContentValues values = new ContentValues();
        values.put("sender", alert.sender);
        values.put("direction", alert.direction);
        values.put("amount", alert.amount);
        values.put("account_suffix", alert.accountSuffix);
        values.put("transaction_reference", alert.transactionReference);
        values.put("transaction_date", alert.transactionDate);
        values.put("available_balance", alert.availableBalance);
        values.put("received_at", alert.receivedAt);

        long rowId = getWritableDatabase().insertWithOnConflict(
                "alerts",
                null,
                values,
                SQLiteDatabase.CONFLICT_IGNORE
        );
        return rowId != -1;
    }

    List<BankAlert> latestAlerts() {
        List<BankAlert> alerts = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query(
                "alerts",
                new String[] {
                        "sender", "direction", "amount", "account_suffix",
                        "transaction_reference", "transaction_date",
                        "available_balance", "received_at"
                },
                null,
                null,
                null,
                null,
                "received_at DESC",
                "100"
        )) {
            while (cursor.moveToNext()) {
                alerts.add(new BankAlert(
                        cursor.getString(0),
                        cursor.getString(1),
                        cursor.getString(2),
                        cursor.getString(3),
                        cursor.getString(4),
                        cursor.getString(5),
                        cursor.getString(6),
                        cursor.getLong(7)
                ));
            }
        }
        return alerts;
    }

    List<BankAlert> unsyncedAlerts() {
        List<BankAlert> alerts = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query(
                        "alerts",
                        new String[] {
                                "sender", "direction", "amount", "account_suffix",
                                "transaction_reference", "transaction_date",
                                "available_balance", "received_at"
                        },
                        "synced = 0",
                        null,
                        null,
                        null,
                        "received_at ASC"
        )) {
            while (cursor.moveToNext()) {
                alerts.add(new BankAlert(
                                cursor.getString(0),
                                cursor.getString(1),
                                cursor.getString(2),
                                cursor.getString(3),
                                cursor.getString(4),
                                cursor.getString(5),
                                cursor.getString(6),
                                cursor.getLong(7)
                ));
            }
        }
        return alerts;
    }

    void markSynced(String sender, String accountSuffix, String transactionReference) {
        ContentValues values = new ContentValues();
        values.put("synced", 1);
        getWritableDatabase().update(
                        "alerts",
                        values,
                        "sender = ? AND account_suffix = ? AND transaction_reference = ?",
                        new String[] { sender, accountSuffix, transactionReference }
        );
    }
}
