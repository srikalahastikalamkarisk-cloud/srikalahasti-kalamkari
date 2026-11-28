"use client";

import { useState } from "react";
import { useShopState } from "@/lib/shop-state";
import { AlertCircle, MessageCircle, X } from "lucide-react";
import { productWhatsApp } from "@/lib/product-whatsapp";

type Product = {
  id: string;
  name: string;
  allowEnquiry?: boolean;
};

type Notice = {
  product: Product;
  stock: number;
  requested?: number;
  variant?: string;
  phone?: string | null;
};

export function useStockLimitNotice(defaultPhone?: string | null) {
  const { cart } = useShopState();
  const [notice, setNotice] = useState<Notice | null>(null);

  function show(
    product: Product,
    stock: number,
    requested?: number,
    variant?: string,
    phone?: string | null,
    variantId?: string,
    quantityToAdd = 1
  ) {
    const currentQuantity = cart
      .filter(line =>
        String(line.id) === String(product.id) &&
        (line.variantId || "") === (variantId || "")
      )
      .reduce((sum, line) => sum + line.quantity, 0);

    setNotice({
      product,
      stock,
      requested: requested ?? currentQuantity + quantityToAdd,
      variant,
      phone: phone ?? defaultPhone,
    });
  }

  const element = notice ? (
    <aside className="sk-stock-notice"
      aria-label="Stock limit reached">

      <div className="sk-stock-notice-heading">
        <AlertCircle size={21} aria-hidden="true"/>
        <strong>Stock limit reached</strong>
        <button type="button"
          aria-label="Dismiss notification"
          onClick={() => setNotice(null)}>
          <X size={18}/>
        </button>
      </div>

      <div role="status">
        <strong className="sk-stock-notice-product">
          {notice.product.name}
        </strong>

        <p>{notice.stock <= 0
          ? "This selection is currently unavailable."
          : notice.stock > 20
            ? "Maximum 20 units per selection."
            : notice.stock === 1
              ? "Only 1 unit is available."
              : `Only ${notice.stock} units are available.`
        }</p>

        {notice.product.allowEnquiry !== false && (
          <p>Need more? Contact our team for a custom order.</p>
        )}
      </div>

      {notice.product.allowEnquiry !== false && (
        <a
          className="sk-stock-notice-whatsapp"
          href={productWhatsApp(
            notice.product,
            [
              "I would like to enquire about a custom order.",
              `Available quantity: ${notice.stock}`,
              notice.requested
                ? `Requested quantity: ${notice.requested}` : "",
              notice.variant
                ? `Selected option: ${notice.variant}` : "",
              "Please confirm availability."
            ].filter(Boolean).join("\n"),
            undefined,
            notice.phone
          )}
          target="_blank"
          rel="noopener noreferrer">
          <MessageCircle size={17}/>
          Enquire on WhatsApp
        </a>
      )}
    </aside>
  ) : null;

  return {
    show,
    clear: () => setNotice(null),
    element
  };
}
