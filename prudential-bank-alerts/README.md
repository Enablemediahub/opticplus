# OpticPlus Bank Alerts

Private Android pilot for Prudential Bank, GTBank, and MTN MoMo SMS alerts. The app parses the supported Prudential and GTBank formats and MTN MoMo merchant payment received, payment made, and cash-out formats, keeps parsed details locally until sync, and uploads them to the OpticPlus review queue over HTTPS. It never uploads or stores the raw SMS body. The app has a branded, collapsible alert list and an end-of-day sync action. Ecobank is shown as a future provider and is not parsed until a supported message example is available.

## Build

The project uses the Gradle wrapper and needs JDK 17 plus Android SDK Platform 35 and Build Tools 35.0.0. With `JAVA_HOME` and `ANDROID_HOME` configured, build and run the parser tests from this directory:

```sh
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

The APK is generated at `app/build/outputs/apk/debug/app-debug.apk`. Android Studio is optional.

## Pilot limitations

- Supported sender IDs are `PRUDENTIAL`, `GTBank`, `MobileMoney`, MTN-prefixed IDs, and `170`; unsupported sender IDs and message formats are ignored.
- The GTBank sender is matched without regard to letter case (`GTBank` and `GTBANK` are equivalent). The app normalizes accepted GTBank alerts to `GTBANK` internally for sync.
- Supported MTN messages provide a transaction ID (or Financial Transaction Id) and current balance; available balance is used when present, otherwise current balance is used. Since the SMS has no transaction date, the SMS received date is used for its review date.
- MTN alerts map to the single active MTN MoMo wallet configured for the paired device's branch. Configure one wallet per branch in Bank Deposits using the last four digits of its merchant number before syncing.
- The app requires a configured HTTPS API base URL ending in `/api/v1` and a one-time device pairing token from Bank Deposits. These values are encrypted with Android Keystore.
- Each phone has its own token and branch assignment. Multiple phones can remain active for the same branch; creating another pairing does not revoke existing phones.
- Parsed alerts remain in the app's private database until the HTTPS upload succeeds. The backend deduplicates by sender, account suffix, and transaction reference.
- After the first setup, supported SMS alerts are queued for upload by Android WorkManager, which continues after the app screen is closed and the process is removed from Recents. The app keeps no activity or foreground service running. Android controls execution timing; battery saver or manufacturer-specific background restrictions can delay work. Do not use Android **Force stop** if alerts must continue syncing; Android suspends stopped apps until the user opens them again. WorkManager restores scheduled jobs across normal device restarts.
- If one SIM receives both bank and MTN MoMo messages, set its existing phone pairing to **Both sources** in Bank Deposits. Do not create a second pairing for the same phone; pairing tokens identify a phone and branch, not each bank account. Upgrading from an earlier app version automatically queues any locally saved GTBank alerts for another sync attempt.
- Grant **Enable background inbox refresh** (`READ_SMS`) to scan recent supported sender messages automatically and upload newly parsed alerts. The app schedules these checks about every five minutes and also scans during its 15-minute fallback sync; Android may delay background work. Without inbox access, SMS alerts received while the app is not force-stopped still sync through the live SMS receiver, but earlier messages cannot be backfilled automatically.
- Prudential and GTBank alerts map by the configured account suffix. MTN alerts map to exactly one active MTN MoMo wallet for the paired device's branch.
- SMS-reported available balances are stored separately from the branch ledger balance. Automatic approval is disabled by default. The General Manager can enable it per branch in Bank Deposits; it applies only to new matched alerts. Existing pending alerts still require manual review. Approved Prudential and GTBank credits/debits are posted to the bank register, while MTN MoMo approvals remain wallet-only.
- Background monitoring of newly received messages uses `RECEIVE_SMS`. Automatic inbox backfill requires the separate `READ_SMS` permission; without it, the app only handles messages received after SMS monitoring is enabled. The one-time test also checks recent messages from supported sender IDs. Raw SMS bodies are not retained or uploaded.
- If SMS permission is denied or later revoked, use the in-app **Enable SMS monitoring** / **SMS permission settings** button to request it again or open Android's app permissions page.
- The app checks for manager-requested inbox refreshes and automatically scans the latest 20 messages from supported sender IDs whenever background sync runs, when **Enable background inbox refresh** (`READ_SMS`) is granted. It schedules checks about every five minutes and also scans during the 15-minute fallback sync; Android may delay work. Raw SMS bodies are never saved or uploaded.
- SMS sender IDs are not cryptographic proof of origin. Keep alerts in review and reconcile balances against the bank statement or official MoMo channel.

## Pairing and first sync

1. Apply the backend migration and deploy the API over HTTPS.
2. In Bank Deposits, configure the Prudential Bank account and/or MTN MoMo wallet for the correct branch. Use the last four digits of the account or merchant number; configure only one MTN MoMo wallet per branch.
3. As the General Manager, enter a label for each phone and generate a separate pairing token for its branch. Each full token is shown once.
4. On that Android phone, enter the deployment's HTTPS API base URL and its pairing token, then save the connection before generating the next phone's token.
5. Sync a test alert and confirm it appears in the web review queue as pending unless the General Manager explicitly enabled automatic approval for that branch. Manual approval/rejection and automatic approval policy changes are available only to the General Manager.
