export function SeoJsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const serialized = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialized }} />;
}

export function BreadcrumbJsonLd({ items }: { items: { name: string; url: string }[] }) {
  return <SeoJsonLd data={{
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })),
  }} />;
}

export function HomeOrganizationJsonLd({ storeName, logoUrl, email, phone }: { storeName: string; logoUrl: string | null | undefined; email: string | null | undefined; phone: string | null | undefined }) {
  const store = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: storeName,
    url: "https://srikalahastikalamkari.in/",
    ...(logoUrl ? { logo: logoUrl.startsWith("/") ? `https://srikalahastikalamkari.in${logoUrl}` : logoUrl } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { telephone: phone } : {}),
    areaServed: { "@type": "Country", name: "India" },
  };
  const website = { "@context": "https://schema.org", "@type": "WebSite", name: storeName, url: "https://srikalahastikalamkari.in/", inLanguage: "en-IN" };
  return <SeoJsonLd data={[store, website]} />;
}
