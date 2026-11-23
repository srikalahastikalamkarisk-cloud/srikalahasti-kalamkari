export const ORIGINAL_THEME_ID = "royal-navy-gold-01";

export type StoreTheme = {
  id: string;
  name: string;
  familyId: string;
  familyName: string;
  variation: number;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    foreground: string;
    heading: string;
    body: string;
    muted: string;
    pageBackground: string;
    sectionBackground: string;
    surface: string;
    surfaceSoft: string;
    cardBackground: string;
    border: string;
    divider: string;
    focus: string;
    accent: string;
    accentText: string;
    accentForeground: string;
    accentOnDark: string;
    focusOnDark: string;
    borderOnDark: string;
    headerBackground: string;
    headerText: string;
    navigationBackground: string;
    navigationText: string;
    footerBackground: string;
    footerText: string;
    inputBackground: string;
    buttonText: string;
    onDark: string;
    success: string;
    error: string;
  };
  contrast: {
    foregroundOnSurface: number;
    onDark: number;
    buttonTextOnPrimary: number;
    accentTextOnAccent: number;
    accentForegroundOnSurface: number;
    accentOnDark: number;
    mutedOnSurface: number;
    successOnSurface: number;
    errorOnSurface: number;
    focusOnSurface: number;
    borderOnSurface: number;
    focusOnDark: number;
    borderOnDark: number;
  };
  gradients: {
    accent: string;
    primary: string;
    secondary: string;
    header: string;
    navigation: string;
    heroOverlay: string;
    pageBackground: string;
    sectionBackground: string;
    alternateSection: string;
    card: string;
    elevatedCard: string;
    input: string;
    badge: string;
    primaryButton: string;
    secondaryButton: string;
    buttonHover: string;
    footer: string;
    loading: string;
    skeleton: string;
    hover: string;
  };
};

type Family = {
  id: string;
  name: string;
  dark: string;
  mids: [string, string, string, string, string];
  accents: [string, string, string, string, string];
  canvas: string;
  surface: string;
  soft: string;
  accentText: string;
  muted: string;
  description: string;
};

