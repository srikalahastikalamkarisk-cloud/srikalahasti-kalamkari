-- AlterTable
ALTER TABLE `Product` ADD COLUMN `allowCOD` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `allowEnquiry` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `brand` VARCHAR(191) NULL,
    ADD COLUMN `colors` JSON NULL,
    ADD COLUMN `fabricMaterial` VARCHAR(191) NULL,
    ADD COLUMN `freeShipping` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isNewArrival` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `length` VARCHAR(191) NULL,
    ADD COLUMN `meterOptions` JSON NULL,
    ADD COLUMN `originalPrice` DECIMAL(10, 2) NULL,
    ADD COLUMN `pricePerMeter` DECIMAL(10, 2) NULL,
    ADD COLUMN `pricingMode` VARCHAR(191) NOT NULL DEFAULT 'FIXED',
    ADD COLUMN `seoDescription` TEXT NULL,
    ADD COLUMN `seoTitle` VARCHAR(191) NULL,
    ADD COLUMN `shortDescription` TEXT NULL,
    ADD COLUMN `showColors` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `showMeters` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `showSizes` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `showSpecifications` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `showWashCare` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sizes` JSON NULL,
    ADD COLUMN `sku` VARCHAR(191) NULL,
    ADD COLUMN `specifications` JSON NULL,
    ADD COLUMN `washCare` TEXT NULL,
    ADD COLUMN `width` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ProductVariant` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `colorName` VARCHAR(191) NULL,
    `colorHex` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `lengthMeters` DECIMAL(8, 2) NULL,
    `price` DECIMAL(10, 2) NULL,
    `originalPrice` DECIMAL(10, 2) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductVariant_sku_key`(`sku`),
    INDEX `ProductVariant_productId_idx`(`productId`),
    INDEX `ProductVariant_productId_isActive_idx`(`productId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Product_sku_key` ON `Product`(`sku`);

-- CreateIndex
CREATE INDEX `Product_isActive_isFeatured_idx` ON `Product`(`isActive`, `isFeatured`);

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

