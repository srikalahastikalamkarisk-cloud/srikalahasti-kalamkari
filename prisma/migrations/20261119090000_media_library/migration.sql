CREATE TABLE `MediaFolder` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `parentId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `MediaFolder_parentId_idx` (`parentId`),
  UNIQUE INDEX `MediaFolder_parentId_name_key` (`parentId`, `name`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MediaFolder_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `MediaFolder` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MediaAsset` (
  `id` VARCHAR(191) NOT NULL,
  `storageKey` VARCHAR(255) NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `sizeBytes` INTEGER NOT NULL,
  `checksum` CHAR(64) NOT NULL,
  `photoNumber` VARCHAR(64) NULL,
  `folderId` VARCHAR(191) NULL,
  `deletionPending` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `MediaAsset_storageKey_key` (`storageKey`),
  UNIQUE INDEX `MediaAsset_checksum_key` (`checksum`),
  INDEX `MediaAsset_filename_idx` (`filename`),
  INDEX `MediaAsset_photoNumber_idx` (`photoNumber`),
  INDEX `MediaAsset_folderId_idx` (`folderId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MediaAsset_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `MediaFolder` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MediaReference` (
  `id` VARCHAR(191) NOT NULL,
  `mediaId` VARCHAR(191) NOT NULL,
  `placement` VARCHAR(64) NOT NULL,
  `placementId` VARCHAR(191) NULL,
  `productId` VARCHAR(191) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `MediaReference_mediaId_idx` (`mediaId`),
  INDEX `MediaReference_placement_placementId_idx` (`placement`, `placementId`),
  INDEX `MediaReference_productId_sortOrder_idx` (`productId`, `sortOrder`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MediaReference_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `MediaReference_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MediaDeletionJob` (
  `id` VARCHAR(191) NOT NULL,
  `mediaId` VARCHAR(191) NOT NULL,
  `storageKey` VARCHAR(255) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `MediaDeletionJob_status_createdAt_idx` (`status`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MediaDeletionJob_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

