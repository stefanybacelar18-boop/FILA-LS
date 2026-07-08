import { expect, test } from "@playwright/test";

test.describe("FilaDock — páginas públicas", () => {
  test("home carrega", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/FilaDock|Fila/i);
  });

  test("login staff disponível", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByText("Empilhador e administrador")).toBeVisible();
  });

  test("login motorista disponível", async ({ page }) => {
    await page.goto("/login/motorista");
    await expect(page.getByRole("button", { name: /Continuar com Google/i })).toBeVisible();
  });

  test("fila pública descrição", async ({ page }) => {
    await page.goto("/fila-descarga");
    await expect(page.locator("body")).toContainText(/fila|descarga|minuta/i);
  });
});

test.describe("API", () => {
  test("health retorna ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { ok: boolean; service: string };
    expect(json.ok).toBe(true);
    expect(json.service).toBe("filadock");
  });
});
