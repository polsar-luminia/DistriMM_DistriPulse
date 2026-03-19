import { test, expect } from "@playwright/test";
import {
  TEST_CLIENTE_NIT,
  TEST_CLIENTE_NOMBRE,
} from "../helpers/constants";

test.describe("Flow B: Mensajeria", () => {
  test.describe.configure({ mode: "serial" });

  test("Step 1: Navigate to mensajes", async ({ page }) => {
    await page.goto("/mensajes");

    // Page header: "Centro de Mensajes"
    await expect(
      page.getByRole("heading", { name: "Centro de Mensajes" }),
    ).toBeVisible({ timeout: 15_000 });

    // Verify tabs from MessagesShared TABS: Nuevo Lote, Historial, Plantillas, WhatsApp
    // Use button role to avoid matching description paragraph that also mentions "WhatsApp"
    await expect(page.getByRole("button", { name: /Nuevo Lote/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Historial/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Plantillas/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /WhatsApp/i })).toBeVisible();
  });

  test("Step 2: Filter morosos", async ({ page }) => {
    await page.goto("/mensajes");
    await expect(
      page.getByRole("heading", { name: "Centro de Mensajes" }),
    ).toBeVisible({ timeout: 15_000 });

    // "Nuevo Lote" tab is active by default
    // Filter type select — default is "morosos" (NuevoLoteTab.jsx line 28)
    // The select should already be on "morosos", but let's ensure
    const tipoSelect = page.locator("select").first();
    await tipoSelect.selectOption("morosos");

    // Set diasMoraMin — the input labeled "Dias mora minimo"
    const diasMoraInput = page.getByLabel(/Días mora mínimo/i);
    await diasMoraInput.clear();
    await diasMoraInput.fill("1");

    // Click "Buscar Clientes" button
    await page.getByRole("button", { name: "Buscar Clientes" }).click();

    // Wait for results to load
    await page.waitForTimeout(3000);

    // Verify results contain our test client
    // Client table shows cliente_nombre and cliente_nit
    await expect(page.getByText(TEST_CLIENTE_NIT)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Step 3: Select client and compose", async ({ page }) => {
    await page.goto("/mensajes");
    await expect(
      page.getByRole("heading", { name: "Centro de Mensajes" }),
    ).toBeVisible({ timeout: 15_000 });

    // Re-run segmentation (serial but separate page loads)
    const tipoSelect = page.locator("select").first();
    await tipoSelect.selectOption("morosos");

    const diasMoraInput = page.getByLabel(/Días mora mínimo/i);
    await diasMoraInput.clear();
    await diasMoraInput.fill("1");

    await page.getByRole("button", { name: "Buscar Clientes" }).click();
    await expect(page.getByText(TEST_CLIENTE_NIT)).toBeVisible({
      timeout: 10_000,
    });

    // Select our test client's checkbox
    // The table row has the NIT text. Find the checkbox in that row.
    const clientRow = page
      .locator("tr")
      .filter({ hasText: TEST_CLIENTE_NIT });
    const checkbox = clientRow.locator('input[type="checkbox"]');
    await checkbox.check();

    // Verify selection count updates
    await expect(page.getByText(/seleccionados/)).toBeVisible();

    // Click "Continuar con X clientes" button to go to step 2 (compose)
    await page
      .getByRole("button", { name: /Continuar con \d+ cliente/ })
      .click();

    // Step 2: Compose Message — heading "Componer Mensaje"
    await expect(page.getByText("Componer Mensaje")).toBeVisible({
      timeout: 5_000,
    });

    // Select template: "E2ETEST Recordatorio" from the dropdown
    const templateSelect = page.locator("select").filter({
      hasText: /Seleccionar Plantilla/,
    });
    // Wait for templates to load
    await page.waitForTimeout(1000);
    await templateSelect.selectOption({ label: /E2ETEST Recordatorio/ });

    // Verify preview renders — the WhatsApp-style bubble (bg-[#DCF8C6])
    await expect(page.locator(".bg-\\[\\#DCF8C6\\]")).toBeVisible({
      timeout: 5_000,
    });

    // Click "Revisar y Enviar" to advance to step 3
    await page
      .getByRole("button", { name: /Revisar y Enviar/ })
      .click();

    // Step 3: Confirm — heading "Confirmar Envío"
    await expect(page.getByText("Confirmar Envío")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Step 4: Create lote with mocked WhatsApp", async ({ page }) => {
    // Mock the Edge Function so no real WhatsApp messages are sent
    await page.route("**/functions/v1/proxy-n8n-whatsapp", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto("/mensajes");
    await expect(
      page.getByRole("heading", { name: "Centro de Mensajes" }),
    ).toBeVisible({ timeout: 15_000 });

    // Re-run the full flow: segment → select → compose → confirm
    const tipoSelect = page.locator("select").first();
    await tipoSelect.selectOption("morosos");

    const diasMoraInput = page.getByLabel(/Días mora mínimo/i);
    await diasMoraInput.clear();
    await diasMoraInput.fill("1");

    await page.getByRole("button", { name: "Buscar Clientes" }).click();
    await expect(page.getByText(TEST_CLIENTE_NIT)).toBeVisible({
      timeout: 10_000,
    });

    // Select client
    const clientRow = page
      .locator("tr")
      .filter({ hasText: TEST_CLIENTE_NIT });
    const checkbox = clientRow.locator('input[type="checkbox"]');
    await checkbox.check();

    // Step 1 → Step 2
    await page
      .getByRole("button", { name: /Continuar con \d+ cliente/ })
      .click();
    await expect(page.getByText("Componer Mensaje")).toBeVisible({
      timeout: 5_000,
    });

    // Select template
    const templateSelect = page.locator("select").filter({
      hasText: /Seleccionar Plantilla/,
    });
    await page.waitForTimeout(1000);
    await templateSelect.selectOption({ label: /E2ETEST Recordatorio/ });

    // Step 2 → Step 3
    await page
      .getByRole("button", { name: /Revisar y Enviar/ })
      .click();
    await expect(page.getByText("Confirmar Envío")).toBeVisible({
      timeout: 5_000,
    });

    // Click "Confirmar y Enviar Lote"
    await page
      .getByRole("button", { name: "Confirmar y Enviar Lote" })
      .click();

    // Wait for lote creation (the hook creates a record in distrimm_recordatorios_lote)
    await page.waitForTimeout(5000);

    // Navigate to Historial tab to verify lote was created
    await page.getByRole("button", { name: /Historial/i }).click();
    await page.waitForTimeout(2000);

    // Historial should show at least one lote entry
    // The lote list shows the template name and recipient count
    await expect(
      page.getByText(/E2ETEST Recordatorio/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
