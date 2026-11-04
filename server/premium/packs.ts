/**
 * Premium template packs. SERVER ONLY: this file is imported by functions/,
 * never by src/, so the templates are not in the public bundle and are only
 * delivered to holders of a valid license (see server/handlers.ts → pack).
 */
import { contact, t, type Template } from "../../src/lib/forms/templateBuilder";

const smallBusiness: Template[] = [
  t("po", "Purchase Order", "business", "Order goods or services from a supplier, with line items and approval.", (b) =>
    b.section("Buyer").pair(["Company"], ["PO number"]).pair(["Order date", "date"], ["Required by", "date"]).field("Ship to")
      .section("Supplier").pair(["Supplier"], ["Contact"]).pair(["Phone", "phone"], ["Email", "email"])
      .section("Items").table(["Item / description", "Qty", "Unit price", "Total"], 8, "Line")
      .pair(["Subtotal"], ["Shipping"]).pair(["Tax"], ["Order total"])
      .dropdown("Payment terms", ["Due on receipt", "Net 15", "Net 30", "Net 60"])
      .field("Notes", "text", { multiline: true, height: 40 })
      .signature("Authorized by")),
  t("quote", "Quote / Estimate", "business", "Send a professional price quote with validity date and acceptance.", (b) =>
    b.section("From").pair(["Business"], ["Quote number"]).pair(["Date", "date"], ["Valid until", "date"])
      .section("Prepared for").field("Client name").field("Client address")
      .section("Scope").field("Project description", "text", { multiline: true, height: 50 })
      .table(["Service / item", "Qty", "Rate", "Amount"], 6, "Item")
      .pair(["Subtotal"], ["Discount"]).pair(["Tax"], ["Total"])
      .paragraph("To accept this quote, sign below and return it before the expiry date.")
      .signature("Client acceptance")),
  t("work-order", "Work Order", "business", "Assign a job with location, tasks, materials, hours and sign-off.", (b) =>
    b.section("Job").pair(["Work order #"], ["Date", "date"]).pair(["Customer"], ["Phone", "phone"]).field("Job location")
      .radios("Priority", ["Low", "Normal", "High", "Emergency"])
      .field("Work requested", "text", { multiline: true, height: 50 })
      .section("Labor").table(["Technician", "Date", "Hours", "Rate"], 4, "Labor")
      .section("Materials").table(["Material", "Qty", "Cost"], 4, "Material")
      .checkboxes(["Work completed", "Follow-up needed", "Customer notified"], 3)
      .signature("Customer sign-off")),
  t("expense-report", "Expense Report", "business", "Claim business expenses with categories, totals and approval.", (b) =>
    b.section("Employee").pair(["Name"], ["Department"]).pair(["Period from", "date"], ["Period to", "date"])
      .section("Expenses").table(["Date", "Description", "Category", "Amount"], 10, "Expense")
      .pair(["Total claimed"], ["Advance received"]).field("Amount due")
      .checkboxes(["Receipts attached"], 1)
      .signature("Employee signature").signature("Approved by")),
  t("timesheet", "Weekly Timesheet", "business", "Track daily hours, breaks and overtime for one week.", (b) =>
    b.section("Employee").pair(["Name"], ["Employee ID"]).pair(["Week starting", "date"], ["Manager"])
      .section("Hours").table(["Day", "Start", "End", "Break", "Total"], 7, "Day")
      .pair(["Regular hours"], ["Overtime hours"])
      .signature("Employee signature").signature("Supervisor signature")),
  t("incident-report", "Incident Report", "business", "Record what happened, who was involved and what was done.", (b) =>
    b.section("Incident").pair(["Date", "date"], ["Time"]).field("Location")
      .dropdown("Type", ["Injury", "Near miss", "Property damage", "Security", "Other"])
      .field("What happened?", "text", { multiline: true, height: 70 })
      .section("People involved").table(["Name", "Role", "Phone"], 3, "Person")
      .section("Response").field("Actions taken", "text", { multiline: true, height: 50 })
      .radios("First aid given?", ["Yes", "No"]).radios("Reported to authorities?", ["Yes", "No"])
      .signature("Reported by")),
  t("vendor-application", "Vendor Application", "business", "Collect supplier details, references and banking preferences.", (b) =>
    contact(b.section("Vendor")).field("Business name").pair(["Tax ID"], ["Years in business"])
      .section("Products and services").field("Describe what you supply", "text", { multiline: true, height: 50 })
      .checkboxes(["Insured", "Licensed", "Minority-owned", "Woman-owned", "Veteran-owned", "Local business"], 3, "Vendor")
      .section("References").table(["Company", "Contact", "Phone"], 3, "Reference")
      .radios("Preferred payment", ["Bank transfer", "Check", "Card"])
      .signature("Authorized signature")),
  t("client-onboarding", "Client Onboarding Checklist", "business", "Make sure every new client is set up the same way.", (b) =>
    b.section("Client").pair(["Client"], ["Start date", "date"]).pair(["Account manager"], ["Contract value"])
      .section("Before kickoff").checkboxes(["Contract signed", "Deposit received", "Welcome email sent", "Accounts created", "Kickoff scheduled", "Brief received"], 2, "Pre")
      .section("First 30 days").checkboxes(["Kickoff meeting held", "Goals agreed", "Reporting set up", "First deliverable", "Feedback call"], 2, "Day30")
      .field("Notes", "text", { multiline: true, height: 60 })),
];

export const PACKS: Record<string, Template[]> = {
  "small-business": smallBusiness,
};
