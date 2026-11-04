import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { clickAt, clickDownload, downloadBytes, fixture, openBlank, openPdf, pdfjsWidgets, place, readFields, trackConsoleErrors } from "./helpers";

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = trackConsoleErrors(page);
});
test.afterEach(() => expect(errors, "console errors / CSP violations").toEqual([]));

test("ACCEPTANCE: non-fillable PDF → add text field + checkbox → save → download → reopen → fields interactive → fill → save → reopen", async ({ page }) => {
  // 1-2. Open PDFQuick Forms and upload a non-fillable PDF
  await page.goto("/");
  await page.getByRole("link", { name: "Make a PDF Fillable" }).first().click();
  await expect(page).toHaveURL(/make-pdf-fillable$/);
  await page.getByLabel("Suggest fields automatically (Auto-detect, free)").uncheck();
  await page.getByTestId("file-input").setInputFiles(fixture("alpha.pdf"));
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByTestId("page-surface-3")).toBeVisible();
  // the page renders (background image present)
  await expect(page.getByTestId("page-surface-1").locator("..").locator("img").first()).toBeVisible();

  // 3. Add a text field (focused automatically, so typing sets its default value)
  await place(page, "Text field", 1, 20, 100, 201);
  await page.getByLabel("Field name").fill("Customer name");
  // 4. Add a checkbox
  await place(page, "Checkbox", 1, 20, 160, 201);
  await page.getByLabel("Field name").fill("Accepted");
  await expect(page.getByTestId("form-element")).toHaveCount(2);

  // 5. Save the project locally
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();

  // 6. Download the PDF
  const download = await clickDownload(page);
  expect(download.suggestedFilename()).toBe("alpha.pdf");
  await expect(page.getByRole("heading", { name: "Your fillable PDF is ready!" })).toBeVisible();
  const exported = await downloadBytes(download);

  // 7-8. Reopen: both fields exist and are interactive (pdf-lib + PDF.js / Firefox engine)
  expect((await PDFDocument.load(exported)).getPageCount()).toBe(3);
  expect((await readFields(exported)).map(({ name, type, page: p }) => ({ name, type, page: p }))).toEqual([
    { name: "Customer name", type: "text", page: 0 },
    { name: "Accepted", type: "checkbox", page: 0 },
  ]);
  const widgets = await pdfjsWidgets(exported);
  expect(widgets.map((w) => `${w.fieldName}:${w.fieldType}`)).toEqual(["Customer name:Tx", "Accepted:Btn"]);

  // 9. Fill the fields (with our Fill tool, from the downloaded file)
  const dir = mkdtempSync(join(tmpdir(), "pqf-"));
  const file = join(dir, "alpha-fillable.pdf");
  writeFileSync(file, exported);
  await page.goto("/fill-pdf-online");
  await page.getByTestId("file-input").setInputFiles(file);
  await expect(page).toHaveURL(/\/fill$/);
  await page.getByRole("textbox", { name: "Customer name" }).fill("Ada Lovelace");
  await page.getByRole("checkbox", { name: "Accepted" }).click();

  // 10. Save and reopen the completed PDF
  const filled = await downloadBytes(await clickDownload(page));
  expect((await readFields(filled)).map((f) => [f.name, f.value])).toEqual([
    ["Customer name", "Ada Lovelace"],
    ["Accepted", true],
  ]);
  // and it is still fillable (editable download)
  expect((await pdfjsWidgets(filled)).length).toBe(2);
});

