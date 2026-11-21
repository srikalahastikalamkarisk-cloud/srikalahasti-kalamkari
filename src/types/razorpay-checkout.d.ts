type RazorpayPaymentResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

interface Window {
  Razorpay?: new (options: Record<string, unknown>) => {
    open(): void;
    on(event: "payment.failed", handler: () => void): void;
  };
}
