CREATE TABLE `InventoryMovement` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `productSku` VARCHAR(191) NULL,
    `movementType` VARCHAR(32) NOT NULL,
    `quantityChange` INTEGER NOT NULL,
    `quantityBefore` INTEGER NOT NULL,
    `quantityAfter` INTEGER NOT NULL,
    `note` VARCHAR(500) NULL,
    `referenceId` VARCHAR(191) NULL,
    `performedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryMovement_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `InventoryMovement_movementType_createdAt_idx`(`movementType`, `createdAt`),
    INDEX `InventoryMovement_referenceId_idx`(`referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `InventoryMovement`
  ADD CONSTRAINT `InventoryMovement_productId_fkey`
  FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
