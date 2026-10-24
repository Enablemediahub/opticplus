ALTER TABLE `expenses`
  ADD COLUMN `receipt_unavailable` TINYINT(1) NOT NULL DEFAULT 0 AFTER `category`;
