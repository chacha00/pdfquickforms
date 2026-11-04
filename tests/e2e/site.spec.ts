import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import data from "../../src/content/site.json" with { type: "json" };
import { clickDownload, downloadBytes, fixture, openBlank, place, readFields } from "./helpers";

const indexable = [...Object.keys(data.pages), ...data.landings.map((l) => l.path), ...data.guides.map((g) => `/guides/${g.slug}`)];

test.describe("SEO", () => {
  for (const path of indexable) {
    test(`${path} is prerendered with unique metadata`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      expect(html).toMatch(/<title>[^<]{20,}<\/title>/);
      expect(html).toContain(`<link rel="canonical" href="https://pdfquickforms.com${path}" />`);
      expect(html).toMatch(/<meta name="description" content="[^"]{40,}"/);
      expect(html).toMatch(/<h1>[^<]+<\/h1>/);
    });
  }

  test("titles and descriptions are unique; required landing pages exist", async ({ request }) => {
    const titles = new Set<string>();
    for (const p of indexable) {
      const t = /<title>([^<]+)<\/title>/.exec(await (await request.get(p)).text())![1]!;
      expect(titles.has(t), `duplicate title ${t}`).toBe(false);
      titles.add(t);
    }
    for (const required of ["/make-pdf-fillable", "/create-fillable-pdf", "/fill-pdf-online", "/add-text-fields-to-pdf", "/add-checkboxes-to-pdf", "/add-signature-to-pdf", "/pdf-form-builder", "/free-pdf-templates"]) {
      expect(indexable).toContain(required);
    }
  });

  test("sitemap and robots; editor is noindex", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const p of indexable) expect(xml).toContain(`<loc>https://pdfquickforms.com${p}</loc>`);
    expect(xml).not.toContain("/editor");
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap: https://pdfquickforms.com/sitemap.xml");
    expect(await (await request.get("/editor")).text()).toContain('<meta name="robots" content="noindex" />');
  });
});

test.describe("advertising rules", () => {
  test("labeled placeholders appear only on allowed pages; never in editor or filler", async ({ page }) => {
    for (const path of ["/", "/free-pdf-templates", "/guides", `/guides/${data.guides[0]!.slug}`, "/make-pdf-fillable"]) {
      await page.goto(path);
      await expect(page.getByTestId("ad-placeholder").first(), path).toBeVisible();
      await expect(page.getByTestId("ad-placeholder").first()).toContainText("Advertisement");
    }
    await openBlank(page);
    await place(page, "Text field", 1, 100, 100);
    await expect(page.getByTestId("ad-placeholder")).toHaveCount(0);
    await page.goto("/fill-pdf-online");
    await page.getByTestId("file-input").setInputFiles(fixture("existing-form.pdf"));
    await expect(page).toHaveURL(/\/fill$/);
    await expect(page.getByTestId("ad-placeholder")).toHaveCount(0);
  });

  test("no consent banner and no ad network requests when ads aren't configured", async ({ page }) => {
    const third: string[] = [];
    page.on("request", (r) => !r.url().startsWith("http://localhost") && !/^(blob|data):/.test(r.url()) && third.push(r.url()));
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Advertising consent" })).toHaveCount(0);
    await openBlank(page);
    await place(page, "Checkbox", 1, 100, 100);
    await downloadBytes(await clickDownload(page));
    expect(third).toEqual([]);
  });
});

