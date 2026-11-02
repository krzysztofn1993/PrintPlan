import { expect, test } from "@playwright/test";
import type { BrowserContext, Page, Response } from "@playwright/test";
import { readCredentials } from "./helpers/local-account";

function expectPrivateHtml(response: Response | null): void {
  if (!response) throw new Error("The landing navigation did not return an HTTP response.");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
  const directives = response
    .headers()
    ["cache-control"].split(",")
    .map((value) => value.trim());
  expect(directives).toEqual(expect.arrayContaining(["private", "no-store"]));
}

async function expectGuestLinks(page: Page): Promise<void> {
  const createAccount = page.getByRole("link", { name: "Create an account" });
  await expect(createAccount).toHaveCount(2);
  for (const link of await createAccount.all()) await expect(link).toHaveAttribute("href", "/auth/signup");
  const signIn = page.getByRole("link", { name: "Sign in" });
  await expect(signIn).toHaveCount(2);
  for (const link of await signIn.all()) await expect(link).toHaveAttribute("href", "/auth/signin");
  await expect(page.getByRole("link", { name: "Open dashboard" })).toHaveCount(0);
}

async function signInFresh(context: BrowserContext, baseURL: string): Promise<void> {
  const account = await readCredentials();
  const response = await context.request.post(`${baseURL}/api/auth/signin`, {
    form: { email: account.email, password: account.password },
    headers: { Origin: new URL(baseURL).origin },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe("/dashboard");
  expect((await context.cookies()).some(({ name }) => name.includes("auth-token"))).toBe(true);
}

test("guest receives public private HTML with metadata, landmarks and account destinations", async ({ page }) => {
  const response = await page.goto("/");
  expectPrivateHtml(response);
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle("PrintPlan — Plan your next print");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Track your estimated filament stock, reserve material for planned prints, and record actual consumption with PrintPlan.",
  );
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Your next print\.\s*Your filament,\s*accounted for\./,
  );
  const levels = await page
    .locator("main h1, main h2, main h3")
    .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
  expect(levels[0]).toBe(1);
  for (let index = 1; index < levels.length; index += 1)
    expect(levels[index]).toBeLessThanOrEqual(levels[index - 1] + 1);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(5);
  await expectGuestLinks(page);
  await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await page.goto("/");
  await page.getByRole("link", { name: "Create an account" }).first().click();
  await expect(page).toHaveURL(/\/auth\/signup$/);
});

test("fresh UI sign-in enters dashboard directly and the member can still read public root", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("The E2E base URL is missing.");
  // Never load setup storage state: global sign-out in another test revokes its refresh session.
  const context = await browser.newContext({ baseURL });
  try {
    const account = await readCredentials();
    const page = await context.newPage();
    await page.goto("/auth/signin", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(account.email);
    await page.getByRole("textbox", { name: "Password" }).fill(account.password);
    const signin = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/signin" && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    const result = await signin;
    expect(result.status()).toBe(302);
    expect(result.headers().location).toBe("/dashboard");
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    const response = await page.goto("/");
    expectPrivateHtml(response);
    await expect(page).toHaveURL(`${baseURL}/`);
    const dashboard = page.getByRole("link", { name: "Open dashboard" });
    await expect(dashboard).toHaveCount(3);
    for (const link of await dashboard.all()) await expect(link).toHaveAttribute("href", "/dashboard");
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
    expect((await page.locator("body").innerText()).includes(account.email)).toBe(false);
    await dashboard.first().click();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
  } finally {
    await context.close();
  }
});

test("fresh isolated member signs out to public root and dashboard remains protected", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("The E2E base URL is missing.");
  const context = await browser.newContext({ baseURL });
  try {
    await signInFresh(context, baseURL);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(`${baseURL}/`);
    await expectGuestLinks(page);
    expect((await context.cookies()).some(({ name }) => name.includes("auth-token"))).toBe(false);
    expectPrivateHtml(await page.reload());
    await page.goto("/dashboard/spools");
    await expect(page).toHaveURL(`${baseURL}/auth/signin`);
    expectPrivateHtml(await page.goto("/"));
    await expectGuestLinks(page);
  } finally {
    await context.close();
  }
});

for (const width of [320, 390, 1440]) {
  test(`guest preview loads the correct source without overflow or page errors at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    expectPrivateHtml(await page.goto("/", { waitUntil: "networkidle" }));
    const preview = page.getByRole("img", { name: /^PrintPlan Filament stock:/ });
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
      .toBe(true);
    const image = await preview.evaluate((element: HTMLImageElement) => ({
      source: new URL(element.currentSrc).pathname,
      width: element.naturalWidth,
      height: element.naturalHeight,
    }));
    expect(image).toEqual(
      width <= 600
        ? { source: "/landing/filament-stock-mobile.png", width: 390, height: 1436 }
        : { source: "/landing/filament-stock-desktop.png", width: 1440, height: 700 },
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByText(/Static preview; controls in the image are not interactive\./)).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("FAQ supports keyboard disclosure with visible focus", async ({ page }) => {
  await page.goto("/");
  const firstQuestion = page.locator("summary").first();
  await firstQuestion.focus();
  await expect(firstQuestion).toBeFocused();
  expect(await firstQuestion.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(firstQuestion.locator("..")).toHaveAttribute("open", "");
  await expect(firstQuestion.locator("..").locator("p")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(firstQuestion.locator("..")).not.toHaveAttribute("open");
});

test("JavaScript-disabled guest can read content, follow account links and open native FAQ", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    expectPrivateHtml(await page.goto("/"));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "From spool to finished print." })).toBeVisible();
    await expectGuestLinks(page);
    const question = page.locator("summary").filter({ hasText: "Does reserving filament reduce my stock?" });
    await question.focus();
    await page.keyboard.press("Enter");
    await expect(question.locator("..").locator("p")).toBeVisible();
    await page.getByRole("link", { name: "Create an account" }).first().click();
    await expect(page).toHaveURL(/\/auth\/signup$/);
  } finally {
    await context.close();
  }
});
