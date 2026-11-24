import test from "node:test";
import assert from "node:assert/strict";
import { selectRelatedProducts, storefrontImageList } from "../src/lib/storefront-product-policy";
import type { StorefrontProduct } from "../src/lib/storefront-products";

const product=(id:string,categoryId:string,brand:string|null=null,fabricMaterial:string|null=null)=>({
  id,name:id,slug:id,category:categoryId,categoryPath:[categoryId],categoryId,categorySlug:categoryId,categoryAncestorIds:[],categoryAncestorSlugs:[],price:100,image:"",images:[],stock:1,
  availabilityStatus:"IN_STOCK" as const,isFeatured:false,isNewArrival:false,pricingMode:"FIXED",pricePerMeter:null,allowCOD:false,freeShipping:false,allowEnquiry:true,description:"",shortDescription:"",
  originalPrice:undefined,brand,fabricMaterial,length:null,width:null,washCare:null,specifications:null,showColors:false,colors:null,
  showSizes:false,sizes:null,showMeters:false,meterOptions:null,showSpecifications:false,showFabricMaterial:false,showLength:false,
  showWidth:false,showWashCare:false,variants:[],
}) as StorefrontProduct;

test("product gallery keeps valid database order, drops duplicates and unsafe paths",()=>{
  assert.deepEqual(storefrontImageList(["/api/media/products/a.webp","/images/b.jpg","/api/media/products/a.webp","../../unrelated.jpg","https://example.com/x.jpg"]),["/api/media/products/a.webp","/images/b.jpg"]);
});

test("related products prefer category, then shared material/brand, and never duplicate current product",()=>{
  const current=product("current","cat-a","Heritage","Cotton");
  const result=selectRelatedProducts(current,[product("fallback","cat-z"),product("same-brand","cat-z","Heritage"),product("same-material","cat-z",null,"Cotton"),product("same-category","cat-a"),product("current","cat-a"),product("same-category","cat-a")],10);
  assert.deepEqual(result.map(item=>item.id),["same-category","same-material","same-brand","fallback"]);
});

test("category filters include assigned products and descendants, but exclude unrelated products", async()=>{
  const { belongsToCategory } = await import("../src/lib/storefront-product-policy");
  const parent = { categoryId: "parent", categorySlug: "silk", categoryAncestorIds: [], categoryAncestorSlugs: [] };
  const child = { categoryId: "child", categorySlug: "kanchi", categoryAncestorIds: ["parent"], categoryAncestorSlugs: ["silk"] };
  const nested = { categoryId: "grandchild", categorySlug: "pure-kanchi", categoryAncestorIds: ["child", "parent"], categoryAncestorSlugs: ["kanchi", "silk"] };
  const unrelated = { categoryId: "cotton", categorySlug: "cotton", categoryAncestorIds: [], categoryAncestorSlugs: [] };
  assert.equal(belongsToCategory(parent, "parent"), true);
  assert.equal(belongsToCategory(child, "parent"), true);
  assert.equal(belongsToCategory(nested, undefined, "silk"), true);
  assert.equal(belongsToCategory(unrelated, undefined, "silk"), false);
  assert.equal(belongsToCategory(nested, "child"), true);
});

test("purchasable availability uses eligible variant inventory and honors explicit statuses", async()=>{
  const { hasPurchasableInventory, productAvailabilityLabel } = await import("../src/lib/storefront-product-policy");
  const base = product("available", "cat-a");
  assert.equal(hasPurchasableInventory(base), true);
  assert.equal(hasPurchasableInventory({ ...base, stock: 0 }), false);
  assert.equal(hasPurchasableInventory({ ...base, availabilityStatus: "OUT_OF_STOCK" }), false);
  assert.equal(productAvailabilityLabel({ ...base, availabilityStatus: "COMING_SOON" }), "Coming Soon");
  const variants = [
    { id: "inactive", sku: null, colorName: null, colorHex: null, size: null, lengthMeters: null, attributes: null, imageUrl: null, price: 100, originalPrice: null, stock: 9, isActive: false },
    { id: "active-empty", sku: null, colorName: null, colorHex: null, size: null, lengthMeters: null, attributes: null, imageUrl: null, price: 100, originalPrice: null, stock: 0, isActive: true },
    { id: "active-instock", sku: null, colorName: null, colorHex: null, size: null, lengthMeters: null, attributes: null, imageUrl: null, price: 100, originalPrice: null, stock: 2, isActive: true },
  ];
  assert.equal(hasPurchasableInventory({ ...base, stock: 0, variants }), true);
  assert.equal(hasPurchasableInventory({ ...base, stock: 0, variants: variants.slice(0, 2) }), false);
});
