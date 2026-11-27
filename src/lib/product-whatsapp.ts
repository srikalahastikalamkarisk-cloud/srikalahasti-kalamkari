import { storeContact } from "@/data/store-contact";

type ProductReference = {
  id: string;
  name: string;
};

export function productWhatsApp(
  product: ProductReference,
  message: string,
  priceLabel?: string,
  whatsappNumber?: string | null
): string {
  const digits = (whatsappNumber || "").replace(/\D/g, "");

  const phone = /^[1-9]\d{7,14}$/.test(digits)
    ? digits
    : storeContact.whatsapp;

  const productUrl =
    `https://srikalahastikalamkari.in/product/${encodeURIComponent(product.id)}`;

  const text = [
    "Hello Srikalahasti Kalamkari,",
    "",
    message.replace(/^Hello,\s*/i, ""),
    "",
    `Product: ${product.name}`,
    `Product ID: ${product.id}`,
    ...(priceLabel ? [`Price: ${priceLabel}`] : []),
    "",
    `Product Link: ${productUrl}`,
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
