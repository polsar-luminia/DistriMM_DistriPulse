import { test, expect } from "@playwright/test";

test.describe("Archivos (Gestión de Datos)", () => {
  test("Página carga correctamente", async ({ page }) => {
    await page.goto("/archivos");

    // Esperar que cargue el layout
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Heading: "Gestión de Datos"
    await expect(
      page.getByRole("heading", { name: "Gestión de Datos" }),
    ).toBeVisible();

    // Subtítulo descriptivo
    await expect(
      page.getByText("Historial de cargas y archivos procesados en el sistema"),
    ).toBeVisible();
  });

  test("Carga seedeada E2ETEST_cartera.xlsx aparece en la lista", async ({
    page,
  }) => {
    await page.goto("/archivos");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Las cargas se renderizan como cards con el nombre_archivo
    await expect(
      page.getByText("E2ETEST_cartera.xlsx"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Botón de nueva carga existe", async ({ page }) => {
    await page.goto("/archivos");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Botón "Nueva Carga" con ícono Upload
    await expect(
      page.getByRole("button", { name: /Nueva Carga/i }),
    ).toBeVisible();
  });
});
