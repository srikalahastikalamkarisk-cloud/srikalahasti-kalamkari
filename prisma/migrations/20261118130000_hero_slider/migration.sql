-- CreateTable
CREATE TABLE `HeroSlide` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `mediaType` VARCHAR(20) NOT NULL DEFAULT 'image',
    `desktopImage` TEXT NOT NULL,
    `mobileImage` TEXT NOT NULL,
    `desktopVideo` TEXT NULL,
    `mobileVideo` TEXT NULL,
    `videoUrl` TEXT NULL,
    `posterImage` TEXT NULL,
    `eyebrow` VARCHAR(191) NOT NULL DEFAULT '',
    `title` VARCHAR(191) NOT NULL DEFAULT '',
    `highlight` VARCHAR(191) NOT NULL DEFAULT '',
    `description` TEXT NOT NULL,
    `primaryLabel` VARCHAR(191) NOT NULL DEFAULT '',
    `primaryHref` VARCHAR(500) NOT NULL DEFAULT '',
    `secondaryLabel` VARCHAR(191) NOT NULL DEFAULT '',
    `secondaryHref` VARCHAR(500) NOT NULL DEFAULT '',
    `duration` INTEGER NOT NULL DEFAULT 4000,
    `transitionMs` INTEGER NOT NULL DEFAULT 1100,
    `animation` VARCHAR(20) NOT NULL DEFAULT 'fade',
    `textPosition` VARCHAR(20) NOT NULL DEFAULT 'left',
    `overlayOpacity` DOUBLE NOT NULL DEFAULT 0.48,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HeroSlide_enabled_sortOrder_idx`(`enabled`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

