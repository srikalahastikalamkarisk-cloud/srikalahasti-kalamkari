-- Protect historical paid orders from inventory re-deduction.
-- This migration must run before inventory deduction is enabled.

UPDATE `Order`
SET `inventoryStatus` = 'LEGACY_PAID'
WHERE `paymentStatus` = 'PAID'
  AND `inventoryStatus` = 'PENDING'
  AND `inventoryDeductedAt` IS NULL;
