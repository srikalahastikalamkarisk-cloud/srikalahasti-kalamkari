-- CreateTable
CREATE TABLE `StoreSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'primary',
    `storeName` VARCHAR(191) NOT NULL DEFAULT 'Srikalahasti Kalamkari',
    `description` TEXT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `faviconUrl` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `whatsappNumber` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `instagramUrl` VARCHAR(191) NULL,
    `facebookUrl` VARCHAR(191) NULL,
    `youtubeUrl` VARCHAR(191) NULL,
    `metaTitle` VARCHAR(191) NULL,
    `metaDescription` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
