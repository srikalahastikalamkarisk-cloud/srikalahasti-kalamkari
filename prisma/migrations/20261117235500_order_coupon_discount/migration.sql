-- ADMIN-111R: Add optional coupon details to existing orders.
-- Existing orders receive discountAmount = 0.
-- No existing payment amounts or payment statuses are modified.

ALTER TABLE `Order`
  ADD COLUMN `discountAmount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `couponCode` VARCHAR(64) NULL;
