import { prisma } from "@/lib/prisma";

export type HomepageCustomerPhoto = {
  id: string;
  src: string;
  alt: string;
  caption: string;
};

export type HomepageCustomerReview = {
  id: string;
  name: string;
  rating: number;
  text: string;
  verified: boolean;
};

export async function getHomepageCustomerLove(): Promise<{
  photos: HomepageCustomerPhoto[];
  reviews: HomepageCustomerReview[];
}> {
  const [galleryRows, reviewRows] = await Promise.all([
    prisma.customerGallery.findMany({
      where: { isApproved: true },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
      take: 30,
      select: {
        id: true,
        imageUrl: true,
        altText: true,
        caption: true,
      },
    }),
    prisma.customerReview.findMany({
      where: { isApproved: true },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
      take: 30,
      select: {
        id: true,
        customerName: true,
        rating: true,
        reviewText: true,
        isVerified: true,
      },
    }),
  ]);

  return {
    photos: galleryRows.map(photo => ({
      id: photo.id,
      src: photo.imageUrl,
      alt: photo.altText?.trim() || "Kalamkari gallery photograph",
      caption: photo.caption?.trim() || "",
    })),
    reviews: reviewRows.map(review => ({
      id: review.id,
      name: review.customerName,
      rating: review.rating,
      text: review.reviewText,
      verified: review.isVerified,
    })),
  };
}
