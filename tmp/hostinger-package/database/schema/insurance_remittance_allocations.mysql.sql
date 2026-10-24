CREATE TABLE IF NOT EXISTS insurance_remittance_allocations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    remittance_id BIGINT UNSIGNED NOT NULL,
    insurance_provider VARCHAR(80) NOT NULL,
    claim_month DATE NOT NULL,
    amount_paid DECIMAL(12,2) NOT NULL,
    branch_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL DEFAULT NULL,
    updated_at TIMESTAMP NULL DEFAULT NULL,
    INDEX insurance_alloc_month_provider_idx (branch_id, claim_month, insurance_provider),
    INDEX insurance_alloc_remittance_idx (remittance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
