ALTER TABLE `Customer`
  ADD COLUMN `normalizedPhone` VARCHAR(16) NULL,
  ADD COLUMN `mobileVerifiedAt` DATETIME(3) NULL,
  ADD UNIQUE INDEX `Customer_normalizedPhone_key` (`normalizedPhone`);

CREATE TABLE `CustomerOtpAccessToken` (
  `id` VARCHAR(191) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CustomerOtpAccessToken_tokenHash_key` (`tokenHash`),
  INDEX `CustomerOtpAccessToken_createdAt_idx` (`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
