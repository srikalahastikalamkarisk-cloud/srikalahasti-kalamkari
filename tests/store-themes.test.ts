import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ORIGINAL_THEME, ORIGINAL_THEME_ID, STORE_THEMES, THEME_FAMILIES, resolveStoreTheme, themeCssVariables } from "../src/lib/store-themes";

test("theme registry contains exactly 50 palettes across 10 families of five", () => {
  assert.equal(STORE_THEMES.length, 50);
  assert.equal(THEME_FAMILIES.length, 10);
  for (const family of THEME_FAMILIES) {
    assert.equal(STORE_THEMES.filter(theme => theme.familyId === family.id).length, 5, family.name);
  }
  assert.equal(new Set(STORE_THEMES.map(theme => theme.id)).size, 50);
});

test("every theme defines valid semantic gradients, contrast colors, and fallback identity", () => {
  for (const theme of STORE_THEMES) {
    assert.equal(Object.keys(theme.gradients).length, 20);
    assert.equal(Object.keys(theme.colors).length, 31);
    for (const gradient of Object.values(theme.gradients)) {
      assert.match(gradient, /^(linear|radial)-gradient\(/);
      const stops = gradient.match(/#[0-9a-f]{6}(?:[0-9a-f]{2})?/gi) ?? [];
      assert.ok(stops.length >= 2 && stops.length <= 4, `${theme.id} has ${stops.length} gradient stops`);
    }
    for (const color of Object.values(theme.colors)) assert.match(color, /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i);
    for (const [purpose, ratio] of Object.entries(theme.contrast)) {
      const minimum = purpose.startsWith("focus") || purpose.startsWith("border") ? 3 : 4.5;
      assert.ok(ratio >= minimum, `${theme.id} ${purpose} contrast ${ratio} is too low`);
    }
    assert.equal(theme.gradients.primaryButton.length > 0, true);
    const variables = themeCssVariables(theme);
    assert.equal(variables["--sk-theme-accent"], theme.colors.accent);
    assert.equal(variables["--sk-theme-gradient-accent"], theme.gradients.accent);
    assert.equal(variables["--sk-theme-primary"], theme.gradients.primary);
    assert.equal(variables["--sk-theme-color-primary"], theme.colors.primary);
    assert.equal(variables["--sk-theme-pageBackground"], theme.gradients.pageBackground);
    assert.equal(variables["--sk-theme-color-pageBackground"], theme.colors.pageBackground);
    assert.equal(variables["--sk-theme-color-accentForeground"], theme.colors.accentForeground);
    assert.equal(variables["--sk-theme-color-accentOnDark"], theme.colors.accentOnDark);
    assert.equal(variables["--sk-theme-color-focusOnDark"], theme.colors.focusOnDark);
    assert.equal(variables["--sk-theme-color-borderOnDark"], theme.colors.borderOnDark);
  }
  assert.equal(ORIGINAL_THEME_ID, "royal-navy-gold-01");
  assert.equal(ORIGINAL_THEME.id, ORIGINAL_THEME_ID);
  assert.equal(resolveStoreTheme("not-allowlisted").id, ORIGINAL_THEME_ID);
  assert.ok(themeCssVariables(ORIGINAL_THEME)["--sk-theme-header"]);
});

test("all storefront CSS theme variables resolve from every palette", () => {
  const cssDirectories = ["src/app", "src/components"];
  const referenced = new Set<string>();
  const variablePattern = /var\((--sk-theme-[A-Za-z0-9_-]+)/g;

  const collectCss = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) collectCss(path);
      else if (entry.isFile() && entry.name.endsWith(".css")) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(variablePattern)) referenced.add(match[1]);
      }
    }
  };
  for (const directory of cssDirectories) collectCss(directory);

  assert.ok(referenced.size > 0);
  for (const theme of STORE_THEMES) {
    const provided: Record<string, string> = themeCssVariables(theme);
    for (const variable of referenced) {
      assert.ok(provided[variable], `${theme.id} is missing ${variable}`);
    }
  }
});
