-- Add product availability independently from stock quantity.
-- Existing rows receive IN_STOCK by default.
-- No existing product, inventory, or order rows are deleted.

ALTER TABLE `Product`
ADD COLUMN `availabilityStatus` VARCHAR(191)
NOT NULL DEFAULT 'IN_STOCK';
