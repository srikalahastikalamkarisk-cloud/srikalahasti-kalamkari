"use client";

import { whatsappUrl } from "@/data/store-contact";


import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search, UserRound, Heart, ShoppingBag,
  Menu, X, ChevronDown, ChevronRight, House, Grid2X2, ShoppingCart
} from "lucide-react";
import "./premium-header.css";
import { useShopState } from "@/lib/shop-state";
import type { PublicStoreSettings } from "@/lib/public-store-settings";


type HeaderCategory = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  children: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
  }[];
};

type HeaderProps = {
  categoriesFromDb?: HeaderCategory[];
  storeSettings?: Pick<PublicStoreSettings, "storeName" | "logoUrl" | "whatsappNumber"> | null;
  isAuthenticated?: boolean;
};

const otherLinks = [
  { label: "Collections", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function PremiumHeader({
  categoriesFromDb = [],
  storeSettings = null,
  isAuthenticated = false,
}: HeaderProps) {
  const storeName = storeSettings?.storeName || "Srikalahasti Kalamkari";
  const whatsappDigits = storeSettings?.whatsappNumber?.replace(/\D/g, "") || "";
  const contactWhatsApp = whatsappDigits.length >= 8
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent("Hello Srikalahasti Kalamkari, I would like to enquire about your products.")}`
    : whatsappUrl;
  const categories = categoriesFromDb.map(c => ({
    label: c.name,
    slug: c.slug,
  }));

  const dynamicMegaCategories = categoriesFromDb.map(c => ({
    label: c.name,
    slug: c.slug,
    image: c.image,
    subcategories: c.children.map(child => ({
      name: child.name,
      slug: child.slug,
      image: child.image,
    })),
  }));
  const { cart, wishlist } = useShopState();
  const pathname = usePathname();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlist.length;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("shop");
  const [selectedMega, setSelectedMega] = useState(0);
  const [hoveredMegaSub, setHoveredMegaSub] = useState<string | null>(null);
  const activeMega =
    dynamicMegaCategories[selectedMega] ??
    dynamicMegaCategories[0];
  const previewSub = activeMega?.subcategories.find(
    sub => sub.slug === hoveredMegaSub
  );
  const previewName = previewSub?.name ?? activeMega?.label ?? "";
  const previewImage = previewSub ? previewSub.image : activeMega?.image ?? null;
  const previewHref = activeMega
    ? previewSub
      ? `/${activeMega.slug}?subcategory=${encodeURIComponent(previewSub.slug)}`
      : `/${activeMega.slug}`
    : "/shop";

  const [mobileShopOpen, setMobileShopOpen] = useState(false);
  const [mobileCategory, setMobileCategory] = useState<number | null>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setMobileShopOpen(false);
        setMobileCategory(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <>
      <div className="sk-heritage-bar">
        <div className="sk-heritage-track">
          {[0, 1].map((copy) => (
            <div className="sk-heritage-set" key={copy} aria-hidden={copy === 1}>
              {[
                "THE ART OF SRIKALAHASTI",
                "HANDCRAFTED HERITAGE",
                "KALAMKARI, WOVEN WITH SOUL",
                "TIMELESS INDIAN ARTISTRY",
              ].map((message) => (
                <span key={message}>
                  <b>✦</b>{message}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <header className="sk-header">
        <div className="sk-header-main">
          <Link href="/" className="sk-brand">
            <span className="sk-brand-name" title={storeName}>
              {storeName === "Srikalahasti Kalamkari" ? <>Srikalahasti<span className="sk-brand-inline-kalamkari"> Kalamkari</span></> : storeName}
            </span>
            <span className="sk-brand-sub">KALAMKARI</span>
            <span className="sk-brand-caption">THE ART OF TIMELESS HERITAGE</span>
          </Link>
<div className="sk-left-search"><form className="sk-search" action="/shop" role="search">
              <input
                type="search"
                name="q"
                aria-label="Search products"
                placeholder="Search Kalamkari..."
              />
              <button type="submit" aria-label="Search">
                <Search size={19} strokeWidth={1.7} />
              </button>
            </form></div>


          <Link href="/" className="sk-center-logo" aria-label="Srikalahasti Kalamkari home">
            {storeSettings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storeSettings.logoUrl} alt={`${storeName} logo`} width={94} height={94} />
            ) : (
              <Image
                src="/srikalahasti-logo-optimized.webp"
                alt="Srikalahasti Kalamkari"
                width={94}
                height={94}
                priority
              />
            )}
          </Link>

          <div className="sk-actions">
            
            
            

            <Link href={isAuthenticated ? "/account" : "/login"} prefetch={false} aria-label={isAuthenticated ? "My account" : "Sign in to your account"} className="sk-icon">
              <UserRound size={22} strokeWidth={1.5} />
            </Link>
            <Link href="/wishlist" aria-label={`Wishlist, ${wishlistCount} saved products`} className="sk-icon sk-icon-counted">
              <Heart size={22} strokeWidth={1.5} />
              {wishlistCount > 0 && <span className="sk-icon-badge" aria-hidden="true">{wishlistCount > 99 ? "99+" : wishlistCount}</span>}
            </Link>
            <Link href="/cart" aria-label={`Shopping bag, ${cartCount} items`} className="sk-icon sk-icon-counted">
              <ShoppingBag size={22} strokeWidth={1.5} />
              {cartCount > 0 && <span className="sk-icon-badge" aria-hidden="true">{cartCount > 99 ? "99+" : cartCount}</span>}
            </Link>

            <a
              href={contactWhatsApp}
              className="sk-whatsapp-cta"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat with Srikalahasti Kalamkari on WhatsApp"
            >
              <span className="sk-wa-symbol" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"
                  width="19" height="19">
                  <path
                    d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20l1.2-4.1a8.5 8.5 0 1 1 15.8-4.4Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8.2 8.4c.2-.5.5-.5.8-.5h.5l1 2.2-.7.9c.8 1.5 1.8 2.5 3.4 3.2l.9-.8 2.2 1c0 .8-.5 1.4-1.4 1.6-2.5.4-6.8-3.8-7.1-6.3-.1-.5.1-1 .4-1.3Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span>WhatsApp Us</span>
              <span aria-hidden="true">↗</span>
            </a>

            <button
              type="button"
              className="sk-menu-toggle"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* SK CATEGORY NAV V3: one shared mega panel for SHOP and every top-level category */}
        <nav className="sk-navigation" aria-label="Main navigation"
          onMouseLeave={() => setShopOpen(false)}
          onKeyDown={(event) => { if (event.key === "Escape") setShopOpen(false); }}>
          <Link href="/" onMouseEnter={() => setShopOpen(false)}>Home</Link>
          <div className="sk-shop">
            <Link href="/shop" aria-expanded={shopOpen && activeNav === "shop"}
              aria-controls="sk-mega-menu" onMouseEnter={() => { setActiveNav("shop"); setShopOpen(true); }}
              onFocus={() => { setActiveNav("shop"); setShopOpen(true); }}
              onClick={() => setShopOpen(false)}>
              Shop <ChevronDown size={14}/>
            </Link>
          </div>
          {categories.map((item) => (
            <Link key={item.slug} href={`/${item.slug}`} className="sk-nav-category"
              aria-expanded={shopOpen && activeNav === item.slug}
              aria-controls="sk-mega-menu"
              onMouseEnter={() => {
                const index = dynamicMegaCategories.findIndex(x => x.slug === item.slug);
                if (index !== -1) { setSelectedMega(index); setHoveredMegaSub(null); setActiveNav(item.slug); setShopOpen(true); }
              }}
              onFocus={() => {
                const index = dynamicMegaCategories.findIndex(x => x.slug === item.slug);
                if (index !== -1) { setSelectedMega(index); setHoveredMegaSub(null); setActiveNav(item.slug); setShopOpen(true); }
              }}
              onClick={() => setShopOpen(false)}>
              {item.label} <ChevronDown size={12}/>
            </Link>
          ))}
          {otherLinks.map((item) => (
            <Link key={item.href} href={item.href} onMouseEnter={() => setShopOpen(false)}>{item.label}</Link>
          ))}
          {shopOpen && activeMega && <div id="sk-mega-menu" className="sk-mega" onMouseEnter={() => setShopOpen(true)}>
            <div className="sk-mega-inner">
              <div className="sk-mega-sidebar">
                <span className="sk-mega-eyebrow">DISCOVER OUR CRAFT</span>
                {dynamicMegaCategories.map((item,i) => <button key={item.slug} type="button"
                  className={selectedMega===i ? "active" : ""}
                  onMouseEnter={() => { setSelectedMega(i); setHoveredMegaSub(null); }}
                  onFocus={() => { setSelectedMega(i); setHoveredMegaSub(null); }}
                  onClick={() => { setSelectedMega(i); setHoveredMegaSub(null); }} aria-pressed={selectedMega===i}>
                  {item.label}<ChevronRight size={15}/>
                </button>)}
                <Link href="/shop" onClick={() => setShopOpen(false)} className="sk-mega-all">Explore all products ↗</Link>
              </div>
              <div className="sk-mega-content">
                <div className="sk-mega-content-head"><div>
                  <span className="sk-mega-eyebrow">HANDCRAFTED HERITAGE</span>
                  <h3>{activeMega.label}</h3>
                </div><Link href={`/${activeMega.slug}`} onClick={() => setShopOpen(false)}>
                  SHOP ALL {activeMega.label.toUpperCase()} ↗</Link></div>
                <div className="sk-mega-subgrid">{activeMega.subcategories.map(sub =>
                  <Link key={sub.slug} href={`/${activeMega.slug}?subcategory=${encodeURIComponent(sub.slug)}`}
                    onMouseEnter={() => setHoveredMegaSub(sub.slug)}
                    onFocus={() => setHoveredMegaSub(sub.slug)}
                    onClick={() => setShopOpen(false)}
                    className="sk-mega-sub">
                    <span>{sub.name}</span>
                    <ChevronRight size={14} aria-hidden="true"/>
                  </Link>)}</div>
              </div>
              <Link className="sk-mega-feature" href={previewHref}
                onClick={() => setShopOpen(false)}>
                <div className="sk-mega-feature-art">
                  {previewImage ? (
                    <img src={previewImage} alt={previewName}/>
                  ) : (
                    <div className="sk-mega-preview-placeholder">
                      <strong>{previewName}</strong>
                      <small>THE ART OF KALAMKARI</small>
                    </div>
                  )}
                </div>
                <span className="sk-mega-feature-bottom">
                  Explore {previewName}<ChevronRight size={16}/>
                </span>
              </Link>
            </div>
          </div>}
        </nav>
        {mobileOpen && (
          <nav className="sk-mobile-nav" aria-label="Mobile navigation" onKeyDown={(event) => { if (event.key === "Escape") { setMobileOpen(false); setMobileShopOpen(false); setMobileCategory(null); } }}>
            <form className="sk-mobile-search" action="/shop" role="search"><input id="sk-mobile-search-input" type="search" name="q" aria-label="Search products" placeholder="Search Kalamkari..."/><button type="submit" aria-label="Search"><Search size={18}/></button></form>
            <Link href="/shop" onClick={() => setMobileOpen(false)}>Shop All Products</Link>
            <Link href="/" onClick={() => setMobileOpen(false)}>Home</Link>
            <button type="button" className="sk-mobile-shop-toggle" aria-expanded={mobileShopOpen} onClick={() => setMobileShopOpen(v=>!v)}>Shop Collections <ChevronDown size={16}/></button>
            {mobileShopOpen && <div className="sk-mobile-mega"><Link href="/shop" onClick={() => setMobileOpen(false)}>Shop All</Link>{dynamicMegaCategories.map((item,i)=><div key={item.slug}><div className="sk-mobile-category-row"><Link href={`/${item.slug}`} onClick={()=>setMobileOpen(false)}>{item.label}</Link><button type="button" aria-label={`Show ${item.label} subcategories`} onClick={()=>setMobileCategory(v=>v===i?null:i)} aria-expanded={mobileCategory===i}><ChevronDown size={15}/></button></div>{mobileCategory===i && <div className="sk-mobile-subs"><Link href={`/${item.slug}`} onClick={()=>setMobileOpen(false)}>View all {item.label}</Link>{item.subcategories.map(sub=><Link key={sub.slug} href={`/${item.slug}?subcategory=${encodeURIComponent(sub.slug)}`} onClick={()=>setMobileOpen(false)}>{sub.name}</Link>)}</div>}</div>)}</div>}
            {otherLinks.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <nav className="sk-bottom-dock sk-luxury-dock"
        aria-label="Mobile quick navigation">

        <Link href="/"
          className={`sk-dock-link ${pathname === "/" && !mobileOpen ? "is-active" : ""}`}
          aria-current={pathname === "/" ? "page" : undefined}
          onClick={() => setMobileOpen(false)}>
          <span className="sk-dock-icon-wrap">
            <House size={25} strokeWidth={1.65}/>
          </span>
          <span className="sk-dock-label">Home</span>
        </Link>

        <Link href="/shop"
          className={`sk-dock-link ${pathname === "/shop" && !mobileOpen ? "is-active" : ""}`}
          aria-current={pathname === "/shop" ? "page" : undefined}
          onClick={() => setMobileOpen(false)}>
          <span className="sk-dock-icon-wrap">
            <ShoppingBag size={25} strokeWidth={1.65}/>
          </span>
          <span className="sk-dock-label">Shop</span>
        </Link>

        <button type="button"
          className={`sk-dock-link sk-dock-collections ${mobileOpen || categories.some(c => pathname === `/${c.slug}`) ? "is-active" : ""}`}
          aria-expanded={mobileOpen && mobileShopOpen}
          onClick={() => {
            const opening = !(mobileOpen && mobileShopOpen);
            setMobileOpen(opening);
            setMobileShopOpen(opening);
            setMobileCategory(null);
          }}>
          <span className="sk-dock-icon-wrap">
            <Grid2X2 size={25} strokeWidth={1.65}/>
          </span>
          <span className="sk-dock-label">Collections</span>
        </button>

        <Link href="/cart"
          className={`sk-dock-link ${pathname.startsWith("/cart") && !mobileOpen ? "is-active" : ""}`}
          aria-current={pathname === "/cart" ? "page" : undefined}
          onClick={() => setMobileOpen(false)}>
          <span className="sk-dock-icon-wrap">
            <ShoppingCart size={25} strokeWidth={1.65}/>
            {cartCount > 0 && (
              <span className="sk-dock-count">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </span>
          <span className="sk-dock-label">Cart</span>
        </Link>

        <Link href={isAuthenticated ? "/account" : "/login"}
          prefetch={false}
          className={`sk-dock-link ${["/login", "/register", "/forgot-password", "/account"].some(p => pathname.startsWith(p)) && !mobileOpen ? "is-active" : ""}`}
          aria-current={pathname === "/account" ? "page" : undefined}
          onClick={() => setMobileOpen(false)}>
          <span className="sk-dock-icon-wrap">
            <UserRound size={25} strokeWidth={1.65}/>
          </span>
          <span className="sk-dock-label">Profile</span>
        </Link>

      </nav>
    </>
  );
}
