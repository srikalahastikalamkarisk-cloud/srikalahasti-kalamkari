import Link from "next/link";
import {
  Package, Layers3, Warehouse, ArrowUpRight,
  ShoppingBag, Users, IndianRupee, Plus,
  AlertTriangle, Sparkles, ShieldCheck,
  Clock3, Activity, ArrowRight
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;

  const [
    productCount,
    activeProducts,
    categoryCount,
    lowStockCount,
    recentProducts,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.category.count(),
    prisma.product.count({ where: { stock: { lte: 5 }, isActive: true } }),
    prisma.product.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        isActive: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  const metrics = [
    { title: "Total Products", value: productCount.toLocaleString("en-IN"), icon: Package, note: `${activeProducts} active products`, tone: "primary" },
    { title: "Categories", value: categoryCount.toLocaleString("en-IN"), icon: Layers3, note: "Catalog categories", tone: "standard" },
    { title: "Low Stock", value: lowStockCount.toLocaleString("en-IN"), icon: Warehouse, note: "5 or fewer units", tone: "standard" },
  ];

  return (
    <div className="skad-app">
      

      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb">
            <span>ADMINISTRATION</span>
            <span className="skad-breadcrumb-divider">/</span>
            <strong>Overview</strong>
          </div>
          <div className="skad-topbar-right">
            <span className="skad-topbar-status">
              <span className="skad-status-dot"/> LOCAL WORKSPACE
            </span>
            <div className="skad-avatar" aria-label="Administrator">
              {admin.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="skad-content">
          <section className="skad-welcome">
            <div>
              <div className="skad-eyebrow"><Sparkles size={15}/> YOUR HERITAGE BUSINESS</div>
              <h1>Welcome back, <em>{admin.name.split(" ")[0]}.</em></h1>
              <p>Manage your collections and keep your store beautifully organised.</p>
            </div>
            <Link href="/" className="skad-outline-action">
              View Storefront <ArrowUpRight size={17}/>
            </Link>
          </section>

          <section className="skad-hero">
            <div className="skad-hero-text">
              <div className="skad-hero-label"><span>✦</span> SRIKALAHASTI KALAMKARI</div>
              <h2>Crafted with heritage.<br/><em>Managed with excellence.</em></h2>
              <p>Your collections, inventory and business operations — thoughtfully brought together.</p>
              <span className="skad-hero-tag"><ShieldCheck size={15}/> SECURE ADMIN WORKSPACE</span>
            </div>
            <div className="skad-hero-art" aria-hidden="true">
              <span>✦</span>
            </div>
          </section>

          <div className="skad-section-heading">
            <div>
              <span className="skad-eyebrow">BUSINESS AT A GLANCE</span>
              <h2>Store overview</h2>
            </div>
            <span className="skad-live-label"><Activity size={15}/> Live database counts</span>
          </div>

          <section className="skad-metrics">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article className={`skad-metric ${metric.tone}`} key={metric.title}>
                  <div className="skad-metric-top">
                    <span>{metric.title}</span>
                    <div className="skad-metric-icon"><Icon size={20}/></div>
                  </div>
                  <strong>{metric.value}</strong>
                  <p>{metric.note}</p>
                </article>
              );
            })}
          </section>

          <section className="skad-secondary-metrics">
            <div><ShoppingBag size={19}/><span>Orders</span><strong>Not configured</strong></div>
            <div><IndianRupee size={19}/><span>Revenue</span><strong>Not configured</strong></div>
            <div><Users size={19}/><span>Customers</span><strong>Not configured</strong></div>
          </section>

          <div className="skad-dashboard-grid">
            <section className="skad-panel">
              <div className="skad-panel-heading">
                <div>
                  <span className="skad-eyebrow">CATALOG ACTIVITY</span>
                  <h2>Recently added products</h2>
                </div>
                <Package size={20}/>
              </div>

              {recentProducts.length === 0 ? (
                <div className="skad-empty">
                  <div className="skad-empty-icon"><Package size={27}/></div>
                  <h3>Your collection starts here</h3>
                  <p>No products in the database yet. Product management will be connected in the next phase.</p>
                </div>
              ) : (
                <div className="skad-table-scroll">
                  <table className="skad-table">
                    <thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>STOCK</th></tr></thead>
                    <tbody>
                      {recentProducts.map((product) => (
                        <tr key={product.id}>
                          <td><strong>{product.name}</strong></td>
                          <td>{product.category.name}</td>
                          <td>₹{Number(product.price).toLocaleString("en-IN")}</td>
                          <td>
                            <span className={`skad-stock ${product.stock <= 5 ? "is-low" : ""}`}>
                              {product.stock} units
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="skad-panel skad-actions-panel">
              <div className="skad-panel-heading">
                <div>
                  <span className="skad-eyebrow">YOUR WORKSPACE</span>
                  <h2>Quick access</h2>
                </div>
                <Plus size={20}/>
              </div>

              <Link href="/admin/team" className="skad-action-row">
                <span className="skad-action-icon"><Users size={20}/></span>
                <span><strong>Team Management</strong><small>Open existing team editor</small></span>
                <ArrowRight size={17}/>
              </Link>

              <Link href="/admin/products" className="skad-action-row">
                <span className="skad-action-icon"><Package size={20}/></span>
                <span><strong>Manage Products</strong><small>View and edit your product catalog</small></span>
                <ArrowRight size={17}/>
              </Link>

              <Link href="/admin/categories" className="skad-action-row">
                <span className="skad-action-icon"><Layers3 size={20}/></span>
                <span><strong>Manage Categories</strong><small>Manage categories and subcategories</small></span>
                <ArrowRight size={17}/>
              </Link>

              <div className="skad-action-row is-disabled">
                <span className="skad-action-icon"><Sparkles size={20}/></span>
                <span><strong>Video Stories</strong><small>Coming in the next phase</small></span>
                <Clock3 size={17}/>
              </div>
            </section>
          </div>

          {lowStockCount > 0 && (
            <div className="skad-alert">
              <AlertTriangle size={19}/>
              <span><strong>Inventory attention:</strong> {lowStockCount} active products have 5 or fewer units remaining.</span>
            </div>
          )}

          <footer className="skad-footer">
            <span>© Srikalahasti Kalamkari · Heritage Commerce</span>
            <span>ADMIN CONTROL CENTER <span className="skad-gold">✦</span></span>
          </footer>
        </div>
      </main>
    </div>
  );
}