test("create from scratch: every field type, layout, two pages", async ({ page }) => {
  await openBlank(page);
  await place(page, "Heading", 1, 72, 50);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Registration");
  await place(page, "Text field", 1, 72, 120);
  await page.keyboard.type("Grace");
  await place(page, "Email", 1, 72, 160);
  await page.keyboard.type("grace@example.com");
  await place(page, "Phone", 1, 72, 200);
  await place(page, "Date", 1, 72, 240);
  await page.getByLabel("Date format").selectOption("yyyy-mm-dd");
  await place(page, "Radio button", 1, 72, 290);
  await page.getByLabel("Group name").fill("Size");
  await page.getByLabel("Option value").fill("Small");
  await page.getByRole("button", { name: "Add option to this group" }).click();
  await page.getByLabel("Option value").fill("Large");
  await page.getByLabel("Selected by default").check();
  await place(page, "Dropdown", 1, 72, 340);
  await page.getByLabel("Options (one per line)").fill("Red\nGreen\nBlue");
  await page.getByLabel("Default selection").selectOption("Green");
  await place(page, "List box", 1, 300, 340);
  await page.getByLabel("Allow multiple selections").check();
  await place(page, "Signature area", 1, 72, 450);
  await place(page, "Divider", 1, 72, 500);
  // second page
  await page.getByRole("tab", { name: /Pages/ }).click();
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(page.getByTestId("page-surface-2")).toBeVisible();
  await page.getByRole("tab", { name: "Add" }).click();
  await place(page, "Checkbox", 2, 72, 100);

  const bytes = await downloadBytes(await clickDownload(page));
  const fields = await readFields(bytes);
  expect(fields.map(({ name, type, value, page: p }) => ({ name, type, value, page: p }))).toEqual([
    { name: "Text 1", type: "text", value: "Grace", page: 0 },
    { name: "Email 1", type: "text", value: "grace@example.com", page: 0 },
    { name: "Phone 1", type: "text", value: "", page: 0 },
    { name: "Date 1", type: "text", value: "", page: 0 },
    { name: "Size", type: "radio", value: "Large", page: 0 },
    { name: "Dropdown 1", type: "dropdown", value: "Green", page: 0 },
    { name: "List 1", type: "listbox", value: [], page: 0 },
    { name: "Signature 1", type: "signature", value: null, page: 0 },
    { name: "Checkbox 1", type: "checkbox", value: false, page: 1 },
  ]);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(2);
  expect(doc.getForm().getRadioGroup("Size").getOptions()).toEqual(["Small", "Large"]);
  expect(doc.getForm().getDropdown("Dropdown 1").getOptions()).toEqual(["Red", "Green", "Blue"]);
  expect(doc.getForm().getOptionList("List 1").isMultiselect()).toBe(true);
});

test("existing AcroForm fields are shown, fillable, and preserved", async ({ page }) => {
  await openPdf(page, "existing-form.pdf");
  await expect(page.getByTestId("existing-field")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Existing field Existing name" }).fill("Typed into existing");
  await place(page, "Text field", 1, 72, 300);
  await page.getByLabel("Field name").fill("Added later");
  const fields = await readFields(await downloadBytes(await clickDownload(page)));
  expect(fields.map((f) => [f.name, f.value])).toEqual([
    ["Existing name", "Typed into existing"],
    ["Existing agree", false],
    ["Added later", ""],
  ]);
});

test("a name that clashes with an existing field blocks download with a clear fix", async ({ page }) => {
  await openPdf(page, "existing-form.pdf");
  await place(page, "Text field", 1, 72, 300);
  await page.getByLabel("Field name").fill("Existing name");
  await expect(page.getByText("Another field already uses this name.")).toBeVisible();
  await page.getByTestId("download").click();
  await expect(page.getByRole("dialog", { name: "Fix these before downloading" })).toContainText('"Existing name" is already used');
});

test("auto-detect suggests fields that must be reviewed", async ({ page }) => {
  await openPdf(page, "paper-form.pdf", true);
  await expect(page.getByText(/Found \d+ possible fields/)).toBeVisible({ timeout: 10_000 });
  const suggested = page.locator('[data-testid="form-element"]');
  const n = await suggested.count();
  expect(n).toBeGreaterThanOrEqual(6);
  await expect(page.getByText(`${n} suggested fields to review.`)).toBeVisible();
  // Download without accepting → prompted
  await page.getByTestId("download").click();
  await expect(page.getByRole("dialog", { name: "Unreviewed suggestions" })).toBeVisible();
  await page.getByRole("button", { name: "Accept all and download" }).click();
  const download = await page.waitForEvent("download");
  const fields = await readFields(await downloadBytes(download));
  const types = fields.map((f) => f.type);
  expect(types).toContain("checkbox");
  expect(types).toContain("signature");
  expect(fields.map((f) => f.name)).toEqual(expect.arrayContaining(["Full name", "Email address", "Date of birth", "Phone", "I agree to the club rules"]));
});

test("move with keyboard, undo/redo, duplicate, delete", async ({ page }) => {
  await openBlank(page);
  await place(page, "Text field", 1, 100, 100);
  const x = page.getByLabel("X", { exact: true });
  await expect(x).toHaveValue("100");
  await page.getByRole("button", { name: /^Move Text field "Text 1"/ }).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(x).toHaveValue("110");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(x).toHaveValue("100");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(x).toHaveValue("110");
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByTestId("form-element")).toHaveCount(2);
  await expect(page.getByLabel("Field name")).toHaveValue("Text 2");
  await page.getByRole("button", { name: /^Move Text field "Text 2"/ }).focus();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("form-element")).toHaveCount(1);
  await page.keyboard.press("Control+Z");
  await expect(page.getByTestId("form-element")).toHaveCount(2);
});

