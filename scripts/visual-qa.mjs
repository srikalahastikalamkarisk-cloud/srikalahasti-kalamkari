import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const outputDir = "artifacts/ui-qa-final";
const widths = [375, 390, 768, 1440];
const routes = [
  ["home", "/", "main#main-content h1"],
  ["shop", "/shop", ".skshop"],
  ["category", "/sarees", ".skshop"],
  ["about", "/about", ".ska-hero"],
  ["contact", "/contact", ".skcontact-hero"],
  ["cart", "/cart", ".skaccount h1"],
  ["wishlist", "/wishlist", ".skaccount h1"],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const failures = [];
const pageErrors = new Set();
const consoleErrors = new Set();
const runtimeIssues = new Set();
let screenshots = 0;
let overflowChecks = 0;

function watchPage(page, label) {
  page.on("pageerror", (error) => pageErrors.add(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("/_next/hmr")) {
      runtimeIssues.add("Next.js development HMR WebSocket handshake failed (ERR_INVALID_HTTP_RESPONSE)");
    } else if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      consoleErrors.add(`${label}: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) runtimeIssues.add(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";
    if (errorText !== "net::ERR_ABORTED") runtimeIssues.add(`Request failed (${errorText}) ${request.url()}`);
  });
}

async function record(label, task) {
  try {
    await task();
    console.log(`PASS ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${label}: ${message}`);
    console.error(`FAIL ${label}: ${message}`);
  }
}

const page = await context.newPage();
page.setDefaultTimeout(7000);
watchPage(page, "interactions");

// Do not inspect private React properties to determine hydration.
// They are not a stable browser-testing contract and previously blocked screenshots.
async function open(path) {
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`${path} returned ${response?.status() ?? "no response"}`);
  await page.locator("body").waitFor({ state: "visible" });
  // Wait for the real UI to appear; interaction assertions below verify behavior.
  if (path.startsWith("/shop") || path.startsWith("/sarees")) {
    await page.getByRole("textbox", { name: "Search products" }).waitFor({ state: "visible" });
  }
}

try {
  for (const width of widths) {
    for (const [name, path, readySelector] of routes) {
      const routePage = await context.newPage();
      routePage.setDefaultTimeout(7000);
      routePage.setViewportSize({ width, height: 900 });
      watchPage(routePage, `${path} (${width}px)`);
      try {
        const response = await routePage.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
        if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
        await routePage.locator("body").waitFor({ state: "visible" });
        await routePage.locator(readySelector).first().waitFor({ state: "visible" });
        // Screenshots require rendered content, not private React hydration markers.
        const overflow = await routePage.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        overflowChecks += 1;
        if (overflow.document > overflow.viewport + 1 || overflow.body > overflow.viewport + 1) {
          failures.push(`${path} (${width}px) horizontal overflow: ${JSON.stringify(overflow)}`);
        }
        const screenshotPath = `${outputDir}/${name}-${width}.png`;
        await routePage.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled", caret: "hide" });
        screenshots += 1;
        console.log(`SCREENSHOT ${screenshotPath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${path} (${width}px) capture: ${message}`);
        console.error(`FAIL capture ${path} (${width}px): ${message}`);
      } finally {
        await routePage.close();
      }
    }
  }

  await record("Search query filters matching products and shows the accessible empty state", async () => {
    await open("/shop?q=Royal%20Peacock");
    if (await page.locator(".skshop-ref-card").count() !== 1) throw new Error("Matching query did not return exactly one product");
    await open("/shop?q=no%20matching%20test%20item");
    await page.getByRole("status").getByRole("heading", { name: "No matching pieces yet" }).waitFor({ state: "visible" });
    if (await page.locator(".skshop-ref-card").count() !== 0) throw new Error("No-match query left product cards visible");
  });

  await record("Live search input updates product results", async () => {
    await open("/shop");
    const search = page.getByRole("textbox", { name: "Search products" });
    await search.fill("no matching test item");
    const emptyState = page.getByRole("status").getByRole("heading", { name: "No matching pieces yet" });
    await emptyState.waitFor({ state: "visible" });
    if (await page.locator(".skshop-ref-card").count() !== 0) throw new Error("Search left product cards visible");
    await search.fill("Royal Peacock");
    await page.getByRole("heading", { name: "Royal Peacock Kalamkari Saree" }).waitFor({ state: "visible" });
  });

  await record("Sarees category contains its assigned preview products", async () => {
    await open("/sarees");
    if (await page.locator(".skshop-ref-card").count() !== 12) throw new Error("Sarees category did not show its assigned preview products");
  });

  await record("Product zoom opens and closes with Escape", async () => {
    await open("/shop");
    await page.getByRole("button", { name: "Zoom Royal Peacock Kalamkari Saree" }).click();
    await page.getByRole("dialog", { name: "Quick view Royal Peacock Kalamkari Saree" }).waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Quick view Royal Peacock Kalamkari Saree" }).waitFor({ state: "hidden" });
  });

  await record("Wishlist action persists to the wishlist page", async () => {
    await open("/shop");
    await page.getByRole("button", { name: "Save Royal Peacock Kalamkari Saree" }).click();
    await open("/wishlist");
    await page.getByText("Royal Peacock Kalamkari Saree", { exact: true }).waitFor({ state: "visible" });
  });

  await record("Add to Cart updates cart state", async () => {
    await open("/shop");
    await page.getByRole("button", { name: "Add to Cart" }).first().click();
    await page.getByRole("status").filter({ hasText: "added to cart" }).waitFor({ state: "visible" });
    await open("/cart");
    await page.getByText("Royal Peacock Kalamkari Saree", { exact: true }).waitFor({ state: "visible" });
  });

  await record("Category and subcategory filters return matching and pending states", async () => {
    await open("/shop");
    await page.locator(".skshop-tabs").getByRole("button", { name: "Sarees" }).click();
    await page.waitForURL("**/sarees");
    if (await page.locator(".skshop-ref-card").count() === 0) throw new Error("Sarees filter returned no catalog pieces");
    await page.getByRole("link", { name: "Pure Silk Kanchipuram Pattu", exact: true }).click();
    await page.getByText("Catalog assignments for this collection are pending.").waitFor({ state: "visible" });
  });

  await record("Mobile filter drawer opens and closes with Escape", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open("/shop");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("dialog", { name: "Product filters" }).waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Product filters" }).waitFor({ state: "hidden" });
  });

  await record("Contact WhatsApp and Google Maps links are valid", async () => {
    await open("/contact");
    const mapLinks = await page.locator(".skcontact-map-link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    if (mapLinks.length !== 2 || mapLinks.some((href) => !href?.startsWith("https://www.google.com/maps/search/"))) {
      throw new Error(`Expected two Google Maps search links; found ${JSON.stringify(mapLinks)}`);
    }
    const whatsapp = page.locator('a[href^="https://wa.me/"]:visible').first();
    await whatsapp.waitFor({ state: "visible" });
    if (!(await whatsapp.getAttribute("href"))?.startsWith("https://wa.me/917288848881")) {
      throw new Error("Contact WhatsApp link has the wrong business number");
    }
  });

  await record("Mobile navigation opens, closes, and navigates", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
    await mobileNav.waitFor({ state: "visible" });
    if (!(await page.locator('a[aria-label="Wishlist"]').isVisible()) || !(await page.locator('a[aria-label="Shopping bag"]').isVisible())) {
      throw new Error("Wishlist or cart shortcut is not visible at 375px");
    }
    await page.keyboard.press("Escape");
    await mobileNav.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Open menu" }).click();
    await mobileNav.getByRole("link", { name: "About" }).click();
    await page.waitForURL("**/about");
  });

  for (const error of pageErrors) failures.push(error);
  for (const error of consoleErrors) failures.push(`Browser console: ${error}`);
  for (const issue of runtimeIssues) failures.push(`Browser runtime/resource: ${issue}`);
} finally {
  await context.close();
  await browser.close();
}

const report = {
  status: failures.length ? "failed" : "passed",
  screenshots,
  expectedScreenshots: routes.length * widths.length,
  horizontalOverflowChecks: overflowChecks,
  horizontalOverflowFailures: failures.filter((failure) => failure.includes("horizontal overflow")).length,
  screenshotDirectory: outputDir,
  viewports: widths,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length || screenshots !== routes.length * widths.length) process.exitCode = 1;
