"use client";

import { productWhatsApp } from "@/lib/product-whatsapp";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Search, SlidersHorizontal, X, ChevronRight, Heart, LayoutGrid, List, Sparkles, ZoomIn, ShoppingBag, Zap } from "lucide-react";
import type { StorefrontCatalogProduct } from "@/lib/storefront-products";
import { hasPurchasableInventory, productAvailabilityLabel } from "@/lib/storefront-product-policy";
import { buyNow, addToCart, toggleWishlist, useShopState } from "@/lib/shop-state";
import "./shop-catalog.css";

type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  children: DynamicSubcategory[];
};
const priceBands = [
  {label:"All prices", min:0, max:Infinity},
  {label:"Under ₹2,000", min:0, max:2000},
  {label:"₹2,000 – ₹5,000", min:2000, max:5000},
  {label:"₹5,000 – ₹10,000", min:5000, max:10000},
  {label:"Above ₹10,000", min:10000, max:Infinity},
];
const currency = (amount:number) => new Intl.NumberFormat("en-IN", {style:"currency",currency:"INR",maximumFractionDigits:0}).format(amount);

type DynamicSubcategory = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
};

type ShopCatalogProps = {
  whatsappNumber?: string | null;
  products?: StorefrontCatalogProduct[];
  totalProducts?: number;
  categorySlug?: string;
  categoryName?: string;
  subcategories?: DynamicSubcategory[];
  categories?: CatalogCategory[];
};

