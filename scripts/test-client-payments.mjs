// Plain-Node tests for src/lib/client-payments.ts (run: node scripts/test-client-payments.mjs)
import assert from "node:assert/strict";
import { stageOf, owedOf, isPartPaid, parsePeriod, parseSheetDate, addDaysIso, nameScore, nameTokens, parseAmount, moneyByCurrency } from "../src/lib/client-payments.ts";
import { isIsoDate } from "../src/lib/ops-core.ts";
import { jaroWinkler } from "../src/lib/fuzzy.ts";

let pass = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { console.error("FAIL", name, "\n", e.message); process.exitCode = 1; } }

const today = "2026-10-25";
const p = (o) => ({ amount: 100, paid_amount: 0, invoice_no: null, due_on: null, ...o });
t("stageOf: one tab per line", () => {
  assert.equal(stageOf(p({}), today), "for-invoice");
  assert.equal(stageOf(p({ amount: 0 }), today), "for-invoice");
  assert.equal(stageOf(p({ invoice_no: "INV-1", due_on: "2026-11-01" }), today), "for-collection");
  assert.equal(stageOf(p({ invoice_no: "INV-1" }), today), "for-collection");
  assert.equal(stageOf(p({ invoice_no: "INV-1", due_on: "2026-10-24" }), today), "not-paid");
  assert.equal(stageOf(p({ invoice_no: "INV-1", due_on: "2026-10-24", paid_amount: 40 }), today), "not-paid");
  assert.equal(stageOf(p({ invoice_no: "INV-1", paid_amount: 100 }), today), "paid");
  assert.equal(stageOf(p({ paid_amount: 100 }), today), "paid"); // paid even if the invoice no. was never written
  assert.equal(stageOf(p({ amount: 0, invoice_no: "INV-0", due_on: "2026-01-01" }), today), "paid"); // invoiced at zero: nothing to collect
});
t("parseAmount: typos are rejected, not saved wrong", () => {
  assert.equal(parseAmount("1234.5"), 1234.5);
  assert.equal(parseAmount("1,234.50"), 1234.5);
  assert.equal(parseAmount("€900.24"), 900.24);
  assert.equal(parseAmount("EUR 705.87"), 705.87);
  for (const bad of ["abc", "10,50", "1e3", "-5", "1.234", "", "12.5.1"]) assert.ok(Number.isNaN(parseAmount(bad)), bad);
});
t("money per currency is never added across currencies", () => {
  assert.equal(moneyByCurrency({ EUR: 100, GBP: 100 }), "€100.00 + £100.00");
  assert.equal(moneyByCurrency({}), "€0.00");
});
t("owed / part paid", () => {
  assert.equal(owedOf(p({ paid_amount: 40 })), 60);
  assert.equal(owedOf(p({ paid_amount: 150 })), 0);
  assert.equal(isPartPaid(p({ paid_amount: 40 })), true);
  assert.equal(isPartPaid(p({ paid_amount: 100 })), false);
});
t("parsePeriod", () => {
  assert.deepEqual(parsePeriod("1-15 October 2026"), { start: "2026-10-01", end: "2026-10-15" });
  assert.deepEqual(parsePeriod("16-31 October  2026"), { start: "2026-10-16", end: "2026-10-31" });
  assert.deepEqual(parsePeriod("16-31 Sept 2026"), { start: "2026-09-16", end: "2026-09-30" });
  assert.deepEqual(parsePeriod("12- 23 June 2023"), { start: "2023-06-12", end: "2023-06-23" });
  assert.equal(parsePeriod("October"), null);
  assert.equal(parsePeriod("0-15 October 2026"), null);
  assert.equal(parsePeriod("20-15 October 2026"), null);
});
t("dates", () => {
  assert.equal(addDaysIso("2026-10-31", 7), "2026-11-07");
  assert.equal(parseSheetDate("25/10/2026"), "2026-10-25");
  assert.equal(parseSheetDate("10/25/2026"), "2026-10-25");
  assert.equal(parseSheetDate("2026-10-25"), "2026-10-25");
  assert.equal(parseSheetDate(""), null);
  assert.equal(parseSheetDate("31/02/2026"), null);
  assert.equal(parseSheetDate("2026-02-31"), null);
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("2026-02-28"), true);
});
t("client name matching", () => {
  const s = (a, b) => nameScore(a, b, jaroWinkler);
  assert.ok(s("Matt Hopely", "Matt Hopley") >= 0.92);
  assert.ok(s("Rishyn Patel and Dawid Lechowicz", "Dawid Lechowicz/ Rishyn Patel") >= 0.99);
  assert.ok(s("Jarro Ardinez", "Jarro James Ardinez") >= 0.99);
  assert.equal(s("Keith", "Keith O'Connell"), 0);
  assert.ok(s("Daniel Strutt", "Daniel Wilson") < 0.92);
  assert.deepEqual(nameTokens("Sophie and Neil Harold"), ["sophie", "neil", "harold"]);
});
console.log(`${pass} client-payments tests passed`);