const families: Family[] = [
  { id: "royal-navy-gold", name: "Royal Navy & Gold", dark: "#08162c", mids: ["#10213b", "#172b49", "#1d3554", "#263b58", "#0e2039"], accents: ["#a77b38", "#b58a43", "#c49a55", "#d0ab68", "#8e682e"], canvas: "#f8f3e9", surface: "#fffdf8", soft: "#f1e8d8", accentText: "#08162c", muted: "#626e7d", description: "The original atelier navy, warmed with heirloom gold." },
  { id: "emerald-heritage", name: "Emerald Heritage", dark: "#082923", mids: ["#10443a", "#165347", "#1c6252", "#286b58", "#103c35"], accents: ["#a9894e", "#b79a5e", "#c6aa70", "#d3bb82", "#846932"], canvas: "#f1f6ef", surface: "#fcfff9", soft: "#e6eee4", accentText: "#082923", muted: "#5c7067", description: "Deep botanical green with antique metalwork." },
  { id: "burgundy-rose-gold", name: "Burgundy & Rose Gold", dark: "#2b1420", mids: ["#512436", "#632c40", "#75374a", "#824553", "#482032"], accents: ["#ad7774", "#bd8881", "#cc9990", "#d5aaa0", "#956363"], canvas: "#f8f0ed", surface: "#fffaf7", soft: "#f1e4df", accentText: "#2b1420", muted: "#74666a", description: "Rich garnet tones paired with soft rose gold." },
  { id: "midnight-purple", name: "Midnight Purple", dark: "#17152d", mids: ["#30274c", "#3c315b", "#4b396a", "#564578", "#292443"], accents: ["#9883bd", "#a794ca", "#b7a5d6", "#c5b4df", "#786598"], canvas: "#f3f0f7", surface: "#fdfbff", soft: "#e9e3f1", accentText: "#17152d", muted: "#696477", description: "A contemplative violet palette with heirloom depth." },
  { id: "peacock-teal", name: "Peacock Teal", dark: "#06272d", mids: ["#0b4650", "#10545d", "#17636b", "#26737a", "#0a3d47"], accents: ["#b47b55", "#c18c65", "#ce9d76", "#d9ad88", "#966344"], canvas: "#eff5f3", surface: "#fbfffd", soft: "#e2eeeb", accentText: "#06272d", muted: "#5e7072", description: "Jewel-toned peacock teal lifted by warm copper." },
  { id: "terracotta-copper", name: "Terracotta & Copper", dark: "#321b17", mids: ["#63352b", "#744033", "#854b3a", "#955b46", "#572b24"], accents: ["#b66e49", "#c27b55", "#cf8b64", "#d99a73", "#985938"], canvas: "#f8f0e9", surface: "#fffaf5", soft: "#f0e2d7", accentText: "#321b17", muted: "#76665d", description: "Earth-fired clay colors, burnished with copper." },
  { id: "champagne-ivory", name: "Champagne & Ivory", dark: "#342d25", mids: ["#615344", "#71614e", "#82715b", "#76644f", "#554738"], accents: ["#aa8953", "#ba9961", "#c8a972", "#d6ba86", "#8c7044"], canvas: "#faf7f0", surface: "#fffefa", soft: "#f1ecdf", accentText: "#342d25", muted: "#706b61", description: "Quiet champagne neutrals with a refined ivory glow." },
  { id: "sapphire-blue", name: "Sapphire Blue", dark: "#071a39", mids: ["#123661", "#194678", "#20568b", "#2b659a", "#0e2d57"], accents: ["#aa854c", "#b9955b", "#c7a66d", "#d4b67e", "#8e6d3d"], canvas: "#eff4f8", surface: "#fbfdff", soft: "#e1eaf1", accentText: "#071a39", muted: "#5d6c7d", description: "Saturated sapphire softened by traditional gold." },
  { id: "forest-antique-gold", name: "Forest & Antique Gold", dark: "#0e241c", mids: ["#234536", "#2d5742", "#39674d", "#487657", "#1d3b2d"], accents: ["#9e8145", "#ad9052", "#bea063", "#ccb074", "#826938"], canvas: "#f1f4ec", surface: "#fcfdf8", soft: "#e6ebdf", accentText: "#0e241c", muted: "#626d60", description: "Forest shade and timeworn gold, grounded and calm." },
  { id: "royal-plum", name: "Royal Plum", dark: "#25152a", mids: ["#4b2b50", "#5c3460", "#6c3e70", "#7c4c7e", "#422547"], accents: ["#b28a70", "#c0997c", "#cda88b", "#d8b89b", "#88654d"], canvas: "#f6f0f5", surface: "#fffbff", soft: "#ede3eb", accentText: "#25152a", muted: "#706371", description: "Royal plum with a delicate antique blush." },
];

const familyVariants = ["Atelier", "Heirloom", "Temple", "Silk", "Ceremony"] as const;

