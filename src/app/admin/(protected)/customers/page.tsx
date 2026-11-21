import Link from "next/link";
import { Users, Search, ArrowRight } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import "./customers.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const rawPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(rawPage)
    ? Math.max(1, Math.min(100000, rawPage))
    : 1;

  // Customer identities are normalized email addresses.
  // All grouping, search, totals and pagination execute in MySQL.
  // Only the current page and its recent order history reach Node.js.
  type CustomerRow = {
    email: string;
    name: string;
    phone: string;
    orders: bigint | number;
    paidOrders: bigint | number;
    spent: string | number;
    lastOrder: Date;
  };

  type CountRow = { total: bigint | number; paidOrders: bigint | number };

  type RecentOrderRow = {
    id: string;
    orderNumber: string;
    customerEmail: string;
    createdAt: Date;
  };

  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;

  const [summary] = await prisma.$queryRaw<CountRow[]>`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(paidOrders), 0) AS paidOrders
    FROM (
      SELECT
        LOWER(TRIM(customerEmail)) AS email,
        SUM(CASE WHEN paymentStatus = 'PAID' THEN 1 ELSE 0 END) AS paidOrders
      FROM \`Order\`
      WHERE TRIM(customerEmail) <> ''
      GROUP BY LOWER(TRIM(customerEmail))
    ) customers
  `;

  const allCustomerCount = Number(summary?.total ?? 0);
  const allPaidOrders = Number(summary?.paidOrders ?? 0);

  const [matchingCount] = await prisma.$queryRaw<
    Array<{ total: bigint | number }>
  >`
    SELECT COUNT(*) AS total
    FROM (
      SELECT
        LOWER(TRIM(customerEmail)) AS email
      FROM \`Order\`
      WHERE TRIM(customerEmail) <> ''
      GROUP BY LOWER(TRIM(customerEmail))
    ) c
    JOIN \`Order\` latest
      ON latest.id = (
        SELECT o2.id
        FROM \`Order\` o2
        WHERE LOWER(TRIM(o2.customerEmail)) = c.email
        ORDER BY o2.createdAt DESC, o2.id DESC
        LIMIT 1
      )
    WHERE (
      ${q} = ''
      OR c.email LIKE ${pattern}
      OR latest.customerName LIKE ${pattern}
      OR latest.customerPhone LIKE ${pattern}
    )
  `;

  const total = Number(matchingCount?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const customerRows = await prisma.$queryRaw<CustomerRow[]>`
    SELECT
      c.email,
      latest.customerName AS name,
      latest.customerPhone AS phone,
      c.orders,
      c.paidOrders,
      c.spent,
      c.lastOrder
    FROM (
      SELECT
        LOWER(TRIM(customerEmail)) AS email,
        COUNT(*) AS orders,
        SUM(CASE WHEN paymentStatus = 'PAID' THEN 1 ELSE 0 END) AS paidOrders,
        COALESCE(SUM(
          CASE WHEN paymentStatus = 'PAID' THEN totalAmount ELSE 0 END
        ), 0) AS spent,
        MAX(createdAt) AS lastOrder
      FROM \`Order\`
      WHERE TRIM(customerEmail) <> ''
      GROUP BY LOWER(TRIM(customerEmail))
    ) c
    JOIN \`Order\` latest
      ON latest.id = (
        SELECT o2.id
        FROM \`Order\` o2
        WHERE LOWER(TRIM(o2.customerEmail)) = c.email
        ORDER BY o2.createdAt DESC, o2.id DESC
        LIMIT 1
      )
    WHERE (
      ${q} = ''
      OR c.email LIKE ${pattern}
      OR latest.customerName LIKE ${pattern}
      OR latest.customerPhone LIKE ${pattern}
    )
    ORDER BY c.lastOrder DESC, c.email ASC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `;

  const recentOrders = customerRows.length
    ? await prisma.$queryRaw<RecentOrderRow[]>`
        SELECT id, orderNumber, customerEmail, createdAt
        FROM (
          SELECT
            id,
            orderNumber,
            customerEmail,
            createdAt,
            ROW_NUMBER() OVER (
              PARTITION BY LOWER(TRIM(customerEmail))
              ORDER BY createdAt DESC, id DESC
            ) AS rn
          FROM \`Order\`
          WHERE LOWER(TRIM(customerEmail)) IN (
            ${Prisma.join(customerRows.map(row => row.email))}
          )
        ) ranked
        WHERE rn <= 3
        ORDER BY createdAt DESC, id DESC
      `
    : [];

  const customers = customerRows.map(row => ({
    email: row.email,
    name: row.name,
    phone: row.phone,
    orders: Number(row.orders),
    paidOrders: Number(row.paidOrders),
    spent: Number(row.spent),
    lastOrder: row.lastOrder,
    recentOrders: recentOrders
      .filter(order =>
        order.customerEmail.trim().toLowerCase() === row.email
      )
      .map(order => ({
        id: order.id,
        number: order.orderNumber,
        date: order.createdAt,
        paid: false,
      })),
  }));

  function pageHref(nextPage: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    search.set("page", String(nextPage));
    return `/admin/customers?${search.toString()}`;
  }

  return (
    <div className="skad-app">
      
      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb">
            <span>STORE MANAGEMENT</span>
            <span className="skad-breadcrumb-divider">/</span>
            <strong>Customers</strong>
          </div>
          <div className="skad-topbar-right">
            <span className="skad-topbar-status">
              <span className="skad-status-dot" />
              ADMIN WORKSPACE
            </span>
          </div>
        </header>

        <div className="skad-content skcustomers-content">
          <div className="skcustomers-heading">
            <span className="skad-eyebrow">STORE OPERATIONS</span>
            <h1>Customer Management</h1>
            <p>View customers and their order history.</p>
          </div>

          <div className="skcustomers-stats">
            <article>
              <span>Total Customers</span>
              <strong>{allCustomerCount}</strong>
            </article>
            <article>
              <span>Matching Customers</span>
              <strong>{total}</strong>
            </article>
            <article>
              <span>Paid Orders</span>
              <strong>{allPaidOrders}</strong>
            </article>
          </div>

          <section className="skcustomers-panel">
            <div className="skcustomers-panel-heading">
              <div>
                <span className="skad-eyebrow">CUSTOMER RECORDS</span>
                <h2>Customers</h2>
              </div>
              <span>{total} matching</span>
            </div>

            <form className="skcustomers-filters" method="get">
              <label>
                <Search size={17} />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search name, email or phone"
                />
              </label>
              <button type="submit">Search</button>
              <Link href="/admin/customers">Clear</Link>
            </form>

            {customers.length === 0 ? (
              <div className="skcustomers-empty">
                <Users size={30} />
                <h3>No customers found</h3>
                <p>Customers appear here after placing an order.</p>
              </div>
            ) : (
              <div className="skcustomers-table-wrap">
                <table className="skcustomers-table">
                  <thead>
                    <tr>
                      <th>CUSTOMER</th>
                      <th>PHONE</th>
                      <th>ORDERS</th>
                      <th>PAID SPENDING</th>
                      <th>LAST ORDER</th>
                      <th>ORDER HISTORY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map(customer => (
                      <tr key={customer.email.toLowerCase()}>
                        <td>
                          <strong>{customer.name}</strong>
                          <small>{customer.email}</small>
                        </td>
                        <td>{customer.phone}</td>
                        <td>{customer.orders}</td>
                        <td>{money(customer.spent)}</td>
                        <td>
                          {customer.lastOrder.toLocaleDateString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })}
                        </td>
                        <td>
                          <div className="skcustomers-history">
                            {customer.recentOrders.map(order => (
                              <Link
                                key={order.id}
                                href={`/admin/orders/${order.id}`}
                              >
                                {order.number}
                                <ArrowRight size={13} />
                              </Link>
                            ))}
                            {customer.orders > 3 && (
                              <small>Showing latest 3 of {customer.orders} orders</small>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="skcustomers-pagination">
              <span>Page {currentPage} of {pages}</span>
              <div>
                {currentPage > 1 && (
                  <Link href={pageHref(currentPage - 1)}>Previous</Link>
                )}
                {currentPage < pages && (
                  <Link href={pageHref(currentPage + 1)}>Next</Link>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
