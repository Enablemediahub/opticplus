-- Run once against the Hostinger database before uploading the remote-refresh API.
ALTER TABLE `bank_sms_devices`
  ADD COLUMN `sync_request_version` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN `sync_completed_version` BIGINT UNSIGNED NOT NULL DEFAULT 0;
