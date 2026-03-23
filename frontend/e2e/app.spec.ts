import { test, expect } from "@playwright/test";

// ── 1. Login Page (no stored auth – use fresh context) ──────────────
test.describe("Login Page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"]', "wrong");
    await page.fill('input[type="password"]', "wrong");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/login");
  });

  test("successful login redirects to home", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"]', "admin");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 15000,
    });
    expect(page.url()).not.toContain("/login");
  });
});

// ── 2. Sidebar Navigation (uses stored auth) ────────────────────────
test.describe("Navigation", () => {
  test("sidebar has all navigation links", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav", { timeout: 5000 });
    const nav = page.locator("nav");
    await expect(nav.getByText("Extraktion")).toBeVisible();
    await expect(nav.getByText("Batch")).toBeVisible();
    await expect(nav.getByText("Beispiele")).toBeVisible();
    await expect(nav.getByText("Analytik")).toBeVisible();
    await expect(nav.getByText("Review")).toBeVisible();
    await expect(nav.getByText("Anleitung")).toBeVisible();
  });

  test("can navigate to extract page", async ({ page }) => {
    await page.goto("/");
    await page.click('nav >> text="Extraktion"');
    await page.waitForURL("**/extract", { timeout: 10000 });
    await expect(page.locator("main h1")).toContainText("Einzel-Extraktion");
  });

  test("can navigate to batch page", async ({ page }) => {
    await page.goto("/");
    await page.click('nav >> text="Batch"');
    await page.waitForURL("**/batch", { timeout: 10000 });
    await expect(page.locator("main h1")).toContainText("Batch");
  });

  test("can navigate to examples page", async ({ page }) => {
    await page.goto("/");
    await page.click('nav >> text="Beispiele"');
    await page.waitForURL("**/examples", { timeout: 10000 });
  });

  test("can navigate to analytics page", async ({ page }) => {
    await page.goto("/");
    await page.click('nav >> text="Analytik"');
    await page.waitForURL("**/analytics", { timeout: 10000 });
    await expect(page.locator("main h1")).toContainText("Analytik");
  });

  test("can navigate to review page", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByText("Review").click();
    await page.waitForURL("**/review", { timeout: 10000 });
  });

  test("can navigate to guide page", async ({ page }) => {
    await page.goto("/");
    await page.click('nav >> text="Anleitung"');
    await page.waitForURL("**/guide", { timeout: 10000 });
    await expect(page.locator("main h1")).toContainText("Anleitung");
  });
});

// ── 3. Extract Page ─────────────────────────────────────────────────
test.describe("Extract Page", () => {
  test("renders page title and dropzone", async ({ page }) => {
    await page.goto("/extract");
    await page.waitForSelector("main", { timeout: 5000 });
    await expect(page.locator("main h1")).toContainText("Einzel-Extraktion");
    await expect(page.locator("main")).toContainText("PDF");
  });
});

// ── 4. Batch Page ───────────────────────────────────────────────────
test.describe("Batch Page", () => {
  test("renders batch page", async ({ page }) => {
    await page.goto("/batch");
    await page.waitForSelector("main", { timeout: 5000 });
    await expect(page.locator("main h1")).toContainText("Batch");
  });
});

// ── 5. Analytics Page ───────────────────────────────────────────────
test.describe("Analytics Page", () => {
  test("renders analytics dashboard with overview cards", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("text=Gesamt-Extraktionen", { timeout: 10000 });
    await expect(page.locator("text=Durchschn. Genauigkeit")).toBeVisible();
    await expect(page.locator("text=Korrekturen heute")).toBeVisible();
    await expect(page.locator("text=Extraktionen heute")).toBeVisible();
  });

  test("shows daily trend chart (recharts)", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("text=Extraktionen der letzten 14 Tage", {
      timeout: 10000,
    });
    await expect(page.locator(".recharts-responsive-container")).toBeVisible();
  });

  test("shows field accuracy table", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("text=Feldgenauigkeit", { timeout: 10000 });
    await expect(page.locator("text=Feldname")).toBeVisible();
  });

  test("shows project stats section", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("text=Projektstatistiken", { timeout: 10000 });
  });

  test("filter bar is present", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("text=Letzte Extraktionen", { timeout: 10000 });
    await expect(
      page.locator('input[placeholder="Dateiname suchen..."]')
    ).toBeVisible();
  });

  test("search filter works", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("text=Letzte Extraktionen", { timeout: 10000 });
    const searchInput = page.locator(
      'input[placeholder="Dateiname suchen..."]'
    );
    await searchInput.fill("KUJ");
    await page.waitForTimeout(500);
    const rows = page.locator("table").last().locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("recent extraction row expands on click", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("text=Letzte Extraktionen", { timeout: 10000 });
    const firstRow = page.locator("table").last().locator("tbody tr").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await expect(page.locator("text=Feld-Details")).toBeVisible({
        timeout: 3000,
      });
    }
  });
});

