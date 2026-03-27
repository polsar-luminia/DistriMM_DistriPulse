import { test, expect } from "@playwright/test";

test.describe("Auth smoke tests", () => {
  test("Dashboard loads with authenticated session", async ({ page }) => {
    await page.goto("/");

    // Sidebar nav should be visible (MainLayout renders <nav> with sections)
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Verify a known nav link exists — "Dashboard" in the TABLERO section
    await expect(page.getByText("Dashboard")).toBeVisible();
  });

  test("Logout redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // The logout button has aria-label="Cerrar sesion" (MainLayout.jsx line 311)
    const logoutButton = page.locator('button[aria-label="Cerrar sesion"]');
    await logoutButton.click();

    // ConfirmDialog appears with "Cerrar sesion" confirm button
    await expect(page.getByText("¿Estas seguro que deseas cerrar sesion?")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesion" }).click();

    // Should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Iniciar Sesión" }),
    ).toBeVisible();
  });
});
