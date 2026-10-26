package com.opticplus.bankalerts;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Telephony;
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
    private static final int RECEIVE_SMS_PERMISSION_REQUEST = 41;
    private static final int READ_SMS_PERMISSION_REQUEST = 42;
    private AlertDatabase database;
    private LinearLayout alertList;
    private TextView permissionStatus;
    private TextView testStatus;
    private TextView syncStatus;
    private EditText serverUrlInput;
    private EditText deviceTokenInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        database = new AlertDatabase(this);
        buildScreen();
        updateScreen();
        requestSmsPermissionIfNeeded();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (alertList != null) {
            updateScreen();
        }
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
        TextView subtitle = text("Prudential Bank • SMS pilot", 15, 0xFF52647D, false);
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

        TextView privacyNote = text(
                "Only messages from the exact sender ID PRUDENTIAL are checked. " +
                        "The app stores parsed transaction details and the last four account digits only; " +
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
        testLatestMessage.setText("Test latest PRUDENTIAL SMS");
        testLatestMessage.setOnClickListener(view -> requestLatestMessageTest());
        LinearLayout.LayoutParams testButtonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        testButtonParams.topMargin = dp(14);
        root.addView(testLatestMessage, testButtonParams);

        testStatus = text(
                "One-time test: reads only the newest inbox message from PRUDENTIAL. " +
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
                ? "SMS monitoring is enabled for PRUDENTIAL alerts."
                : "Allow SMS access to receive Prudential bank alerts.");
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
                "Account ending " + alert.accountSuffix + "  •  " + alert.transactionDate,
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

    private void requestLatestMessageTest() {
        if (checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED) {
            readLatestPrudentialMessage();
            return;
        }
        requestPermissions(new String[] { Manifest.permission.READ_SMS }, READ_SMS_PERMISSION_REQUEST);
    }

    private void readLatestPrudentialMessage() {
        Uri inboxUri = Telephony.Sms.Inbox.CONTENT_URI;
        String[] projection = {
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
        };

        try (Cursor cursor = getContentResolver().query(
                inboxUri,
                projection,
                Telephony.Sms.ADDRESS + " = ?",
                new String[] { "PRUDENTIAL" },
                Telephony.Sms.DATE + " DESC LIMIT 1"
        )) {
            if (cursor == null || !cursor.moveToFirst()) {
                testStatus.setText("No inbox message from PRUDENTIAL was found.");
                return;
            }

            String sender = cursor.getString(0);
            String body = cursor.getString(1);
            long receivedAt = cursor.getLong(2);
            BankAlert alert = BankSmsParser.parse(sender, body, receivedAt);
            if (alert == null) {
                testStatus.setText(
                        "The newest PRUDENTIAL message did not match the supported alert format. " +
                                "No SMS text was saved."
                );
                return;
            }

            boolean added = database.insertIfNew(alert);
            updateScreen();
            if (added) {
                BankAlertSync.enqueue(this);
            }
            testStatus.setText(added
                    ? "Latest PRUDENTIAL alert parsed and added to the local review list. SMS text was not saved."
                    : "Latest PRUDENTIAL alert was already on the local review list.");
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
                readLatestPrudentialMessage();
            } else {
                testStatus.setText(
                        "SMS reading permission was not granted. Background monitoring remains separate."
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
