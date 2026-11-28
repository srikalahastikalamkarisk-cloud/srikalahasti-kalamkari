ALTER TABLE `StoreSettings`
  ADD COLUMN `customerEmailLoginEnabled` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `Customer`
  MODIFY COLUMN `email` VARCHAR(191) NULL;

ALTER TABLE `Order`
  ADD COLUMN `customerId` VARCHAR(191) NULL,
  ADD INDEX `Order_customerId_idx` (`customerId`);

UPDATE `Order` AS o
INNER JOIN `Customer` AS c ON c.`email` = o.`customerEmail`
SET o.`customerId` = c.`id`
WHERE o.`customerId` IS NULL;
