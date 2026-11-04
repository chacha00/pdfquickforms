import { expect, test, type APIRequestContext } from "@playwright/test";
import Stripe from "stripe";
import { PDFDocument } from "pdf-lib";
import { TEST_ORIGIN, TEST_WEBHOOK_SECRET } from "../../playwright.payments.config";

const stripe = new Stripe("sk_test_unused");
let n = 0;

function paidSession(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    object: "checkout.session",
    mode: "payment",
    amount_subtotal: 499,
    amount_total: 499,
    currency: "usd",
    payment_status: "paid",
    status: "complete",
    metadata: { product_id: "pack-small-business" },
    customer_details: { email: "e2e@example.com" },
    payment_intent: { id: `pi_${id.slice(8)}`, object: "payment_intent", latest_charge: { id: "ch_e2e", object: "charge", receipt_url: "https://pay.stripe.com/receipts/e2e" } },
    ...over,
  };
}

/** Deliver a webhook signed exactly as Stripe would, to the Workers runtime. */
async function deliver(request: APIRequestContext, type: string, object: unknown, secret = TEST_WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id: `evt_e2e_${Date.now()}_${++n}`, object: "event", type, api_version: "2026-10-28.endive", created: 1, livemode: false, pending_webhooks: 1, request: null, data: { object } });
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
  return request.post("/api/stripe-webhook", { data: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
}

test("API runs in the Workers runtime with D1", async ({ request }) => {
  const r = await request.get("/api/products");
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.paymentsEnabled).toBe(true);
  expect(body.products[0]).toMatchObject({ id: "pack-small-business", amount: 499, currency: "usd" });
});

test("webhook signatures are verified with SubtleCrypto in workerd", async ({ request }) => {
  expect((await deliver(request, "checkout.session.completed", paidSession("cs_test_forgedsig000001"), "whsec_wrong")).status()).toBe(400);
  const ok = await deliver(request, "checkout.session.completed", paidSession("cs_test_validsig0000001"));
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ received: true });
});

test("cross-site checkout requests are refused", async ({ request }) => {
  const r = await request.post("/api/checkout", { data: { productId: "pack-small-business" }, headers: { origin: "https://evil.example" } });
  expect(r.status()).toBe(403);
});

test("full purchase journey: buy → (Stripe) → success → license → templates → editor → fillable PDF; refund revokes", async ({ page, request }) => {
  const sessionId = `cs_test_journey${Date.now()}`;
  // The real /api/checkout would call Stripe with real keys; here the redirect to Stripe is simulated
  // and the payment is confirmed by a correctly signed webhook delivered to the Workers runtime.
  await page.route("**/api/checkout", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ productId: "pack-small-business" });
    await route.fulfill({ json: { url: `${TEST_ORIGIN}/purchase/success?session_id=${sessionId}` } });
  });
  expect((await deliver(request, "checkout.session.completed", paidSession(sessionId))).status()).toBe(200);

  await page.goto("/free-pdf-templates");
  await page.getByRole("link", { name: "See premium packs" }).click();
  await expect(page).toHaveURL(/\/premium$/);
  await expect(page.getByTestId("price")).toHaveText("$4.99");
  await page.getByTestId("buy-pack-small-business").click();

  await expect(page).toHaveURL(/\/purchase\/success\?session_id=/);
  const key = (await page.getByTestId("license-key").textContent())!.trim();
  expect(key).toMatch(/^PQF-[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
  await expect(page.getByRole("link", { name: "View receipt" })).toHaveAttribute("href", "https://pay.stripe.com/receipts/e2e");

  await page.getByRole("link", { name: "Open my templates" }).click();
  await expect(page.getByTestId("license-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Show templates" }).click();
  const list = page.getByRole("list", { name: "Small Business Forms Pack templates" });
  await expect(list.getByRole("button")).toHaveCount(8);
  await list.getByRole("button", { name: /Purchase Order/ }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.locator("#form-name")).toHaveValue("Purchase Order");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
  const pdf = await PDFDocument.load(new Uint8Array(await (await import("node:fs")).promises.readFile((await dl.path())!)));
  expect(pdf.getForm().getFields().length).toBeGreaterThan(20);

  // Without a license the pack is not available
  expect((await request.get("/api/packs/small-business")).status()).toBe(401);
  // Refund → license stops working
  expect((await deliver(request, "charge.refunded", { id: "ch_e2e", object: "charge", payment_intent: `pi_${sessionId.slice(8)}`, refunded: true })).status()).toBe(200);
  const denied = await request.get("/api/packs/small-business", { headers: { authorization: `Bearer ${key}` } });
  expect(denied.status()).toBe(403);
  await page.goto("/purchases");
  await page.getByRole("button", { name: "Show templates" }).click();
  await expect(page.getByRole("alert")).toContainText("refunded");
});

test("a key can be added on another device", async ({ page, request }) => {
  const sessionId = `cs_test_device${Date.now()}`;
  await deliver(request, "checkout.session.completed", paidSession(sessionId));
  const claim = await request.post("/api/purchase/claim", { data: { sessionId }, headers: { origin: TEST_ORIGIN } });
  const { licenseKey } = await claim.json();
  await page.goto("/purchases");
  await expect(page.getByText("No purchases in this browser yet.")).toBeVisible();
  await page.getByLabel("License key", { exact: true }).fill(licenseKey.toLowerCase());
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added Small Business Forms Pack.")).toBeVisible();
  await page.getByRole("button", { name: "Show templates" }).click();
  await expect(page.getByRole("list", { name: "Small Business Forms Pack templates" }).getByRole("button")).toHaveCount(8);
});

test("email recovery reports that it isn't configured", async ({ page }) => {
  await page.goto("/purchases");
  await page.getByLabel("Email").fill("e2e@example.com");
  await page.getByRole("button", { name: "Email my keys" }).click();
  await expect(page.getByRole("alert")).toContainText("Email recovery isn't set up");
});

test("premium template content is not in any public JavaScript file", async ({ request }) => {
  const { readdirSync } = await import("node:fs");
  const files = readdirSync("dist/assets").filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
  expect(files.length).toBeGreaterThan(5);
  for (const f of files) {
    const js = await (await request.get(`/assets/${f}`)).text(); // served exactly as deployed
    // Titles are public (sales page); template *content* only comes from the licensed API.
    for (const secret of ["Describe what you supply", "Years in business", "Reported to authorities?", "Customer sign-off", "Advance received"]) {
      expect(js, `${f} leaks "${secret}"`).not.toContain(secret);
    }
  }
});
