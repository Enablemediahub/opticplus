# OpticPlus Bank Alerts

Private Android pilot for Prudential Bank SMS alerts. The app matches only the exact sender ID `PRUDENTIAL`, parses supported credit/debit alerts, keeps them locally until sync, and uploads parsed fields to the OpticPlus review queue over HTTPS. It never uploads or stores the raw SMS body. Bank-register balances change only after a General Manager approves an alert in the web app.

## Build

The project uses the Gradle wrapper and needs JDK 17 plus Android SDK Platform 35 and Build Tools 35.0.0. With `JAVA_HOME` and `ANDROID_HOME` configured, build and run the parser tests from this directory:

```sh
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

The APK is generated at `app/build/outputs/apk/debug/app-debug.apk`. Android Studio is optional.

## Pilot limitations

- Only the Prudential sender and message layout currently represented by the parser are supported.
- Alerts that do not contain a transaction reference, transaction date, amount, and available balance are ignored for manual review rather than partially interpreted.
- The app requires a configured HTTPS API base URL ending in `/api/v1` and a one-time device pairing token from Bank Deposits. These values are encrypted with Android Keystore.
- Each device token is scoped to one branch. Creating a replacement token revokes the previous active device token.
- Parsed alerts remain in the app's private database until the HTTPS upload succeeds. The backend deduplicates by sender, account suffix, and transaction reference.
- The backend maps only the account suffix configured for Prudential in the device's assigned branch. Unmatched alerts require bank-account setup before they can be reviewed.
- SMS-reported available balances are stored separately from the branch ledger balance. A General Manager must approve an alert before its signed amount is posted to the ledger.
- Background monitoring uses `RECEIVE_SMS`. The optional one-time test asks for the more sensitive `READ_SMS` permission only when the user taps the test button. It queries only the newest inbox row with the exact sender ID `PRUDENTIAL`, does not import previous messages in bulk, and does not retain the SMS body.
- SMS sender IDs are not cryptographic proof of origin. Keep the pilot in review-only mode and reconcile against the bank's official statement or app.

## Pairing and first sync

1. Apply the backend migration and deploy the API over HTTPS.
2. In Bank Deposits, configure the Prudential Bank account for the correct branch using its last four digits.
3. As the General Manager, generate a device pairing token for that branch. The full token is shown once.
4. On the Android phone, enter the deployment's HTTPS API base URL and the pairing token, then save the connection.
5. Sync a test alert and confirm it appears in the web review queue as pending. Approving/rejecting is available only to the General Manager.
