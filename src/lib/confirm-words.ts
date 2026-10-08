// How Donna reads a spoken answer to "Shall I go ahead?".
// Safety first: a reply only counts as "yes" when it is ONLY an affirmative
// ("yes", "okay go ahead", "confirm please"). Anything with a negation or a
// condition in it ("yes, but don't send it", "not yet") never confirms.

const NEGATION = /\b(no|nope|not|don'?t|do ?not|never|cancel|stop|wait|hold on|hang on|but|except|instead|rather|unless|without|change|only)\b/i;
const YES_PHRASE = /^(yes|yeah|yep|yup|sure|ok|okay|correct|right|confirm|confirmed|do it|go ahead|go for it|send it|send them|create it|create them|please do|hire (him|her|them)|that'?s right|sounds good)$/i;
const FILLER = /^(please|thanks|thank you|donna|sourci|now|and|then)$/i;
const STRONG = /\b(confirm(ed)?|send (it|them)|do it|go ahead|go for it|create them|hire (him|her|them))\b/i;
const NO_START = /^(no|nope|cancel|stop|don'?t|do not|never ?mind|not now|not yet|leave it|forget it)\b/i;

function clean(q: string): string {
  return q.toLowerCase().replace(/[.,!?;:"“”]/g, " ").replace(/\s+/g, " ").trim();
}

/** Splits into known phrases greedily; true only if every part is an affirmative or a filler. */
function onlyAffirmative(text: string): boolean {
  const words = text.split(" ");
  let i = 0;
  let sawYes = false;
  while (i < words.length) {
    let matched = 0;
    for (const len of [3, 2, 1]) {
      if (i + len > words.length) continue;
      const chunk = words.slice(i, i + len).join(" ");
      if (YES_PHRASE.test(chunk)) { sawYes = true; matched = len; break; }
      if (FILLER.test(chunk)) { matched = len; break; }
    }
    if (!matched) return false;
    i += matched;
  }
  return sawYes;
}

export function isYes(q: string): boolean {
  const t = clean(q);
  if (!t || NEGATION.test(t)) return false;
  return onlyAffirmative(t);
}

/** For big changes: must be a clean yes AND contain an explicit go-ahead word ("confirm", "do it", "send it"). */
export function isStrongYes(q: string): boolean {
  return isYes(q) && STRONG.test(clean(q));
}

/** A clear "no", or any reply with a negation/condition while something is waiting to be confirmed. */
export function isNoOrUnclear(q: string): boolean {
  const t = clean(q);
  if (!t) return false;
  return NO_START.test(t) || (NEGATION.test(t) && !isYes(t));
}
