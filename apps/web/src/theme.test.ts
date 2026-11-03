import { describe, expect, test } from "bun:test";
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  parseThemePreference,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
} from "./theme";

describe("parseThemePreference", () => {
  test("accepts light, dark, and system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  test("defaults missing or unknown values to system", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference("")).toBe("system");
    expect(parseThemePreference("Dim")).toBe("system");
  });
});

describe("resolveTheme", () => {
  test("explicit modes ignore the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("system follows prefers-color-scheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("storage helpers", () => {
  test("readStoredTheme uses the shared key and falls back", () => {
    const storage = {
      getItem(key: string) {
        expect(key).toBe(THEME_STORAGE_KEY);
        return "dark";
      },
    };
    expect(readStoredTheme(storage)).toBe("dark");
    expect(
      readStoredTheme({
        getItem() {
          throw new Error("blocked");
        },
      }),
    ).toBe("system");
  });

  test("writeStoredTheme persists an explicit choice", () => {
    const written: Record<string, string> = {};
    writeStoredTheme("light", {
      setItem(key, value) {
        written[key] = value;
      },
      removeItem() {
        throw new Error("should not remove");
      },
    });
    expect(written[THEME_STORAGE_KEY]).toBe("light");
  });

  test("writeStoredTheme clears storage for system", () => {
    const removed: string[] = [];
    writeStoredTheme("system", {
      setItem() {
        throw new Error("should not set");
      },
      removeItem(key) {
        removed.push(key);
      },
    });
    expect(removed).toEqual([THEME_STORAGE_KEY]);
  });

  test("writeStoredTheme ignores storage failures so listeners can still attach", () => {
    expect(() =>
      writeStoredTheme("dark", {
        setItem() {
          throw new Error("blocked");
        },
        removeItem() {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});

describe("applyThemeToDocument", () => {
  function fakeRoot() {
    const classes = new Set<string>();
    const style = { colorScheme: "" };
    return {
      classes,
      style,
      root: {
        classList: {
          add(...tokens: string[]) {
            for (const token of tokens) classes.add(token);
          },
          remove(...tokens: string[]) {
            for (const token of tokens) classes.delete(token);
          },
        },
        style,
      },
    };
  }

  test("explicit dark sets the .dark class and color-scheme", () => {
    const { classes, style, root } = fakeRoot();
    expect(applyThemeToDocument("dark", false, root)).toBe("dark");
    expect([...classes]).toEqual(["dark"]);
    expect(style.colorScheme).toBe("dark");
  });

  test("explicit light sets the .light class so OS dark does not win", () => {
    const { classes, style, root } = fakeRoot();
    expect(applyThemeToDocument("light", true, root)).toBe("light");
    expect([...classes]).toEqual(["light"]);
    expect(style.colorScheme).toBe("light");
  });

  test("system leaves html without .dark/.light so CSS can follow prefers-color-scheme", () => {
    const { classes, style, root } = fakeRoot();
    expect(applyThemeToDocument("system", true, root)).toBe("dark");
    expect([...classes]).toEqual([]);
    expect(style.colorScheme).toBe("dark");
  });
});

describe("theme boot script", () => {
  test("index.html applies the stored theme class before the app module loads", async () => {
    const html = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const scriptAt = html.indexOf("localStorage.getItem");
    const rootAt = html.indexOf('id="root"');
    expect(scriptAt).toBeGreaterThan(-1);
    expect(rootAt).toBeGreaterThan(scriptAt);
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    expect(html).toContain('stored === "light"');
    expect(html).toContain('stored === "dark"');
    expect(html).toContain('stored === "system"');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain('classList.add("dark")');
    expect(html).toContain('classList.add("light")');
    expect(html).toContain("colorScheme");
  });
});

describe("SpaceXSI light tokens", () => {
  test("light :root uses the final muted / event-div / up / down inks", async () => {
    const css = await Bun.file(new URL("./index.css", import.meta.url)).text();
    const root = css.slice(css.indexOf(":root"), css.indexOf("html.dark"));
    expect(root).toMatch(/--fg-muted:\s*#5f6368/);
    expect(root).toMatch(/--event-div:\s*#b84300/);
    expect(root).toMatch(/--up:\s*#137638/);
    expect(root).toMatch(/--down:\s*#b81e1e/);
    expect(root).not.toMatch(/--fg-muted:\s*#676a6f/);
    expect(root).not.toMatch(/--fg-muted:\s*#3c4553/);
    expect(root).not.toMatch(/--fg-muted:\s*#7d8187/);
    expect(root).not.toContain("--muted-fg");
    expect(root).not.toMatch(/--up:\s*#15803d/);
    expect(root).not.toMatch(/--down:\s*#dc2626/);
  });

  test("dark muted is #9a9ea5, not fog, and event-div is sunset", async () => {
    const css = await Bun.file(new URL("./index.css", import.meta.url)).text();
    const dark = css.slice(css.indexOf("html.dark"), css.indexOf("@media"));
    expect(dark).toMatch(/--fg-muted:\s*#9a9ea5/);
    expect(dark).toMatch(/--event-div:\s*#ff6308/);
    expect(dark).toMatch(/--up:\s*#4ade80/);
    expect(dark).toMatch(/--down:\s*#e66565/);
    expect(dark).toMatch(/--grid:\s*#2e3033/);
    expect(dark).not.toMatch(/--fg-muted:\s*#7d8187/);
    expect(dark).not.toContain("--muted-fg");
  });
});

describe("SI-69 chart / chrome colors", () => {
  test("price area uses --fg-strong at 6% and never sunset", async () => {
    const src = await Bun.file(new URL("./PriceChart.tsx", import.meta.url)).text();
    expect(src).toMatch(/stopColor="var\(--fg-strong\)"\s+stopOpacity=\{0\.06\}/);
    expect(src).toMatch(/stroke="var\(--fg-strong\)"/);
    expect(src).not.toMatch(/stopColor="var\(--accent\)"/);
    expect(src).not.toMatch(/stroke="var\(--accent\)"/);
    expect(src).not.toContain("#ff6308");
  });

  test("Search and selected range are --fg-strong pills, not sunset or green", async () => {
    const css = await Bun.file(new URL("./app.css", import.meta.url)).text();
    expect(css).toMatch(/\.search-btn\s*\{[^}]*background:\s*var\(--fg-strong\)/s);
    expect(css).toMatch(/\.search-btn\s*\{[^}]*color:\s*var\(--bg\)/s);
    expect(css).toMatch(/\.horizon-btn\.active\s*\{[^}]*background:\s*var\(--fg-strong\)/s);
    expect(css).toMatch(/\.horizon-btn\.active\s*\{[^}]*color:\s*var\(--bg\)/s);
    expect(css).toMatch(/\.horizon-btn\s*\{[^}]*border-radius:\s*var\(--radius-pill\)/s);
    expect(css).not.toMatch(/\.search-btn\s*\{[^}]*#ff6308/s);
    expect(css).not.toMatch(/\.horizon-btn\.active\s*\{[^}]*--up/s);
  });

  test("range track hugs content at 480px+ and stays full-width below 480px", async () => {
    const css = await Bun.file(new URL("./app.css", import.meta.url)).text();
    expect(css).toMatch(/\.horizon-buttons\s*\{[^}]*width:\s*auto/s);
    expect(css).toMatch(/\.horizon-buttons\s*\{[^}]*display:\s*inline-flex/s);
    expect(css).toMatch(/\.horizon-buttons\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--fg-strong\) 4%, transparent\)/s);
    expect(css).toMatch(/\.horizon-btn\s*\{[^}]*flex:\s*none/s);
    expect(css).toMatch(/\.horizon-btn\s*\{[^}]*padding:\s*0 12px/s);
    expect(css).toMatch(/\.horizon-btn\s*\{[^}]*font-size:\s*13px/s);
    expect(css).toMatch(/\.horizon-btn\s*\{[^}]*min-height:\s*44px/s);
    const mobile = css.slice(css.indexOf("@media (max-width: 479px)"));
    expect(mobile).toMatch(/\.horizon-buttons\s*\{[^}]*width:\s*100%/s);
    expect(mobile).toMatch(/\.horizon-buttons\s*\{[^}]*display:\s*flex/s);
    expect(mobile).toMatch(/\.horizon-btn\s*\{[^}]*flex:\s*1/s);
    expect(mobile).toMatch(/\.horizon-btn\s*\{[^}]*padding:\s*0 8px/s);
  });
});

describe("mobile range labels and page padding", () => {
  test("short range labels and aria-labels exist for viewports below 400px", async () => {
    const src = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
    expect(src).toContain('shortLabel: "1Y"');
    expect(src).toContain('shortLabel: "5Y"');
    expect(src).toContain('shortLabel: "All"');
    expect(src).toContain('ariaLabel: "1 year"');
    expect(src).toContain('ariaLabel: "5 years"');
    expect(src).toContain('ariaLabel: "All time"');
    expect(src).not.toMatch(/Events/);
    const css = await Bun.file(new URL("./app.css", import.meta.url)).text();
    expect(css).toMatch(/@media \(max-width: 399px\)/);
    expect(css).toMatch(/\.horizon-btn__short\s*\{[^}]*display:\s*inline/s);
  });

  test("below 480px the page has 64px bottom padding", async () => {
    const css = await Bun.file(new URL("./index.css", import.meta.url)).text();
    expect(css).toMatch(/@media \(max-width: 480px\)\s*\{\s*body\s*\{[^}]*padding-bottom:\s*64px/s);
    const app = await Bun.file(new URL("./app.css", import.meta.url)).text();
    expect(app).toMatch(/\.shell\s*\{[^}]*padding:\s*16px 16px 64px/s);
  });
});

describe("Geist variable fonts", () => {
  test("main.tsx loads the self-hosted variable faces", async () => {
    const main = await Bun.file(new URL("./main.tsx", import.meta.url)).text();
    expect(main).toContain("@fontsource-variable/geist");
    expect(main).toContain("@fontsource-variable/geist-mono");
    expect(main).not.toContain("@fontsource/geist-sans");
    expect(main).not.toContain("@fontsource/geist-mono");
  });

  test("stacks use the registered variable family names", async () => {
    const css = await Bun.file(new URL("./index.css", import.meta.url)).text();
    const root = css.slice(css.indexOf(":root"), css.indexOf("html.dark"));
    expect(root).toMatch(/--font:\s*"Geist Variable", Arial, sans-serif/);
    expect(root).toMatch(/--font-mono:\s*"Geist Mono Variable", ui-monospace, monospace/);
  });
});