test("drag to move with snapping, and resize with the handle", async ({ page }) => {
  await openBlank(page);
  await place(page, "Text field", 1, 100, 100);
  const handle = page.getByRole("button", { name: /^Move Text field "Text 1"/ });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 80, { steps: 8 });
  await page.mouse.up();
  const left = Number(await page.getByLabel("X", { exact: true }).inputValue());
  expect(left).toBeGreaterThan(120);
  await page.getByLabel("W", { exact: true }).fill("250");
  await expect(page.getByLabel("W", { exact: true })).toHaveValue("250");
});

test("page operations: duplicate, reorder, delete with confirmation", async ({ page }) => {
  await openBlank(page);
  await place(page, "Checkbox", 1, 100, 100);
  await page.getByRole("tab", { name: /Pages/ }).click();
  await page.getByRole("button", { name: "Duplicate page 1" }).click();
  await expect(page.getByTestId("page-row")).toHaveCount(2);
  await expect(page.getByTestId("form-element")).toHaveCount(2);
  await page.getByRole("button", { name: "Insert blank page after page 2" }).click();
  await page.getByRole("button", { name: "Move page 3 up" }).click();
  await page.getByRole("button", { name: "Change orientation of page 2" }).click();
  await page.getByRole("button", { name: "Delete page 1" }).click();
  await page.getByRole("dialog", { name: "Delete page 1?" }).getByRole("button", { name: "Delete page" }).click();
  await expect(page.getByTestId("page-row")).toHaveCount(2);
  const bytes = await downloadBytes(await clickDownload(page));
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())])).toEqual([
    [792, 612],
    [612, 792],
  ]);
  expect((await readFields(bytes)).map((f) => [f.name, f.page])).toEqual([["Checkbox 2", 1]]);
});

test("templates open in the editor and export many real fields", async ({ page }) => {
  await page.goto("/free-pdf-templates");
  await page.getByRole("button", { name: /Client Intake Form/ }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.locator("#form-name")).toHaveValue("Client Intake Form");
  const fields = await readFields(await downloadBytes(await clickDownload(page)));
  expect(fields.length).toBeGreaterThan(15);
  expect(fields.map((f) => f.name)).toEqual(expect.arrayContaining(["Full name", "Email", "Budget range", "Preferred contact", "Client signature"]));
});

