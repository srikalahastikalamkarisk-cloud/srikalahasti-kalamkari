import Link from "next/link";
import { ShoppingBag, ArrowRight, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import "./orders.css";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
const orderStatuses = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);

function dateBound(value: string | undefined, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const orderStatus = typeof params.status === "string" && orderStatuses.includes(params.status) ? params.status : "all";
  const showCancelled = params.cancelled === "show";
  const paymentStatus = params.payment === "PAID" || params.payment === "UNPAID" ? params.payment : "all";
  const from = typeof params.from === "string" ? params.from : "";
  const to = typeof params.to === "string" ? params.to : "";
  const page = Math.max(1, Math.min(100000, Number(params.page) || 1));
  const createdAt = {
    ...(dateBound(from) ? { gte: dateBound(from) } : {}),
    ...(dateBound(to, true) ? { lte: dateBound(to, true) } : {}),
  };

  const where: Prisma.OrderWhereInput = {
    ...(q ? { OR: [
      { orderNumber: { contains: q } },
      { customerName: { contains: q } },
      { customerEmail: { contains: q } },
      { customerPhone: { contains: q } },
    ] } : {}),
    ...(orderStatus !== "all" ? { orderStatus } : (!showCancelled ? {
      AND: [{
        OR: [
          { orderStatus: { not: "CANCELLED" } },
          { orderStatus: "CANCELLED", paymentStatus: "PAID" },
        ],
      }],
    } : {})),
    ...(paymentStatus !== "all" ? { paymentStatus } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };

  const [orders, total, pendingOrders, paidOrders] = await Promise.all([
    prisma.order.findMany({
      where,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        totalAmount: true,
        orderStatus: true,
        paymentStatus: true,
        inventoryStatus: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { orderStatus: "PENDING" } }),
    prisma.order.count({ where: { paymentStatus: "PAID" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(nextPage: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (showCancelled) next.set("cancelled", "show");
    if (orderStatus !== "all") next.set("status", orderStatus);
    if (paymentStatus !== "all") next.set("payment", paymentStatus);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    next.set("page", String(nextPage));
    return `/admin/orders?${next.toString()}`;
  }

  return (
    <div className="skad-app">
      
      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb"><span>STORE MANAGEMENT</span><span className="skad-breadcrumb-divider">/</span><strong>Orders</strong></div>
          <div className="skad-topbar-right"><span className="skad-topbar-status"><span className="skad-status-dot" />ADMIN WORKSPACE</span></div>
        </header>
        <div className="skad-content skorders-content">
          <div className="skorders-heading"><div><span className="skad-eyebrow">STORE OPERATIONS</span><h1>Order Management</h1><p>Search, filter, and track customer order fulfilment.</p></div></div>
          <div className="skorders-stats">
            <article><span>Matching Orders</span><strong>{total}</strong></article>
            <article><span>Pending Order Records</span><strong>{pendingOrders}</strong></article>
            <article><span>Paid Orders</span><strong>{paidOrders}</strong></article>
          </div>
          <section className="skorders-panel">
            <div className="skorders-panel-heading"><div><span className="skad-eyebrow">ORDER RECORDS</span><h2>Orders</h2></div><span className="skorders-count">{total} matching</span></div>
            <nav aria-label="Quick order filters"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                margin: "12px 0 18px",
              }}>
              {[
                ["All Orders", "/admin/orders"],
                ["Paid Orders", "/admin/orders?payment=PAID"],
                ["Incomplete Checkouts", "/admin/orders?status=PENDING&payment=UNPAID"],
                ["Cancelled Orders", "/admin/orders?status=CANCELLED&cancelled=show"],
                ["Payment Review", "/admin/orders?status=CANCELLED&payment=PAID&cancelled=show"],
              ].map(([label, href]) => (
                <Link key={href} href={href}
                  className="skorders-view"
                  style={{
                    padding: "9px 13px",
                    border: "1px solid var(--skad-border)",
                    borderRadius: 8,
                  }}>
                  {label}
                </Link>
              ))}
            </nav>
            <form className="skorders-filters" method="get">
              <label className="skorders-search"><Search size={16}/><input name="q" defaultValue={q} placeholder="Order number, customer, email or phone" /></label>
              <select name="status" defaultValue={orderStatus} aria-label="Filter order status"><option value="all">All order statuses</option>{orderStatuses.map(status => <option key={status}>{status}</option>)}</select>
              <label><input type="checkbox" name="cancelled" value="show" defaultChecked={showCancelled} /> Include cancelled</label>
              <select name="payment" defaultValue={paymentStatus} aria-label="Filter payment status"><option value="all">All payment statuses</option><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option></select>
              <label>From <input type="date" name="from" defaultValue={from} /></label>
              <label>To <input type="date" name="to" defaultValue={to} /></label>
              <button type="submit">Apply filters</button>
              <Link href="/admin/orders">Clear</Link>
            </form>
            {orders.length === 0 ? (
              <div className="skorders-empty"><div className="skorders-empty-icon"><ShoppingBag size={29}/></div><h3>No orders found</h3><p>Try changing the search, status, or date range.</p></div>
            ) : (
              <div className="skorders-table-wrap">
                <table className="skorders-table">
                  <thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th><th>ORDER STATUS</th><th>PAYMENT</th><th>INVENTORY</th><th>DETAILS</th></tr></thead>
                  <tbody>{orders.map(order => <tr key={order.id}>
                    <td data-label="Order"><strong>{order.orderNumber}</strong><small>{order.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</small></td>
                    <td data-label="Customer"><strong>{order.customerName}</strong><small>{order.customerPhone}</small></td>
                    <td data-label="Items">{order._count.items}</td>
                    <td data-label="Total">{money(Number(order.totalAmount))}</td>
                    <td data-label="Order status"><span className="skorders-status">{
                      order.orderStatus === "CANCELLED" &&
                      order.paymentStatus === "PAID"
                        ? "PAYMENT REVIEW"
                        : order.orderStatus === "PENDING" &&
                          order.paymentStatus === "UNPAID"
                          ? "INCOMPLETE CHECKOUT"
                          : order.orderStatus
                    }</span></td>
                    <td data-label="Payment"><span className="skorders-status">{order.paymentStatus}</span></td>
                    <td data-label="Inventory"><span className="skorders-status">{order.inventoryStatus}</span></td>
                    <td data-label="Details"><Link href={`/admin/orders/${order.id}`} className="skorders-view">View <ArrowRight size={15}/></Link></td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
            <div className="skorders-pagination"><span>Page {Math.min(page, pageCount)} of {pageCount}</span><div>{page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}{page < pageCount && <Link href={pageHref(page + 1)}>Next</Link>}</div></div>
          </section>
        </div>
      </main>
    </div>
  );
}
