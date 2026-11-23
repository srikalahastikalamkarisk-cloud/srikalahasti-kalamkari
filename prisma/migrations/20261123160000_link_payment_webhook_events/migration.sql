ALTER TABLE `PaymentWebhookEvent`
  ADD COLUMN `razorpayOrderId` VARCHAR(191) NULL,
  ADD INDEX `PaymentWebhookEvent_razorpayOrderId_status_idx` (`razorpayOrderId`, `status`);
