-- About Kalamkari homepage content only.
-- No existing tables are modified.

CREATE TABLE `AboutKalamkariContent` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'primary',
    `eyebrow` VARCHAR(120) NOT NULL DEFAULT 'OUR ART & HERITAGE',
    `heading` VARCHAR(160) NOT NULL DEFAULT 'About Kalamkari',
    `descriptionOne` TEXT NOT NULL,
    `descriptionTwo` TEXT NOT NULL,
    `imageUrl` VARCHAR(500) NULL,
    `imageAlt` VARCHAR(250) NOT NULL DEFAULT 'Srikalahasti Kalamkari heritage textile presentation',
    `imageCaption` VARCHAR(250) NOT NULL DEFAULT 'THE ART OF THE HAND ✦ SRIKALAHASTI, INDIA',
    `categoryIds` JSON NOT NULL,
    `buttonText` VARCHAR(100) NOT NULL DEFAULT 'Read Our Story',
    `buttonHref` VARCHAR(500) NOT NULL DEFAULT '/about',
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
