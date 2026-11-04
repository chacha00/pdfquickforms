/**
 * Product catalog — the single source of truth for prices. The client only
 * ever sends a product id; the server decides the price, and fulfillment
 * re-checks the amount Stripe actually charged against this catalog.
 * Edit src/content/catalog.json to change prices (shown on the site too).
 */
import data from "../src/content/catalog.json";

export interface Product {
  id: string;
  kind: "template_pack" | "credits";
  name: string;
  description: string;
  amount: number; // minor units
  currency: string;
  active: boolean;
  packId?: string;
  credits?: number;
  /** Stripe product tax code — required for Managed Payments (digital goods). */
  taxCode?: string;
  includes?: string[];
}

let products: Product[] = data.products as Product[];

export function catalog(): Product[] {
  return products;
}

export function productById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

/** Tests only. */
export function __setCatalog(p: Product[]) {
  products = p;
}
