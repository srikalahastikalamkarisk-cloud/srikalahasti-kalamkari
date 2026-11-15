"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Search, UserRound, Heart, ShoppingBag,
  Menu, X, ChevronDown
} from "lucide-react";
import "./premium-header.css";

const categories = [
  { label: "Sarees", slug: "sarees" },
  { label: "Dupattas", slug: "dupattas" },
  { label: "Running Fabrics", slug: "running-fabrics" },
  { label: "Lehengas", slug: "lehengas" },
  { label: "Men's Wear", slug: "mens-wear" },
  { label: "Wall Paintings", slug: "wall-paintings" },
];

const otherLinks = [
  { label: "New Collections", href: "/collections" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function PremiumHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

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
            <span className="sk-brand-name">Srikalahasti</span>
            <span className="sk-brand-sub">KALAMKARI</span>
            <span className="sk-brand-caption">THE ART OF TIMELESS HERITAGE</span>
          </Link>

          <Link href="/" className="sk-center-logo" aria-label="Srikalahasti Kalamkari home">
            <Image
              src="/srikalahasti-logo.png"
              alt="Srikalahasti Kalamkari"
              width={94}
              height={94}
              priority
            />
          </Link>

          <div className="sk-actions">
            <form className="sk-search" action="/shop" role="search">
              <input
                type="search"
                name="q"
                aria-label="Search products"
                placeholder="Search Kalamkari..."
              />
              <button type="submit" aria-label="Search">
                <Search size={19} strokeWidth={1.7} />
              </button>
            </form>

            <Link href="/account" aria-label="My account" className="sk-icon">
              <UserRound size={22} strokeWidth={1.5} />
            </Link>
            <Link href="/wishlist" aria-label="Wishlist" className="sk-icon">
              <Heart size={22} strokeWidth={1.5} />
            </Link>
            <Link href="/cart" aria-label="Shopping bag" className="sk-icon">
              <ShoppingBag size={22} strokeWidth={1.5} />
            </Link>
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

        <nav className="sk-navigation" aria-label="Main navigation">
          <Link href="/">Home</Link>
          <div
            className="sk-shop"
            onMouseEnter={() => setShopOpen(true)}
            onMouseLeave={() => setShopOpen(false)}
          >
            <button
              type="button"
              aria-expanded={shopOpen}
              onClick={() => setShopOpen(!shopOpen)}
            >
              Shop <ChevronDown size={14} />
            </button>
            {shopOpen && (
              <div className="sk-dropdown">
                <span className="sk-dropdown-title">DISCOVER OUR CRAFT</span>
                <Link href="/shop" onClick={() => setShopOpen(false)}>
                  Shop All
                </Link>
                {categories.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/shop?category=${item.slug}`}
                    onClick={() => setShopOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {categories.map((item) => (
            <Link key={item.slug} href={`/shop?category=${item.slug}`}>
              {item.label}
            </Link>
          ))}
          {otherLinks.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </nav>

        {mobileOpen && (
          <nav className="sk-mobile-nav" aria-label="Mobile navigation">
            <Link href="/" onClick={() => setMobileOpen(false)}>Home</Link>
            <Link href="/shop" onClick={() => setMobileOpen(false)}>Shop All</Link>
            {categories.map((item) => (
              <Link
                key={item.slug}
                href={`/shop?category=${item.slug}`}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {otherLinks.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
    </>
  );
}
