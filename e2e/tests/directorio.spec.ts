import { test, expect } from "@playwright/test";
import { TEST_CLIENTE_NIT } from "../helpers/constants";

test.describe("Directorio de Clientes", () => {
  test("Página carga correctamente", async ({ page }) => {
    await page.goto("/directorio");

    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Heading: "Directorio de Clientes"
    await expect(
      page.getByRole("heading", { name: "Directorio de Clientes" }),
    ).toBeVisible();

    // KPI cards visibles
    await expect(page.getByText("Total Clientes")).toBeVisible();
    await expect(page.getByText("Personas Juridicas")).toBeVisible();
  });

  test("Buscar cliente por NIT", async ({ page }) => {
    await page.goto("/directorio");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Esperar que cargue el contenido (spinner desaparece)
    await expect(
      page.getByRole("heading", { name: "Directorio de Clientes" }),
    ).toBeVisible({ timeout: 15_000 });

    // Input de búsqueda con placeholder "Buscar por nombre, NIT, celular, correo..."
    const searchInput = page.getByPlaceholder(
      "Buscar por nombre, NIT, celular, correo...",
    );
    await expect(searchInput).toBeVisible();
    await searchInput.fill(TEST_CLIENTE_NIT);

    // Esperar debounce (300ms) + render
    await page.waitForTimeout(500);

    // El NIT del cliente de prueba debe aparecer en los resultados
    await expect(page.getByText(TEST_CLIENTE_NIT)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Cliente de prueba aparece en resultados", async ({ page }) => {
    await page.goto("/directorio");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("heading", { name: "Directorio de Clientes" }),
    ).toBeVisible({ timeout: 15_000 });

    const searchInput = page.getByPlaceholder(
      "Buscar por nombre, NIT, celular, correo...",
    );
    await searchInput.fill(TEST_CLIENTE_NIT);
    await page.waitForTimeout(500);

    // Verificar que el nombre del cliente E2E también aparece
    await expect(page.getByText("E2ETEST Cliente Uno")).toBeVisible({
      timeout: 5_000,
    });
  });
});
