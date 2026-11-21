-- AlterTable
ALTER TABLE `Product` ADD COLUMN `showFabricMaterial` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `showLength` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `showWidth` BOOLEAN NOT NULL DEFAULT false;
