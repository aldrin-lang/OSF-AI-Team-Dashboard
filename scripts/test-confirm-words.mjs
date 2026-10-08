// Plain-Node tests for src/lib/confirm-words.ts (run: node scripts/test-confirm-words.mjs)
import assert from "node:assert/strict";
import { isYes, isStrongYes, isNoOrUnclear } from "../src/lib/confirm-words.ts";

let pass = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { console.error("FAIL", name, "\n", e.message); process.exitCode = 1; } }

t("plain yes", () => {
  for (const q of ["yes", "Yes.", "yeah", "okay", "ok go ahead", "yes please", "sure, do it", "confirm", "yes confirm please Donna", "go ahead and send it", "that's right"]) {
    assert.equal(isYes(q), true, q);
  }
});

t("never a yes when there is a negation or condition", () => {
  for (const q of ["yes, but do not send it", "yes but don't send it", "yes not yet", "ok wait", "yes except Paul", "yes, only the first one",
    "yes and change the date", "no", "not now", "yes send it to Dean instead", "yes unless it's Friday", "yes hold on"]) {
    assert.equal(isYes(q), false, q);
    assert.equal(isStrongYes(q), false, q);
  }
});

t("yes plus extra words is not a yes (goes back to Donna as a new request)", () => {
  for (const q of ["yes and also add a task", "yes for the Dublin client", "send it to everyone"]) assert.equal(isYes(q), false, q);
});

t("strong yes needs an explicit go-ahead word", () => {
  assert.equal(isStrongYes("yes"), false);
  assert.equal(isStrongYes("okay"), false);
  assert.equal(isStrongYes("confirm"), true);
  assert.equal(isStrongYes("yes, do it"), true);
  assert.equal(isStrongYes("go ahead and send them"), true);
});

t("no / unclear cancels", () => {
  for (const q of ["no", "nope", "cancel", "not yet", "never mind", "leave it", "yes, but do not send it", "wait"]) assert.equal(isNoOrUnclear(q), true, q);
  for (const q of ["yes", "confirm", "go ahead"]) assert.equal(isNoOrUnclear(q), false, q);
});

console.log(pass + " confirm-words tests passed");