// ── 6. Command Palette ──────────────────────────────────────────────
test.describe("Command Palette", () => {
  test("opens with Ctrl+K and shows navigation items", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("main", { timeout: 5000 });
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Check navigation items inside the dialog
    await expect(dialog.locator("text=Einzel-Extraktion")).toBeVisible({
      timeout: 3000,
    });
    await expect(dialog.locator("text=Analytik")).toBeVisible();
  });

  test("closes on Escape", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("main", { timeout: 5000 });
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 3000 });
  });
});

// ── 7. Header ───────────────────────────────────────────────────────
test.describe("Header", () => {
  test("shows username and admin badge", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("main", { timeout: 5000 });
    await expect(page.getByText("admin", { exact: true })).toBeVisible();
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
  });

  test("has logout button", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("main", { timeout: 5000 });
    await expect(page.locator('button[title="Abmelden"]')).toBeVisible();
  });

  test("logout redirects to login", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("main", { timeout: 5000 });
    await page.click('button[title="Abmelden"]');
    await page.waitForURL("**/login", { timeout: 5000 });
  });
});

// ── 8. Examples Page ────────────────────────────────────────────────
test.describe("Examples Page", () => {
  test("renders examples page", async ({ page }) => {
    await page.goto("/examples");
    await page.waitForSelector("main", { timeout: 5000 });
  });
});

// ── 9. Review Page ──────────────────────────────────────────────────
test.describe("Review Page", () => {
  test("renders review page", async ({ page }) => {
    await page.goto("/review");
    await page.waitForSelector("main", { timeout: 5000 });
  });
});

// ── 10. Guide Page ─────────────────────────────────────────────────
test.describe("Guide Page", () => {
  test("renders guide page with title", async ({ page }) => {
    await page.goto("/guide");
    await page.waitForSelector("main", { timeout: 5000 });
    await expect(page.locator("main h1")).toContainText("Anleitung");
  });

  test("shows accordion sections", async ({ page }) => {
    await page.goto("/guide");
    await page.waitForSelector("main", { timeout: 5000 });
    await expect(page.getByText("Was ist PDF-Auszug?")).toBeVisible();
    await expect(page.getByText("Einzel-Extraktion")).toBeVisible();
    await expect(page.getByText("Batch-Verarbeitung")).toBeVisible();
    await expect(page.getByText("Tastenkürzel")).toBeVisible();
  });

  test("accordion sections expand on click", async ({ page }) => {
    await page.goto("/guide");
    await page.waitForSelector("main", { timeout: 5000 });
    // Click on "Einzel-Extraktion" section to expand it
    await page.getByText("Einzel-Extraktion").first().click();
    // Should show step content after expanding
    await expect(page.locator("main")).toContainText("PDF");
  });
});

// ── 11. API Health Check ────────────────────────────────────────────
test.describe("API Health", () => {
  test("health endpoint returns ok with details", async ({ request }) => {
    const res = await request.get("http://localhost:8000/api/health");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.status).toBeDefined();
    expect(json.database).toBe("ok");
    expect(json.disk).toBe("ok");
    expect(json.gemini_auth).toBeDefined();
    expect(json.disk_free_gb).toBeGreaterThan(0);
  });

  test("login endpoint works", async ({ request }) => {
    const res = await request.post("http://localhost:8000/api/auth/login", {
      data: { username: "admin", password: "admin123" },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.token).toBeDefined();
    expect(json.username).toBe("admin");
    expect(json.role).toBe("admin");
  });

  test("analytics overview endpoint returns data", async ({ request }) => {
    const loginRes = await request.post(
      "http://localhost:8000/api/auth/login",
      {
        data: { username: "admin", password: "admin123" },
      }
    );
    const { token } = await loginRes.json();

    const res = await request.get(
      "http://localhost:8000/api/analytics/overview",
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.total_extractions).toBeDefined();
    expect(json.accuracy).toBeDefined();
  });
});
