// Plain-Node tests for src/lib/mirror.ts and src/lib/departments.ts (run: node scripts/test-mirror.mjs)
import assert from "node:assert/strict";
import { assembleRows, parsePayRuns, money, validRows, bucketOf, reminderEmail } from "../src/lib/mirror.ts";
import { buildMenu, findActive } from "../src/lib/departments.ts";

let pass = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { console.error("FAIL", name, "\n", e.message); process.exitCode = 1; } }

// rows shaped like the sync script sends Customer Payments › " Client VA Payments"
const head1 = [1, null, null, null, "New Client", "NEW VA", null, null, null, "Projected", null, null, null, null, "PT VA", "PT VA", "Maria", "Maria", "Maria", "Maria", "REMARKS/NOTES"];
const head2 = [2, "Date", "Country", "ASSIGNED ", "Client Name", "VA Name", "USD Hourly Rate", "  Hourly Rate", "Max Invoice /payrun", "Hours", "Hours Billed to Client ", "PT Income", "HR/Rate  ", "GBP Client Rate", "USD VA Payment", "VA   Salary", "Total Invoice Amount ( )", "Payment Received (Total Collected )", "Date Paid", "Xero Inv No", null, null, null, "Payment Link", "PAYMENT STATUS"];
const line = (n, client, va, inv, got, xero, note) => [n, "GBP", "UK", null, client, va, null, null, "80.00", "88.00", "88.00", "", "", "", "", "€0.00", inv, got, "", xero, note ?? null];
const rows = assembleRows([{ styles: [{ b: 1 }], rows: [
  head1, head2,
  [4600, null, null, null, null, ["1-15 October 2026", 0]],
  line(4601, "Lee Maher", "Von Andrew", "€900.24", "€900.24", "INV-1"),
  line(-4602, "Craig McKenzie", "Lovely", "€914.32", "", "INV-2", "chased twice"), // hidden in the sheet
  [4603, "GBP will wait for Josef", "UK", null, "Gary Logue", "Clarice", null, null, "10", "11", "10", "", "", "", "", "€0.00", "€0.00"],
  [4650, null, null, null, null, "16-31 October 2026"],
  line(4651, "Alex Serban", "Ronidel", "€675.18", "€300.00", "INV-3"),
] }]);

t("assembleRows keeps row numbers, text, styles", () => {
  assert.equal(rows.length, 8);
  assert.equal(rows[2].num, 4600);
  assert.equal(rows[2].cells[4].v, "1-15 October 2026");
  assert.deepEqual(rows[2].cells[4].s, { b: 1 });
  assert.equal(rows[4].num, 4602);
  assert.equal(rows[4].hidden, true);
  assert.equal(rows[3].hidden, false);
});
t("money parses sheet formats", () => {
  assert.equal(money("EUR €1,234.56"), 1234.56);
  assert.equal(money("£8.50"), 8.5);
  assert.equal(money(""), 0);
});
t("parsePayRuns splits pay-runs and works out status", () => {
  const runs = parsePayRuns(rows);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].label, "1-15 October 2026");
  assert.equal(runs[0].month, "October 2026");
  assert.deepEqual(runs[0].lines.map((l) => l.status), ["Paid", "Unpaid", "Not invoiced"]);
  assert.equal(runs[0].lines[1].notes, "chased twice"); // hidden rows still count
  assert.equal(runs[0].lines[2].remark, "GBP will wait for Josef");
  assert.equal(Math.round(runs[0].invoiced * 100), 181456);
  assert.equal(runs[1].lines[0].status, "Part paid");
});
t("validRows", () => {
  assert.equal(validRows([[1, "a"]]), true);
  assert.equal(validRows([["x"]]), false);
});
t("menu: areas decide departments; sheet tabs follow pages", () => {
  const menu = buildMenu(["payments", "candidates"], [
    { key: "acc-pnl", department: "accounts", label: "P&L", position: 5 },
    { key: "acc-va-mom", department: "accounts", label: "OSF VA MoM", position: 1 },
  ]);
  assert.deepEqual(menu.map((d) => d.key), ["recruitment", "accounts"]);
  assert.deepEqual(menu[1].tabs.map((x) => x.href), ["/d/accounts", "/d/accounts/acc-va-mom", "/d/accounts/acc-pnl"]);
  assert.equal(findActive(menu, "/d/accounts/acc-pnl")?.tab.label, "P&L");
  assert.equal(findActive(menu, "/settings"), null);
});
t("menu: client pages belong to VA Managers › Clients", () => {
  const menu = buildMenu(["clients"], []);
  assert.equal(findActive(menu, "/clients/abc")?.tab.label, "Clients");
  assert.equal(findActive(menu, "/")?.dept.key, "va-managers");
});

t("bucketOf: each line lands in one worklist", () => {
  const base = { row: 1, client: "Craig McKenzie", va: "Lovely", country: "UK", remark: "", invoice: 100, received: 0, datePaid: "", xero: "INV-2", notes: "", sheetStatus: "", status: "Unpaid" };
  assert.equal(bucketOf(base).bucket, "remind");
  assert.equal(bucketOf({ ...base, received: 100, datePaid: "20/10/2026", status: "Paid" }).bucket, "paid");
  assert.match(bucketOf({ ...base, received: 100, status: "Paid" }).reason, /no date paid/);
  assert.match(bucketOf({ ...base, received: 40, status: "Part paid" }).reason, /Part paid/);
  assert.match(bucketOf({ ...base, invoice: 0, status: "Not invoiced" }).reason, /no reason written/);
  assert.match(bucketOf({ ...base, sheetStatus: "PAID" }).reason, /no amount received/);
  assert.equal(bucketOf({ ...base, sheetStatus: "UNPAID" }).bucket, "remind");
});
t("reminderEmail: one email per client, first name, total", () => {
  const l = (xero, inv) => ({ row: 1, client: "Dawid Lechowicz/ Rishyn Patel", va: "Diosa", country: "", remark: "", invoice: inv, received: 0, datePaid: "", xero, notes: "", sheetStatus: "", status: "Unpaid" });
  const e = reminderEmail("Dawid Lechowicz/ Rishyn Patel", [l("INV-1", 100), l("INV-2", 50.5)], "1-15 October 2026");
  assert.match(e.body, /^Hi Dawid,/);
  assert.match(e.body, /invoices for 1-15 October 2026 are still showing/);
  assert.match(e.subject, /INV-1, INV-2/);
  assert.match(e.body, /Total: €150\.50/);
});

console.log(`${pass} mirror tests passed`);
