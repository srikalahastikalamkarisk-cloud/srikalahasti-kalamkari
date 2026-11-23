import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fabrics } from "@/lib/fabric-collections";
import type { Metadata } from "next";

export function generateStaticParams() {
  return fabrics.map((fabric) => ({ slug: fabric.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const fabric = fabrics.find(item => item.slug === slug);
  if (!fabric) return { title: "Fabric Not Found | Srikalahasti Kalamkari", robots: { index: false, follow: false } };
  return {
    title: `${fabric.name} | Srikalahasti Kalamkari`,
    description: `${fabric.name} fabric information from Srikalahasti Kalamkari. Product listings will be added when the fabric collection is connected to the catalog.`,
    robots: { index: false, follow: true },
  };
}

export default async function FabricPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fabric = fabrics.find((item) => item.slug === slug);
  if (!fabric) notFound();

  return (
    <main className="sk-fabric-detail" style={{
      minHeight: "75vh",
      padding: "80px 24px",
      textAlign: "center"
    }}>
      <Link href="/" className="sk-fabric-detail-back">
        ← Back to Home
      </Link>
      <h1 style={{
        fontFamily: "Georgia, serif",
        fontSize: "clamp(36px, 5vw, 60px)",
        fontWeight: 400,
        margin: "32px 0"
      }}>{fabric.name}</h1>
      <div style={{
        position: "relative",
        width: "min(260px, 75vw)",
        aspectRatio: "2/3",
        margin: "0 auto 32px"
      }}>
        <Image
          src={`/fabrics/${fabric.slug}.jpg`}
          alt={`${fabric.name} fabric illustration`}
          fill
          sizes="260px"
          style={{ objectFit: "cover", borderRadius: "120px 120px 5px 5px" }}
        />
      </div>
      <p>Products for this fabric will appear here once the catalogue is connected.</p>
    </main>
  );
}
