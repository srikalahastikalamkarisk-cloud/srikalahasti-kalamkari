"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Heart, MessageCircle, Minus, Plus, ShoppingBag, Video, X, ZoomIn } from "lucide-react";
import type { StorefrontProduct as Product } from "@/lib/storefront-products";
import { addToCart, buyNow, toggleWishlist, useShopState } from "@/lib/shop-state";
import "./product-detail.css";

const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n);
const whatsapp=(message:string)=>`https://wa.me/917288848881?text=${encodeURIComponent(message)}`;
const displayValue=(value:unknown):string=>typeof value==="string"||typeof value==="number"?String(value):"";
function specificationRows(value:unknown):[string,string][] {
  if(Array.isArray(value))return value.flatMap(item=>item&&typeof item==="object"&&!Array.isArray(item)?Object.entries(item).filter(([,v])=>displayValue(v)).map(([k,v])=>[k,displayValue(v)] as [string,string]):[]);
  if(value&&typeof value==="object")return Object.entries(value).filter(([,v])=>displayValue(v)).map(([k,v])=>[k,displayValue(v)]);
  return [];
}
const validDiscount=(price:number,original?:number)=>price>0&&Number.isFinite(original)&&Number(original)>price?Math.round((1-price/Number(original))*100):0;
const requiresVariantCheckout=(p:Product)=>p.variants.length>0||p.pricingMode==="LENGTH_OPTIONS";
const colorAttribute=(name:string)=>/color|colour/i.test(name);
const sizeAttribute=(name:string)=>/^size$/i.test(name);
function attributeValue(variant:Product["variants"][number], name:string):string|undefined {
  const entry=Object.entries(variant.attributes||{}).find(([key])=>key.toLowerCase()===name.toLowerCase());
  if(entry)return entry[1];
  if(colorAttribute(name))return variant.colorName||undefined;
  if(sizeAttribute(name))return variant.size||undefined;
  if(name.toLowerCase()==="length"&&variant.lengthMeters!=null)return `${variant.lengthMeters}m`;
  return undefined;
}
function validColorHex(value:string|null|undefined):value is string {return Boolean(value&&/^#[0-9a-fA-F]{6}$/.test(value));}

export default function ProductDetail({product:p,relatedProducts}:{product:Product;relatedProducts:Product[]}) {
  const router=useRouter();const {wishlist}=useShopState();const rail=useRef<HTMLDivElement>(null);const relatedPause=useRef(false);
  const [relatedPosition,setRelatedPosition]=useState(1);const [expanded,setExpanded]=useState(false);const [quantity,setQuantity]=useState(1);const [selectedVariantId,setSelectedVariantId]=useState("");
  const [variantChoices,setVariantChoices]=useState<Record<string,string>>({});
  const [message,setMessage]=useState("");const [zoom,setZoom]=useState(false);const [selectedImageIndex,setSelectedImageIndex]=useState(0);
  const galleryImages=useMemo(()=>p.images.filter(Boolean),[p.images]);
  const related=useMemo(()=>[...new Map(relatedProducts.filter(x=>x.id!==p.id).map(x=>[x.id,x])).values()].slice(0,16),[p.id,relatedProducts]);
  const selectableVariants=p.variants.filter(variant=>{
    const names=Object.keys(variant.attributes||{});
    return (p.showColors||!names.some(colorAttribute))&&(p.showSizes||!names.some(sizeAttribute));
  });
  const variantAttributes=[...new Set(selectableVariants.flatMap(v=>Object.keys(v.attributes || {})))];
  const variantCheckoutBlocked=requiresVariantCheckout(p);const selectedVariant=selectableVariants.find(v=>v.id===selectedVariantId&&v.isActive) || (variantAttributes.length && variantAttributes.every(name=>variantChoices[name]) ? selectableVariants.find(v=>v.isActive&&v.price!=null&&v.stock>0&&variantAttributes.every(name=>attributeValue(v,name)===variantChoices[name])) : undefined);const perMeter=p.pricingMode==="PER_METER";const validVariant=(variant:Product["variants"][number])=>variant.isActive&&variant.stock>0&&variant.price!=null&&variant.price>0;const hasAvailableVariant=p.variants.some(validVariant);const canPurchase=p.availabilityStatus==="IN_STOCK"&&(variantCheckoutBlocked?Boolean(selectedVariant&&validVariant(selectedVariant)):perMeter?Boolean(p.pricePerMeter&&p.pricePerMeter>0&&p.stock>0):p.stock>0);const activePrice=variantCheckoutBlocked?(selectedVariant?.price??null):(perMeter?p.pricePerMeter:p.price);const activeStock=selectedVariant?.stock ?? p.stock;
  const selectedImage=selectedVariant?.imageUrl||galleryImages[selectedImageIndex]||"";
  const availabilityLabel=p.availabilityStatus==="COMING_SOON"?"Coming soon":p.availabilityStatus==="OUT_OF_STOCK"?"Out of stock":variantCheckoutBlocked?(selectedVariant?(validVariant(selectedVariant)?"In stock":"Out of stock"):hasAvailableVariant?"Select options":"Out of stock"):activeStock<=0?"Out of stock":"In stock";
  const saved=wishlist.includes(p.id);
  const selected=p.variants;
  const selectedLabel=selectedVariant ? Object.entries(selectedVariant.attributes || {}).map(([name,value])=>`${name}: ${value}`).join(" · ") || (selectedVariant.lengthMeters!=null?`${selectedVariant.lengthMeters}m`:[selectedVariant.colorName,selectedVariant.size].filter(Boolean).join(" · ")) : "";
  const selection=`${p.name}${selectedLabel?` (${selectedLabel})`:""} (Product #${p.id})${quantity>1?`, quantity: ${quantity}${perMeter?"m":""}`:""}`;
  const colorLabel=p.showColors&&Array.isArray(p.colors)?p.colors.map(value=>value&&typeof value==="object"&&"name" in value?displayValue(value.name):displayValue(value)).filter(Boolean).join(", "):"";
  const sizeLabel=p.showSizes&&Array.isArray(p.sizes)?p.sizes.map(displayValue).filter(Boolean).join(", "):"";

  function valuesFor(name:string) {
    const configured=colorAttribute(name)&&Array.isArray(p.colors)?p.colors.flatMap(item=>{
      if(typeof item==="string")return [item.trim()].filter(Boolean);
      if(item&&typeof item==="object"&&!Array.isArray(item)&&"name" in item&&typeof item.name==="string")return [item.name.trim()].filter(Boolean);
      return [];
    }):sizeAttribute(name)&&Array.isArray(p.sizes)?p.sizes.map(displayValue).map(value=>value.trim()).filter(Boolean):[];
    return [...new Set([...configured,...selectableVariants.flatMap(variant=>{const value=attributeValue(variant,name);return value?[value]:[]})])];
  }
  function hasAvailableMatch(choices:Record<string,string>) {
    return selectableVariants.some(variant=>variant.isActive&&variant.price!=null&&variant.price>0&&variant.stock>0&&Object.entries(choices).every(([name,value])=>attributeValue(variant,name)===value));
  }
  function optionAvailable(name:string,value:string) {
    const partial={...variantChoices,[name]:value};
    return hasAvailableMatch(partial)||hasAvailableMatch({[name]:value});
  }
  function chooseOption(name:string,value:string) {
    const next={...variantChoices,[name]:value};
    if(!hasAvailableMatch(next)) {
      for(const key of Object.keys(next)) {
        if(key===name)continue;
        delete next[key];
        if(hasAvailableMatch(next))break;
      }
    }
    setVariantChoices(next);
    setSelectedVariantId("");
    setQuantity(1);
  }
  function savedColorHex(value:string) {
    const variantColor=selectableVariants.find(variant=>attributeValue(variant,"Color")?.toLowerCase()===value.toLowerCase()&&validColorHex(variant.colorHex))?.colorHex;
    if(variantColor)return variantColor;
    if(Array.isArray(p.colors)) {
      const saved=p.colors.find(item=>item&&typeof item==="object"&&!Array.isArray(item)&&"name" in item&&typeof item.name==="string"&&item.name.toLowerCase()===value.toLowerCase()&&"hex" in item&&typeof item.hex==="string"&&validColorHex(item.hex));
      if(saved&&typeof saved==="object"&&"hex" in saved&&typeof saved.hex==="string")return saved.hex;
    }
    return undefined;
  }

  function add(quantityToAdd:number){if(!canPurchase||quantityToAdd<1||quantityToAdd>activeStock)return false;for(let i=0;i<quantityToAdd;i++)addToCart(p.id,selectedVariant?.id);setMessage(`${quantityToAdd} ${quantityToAdd===1?"item":"items"} added to your cart.`);return true;}
  useEffect(()=>{if(!zoom)return;const key=(e:KeyboardEvent)=>{if(e.key==="Escape")setZoom(false)};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[zoom]);
  useEffect(()=>{
    const el=rail.current;
    if(!el||related.length<=4)return;

    const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
    if(reducedMotion.matches)return;

    const timer=window.setInterval(()=>{
      if(relatedPause.current||document.hidden)return;
      const max=el.scrollWidth-el.clientWidth;
      if(max<=1)return;
      if(el.scrollLeft>=max-3){
        el.scrollTo({left:0,behavior:"smooth"});
      }else{
        const card=el.querySelector<HTMLElement>(".skpd-v5-card");
        const gap=parseFloat(getComputedStyle(el).columnGap)||20;
        const distance=card?card.getBoundingClientRect().width+gap:200;
        el.scrollBy({left:distance,behavior:"smooth"});
      }
    },4500);

    return()=>window.clearInterval(timer);
  },[related.length]);

  const moveRelated=(direction:number)=>{const el=rail.current;if(!el)return;const card=el.querySelector<HTMLElement>(".skpd-v5-card");if(card)el.scrollBy({left:direction*(card.getBoundingClientRect().width+16),behavior:"smooth"})};
  const rows:[string,string][]=[
    ...(p.brand?[["Brand",p.brand] as [string,string]]:[]),["Category",p.categoryPath.join(" / ")],
    ...(p.fabricMaterial?[["Fabric / material",p.fabricMaterial] as [string,string]]:[]),
    ...(p.length?[["Length",p.length] as [string,string]]:[]),...(p.width?[["Width",p.width] as [string,string]]:[]),
    ...(p.washCare?[["Care instructions",p.washCare] as [string,string]]:[]),...specificationRows(p.specifications),
    ...(colorLabel&&!variantAttributes.some(colorAttribute)?[["Colours",colorLabel] as [string,string]]:[]),
    ...(sizeLabel&&!variantAttributes.some(name=>/^size$/i.test(name))?[["Sizes",sizeLabel] as [string,string]]:[]),
  ];

  return <main className="skpd"><div className="skpd-shell">
    <nav className="skpd-crumb" aria-label="Breadcrumb"><Link href="/shop"><ArrowLeft size={15}/> Shop</Link>{p.categoryPath.map((category,index)=><span key={`${category}-${index}`}>/ {index===p.categoryPath.length-1?<Link href={`/shop?category=${encodeURIComponent(p.categorySlug)}`}>{category}</Link>:category}</span>)}<span>/</span><span>{p.name}</span></nav>
    <div className="skpd-layout">
      <div className="skpd-visual"><div className="skpd-visual-sticky"><div className="skpd-gallery-layout"><div className="skpd-photo">
        <button className="skpd-image-open" type="button"
          onPointerMove={event=>{
            if(event.pointerType!=="mouse"||!selectedImage)return;
            const rect=event.currentTarget.getBoundingClientRect();
            const x=Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100));
            const y=Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100));
            event.currentTarget.style.setProperty("--skpd-zoom-x",`${x}%`);
            event.currentTarget.style.setProperty("--skpd-zoom-y",`${y}%`);
            event.currentTarget.dataset.hoverZoom="true";
          }}
          onPointerLeave={event=>{
            delete event.currentTarget.dataset.hoverZoom;
          }}
          onPointerCancel={event=>{
            delete event.currentTarget.dataset.hoverZoom;
          }}
          onClick={()=>selectedImage&&setZoom(true)} aria-label={selectedImage?`Zoom image of ${p.name}`:`No product image available for ${p.name}`} disabled={!selectedImage}>
          {selectedImage?<img src={selectedImage} alt={p.name}/>:<div className="skpd-image-fallback"><ShoppingBag size={30}/><span>Product image unavailable</span></div>}
          {selectedImage&&<span className="skpd-zoom-hint"><ZoomIn size={17}/> View larger</span>}
        </button>
        <button className={`skpd-heart ${saved?"is-saved":""}`} type="button" aria-label={saved?"Remove from wishlist":"Add to wishlist"} aria-pressed={saved} onClick={()=>toggleWishlist(p.id)}><Heart size={21} fill={saved?"currentColor":"none"}/></button>
      </div>
      {galleryImages.length>1&&<div className="skpd-thumbnail-rail" aria-label={`${p.name} image gallery`}>{galleryImages.map((image,index)=><button key={`${image}-${index}`} type="button" className={`skpd-thumbnail ${selectedImageIndex===index?"is-active":""}`} onClick={()=>setSelectedImageIndex(index)} aria-label={`View image ${index+1} of ${galleryImages.length}`} aria-pressed={selectedImageIndex===index}><img src={image} alt={`${p.name}, image ${index+1}`} loading="lazy"/></button>)}</div>}
      </div></div>
      {p.description&&<section className="skpd-long-description"><h2>Product Description</h2><p>{p.description}</p></section>}
      </div>
      <section className="skpd-info"><span className="skpd-eyebrow">{p.category.toUpperCase()}</span><h1>{p.name}</h1>
        <div className="skpd-price"><strong>{activePrice!=null&&activePrice>0?`${money(activePrice)}${perMeter?" / meter":""}`:"Price on request"}</strong>{(selectedVariant?.originalPrice??(!selectedVariant?p.originalPrice:undefined))!=null&&validDiscount(activePrice||0,selectedVariant?.originalPrice??p.originalPrice)>0&&<><del>{money((selectedVariant?.originalPrice??p.originalPrice)!)}</del><span>{validDiscount(activePrice||0,selectedVariant?.originalPrice??p.originalPrice)}% OFF</span></>}</div>
        <p className={`skpd-availability skpd-availability--${availabilityLabel.toLowerCase().replaceAll(" ","-")}`}><span aria-hidden="true"/> {selectedVariant?(selectedVariant.stock>0?`${selectedVariant.stock} available` : "Out of stock"):availabilityLabel}{(!variantCheckoutBlocked||selectedVariant)&&activeStock>0&&activeStock<=5&&p.availabilityStatus==="IN_STOCK"?` · ${activeStock} available`:""}</p>
        <div className="skpd-service-flags">{p.freeShipping&&<span>Free shipping</span>}{p.allowCOD&&(p.allowEnquiry?<a href={whatsapp(`Hello, is cash on delivery available for ${p.name}?`)} target="_blank" rel="noopener noreferrer">Ask about cash on delivery</a>:<span>Cash on delivery offered</span>)}</div>
        
        {selected.length>0&&<section className="skpd-detail-panel" aria-labelledby="product-variants"><h2 id="product-variants">Choose available options</h2><p>Select each configured option. Price and stock are verified again at checkout.</p>{variantAttributes.length>0 ? variantAttributes.map(name=>{const options=valuesFor(name);if(!options.length)return null;const selectedValue=variantChoices[name]||"";if(colorAttribute(name))return <fieldset className="skpd-choice-group skpd-color-group" key={name}><legend>{name}: <strong>{selectedValue||"Select a color"}</strong></legend><div className="skpd-color-options">{options.map(value=>{const available=optionAvailable(name,value);const chosen=selectedValue===value;const hex=savedColorHex(value);return <label key={value} className={`skpd-color-option${chosen?" is-selected":""}${available?"":" is-unavailable"}`}><input type="radio" name={`variant-${p.id}-${name}`} value={value} checked={chosen} disabled={!available} onChange={()=>chooseOption(name,value)} aria-label={`${value}${available?"":" unavailable"}`}/><span className="skpd-color-swatch" style={hex?{backgroundColor:hex}:undefined} aria-hidden="true">{chosen?<Check size={15}/>:!hex?value.slice(0,1).toUpperCase():null}</span><span className="skpd-color-name">{value}</span></label>})}</div></fieldset>;
          const buttonStyle=sizeAttribute(name)||name.toLowerCase()==="length"||options.length<=8;
          if(buttonStyle)return <fieldset className="skpd-choice-group" key={name}><legend>{name}: <strong>{selectedValue||`Select ${name.toLowerCase()}`}</strong></legend><div className={`skpd-choice-buttons${sizeAttribute(name)?" skpd-size-buttons":""}`}>{options.map(value=>{const available=optionAvailable(name,value);const chosen=selectedValue===value;return <button key={value} type="button" className={chosen?"is-selected":""} disabled={!available} aria-pressed={chosen} onClick={()=>chooseOption(name,value)}>{value}</button>})}</div></fieldset>;
          return <label className="skpd-choice-select" key={name}>{name}: <strong>{selectedValue||"Select an option"}</strong><select value={selectedValue} onChange={event=>chooseOption(name,event.target.value)}><option value="">Select {name.toLowerCase()}</option>{options.map(value=><option key={value} value={value} disabled={!optionAvailable(name,value)}>{value}</option>)}</select></label>;
        }):<ul className="skpd-variant-list">{selected.map(v=>{const label=v.lengthMeters!=null?`${v.lengthMeters}m`:[v.colorName,v.size].filter(Boolean).join(" · ")||"Option";const unavailable=!v.isActive||v.price==null||v.stock<1;return <li key={v.id}><button type="button" disabled={unavailable} aria-pressed={selectedVariantId===v.id} onClick={()=>{setSelectedVariantId(v.id);setQuantity(1)}}>{label} · {v.price!=null?money(v.price):"Price not set"} · {!v.isActive?"Unavailable":v.stock>0?`${v.stock} in stock`:"Out of stock"}</button></li>})}</ul>}</section>}
        {p.pricingMode==="LENGTH_OPTIONS"&&p.variants.length===0&&<p className="skpd-hint" role="status">Length options need to be synchronized in product management before they can be purchased.</p>}
        {perMeter&&<p className="skpd-hint">Select the number of whole meters. Inventory is tracked in meters.</p>}
        {canPurchase&&<div className="skpd-option skpd-quantity"><strong>{perMeter?"Length (meters)":"Quantity"}</strong><div className="skpd-qty"><button type="button" onClick={()=>setQuantity(q=>Math.max(1,q-1))} aria-label="Decrease quantity"><Minus size={17}/></button><output aria-live="polite">{quantity}{perMeter?" m":""}</output><button type="button" onClick={()=>setQuantity(q=>Math.min(20,activeStock,q+1))} aria-label="Increase quantity" disabled={quantity>=Math.min(20,activeStock)}><Plus size={17}/></button></div></div>}
        {variantCheckoutBlocked&&!selectedVariant&&<p className="skpd-hint" role="status">Choose an available option to continue.</p>}
        <div className="skpd-actions"><button type="button" className="skpd-buy" disabled={!canPurchase||quantity>activeStock} onClick={()=>{if(!canPurchase||quantity>activeStock)return;buyNow(p.id,quantity,selectedVariant?.id);router.push("/checkout?buyNow=1")}}>Buy Now <ChevronRight size={19}/></button><button type="button" className="skpd-add" disabled={!canPurchase||quantity>activeStock} onClick={()=>add(quantity)}><ShoppingBag size={18}/> Add to Cart</button></div>
        {p.allowEnquiry&&<div className="skpd-contact"><a className="skpd-whatsapp" href={whatsapp(`Hello, I would like to enquire about ${selection}. Please confirm current price and availability.`)} target="_blank" rel="noopener noreferrer"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.48 0 .12 5.35.12 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.26-1.64a11.95 11.95 0 0 0 5.8 1.48h.01c6.58 0 11.93-5.35 11.93-11.94 0-3.19-1.24-6.19-3.48-8.42ZM12.07 21.82a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.73.98.99-3.63-.24-.38a9.9 9.9 0 0 1-1.52-5.26c0-5.47 4.45-9.92 9.92-9.92a9.86 9.86 0 0 1 7.02 2.91 9.85 9.85 0 0 1 2.9 7.02c0 5.47-4.45 9.92-9.94 9.92Zm5.44-7.43c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.8-1.49-1.78-1.66-2.08-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.31 1.27.49 1.71.63.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z"/></svg> WhatsApp enquiry <ChevronRight size={17}/></a><a className="skpd-video" href={whatsapp(`Hello, can I request a video verification for ${selection}?`)} target="_blank" rel="noopener noreferrer"><Video size={19}/> Request video</a></div>}
        {message&&<p className="skpd-success" role="status"><Check size={16}/>{message} <Link href="/cart">View cart</Link></p>}
        {rows.length>0&&<details className="skpd-accordion" open><summary>Specifications <Plus size={18}/></summary><div className="skpd-accordion-content"><dl>{rows.map(([label,value],index)=><div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></details>}
        {p.shortDescription&&<details className="skpd-accordion" open><summary>Description <Plus size={18}/></summary><div className="skpd-accordion-content"><p>{p.shortDescription}</p></div></details>}
        
      </section>
    </div>
    {related.length>0&&<section className="skpd-related skpd-v5-related" aria-labelledby="skpd-related-title"><div className="skpd-related-head"><div><span className="skpd-eyebrow">DISCOVER MORE</span><h2 id="skpd-related-title">Related products</h2></div><div className="skpd-rail-controls"><button type="button" aria-label="Previous related products" onClick={()=>moveRelated(-1)}><ChevronLeft size={21}/></button><button type="button" aria-label="Next related products" onClick={()=>moveRelated(1)}><ChevronRight size={21}/></button></div></div>
      <div ref={rail} className="skpd-related-rail skpd-v5-rail" aria-label="Related products" onMouseEnter={()=>{relatedPause.current=true}} onMouseLeave={()=>{relatedPause.current=false}} onTouchStart={()=>{relatedPause.current=true}} onTouchEnd={()=>{relatedPause.current=false}} onFocusCapture={()=>{relatedPause.current=true}} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))relatedPause.current=false}} onScroll={e=>{const el=e.currentTarget;const card=el.querySelector<HTMLElement>(".skpd-v5-card");if(card)setRelatedPosition(Math.min(related.length,Math.round(el.scrollLeft/(card.getBoundingClientRect().width+16))+1))}}>
        {related.map(item=>{const itemSaved=wishlist.includes(item.id);const itemDiscount=validDiscount(item.price,item.originalPrice);const itemAvailable=item.availabilityStatus==="IN_STOCK"&&item.stock>0&&!requiresVariantCheckout(item);return <article className="skpd-v5-card" key={item.id}><div className="skpd-v5-photo"><Link href={`/product/${item.id}`} aria-label={`View ${item.name}`}>{item.image?<img src={item.image} alt={item.name} loading="lazy"/>:<div className="skpd-image-fallback"><ShoppingBag size={24}/><span>Image unavailable</span></div>}</Link>{itemDiscount>0&&<span className="skpd-v5-discount">{itemDiscount}% OFF</span>}<div className="skpd-v5-icons"><button type="button" aria-label={itemSaved?`Remove ${item.name} from wishlist`:`Add ${item.name} to wishlist`} aria-pressed={itemSaved} onClick={()=>toggleWishlist(item.id)}><Heart size={17} fill={itemSaved?"currentColor":"none"}/></button><Link href={`/product/${item.id}`} aria-label={`Open ${item.name}`}><ZoomIn size={17}/></Link></div></div><div className="skpd-v5-actions"><button type="button" disabled={!itemAvailable} onClick={()=>addToCart(item.id)}><ShoppingBag size={15}/><span>Add to Cart</span></button></div><div className="skpd-v5-body"><Link href={`/product/${item.id}`} className="skpd-v5-name">{item.name}</Link><div className="skpd-v5-price"><strong>{item.price>0?money(item.price):"Price on request"}</strong>{itemDiscount>0&&<del>{money(item.originalPrice!)}</del>}</div></div></article>})}
      </div><div className="skpd-v5-foot"><span>{related.length} related products</span><span>{relatedPosition} / {related.length}</span></div></section>}
  </div>{zoom&&selectedImage&&<div className="skpd-lightbox" role="dialog" aria-modal="true" aria-label={`Enlarged image of ${p.name}`} onClick={()=>setZoom(false)}><button type="button" className="skpd-lightbox-close" aria-label="Close zoom" onClick={()=>setZoom(false)}><X size={25}/></button><img src={selectedImage} alt={`Enlarged ${p.name}`} onClick={e=>e.stopPropagation()}/><span>Click outside image or press Escape to close</span></div>}</main>;
}
