package com.opticplus.bankalerts;

import android.content.Context;
import android.database.Cursor;
import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Telephony;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;
import org.json.JSONException;

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
        boolean isRefreshPoll = getInputData().getBoolean("remote_refresh_poll", false);
        if (isRefreshPoll) {
            BankAlertSync.scheduleNextRefreshPoll(appContext);
        }

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
            Long completedRefreshVersion = null;
            boolean refreshWaitingForPermission = false;
            int importedCount = 0;
            if (isRefreshPoll) {
                ApiResponse refresh = checkRefreshRequest(serverUrl, deviceToken);
                if (refresh.statusCode < 200 || refresh.statusCode >= 300) {
                    SecureSettings.saveLastSyncStatus(appContext, "Could not check the OpticPlus refresh request (HTTP " + refresh.statusCode + "). It will check again in about five minutes.");
                    return refresh.statusCode == 429 || refresh.statusCode >= 500 ? Result.retry() : Result.success();
                }
                JSONObject request = new JSONObject(refresh.body);
                if (request.optBoolean("requested", false)) {
                    long version = request.optLong("version", 0);
                    if (appContext.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
                        refreshWaitingForPermission = true;
                    } else {
                        importedCount = importRecentSupportedMessages(database);
                        completedRefreshVersion = version > 0 ? version : null;
                    }
                }
            }

            List<BankAlert> pending = database.unsyncedAlerts();
            for (BankAlert alert : pending) {
                SyncResponse response = send(serverUrl, deviceToken, alert);
                if (response.statusCode == 401 || response.statusCode == 403) {
                    SecureSettings.saveLastSyncStatus(appContext, "Server rejected the device token. The alert remains saved; replace the token in Bank Deposits and background sync will retry.");
                    return Result.failure();
                }
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    SecureSettings.saveLastSyncStatus(appContext, "Server could not accept the alert (HTTP " + response.statusCode + "). It remains saved for background retry.");
                    return response.statusCode == 429 || response.statusCode >= 500
                            ? Result.retry()
                            : Result.failure();
                }

                database.markSynced(alert.sender, alert.accountSuffix, alert.transactionReference);
            }

            if (completedRefreshVersion != null) {
                ApiResponse completion = completeRefreshRequest(serverUrl, deviceToken, completedRefreshVersion);
                if (completion.statusCode < 200 || completion.statusCode >= 300) {
                    SecureSettings.saveLastSyncStatus(appContext, "SMS inbox was checked, but OpticPlus could not confirm the refresh (HTTP " + completion.statusCode + "). It will check again.");
                    return completion.statusCode == 429 || completion.statusCode >= 500 ? Result.retry() : Result.success();
                }
            }

            if (refreshWaitingForPermission) {
                SecureSettings.saveLastSyncStatus(appContext, "OpticPlus requested an inbox refresh. Grant SMS inbox access in the app to complete it.");
            } else if (completedRefreshVersion != null) {
                SecureSettings.saveLastSyncStatus(appContext, "OpticPlus refresh completed. Imported " + importedCount + " new supported SMS alert(s); synced " + pending.size() + " alert(s).");
            } else if (pending.isEmpty()) {
                SecureSettings.saveLastSyncStatus(appContext, "No unsynced bank or MTN MoMo alerts.");
            } else {
                SecureSettings.saveLastSyncStatus(appContext, "All supported bank and MTN MoMo alerts synced securely.");
            }
            return Result.success();
        } catch (JSONException exception) {
            SecureSettings.saveLastSyncStatus(appContext, "OpticPlus returned an unreadable refresh response. The phone will check again.");
            return Result.retry();
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

    private ApiResponse checkRefreshRequest(String serverUrl, String deviceToken) throws Exception {
        return callApi("GET", serverUrl.replaceAll("/+$", "") + "/bank-alerts/device-sync-request", deviceToken, null);
    }

    private ApiResponse completeRefreshRequest(String serverUrl, String deviceToken, long version) throws Exception {
        JSONObject body = new JSONObject();
        body.put("version", version);
        return callApi(
                "POST",
                serverUrl.replaceAll("/+$", "") + "/bank-alerts/device-sync-request/complete",
                deviceToken,
                body
        );
    }

    private ApiResponse callApi(String method, String endpoint, String deviceToken, JSONObject payload) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(TIMEOUT_MILLIS);
        connection.setReadTimeout(TIMEOUT_MILLIS);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + deviceToken);
        if (payload != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
        }

        int statusCode = connection.getResponseCode();
        InputStream stream = statusCode < 400 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder responseBody = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    responseBody.append(line);
                }
            }
        }
        connection.disconnect();
        return new ApiResponse(statusCode, responseBody.toString());
    }

    private int importRecentSupportedMessages(AlertDatabase database) {
        Uri inboxUri = Telephony.Sms.Inbox.CONTENT_URI;
        String[] projection = { Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE };
        String selection = "(" + Telephony.Sms.ADDRESS + " = ? OR "
                + Telephony.Sms.ADDRESS + " = ? OR "
                + Telephony.Sms.ADDRESS + " = ? OR "
                + Telephony.Sms.ADDRESS + " LIKE ? COLLATE NOCASE)";
        String[] selectionArgs = { "PRUDENTIAL", "170", "MobileMoney", "MTN%" };
        int imported = 0;
        try (Cursor cursor = appContext.getContentResolver().query(
                inboxUri,
                projection,
                selection,
                selectionArgs,
                Telephony.Sms.DATE + " DESC LIMIT 50"
        )) {
            if (cursor == null) return 0;
            while (cursor.moveToNext()) {
                BankAlert alert = BankSmsParser.parse(cursor.getString(0), cursor.getString(1), cursor.getLong(2));
                if (alert != null && database.insertIfNew(alert)) imported++;
            }
        }
        return imported;
    }

    private static final class SyncResponse {
        final int statusCode;

        SyncResponse(int statusCode) {
            this.statusCode = statusCode;
        }
    }

    private static final class ApiResponse {
        final int statusCode;
        final String body;

        ApiResponse(int statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body;
        }
    }
}
