// Plain-Node tests for src/lib/leads-core.ts:  node scripts/test-leads-core.mjs
import assert from "node:assert/strict";
import { analysePhone, classifyService, parseGhlPayload, ghlKeyFor, toTags } from "../src/lib/leads-core.ts";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

// ---- phone -----------------------------------------------------------------
t("irish mobile is fine", () => assert.deepEqual(analysePhone("+353871234567"), { phone: "+353871234567", suggested: null, flag: null }));
t("irish landline is fine", () => assert.equal(analysePhone("+35314567890").flag, null));
t("PH number that lost its + is flagged (the real bug)", () => {
  const r = analysePhone("+353639081651509");
  assert.equal(r.flag, "likely_miscoded_353");
  assert.equal(r.suggested, "+639081651509");
});
t("NZ / UK / US mis-codes are flagged", () => {
  assert.equal(analysePhone("+3536421234567").suggested, "+6421234567");
  assert.equal(analysePhone("+353447412345678").suggested, "+447412345678");
  assert.equal(analysePhone("+35316041234567").suggested, "+16041234567");
});
t("proper foreign numbers untouched", () => {
  for (const p of ["+639081651509", "+447412345678", "+6421234567", "+16041234567"])
    assert.equal(analysePhone(p).flag, null);
});
t("spaces/dashes tolerated", () => assert.equal(analysePhone("+353 63 908 1651 509").flag, "likely_miscoded_353"));
t("no + at all is flagged", () => assert.equal(analysePhone("0871234567").flag, "no_country_code"));
t("empty phone", () => assert.deepEqual(analysePhone("  "), { phone: null, suggested: null, flag: null }));

// ---- service ---------------------------------------------------------------
t("ai tags", () => { assert.equal(classifyService(["uk-aireceptionist", "new lead"]), "ai"); assert.equal(classifyService(["nz-aireceptionist"]), "ai"); });
t("va tags", () => {
  for (const tag of ["marketingva-ie", "uk-mva", "uk-accountantva", "ukpremiumqs-va", "architectva-ie", "uk-appointmentsetter"])
    assert.equal(classifyService([tag, "new lead"]), "va", tag);
});
t("unknown when nothing matches", () => { assert.equal(classifyService(["new lead", "pt-ads-acc"]), "unknown"); assert.equal(classifyService(["valid"]), "unknown"); });
t("ai wins over va; website va field => va", () => {
  assert.equal(classifyService(["uk-aireceptionist", "uk-mva"]), "ai");
  assert.equal(classifyService([], "Executive Assistant"), "va");
});

// ---- payload ---------------------------------------------------------------
t("customData payload", () => {
  const p = parseGhlPayload({
    customData: { contact_id: "c1", opportunity_id: "o1", name: "Jo Bloggs", email: "jo@x.ie", phone: "+353871234567", source: "Facebook", tags: "uk-aireceptionist, new lead", job_description: "Do admin" },
  });
  assert.equal(p.contactId, "c1"); assert.equal(p.opportunityId, "o1"); assert.equal(p.name, "Jo Bloggs");
  assert.deepEqual(p.tags, ["uk-aireceptionist", "new lead"]); assert.equal(p.jobDescription, "Do admin");
  assert.equal(ghlKeyFor(p), "o1");
});
t("top-level fallback + tags array + first/last name", () => {
  const p = parseGhlPayload({ contact_id: "c9", first_name: "Ann", last_name: "Lee", tags: ["a", "b"], phone: "+447400000000" });
  assert.equal(p.name, "Ann Lee"); assert.deepEqual(p.tags, ["a", "b"]); assert.equal(ghlKeyFor(p), "contact:c9");
});
t("website va field is found by scanning keys", () => {
  const p = parseGhlPayload({ contact_id: "c2", customData: { "What VA are you looking for?": "QS Engineer" } });
  assert.equal(p.vaRole, "QS Engineer");
});
t("nothing to key on => null", () => { assert.equal(parseGhlPayload({ name: "x" }), null); assert.equal(parseGhlPayload("junk"), null); assert.equal(parseGhlPayload(null), null); });
t("toTags dedupes", () => assert.deepEqual(toTags("a, a ;b"), ["a", "b"]));

console.log(`\n${n} tests passed`);
