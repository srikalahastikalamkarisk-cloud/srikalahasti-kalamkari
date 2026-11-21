ALTER TABLE `AdminUser`
  ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `AdminPasswordResetToken` (
  `id` VARCHAR(191) NOT NULL,
  `adminId` VARCHAR(191) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AdminPasswordResetToken_tokenHash_key`(`tokenHash`),
  INDEX `AdminPasswordResetToken_adminId_expiresAt_idx`(`adminId`, `expiresAt`),
  INDEX `AdminPasswordResetToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AdminPasswordResetToken_adminId_fkey`
    FOREIGN KEY (`adminId`) REFERENCES `AdminUser`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
