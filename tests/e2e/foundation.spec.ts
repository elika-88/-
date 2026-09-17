import { expect, test } from "@playwright/test";

// CI uses isolated responses and never calls a paid provider.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/generate", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "UPSTREAM_FAILURE", message: "Test transport failure.", retryable: true } }) }));
});

test("validates input and preserves it after a generation failure", async ({ page }) => {
  await page.goto("/");
  const formError = page.locator("#form-error");
  await expect(page.getByRole("heading", { name: "Build your study materials" })).toBeVisible();
  await page.getByRole("button", { name: "Generate materials", exact: true }).click();
  await expect(formError).toContainText("Enter lecture text");
  await page.getByLabel("Lecture text", { exact: true }).fill("A short lecture.");
  await page.getByRole("button", { name: "Generate materials", exact: true }).click();
  await expect(formError).toContainText("at least 80 words");
  const lecture = "This text is only an input validation test. ".repeat(15);
  await page.getByLabel("Lecture text", { exact: true }).fill(lecture);
  const response = page.waitForResponse((response) => response.url().endsWith("/api/generate"));
  await page.getByRole("button", { name: "Generate materials", exact: true }).click();
  expect((await response).status()).toBe(502);
  await expect(formError).toContainText("could not complete the request");
  await expect(page.getByLabel("Lecture text", { exact: true })).toHaveValue(lecture);
});

test("renders without overflow and restores the single workspace", async ({ page }) => {
  await page.goto("/results");
  await expect(page).toHaveURL("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/foundation-${test.info().project.name}.png`, fullPage: true });
});

test("submits custom settings without persisting the key", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lecture text", { exact: true }).fill("This is an input validation test only. ".repeat(15));
  await page.locator(".api-options > summary").click();
  await page.getByLabel("Use custom API", { exact: true }).check();
  await page.getByRole("button", { name: "Generate materials", exact: true }).click();
  await expect(page.locator("#form-error")).toContainText("custom API address");
  await page.getByLabel("API Base URL", { exact: true }).fill("https://gateway.example/proxy/v1/");
  await page.getByLabel("API key", { exact: true }).fill("test-only-browser-key");
  await page.getByLabel("Model", { exact: true }).fill("vendor/custom-model");
  await page.getByRole("button", { name: "Show API key", exact: true }).click();
  await expect(page.getByLabel("API key", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide API key", exact: true }).click();
  const submitted = page.waitForRequest((request) => request.url().endsWith("/api/generate"));
  await page.getByRole("button", { name: "Generate materials", exact: true }).click();
  expect((await submitted).postDataJSON().provider).toEqual({ baseURL: "https://gateway.example/proxy/v1", apiKey: "test-only-browser-key", model: "vendor/custom-model" });
  await expect(page.locator("#form-error")).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }))).not.toContain("test-only-browser-key");
  await page.reload();
  await page.locator(".api-options > summary").click();
  await page.getByLabel("Use custom API", { exact: true }).check();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
});
