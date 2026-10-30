package com.opticplus.bankalerts;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Telephony;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.List;

public final class MainActivity extends Activity {
    static final String ACTION_ALERT_STORED = "com.opticplus.bankalerts.ALERT_STORED";
    private static final int RECEIVE_SMS_PERMISSION_REQUEST = 41;
    private static final int READ_SMS_PERMISSION_REQUEST = 42;
    private AlertDatabase database;
    private LinearLayout alertList;
    private TextView permissionStatus;
    private TextView testStatus;
    private TextView syncStatus;
    private Button smsPermissionButton;
    private Button inboxRefreshPermissionButton;
    private EditText serverUrlInput;
    private EditText deviceTokenInput;
    private boolean alertStoredReceiverRegistered;
    private final BroadcastReceiver alertStoredReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            updateScreen();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        database = new AlertDatabase(this);
        buildScreen();
        updateScreen();
        startAutomaticSyncIfConfigured();
        requestSmsPermissionIfNeeded();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (alertList != null) {
            if (!alertStoredReceiverRegistered) {
                IntentFilter filter = new IntentFilter(ACTION_ALERT_STORED);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    registerReceiver(alertStoredReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
                } else {
                    registerReceiver(alertStoredReceiver, filter);
                }
                alertStoredReceiverRegistered = true;
            }
            updateScreen();
        }
    }

    @Override
    protected void onPause() {
        if (alertStoredReceiverRegistered) {
            unregisterReceiver(alertStoredReceiver);
            alertStoredReceiverRegistered = false;
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (database != null) {
            database.close();
        }
        super.onDestroy();
    }

    private void buildScreen() {
        int horizontalPadding = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(horizontalPadding, dp(28), horizontalPadding, dp(12));
        root.setBackgroundColor(0xFFF4F7FC);

        TextView title = text("OpticPlus Bank Alerts", 26, 0xFF102A56, true);
        root.addView(title);
        TextView subtitle = text("Prudential Bank and MTN MoMo • SMS pilot", 15, 0xFF52647D, false);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.topMargin = dp(6);
        root.addView(subtitle, subtitleParams);

        permissionStatus = text("", 14, 0xFF1769E0, true);
        permissionStatus.setPadding(dp(14), dp(12), dp(14), dp(12));
        permissionStatus.setBackgroundColor(0xFFE8F1FF);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.topMargin = dp(20);
        root.addView(permissionStatus, statusParams);

        smsPermissionButton = new Button(this);
        smsPermissionButton.setText("Enable SMS monitoring");
        smsPermissionButton.setOnClickListener(view -> openSmsPermissionSettings());
        LinearLayout.LayoutParams permissionButtonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        permissionButtonParams.topMargin = dp(8);
        root.addView(smsPermissionButton, permissionButtonParams);

        inboxRefreshPermissionButton = new Button(this);
        inboxRefreshPermissionButton.setText("Enable background inbox refresh");
        inboxRefreshPermissionButton.setOnClickListener(view -> requestInboxRefreshPermission());
        LinearLayout.LayoutParams inboxPermissionButtonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        inboxPermissionButtonParams.topMargin = dp(6);
        root.addView(inboxRefreshPermissionButton, inboxPermissionButtonParams);

        TextView privacyNote = text(
                "Only supported Prudential and MTN MoMo sender IDs and message formats are checked. " +
                        "A manager can request a refresh from OpticPlus; the phone checks for it about every five minutes. " +
                        "Background inbox refresh scans only recent supported sender messages and requires inbox permission. " +
                        "The app stores parsed transaction details only; " +
                        "it does not save the original SMS or change bank balances. Verify alerts against " +
                        "the bank because sender IDs can be spoofed.",
                13,
                0xFF52647D,
                false
        );
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        noteParams.topMargin = dp(16);
        root.addView(privacyNote, noteParams);

        Button testLatestMessage = new Button(this);
        testLatestMessage.setText("Test latest supported bank / MTN SMS");
        testLatestMessage.setOnClickListener(view -> requestLatestMessageTest());
        LinearLayout.LayoutParams testButtonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        testButtonParams.topMargin = dp(14);
        root.addView(testLatestMessage, testButtonParams);

        testStatus = text(
                "One-time test: checks recent messages from supported bank and MTN sender IDs. " +
                        "The SMS text is not saved.",
                13,
                0xFF52647D,
                false
        );
        LinearLayout.LayoutParams testStatusParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        testStatusParams.topMargin = dp(6);
        root.addView(testStatus, testStatusParams);

        TextView syncTitle = text("Secure OpticPlus sync", 19, 0xFF102A56, true);
        LinearLayout.LayoutParams syncTitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        syncTitleParams.topMargin = dp(24);
        root.addView(syncTitle, syncTitleParams);
        root.addView(text(
                "Enter the HTTPS API URL and one-time pairing token generated by a General Manager in Bank Deposits.",
                13,
                0xFF52647D,
                false
        ));

        serverUrlInput = new EditText(this);
        serverUrlInput.setSingleLine(true);
        serverUrlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        serverUrlInput.setHint("https://opticplus.example.com/api/v1");
        addInput(root, serverUrlInput, "OpticPlus API URL");

        deviceTokenInput = new EditText(this);
        deviceTokenInput.setSingleLine(true);
        deviceTokenInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        deviceTokenInput.setHint("One-time pairing token");
        addInput(root, deviceTokenInput, "Device token");

        Button saveConnection = new Button(this);
        saveConnection.setText("Save secure connection");
        saveConnection.setOnClickListener(view -> saveConnection());
        root.addView(saveConnection);

        Button syncNow = new Button(this);
        syncNow.setText("Sync pending alerts now");
        syncNow.setOnClickListener(view -> syncPendingAlerts());
        root.addView(syncNow);

        syncStatus = text(SecureSettings.lastSyncStatus(this), 13, 0xFF52647D, false);
        LinearLayout.LayoutParams syncStatusParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        syncStatusParams.topMargin = dp(6);
        root.addView(syncStatus, syncStatusParams);

        TextView sectionTitle = text("Alerts waiting for review", 19, 0xFF102A56, true);
        LinearLayout.LayoutParams sectionParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        sectionParams.topMargin = dp(26);
        root.addView(sectionTitle, sectionParams);

        alertList = new LinearLayout(this);
        alertList.setOrientation(LinearLayout.VERTICAL);
        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(alertList);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        scrollParams.topMargin = dp(12);
        root.addView(scrollView, scrollParams);
        ScrollView pageScrollView = new ScrollView(this);
        pageScrollView.addView(root);
        setContentView(pageScrollView);
        loadServerUrl();
    }

    private void updateScreen() {
        boolean granted = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
        permissionStatus.setText(granted
                ? "SMS monitoring is enabled for Prudential and MTN MoMo alerts."
                : "Allow SMS access to receive bank and MTN MoMo alerts.");
        if (smsPermissionButton != null) {
            smsPermissionButton.setText(granted ? "SMS permission settings" : "Enable SMS monitoring");
        }
        if (inboxRefreshPermissionButton != null) {
            inboxRefreshPermissionButton.setText(checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
                    ? "SMS inbox refresh permission settings"
                    : "Enable background inbox refresh");
        }
        if (syncStatus != null) {
            syncStatus.setText(SecureSettings.lastSyncStatus(this));
        }
        alertList.removeAllViews();

        List<BankAlert> alerts = database.latestAlerts();
        if (alerts.isEmpty()) {
            TextView empty = text("No matching alerts received on this phone yet.", 14, 0xFF52647D, false);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(12), dp(28), dp(12), dp(28));
            alertList.addView(empty);
            return;
        }

        for (BankAlert alert : alerts) {
            addAlertCard(alert);
        }
    }

    private void addAlertCard(BankAlert alert) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setBackgroundColor(0xFFFFFFFF);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        cardParams.bottomMargin = dp(10);
        card.setElevation(dp(2));

        String movement = alert.direction.equals("credited") ? "Credit" : "Debit";
        card.addView(text(movement + " • GHS " + alert.amount, 17, 0xFF102A56, true));
        card.addView(text(
                ("MTN_MOMO".equals(alert.sender) ? "MTN MoMo wallet" : "Account ending " + alert.accountSuffix)
                        + "  •  " + alert.transactionDate,
                13,
                0xFF52647D,
                false
        ));
        card.addView(text(
                "Available balance: GHS " + alert.availableBalance,
                14,
                0xFF1769E0,
                true
        ));
        card.addView(text(
                "Reference: " + alert.transactionReference,
                12,
                0xFF52647D,
                false
        ));
        alertList.addView(card, cardParams);
    }

    private void requestSmsPermissionIfNeeded() {
        if (checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[] { Manifest.permission.RECEIVE_SMS },
                    RECEIVE_SMS_PERMISSION_REQUEST
            );
        }
    }

    private void openSmsPermissionSettings() {
        if (checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED
                && shouldShowRequestPermissionRationale(Manifest.permission.RECEIVE_SMS)) {
            requestPermissions(
                    new String[] { Manifest.permission.RECEIVE_SMS },
                    RECEIVE_SMS_PERMISSION_REQUEST
            );
            return;
        }

        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getPackageName(), null));
        startActivity(intent);
    }

    private void requestInboxRefreshPermission() {
        if (checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[] { Manifest.permission.READ_SMS },
                    READ_SMS_PERMISSION_REQUEST
            );
            return;
        }

        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getPackageName(), null));
        startActivity(intent);
    }

    private void requestLatestMessageTest() {
        if (checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED) {
            readLatestSupportedMessage();
            return;
        }
        requestPermissions(new String[] { Manifest.permission.READ_SMS }, READ_SMS_PERMISSION_REQUEST);
    }

    private void readLatestSupportedMessage() {
        Uri inboxUri = Telephony.Sms.Inbox.CONTENT_URI;
        String[] projection = {
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
        };

        try (Cursor cursor = getContentResolver().query(
                inboxUri,
                projection,
                "(" + Telephony.Sms.ADDRESS + " COLLATE NOCASE = ? OR "
                        + Telephony.Sms.ADDRESS + " COLLATE NOCASE = ? OR "
                        + Telephony.Sms.ADDRESS + " COLLATE NOCASE = ? OR "
                        + Telephony.Sms.ADDRESS + " LIKE ? COLLATE NOCASE)",
                new String[] { "PRUDENTIAL", "170", "MobileMoney", "MTN%" },
                Telephony.Sms.DATE + " DESC LIMIT 20"
        )) {
            if (cursor == null || !cursor.moveToFirst()) {
                testStatus.setText("No recent inbox messages from supported bank or MTN sender IDs were found.");
                return;
            }
            BankAlert alert = null;
            do {
                alert = BankSmsParser.parse(cursor.getString(0), cursor.getString(1), cursor.getLong(2));
            } while (alert == null && cursor.moveToNext());
            if (alert == null) {
                testStatus.setText("No recent supported bank or MTN message matched. SMS text was not saved.");
                return;
            }

            boolean added = database.insertIfNew(alert);
            updateScreen();
            if (added) {
                BankAlertSync.enqueue(this);
            }
            testStatus.setText(added
                    ? "Latest supported alert parsed and added to the local review list. SMS text was not saved."
                    : "Latest supported alert was already on the local review list.");
        } catch (SecurityException exception) {
            testStatus.setText(
                    "Android did not allow inbox access. Grant SMS reading permission in app settings, then try again."
            );
        }
    }

    private void addInput(LinearLayout root, EditText input, String contentDescription) {
        input.setContentDescription(contentDescription);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = dp(8);
        root.addView(input, params);
    }

    private void loadServerUrl() {
        try {
            String serverUrl = SecureSettings.serverUrl(this);
            if (!serverUrl.isEmpty()) {
                serverUrlInput.setText(serverUrl);
            }
            deviceTokenInput.setHint(SecureSettings.deviceToken(this).isEmpty()
                    ? "One-time pairing token"
                    : "Token saved securely; enter again to replace");
        } catch (Exception exception) {
            syncStatus.setText("Could not read encrypted settings. Enter the API URL and pairing token again.");
        }
    }

    private void startAutomaticSyncIfConfigured() {
        try {
            if (!SecureSettings.serverUrl(this).isEmpty() && !SecureSettings.deviceToken(this).isEmpty()) {
                BankAlertSync.schedulePeriodic(this);
                BankAlertSync.ensureRefreshPollScheduled(this);
                BankAlertSync.enqueue(this);
            }
        } catch (Exception exception) {
            syncStatus.setText("Could not read encrypted sync settings. Re-enter the API URL and pairing token.");
        }
    }

    private void saveConnection() {
        String serverUrl = serverUrlInput.getText().toString().trim();
        String deviceToken = deviceTokenInput.getText().toString().trim();
        android.net.Uri parsedUrl = android.net.Uri.parse(serverUrl);
        if (!"https".equalsIgnoreCase(parsedUrl.getScheme()) || parsedUrl.getHost() == null
                || !serverUrl.endsWith("/api/v1")) {
            syncStatus.setText("Enter the secure HTTPS API base URL ending in /api/v1.");
            return;
        }
        if (!deviceToken.startsWith("opba_") || deviceToken.length() < 60) {
            syncStatus.setText("Enter the one-time device pairing token from Bank Deposits.");
            return;
        }

        try {
            SecureSettings.save(this, serverUrl, deviceToken);
            deviceTokenInput.setText("");
            deviceTokenInput.setHint("Token saved securely; enter again to replace");
            syncStatus.setText("Connection saved in Android Keystore. Starting alert sync.");
            BankAlertSync.schedulePeriodic(this);
            BankAlertSync.ensureRefreshPollScheduled(this);
            BankAlertSync.enqueue(this);
        } catch (Exception exception) {
            syncStatus.setText("Could not securely save the connection settings. Please try again.");
        }
    }

    private void syncPendingAlerts() {
        try {
            if (SecureSettings.serverUrl(this).isEmpty() || SecureSettings.deviceToken(this).isEmpty()) {
                syncStatus.setText("Save the HTTPS API URL and pairing token before syncing.");
                return;
            }
            syncStatus.setText("Sync queued. The phone will send pending alerts over HTTPS.");
            BankAlertSync.enqueue(this);
        } catch (Exception exception) {
            syncStatus.setText("Could not read encrypted connection settings. Save the connection again.");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == RECEIVE_SMS_PERMISSION_REQUEST) {
            updateScreen();
        } else if (requestCode == READ_SMS_PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                readLatestSupportedMessage();
            } else {
                testStatus.setText(
                        "SMS inbox permission was denied. Allow it with Enable background inbox refresh, then run this check again."
                );
            }
        }
    }

    private TextView text(String value, int sizeSp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        if (bold) {
            view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        }
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
