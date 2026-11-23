-- MySQL 9.3 rejects ALTER COLUMN ... SET DEFAULT for TEXT columns.
-- MODIFY COLUMN with a parenthesized expression default is supported and preserves
-- existing values while aligning the database with the Prisma model.
ALTER TABLE `HeroSlide`
  MODIFY COLUMN `desktopImage` TEXT NOT NULL DEFAULT (''),
  MODIFY COLUMN `mobileImage` TEXT NOT NULL DEFAULT (''),
  MODIFY COLUMN `description` TEXT NOT NULL DEFAULT ('');

-- Match Prisma's default MySQL String width while preserving existing values.
ALTER TABLE `InventoryMovement`
  MODIFY COLUMN `movementType` VARCHAR(191) NOT NULL;
