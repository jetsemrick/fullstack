import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));

const SAGE_VALUES = [
  "#93af93",
  "#7b997b",
  "#f4f5f3",
  "#2b302b",
  "#6b726b",
  "#e2e4e0",
  "rgba(147, 175, 147, 0.2)",
];

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
      continue;
    }
    if (/\.(css|tsx|ts|html)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("Recreation.gov theme tokens", () => {
  test("index.css defines the brand palette and radius primitives", async () => {
    const css = await readFile(join(srcDir, "index.css"), "utf8");
    expect(css).toContain("--accent: #345d96;");
    expect(css).toContain("--accent-hover: #4a77b4;");
    expect(css).toContain("--accent-active: #2f4668;");
    expect(css).toContain("--bg: #f4f5f6;");
    expect(css).toContain("--card: #ffffff;");
    expect(css).toContain("--card-border: #dee0e3;");
    expect(css).toContain("--fg: #1a1e23;");
    expect(css).toContain("--fg-muted: #535c6a;");
    expect(css).toContain("--success: #4f762a;");
    expect(css).toContain("--success-bg: #eff6e8;");
    expect(css).toContain("--error: #b84a4a;");
    expect(css).toContain("--error-bg: #ffedef;");
    expect(css).toContain("--radius: 8px;");
    expect(css).toContain("--radius-sm: 4px;");
    expect(css).toContain('"Open Sans"');
  });

  test("apps/web source has no leftover sage-era colors", async () => {
    const files = await collectSourceFiles(srcDir);
    files.push(join(srcDir, "../index.html"));
    const hits: string[] = [];
    for (const file of files) {
      const text = await readFile(file, "utf8");
      const lower = text.toLowerCase();
      for (const value of SAGE_VALUES) {
        if (lower.includes(value.toLowerCase())) {
          hits.push(`${file}: ${value}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
