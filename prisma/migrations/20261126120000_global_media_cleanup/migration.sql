ALTER TABLE `StoreSettings`
  ADD COLUMN `mediaEpoch` INTEGER NOT NULL DEFAULT 0;

INSERT IGNORE INTO `StoreSettings` (`id`, `updatedAt`, `createdAt`)
VALUES ('primary', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

CREATE TABLE `MediaCleanupJob` (
  `id` VARCHAR(191) NOT NULL,
  `storageKey` VARCHAR(255) NOT NULL,
  `area` VARCHAR(32) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leaseUntil` DATETIME(3) NULL,
  `lockedBy` VARCHAR(64) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  UNIQUE INDEX `MediaCleanupJob_storageKey_key` (`storageKey`),
  INDEX `MediaCleanupJob_status_nextAttemptAt_createdAt_idx` (`status`, `nextAttemptAt`, `createdAt`),
  INDEX `MediaCleanupJob_status_leaseUntil_idx` (`status`, `leaseUntil`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `MediaCleanupJob`
  (`id`, `storageKey`, `area`, `status`, `attempts`, `nextAttemptAt`, `createdAt`, `updatedAt`)
SELECT `id`, `storageKey`, 'products',
  CASE WHEN `status` = 'FAILED' THEN 'FAILED' ELSE 'PENDING' END,
  `attempts`, CURRENT_TIMESTAMP(3), `createdAt`, CURRENT_TIMESTAMP(3)
FROM `MediaDeletionJob`
WHERE `status` IN ('REVIEW_REQUIRED', 'PENDING', 'FAILED');
