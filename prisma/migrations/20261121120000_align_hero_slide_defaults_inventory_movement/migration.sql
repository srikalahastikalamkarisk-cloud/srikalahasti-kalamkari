-- Align database defaults and width with prisma/schema.prisma.
-- Adding defaults and widening VARCHAR preserve existing row values.
ALTER TABLE `HeroSlide`
  ALTER COLUMN `desktopImage` SET DEFAULT '',
  ALTER COLUMN `mobileImage` SET DEFAULT '',
  ALTER COLUMN `description` SET DEFAULT '';

ALTER TABLE `InventoryMovement`
  MODIFY `movementType` VARCHAR(191) NOT NULL;
