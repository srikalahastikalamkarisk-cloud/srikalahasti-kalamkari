ALTER TABLE `ProductVariant`
  ADD COLUMN `attributes` JSON NULL,
  ADD COLUMN `imageUrl` VARCHAR(500) NULL;

ALTER TABLE `OrderItem`
  ADD COLUMN `variantSnapshot` JSON NULL;