export default function ShopCatalog({
  categorySlug,
  categoryName,
  subcategories = [],
  categories = [],
  products = [],
  totalProducts = products.length,
  whatsappNumber,
}: ShopCatalogProps = {}) {
  const tabs = [
    { label: "All Pieces", slug: "all", match: "" },
    ...categories.map(c => ({
      label: c.name,
      slug: c.slug,
      match: c.name,
    })),
  ];
  const router = useRouter();
  const params = useSearchParams();
  const selected = categorySlug || params.get("category") || "all";
  const activeTab = tabs.find(t => t.slug === selected);
  const active = activeTab ||
    (categorySlug && categoryName
      ? { label: categoryName, slug: categorySlug, match: categoryName }
      : tabs[0]);
  const invalidCategory = selected !== "all" && !activeTab && !(categorySlug && categoryName);
  const subcategoryParam = params.get("subcategory") || "";
  const selectedSubcategory = categoryName
    ? subcategories.find(c =>
        c.slug === subcategoryParam || c.name === subcategoryParam
      )
    : undefined;
  const subcategory = selectedSubcategory?.name || subcategoryParam;
  const [search, setSearch] = useState(params.get("q") || "");
  const [sort, setSort] = useState("featured");
  const [band, setBand] = useState(0);
  const [availability, setAvailability] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"grid"|"list">("grid");
  const [page, setPage] = useState(1);
  const [catalogProducts, setCatalogProducts] = useState(products);
  const [totalItems, setTotalItems] = useState(totalProducts);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const subcategorySlug = selectedSubcategory?.slug || subcategoryParam;
  const queryKey = [active.slug, subcategorySlug, search.trim(), sort, band, availability, page].join("\u001f");
  const lastQueryKey = useRef(queryKey);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(params.get("q") || "");
      setPage(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [params]);
  useEffect(() => {
    if (lastQueryKey.current === queryKey) return;
    lastQueryKey.current = queryKey;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const query = new URLSearchParams();
      if (active.slug !== "all") query.set("category", active.slug);
      if (subcategorySlug) query.set("subcategory", subcategorySlug);
      if (search.trim()) query.set("q", search.trim());
      if (band > 0) {
        if (priceBands[band].min > 0) query.set("min", String(priceBands[band].min));
        if (Number.isFinite(priceBands[band].max)) query.set("max", String(priceBands[band].max));
      }
      if (availability === "priced") query.set("priced", "1");
      if (sort !== "featured") query.set("sort", sort);
      query.set("page", String(page));

      setLoadingProducts(true);
      try {
        const response = await fetch(`/api/storefront/catalog?${query}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Catalog request failed");
        const result = await response.json() as {
          products: StorefrontCatalogProduct[];
          total: number;
          page: number;
          pages: number;
        };
        setCatalogProducts(result.products);
        setTotalItems(result.total);
        if (result.page !== page) setPage(result.page);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Unable to update storefront catalog", error);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingProducts(false);
      }
    }, search.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active.slug, selectedSubcategory?.slug, subcategoryParam, search, band, availability, sort, page, queryKey, subcategorySlug]);
  const {wishlist: saved} = useShopState();
  const [quickView, setQuickView] = useState<string|null>(null);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [cartMessage,setCartMessage] = useState("");
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filterCloseRef = useRef<HTMLButtonElement | null>(null);
  const perPage = 12;
  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = filterTriggerRef.current;
    document.body.style.overflow = "hidden";
    filterCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      trigger?.focus();
    };
  }, [filtersOpen]);
  useEffect(() => {
    if (quickView === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickView(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [quickView]);
  const selectCategory = (slug:string) => {setPage(1);setFiltersOpen(false);router.push(slug === "all" ? "/shop" : `/${encodeURIComponent(slug)}`, {scroll:false});};
  const items = catalogProducts;
  const pages = Math.max(1,Math.ceil(totalItems/perPage));
  const pageNumbers = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter(value => value >= 1 && value <= pages)
    .sort((a, b) => a - b);
  const visible = items;
  const selectedCategory = categories.find(c => c.slug === active.slug);

  const menuChildren = selectedCategory?.children ?? subcategories;

  const menu = selectedCategory
    ? {
        slug: selectedCategory.slug,
        label: selectedCategory.name,
        subcategories: menuChildren.map(c => c.name),
      }
    : categoryName && categorySlug
      ? {
          slug: categorySlug,
          label: categoryName,
          subcategories: subcategories.map(c => c.name),
        }
      : undefined;
  const showCollections =
    active.slug !== "all" &&
    !invalidCategory &&
    !subcategoryParam &&
    !search.trim() &&
    menuChildren.length > 0;

  return <div className="skshop">
    <div className="skshop-intro"><div className="skshop-container"><div className="skshop-breadcrumb"><Link href="/">Home</Link><ChevronRight size={13}/><span>{active.slug === "all" ? "The Collection" : active.label}</span></div><div className="skshop-intro-row"><div><span className="skshop-eyebrow">✦ THE SRIKALAHASTI EDIT ✦</span><h1>{active.slug === "all" ? <>Discover <em>Timeless Artistry.</em></> : <>Shop <em>{active.label}</em></>}</h1><p>Hand-painted heritage. Thoughtfully made pieces to cherish for generations.</p></div><div className="skshop-intro-mark" aria-hidden="true">✳ <span>MADE BY HAND<br/>MADE TO BE TREASURED</span></div></div></div></div>
    <div className="skshop-container"><div className="skshop-category-zone"><div className="skshop-tabs" aria-label="Shop categories">{tabs.map(t=><button key={t.slug} className={active.slug===t.slug?"active":""} onClick={()=>selectCategory(t.slug)} type="button" aria-pressed={active.slug===t.slug}><span aria-hidden="true">✦</span>{t.label}</button>)}</div></div>
      <div className="skshop-layout"><aside id="shop-filters-drawer" role={filtersOpen?"dialog":undefined} aria-modal={filtersOpen?true:undefined} aria-label="Product filters" className={`skshop-sidebar ${filtersOpen?"is-open":""}`}><div className="skshop-sidebar-head"><div><span className="skshop-eyebrow">A CURATED SELECTION</span><h2>Refine your<br/><em>search</em></h2></div><button ref={filterCloseRef} type="button" className="skshop-close" onClick={()=>setFiltersOpen(false)} aria-label="Close filters"><X size={19}/></button></div><div className="skshop-filter-group"><h3>Collection</h3>{tabs.map(t=><button type="button" key={t.slug} className={`skshop-filter-option ${active.slug===t.slug?"active":""}`} onClick={()=>selectCategory(t.slug)}><span className="skshop-radio"/>{t.label}</button>)}</div>{menu && <div className="skshop-filter-group"><h3>Subcategory</h3><Link className={`skshop-filter-option ${!subcategory?"active":""}`} href={`/${menu.slug}`}>All {menu.label}</Link>{menu.subcategories.map(name=><Link key={name} className={`skshop-filter-option ${subcategory===name?"active":""}`} href={`/${menu.slug}?subcategory=${encodeURIComponent(menuChildren.find(c => c.name === name)?.slug ?? name)}`}>{name}</Link>)}</div>}<div className="skshop-filter-group"><h3>Price range</h3>{priceBands.map((b,i)=><label key={b.label} className="skshop-filter-option"><input type="radio" name="price" checked={band===i} onChange={()=>{setBand(i);setPage(1)}}/>{b.label}</label>)}<small>Price filters exclude items without a listed price.</small></div><div className="skshop-filter-group"><h3>Pricing</h3><label className="skshop-filter-option"><input type="radio" name="pricing" checked={availability==="all"} onChange={()=>{setAvailability("all");setPage(1)}}/>All pieces</label><label className="skshop-filter-option"><input type="radio" name="pricing" checked={availability==="priced"} onChange={()=>{setAvailability("priced");setPage(1)}}/>With listed price</label></div><button type="button" className="skshop-clear" onClick={()=>{setBand(0);setAvailability("all");setSearch("");selectCategory("all")}}>Clear all filters ↗</button></aside>
{showCollections ? (
        <section className="skshop-collection-browser"
          aria-label={`${active.label} collections`}>


          <div className="skshop-collection-grid">
            {menuChildren.map(child => (
              <Link
                key={child.id}
                href={`/${encodeURIComponent(active.slug)}?subcategory=${encodeURIComponent(child.slug)}`}
                className="skshop-collection-card"
              >
                <div className="skshop-collection-image">
                  {child.image && !failedImages.includes(`category-${child.id}`) ? (
                    <Image
                      src={child.image}
                      alt={child.name}
                      fill
                      sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 25vw"
                      unoptimized={/^https?:\/\//i.test(child.image)}
                      style={{ objectFit: "cover" }}
                      loading="lazy"
                      onError={() => setFailedImages(current =>
                        [...current, `category-${child.id}`]
                      )}
                    />
                  ) : (
                    <div className="skshop-collection-placeholder">
                      <ShoppingBag size={36} strokeWidth={1.1}/>
                      <span>SRIKALAHASTI KALAMKARI</span>
                    </div>
                  )}
                </div>
                <div className="skshop-collection-info">
                  <h3>{child.name}</h3>
                  <span className="skshop-collection-cta">
                    Explore Collection
                    <ChevronRight size={16}/>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (

      <section className="skshop-results" aria-label="Products" aria-busy={loadingProducts}><div className="skshop-toolbar"><div className="skshop-search"><Search size={17}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search products..." aria-label="Search products"/>
        {search && (
          <button
            type="button"
            className="skshop-search-clear"
            aria-label="Clear search"
            onClick={() => {setSearch("");setPage(1)}}
          >
            <X size={16}/>
          </button>
        )}
        </div><div className="skshop-toolbar-right"><span className="skshop-count" aria-live="polite">{loadingProducts ? "Updating collection…" : `${totalItems} pieces to explore`}</span><div className="skshop-view"><button type="button" aria-label="Grid view" aria-pressed={view==="grid"} className={view==="grid"?"active":""} onClick={()=>setView("grid")}><LayoutGrid size={17}/></button><button type="button" aria-label="List view" aria-pressed={view==="list"} className={view==="list"?"active":""} onClick={()=>setView("list")}><List size={17}/></button></div><select value={sort} onChange={e=>{setSort(e.target.value);setPage(1)}} aria-label="Sort products"><option value="featured">Featured first</option><option value="name">Name A–Z</option><option value="price-asc">Price: Low to high</option><option value="price-desc">Price: High to low</option></select><button ref={filterTriggerRef} aria-expanded={filtersOpen} aria-controls="shop-filters-drawer" className="skshop-mobile-filter" type="button" onClick={()=>setFiltersOpen(true)}><SlidersHorizontal size={16}/> Filters</button></div></div>
      {menu && subcategory && <div className="skshop-selected-collection"><Link href={`/${menu.slug}`} scroll={false}>← All {menu.label} collections</Link><h2>{subcategory}</h2></div>}
      {totalItems > 0 ? <><div className={`skshop-grid ${view==="list"?"is-list":""}`}>{visible.map(p=><article className="skshop-product skshop-ref-card" key={p.id}>
  <div className="skshop-photo">
    <Link
      href={`/product/${p.id}`}
      aria-label={`View details for ${p.name}`}
      className="skshop-product-image-link"
    >
      {p.image && !failedImages.includes(p.id) ? (
        <Image
          src={p.image}
          alt={p.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          style={{ objectFit: "cover" }}
          loading="lazy"
          onError={()=>setFailedImages(current=>current.includes(p.id)?current:[...current,p.id])}
        />
      ) : (
        <div className="skshop-product-placeholder">
          <ShoppingBag size={30} strokeWidth={1.2}/>
          <span>SRIKALAHASTI KALAMKARI</span>
        </div>
      )}
    </Link>
    {(!hasPurchasableInventory(p)) && (
      <span
        className={`skshop-availability-badge ${
          p.availabilityStatus === "COMING_SOON" ? "is-soon" : "is-out"
        }`}
        role="status"
      >
        {productAvailabilityLabel(p).toUpperCase()}
      </span>
    )}
    {p.price > 0 && typeof p.originalPrice === "number" && p.originalPrice > p.price && <span className="skshop-tag skshop-discount-tag">{Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)}% OFF</span>}
    <div className="skshop-ref-tools">
      <button type="button" className={`skshop-heart ${saved.includes(p.id)?"is-saved":""}`} onClick={()=>toggleWishlist(p.id)} aria-label={`${saved.includes(p.id)?"Remove":"Save"} ${p.name}`} aria-pressed={saved.includes(p.id)}><Heart size={18} fill={saved.includes(p.id)?"currentColor":"none"}/></button>
      <button type="button" onClick={()=>setQuickView(p.id)} aria-label={`Zoom ${p.name}`} className="skshop-ref-zoom"><ZoomIn size={18}/></button>
    </div>
  </div>
  <div className="skshop-product-details"><h3><Link href={`/product/${p.id}`} className="skshop-product-title-link">{p.name}</Link></h3><div className="skshop-ref-price"><strong>{currency(p.price)}</strong>{p.originalPrice && p.originalPrice > p.price && <del className="skshop-original-price">{currency(p.originalPrice)}</del>}<a className="skshop-whatsapp-enquiry" href={productWhatsApp(p, "I would like to enquire about this product. Please confirm current price and availability.", p.pricingMode === "PER_METER" ? (p.pricePerMeter != null && p.pricePerMeter > 0 ? `${currency(p.pricePerMeter)} / meter` : "Price on request") : p.variants.length > 0 || p.pricingMode === "LENGTH_OPTIONS" ? "Depends on selected option" : p.price > 0 ? currency(p.price) : "Price on request", whatsappNumber)} target="_blank" rel="noopener noreferrer" aria-label={`Enquire on WhatsApp about ${p.name}`}><svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 32 32"
  width="19"
  height="19"
  fill="currentColor"
  aria-hidden="true"
>
  <path d="M16 .8A15.1 15.1 0 0 0 3 23.6L.8 31.2l7.8-2A15.2 15.2 0 1 0 16 .8Zm0 27.6a12.4 12.4 0 0 1-6.3-1.7l-.5-.3-4.6 1.2 1.2-4.5-.3-.5A12.5 12.5 0 1 1 16 28.4Zm6.9-9.4c-.4-.2-2.2-1.1-2.6-1.2-.3-.1-.6-.2-.8.2-.3.4-1 1.2-1.2 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8l.6-.7.4-.6c.1-.2 0-.5 0-.7l-1.2-2.8c-.3-.7-.6-.6-.8-.6h-.7c-.3 0-.7.1-1 .5c-.4.5-1.3 1.3-1.3 3.1s1.3 3.5 1.5 3.9c.2.2 2.5 3.8 6.1 5.2.9.4 1.6.6 2.1.8.9.3 1.7.2 2.3.1.7-.1 2.2-.9 2.5-1.8.3-.9.3-1.7.2-1.8-.1-.2-.3-.3-.7-.5Z"/>
</svg><span>WhatsApp</span></a></div><p className="skshop-demo">Handcrafted Kalamkari · Explore product details</p></div>
    <div className="skshop-ref-actions">
      <button type="button" disabled={!hasPurchasableInventory(p)} onClick={()=>{if(p.variants.length>0||p.pricingMode!=="FIXED"){router.push(`/product/${p.id}`);return;}addToCart(p.id);setCartMessage(`${p.name} added to cart`);}} className="skshop-ref-cart" aria-label={`Add ${p.name} to cart`}><ShoppingBag size={16}/><span className="skshop-cart-button-label">{productAvailabilityLabel(p) !== "In Stock" ? productAvailabilityLabel(p) : p.variants.length>0||p.pricingMode!=="FIXED" ? "Choose Length" : "Add to Cart"}</span></button>
      <button type="button" disabled={!hasPurchasableInventory(p)} onClick={()=>{if(p.variants.length>0||p.pricingMode!=="FIXED"){router.push(`/product/${p.id}`);return;}buyNow(p.id);router.push("/checkout?buyNow=1");}} className="skshop-ref-buy"><Zap size={16}/> {productAvailabilityLabel(p) !== "In Stock" ? productAvailabilityLabel(p) : p.variants.length>0||p.pricingMode!=="FIXED" ? "Choose Length" : "Buy Now"}</button>
    </div>
 </article>)}</div><div className="skshop-pagination"><span>Showing {totalItems === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage,totalItems)} of {totalItems} pieces</span><div><button type="button" disabled={page<=1} onClick={()=>setPage(v=>Math.max(1,v-1))}>Previous</button>{pageNumbers.map((number,index)=><span key={number} className="skshop-pagination-page">{index>0&&number-pageNumbers[index-1]>1?<span aria-hidden="true">…</span>:null}<button type="button" className={page===number?"active":""} aria-current={page===number?"page":undefined} onClick={()=>setPage(number)}>{number}</button></span>)}<button type="button" disabled={page>=pages} onClick={()=>setPage(v=>Math.min(pages,v+1))}>Next</button></div></div></>:<div className="skshop-empty" role="status" aria-live="polite"><Sparkles size={27}/><h3>No matching pieces yet</h3><p>Try another collection or clear the filters. More handcrafted pieces will be added as the catalog grows.</p><button type="button" onClick={()=>{setBand(0);setAvailability("all");setSearch("");selectCategory("all")}}>View all pieces</button></div>}
      </section>)}</div></div>
      {cartMessage && <div className="skshop-cart-toast" role="status">{cartMessage} <Link href="/cart">View Cart</Link><button type="button" onClick={()=>setCartMessage("")} aria-label="Dismiss">×</button></div>}
      {quickView!==null && (()=>{const p=items.find(x=>x.id===quickView);return p?<div className="skshop-quick-overlay" onClick={()=>setQuickView(null)} role="presentation"><div className="skshop-quick-dialog" role="dialog" aria-modal="true" aria-label={`Quick view ${p.name}`} onClick={e=>e.stopPropagation()}><button type="button" className="skshop-quick-close" onClick={()=>setQuickView(null)} aria-label="Close zoom"><X/></button><Image src={p.image} alt={p.name} width={720} height={720} style={{ width: "100%", height: "auto" }}/><div><h2>{p.name}</h2><p>{p.price > 0 ? currency(p.price) : "Price on request"}</p><p className="skshop-quick-availability">Availability: <strong>{productAvailabilityLabel(p)}</strong></p><button type="button" disabled={!hasPurchasableInventory(p)} onClick={()=>{setQuickView(null);if(p.variants.length>0||p.pricingMode!=="FIXED"){router.push(`/product/${p.id}`);return;}addToCart(p.id);setCartMessage(`${p.name} added to cart`);}}>{productAvailabilityLabel(p) !== "In Stock" ? productAvailabilityLabel(p) : p.variants.length>0||p.pricingMode!=="FIXED"?"Choose Length":"Add to Cart"}</button></div></div></div>:null;})()}
      {filtersOpen&&<button className="skshop-backdrop" type="button" onClick={()=>setFiltersOpen(false)} aria-label="Close filters"/>}
  </div>;
}
