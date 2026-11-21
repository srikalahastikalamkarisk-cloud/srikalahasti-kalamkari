"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, Layers3, Warehouse,
  ShoppingBag, Users, Images, Clapperboard,
  Star, TicketPercent, Settings, LogOut,
  PanelLeftClose, PanelLeftOpen, Menu, X,
  ExternalLink, ShieldCheck, BookOpen
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
      { name: "Team Management", href: "/admin/team", icon: Users, ready: true },
      { name: "Store Settings", href: "/admin/settings", icon: Settings, ready: true },
    ],
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
              src="/srikalahasti-logo.png"
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
                    className={`skad-nav-link ${active ? "is-active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                    title={item.name}
                  >
                    <Icon size={18}/>
                    <span className="skad-nav-name">{item.name}</span>
                    {active && <span className="skad-active-dot"/>}
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
    </>
  );
}
