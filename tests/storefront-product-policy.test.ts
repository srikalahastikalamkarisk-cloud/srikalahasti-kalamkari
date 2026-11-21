import test from "node:test";
import assert from "node:assert/strict";
import { selectRelatedProducts, storefrontImageList } from "../src/lib/storefront-product-policy";
import type { StorefrontProduct } from "../src/lib/storefront-products";

const product=(id:string,categoryId:string,brand:string|null=null,fabricMaterial:string|null=null)=>({
  id,name:id,slug:id,category:categoryId,categoryPath:[categoryId],categoryId,categorySlug:categoryId,price:100,image:"",images:[],stock:1,
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
