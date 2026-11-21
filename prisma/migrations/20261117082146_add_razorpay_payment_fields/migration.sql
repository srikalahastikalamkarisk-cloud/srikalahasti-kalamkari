/*
  Warnings:

  - A unique constraint covering the columns `[paymentId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[razorpayOrderId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Order` ADD COLUMN `paidAt` DATETIME(3) NULL,
    ADD COLUMN `razorpayOrderId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Order_paymentId_key` ON `Order`(`paymentId`);

-- CreateIndex
CREATE UNIQUE INDEX `Order_razorpayOrderId_key` ON `Order`(`razorpayOrderId`);
