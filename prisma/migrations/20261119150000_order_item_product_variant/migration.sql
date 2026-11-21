ALTER TABLE `OrderItem`
  ADD COLUMN `variantId` VARCHAR(191) NULL,
  ADD INDEX `OrderItem_variantId_idx` (`variantId`),
  ADD CONSTRAINT `OrderItem_variantId_fkey`
    FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
