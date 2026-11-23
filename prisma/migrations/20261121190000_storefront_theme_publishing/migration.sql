CREATE TABLE `StoreThemeState` (
  `id` VARCHAR(32) NOT NULL,
  `activeThemeId` VARCHAR(64) NOT NULL,
  `previousThemeId` VARCHAR(64) NULL,
  `revision` INTEGER NOT NULL DEFAULT 0,
  `updatedByAdminId` VARCHAR(191) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `StoreThemeState_updatedByAdminId_idx`(`updatedByAdminId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `StoreThemeState_updatedByAdminId_fkey`
    FOREIGN KEY (`updatedByAdminId`) REFERENCES `AdminUser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StoreThemeHistory` (
  `id` VARCHAR(191) NOT NULL,
  `previousThemeId` VARCHAR(64) NULL,
  `themeId` VARCHAR(64) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `adminId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `StoreThemeHistory_createdAt_idx`(`createdAt`),
  INDEX `StoreThemeHistory_adminId_createdAt_idx`(`adminId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `StoreThemeHistory_adminId_fkey`
    FOREIGN KEY (`adminId`) REFERENCES `AdminUser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `StoreThemeState` (`id`, `activeThemeId`, `previousThemeId`, `revision`, `updatedByAdminId`, `updatedAt`)
VALUES ('storefront', 'royal-navy-gold-01', NULL, 0, NULL, CURRENT_TIMESTAMP(3));
