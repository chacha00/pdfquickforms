// Generates deterministic test fixtures in tests/fixtures/files.
// Page widths encode a tag (width = 200 + tag) so tests can verify page order.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "files");
mkdirSync(out, { recursive: true });

async function pdf(name, tags, { rotations = [], landscapeAt = [] } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  tags.forEach((tag, i) => {
    const landscape = landscapeAt.includes(i);
    const page = doc.addPage(landscape ? [400 + tag, 200 + tag / 2] : [200 + tag, 300]);
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: rgb(0.93, 0.96, 1) });
    page.drawText(`${name} p${i + 1}`, { x: 16, y: page.getHeight() - 40, size: 18, font, color: rgb(0.15, 0.39, 0.92) });
    page.drawText(`tag ${tag}`, { x: 16, y: 20, size: 12, font });
    if (rotations[i]) page.setRotation(degrees(rotations[i]));
  });
  doc.setTitle(name);
  writeFileSync(join(out, `${name}.pdf`), await doc.save());
}

await pdf("alpha", [1, 2, 3]);
await pdf("beta", [11, 12], { landscapeAt: [1] });
await pdf("ten-pages", [21, 22, 23, 24, 25, 26, 27, 28, 29, 30], { rotations: [0, 90] });

// A PDF whose trailer declares encryption. Real encrypted files are rejected the same way.
{
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]);
  const dict = doc.context.obj({ Filter: "Standard", V: 2, R: 3, Length: 128, P: -4 });
  doc.context.trailerInfo.Encrypt = doc.context.register(dict);
  writeFileSync(join(out, "encrypted.pdf"), await doc.save({ useObjectStreams: false }));
  void PDFName;
}

// Not a PDF, despite the extension.
writeFileSync(join(out, "corrupt.pdf"), Buffer.from("%PDF-1.7\nthis file is truncated garbage\n"));
writeFileSync(join(out, "not-a-pdf.pdf"), Buffer.from("PK\u0003\u0004 a zip pretending to be a pdf"));

// Small PNG (4x2, red/blue) and JPEG (2x1) images.
writeFileSync(
  join(out, "red.png"),
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"),
);
writeFileSync(
  join(out, "photo.jpg"),
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  ),
);
console.log(`Fixtures written to ${out}`);

// A PDF that already has AcroForm fields.
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("Existing form", { x: 72, y: 740, size: 18, font });
  page.drawText("Existing name:", { x: 72, y: 700, size: 11, font });
  const f = doc.getForm();
  const t = f.createTextField("Existing name");
  t.addToPage(page, { x: 170, y: 694, width: 200, height: 20 });
  const c = f.createCheckBox("Existing agree");
  c.addToPage(page, { x: 72, y: 660, width: 12, height: 12 });
  doc.addPage([612, 792]).drawText("Second page", { x: 72, y: 740, size: 14, font });
  writeFileSync(join(out, "existing-form.pdf"), await doc.save());
}

// A flat "paper form": underscores, [ ] boxes and "Label:" text for Auto-Detect.
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const line = (text, y, x = 72) => page.drawText(text, { x, y, size: 11, font });
  line("Membership application", 740);
  line("Full name: ______________________________", 700);
  line("Email address: __________________________", 670);
  line("Date of birth: ______________", 640);
  line("Phone:", 610);
  line("[ ] I agree to the club rules", 570);
  line("[ ] Send me the newsletter", 550);
  line("Signature: ______________________", 500);
  writeFileSync(join(out, "paper-form.pdf"), await doc.save());
}
console.log("Form fixtures written");
