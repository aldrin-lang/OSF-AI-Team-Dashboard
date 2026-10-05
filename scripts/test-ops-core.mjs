// Plain-Node tests for src/lib/ops-core.ts (run: node scripts/test-ops-core.mjs)
import assert from "node:assert/strict";
import {
  addDays, daysBetween, dublinDate, dublinDayBounds, reminderStage, invoiceHealth, reminderTemplate,
  nextCheckinDue, checkinTemplate, whatsappLink, countryFromPhone, parseCandidatePayload, fileUrl, formatMoney, guessRole, textToHtml,
} from "../src/lib/ops-core.ts";

let pass = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { console.error("FAIL", name, "\n", e.message); process.exitCode = 1; } }

// ---- dates ------------------------------------------------------------------
t("addDays / daysBetween", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-10-01", "2026-10-15"), 14);
  assert.equal(daysBetween("2026-10-15", "2026-10-01"), -14);
});
t("dublinDate uses Irish time", () => {
  assert.equal(dublinDate(new Date("2026-10-05T23:30:00Z")), "2026-10-06"); // IST = UTC+1
  assert.equal(dublinDate(new Date("2026-12-05T23:30:00Z")), "2026-12-05"); // GMT = UTC+0
});
t("dublinDayBounds summer + winter", () => {
  assert.deepEqual(dublinDayBounds("2026-10-06"), { start: "2026-10-05T23:00:00.000Z", end: "2026-10-06T23:00:00.000Z" });
  assert.deepEqual(dublinDayBounds("2026-12-06"), { start: "2026-12-06T00:00:00.000Z", end: "2026-12-07T00:00:00.000Z" });
});

// ---- payment reminders ------------------------------------------------------
t("reminder stages", () => {
  const due = "2026-10-20";
  const at = (d) => reminderStage(due, d);
  assert.equal(at("2026-10-10"), null);
  assert.equal(at("2026-10-17"), "before_due");
  assert.equal(at("2026-10-19"), "before_due");
  assert.equal(at("2026-10-20"), "due_today");
  assert.equal(at("2026-10-21"), null);
  assert.equal(at("2026-10-22"), null);
  assert.equal(at("2026-10-23"), "overdue_3");
  assert.equal(at("2026-10-27"), "overdue_7");
  assert.equal(at("2026-11-03"), "overdue_14");
  assert.equal(at("2026-12-25"), "overdue_14");
});
t("invoice health", () => {
  assert.equal(invoiceHealth("paid", "2026-01-01", "2026-10-06"), "paid");
  assert.equal(invoiceHealth("void", "2026-01-01", "2026-10-06"), "void");
  assert.equal(invoiceHealth("open", "2026-10-05", "2026-10-06"), "overdue");
  assert.equal(invoiceHealth("open", "2026-10-06", "2026-10-06"), "due_soon");
  assert.equal(invoiceHealth("open", "2026-10-13", "2026-10-06"), "due_soon");
  assert.equal(invoiceHealth("open", "2026-10-14", "2026-10-06"), "open");
});
t("reminder template escalates and names the invoice", () => {
  const base = { clientName: "Acme Ltd", contactName: "Mary", invoiceNumber: "INV-1", amount: "£500.00", dueOn: "2026-10-20" };
  const soft = reminderTemplate({ ...base, stage: "before_due" });
  const hard = reminderTemplate({ ...base, stage: "overdue_14" });
  assert.match(soft.subject, /Friendly/); assert.match(soft.body, /Hi Mary,/); assert.match(soft.body, /INV-1/);
  assert.match(hard.subject, /Urgent/); assert.match(hard.body, /£500.00/);
  assert.match(reminderTemplate({ ...base, contactName: null, stage: "due_today" }).body, /Hi Acme Ltd,/);
});
t("formatMoney", () => {
  assert.equal(formatMoney(1234.5, "GBP"), "£1,234.50");
  assert.equal(formatMoney(10, "EUR"), "€10.00");
});

