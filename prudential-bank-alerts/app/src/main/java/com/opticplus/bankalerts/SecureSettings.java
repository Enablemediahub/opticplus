package com.opticplus.bankalerts;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureSettings {
    private static final String KEY_ALIAS = "opticplus_bank_alert_sync";
    private static final String PREFERENCES = "secure_bank_alert_settings";
    private static final String URL_KEY = "encrypted_server_url";
    private static final String TOKEN_KEY = "encrypted_device_token";

    private SecureSettings() {}

    static void save(Context context, String serverUrl, String deviceToken) throws Exception {
        SharedPreferences preferences = preferences(context);
        preferences.edit()
                .putString(URL_KEY, encrypt(serverUrl))
                .putString(TOKEN_KEY, encrypt(deviceToken))
                .apply();
    }

    static String serverUrl(Context context) throws Exception {
        return decrypt(preferences(context).getString(URL_KEY, null));
    }

    static String deviceToken(Context context) throws Exception {
        return decrypt(preferences(context).getString(TOKEN_KEY, null));
    }

    static void saveLastSyncStatus(Context context, String status) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .putString("last_sync_status", status)
                .apply();
    }

    static String lastSyncStatus(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .getString("last_sync_status", "Alerts stay on this phone until a secure server is configured.");
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static String encrypt(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":"
                + Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private static String decrypt(String storedValue) throws Exception {
        if (storedValue == null || storedValue.isEmpty()) {
            return "";
        }

        String[] pieces = storedValue.split(":", 2);
        if (pieces.length != 2) {
            throw new IllegalStateException("Encrypted bank-alert setting is malformed.");
        }

        byte[] iv = Base64.decode(pieces[0], Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(pieces[1], Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private static SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) {
            return (SecretKey) existing;
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }
}
