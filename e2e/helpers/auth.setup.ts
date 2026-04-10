import { test as setup, expect } from "@playwright/test";
import { TEST_USER } from "./constants";

const AUTH_STATE_PATH = "./e2e/helpers/.auth-state.json";

setup("authenticate", async ({ page }) => {
  if (!TEST_USER.password) {
    throw new Error("E2E_TEST_PASSWORD env var is required");
  }

  await page.goto("/login");
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL(/\/$/, { timeout: 15_000 });
  await expect(page.locator("nav")).toBeVisible({ timeout: 10_000 });

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
