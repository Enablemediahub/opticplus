-- Run once in Hostinger phpMyAdmin after the original working capital table exists.
-- Existing rows remain current liabilities. New cash entries are current assets.

ALTER TABLE `working_capital_liabilities`
  ADD COLUMN IF NOT EXISTS `entry_side` ENUM('current_asset','current_liability') NOT NULL DEFAULT 'current_liability' AFTER `branch_id`,
  ADD KEY `working_capital_liabilities_entry_side_index` (`entry_side`);

ALTER TABLE `working_capital_liabilities`
  MODIFY COLUMN `liability_type` ENUM(
    'trade_creditors',
    'staff_creditors',
    'accrued_expenses',
    'other_actuals',
    'cash_in_hand',
    'cash_in_momo',
    'cash_at_bank'
  ) NOT NULL;