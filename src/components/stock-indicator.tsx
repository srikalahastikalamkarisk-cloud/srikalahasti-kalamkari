type Props = {
  stock: number;
  status: string;
  requiresOptions?: boolean;
  perMeter?: boolean;
};

export default function StockIndicator({
  stock,
  status,
  requiresOptions = false,
  perMeter = false,
}: Props) {
  let label: string;
  let tone: string;

  const available = Math.max(0, Math.floor(stock));
  const unit = perMeter
    ? available === 1 ? "meter" : "meters"
    : available === 1 ? "piece" : "pieces";

  if (status === "COMING_SOON") {
    label = "Coming soon";
    tone = "neutral";
  } else if (status !== "IN_STOCK" || available === 0) {
    label = "Out of stock";
    tone = "out";
  } else if (requiresOptions) {
    label = "Select options to check availability";
    tone = "neutral";
  } else if (available === 1) {
    label = `Only 1 ${unit} left — Grab it now!`;
    tone = "urgent";
  } else if (available === 2) {
    label = `Only 2 ${unit} left — Grab yours!`;
    tone = "urgent";
  } else if (available <= 5) {
    label = `Limited stock · Only ${available} ${unit} left`;
    tone = "limited";
  } else {
    label = "In stock · Ready to order";
    tone = "available";
  }

  return (
    <span className={`sk-stock-indicator sk-stock-indicator--${tone}`}>
      <span className="sk-stock-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
