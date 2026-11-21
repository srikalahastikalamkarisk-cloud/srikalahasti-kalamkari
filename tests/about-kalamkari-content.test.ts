import assert from "node:assert/strict";
import test from "node:test";
import {
  aboutKalamkariInputSchema,
  defaultAboutCategoryIds,
  defaultAboutImageUrl,
  isAboutTableMissing,
  isSafeAboutButtonHref,
  isSafeAboutImageUrl,
  isValidAboutCategorySelection,
  resolveAboutCategories,
} from "../src/lib/about-kalamkari-content";

const base = {
  eyebrow: "Our story",
  heading: "About Kalamkari",
  descriptionOne: "First paragraph",
  descriptionTwo: "Second paragraph",
  imageUrl: null,
  imageAlt: "Kalamkari textile",
  imageCaption: "Srikalahasti, India",
  categoryIds: ["sarees", "fabrics"],
  buttonText: "Read Our Story",
  buttonHref: "/about",
};

const categories = [
  { id: "sarees", name: "Sarees", slug: "sarees", parentId: null, isActive: true },
  { id: "fabrics", name: "Fabrics", slug: "fabrics", parentId: null, isActive: true },
  { id: "inactive", name: "Archive", slug: "archive", parentId: null, isActive: false },
  { id: "child", name: "Cotton", slug: "cotton", parentId: "fabrics", isActive: true },
];

test("About input validates internal buttons and rejects unsafe destinations", () => {
  assert.equal(aboutKalamkariInputSchema.safeParse(base).success, true);
  assert.equal(isSafeAboutButtonHref("/about?from=home"), true);
  for (const href of ["javascript:alert(1)", "https://example.com", "//example.com", "/\\\\evil", "data:text/html,hi"]) {
    assert.equal(isSafeAboutButtonHref(href), false, href);
    assert.equal(aboutKalamkariInputSchema.safeParse({ ...base, buttonHref: href }).success, false, href);
  }
});

test("About input accepts only default or Media Library image paths", () => {
  assert.equal(isSafeAboutImageUrl(null), true);
  assert.equal(isSafeAboutImageUrl(defaultAboutImageUrl), true);
  assert.equal(isSafeAboutImageUrl("/api/media/products/123e4567-e89b-12d3-a456-426614174000.webp"), true);
  assert.equal(isSafeAboutImageUrl("https://remote.example/image.jpg"), false);
  assert.equal(isSafeAboutImageUrl("/uploads/untracked.jpg"), false);
  assert.equal(aboutKalamkariInputSchema.safeParse({ ...base, imageUrl: "https://remote.example/image.jpg" }).success, false);
});

test("category selections require active root categories and resolve in saved order", () => {
  const starterCategoryIds = defaultAboutCategoryIds(categories);
  assert.deepEqual(starterCategoryIds, ["sarees", "fabrics"]);
  assert.deepEqual(resolveAboutCategories([], categories), [], "a saved empty selection remains intentionally empty");
  assert.equal(isValidAboutCategorySelection(["fabrics", "sarees"], categories), true);
  assert.equal(isValidAboutCategorySelection(["inactive"], categories), false);
  assert.equal(isValidAboutCategorySelection(["child"], categories), false);
  assert.equal(isValidAboutCategorySelection(["missing"], categories), false);
  assert.equal(isValidAboutCategorySelection(["sarees", "sarees"], categories), false);
  assert.deepEqual(resolveAboutCategories(["fabrics", "sarees", "missing"], categories), [
    { id: "fabrics", name: "Fabrics", href: "/shop?category=fabrics" },
    { id: "sarees", name: "Sarees", href: "/shop?category=sarees" },
  ]);
});

test("missing About table detection is scoped to the About table", () => {
  assert.equal(isAboutTableMissing({ code: "P2021", message: "The table `AboutKalamkariContent` does not exist" }), true);
  assert.equal(isAboutTableMissing({ code: "P2021", message: "The table `Product` does not exist" }), false);
  assert.equal(isAboutTableMissing(new Error("connection failed")), false);
});
