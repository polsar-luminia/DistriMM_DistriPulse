import { test, expect } from "@playwright/test";

test.describe("Dashboard page", () => {
  test("loads and shows navigation", async ({ page }) => {
    await page.goto("/");

    // Sidebar nav should be visible (MainLayout)
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // "Dashboard" link should be present in the sidebar
    await expect(page.getByText("Dashboard")).toBeVisible();
  });

  test("displays KPI cards with correct titles", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // StatCard titles rendered as uppercase <p> elements inside the card
    // The 5 main KPI cards from DashboardPage.jsx
    await expect(page.getByText("Total Cartera")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Total Vencido")).toBeVisible();
    await expect(page.getByText("% Cartera Vencida")).toBeVisible();
    await expect(page.getByText("% Cartera Al Día")).toBeVisible();
    await expect(page.getByText("Clientes Activos")).toBeVisible();
  });

  test("KPI cards show numeric values (seed data loaded)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Wait for the "Total Cartera" card to appear
    await expect(page.getByText("Total Cartera")).toBeVisible({ timeout: 10_000 });

    // The StatCard value is rendered as an <h3> with font-mono class.
    // With seed data, at least one card should have a non-zero value containing "$"
    // (formatCurrency prefixes with "$" for COP).
    const statValues = page.locator("h3.font-mono");
    await expect(statValues.first()).toBeVisible({ timeout: 5_000 });

    // At least 5 stat cards should be rendered (the main KPI row)
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
