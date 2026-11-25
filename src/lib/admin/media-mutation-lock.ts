import "server-only";
import type { Prisma } from "@/generated/prisma/client";

export async function lockMediaMutation(tx: Prisma.TransactionClient) {
  await tx.storeSettings.upsert({
    where: { id: "primary" },
    create: { id: "primary" },
    update: {},
  });
  const rows = await tx.$queryRaw<Array<{ id: string; mediaEpoch: number }>>`
    SELECT id, mediaEpoch FROM StoreSettings WHERE id = 'primary' FOR UPDATE
  `;
  if (rows.length !== 1) throw new Error("Media mutation lock unavailable");
  await tx.storeSettings.update({ where: { id: "primary" }, data: { mediaEpoch: { increment: 1 } } });
}
