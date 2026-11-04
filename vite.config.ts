import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Read the global ("/*") header block from public/_headers so `vite preview`
 * serves the same CSP and security headers as Cloudflare Pages. E2E tests run
 * against preview, so a CSP that breaks PDF.js or the worker fails the tests.
 */
function productionHeaders(): Record<string, string> {
  const lines = readFileSync(new URL("./public/_headers", import.meta.url), "utf8").split(/\r?\n/);
  const headers: Record<string, string> = {};
  let inGlobal = false;
  for (const line of lines) {
    if (/^\S/.test(line)) inGlobal = line.trim() === "/*";
    else if (inGlobal && line.includes(":")) {
      const i = line.indexOf(":");
      headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  // HSTS / upgrade-insecure-requests would break plain-http localhost.
  delete headers["Strict-Transport-Security"];
  if (headers["Content-Security-Policy"]) {
    headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace(/;\s*upgrade-insecure-requests/, "");
  }
  return headers;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  worker: {
    format: "es",
  },
  preview: {
    headers: productionHeaders(),
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/server/**/*.test.ts"],
  },
});
