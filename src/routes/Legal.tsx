import type { ReactNode } from "react";
import { Link } from "react-router";
import { Seo } from "../components/layout/Seo";
import { pageMeta } from "../content/site";
import { AD_CLIENT, getConsent, setConsent } from "../components/advertising/ads";
import { Button } from "../components/ui/primitives";

const UPDATED = "November 4, 2026";
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL;

function Page({ path, children }: { path: string; children: ReactNode }) {
  const m = pageMeta(path);
  return (
    <article className="prose-tool mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Seo {...m} path={path} />
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{m.h1}</h1>
      <p className="mt-2 text-sm">Last updated {UPDATED}</p>
      {children}
    </article>
  );
}

const Contact = () =>
  CONTACT ? (
    <a className="text-primary underline" href={`mailto:${CONTACT}`}>
      {CONTACT}
    </a>
  ) : (
    <span>the contact address on our <Link className="text-primary underline" to="/contact">contact page</Link></span>
  );

export function Privacy() {
  return (
    <Page path="/privacy">
      <h2>Your documents</h2>
      <p>
        PDFQuick Forms opens, edits, fills and creates PDFs <strong>in your web browser</strong>. When you choose a file, your browser reads it into the memory of the open tab.
        Your PDFs, the fields you add, the answers you type and any signature images you draw are <strong>not uploaded to our servers</strong> and we cannot see them. No current
        feature sends documents to a server or to any AI provider.
      </p>
      <h2>Saved projects</h2>
      <p>
        If you click Save project, the form (including the original PDF and any images) is stored in your browser's IndexedDB storage on this device. It isn't sent to us and
        isn't available on other devices. You can delete saved projects from the start page, or by clearing this site's data in your browser settings.
      </p>
      <h2>Information we do collect</h2>
      <ul className="list-disc pl-5">
        <li><strong>Hosting logs:</strong> our hosting provider processes standard request data (IP address, browser type, pages requested) to deliver and protect the site. These requests never contain your documents.</li>
        <li><strong>Usage statistics (if enabled):</strong> anonymous events such as “form downloaded” or “error”, with counts. Never document text, form answers, file names or signatures.</li>
        <li><strong>Advertising (if enabled):</strong> see the <Link className="text-primary underline" to="/cookies">cookie policy</Link> and <Link className="text-primary underline" to="/advertising">advertising disclosure</Link>. Ads are only loaded after you allow them.</li>
      </ul>
      <p>We don't have accounts, so we don't collect names, email addresses or passwords.</p>
      <h2>Optional purchases</h2>
      <p>
        Premium template packs are optional one-time purchases. Payment is handled by <strong>Stripe</strong> on Stripe's checkout page — we never see or store your card
        details. Stripe acts as the merchant of record for these purchases (shown at checkout as “Sold through Link”): it calculates and collects any sales tax or VAT, sends your
        receipt, and processes your payment information under its own privacy policy. From Stripe we receive and keep: the product you bought, the amount, the payment status, a Stripe payment reference, a receipt link and the email address you
        entered at checkout. We use the email only to help you recover your license key. We keep purchase records for as long as needed for accounting, tax and fraud-prevention
        obligations. License keys themselves are not stored — only a one-way hash.
      </p>
      <p>When you buy, your browser stores your license key locally so you don't have to paste it again. Buying a pack doesn't change how your documents are handled: they still never leave your device.</p>
      <h2>What this doesn't protect against</h2>
      <p>Software already on your device — such as browser extensions — may be able to read pages you open. Downloaded files are saved wherever your browser saves downloads.</p>
      <h2>Data deletion</h2>
      <p>We hold no documents or form answers to delete. To remove locally saved projects, delete them from the start page or clear this site's data in your browser. For any other request, contact us at <Contact />.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page path="/terms">
      <h2>Using PDFQuick Forms</h2>
      <p>You may use PDFQuick Forms free of charge for personal and commercial purposes. You're responsible for having the right to edit the documents you open and for the content of forms you create.</p>
      <h2>Templates</h2>
      <p>Templates are general examples, not legal, medical, financial or government forms, and are not reviewed for any particular jurisdiction. Check that a form meets your requirements before you rely on it.</p>
      <h2>Signatures</h2>
      <p>Signature images placed with PDFQuick Forms are pictures, not cryptographic digital signatures. PDFQuick Forms does not verify identity or keep consent or audit records.</p>
      <h2>Purchases and refunds</h2>
      <p>
        Premium packs are one-time purchases with no recurring charges. If a pack doesn't work for you, contact us within 14 days for a refund. Purchases are processed by Stripe as merchant of record, which may also issue
        refunds directly. If a payment is refunded or disputed, the pack's license key stops working. Consumer rights you have under local law are not affected.
      </p>
      <h2>No warranty</h2>
      <p>The service is provided “as is”. PDF files and PDF readers vary, and we can't guarantee every document will process or display identically everywhere. Keep your original files.</p>
      <h2>Limitation of liability</h2>
      <p>To the extent permitted by law, PDFQuick Forms is not liable for indirect or consequential losses arising from use of the service.</p>
    </Page>
  );
}