test.describe("privacy and security", () => {
  test("no document is sent anywhere: no non-GET requests during edit, export and fill", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (r) => r.method() !== "GET" && posts.push(`${r.method()} ${r.url()}`));
    await page.goto("/make-pdf-fillable");
    await page.getByLabel("Suggest fields automatically (Auto-detect, free)").check();
    await page.getByTestId("file-input").setInputFiles(fixture("paper-form.pdf"));
    await expect(page.getByText(/Found \d+ possible fields/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Accept all" }).click();
    await downloadBytes(await clickDownload(page));
    expect(posts).toEqual([]);
  });

  test("security headers are served", async ({ request }) => {
    const h = (await request.get("/")).headers();
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  test("there is no subscription anywhere", async ({ request }) => {
    for (const p of indexable) {
      const html = (await (await request.get(p)).text()).toLowerCase();
      expect(html, p).not.toMatch(/\/month|per month|subscribe now|monthly plan|free trial/);
    }
  });
});

test("premium page works without a payment backend: price shown, buying disabled honestly", async ({ page }) => {
  await page.goto("/premium");
  await expect(page.getByTestId("price")).toHaveText("$4.99");
  await expect(page.getByTestId("buy-pack-small-business")).toBeDisabled();
  await expect(page.getByTestId("buy-pack-small-business")).toHaveText(/aren't available yet/);
  await expect(page.getByText("one-time purchase")).toBeVisible();
});

test.describe("fill tool", () => {
  test("flattened download removes the fields; non-fillable PDFs offer the editor", async ({ page }) => {
    await page.goto("/fill-pdf-online");
    await page.getByTestId("file-input").setInputFiles(fixture("existing-form.pdf"));
    await page.getByRole("textbox", { name: "Existing name" }).fill("Final");
    await page.getByText("Flattened (final)").click();
    const bytes = await downloadBytes(await clickDownload(page));
    expect(await readFields(bytes)).toEqual([]);

    await page.goto("/fill-pdf-online");
    await page.getByTestId("file-input").setInputFiles(fixture("alpha.pdf"));
    await expect(page.getByText("This PDF has no fillable fields")).toBeVisible();
    await page.getByRole("button", { name: "Make this PDF fillable" }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByTestId("page-surface-1")).toBeVisible();
  });
});

test.describe("accessibility (axe, WCAG 2.2 AA)", () => {
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
  const fmt = (v: { id: string; nodes: { target: unknown[] }[] }[]) => v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  for (const path of ["/", "/make-pdf-fillable", "/create-fillable-pdf", "/fill-pdf-online", "/free-pdf-templates", `/guides/${data.guides[0]!.slug}`, "/privacy", "/status", "/premium", "/purchases"]) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(fmt((await new AxeBuilder({ page }).withTags(tags).analyze()).violations)).toEqual([]);
    });
  }

  test("editor with every field type", async ({ page }) => {
    await openBlank(page);
    for (const [t, y] of [["Text field", 80], ["Checkbox", 120], ["Radio button", 160], ["Dropdown", 200], ["List box", 240], ["Date", 300], ["Signature area", 360], ["Heading", 420]] as const) {
      await place(page, t, 1, 100, y);
    }
    expect(fmt((await new AxeBuilder({ page }).withTags(tags).analyze()).violations)).toEqual([]);
    await page.getByRole("button", { name: "Preview" }).click();
    await page.waitForTimeout(400); // let the button colour transition finish before measuring contrast
    expect(fmt((await new AxeBuilder({ page }).withTags(tags).analyze()).violations)).toEqual([]);
  });

  test("fill tool", async ({ page }) => {
    await page.goto("/fill-pdf-online");
    await page.getByTestId("file-input").setInputFiles(fixture("existing-form.pdf"));
    await expect(page.getByRole("textbox", { name: "Existing name" })).toBeVisible();
    expect(fmt((await new AxeBuilder({ page }).withTags(tags).analyze()).violations)).toEqual([]);
  });
});

test.describe("mobile @mobile", () => {
  for (const path of ["/", "/make-pdf-fillable", "/free-pdf-templates", "/status"]) {
    test(`${path} has no horizontal overflow @mobile`, async ({ page }) => {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }

  test("build and download a form on a phone @mobile", async ({ page }) => {
    await page.goto("/create-fillable-pdf");
    await page.getByRole("button", { name: "Start with a blank page" }).click();
    await page.getByRole("navigation", { name: "Editor actions" }).getByRole("button", { name: "Add" }).click();
    await page.getByRole("dialog", { name: "Add elements" }).getByRole("button", { name: "Text field", exact: true }).click();
    const s = page.getByTestId("page-surface-1");
    await s.click({ position: { x: 60, y: 80 } });
    await page.keyboard.type("Phone user");
    await page.getByRole("navigation", { name: "Editor actions" }).getByRole("button", { name: "Properties" }).click();
    await expect(page.getByRole("dialog", { name: "Properties" }).getByLabel("Field name")).toHaveValue("Text 1");
    await page.getByRole("button", { name: "Close panel" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const fields = await readFields(await downloadBytes(await clickDownload(page)));
    expect(fields.map((f) => [f.name, f.value])).toEqual([["Text 1", "Phone user"]]);
  });

  test("fill a PDF on a phone @mobile", async ({ page }) => {
    await page.goto("/fill-pdf-online");
    await page.getByTestId("file-input").setInputFiles(fixture("existing-form.pdf"));
    await page.getByRole("textbox", { name: "Existing name" }).fill("Mobile");
    await page.getByRole("checkbox", { name: "Existing agree" }).click();
    const fields = await readFields(await downloadBytes(await clickDownload(page)));
    expect(fields.map((f) => f.value)).toEqual(["Mobile", true]);
  });
});
