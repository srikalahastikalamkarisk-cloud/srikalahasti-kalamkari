"use client";

import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, Layers3, Warehouse,
  ShoppingBag, Users, Images, Clapperboard,
  Star, TicketPercent, Settings, Palette, LogOut,
  PanelLeftClose, PanelLeftOpen, Menu, X,
  ExternalLink, ShieldCheck, BookOpen, Plus
} from "lucide-react";
import "./admin-dashboard.css";

const sections = [
  {
    label: "OVERVIEW",
    items: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard, ready: true },
    ],
  },
  {
    label: "STORE MANAGEMENT",
    items: [
      { name: "Products", href: "/admin/products", icon: Package, ready: true },
      { name: "Bulk Import", href: "/admin/products/import", icon: Package, ready: true },
      { name: "Categories", href: "/admin/categories", icon: Layers3, ready: true },
      { name: "Inventory", href: "/admin/inventory", icon: Warehouse, ready: true },
      { name: "Orders", href: "/admin/orders", icon: ShoppingBag, ready: true },
      { name: "Customers", href: "/admin/customers", icon: Users, ready: true },
      { name: "Media Library", href: "/admin/media", icon: Images, ready: true },
    ],
  },
  {
    label: "CONTENT & MARKETING",
    items: [
      { name: "Hero Slider", href: "/admin/hero", icon: Images, ready: true },
      { name: "About Kalamkari", href: "/admin/about-kalamkari", icon: BookOpen, ready: true },
      { name: "About Page Management", href: "/admin/about-page", icon: BookOpen, ready: true },
      { name: "Video Stories", href: "/admin/videos", icon: Clapperboard, ready: true },
      { name: "Customer Gallery", href: "/admin/gallery", icon: Images, ready: true },
      { name: "Reviews", href: "/admin/reviews", icon: Star, ready: true },
      { name: "Coupons", href: "/admin/coupons", icon: TicketPercent, ready: true },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { name: "Store Settings", href: "/admin/settings", icon: Settings, ready: true },
      { name: "Appearance & Themes", href: "/admin/appearance", icon: Palette, ready: true },
    ],
  },
];

function AdminNavigationStatus() {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <span
      className="skad-navigation-spinner"
      role="status"
      aria-label="Opening page"
    />
  );
}

const priorityRoutes = new Set([
  "/admin",
  "/admin/products",
  "/admin/categories",
  "/admin/orders",
]);

const mobileDockItems = [
  {
    name: "Home",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    name: "Products",
    href: "/admin/products",
    icon: Package,
  },
  {
    name: "Add",
    href: "/admin/products/new",
    icon: Plus,
  },
  {
    name: "Orders",
    href: "/admin/orders",
    icon: ShoppingBag,
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error();
      window.location.replace("/admin/login");
    } catch {
      setLoggingOut(false);
      alert("Logout failed. Please try again.");
    }
  }

  return (
    <>
      <button
        className="skad-mobile-trigger"
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open admin menu"
        aria-expanded={mobileOpen}
      >
        <Menu size={21} />
      </button>

      {mobileOpen && (
        <button
          className="skad-overlay"
          aria-label="Close admin menu"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={[
        "skad-sidebar",
        collapsed ? "is-collapsed" : "",
        mobileOpen ? "is-open" : "",
      ].join(" ")}>
        <div className="skad-brand">
          <span className="skad-brand-mark">
            <img
              src="/intro/heritage-logo-optimized.webp"
              alt="Srikalahasti Kalamkari"
              className="skad-brand-logo"
            />
          </span>
          <div className="skad-brand-copy">
            <strong>SRIKALAHASTI</strong>
            <small>KALAMKARI · ADMIN</small>
          </div>
          <button
            type="button"
            className="skad-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}
          </button>
          <button
            type="button"
            className="skad-mobile-close"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X size={19}/>
          </button>
        </div>

        <div className="skad-store-status">
          <span className="skad-status-dot"/>
          <span>STORE ADMINISTRATION</span>
          <ShieldCheck size={15}/>
        </div>

        <nav className="skad-nav" aria-label="Admin navigation">
          {sections.map((section) => (
            <div className="skad-nav-section" key={section.label}>
              <p className="skad-nav-heading">{section.label}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                if (!item.ready) {
                  return (
                    <span
                      key={item.href}
                      className="skad-nav-link is-pending"
                      title={`${item.name} — coming soon`}
                    >
                      <Icon size={18}/>
                      <span className="skad-nav-name">{item.name}</span>
                      <small className="skad-coming">SOON</small>
                    </span>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={priorityRoutes.has(item.href) ? null : false}
                    aria-current={active ? "page" : undefined}
                    className={`skad-nav-link ${active ? "is-active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                    title={item.name}
                  >
                    <Icon size={18}/>
                    <span className="skad-nav-name">{item.name}</span>
                    {active && <span className="skad-active-dot"/>}
                    <AdminNavigationStatus />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="skad-sidebar-footer">
          <Link href="/" className="skad-nav-link">
            <ExternalLink size={18}/>
            <span className="skad-nav-name">View Storefront</span>
          </Link>
          <button
            type="button"
            className="skad-nav-link skad-logout"
            disabled={loggingOut}
            onClick={logout}
          >
            <LogOut size={18}/>
            <span className="skad-nav-name">
              {loggingOut ? "Logging out..." : "Logout"}
            </span>
          </button>
        </div>
      </aside>

      <nav
        className="skad-mobile-dock"
        aria-label="Quick admin navigation"
      >
        {mobileDockItems.map(item => {
          const Icon = item.icon;
          const isAdd = item.name === "Add";

          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : item.href === "/admin/products"
                ? (
                    pathname === item.href ||
                    (
                      pathname.startsWith(item.href + "/") &&
                      pathname !== "/admin/products/new"
                    )
                  )
                : (
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/")
                  );

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={priorityRoutes.has(item.href) ? null : false}
              aria-current={active ? "page" : undefined}
              aria-label={isAdd ? "Add new product" : item.name}
              className={[
                "skad-dock-item",
                active ? "is-active" : "",
                isAdd ? "is-add" : "",
              ].join(" ")}
              onClick={() => setMobileOpen(false)}
            >
              <span className="skad-dock-icon">
                <Icon
                  size={22}
                  strokeWidth={1.8}
                />
              </span>

              <span className="skad-dock-label">
                {item.name}
              </span>

              <AdminNavigationStatus />
            </Link>
          );
        })}

        <button
          type="button"
          className={`skad-dock-item ${mobileOpen ? "is-active" : ""}`}
          aria-label="Open complete admin menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(value => !value)}
        >
          <span className="skad-dock-icon">
            <Menu size={22} strokeWidth={1.8} />
          </span>
          <span className="skad-dock-label">Menu</span>
        </button>
      </nav>
    </>
  );
}
