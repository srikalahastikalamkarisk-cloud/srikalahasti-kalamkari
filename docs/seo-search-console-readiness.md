# SEO and Search Console readiness

Production origin: `https://srikalahastikalamkari.in`

## Google Search Console

1. In Search Console, add a **Domain** property for `srikalahastikalamkari.in`.
2. Copy the DNS TXT value provided by Google and add it through the domain's DNS provider. No verification value is embedded in this repository; the property owner must obtain it from Search Console.
3. Wait for DNS verification, then submit `https://srikalahastikalamkari.in/sitemap.xml` under Sitemaps.
4. Use URL Inspection on the homepage, one active category, and one active product. Check the selected canonical URL, crawl/index status, rendered content, and last crawl date.
5. Validate Product structured data with Google's Rich Results Test. Compare the rendered page's live price and stock state with the structured Offer before requesting indexing.
6. Recheck after product, category, URL or inventory changes. The sitemap omits inactive products and categories.

## Merchant Center readiness

Product/Offer data is emitted only for active product pages with a positive database price, no unresolved variant selection, and an in-stock or out-of-stock status. Coming-soon and price-on-request products omit Offer data. No rating, review, discount, GTIN, shipping promise or return-policy field is fabricated.

Merchant Center eligibility still requires an owner-managed account and product data/feed review. Confirm that every listed price and stock value matches the customer-facing product and checkout, provide required identifiers where available, configure shipping and return details to match the published policies, and complete business/account verification. Structured data alone does not guarantee free listings or merchant-listing approval.

## Analytics

No analytics ID is embedded by this implementation. Add analytics only after the owner supplies an approved measurement ID and consent requirements are reviewed.

## Persistent favicon uploads

Set `MEDIA_STORAGE_DIR` in the production runtime to an absolute, persistent directory outside the application release. The directory and its `products` child must be writable by the app and not group/world writable. Keep it mounted across releases and back it up with the site's media assets. If it is missing or misconfigured, favicon uploads fail safely with a service-unavailable response; existing public favicon URLs continue to work.
