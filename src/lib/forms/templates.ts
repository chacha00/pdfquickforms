/**
 * Free form templates. Original, general-purpose layouts — not official,
 * legal, medical or government forms. Built with a tiny layout DSL so every
 * template is a real editable PDFQuick Forms project.
 */
import { contact, t, type Template, type TemplateCategory } from "./templateBuilder";

export type { Template, TemplateCategory };

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; name: string }[] = [
  { id: "business", name: "Business" },
  { id: "employment", name: "Employment" },
  { id: "housing", name: "Housing & property" },
  { id: "education", name: "Education" },
  { id: "personal", name: "Personal" },
];

export const TEMPLATES: Template[] = [
  // ---------------- business
  t("client-intake", "Client Intake Form", "business", "Collect contact details, the client's needs and how they found you.", (b) =>
    contact(b.section("Contact details"))
      .field("Company")
      .section("About your project")
      .field("What do you need help with?", "text", { multiline: true, height: 70 })
      .dropdown("Budget range", ["Under $1,000", "$1,000 – $5,000", "$5,000 – $20,000", "Over $20,000"])
      .field("Ideal start date", "date")
      .radios("Preferred contact", ["Email", "Phone", "Text message"])
      .section("How did you hear about us?")
      .checkboxes(["Search engine", "Referral", "Social media", "Event", "Other"], 3, "Source")
      .signature("Client signature"),
  "Thank you for choosing us. Please fill in this form so we can prepare for our first conversation."),
  t("contact-information", "Contact Information Form", "business", "A simple, reusable form for collecting someone's contact details.", (b) =>
    contact(b.section("Contact"))
      .field("Organization")
      .field("Job title")
      .radios("Best time to call", ["Morning", "Afternoon", "Evening"])
      .checkboxes(["OK to email me updates", "OK to text me reminders"], 1)),
  t("meeting-request", "Meeting Request Form", "business", "Request a meeting with topic, attendees, preferred dates and format.", (b) =>
    b.section("Requester").field("Name").field("Email", "email").section("Meeting").field("Topic").field("Agenda / goals", "text", { multiline: true, height: 60 })
      .pair(["Preferred date", "date"], ["Alternate date", "date"])
      .dropdown("Duration", ["15 minutes", "30 minutes", "45 minutes", "1 hour", "2 hours"])
      .radios("Format", ["In person", "Video call", "Phone"])
      .field("Attendees", "text", { multiline: true, height: 40 })),
  t("service-request", "Service Request Form", "business", "Capture a customer's service request, priority and access details.", (b) =>
    contact(b.section("Customer"))
      .section("Request")
      .dropdown("Service type", ["Installation", "Repair", "Maintenance", "Consultation", "Other"])
      .radios("Priority", ["Low", "Normal", "Urgent"])
      .field("Describe the request", "text", { multiline: true, height: 70 })
      .pair(["Preferred date", "date"], ["Preferred time"])
      .checkboxes(["Someone will be on site", "Pets on the premises", "Parking available"], 1)
      .signature("Customer signature")),
  t("basic-invoice", "Basic Invoice", "business", "A fillable invoice with line items, totals and payment details.", (b) =>
    b.section("From").field("Business name").field("Business address").pair(["Invoice number"], ["Invoice date", "date"])
      .section("Bill to").field("Customer name").field("Customer address").field("Due date", "date")
      .section("Items").table(["Description", "Qty", "Unit price", "Amount"], 6, "Item")
      .pair(["Subtotal"], ["Tax"]).field("Total due")
      .field("Payment instructions", "text", { multiline: true, height: 40 })),
  t("customer-feedback", "Customer Feedback Form", "business", "Ask customers to rate their experience and share comments.", (b) =>
    b.section("Your visit").field("Date of visit", "date")
      .radios("Overall satisfaction", ["Very satisfied", "Satisfied", "Neutral", "Unsatisfied"])
      .radios("Would you recommend us?", ["Yes", "Maybe", "No"])
      .section("Tell us more").checkboxes(["Friendly staff", "Good value", "Fast service", "Clean location", "Easy to find"], 2, "Liked")
      .field("What could we do better?", "text", { multiline: true, height: 70 })
      .section("Optional").field("Name").field("Email", "email").checkboxes(["You may contact me about my feedback"], 1)),
  // ---------------- employment
  t("job-application", "Job Application", "employment", "A general job application covering contact info, availability, experience and references.", (b) =>
    contact(b.section("Applicant"))
      .section("Position").field("Position applied for").pair(["Available start date", "date"], ["Desired pay"])
      .radios("Employment type", ["Full-time", "Part-time", "Temporary"])
      .radios("Legally able to work here?", ["Yes", "No"])
      .section("Most recent employment").pair(["Employer"], ["Job title"]).pair(["Start date", "date"], ["End date", "date"])
      .field("Responsibilities", "text", { multiline: true, height: 50 })
      .section("References").table(["Name", "Relationship", "Phone"], 3, "Reference")
      .paragraph("I certify that the information on this application is true and complete to the best of my knowledge.")
      .signature("Applicant signature")),
  t("employee-information", "Employee Information Form", "employment", "New-hire personal and emergency-contact details for your records.", (b) =>
    contact(b.section("Employee")).field("Date of birth", "date").section("Job").pair(["Job title"], ["Department"]).pair(["Start date", "date"], ["Manager"])
      .section("Emergency contact").field("Contact name").pair(["Relationship"], ["Phone", "phone"])
      .signature("Employee signature")),
  t("interview-evaluation", "Interview Evaluation Form", "employment", "Score a candidate consistently across key criteria.", (b) =>
    b.section("Candidate").pair(["Candidate"], ["Position"]).pair(["Interviewer"], ["Date", "date"])
      .section("Ratings (1 = poor, 5 = excellent)")
      .radios("Relevant experience", ["1", "2", "3", "4", "5"]).radios("Communication", ["1", "2", "3", "4", "5"])
      .radios("Problem solving", ["1", "2", "3", "4", "5"]).radios("Team fit", ["1", "2", "3", "4", "5"])
      .field("Strengths", "text", { multiline: true, height: 45 }).field("Concerns", "text", { multiline: true, height: 45 })
      .radios("Recommendation", ["Hire", "Second interview", "Do not hire"])),
  t("availability", "Availability Form", "employment", "Collect weekly availability for scheduling shifts.", (b) =>
    b.section("Employee").pair(["Name"], ["Phone", "phone"]).field("Effective from", "date")
      .section("Weekly availability").table(["Day", "From", "To", "Notes"], 7, "Day")
      .radios("Maximum hours / week", ["10", "20", "30", "40"])
      .field("Other constraints", "text", { multiline: true, height: 45 })),
  t("equipment-request", "Equipment Request Form", "employment", "Request equipment with justification and approval sign-off.", (b) =>
    b.section("Requester").pair(["Name"], ["Department"]).field("Date needed", "date")
      .section("Equipment").table(["Item", "Quantity", "Estimated cost"], 4, "Item")
      .field("Reason for request", "text", { multiline: true, height: 50 })
      .radios("Priority", ["Low", "Medium", "High"])
      .section("Approval").signature("Manager approval")),
  // ---------------- housing
  t("maintenance-request", "Maintenance Request", "housing", "Tenants report a maintenance issue and give access permission.", (b) =>
    b.section("Tenant").field("Name").pair(["Unit / address"], ["Phone", "phone"]).field("Email", "email")
      .section("Issue").dropdown("Area", ["Kitchen", "Bathroom", "Bedroom", "Living area", "Exterior", "Other"])
      .radios("Urgency", ["Routine", "Soon", "Emergency"])
      .field("Describe the problem", "text", { multiline: true, height: 70 })
      .checkboxes(["Permission to enter if I'm not home", "There are pets in the unit"], 1)
      .signature("Tenant signature")),
  t("move-in-checklist", "Move-In Checklist", "housing", "Document the condition of each room at move-in.", (b) =>
    b.section("Property").pair(["Tenant"], ["Move-in date", "date"]).field("Address")
      .section("Condition by room").table(["Room", "Condition", "Notes"], 8, "Room")
      .section("Keys and items").checkboxes(["Front door key", "Mailbox key", "Garage remote", "Smoke detectors tested", "Appliance manuals"], 2)
      .signature("Tenant signature").signature("Landlord signature")),
  t("rental-inquiry", "Rental Inquiry Form", "housing", "Prospective tenants describe what they're looking for.", (b) =>
    contact(b.section("About you"))
      .section("What you're looking for").dropdown("Bedrooms", ["Studio", "1", "2", "3", "4+"]).pair(["Desired move-in", "date"], ["Monthly budget"])
      .radios("Lease length", ["6 months", "12 months", "Flexible"])
      .checkboxes(["Pets", "Parking needed", "Laundry in unit", "Furnished"], 2, "Needs")
      .field("Questions or notes", "text", { multiline: true, height: 50 })),
  t("property-inspection", "Property Inspection Checklist", "housing", "Room-by-room inspection with pass/attention items.", (b) =>
    b.section("Inspection").pair(["Property"], ["Date", "date"]).field("Inspector")
      .section("Exterior").checkboxes(["Roof", "Gutters", "Siding", "Walkways", "Lighting", "Landscaping"], 3, "Exterior OK")
      .section("Interior").checkboxes(["Walls and ceilings", "Floors", "Windows", "Doors and locks", "Plumbing", "Electrical", "Heating / cooling", "Appliances", "Smoke / CO detectors"], 3, "Interior OK")
      .field("Items needing attention", "text", { multiline: true, height: 70 })
      .signature("Inspector signature")),
  t("tenant-contact", "Tenant Contact Form", "housing", "Keep tenant and emergency contact details up to date.", (b) =>
    contact(b.section("Tenant")).field("Unit")
      .section("Other occupants").table(["Name", "Relationship", "Phone"], 3, "Occupant")
      .section("Emergency contact").field("Name ").pair(["Relationship"], ["Phone ", "phone"])
      .radios("Preferred contact", ["Phone", "Email", "Text"])),
  // ---------------- education
  t("student-information", "Student Information Form", "education", "Student and guardian details for the start of term.", (b) =>
    b.section("Student").field("Student name").pair(["Date of birth", "date"], ["Grade / class"])
      .section("Parent or guardian").field("Guardian name").pair(["Phone", "phone"], ["Email", "email"]).field("Address")
      .section("Additional information").field("Allergies or needs", "text", { multiline: true, height: 45 })
      .checkboxes(["Photo permission granted", "May walk home alone"], 1)
      .signature("Guardian signature")),
  t("permission-slip", "Permission Slip", "education", "Parent or guardian permission for a trip or activity.", (b) =>
    b.section("Activity").field("Activity / trip").pair(["Date", "date"], ["Location"])
      .section("Student").pair(["Student name"], ["Class"])
      .radios("Permission", ["I give permission", "I do not give permission"])
      .section("Emergency contact").pair(["Name"], ["Phone", "phone"]).field("Medical notes", "text", { multiline: true, height: 40 })
      .signature("Parent / guardian signature")),
  t("assignment-checklist", "Assignment Checklist", "education", "A submission checklist students tick off before handing in work.", (b) =>
    b.section("Assignment").pair(["Student"], ["Due date", "date"]).field("Assignment title")
      .section("Before you submit").checkboxes(["Name and date on every page", "Followed the instructions", "Answered every question", "Checked spelling and grammar", "Cited sources", "Saved a copy"], 1)
      .field("Questions for the teacher", "text", { multiline: true, height: 50 })),
  t("event-registration", "Event Registration Form", "education", "Register attendees, sessions and dietary needs.", (b) =>
    contact(b.section("Attendee"))
      .section("Registration").dropdown("Ticket type", ["General", "Student", "Volunteer", "Speaker"])
      .checkboxes(["Morning session", "Afternoon session", "Evening social"], 3, "Session")
      .radios("Meal preference", ["Standard", "Vegetarian", "Vegan", "None"])
      .field("Accessibility needs", "text", { multiline: true, height: 40 })),
  // ---------------- personal
  t("emergency-contact", "Emergency Contact Form", "personal", "Who to call in an emergency, plus key medical notes.", (b) =>
    b.section("About me").field("Full name").pair(["Date of birth", "date"], ["Phone", "phone"])
      .section("Primary contact").field("Name").pair(["Relationship"], ["Phone ", "phone"])
      .section("Secondary contact").field("Name ").pair(["Relationship "], ["Phone  ", "phone"])
      .section("Medical").field("Allergies").field("Medications", "text", { multiline: true, height: 40 }).field("Doctor")),
  t("household-inventory", "Household Inventory", "personal", "List valuables for insurance or moving.", (b) =>
    b.section("Household").pair(["Owner"], ["Date", "date"]).field("Address")
      .section("Items").table(["Item", "Room", "Serial / model", "Value"], 12, "Item")),
  t("travel-checklist", "Travel Checklist", "personal", "Trip details and a packing checklist.", (b) =>
    b.section("Trip").field("Destination").pair(["Depart", "date"], ["Return", "date"]).field("Accommodation")
      .section("Documents").checkboxes(["Passport / ID", "Tickets", "Insurance", "Reservations", "Cash / cards", "Driver's license"], 3)
      .section("Packing").checkboxes(["Chargers", "Medications", "Toiletries", "Clothes", "Adapters", "Snacks"], 3, "Packed")
      .field("Notes", "text", { multiline: true, height: 50 })),
  t("personal-information", "Personal Information Form", "personal", "A general personal details form.", (b) =>
    contact(b.section("Personal details")).field("Date of birth", "date")
      .radios("Preferred contact", ["Phone", "Email", "Mail"])
      .section("Emergency contact").field("Emergency contact name").field("Emergency contact phone", "phone")),
];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((x) => x.id === id);
}
