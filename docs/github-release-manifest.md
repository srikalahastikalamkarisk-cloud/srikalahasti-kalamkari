# GitHub release manifest review

This repository currently contains a large pre-existing untracked working tree. The exact current candidate inventory is in [`github-release-manifest.paths`](github-release-manifest.paths): 61 tracked modifications/deletions and 87 filtered untracked candidates. [`github-release-manifest.stage`](github-release-manifest.stage) is a newline-delimited explicit pathspec list for review. It deliberately does not stage files. These paths are file-level candidates, not content approval; several tracked diffs predate this SEO/media task and require owner review.

After reviewing every path and diff, the explicit staging command is:

```sh
git add --pathspec-from-file=docs/github-release-manifest.stage
```

No files have been staged. The sandbox blocked Git's dry-run because it could not create `.git/index.lock`; the staging command therefore still needs to be run by the owner in a normal local shell after content review. Do not add the entire working tree.

## Include for this favicon and SEO change

- `public/favicon.ico` (the original `src/app/favicon.ico`, moved byte-for-byte as the metadata fallback)
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/robots.ts`
- `src/app/sitemap.ts`
- `src/app/[category]/page.tsx`
- `src/app/product/[id]/page.tsx`
- `src/app/shop/page.tsx`
- `src/app/about/page.tsx`
- `src/app/contact/page.tsx`
- `src/app/contact-info/page.tsx`
- `src/app/faq/page.tsx`
- `src/app/refund-policy/page.tsx`
- `src/app/shipping-policy/page.tsx`
- `src/app/fabrics/[slug]/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/(protected)/settings/page.tsx`
- `src/app/account/layout.tsx`
- `src/app/cart/layout.tsx`
- `src/app/checkout/layout.tsx`
- `src/app/wishlist/layout.tsx`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/layout.tsx`
- `src/app/verify-email/layout.tsx`
- `src/app/resend-verification/layout.tsx`
- `src/app/api/admin/media/route.ts`
- `src/app/api/admin/settings/route.ts`
- `src/app/api/media/products/[filename]/route.ts`
- `src/app/api/media/categories/[filename]/route.ts`
- `src/app/api/admin/products/upload/route.ts`
- `src/app/api/admin/categories/upload/route.ts`
- `src/lib/admin/persistent-image-upload.ts`
- `tests/persistent-media.test.ts`
- `src/components/seo-jsonld.tsx`
- `src/components/home-seo-intro.tsx`
- `src/components/home-seo-intro.css`
- `src/components/featured-products.tsx`
- `src/components/shop-catalog.tsx`
- `src/lib/favicon-image.ts`
- `src/lib/admin/media-storage.ts`
- `src/lib/public-store-settings.ts`
- `src/lib/storefront-products.ts`
- `tests/favicon-image.test.ts`
- `docs/seo-search-console-readiness.md`
- `docs/github-release-manifest.md`

## Existing release candidates requiring separate review

The working tree also contains tracked changes from earlier steps, plus untracked source, migrations, scripts, tests and public assets. They are not part of this SEO change and are not automatically approved by this manifest. Review these separately before a repository-wide release. Preserve migration files and checksums; include only migrations intended for the release and their matching schema/application changes.

## Exclude

- All `.env*` files, credentials, tokens, certificates and local machine configuration.
- Database dumps, snapshots and backup directories (`backups/`, `*.bak`, `*.backup*`, `*.before*`, `*.failed*`, `*.broken*`, and root `*-backups/`).
- Every generated Next.js build directory (`.next/`, `.next-*`) and generated Prisma output (`src/generated/prisma/`).
- Local runtime logs, temporary files, patch scripts and test-server output.
- Local-only media under `public/uploads/`, `MEDIA_STORAGE_DIR`, and any mounted media directory.
- IDE/plugin state such as `.agents/`, `.claude/`, `.windsurf/`, and `.codex/`.
- `node_modules/` and other dependency caches. Keep the checked-in dependency manifest/lockfile only when their changes are reviewed.

Nothing in this manifest authorizes a commit, push, deployment, DNS change or production setting change. See [`hostycare-deployment-preparation.md`](hostycare-deployment-preparation.md) for the hosting capability checklist and gated deployment design; no runnable deploy workflow is included until HostyCare's runtime and SSH capabilities are confirmed.
