// Plain-Node tests for src/lib/ops-records.ts (run: node scripts/test-ops-records.mjs)
import assert from "node:assert/strict";
import { roleStageFrom, roleStatusFor, obStatusFrom, feeStatusFrom, changeStatusFrom, vaStatusFrom, vaStatusOf, employmentFrom, checkinDateFor, checkinState, ROLE_STAGES } from "../src/lib/ops-records.ts";

let pass = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { console.error("FAIL", name, "\n", e.message); process.exitCode = 1; } }

t("roleStageFrom: Roel's numbered labels", () => {
  assert.equal(roleStageFrom("1 CV Pooling", ""), "cv_pooling");
  assert.equal(roleStageFrom("1.1 Rework", ""), "cv_pooling");
  assert.equal(roleStageFrom("2 Ready for Endorsement", ""), "ready");
  assert.equal(roleStageFrom("3 Endorsed", ""), "endorsed");
  assert.equal(roleStageFrom("5 For Rescheduling", ""), "interview");
  assert.equal(roleStageFrom("7 Pending Decision", ""), "pending_decision");
  assert.equal(roleStageFrom("9.3 Follow up", ""), "paused");
  assert.equal(roleStageFrom("9 VA Live", ""), "live");
  assert.equal(roleStageFrom("9.1 Withdrawn", ""), "withdrawn");
  assert.equal(roleStageFrom("10 Something", ""), "cv_pooling"); // "10" is not "1"
});
t("roleStageFrom: falls back to the opportunity column", () => {
  assert.equal(roleStageFrom("", "Won - Live"), "live");
  assert.equal(roleStageFrom("", "Lost"), "withdrawn");
  assert.equal(roleStageFrom("", "Open"), "cv_pooling");
});
t("roleStatusFor: every stage maps to a role_status", () => {
  for (const st of ROLE_STAGES) assert.ok(["open", "sourcing", "interviewing", "filled", "on_hold", "cancelled"].includes(roleStatusFor(st)));
  assert.equal(roleStatusFor("live"), "filled");
  assert.equal(roleStatusFor("withdrawn"), "cancelled");
});
t("obStatusFrom / feeStatusFrom", () => {
  assert.equal(obStatusFrom("Done"), "done");
  assert.equal(obStatusFrom("Scheduled"), "scheduled");
  assert.equal(obStatusFrom("Withdrawn - client"), "withdrawn");
  assert.equal(obStatusFrom("Waiting for Availability"), "to_schedule");
  assert.equal(obStatusFrom(""), "to_schedule");
  assert.equal(feeStatusFrom("Paid"), "paid");
  assert.equal(feeStatusFrom("Charged by Maria"), "charged");
  assert.equal(feeStatusFrom("Waived"), "na");
  assert.equal(feeStatusFrom("Pending"), "to_send");
});
t("changeStatusFrom", () => {
  assert.equal(changeStatusFrom("Replaced"), "replaced");
  assert.equal(changeStatusFrom("Inactive"), "cancelled");
  assert.equal(changeStatusFrom("Unresponsive"), "withdrawn");
  assert.equal(changeStatusFrom("Interview Scheduled"), "in_progress");
});
t("VA status + employment", () => {
  assert.equal(vaStatusFrom("Active"), "active");
  assert.equal(vaStatusFrom("On Pause"), "paused");
  assert.equal(vaStatusFrom("Removed"), "inactive");
  assert.equal(vaStatusOf({ placement_status: "active", on_pause: true }), "paused");
  assert.equal(vaStatusOf({ placement_status: "ended", on_pause: false }), "inactive");
  assert.equal(employmentFrom("Part - Time"), "part_time");
  assert.equal(employmentFrom("Full Time"), "full_time");
  assert.equal(employmentFrom("?"), null);
});
t("check-in dates: day 31 clamps to the month's end", () => {
  assert.equal(checkinDateFor(31, "2026-02-10"), "2026-02-28");
  assert.equal(checkinDateFor(31, "2028-02-10"), "2028-02-29");
  assert.equal(checkinDateFor(5, "2026-10-25"), "2026-10-05");
  assert.equal(checkinState(5, "2026-10-25", false), "overdue");
  assert.equal(checkinState(25, "2026-10-25", false), "due");
  assert.equal(checkinState(5, "2026-10-25", true), "done");
});

console.log(`${pass} ops-records tests passed`);
