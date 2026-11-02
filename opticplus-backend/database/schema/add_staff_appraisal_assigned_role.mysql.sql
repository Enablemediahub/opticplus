-- Optional upgrade for installations that already created the appraisal tables
-- before assigned_role was added. Safe to run after the latest create-table SQL.
SET @staff_appraisal_role_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'staff_appraisal_tasks'
    AND COLUMN_NAME = 'assigned_role'
);
SET @staff_appraisal_role_ddl = IF(
  @staff_appraisal_role_exists = 0,
  'ALTER TABLE `staff_appraisal_tasks` ADD COLUMN `assigned_role` VARCHAR(40) NULL AFTER `measurement`',
  'SELECT 1'
);
PREPARE staff_appraisal_role_stmt FROM @staff_appraisal_role_ddl;
EXECUTE staff_appraisal_role_stmt;
DEALLOCATE PREPARE staff_appraisal_role_stmt;

UPDATE `staff_appraisal_tasks` AS t
JOIN (
  SELECT `task_id`, MIN(`role_snapshot`) AS `role_snapshot`
  FROM `staff_appraisal_assignments`
  GROUP BY `task_id`
) AS a ON a.`task_id` = t.`id`
SET t.`assigned_role` = a.`role_snapshot`
WHERE t.`assigned_role` IS NULL;
