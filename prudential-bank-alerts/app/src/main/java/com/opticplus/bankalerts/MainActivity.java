package com.opticplus.bankalerts;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.lifecycle.Observer;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
    private Button syncNowButton;
    private EditText serverUrlInput;
    private EditText deviceTokenInput;
    private final Map<String, Boolean> expandedAlertGroups = new HashMap<>();
    private Observer<List<WorkInfo>> syncWorkObserver;
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
        if (syncWorkObserver != null) {
            WorkManager.getInstance(this)
                    .getWorkInfosForUniqueWorkLiveData("prudential-bank-alert-sync")
                    .removeObserver(syncWorkObserver);
        }
        if (database != null) {
            database.close();
        }
        super.onDestroy();
    }

    private void buildScreen() {
        int horizontalPadding = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(horizontalPadding, dp(20), horizontalPadding, dp(24));
        root.setBackgroundColor(0xFFF3F6FB);

        LinearLayout brandHeader = new LinearLayout(this);
        brandHeader.setGravity(Gravity.CENTER_VERTICAL);
        brandHeader.setPadding(dp(18), dp(18), dp(18), dp(18));
        brandHeader.setBackground(rounded(0xFFFFFFFF, 24, 0xFFE3EAF5));
        brandHeader.setElevation(dp(3));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.opticplus_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(76), dp(76));
        logoParams.rightMargin = dp(16);
        brandHeader.addView(logo, logoParams);
        LinearLayout brandText = new LinearLayout(this);
        brandText.setOrientation(LinearLayout.VERTICAL);
        brandText.addView(text("OPTICPLUS", 13, 0xFF1689E8, true));
        TextView title = text("Bank alerts", 25, 0xFF102A56, true);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(2);
        brandText.addView(title, titleParams);
        brandText.addView(text("Secure SMS sync", 13, 0xFF63728A, false));
        brandHeader.addView(brandText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(brandHeader);
        TextView subtitle = text("Prudential  •  GTBank  •  MTN MoMo", 14, 0xFF63728A, false);
        subtitle.setPadding(dp(4), dp(14), dp(4), 0);
        root.addView(subtitle);

        permissionStatus = text("", 14, 0xFF1769E0, true);
        permissionStatus.setPadding(dp(14), dp(12), dp(14), dp(12));
        permissionStatus.setBackground(rounded(0xFFE7F1FF, 16, 0xFFD5E6FC));
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.topMargin = dp(20);
        root.addView(permissionStatus, statusParams);

        smsPermissionButton = button("Enable SMS monitoring", false);
        smsPermissionButton.setText("Enable SMS monitoring");
        smsPermissionButton.setOnClickListener(view -> openSmsPermissionSettings());
        LinearLayout.LayoutParams permissionButtonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        permissionButtonParams.topMargin = dp(8);
        root.addView(smsPermissionButton, permissionButtonParams);

        inboxRefreshPermissionButton = button("Enable background inbox refresh", false);
        inboxRefreshPermissionButton.setText("Enable background inbox refresh");
        inboxRefreshPermissionButton.setOnClickListener(view -> requestInboxRefreshPermission());
        LinearLayout.LayoutParams inboxPermissionButtonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        inboxPermissionButtonParams.topMargin = dp(6);
        root.addView(inboxRefreshPermissionButton, inboxPermissionButtonParams);

        TextView privacyNote = text(
                "Only supported Prudential, GTBank, and MTN MoMo sender IDs and message formats are checked. " +
                        "Grant background inbox refresh permission to automatically scan recent supported sender messages about every five minutes. " +
                        "Without inbox permission, only newly received SMS messages are monitored. " +
                        "Alerts sync after you close the screen, but Android may delay background work; Force stop prevents syncing until you open the app again. " +
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

        Button testLatestMessage = button("Check recent SMS inbox", false);
        testLatestMessage.setText("Test latest supported bank / MTN SMS");
        testLatestMessage.setOnClickListener(view -> requestLatestMessageTest());
        LinearLayout.LayoutParams testButtonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        testButtonParams.topMargin = dp(14);
        root.addView(testLatestMessage, testButtonParams);

        testStatus = text(
                "Manual check of recent supported bank and MTN messages. The same scan runs automatically during background sync when inbox access is granted. SMS text is not saved.",
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

        Button saveConnection = button("Save secure connection", false);
        saveConnection.setText("Save secure connection");
        saveConnection.setOnClickListener(view -> saveConnection());
        root.addView(saveConnection);

        syncNowButton = button("End-of-day sync", true);
        syncNowButton.setOnClickListener(view -> syncPendingAlerts());
        LinearLayout.LayoutParams syncButtonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        syncButtonParams.topMargin = dp(8);
        root.addView(syncNowButton, syncButtonParams);

        syncStatus = text(SecureSettings.lastSyncStatus(this), 13, 0xFF52647D, false);
        LinearLayout.LayoutParams syncStatusParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        syncStatusParams.topMargin = dp(6);
        syncStatus.setPadding(dp(4), dp(8), dp(4), dp(8));
        root.addView(syncStatus, syncStatusParams);

        TextView sectionTitle = text("Your recent alerts", 20, 0xFF102A56, true);
        LinearLayout.LayoutParams sectionParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        sectionParams.topMargin = dp(26);
        root.addView(sectionTitle, sectionParams);

        alertList = new LinearLayout(this);
        alertList.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams alertListParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        alertListParams.topMargin = dp(12);
        root.addView(alertList, alertListParams);
        TextView reviewNote = text(
                "The General Manager controls approval. This app securely sends alerts to OpticPlus; automatic approval, if enabled, is a branch policy.",
                12,
                0xFF63728A,
                false
        );
        reviewNote.setPadding(dp(4), dp(4), dp(4), dp(12));
        root.addView(reviewNote);
        ScrollView pageScrollView = new ScrollView(this);
        pageScrollView.addView(root);
        setContentView(pageScrollView);
        syncWorkObserver = workInfos -> {
                    if (workInfos == null || workInfos.isEmpty()) {
                        return;
                    }
                    boolean running = false;
                    for (WorkInfo workInfo : workInfos) {
                        if (workInfo.getState() == WorkInfo.State.RUNNING || workInfo.getState() == WorkInfo.State.ENQUEUED) {
                            running = true;
                            break;
                        }
                    }
                    if (running) {
                        syncStatus.setText("End-of-day sync is running. Pending alerts will remain on this phone until accepted by OpticPlus.");
                    } else {
                        updateScreen();
                    }
                };
        WorkManager.getInstance(this)
                .getWorkInfosForUniqueWorkLiveData("prudential-bank-alert-sync")
                .observeForever(syncWorkObserver);
        loadServerUrl();
    }

    private void updateScreen() {
        boolean granted = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
        permissionStatus.setText(granted
                ? "SMS monitoring is enabled for Prudential, GTBank, and MTN MoMo alerts."
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
        List<BankAlert> alerts = database.latestAlerts();
        if (syncNowButton != null) {
            syncNowButton.setText("End-of-day sync  ·  " + database.unsyncedAlerts().size() + " pending");
        }
        renderAlertGroups(alerts);
    }

    private void renderAlertGroups(List<BankAlert> alerts) {
        alertList.removeAllViews();
        addAlertGroup("momo", "MTN MoMo", alerts, "MTN_MOMO", false);
        addAlertGroup("gtbank", "GTBank", alerts, "GTBANK", false);
        addAlertGroup("prudential", "Prudential Bank", alerts, "PRUDENTIAL", false);
        addAlertGroup("ecobank", "Ecobank", alerts, "ECOBANK", true);
    }

    private void addAlertGroup(String key, String title, List<BankAlert> alerts, String sender, boolean comingLater) {
        List<BankAlert> groupAlerts = new ArrayList<>();
        for (BankAlert alert : alerts) {
            if (sender.equals(alert.sender)) {
                groupAlerts.add(alert);
            }
        }

        LinearLayout group = new LinearLayout(this);
        group.setOrientation(LinearLayout.VERTICAL);
        group.setPadding(dp(12), dp(6), dp(12), dp(10));
        group.setBackground(rounded(0xFFFFFFFF, 18, 0xFFE4EAF2));
        group.setElevation(dp(1));
        LinearLayout.LayoutParams groupParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        groupParams.bottomMargin = dp(10);
        alertList.addView(group, groupParams);

        boolean expanded = expandedAlertGroups.getOrDefault(key, comingLater || !groupAlerts.isEmpty());
        Button header = button(
                (expanded ? "⌄  " : "›  ") + title + "  ·  " + groupAlerts.size(),
                false
        );
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setOnClickListener(view -> {
            expandedAlertGroups.put(key, !expanded);
            renderAlertGroups(alerts);
        });
        group.addView(header);

        if (!expanded) {
            return;
        }
        if (groupAlerts.isEmpty()) {
            String emptyMessage = comingLater
                    ? "Ecobank SMS setup will be added when this bank is available."
                    : "No " + title + " alerts on this phone yet.";
            TextView empty = text(emptyMessage, 13, 0xFF78869B, false);
            empty.setPadding(dp(12), dp(4), dp(12), dp(10));
            group.addView(empty);
            return;
        }

        for (BankAlert alert : groupAlerts) {
            addAlertCard(group, alert);
        }
    }

    private void addAlertCard(LinearLayout parent, BankAlert alert) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
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
        parent.addView(card, cardParams);
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
        try {
            SupportedSmsInboxScanner.ScanResult scan = SupportedSmsInboxScanner.scan(this, database);
            if (scan.examinedCount == 0) {
                testStatus.setText("No recent inbox messages from supported sender IDs were found. GTBank is matched case-insensitively as GTBank/GTBANK; SMS text was not saved.");
                return;
            }
            if (scan.parsedCount == 0) {
                testStatus.setText("Checked " + scan.examinedCount + " recent supported-sender message(s), but none matched a supported alert format. GTBank sender casing is accepted; SMS text was not saved.");
                return;
            }
            updateScreen();
            if (scan.importedCount > 0) {
                BankAlertSync.enqueue(this);
            }
            testStatus.setText(scan.importedCount > 0
                    ? "Parsed " + scan.parsedCount + " supported message(s); added " + scan.importedCount + " new alert(s) to the local review list and queued sync. SMS text was not saved."
                    : "Parsed " + scan.parsedCount + " supported message(s), but they were already on the local alert list. Pending alerts will retry sync.");
        } catch (SecurityException exception) {
            testStatus.setText(
                    "Android did not allow inbox access. Grant SMS reading permission in app settings, then try again."
            );
        }
    }

    private void addInput(LinearLayout root, EditText input, String contentDescription) {
        input.setContentDescription(contentDescription);
        input.setTextColor(0xFF102A56);
        input.setHintTextColor(0xFF8A97A9);
        input.setTextSize(15);
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        input.setBackground(rounded(0xFFFFFFFF, 14, 0xFFDCE4EF));
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
            int pendingCount = database.unsyncedAlerts().size();
            String inboxMessage = checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
                    ? "Recent supported SMS messages will also be scanned."
                    : "Enable background inbox refresh to include recent SMS messages.";
            syncStatus.setText("End-of-day sync queued: " + pendingCount + " saved alert(s) pending. " + inboxMessage);
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

    private Button button(String label, boolean primary) {
        Button view = new Button(this);
        view.setText(label);
        view.setAllCaps(false);
        view.setTextSize(14);
        view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setTextColor(primary ? 0xFFFFFFFF : 0xFF175AAB);
        view.setPadding(dp(14), dp(7), dp(14), dp(7));
        view.setMinHeight(dp(48));
        view.setBackground(rounded(
                primary ? 0xFF1769D2 : 0xFFF0F5FC,
                14,
                primary ? 0xFF1769D2 : 0xFFDCE7F5
        ));
        return view;
    }

    private GradientDrawable rounded(int fillColor, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fillColor);
        drawable.setCornerRadius(dp(radiusDp));
        drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
