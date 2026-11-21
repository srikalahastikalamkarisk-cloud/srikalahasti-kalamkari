export type ShopCategory = {
  id: string;
  name: string;
  image: string;
  href: string;
  order: number;
  visible: boolean;
};

export const shopCategories: ShopCategory[] = [
  {
    id: "sarees",
    name: "Sarees",
    image: "/images/products/ivory-peacock.webp",
    href: "/sarees",
    order: 1,
    visible: true,
  },
  {
    id: "dupattas",
    name: "Dupattas",
    image: "/images/products/teal-lotus.webp",
    href: "/dupattas",
    order: 2,
    visible: true,
  },
  {
    id: "lehengas",
    name: "Lehenga Sets",
    image: "/images/products/burgundy-floral.webp",
    href: "/lehengas",
    order: 3,
    visible: true,
  },
  {
    id: "fabrics",
    name: "Running Fabrics",
    image: "/fabrics/cotton.jpg",
    href: "/running-fabrics",
    order: 4,
    visible: true,
  },
  {
    id: "menswear",
    name: "Men's Wear",
    image: "/images/products/indigo-heritage.webp",
    href: "/mens-wear",
    order: 5,
    visible: true,
  },
  {
    id: "wallpaintings",
    name: "Wall Paintings",
    image: "/images/products/mustard-elephant.webp",
    href: "/wall-paintings",
    order: 6,
    visible: true,
  },
];
