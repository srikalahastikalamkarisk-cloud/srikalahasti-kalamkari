export type MegaCategory = { label: string; slug: string; subcategories: string[]; image?: string };
// Add image paths after uploading verified product images to /public.
// Subcategory names are initial navigation labels; adjust to match the actual catalog.
export const megaCategories: MegaCategory[] = [
  {label:"Sarees",slug:"sarees",subcategories:["Pure Silk Kanchipuram Pattu","Semi Silk Kanchi Pattu","Tussar Silk","Moonga Tussar","Bangalore Silk","Cotton Sarees","Linen Sarees","Pochampalli"]},
  {label:"Dupattas",slug:"dupattas",subcategories:["Kalamkari Dupattas","Hand Painted Dupattas","Silk Dupattas","Cotton Dupattas","Chanderi Dupattas","Tussar Dupattas"]},
  {label:"Lehengas",slug:"lehengas",subcategories:["Kalamkari Lehenga Sets","Silk Lehenga Sets","Cotton Lehenga Sets","Festive Lehenga Sets"]},
  {label:"Men’s Wear",slug:"mens-wear",subcategories:["Kalamkari Shirts","Kurtas","Men’s Fabrics","Festive Wear"]},
  {label:"Running Fabrics",slug:"running-fabrics",subcategories:["Kalamkari Cotton Fabric","Hand Painted Fabric","Printed Fabric","Silk Fabric","Linen Fabric","Dress Material"]},
  {label:"Wall Paintings",slug:"wall-paintings",subcategories:["Traditional Kalamkari Art","Mythological Paintings","Hand Painted Wall Art","Decorative Panels"]},
];