export function Cookies() {
  const consent = getConsent();
  return (
    <Page path="/cookies">
      <h2>What we store in your browser</h2>
      <ul className="list-disc pl-5">
        <li><strong>Saved projects</strong> (IndexedDB) — only when you click Save project.</li>
        <li><strong>Your license keys</strong> (localStorage key <code>pdfquick-forms:licenses</code>) — only if you buy a premium pack.</li>
        <li><strong>Your advertising choice</strong> (localStorage key <code>pdfquick-forms:ad-consent</code>) — only when ads are enabled and you make a choice.</li>
      </ul>
      <p>PDFQuick Forms itself sets no tracking cookies.</p>
      <h2>Advertising cookies</h2>
      <p>
        {AD_CLIENT
          ? "This site may show ads from Google AdSense on informational pages. Google's ad script — and its cookies — are loaded only after you choose “Allow ads”. If you choose “No ads cookies”, the ad script is not loaded."
          : "Advertising is not enabled on this site at the moment, so no advertising cookies are set."}{" "}
        See <a className="text-primary underline" href="https://policies.google.com/technologies/ads" rel="noopener noreferrer" target="_blank">how Google uses cookies in advertising</a>.
      </p>
      {AD_CLIENT && (
        <div className="not-prose mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm">Current choice: <strong>{consent === "granted" ? "ads allowed" : consent === "denied" ? "no ads cookies" : "not chosen"}</strong></span>
          <Button size="sm" variant="secondary" onClick={() => { setConsent("denied"); location.reload(); }}>No ads cookies</Button>
          <Button size="sm" variant="secondary" onClick={() => { setConsent("granted"); location.reload(); }}>Allow ads</Button>
        </div>
      )}
    </Page>
  );
}

export function Advertising() {
  return (
    <Page path="/advertising">
      <p className="mt-6">PDFQuick Forms is free, with no subscriptions. When enabled, clearly labeled ads on informational pages help pay for it.</p>
      <h2>Where ads may appear</h2>
      <ul className="list-disc pl-5">
        <li>The home page, below the main section and between sections</li>
        <li>The template gallery</li>
        <li>Guides and help pages</li>
        <li>Landing pages, inside the explanatory content below the tool</li>
      </ul>
      <h2>Where ads never appear</h2>
      <ul className="list-disc pl-5">
        <li>Inside the form editor or the PDF filling tool</li>
        <li>On or over your document or its fields</li>
        <li>Next to download, delete or other important buttons</li>
      </ul>
      <p>Every ad is labeled “Advertisement”. We never ask you to click ads, and ads never unlock features. Ads are only loaded after you allow them.</p>
    </Page>
  );
}

export function ContactPage() {
  return (
    <Page path="/contact">
      <p className="mt-6">
        {CONTACT ? (
          <>For support, privacy questions or data requests, email <Contact />.</>
        ) : (
          <>A contact address hasn't been configured for this deployment yet.</>
        )}
      </p>
      <p>Please don't email documents — we don't need them to help, and we'd rather not receive personal information.</p>
    </Page>
  );
}
