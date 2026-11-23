-- New installations and existing settings remain LIVE by default.
ALTER TABLE `StoreSettings`
  ADD COLUMN `maintenanceMode` BOOLEAN NOT NULL DEFAULT false;
