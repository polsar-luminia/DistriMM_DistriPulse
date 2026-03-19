import { test, expect } from "@playwright/test";

test.describe.serial("CFO Analysis page", () => {
  test("loads and shows page header", async ({ page }) => {
    await page.goto("/cfo");

    // PageHeader renders an <h1> with "Analista CFO"
    await expect(
      page.getByRole("heading", { name: "Analista CFO" }),
    ).toBeVisible({ timeout: 15_000 });

    // Subtext below the heading
    await expect(
      page.getByText("Diagnostico inteligente de cartera con IA"),
    ).toBeVisible();
  });

  test("shows empty state with generate button", async ({ page }) => {
    await page.goto("/cfo");

    // CfoEmptyState renders a heading and a "Generar Analisis CFO" button
    await expect(
      page.getByText("Analisis CFO con Inteligencia Artificial"),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: /Generar Analisis/i }),
    ).toBeVisible();

    // Feature tags should be present
    await expect(page.getByText("Semaforo de Salud")).toBeVisible();
    await expect(page.getByText("Plan de Accion")).toBeVisible();
  });

  test("generates analysis with mocked response", async ({ page }) => {
    // Intercept the Edge Function call
    await page.route("**/functions/v1/proxy-n8n-cfo", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          dashboard: {
            resumen_ejecutivo:
              "E2E test: La cartera presenta un estado saludable.",
            health_score: 75,
            indicadores_clave: [
              {
                nombre: "Cartera Total",
                valor: "$1.000.000",
                tendencia: "estable",
              },
              { nombre: "Morosidad", valor: "30%", tendencia: "baja" },
            ],
            distribucion_aging: {
              vigente: 700000,
              "1-30": 150000,
              "31-60": 100000,
              "61-90": 50000,
              "90+": 0,
            },
            top_deudores: [
              {
                cliente: "E2ETEST Cliente",
                nit: "9990000001",
                saldo: 1000000,
                dias_mora: 30,
              },
            ],
            plan_accion: [
              {
                accion: "Contactar cliente E2ETEST",
                prioridad: "Alta",
                impacto: "$1.000.000",
              },
            ],
            insights_clave: [
              "La cartera está concentrada en pocos clientes",
            ],
          },
        }),
      });
    });

    await page.goto("/cfo");

    // Wait for the empty state to finish loading
    await expect(
      page.getByRole("button", { name: /Generar Analisis/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Click the "Generar Analisis CFO" button (from CfoEmptyState)
    await page.getByRole("button", { name: /Generar Analisis/i }).click();

    // The resumen_ejecutivo text should appear in the analysis results
    await expect(
      page.getByText("E2E test: La cartera presenta un estado saludable."),
    ).toBeVisible({ timeout: 20_000 });

    // The "Analista CFO" heading should still be there (PageHeader)
    await expect(
      page.getByRole("heading", { name: "Analista CFO" }),
    ).toBeVisible();

    // No error state — the error banner uses a rose background with AlertTriangle
    await expect(
      page.locator(".bg-rose-50 >> text=Error"),
    ).not.toBeVisible();

    // No infinite spinner — the main loading spinner should be gone
    await expect(
      page.getByText("Cargando analisis..."),
    ).not.toBeVisible();
  });
});
