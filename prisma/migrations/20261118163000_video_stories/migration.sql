-- Video Stories: homepage scrolling video cards
CREATE TABLE `VideoStory` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `sourceType` VARCHAR(20) NOT NULL DEFAULT 'url',
    `videoUrl` TEXT NULL,
    `mobileUrl` TEXT NULL,
    `videoFile` TEXT NULL,
    `posterImage` TEXT NULL,
    `fallbackMs` INTEGER NOT NULL DEFAULT 15000,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VideoStory_enabled_sortOrder_idx`(`enabled`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
