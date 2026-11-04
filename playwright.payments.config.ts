import { defineConfig, devices } from "@playwright/test";

/**
 * Payments end-to-end tests in Cloudflare's real Workers runtime (workerd via
 * `wrangler pages dev`) with a fresh local D1 database.
 *
 * The secrets below are TEST-ONLY placeholders. No real Stripe account is
 * contacted: webhooks are signed locally with the Stripe SDK using the test
 * webhook secret, and the browser's redirect to Stripe Checkout is simulated.
 */
const PORT = 8790;
export const TEST_WEBHOOK_SECRET = "whsec_e2e_local_only_not_a_real_secret";
export const TEST_ORIGIN = `http://localhost:${PORT}`;

const bindings = [
  "PAYMENTS_ENABLED=true",
  "STRIPE_SECRET_KEY=rk_test_e2e_placeholder_not_real",
  `STRIPE_WEBHOOK_SECRET=${TEST_WEBHOOK_SECRET}`,
  "LICENSE_SECRET=e2e-local-license-secret-0123456789abcdef",
  `PUBLIC_ORIGIN=${TEST_ORIGIN}`,
]
  .map((b) => `--binding ${b}`)
  .join(" ");

export default defineConfig({
  testDir: "tests/e2e-payments",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: TEST_ORIGIN, acceptDownloads: true, trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
  webServer: {
    command: [
      "npm run build",
      "node -e \"require('fs').rmSync('.wrangler/e2e-state',{recursive:true,force:true})\"",
      "npx wrangler d1 migrations apply pdfquick-forms --local --persist-to .wrangler/e2e-state",
      `npx wrangler pages dev dist --port ${PORT} --persist-to .wrangler/e2e-state ${bindings}`,
    ].join(" && "),
    url: `${TEST_ORIGIN}/api/products`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
