import { test, expect } from "@playwright/test";

test.describe("Score Crediticio", () => {
  test("Página carga sin errores", async ({ page }) => {
    await page.goto("/score-crediticio");

    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Heading: "Score Crediticio" (h1 en el panel izquierdo)
    await expect(
      page.getByRole("heading", { name: "Score Crediticio" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Panel de búsqueda y configuración visibles", async ({ page }) => {
    await page.goto("/score-crediticio");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Input de búsqueda de clientes
    const searchInput = page.getByPlaceholder("Buscar cliente o NIT...");
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    // Verificar que la sección de configuración existe (tab "Configuración" con ícono Settings2)
    await expect(page.getByText("Configuración")).toBeVisible();
  });

  test("Tab Score Crediticio muestra contenido", async ({ page }) => {
    await page.goto("/score-crediticio");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // El texto "Score Crediticio" aparece como tab activo y como heading
    await expect(
      page.getByRole("heading", { name: "Score Crediticio" }),
    ).toBeVisible({ timeout: 15_000 });

    // No debe haber errores visibles en la página
    await expect(page.locator("text=Error")).not.toBeVisible();
  });
});
