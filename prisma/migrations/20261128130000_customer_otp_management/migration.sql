ALTER TABLE `StoreSettings`
  ADD COLUMN `customerOtpEnabled` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `Customer`
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
  ADD COLUMN `lastLoginMethod` VARCHAR(24) NULL;

ALTER TABLE `CustomerOtpAccessToken`
  ADD COLUMN `expiresAt` DATETIME(3) NULL;
UPDATE `CustomerOtpAccessToken`
  SET `expiresAt` = DATE_ADD(`createdAt`, INTERVAL 30 DAY)
  WHERE `expiresAt` IS NULL;
ALTER TABLE `CustomerOtpAccessToken`
  MODIFY COLUMN `expiresAt` DATETIME(3) NOT NULL,
  ADD INDEX `CustomerOtpAccessToken_expiresAt_idx` (`expiresAt`);

CREATE TABLE `CustomerOtpActivity` (
  `id` VARCHAR(191) NOT NULL,
  `maskedPhone` VARCHAR(24) NULL,
  `outcome` VARCHAR(24) NOT NULL,
  `category` VARCHAR(40) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `CustomerOtpActivity_createdAt_outcome_idx` (`createdAt`, `outcome`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
