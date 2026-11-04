/**
 * Cloudflare Pages Function: all /api/* routes.
 * Bindings and secrets: see wrangler.toml and docs/STRIPE.md.
 */
import Stripe from "stripe";
import { route } from "../../server/handlers";
import type { D1Like, Env } from "../../server/types";

interface PagesEnv extends Omit<Env, "DB"> {
  DB: D1Like;
}

let cached: { key: string; stripe: Stripe } | null = null;

function stripeFor(env: PagesEnv): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (cached?.key !== env.STRIPE_SECRET_KEY) {
    cached = {
      key: env.STRIPE_SECRET_KEY,
      // Workers runtime: fetch-based HTTP client; API version pinned by this SDK release.
      stripe: new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, appInfo: { name: "PDFQuick Forms" } }),
    };
  }
  return cached.stripe;
}

export const onRequest = async (ctx: { request: Request; env: PagesEnv }): Promise<Response> => {
  const { request, env } = ctx;
  const stripe = stripeFor(env);
  return route(request, {
    env: env as Env,
    db: env.DB,
    stripe: stripe
      ? {
          checkout: { sessions: { create: (p) => stripe.checkout.sessions.create(p), retrieve: (id, p) => stripe.checkout.sessions.retrieve(id, p) } },
          // SubtleCrypto provider for the Workers runtime.
          webhooks: { constructEventAsync: (payload, header, secret) => stripe.webhooks.constructEventAsync(payload, header, secret, undefined, Stripe.createSubtleCryptoProvider()) },
        }
      : null,
    now: () => new Date(),
    fetch: (...a) => fetch(...a),
  });
};