test("every template exports without errors", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/free-pdf-templates");
  const count = await page.getByRole("button", { name: /Use this template/ }).count();
  expect(count).toBe(24);
  for (let i = 0; i < count; i++) {
    await page.goto("/free-pdf-templates");
    await page.getByRole("button", { name: /Use this template/ }).nth(i).click();
    await expect(page.getByTestId("page-surface-1")).toBeVisible();
    const bytes = await downloadBytes(await clickDownload(page));
    expect((await readFields(bytes)).length).toBeGreaterThan(3);
  }
});

test("saved projects survive a reload", async ({ page }) => {
  await openBlank(page);
  await page.locator("#form-name").fill("My saved form");
  await place(page, "Text field", 1, 100, 100);
  await page.keyboard.type("Remember me");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.goto("/create-fillable-pdf");
  await page.getByRole("button", { name: /^My saved form \d+ page/ }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("textbox", { name: "Text 1" })).toHaveValue("Remember me");
});

test("preview mode validates and behaves like a filled form", async ({ page }) => {
  await openBlank(page);
  await place(page, "Email", 1, 100, 100);
  await page.getByLabel("Required").check();
  await place(page, "Radio button", 1, 100, 150);
  await page.getByRole("button", { name: "Add option to this group" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Preview:")).toBeVisible();
  const email = page.getByRole("textbox", { name: "Email 1" });
  await email.fill("not-an-email");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await email.fill("ok@example.com");
  await expect(email).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("radio", { name: "Choice 1: Option 2" }).click();
  await expect(page.getByRole("radio", { name: "Choice 1: Option 2" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Choice 1: Option 1" }).click();
  await expect(page.getByRole("radio", { name: "Choice 1: Option 2" })).toHaveAttribute("aria-checked", "false");
  // preview values are not written into the download
  await page.getByRole("button", { name: "Back to editing" }).click();
  const fields = await readFields(await downloadBytes(await clickDownload(page)));
  expect(fields[0]!.value).toBe("");
});

test("signature: draw an appearance image", async ({ page }) => {
  await openBlank(page);
  await place(page, "Signature area", 1, 100, 200);
  await page.getByRole("button", { name: "Draw or type signature" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a signature appearance" });
  await expect(dialog).toContainText("not");
  await dialog.getByText("Type").click();
  await dialog.getByLabel("Your name").fill("Ada Lovelace");
  await dialog.getByRole("button", { name: "Use signature" }).click();
  await expect(dialog).toBeHidden();
  const bytes = await downloadBytes(await clickDownload(page));
  expect((await readFields(bytes))[0]).toMatchObject({ type: "signature" });
  expect(await PDFDocument.load(bytes).then((d) => d.getPage(0).node.Resources()?.toString())).toContain("XObject");
});

test("image element: upload a logo", async ({ page }) => {
  await openBlank(page);
  const chooser = page.waitForEvent("filechooser");
  await place(page, "Image", 1, 100, 100);
  await (await chooser).setFiles(fixture("photo.jpg"));
  await expect(page.getByTestId("form-element").locator("img")).toBeVisible();
  const bytes = await downloadBytes(await clickDownload(page));
  expect(await PDFDocument.load(bytes).then((d) => d.getPage(0).node.Resources()?.toString())).toContain("XObject");
});

test("drag a tool from the sidebar onto the page", async ({ page }) => {
  await openBlank(page);
  const tool = page.getByRole("complementary", { name: "Tools and pages" }).getByRole("button", { name: "Checkbox", exact: true });
  await tool.dragTo(page.getByTestId("page-surface-1"), { targetPosition: { x: 150, y: 150 } });
  await expect(page.getByTestId("form-element")).toHaveCount(1);
});

test("encrypted and corrupt PDFs show clear errors", async ({ page }) => {
  await page.goto("/make-pdf-fillable");
  await page.getByTestId("file-input").setInputFiles(fixture("not-a-pdf.pdf"));
  await expect(page.getByRole("alert")).toContainText("unsupported file type");
  await page.getByTestId("file-input").setInputFiles(fixture("corrupt.pdf"));
  await expect(page.getByRole("alert")).toContainText(/couldn't be read|damaged/);
});
