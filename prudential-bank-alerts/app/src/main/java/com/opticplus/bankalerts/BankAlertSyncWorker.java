package com.opticplus.bankalerts;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

public final class BankAlertSyncWorker extends Worker {
    private static final int TIMEOUT_MILLIS = 10000;
    private final Context appContext;

    public BankAlertSyncWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
        appContext = context.getApplicationContext();
    }

    @NonNull
    @Override
    public Result doWork() {
        String serverUrl;
        String deviceToken;
        try {
            serverUrl = SecureSettings.serverUrl(appContext);
            deviceToken = SecureSettings.deviceToken(appContext);
        } catch (Exception exception) {
            SecureSettings.saveLastSyncStatus(appContext, "Could not read encrypted connection settings. Re-enter the API URL and pairing token.");
            return Result.failure();
        }

        if (serverUrl.isEmpty() || deviceToken.isEmpty()) {
            SecureSettings.saveLastSyncStatus(appContext, "Connection not configured. Alerts remain saved on this phone.");
            return Result.failure();
        }

        if (!serverUrl.startsWith("https://") || !deviceToken.startsWith("opba_")) {
            SecureSettings.saveLastSyncStatus(appContext, "Secure sync requires an HTTPS API URL and a valid device pairing token.");
            return Result.failure();
        }

        AlertDatabase database = new AlertDatabase(appContext);
        try {
            List<BankAlert> pending = database.unsyncedAlerts();
            if (pending.isEmpty()) {
                SecureSettings.saveLastSyncStatus(appContext, "No unsynced Prudential alerts.");
                return Result.success();
            }

            for (BankAlert alert : pending) {
                SyncResponse response = send(serverUrl, deviceToken, alert);
                if (response.statusCode == 401 || response.statusCode == 403) {
                    SecureSettings.saveLastSyncStatus(appContext, "Server rejected the device token. Generate a new pairing token in Bank Deposits.");
                    return Result.failure();
                }
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    SecureSettings.saveLastSyncStatus(appContext, "Server could not accept the alert (HTTP " + response.statusCode + "). It will retry.");
                    return response.statusCode == 429 || response.statusCode >= 500
                            ? Result.retry()
                            : Result.failure();
                }

                database.markSynced(alert.accountSuffix, alert.transactionReference);
            }

            SecureSettings.saveLastSyncStatus(appContext, "All Prudential alerts synced securely.");
            return Result.success();
        } catch (Exception exception) {
            SecureSettings.saveLastSyncStatus(appContext, "Secure sync failed; alerts remain on this phone and will retry when connected.");
            return Result.retry();
        } finally {
            database.close();
        }
    }

    private SyncResponse send(String serverUrl, String deviceToken, BankAlert alert) throws Exception {
        String endpoint = serverUrl.replaceAll("/+$", "") + "/bank-alerts/ingest";
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(TIMEOUT_MILLIS);
        connection.setReadTimeout(TIMEOUT_MILLIS);
        connection.setDoOutput(true);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Authorization", "Bearer " + deviceToken);

        JSONObject payload = new JSONObject();
        payload.put("sender", alert.sender);
        payload.put("account_suffix", alert.accountSuffix);
        payload.put("direction", alert.direction);
        payload.put("amount", alert.amount);
        payload.put("transaction_reference", alert.transactionReference);
        payload.put("transaction_date", alert.transactionDate);
        payload.put("available_balance", alert.availableBalance);
        payload.put("received_at", alert.receivedAt);

        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(body.length);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body);
        }

        int statusCode = connection.getResponseCode();
        InputStream stream = statusCode < 400 ? connection.getInputStream() : connection.getErrorStream();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                while (reader.readLine() != null) {
                    // Drain the response before closing the connection.
                }
            }
        }
        connection.disconnect();
        return new SyncResponse(statusCode);
    }

    private static final class SyncResponse {
        final int statusCode;

        SyncResponse(int statusCode) {
            this.statusCode = statusCode;
        }
    }
}
