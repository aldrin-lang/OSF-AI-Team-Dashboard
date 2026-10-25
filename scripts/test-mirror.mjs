// Plain-Node tests for src/lib/mirror.ts and src/lib/departments.ts (run: node scripts/test-mirror.mjs)
import assert from "node:assert/strict";
import { assembleRows, parsePayRuns, money, validRows } from "../src/lib/mirror.ts";
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
t("parsePayRuns: an overpayment typo doesn't inflate collected", () => {
  const typo = assembleRows([{ styles: [], rows: [head1, head2, [10, null, null, null, null, "1-15 May 2026"], line(11, "Daniel Strutt", "Kate", "€838.64", "83864", "INV-9")] }]);
  const r = parsePayRuns(typo)[0];
  assert.equal(r.received, 838.64);
  assert.equal(r.lines[0].received, 83864);
});
t("validRows", () => {
  assert.equal(validRows([[1, "a"]]), true);
  assert.equal(validRows([["x"]]), false);
});
t("menu: areas decide departments; sheet tabs follow pages", () => {
  const menu = buildMenu(["payments", "candidates"], [
    { key: "rec-openings", department: "recruitment", label: "Openings", position: 5 },
    { key: "acc-pnl", department: "accounts", label: "P&L", position: 5 },
  ]);
  assert.deepEqual(menu.map((d) => d.key), ["recruitment", "accounts"]);
  // Recruitment and Accounts are CRM records only: their own pages, never sheet copies
  assert.deepEqual(menu[0].tabs.map((x) => x.href), ["/d/recruitment/requests", "/d/recruitment/onboarding", "/d/recruitment/hiring-fees", "/candidates"]);
  assert.equal(findActive(menu, "/d/recruitment")?.tab.label, "Client requests");
  assert.deepEqual(menu[1].tabs.map((x) => x.label), ["All clients", "For invoice", "For collection", "Not paid yet", "Paid"]);
  assert.equal(findActive(menu, "/d/accounts/client/abc")?.tab.label, "All clients");
  assert.equal(findActive(menu, "/d/accounts/not-paid")?.tab.label, "Not paid yet");
  assert.equal(findActive(menu, "/settings"), null);
});
t("menu: sheets shared with a department become its sub-tabs (not in the CRM departments)", () => {
  const menu = buildMenu(["candidates", "leads"], [{ key: "mk-ads", department: "marketing", label: "Ads", position: 1 }], [
    { id: "s1", name: "Client VA Payments", departments: ["accounts"] },
    { id: "s2", name: "Ops notes", departments: ["operations"] },
    { id: "s3", name: "Sourcing", departments: ["recruitment"] },
    { id: "s4", name: "Campaigns", departments: ["marketing"] },
  ]);
  // Accounts, VA Managers and Recruitment never list sheets; other departments still do
  assert.deepEqual(menu.map((d) => d.key), ["marketing", "recruitment"]);
  assert.deepEqual(menu[0].tabs.map((x) => x.href), ["/leads", "/sheets/s4", "/d/marketing/mk-ads"]);
  assert.ok(!menu[1].tabs.some((x) => x.href.startsWith("/sheets/")));
});
t("menu: client pages belong to VA Managers › Clients", () => {
  const menu = buildMenu(["clients"], []);
  assert.equal(findActive(menu, "/clients/abc")?.tab.label, "Clients");
  assert.equal(findActive(menu, "/")?.dept.key, "va-managers");
});

console.log(`${pass} mirror tests passed`);
