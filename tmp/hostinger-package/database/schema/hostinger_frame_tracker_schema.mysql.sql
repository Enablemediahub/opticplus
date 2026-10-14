-- Apply to the Hostinger database before uploading the Frame Tracker update.
-- Safe to run if products.cost_price or frame_cost_reservations already exists.

SET @cost_price_column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'cost_price'
);

SET @cost_price_ddl = IF(
    @cost_price_column_exists = 0,
    'ALTER TABLE `products` ADD COLUMN `cost_price` DECIMAL(10, 2) NULL AFTER `max_price`',
    'SELECT 1'
);
PREPARE cost_price_stmt FROM @cost_price_ddl;
EXECUTE cost_price_stmt;
DEALLOCATE PREPARE cost_price_stmt;

CREATE TABLE IF NOT EXISTS `frame_cost_reservations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `branch_id` BIGINT UNSIGNED NOT NULL,
    `frame_sale_id` BIGINT UNSIGNED NOT NULL,
    `product_id` BIGINT UNSIGNED NOT NULL,
    `reserved_cost` DECIMAL(10, 2) NOT NULL,
    `reserved_by` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP NULL,
    `updated_at` TIMESTAMP NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `frame_cost_reservations_branch_id_frame_sale_id_unique` (`branch_id`, `frame_sale_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
