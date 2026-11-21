"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { mainNavigation, shopCategories } from "@/data/navigation";

type IconName = "search" | "user" | "heart" | "bag" | "menu" | "close" | "chevron";
function Icon({ name }: { name: IconName }) {
  const paths = {
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
    heart: <path d="M20.8 8.3c0 4.3-8.8 10-8.8 10s-8.8-5.7-8.8-10a5 5 0 0 1 8.8-3.2 5 5 0 0 1 8.8 3.2Z"/>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    chevron: <path d="m6 9 6 6 6-6"/>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const ticker = ["THE ART OF SRIKALAHASTI", "HANDCRAFTED HERITAGE", "TIMELESS INDIAN ARTISTRY", "KALAMKARI, WOVEN WITH SOUL"];
export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  return <header className="site-header">
    <div className="announcement" aria-label="Our heritage"><div className="announcement-track">{[0,1].map(i=><div className="announcement-set" key={i} aria-hidden={i===1}>{ticker.map(t=><span key={t}><b>✦</b>{t}</span>)}</div>)}</div></div>
    <div className="header-shell">
      <Link className="brand" href="/" aria-label="Srikalahasti Kalamkari home">
        <Image src="/srikalahasti-logo.png" width={78} height={78} alt="Srikalahasti Kalamkari royal emblem" priority />
        <span className="brand-type"><strong>SRIKALAHASTI</strong><small>KALAMKARI</small></span>
      </Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        {mainNavigation.map(item => item.label === "Shop" ? <div className="shop-wrap" key={item.label} onMouseEnter={()=>setShopOpen(true)} onMouseLeave={()=>setShopOpen(false)}>
          <button type="button" className="nav-link shop-trigger" aria-expanded={shopOpen} aria-controls="shop-mega" onClick={()=>setShopOpen(!shopOpen)}>SHOP <Icon name="chevron"/></button>
          {shopOpen && <div className="shop-dropdown" id="shop-mega"><span className="dropdown-heading">EXPLORE OUR CRAFT</span><div className="category-grid">{shopCategories.map(c=><Link key={c.slug} href={`/shop?category=${encodeURIComponent(c.slug)}`} onClick={()=>setShopOpen(false)}>{c.label}<span>↗</span></Link>)}</div><Link className="view-all" href="/shop" onClick={()=>setShopOpen(false)}>VIEW ALL COLLECTIONS →</Link></div>}
        </div> : <Link key={item.label} className="nav-link" href={item.href}>{item.label.toUpperCase()}</Link>)}
      </nav>
      <div className="header-actions">
        <form className="header-search" action="/shop" role="search"><label className="sr-only" htmlFor="site-search">Search products</label><input id="site-search" type="search" name="q" placeholder="Search Kalamkari..."/><button type="submit" aria-label="Search"><Icon name="search"/></button></form>
        <Link className="action-icon" href="/account" aria-label="My account"><Icon name="user"/></Link>
        <Link className="action-icon" href="/wishlist" aria-label="Wishlist"><Icon name="heart"/></Link>
        <Link className="action-icon" href="/cart" aria-label="Cart"><Icon name="bag"/><span className="cart-count">0</span></Link>
        <button type="button" className="action-icon mobile-toggle" aria-label={mobileOpen?"Close menu":"Open menu"} aria-expanded={mobileOpen} onClick={()=>setMobileOpen(!mobileOpen)}><Icon name={mobileOpen?"close":"menu"}/></button>
      </div>
    </div>
    {mobileOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{mainNavigation.map(item=><Link key={item.href} href={item.href} onClick={()=>setMobileOpen(false)}>{item.label}</Link>)}<div className="mobile-category-title">SHOP BY CATEGORY</div><div className="mobile-categories">{shopCategories.map(c=><Link key={c.slug} href={`/shop?category=${encodeURIComponent(c.slug)}`} onClick={()=>setMobileOpen(false)}>{c.label}</Link>)}</div></nav>}
  </header>;
}
