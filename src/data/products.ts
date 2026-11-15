export type Product = { id:number; name:string; category:string; price:number; image:string; tag:string };
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
 "https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=800&q=80",
 "https://images.unsplash.com/photo-1597983073493-88cd35cf93b0?auto=format&fit=crop&w=800&q=80",
 "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?auto=format&fit=crop&w=800&q=80",
 "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80",
 "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80"
];
export const products: Product[] = categories.flatMap((category,ci)=>Array.from({length:counts[ci]},(_,i)=>({
 id:counts.slice(0,ci).reduce((a,b)=>a+b,0)+i+1,
 name:names[category][i], category, price:0, image:images[(ci+i)%images.length],tag:i===0?"Featured":"New Arrival"
})));