function luminance(hex: string) {
  const raw = hex.slice(1, 7);
  const channels = [0, 2, 4].map(index => parseInt(raw.slice(index, index + 2), 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
}

function accessibleText(color: string, surface: string, minimum = 4.5) {
  if (contrastRatio(color, surface) >= minimum) return color;
  const rgb = [0, 2, 4].map(index => parseInt(color.slice(index + 1, index + 3), 16));
  for (let factor = 0.99; factor >= 0.01; factor -= 0.01) {
    const candidate = `#${rgb.map(channel => Math.round(channel * factor).toString(16).padStart(2, "0")).join("")}`;
    if (contrastRatio(candidate, surface) >= minimum) return candidate;
  }
  return "#111111";
}

function mixHex(first: string, second: string, weight: number) {
  const a = [0, 2, 4].map(index => parseInt(first.slice(index + 1, index + 3), 16));
  const b = [0, 2, 4].map(index => parseInt(second.slice(index + 1, index + 3), 16));
  return `#${a.map((value, index) => Math.round(value * (1 - weight) + b[index] * weight).toString(16).padStart(2, "0")).join("")}`;
}

function accessibleLightText(color: string, backgrounds: string | string[], minimum = 4.5) {
  const samples = Array.isArray(backgrounds) ? backgrounds : [backgrounds];
  const passes = (candidate: string) => samples.every(background => contrastRatio(candidate, background) >= minimum);
  if (passes(color)) return color;
  for (let weight = 0.01; weight <= 1; weight += 0.01) {
    const candidate = mixHex(color, "#fffdf8", weight);
    if (passes(candidate)) return candidate;
  }
  return "#fffdf8";
}

export const STORE_THEMES: StoreTheme[] = families.flatMap(family =>
  family.mids.map((mid, index) => {
    const isOriginal = family.id === "royal-navy-gold" && index === 0;
    const accent = isOriginal ? "#b58a43" : family.accents[index];
    const foreground = isOriginal ? "#1c2737" : family.dark;
    const muted = accessibleText(family.muted, family.surface);
    // Keep a small safety margin because contrast diagnostics are rounded to
    // two decimals; a stored 4.50 must also pass with the actual RGB values.
    const accentForeground = accessibleText(accent, family.surface, 4.55);
    const accentOnDark = accessibleLightText(accent, [family.dark, mid], 4.55);
    const focus = accessibleText(accent, family.surface, 3);
    const border = accessibleText(accent, family.surface, 3);
    const focusOnDark = accessibleLightText(accent, [family.dark, mid], 3.05);
    const borderOnDark = accessibleLightText(accent, [family.dark, mid], 3.05);
    const inverseTextCandidate = mixHex(family.surface, accent, 0.08);
    const inverseText = Math.min(
      contrastRatio(inverseTextCandidate, family.dark),
      contrastRatio(inverseTextCandidate, mid),
    ) >= 4.5 ? inverseTextCandidate : "#fffdf8";
    const solidNavy = "#10213b";
    const accentText = contrastRatio(family.accentText, accent) >= 4.5
      ? family.accentText
      : contrastRatio("#111111", accent) >= 4.5
        ? "#111111"
        : "#fffdf8";
    const id = `${family.id}-${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      name: `${family.name} ${familyVariants[index]}`,
      familyId: family.id,
      familyName: family.name,
      variation: index + 1,
      description: family.description,
      colors: {
        primary: family.dark,
        secondary: mid,
        foreground,
        heading: foreground,
        body: foreground,
        muted,
        pageBackground: family.canvas,
        sectionBackground: family.surface,
        surface: family.surface,
        surfaceSoft: family.soft,
        cardBackground: family.surface,
        border,
        divider: `${border}aa`,
        focus,
        accent,
        accentText,
        accentForeground,
        accentOnDark,
        focusOnDark,
        borderOnDark,
        headerBackground: family.dark,
        headerText: inverseText,
        navigationBackground: mid,
        navigationText: inverseText,
        footerBackground: family.dark,
        footerText: inverseText,
        inputBackground: family.surface,
        buttonText: inverseText,
        onDark: inverseText,
        success: "#27734a",
        error: "#a23b32",
      },
      contrast: {
        foregroundOnSurface: contrastRatio(foreground, family.surface),
        onDark: Math.min(contrastRatio(inverseText, family.dark), contrastRatio(inverseText, mid)),
        buttonTextOnPrimary: Math.min(contrastRatio(inverseText, family.dark), contrastRatio(inverseText, mid)),
        accentTextOnAccent: contrastRatio(accentText, accent),
        accentForegroundOnSurface: contrastRatio(accentForeground, family.surface),
        accentOnDark: Math.min(contrastRatio(accentOnDark, family.dark), contrastRatio(accentOnDark, mid)),
        mutedOnSurface: contrastRatio(muted, family.surface),
        successOnSurface: contrastRatio("#27734a", family.surface),
        errorOnSurface: contrastRatio("#a23b32", family.surface),
        focusOnSurface: contrastRatio(focus, family.surface),
        borderOnSurface: contrastRatio(border, family.surface),
        focusOnDark: Math.min(contrastRatio(focusOnDark, family.dark), contrastRatio(focusOnDark, mid)),
        borderOnDark: Math.min(contrastRatio(borderOnDark, family.dark), contrastRatio(borderOnDark, mid)),
      },
      gradients: {
        accent: `linear-gradient(120deg, ${family.accents[Math.max(0, index - 1)]} 0%, ${accent} 52%, ${family.accents[Math.min(4, index + 1)]} 100%)`,
        primary: isOriginal ? `linear-gradient(135deg, ${solidNavy} 0%, ${solidNavy} 100%)` : `linear-gradient(135deg, ${family.dark} 0%, ${mid} 100%)`,
        secondary: `linear-gradient(120deg, ${family.surface} 0%, ${family.soft} 58%, ${accent}33 100%)`,
        header: isOriginal ? `linear-gradient(112deg, ${solidNavy} 0%, ${solidNavy} 100%)` : `linear-gradient(112deg, ${family.dark} 0%, ${mid} 100%)`,
        navigation: isOriginal ? `linear-gradient(90deg, ${solidNavy} 0%, ${solidNavy} 100%)` : `linear-gradient(90deg, ${mid} 0%, ${family.dark} 100%)`,
        heroOverlay: `linear-gradient(90deg, ${family.dark}f2 0%, ${family.dark}bf 42%, ${family.dark}25 100%)`,
        pageBackground: isOriginal ? `linear-gradient(180deg, #f8f3e9 0%, #f8f3e9 100%)` : `linear-gradient(180deg, ${family.canvas} 0%, ${family.surface} 52%, ${family.soft} 100%)`,
        sectionBackground: `linear-gradient(135deg, ${family.surface} 0%, ${family.canvas} 100%)`,
        alternateSection: `linear-gradient(135deg, ${family.canvas} 0%, ${family.soft} 100%)`,
        card: `linear-gradient(145deg, ${family.surface} 0%, ${family.soft} 100%)`,
        elevatedCard: `linear-gradient(145deg, ${family.surface} 0%, ${family.canvas} 58%, ${family.soft} 100%)`,
        input: `linear-gradient(180deg, ${family.surface} 0%, ${family.canvas} 100%)`,
        badge: `linear-gradient(135deg, ${family.dark} 0%, ${mid} 100%)`,
        primaryButton: isOriginal ? `linear-gradient(105deg, ${solidNavy} 0%, ${solidNavy} 100%)` : `linear-gradient(105deg, ${family.dark} 0%, ${mid} 100%)`,
        secondaryButton: `linear-gradient(120deg, ${family.surface} 0%, ${family.soft} 100%)`,
        buttonHover: `linear-gradient(105deg, ${family.dark} 0%, ${family.mids[(index + 1) % 5]} 100%)`,
        footer: isOriginal ? `linear-gradient(145deg, ${solidNavy} 0%, ${solidNavy} 100%)` : `linear-gradient(145deg, ${family.dark} 0%, ${mid} 100%)`,
        loading: `radial-gradient(ellipse at 50% 35%, ${mid} 0%, ${family.dark} 70%)`,
        skeleton: `linear-gradient(90deg, ${family.soft} 0%, ${family.surface} 50%, ${family.soft} 100%)`,
        hover: `linear-gradient(105deg, ${family.dark} 0%, ${mid} 100%)`,
      },
    } satisfies StoreTheme;
  }),
);

export const THEME_FAMILIES = families.map(({ id, name }) => ({ id, name }));
export const STORE_THEME_BY_ID = new Map(STORE_THEMES.map(theme => [theme.id, theme]));
export const ORIGINAL_THEME = STORE_THEME_BY_ID.get(ORIGINAL_THEME_ID)!;

export function resolveStoreTheme(themeId: string | null | undefined): StoreTheme {
  return (themeId && STORE_THEME_BY_ID.get(themeId)) || ORIGINAL_THEME;
}

export function themeCssVariables(theme: StoreTheme): Record<`--sk-theme-${string}`, string> {
  const css: Record<string, string> = {};
  const gradientKeys = new Set(Object.keys(theme.gradients));
  for (const [key, value] of Object.entries(theme.colors)) {
    css[`--sk-theme-color-${key}`] = value;
    if (!gradientKeys.has(key) || key === "accent") css[`--sk-theme-${key}`] = value;
  }
  for (const [key, value] of Object.entries(theme.gradients)) {
    css[key === "accent" ? "--sk-theme-gradient-accent" : `--sk-theme-${key}`] = value;
  }
  return css as Record<`--sk-theme-${string}`, string>;
}
