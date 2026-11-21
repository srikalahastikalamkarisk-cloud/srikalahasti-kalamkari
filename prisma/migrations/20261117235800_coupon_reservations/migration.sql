-- ADMIN-112A: Coupon payment reservations.
-- Additive migration only.
-- Existing orders, coupons and payments are preserved.

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

  UNIQUE INDEX `CouponReservation_orderId_key` (`orderId`),
  INDEX `CouponReservation_couponId_status_idx` (`couponId`, `status`),
  INDEX `CouponReservation_expiresAt_status_idx` (`expiresAt`, `status`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
