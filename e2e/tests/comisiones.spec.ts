import { test, expect } from "@playwright/test";
import { generateVentasExcel } from "../fixtures/generate-ventas.js";
import { generateRecaudoExcel } from "../fixtures/generate-recaudo.js";
import {
  TEST_VENDEDOR_NOMBRE,
  TEST_VENDEDOR_CODIGO,
  TEST_MARCA,
  TEST_PERIODO,
} from "../helpers/constants";

test.describe("Flow A: Comisiones", () => {
  test.describe.configure({ mode: "serial" });

  test("Step 1: Navigate to comisiones page", async ({ page }) => {
    await page.goto("/comisiones");

    // Page header: "Comisiones"
    await expect(
      page.getByRole("heading", { name: "Comisiones" }),
    ).toBeVisible({ timeout: 15_000 });

    // Verify tabs are visible — ComisionesPage.jsx uses TabButton components
    // Use button role to avoid matching other text on the page (e.g. "Cargar Ventas")
    await expect(page.getByRole("button", { name: "Ventas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Recaudo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exclusiones" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Catalogo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reporte Mensual" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Presupuestos" })).toBeVisible();
  });

  test("Step 2: Upload ventas Excel", async ({ page }) => {
    await page.goto("/comisiones");
    await expect(
      page.getByRole("heading", { name: "Comisiones" }),
    ).toBeVisible({ timeout: 15_000 });

    // Ventas tab is active by default. Click "Cargar Ventas" button.
    await page.getByRole("button", { name: "Cargar Ventas" }).click();

    // Modal appears with title "Cargar Ventas"
    await expect(page.getByText("Cargar Ventas").nth(1)).toBeVisible();

    // Set date to 2025-01-01 (the "Fecha de Ventas" input)
    await page.locator('input[type="date"]').fill("2025-01-01");

    // Generate fixture Excel and upload via hidden file input
    const filePath = generateVentasExcel();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Click "Analizar y Previsualizar"
    await page
      .getByRole("button", { name: /Analizar y Previsualizar/ })
      .click();

    // Wait for preview step — "Ventas Detectadas" banner appears
    await expect(page.getByText("Ventas Detectadas")).toBeVisible({
      timeout: 10_000,
    });

    // Click "Guardar X registros" button
    await page.getByRole("button", { name: /Guardar.*registros/ }).click();

    // Wait for upload to complete — modal closes or success indicator
    // The modal transitions to "uploading" step then closes on success
    await expect(page.getByText("Ventas Detectadas")).not.toBeVisible({
      timeout: 15_000,
    });
  });

  test("Step 3: Upload recaudo Excel", async ({ page }) => {
    await page.goto("/comisiones");
    await expect(
      page.getByRole("heading", { name: "Comisiones" }),
    ).toBeVisible({ timeout: 15_000 });

    // Click "Recaudo" tab
    await page.getByRole("button", { name: "Recaudo" }).click();

    // Click "Cargar Recaudos" button
    await page.getByRole("button", { name: "Cargar Recaudos" }).click();

    // Modal appears with title "Cargar Recaudos"
    await expect(
      page.locator(".fixed").getByText("Cargar Recaudos"),
    ).toBeVisible();

    // Set date to 2025-01-15 (Periodo de Recaudo)
    await page.locator('input[type="date"]').fill("2025-01-15");

    // Generate fixture Excel and upload
    const filePath = generateRecaudoExcel();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Click "Analizar y Previsualizar"
    await page
      .getByRole("button", { name: /Analizar y Previsualizar/ })
      .click();

    // Wait for preview
    await expect(page.getByText(/recaudos/i)).toBeVisible({ timeout: 10_000 });

    // Click "Guardar X recaudos" button
    await page.getByRole("button", { name: /Guardar.*recaudos/ }).click();

    // Wait for modal to close
    await expect(
      page.locator(".fixed").getByText("Cargar Recaudos"),
    ).not.toBeVisible({ timeout: 15_000 });
  });

  test("Step 4: Configure presupuestos", async ({ page }) => {
    await page.goto("/comisiones");
    await expect(
      page.getByRole("heading", { name: "Comisiones" }),
    ).toBeVisible({ timeout: 15_000 });

    // Click "Presupuestos" tab
    await page.getByRole("button", { name: "Presupuestos" }).click();

    // Wait for presupuestos to load
    await page.waitForTimeout(2000);

    // Select period: January 2025
    // Month selector — find the select inside the period controls area
    const monthSelect = page.locator("select").filter({ hasText: "Enero" });
    await monthSelect.selectOption(String(TEST_PERIODO.month));

    // Year selector
    const yearSelect = page
      .locator("select")
      .filter({ hasText: String(TEST_PERIODO.year) });
    await yearSelect.selectOption(String(TEST_PERIODO.year));

    // Wait for data to load (auto-inheritance may fire)
    await page.waitForTimeout(2000);

    // Check if vendedor 9990 already exists, if not add it
    const vendedorCard = page.getByText(TEST_VENDEDOR_NOMBRE);
    const vendedorExists = (await vendedorCard.count()) > 0;

    if (!vendedorExists) {
      // Use the "Agregar Nuevo Vendedor" button or the available vendor dropdown
      // Try selecting from the dropdown of available vendors first
      const vendorSelect = page.locator("select").filter({
        hasText: /Seleccionar vendedor/i,
      });
      const selectExists = (await vendorSelect.count()) > 0;

      if (selectExists) {
        await vendorSelect.selectOption(TEST_VENDEDOR_CODIGO);
        // Click the add button next to it
        await page
          .getByRole("button", { name: /Agregar Nuevo Vendedor/i })
          .click();
      } else {
        // Fallback: click "Agregar Nuevo Vendedor"
        await page
          .getByRole("button", { name: /Agregar Nuevo Vendedor/i })
          .click();
      }

      await page.waitForTimeout(1000);
    }

    // The VendorPresupuestoSection has: RecaudoTiersEditor + MarcaComisionesEditor

    // -- Recaudo: If no scale exists, click "Agregar Escala" first --
    const addEscalaBtn = page.getByRole("button", { name: /Agregar Escala/i });
    if ((await addEscalaBtn.count()) > 0) {
      await addEscalaBtn.first().click();
      await page.waitForTimeout(500);
    }

    // Meta Recaudo — the CurrencyInput labeled "Meta de Recaudo"
    const metaRecaudoInput = page.locator("label").filter({ hasText: /Meta de Recaudo/i }).locator("..").locator("input");
    if ((await metaRecaudoInput.count()) > 0) {
      await metaRecaudoInput.clear();
      await metaRecaudoInput.fill("500000");
    }

    // Tramo 1: "Hasta % cumplimiento" = 80, "% Comision" = 0
    const tramo1Section = page.locator("div").filter({ hasText: /Tramo 1/i }).first();
    const tramo1Inputs = tramo1Section.locator('input[type="number"]');
    if ((await tramo1Inputs.count()) >= 2) {
      await tramo1Inputs.nth(0).clear();
      await tramo1Inputs.nth(0).fill("80");    // Hasta % cumplimiento
      await tramo1Inputs.nth(1).clear();
      await tramo1Inputs.nth(1).fill("0");     // % Comision
    }

    // Tramo 2: "Desde %" = 80, "Hasta %" = 90, "% Comision" = 0.5
    const tramo2Section = page.locator("div").filter({ hasText: /Tramo 2/i }).first();
    const tramo2Inputs = tramo2Section.locator('input[type="number"]');
    if ((await tramo2Inputs.count()) >= 3) {
      await tramo2Inputs.nth(0).clear();
      await tramo2Inputs.nth(0).fill("80");    // Desde %
      await tramo2Inputs.nth(1).clear();
      await tramo2Inputs.nth(1).fill("90");    // Hasta %
      await tramo2Inputs.nth(2).clear();
      await tramo2Inputs.nth(2).fill("0.5");   // % Comision
    }

    // Tramo 3: "Desde %" = 90, "% Comision" = 0.9
    const tramo3Section = page.locator("div").filter({ hasText: /Tramo 3/i }).first();
    const tramo3Inputs = tramo3Section.locator('input[type="number"]');
    if ((await tramo3Inputs.count()) >= 2) {
      await tramo3Inputs.nth(0).clear();
      await tramo3Inputs.nth(0).fill("90");
      // Skip "hasta" if it exists
      const lastInput = tramo3Inputs.last();
      await lastInput.clear();
      await lastInput.fill("0.9");
    }

    // -- Marca: Add E2ETEST MARCA with meta_ventas = 300000, pct_comision = 2% --
    const marcaExists = (await page.getByText(TEST_MARCA).count()) > 0;
    if (!marcaExists) {
      const addMarcaBtn = page.getByRole("button", { name: /Agregar Marca/i });
      if ((await addMarcaBtn.count()) > 0) {
        await addMarcaBtn.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Find the marca row (last row in the table if just added)
    // Select the marca from dropdown
    const marcaSelect = page.locator("select").filter({ hasText: /Seleccionar Marca/i });
    if ((await marcaSelect.count()) > 0) {
      await marcaSelect.first().selectOption({ label: TEST_MARCA });
    }

    // Fill Meta Ventas $ and % Comision in the marca row
    const marcaTable = page.locator("table").filter({ hasText: /Meta Ventas/i });
    const lastMarcaRow = marcaTable.locator("tbody tr").last();
    const marcaInputs = lastMarcaRow.locator("input");
    if ((await marcaInputs.count()) >= 2) {
      // CurrencyInput for meta_ventas
      await marcaInputs.nth(0).clear();
      await marcaInputs.nth(0).fill("300000");
      // Number input for % comision
      await marcaInputs.nth(1).clear();
      await marcaInputs.nth(1).fill("2");
    }

    // Save
    const saveBtn = page.getByRole("button", { name: /Guardar/i });
    if ((await saveBtn.count()) > 0) {
      await saveBtn.first().click();
      await page.waitForTimeout(3000);
    }
  });

  test("Step 5: Generate monthly report", async ({ page }) => {
    await page.goto("/comisiones");
    await expect(
      page.getByRole("heading", { name: "Comisiones" }),
    ).toBeVisible({ timeout: 15_000 });

    // Click "Reporte Mensual" tab
    await page.getByRole("button", { name: "Reporte Mensual" }).click();
    await page.waitForTimeout(1000);

    // Select January 2025
    const monthSelect = page.locator("select").filter({ hasText: "Enero" });
    if ((await monthSelect.count()) > 0) {
      await monthSelect.first().selectOption(String(TEST_PERIODO.month));
    }

    const yearSelect = page
      .locator("select")
      .filter({ hasText: String(TEST_PERIODO.year) });
    if ((await yearSelect.count()) > 0) {
      await yearSelect.first().selectOption(String(TEST_PERIODO.year));
    }

    // Click "Generar Reporte" button
    await page.getByRole("button", { name: "Generar Reporte" }).click();

    // Wait for report to generate (calls RPC, may take a few seconds)
    await page.waitForTimeout(5000);

    // Verify vendedor E2ETEST appears in the results
    await expect(page.getByText(TEST_VENDEDOR_NOMBRE)).toBeVisible({
      timeout: 10_000,
    });

    // Expand vendedor row to see detail
    const vendedorRow = page.getByText(TEST_VENDEDOR_NOMBRE);
    await vendedorRow.click();

    // Verify commission amounts are visible in the expanded section:
    // Ventas: costo $390,000 >= meta $300,000 → cumple → $390,000 * 2% = $7,800
    // Recaudo: $400,000 / $500,000 = 80% → tramo2 (0.5%) → $400,000 * 0.5% = $2,000
    // Total: $9,800
    //
    // Verify at least the total commission or individual components appear.
    // Use regex to match formatted COP amounts (e.g., "$7.800", "$2.000", "$9.800")
    const reportSection = page.locator("section, div").filter({ hasText: TEST_VENDEDOR_NOMBRE });
    await expect(reportSection.getByText(/\$\s*7[.\s]800/)).toBeVisible({ timeout: 5_000 });
    await expect(reportSection.getByText(/\$\s*2[.\s]000/)).toBeVisible({ timeout: 5_000 });
  });
});
