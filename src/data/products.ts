export type Product = { id:number; name:string; category:string; price:number; image:string; tag:string; originalPrice?:number; rating?:number; reviewCount?:number; discountPercent?:number };
const categories = ["Sarees", "Dupattas", "Lehengas", "Fabrics", "Kurtas", "Home Decor"];
const counts = [12,6,4,4,2,2];
const names: Record<string,string[]> = {
 Sarees:["Royal Peacock Kalamkari Saree","Temple Garden Kalamkari Saree","Midnight Floral Kalamkari Saree","Heritage Lotus Kalamkari Saree","Indigo Vine Kalamkari Saree","Golden Border Kalamkari Saree","Handpainted Blossom Saree","Traditional Motif Saree","Blue Lotus Cotton Saree","Artisan Story Saree","Classic Indigo Saree","Festive Heritage Saree"],
 Dupattas:["Indigo Floral Dupatta","Handcrafted Lotus Dupatta","Heritage Border Dupatta","Peacock Art Dupatta","Temple Print Dupatta","Artisan Cotton Dupatta"],
 Lehengas:["Royal Blue Lehenga","Festive Kalamkari Lehenga","Peacock Garden Lehenga","Heritage Celebration Lehenga"],
 Fabrics:["Indigo Floral Fabric","Handpainted Cotton Fabric","Heritage Motif Fabric","Classic Kalamkari Fabric"],
 Kurtas:["Blue Heritage Kurta","Floral Kalamkari Kurta"],
 "Home Decor":["Kalamkari Wall Hanging","Heritage Cushion Cover"]
};
const images = [
 "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80",
 "/images/products/ivory-peacock.webp",
 "https://images.unsplash.com/photo-1597983073493-88cd35cf93b0?auto=format&fit=crop&w=800&q=80",
 "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?auto=format&fit=crop&w=800&q=80",
 "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80",
 "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80"
];
export const products: Product[] = categories.flatMap((category,ci)=>Array.from({length:counts[ci]},(_,i)=>({
 id:counts.slice(0,ci).reduce((a,b)=>a+b,0)+i+1,
 name:names[category][i], category,
 price:[1999,2299,1699,1899,1499,2499,1799,2199,1299,2599,1599,2899][(i+ci*3)%12],
 originalPrice:[2799,3099,2299,2599,2099,3399,2499,2999,1799,3499,2199,3899][(i+ci*3)%12],
 image:images[(ci+i)%images.length],tag:"Preview"
})));
