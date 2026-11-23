-- Fresh-install baseline generated from baseline.prisma using Prisma 7.
-- Apply only to a newly created, empty schema.
-- TEXT defaults use MySQL 9.3 expression syntax.

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `parentId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Category_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `shortDescription` TEXT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `originalPrice` DECIMAL(10, 2) NULL,
    `pricingMode` VARCHAR(191) NOT NULL DEFAULT 'FIXED',
    `pricePerMeter` DECIMAL(10, 2) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `availabilityStatus` VARCHAR(191) NOT NULL DEFAULT 'IN_STOCK',
    `sku` VARCHAR(191) NULL,
    `images` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isNewArrival` BOOLEAN NOT NULL DEFAULT false,
    `brand` VARCHAR(191) NULL,
    `fabricMaterial` VARCHAR(191) NULL,
    `length` VARCHAR(191) NULL,
    `width` VARCHAR(191) NULL,
    `washCare` TEXT NULL,
    `specifications` JSON NULL,
    `colors` JSON NULL,
    `sizes` JSON NULL,
    `meterOptions` JSON NULL,
    `showColors` BOOLEAN NOT NULL DEFAULT false,
    `showSizes` BOOLEAN NOT NULL DEFAULT false,
    `showMeters` BOOLEAN NOT NULL DEFAULT false,
    `showSpecifications` BOOLEAN NOT NULL DEFAULT false,
    `showFabricMaterial` BOOLEAN NOT NULL DEFAULT false,
    `showLength` BOOLEAN NOT NULL DEFAULT false,
    `showWidth` BOOLEAN NOT NULL DEFAULT false,
    `showWashCare` BOOLEAN NOT NULL DEFAULT false,
    `allowCOD` BOOLEAN NOT NULL DEFAULT false,
    `freeShipping` BOOLEAN NOT NULL DEFAULT false,
    `allowEnquiry` BOOLEAN NOT NULL DEFAULT true,
    `seoTitle` VARCHAR(191) NULL,
    `seoDescription` TEXT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_slug_key`(`slug`),
    UNIQUE INDEX `Product_sku_key`(`sku`),
    INDEX `Product_categoryId_idx`(`categoryId`),
    INDEX `Product_isActive_isFeatured_idx`(`isActive`, `isFeatured`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaFolder` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MediaFolder_parentId_idx`(`parentId`),
    UNIQUE INDEX `MediaFolder_parentId_name_key`(`parentId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    UNIQUE INDEX `MediaAsset_storageKey_key`(`storageKey`),
    UNIQUE INDEX `MediaAsset_checksum_key`(`checksum`),
    INDEX `MediaAsset_filename_idx`(`filename`),
    INDEX `MediaAsset_photoNumber_idx`(`photoNumber`),
    INDEX `MediaAsset_folderId_idx`(`folderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaReference` (
    `id` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `placement` VARCHAR(64) NOT NULL,
    `placementId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MediaReference_mediaId_idx`(`mediaId`),
    INDEX `MediaReference_placement_placementId_idx`(`placement`, `placementId`),
    INDEX `MediaReference_productId_sortOrder_idx`(`productId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaDeletionJob` (
    `id` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MediaDeletionJob_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductVariant` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `colorName` VARCHAR(191) NULL,
    `colorHex` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `lengthMeters` DECIMAL(8, 2) NULL,
    `attributes` JSON NULL,
    `imageUrl` VARCHAR(500) NULL,
    `price` DECIMAL(10, 2) NULL,
    `originalPrice` DECIMAL(10, 2) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductVariant_sku_key`(`sku`),
    INDEX `ProductVariant_productId_idx`(`productId`),
    INDEX `ProductVariant_productId_isActive_idx`(`productId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryMovement` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `productSku` VARCHAR(191) NULL,
    `movementType` VARCHAR(191) NOT NULL,
    `quantityChange` INTEGER NOT NULL,
    `quantityBefore` INTEGER NOT NULL,
    `quantityAfter` INTEGER NOT NULL,
    `note` VARCHAR(500) NULL,
    `referenceId` VARCHAR(191) NULL,
    `performedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryMovement_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `InventoryMovement_movementType_createdAt_idx`(`movementType`, `createdAt`),
    INDEX `InventoryMovement_referenceId_idx`(`referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'ADMIN',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_email_key`(`email`),
    INDEX `Customer_emailVerifiedAt_idx`(`emailVerifiedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerVerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CustomerVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `CustomerVerificationToken_customerId_expiresAt_idx`(`customerId`, `expiresAt`),
    INDEX `CustomerVerificationToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerPasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CustomerPasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `CustomerPasswordResetToken_customerId_expiresAt_idx`(`customerId`, `expiresAt`),
    INDEX `CustomerPasswordResetToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerAddress` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `landmark` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `pincode` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CustomerAddress_customerId_isDefault_idx`(`customerId`, `isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNumber` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerEmail` VARCHAR(191) NOT NULL,
    `customerPhone` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `landmark` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `pincode` VARCHAR(191) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `shippingAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `couponCode` VARCHAR(64) NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `orderStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'UNPAID',
    `paymentMethod` VARCHAR(191) NULL,
    `paymentId` VARCHAR(191) NULL,
    `razorpayOrderId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `inventoryStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `inventoryDeductedAt` DATETIME(3) NULL,
    `courierName` VARCHAR(191) NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `trackingUrl` VARCHAR(500) NULL,
    `shippedAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `checkoutKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_orderNumber_key`(`orderNumber`),
    UNIQUE INDEX `Order_paymentId_key`(`paymentId`),
    UNIQUE INDEX `Order_razorpayOrderId_key`(`razorpayOrderId`),
    UNIQUE INDEX `Order_checkoutKey_key`(`checkoutKey`),
    INDEX `Order_customerEmail_idx`(`customerEmail`),
    INDEX `Order_customerPhone_idx`(`customerPhone`),
    INDEX `Order_orderStatus_idx`(`orderStatus`),
    INDEX `Order_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `productImage` VARCHAR(191) NULL,
    `productSku` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NULL,
    `variantSnapshot` JSON NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `totalPrice` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderItem_orderId_idx`(`orderId`),
    INDEX `OrderItem_productId_idx`(`productId`),
    INDEX `OrderItem_variantId_idx`(`variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `razorpayOrderId` VARCHAR(191) NULL,
    `razorpayPaymentId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CREATING',
    `amountPaise` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentAttempt_razorpayOrderId_key`(`razorpayOrderId`),
    UNIQUE INDEX `PaymentAttempt_razorpayPaymentId_key`(`razorpayPaymentId`),
    INDEX `PaymentAttempt_orderId_idx`(`orderId`),
    INDEX `PaymentAttempt_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentWebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `razorpayOrderId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'RECEIVED',
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PaymentWebhookEvent_eventId_key`(`eventId`),
    INDEX `PaymentWebhookEvent_status_idx`(`status`),
    INDEX `PaymentWebhookEvent_razorpayOrderId_status_idx`(`razorpayOrderId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentRateLimit` (
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `windowStart` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentRateLimit_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Coupon` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(500) NULL,
    `discountType` VARCHAR(20) NOT NULL,
    `discountValue` DECIMAL(10, 2) NOT NULL,
    `minimumOrderAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `maximumDiscountAmount` DECIMAL(10, 2) NULL,
    `usageLimit` INTEGER NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `startsAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Coupon_code_key`(`code`),
    INDEX `Coupon_isActive_idx`(`isActive`),
    INDEX `Coupon_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CouponReservation` (
    `id` VARCHAR(191) NOT NULL,
    `couponId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `couponCode` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'RESERVED',
    `expiresAt` DATETIME(3) NOT NULL,
    `finalizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CouponReservation_orderId_key`(`orderId`),
    INDEX `CouponReservation_couponId_status_idx`(`couponId`, `status`),
    INDEX `CouponReservation_expiresAt_status_idx`(`expiresAt`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreSettings` (
    `themeId` VARCHAR(100) NOT NULL DEFAULT 'royal-navy-gold-01',
    `maintenanceMode` BOOLEAN NOT NULL DEFAULT false,
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

-- CreateTable
CREATE TABLE `HeroSlide` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `mediaType` VARCHAR(20) NOT NULL DEFAULT 'image',
    `desktopImage` TEXT NOT NULL DEFAULT (''),
    `mobileImage` TEXT NOT NULL DEFAULT (''),
    `desktopVideo` TEXT NULL,
    `mobileVideo` TEXT NULL,
    `videoUrl` TEXT NULL,
    `posterImage` TEXT NULL,
    `eyebrow` VARCHAR(191) NOT NULL DEFAULT '',
    `title` VARCHAR(191) NOT NULL DEFAULT '',
    `highlight` VARCHAR(191) NOT NULL DEFAULT '',
    `description` TEXT NOT NULL DEFAULT (''),
    `primaryLabel` VARCHAR(191) NOT NULL DEFAULT '',
    `primaryHref` VARCHAR(500) NOT NULL DEFAULT '',
    `secondaryLabel` VARCHAR(191) NOT NULL DEFAULT '',
    `secondaryHref` VARCHAR(500) NOT NULL DEFAULT '',
    `desktopSourceUrl` TEXT NULL,
    `mobileSourceUrl` TEXT NULL,
    `duration` INTEGER NOT NULL DEFAULT 5000,
    `videoFallbackMs` INTEGER NOT NULL DEFAULT 30000,
    `soundControlsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `initialMuted` BOOLEAN NOT NULL DEFAULT true,
    `transitionMs` INTEGER NOT NULL DEFAULT 1100,
    `animation` VARCHAR(20) NOT NULL DEFAULT 'fade',
    `textPosition` VARCHAR(20) NOT NULL DEFAULT 'left',
    `overlayOpacity` DOUBLE NOT NULL DEFAULT 0.48,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HeroSlide_enabled_sortOrder_idx`(`enabled`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
CREATE TABLE `CustomerGallery` (
    `id` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(500) NOT NULL,
    `caption` VARCHAR(255) NULL,
    `altText` VARCHAR(255) NULL,
    `isApproved` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CustomerGallery_isApproved_sortOrder_idx`(`isApproved`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerReview` (
    `id` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(120) NOT NULL,
    `rating` INTEGER NOT NULL,
    `reviewText` TEXT NOT NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `isApproved` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CustomerReview_isApproved_sortOrder_idx`(`isApproved`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
CREATE TABLE `AboutPageContent` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'primary',
    `content` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreThemeHistory` (
    `id` VARCHAR(191) NOT NULL,
    `themeId` VARCHAR(64) NOT NULL,
    `previousThemeId` VARCHAR(64) NULL,
    `action` VARCHAR(32) NOT NULL DEFAULT 'PUBLISH',
    `adminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StoreThemeHistory_createdAt_idx`(`createdAt`),
    INDEX `StoreThemeHistory_adminId_createdAt_idx`(`adminId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaFolder` ADD CONSTRAINT `MediaFolder_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `MediaFolder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `MediaFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaReference` ADD CONSTRAINT `MediaReference_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaReference` ADD CONSTRAINT `MediaReference_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaDeletionJob` ADD CONSTRAINT `MediaDeletionJob_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminPasswordResetToken` ADD CONSTRAINT `AdminPasswordResetToken_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerVerificationToken` ADD CONSTRAINT `CustomerVerificationToken_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerPasswordResetToken` ADD CONSTRAINT `CustomerPasswordResetToken_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerAddress` ADD CONSTRAINT `CustomerAddress_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAttempt` ADD CONSTRAINT `PaymentAttempt_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
