# OpticPlus Bank Alerts

Private Android pilot for Prudential Bank and MTN MoMo SMS alerts. The app parses the exact Prudential format and supported MTN MoMo merchant payment received, payment made, and cash-out formats, keeps parsed details locally until sync, and uploads them to the OpticPlus review queue over HTTPS. It never uploads or stores the raw SMS body. Prudential alerts affect the bank register only after manager approval; MTN MoMo reported wallet balances remain separate from that register.

## Build

The project uses the Gradle wrapper and needs JDK 17 plus Android SDK Platform 35 and Build Tools 35.0.0. With `JAVA_HOME` and `ANDROID_HOME` configured, build and run the parser tests from this directory:

```sh
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

The APK is generated at `app/build/outputs/apk/debug/app-debug.apk`. Android Studio is optional.

## Pilot limitations

- Supported sender IDs are `PRUDENTIAL`, `MobileMoney`, MTN-prefixed IDs, and `170`; unsupported sender IDs and message formats are ignored.
- Supported MTN messages provide a transaction ID (or Financial Transaction Id) and current balance; available balance is used when present, otherwise current balance is used. Since the SMS has no transaction date, the SMS received date is used for its review date.
- MTN alerts map to the single active MTN MoMo wallet configured for the paired device's branch. Configure one wallet per branch in Bank Deposits using the last four digits of its merchant number before syncing.
- The app requires a configured HTTPS API base URL ending in `/api/v1` and a one-time device pairing token from Bank Deposits. These values are encrypted with Android Keystore.
- Each phone has its own token and branch assignment. Multiple phones can remain active for the same branch; creating another pairing does not revoke existing phones.
- Parsed alerts remain in the app's private database until the HTTPS upload succeeds. The backend deduplicates by sender, account suffix, and transaction reference.
- A newly received supported SMS queues an immediate upload. If any parsed alerts remain pending, the app also retries them during its roughly five-minute online background check, with Android's scheduled 15-minute sync as a fallback. Android may delay background work; open the app after saving the connection so the schedules are started.
- Prudential alerts map by the configured account suffix. MTN alerts map to exactly one active MTN MoMo wallet for the paired device's branch.
- SMS-reported available balances are stored separately from the branch ledger balance. A manager must approve an alert; only Prudential credits/debits are posted to the bank register. MTN approvals leave the bank register unchanged.
- Background monitoring uses `RECEIVE_SMS`. The optional one-time test asks for the more sensitive `READ_SMS` permission only when tapped and checks recent messages from supported sender IDs; it does not retain SMS bodies.
- If SMS permission is denied or later revoked, use the in-app **Enable SMS monitoring** / **SMS permission settings** button to request it again or open Android's app permissions page.
- To let an OpticPlus manager request an inbox refresh, grant **Enable background inbox refresh** (`READ_SMS`). The app checks the server about every five minutes while online and scans only the latest 50 messages from supported sender IDs; Android may delay the poll. Raw SMS bodies are never saved or uploaded.
- SMS sender IDs are not cryptographic proof of origin. Keep alerts in review and reconcile balances against the bank statement or official MoMo channel.

## Pairing and first sync

1. Apply the backend migration and deploy the API over HTTPS.
2. In Bank Deposits, configure the Prudential Bank account and/or MTN MoMo wallet for the correct branch. Use the last four digits of the account or merchant number; configure only one MTN MoMo wallet per branch.
3. As the General Manager, enter a label for each phone and generate a separate pairing token for its branch. Each full token is shown once.
4. On that Android phone, enter the deployment's HTTPS API base URL and its pairing token, then save the connection before generating the next phone's token.
5. Sync a test alert and confirm it appears in the web review queue as pending. Approving/rejecting is available only to the General Manager.
