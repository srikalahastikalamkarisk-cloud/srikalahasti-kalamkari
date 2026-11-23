import { getCurrentAdmin } from "@/lib/admin-auth";
import { mediaStorageRoot } from "@/lib/admin/media-storage";
import { createPersistentImageUploadHandler } from "@/lib/admin/persistent-image-upload";

export const runtime = "nodejs";

export const POST = createPersistentImageUploadHandler({
  area: "products",
  getCurrentAdmin,
  getStorageRoot: mediaStorageRoot,
});
