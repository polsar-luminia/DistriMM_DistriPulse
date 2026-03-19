import { test, expect } from "@playwright/test";
import { TEST_VENDEDOR_NOMBRE } from "../helpers/constants";

test.describe("Vendedores", () => {
  test("Página carga correctamente", async ({ page }) => {
    await page.goto("/vendedores");

    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Heading: "Vendedores"
    await expect(
      page.getByRole("heading", { name: "Vendedores" }),
    ).toBeVisible({ timeout: 15_000 });

    // Subtítulo
    await expect(
      page.getByText(
        "Desempeno de la fuerza de ventas y distribucion de cartera",
      ),
    ).toBeVisible();
  });

  test("KPI cards y datos de vendedores son visibles", async ({ page }) => {
    await page.goto("/vendedores");
    await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });

    // Esperar que termine la carga de vendedores
    await expect(
      page.getByRole("heading", { name: "Vendedores" }),
    ).toBeVisible({ timeout: 15_000 });

    // KPI cards
    await expect(page.getByText("Cartera Total")).toBeVisible();
    await expect(page.getByText("Vendedores Activos")).toBeVisible();
    await expect(page.getByText("Total Vencida")).toBeVisible();

    // Botón de generar informe
    await expect(
      page.getByRole("button", { name: /Generar Informe/i }),
    ).toBeVisible();
  });
});
