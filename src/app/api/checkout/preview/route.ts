import { NextRequest, NextResponse } from "next/server";
import { checkoutRequestSchema } from "@/lib/checkout/order-validation";
import {
  calculateCoupon,
  CouponValidationError,
} from "@/lib/checkout/calculate-coupon";
import {
  CheckoutValidationError,
  verifyCheckoutProducts,
} from "@/lib/checkout/verify-products";
import { SHIPPING_AMOUNT_PAISE } from "@/lib/checkout/shipping-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "JSON request required." },
        { status: 415 }
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") ?? "0"
    );

    if (contentLength > 16000) {
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 }
      );
    }

    const raw = await request.text();

    if (raw.length > 16000) {
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON." },
        { status: 400 }
      );
    }

    const parsed = checkoutRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please check your delivery details and cart.",
          issues: parsed.error.issues.map(issue => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const verified = await verifyCheckoutProducts(
      parsed.data.items
    );

    const shippingPaise = SHIPPING_AMOUNT_PAISE;

    const coupon = await calculateCoupon(
      parsed.data.couponCode,
      verified.subtotalPaise,
      shippingPaise
    );

    const totalPaise = coupon.totalPaise;

    return NextResponse.json(
      {
        success: true,
        currency: "INR",
        items: verified.items,
        subtotalPaise: verified.subtotalPaise,
        shippingPaise,
        discountPaise: coupon.discountPaise,
        couponCode: coupon.couponCode,
        totalPaise,
        freeShipping: SHIPPING_AMOUNT_PAISE === 0,
        paymentEnabled: true,
        orderCreated: false,
        message: "Order preview verified. Continue to secure payment when ready.",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    if (error instanceof CouponValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof CheckoutValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error("Checkout preview failed", error);

    return NextResponse.json(
      { error: "Unable to prepare checkout preview." },
      { status: 500 }
    );
  }
}
