import { test, expect } from "@playwright/test";

test.describe.serial("Chatbot page", () => {
  test("loads and shows welcome message", async ({ page }) => {
    await page.goto("/chatbot");

    // Header shows "DistriBot CFO" as an <h1> (accessible name includes "AI" badge)
    await expect(
      page.getByRole("heading", { name: /DistriBot CFO/i }),
    ).toBeVisible({ timeout: 15_000 });

    // The welcome message contains "Soy DistriBot" (from WELCOME_CONTENT)
    await expect(page.getByText("Soy DistriBot", { exact: false })).toBeVisible();

    // Subtitle text when not loading
    await expect(page.getByText("Asesor experto en cartera")).toBeVisible();
  });

  test("sends a message and receives bot response", async ({ page }) => {
    // Mock the chatbot Edge Function
    await page.route("**/functions/v1/proxy-n8n-chatbot", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          output:
            "¡Hola! Soy DistriBot, tu asistente de cartera. ¿En qué puedo ayudarte?",
        }),
      });
    });

    await page.goto("/chatbot");

    // Wait for the chat interface to be ready
    await expect(
      page.getByRole("heading", { name: /DistriBot CFO/i }),
    ).toBeVisible({ timeout: 15_000 });

    // The textarea input has placeholder "Pregunta sobre la cartera..."
    const chatInput = page.getByPlaceholder("Pregunta sobre la cartera...");
    await expect(chatInput).toBeVisible();

    // Type a message
    await chatInput.fill("Hola");

    // The send button is the <button> with a <Send> icon, next to the textarea
    // It's enabled when input is non-empty. Click it.
    const sendButton = page.locator(
      "button.bg-indigo-600:not([disabled])",
    );
    await expect(sendButton).toBeVisible();
    await sendButton.click();

    // User message "Hola" should appear in the chat
    // ChatMessage renders user messages with role="user" — look for the text
    await expect(page.getByText("Hola").first()).toBeVisible({ timeout: 5_000 });
  });

  test("displays bot response from mock", async ({ page }) => {
    // Mock the chatbot Edge Function
    await page.route("**/functions/v1/proxy-n8n-chatbot", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          output:
            "¡Hola! Soy DistriBot, tu asistente de cartera. ¿En qué puedo ayudarte?",
        }),
      });
    });

    await page.goto("/chatbot");

    await expect(
      page.getByRole("heading", { name: /DistriBot CFO/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Send "Hola"
    const chatInput = page.getByPlaceholder("Pregunta sobre la cartera...");
    await chatInput.fill("Hola");

    const sendButton = page.locator(
      "button.bg-indigo-600:not([disabled])",
    );
    await sendButton.click();

    // Wait for the bot response to appear (from the mock)
    await expect(
      page.getByText("¿En qué puedo ayudarte?"),
    ).toBeVisible({ timeout: 15_000 });

    // The typing indicator ("DistriBot pensando...") should be gone
    await expect(
      page.getByText("DistriBot pensando..."),
    ).not.toBeVisible();
  });
});
