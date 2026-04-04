import { test, expect } from "@playwright/test";

function uniqueEmail() {
  return `codex+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function signUp(page, email, password) {
  await page.goto("/signup", { waitUntil: "domcontentloaded" });
  await page.fill("#firstName", "Codex");
  await page.fill("#lastName", "Smoke");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("checkbox").click();
  await page.locator('button[type="submit"]').click();
}

async function signIn(page, email, password) {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click();
}

test("redirects unauthenticated users to login for protected routes", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard/);
  await expect(page.getByText("Welcome back")).toBeVisible();
});

test("email signup lands on onboarding and email login returns to requested route", async ({ page }) => {
  const email = uniqueEmail();
  const password = "Playwright1!";

  await signUp(page, email, password);
  await expect(page).toHaveURL(/\/create-group/);
  await expect(page.getByText("Create New Group")).toBeVisible();

  await page.evaluate(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  });

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard/);
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(email)).toBeVisible();
});

test("core dashboard routes are accessible after login", async ({ page }) => {
  const email = uniqueEmail();
  const password = "Playwright1!";

  await signUp(page, email, password);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  if (/\/login\?returnTo=%2Fdashboard/.test(page.url())) {
    await signIn(page, email, password);
  }
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/groups", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/groups$/);

  await page.goto("/expenses", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/expenses$/);

  await page.goto("/activity", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/activity$/);

  await page.goto("/ai-assistance", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);
});
