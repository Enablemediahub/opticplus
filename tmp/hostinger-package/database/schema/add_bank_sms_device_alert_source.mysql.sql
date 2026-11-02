-- Add per-phone SMS source restrictions. Run once after checking the column is absent.
ALTER TABLE `bank_sms_devices`
  ADD COLUMN `alert_source` VARCHAR(16) NOT NULL DEFAULT 'both' AFTER `label`;
