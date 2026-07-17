import { expect, test } from "@playwright/test";
import { mockStockApi } from "./fixtures";

/**
 * Demo end-to-end happy path for Cursor Trade.
 * API traffic is mocked so the suite stays deterministic offline.
 */
test.describe("Cursor Trade demo", () => {
  test.beforeEach(async ({ page }) => {
    await mockStockApi(page);
  });

  test("loads market strip and AAPL chart, then searches MSFT and switches horizon", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Cursor Trade/);

    const marketStrip = page.getByLabel("US market session and benchmark indexes");
    await expect(marketStrip).toBeVisible();
    await expect(marketStrip.getByText("Market open")).toBeVisible();
    await expect(marketStrip.getByText("S&P 500")).toBeVisible();
    await expect(marketStrip.getByText("Dow")).toBeVisible();
    await expect(marketStrip.getByText("Nasdaq")).toBeVisible();

    await expect(page.getByRole("heading", { name: "AAPL" })).toBeVisible();
    await expect(page.getByLabel("Price chart")).toBeVisible();
    await expect(page.getByText(/198\.50/)).toBeVisible();

    await page.getByRole("textbox", { name: "Ticker" }).fill("MSFT");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByRole("heading", { name: "MSFT" })).toBeVisible();
    await expect(page.getByText(/425\.10/)).toBeVisible();
    await expect(page.getByLabel("Price chart")).toBeVisible();

    await page.getByRole("button", { name: "1 Year" }).click();
    await expect(page.getByRole("button", { name: "1 Year" })).toHaveClass(/active/);
    await expect(page.getByRole("heading", { name: "MSFT" })).toBeVisible();
    await expect(page.getByLabel("Price chart")).toBeVisible();
  });
});
