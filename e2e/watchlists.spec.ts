import { expect, test, type Page } from "@playwright/test";
import { mockMarketContext, mockPricesResponse } from "./fixtures";

const WATCHLISTS_STORAGE_KEY = "stock-visualizer:watchlists:v1";

async function installApiMocks(page: Page) {
  await page.route("**/api/market-context**", async (route) => {
    await route.fulfill({ json: mockMarketContext });
  });

  await page.route("**/api/prices**", async (route) => {
    const url = new URL(route.request().url());
    const ticker = url.searchParams.get("ticker") ?? "AAPL";
    await route.fulfill({ json: mockPricesResponse(ticker) });
  });
}

async function openFreshApp(page: Page) {
  await installApiMocks(page);
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), WATCHLISTS_STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Watchlists" })).toBeVisible();
  await expect(page.locator(".ticker-display")).toHaveText("AAPL", { timeout: 15_000 });
}

test.describe("Watchlists user journey", () => {
  test("creates a watchlist, explores stocks, and persists after reload", async ({ page }) => {
    await openFreshApp(page);

    await page.getByLabel("List name").fill("Tech");
    await page.getByRole("button", { name: "New" }).click();
    await expect(page.locator(".watchlists-select")).toContainText("Tech");

    const addForm = page.locator(".watchlists-add-form");
    await addForm.getByLabel("Add ticker").fill("MSFT");
    await addForm.getByRole("button", { name: "Add" }).click();
    const msftChip = page.locator(".watchlists-chip", { hasText: "MSFT" });
    await expect(msftChip).toBeVisible();

    await addForm.getByLabel("Add ticker").fill("GOOG");
    await addForm.getByRole("button", { name: "Add" }).click();
    const googChip = page.locator(".watchlists-chip", { hasText: "GOOG" });
    await expect(googChip).toBeVisible();

    await msftChip.click();
    await expect(page.locator(".ticker-display")).toHaveText("MSFT");
    await expect(page.locator('input[name="ticker"]')).toHaveValue("MSFT");

    await googChip.click();
    await expect(page.locator(".ticker-display")).toHaveText("GOOG");
    await expect(googChip).toHaveClass(/active/);

    await addForm.getByLabel("Add ticker").fill("BAD!");
    await addForm.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid ticker format");
    await expect(page.locator(".ticker-display")).toHaveText("GOOG");

    await page.reload();
    await expect(page.locator(".watchlists-select")).toContainText("Tech");
    await expect(page.locator(".watchlists-chip", { hasText: "MSFT" })).toBeVisible();
    await expect(page.locator(".watchlists-chip", { hasText: "GOOG" })).toBeVisible();
    await expect(page.locator(".ticker-display")).toHaveText("GOOG", { timeout: 15_000 });
    await expect(page.locator(".watchlists-chip", { hasText: "GOOG" })).toHaveClass(/active/);
  });
});