// ---- check-ins --------------------------------------------------------------
t("next check-in due", () => {
  assert.equal(nextCheckinDue({ lastDueOn: "2026-10-01", startDate: null, createdAt: "2026-01-01T10:00:00Z", everyDays: 14 }), "2026-10-15");
  assert.equal(nextCheckinDue({ lastDueOn: null, startDate: "2026-09-01", createdAt: "2026-01-01T10:00:00Z", everyDays: 14 }), "2026-09-15");
  assert.equal(nextCheckinDue({ lastDueOn: null, startDate: null, createdAt: "2026-09-20T10:00:00Z", everyDays: 7 }), "2026-09-27");
  assert.equal(nextCheckinDue({ lastDueOn: "2026-10-01", startDate: null, createdAt: "x", everyDays: 1 }), "2026-10-04"); // clamped to 3
});
t("check-in templates", () => {
  const c = checkinTemplate({ kind: "client", contactName: "John Murphy", clientName: "Acme", service: "ai" });
  assert.match(c.body, /^Hi John,/); assert.match(c.body, /AI receptionist/);
  const v = checkinTemplate({ kind: "va", contactName: "Ana", clientName: "Acme", service: "va" });
  assert.match(v.subject, /Acme/);
  assert.match(checkinTemplate({ kind: "client", contactName: "", clientName: "Acme", service: "va", vaName: "Ana" }).body, /Ana, your VA/);
});
t("whatsapp link", () => {
  assert.equal(whatsappLink("+353 87 123 4567", "Hi there"), "https://wa.me/353871234567?text=Hi%20there");
  assert.equal(whatsappLink("123", "x"), null);
  assert.equal(whatsappLink(null, "x"), null);
});

// ---- country ----------------------------------------------------------------
t("country from phone", () => {
  assert.equal(countryFromPhone("+447462031123"), "UK");
  assert.equal(countryFromPhone("+353871234567"), "Ireland");
  assert.equal(countryFromPhone("+353639081651509"), null); // mis-coded PH number
  assert.equal(countryFromPhone("+64 21 123 4567"), "New Zealand");
  assert.equal(countryFromPhone("+61412345678"), "Australia");
  assert.equal(countryFromPhone("+14165551234"), "Canada");
  assert.equal(countryFromPhone("+639171234567"), "Philippines");
  assert.equal(countryFromPhone(null), null);
});

// ---- candidates -------------------------------------------------------------
t("file url shapes", () => {
  assert.equal(fileUrl("https://x.com/cv.pdf"), "https://x.com/cv.pdf");
  assert.equal(fileUrl([{ url: "https://x.com/a.pdf" }]), "https://x.com/a.pdf");
  assert.equal(fileUrl({ "abc-123": { url: "https://x.com/b.pdf", meta: {} } }), "https://x.com/b.pdf");
  assert.equal(fileUrl("not a url"), null);
});
t("candidate payload (GHL webhook with custom fields)", () => {
  const c = parseCandidatePayload({
    contact_id: "c9", first_name: "Maria", last_name: "Santos", email: "Maria@X.ph", phone: "+639171234567",
    "Which job platform did you apply through": "OnlineJobs.ph",
    "Position Title": "Social Media Manager",
    "Hourly Rate Expectation": "$5",
    "How many years of web development experience do you have?": "3",
    "Part Time/Full Time?": "Full time",
    "Upload your CV/Resume": [{ url: "https://files.example.com/cv.pdf" }],
    location: { id: "loc" }, workflow: { id: "w" },
    customData: { notes_from_form: "I love Canva" },
  });
  assert.equal(c.externalKey, "ghl:c9");
  assert.equal(c.fullName, "Maria Santos");
  assert.equal(c.email, "maria@x.ph");
  assert.equal(c.source, "OnlineJobs.ph");
  assert.equal(c.appliedRole, "Social Media Manager");
  assert.equal(c.hourlyRate, "$5");
  assert.equal(c.experience, "3");
  assert.equal(c.availability, "Full time");
  assert.equal(c.cvUrl, "https://files.example.com/cv.pdf");
  assert.equal(c.answers.notes_from_form, "I love Canva");
  assert.ok(!("location" in c.answers) && !("email" in c.answers));
});
t("candidate without contact id keys on email; empty body is safe", () => {
  assert.equal(parseCandidatePayload({ email: "a@b.com", full_name: "A B" }).externalKey, "email:a@b.com");
  const e = parseCandidatePayload(null);
  assert.equal(e.externalKey, null); assert.equal(e.fullName, "");
});

t("guessRole maps applied role text to a VA role", () => {
  assert.equal(guessRole("Social Media Manager"), "Social Media Manager");
  assert.equal(guessRole("Appointment setter / cold caller"), "Appointment Setter");
  assert.equal(guessRole("Bookkeeper (Xero)"), "Bookkeeper / Accountant VA");
  assert.equal(guessRole("QS estimator"), "Quantity Surveyor (QS) VA");
  assert.equal(guessRole("Virtual Assistant"), "General Admin VA");
  assert.equal(guessRole(""), null);
  assert.equal(guessRole("Chef"), null);
});
t("textToHtml escapes and keeps paragraphs", () => {
  const h = textToHtml("Hi <b>Bob</b>,\n\nLine 1\nLine 2");
  assert.ok(h.includes("&lt;b&gt;Bob&lt;/b&gt;"));
  assert.equal((h.match(/<p /g) || []).length, 2);
  assert.ok(h.includes("Line 1<br/>Line 2"));
});

console.log(`${pass} tests passed`);
