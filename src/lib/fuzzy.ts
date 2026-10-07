/**
 * Fuzzy name matching for misheard speech ("Nhiall" → "Niall", "Shiv Byrne" →
 * "Siobhán Byrne"). Jaro-Winkler on the letters + a simple sound-alike key.
 */

export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let p = 0;
  while (p < 4 && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

/** Rough sound-alike key (Irish/English spellings collapse together: Siobhan/Shivon, Niall/Nyle). */
export function soundKey(w: string): string {
  let s = fold(w).replace(/ /g, "");
  s = s
    .replace(/^(kn|gn|pn|wr)/, (m) => m[1])
    .replace(/bh|mh/g, "v")
    .replace(/si(o|a)/g, "sh")
    .replace(/ph/g, "f")
    .replace(/ck|q|c(?=[aou])|k/g, "k")
    .replace(/c/g, "s")
    .replace(/dh|gh/g, "")
    .replace(/th/g, "t")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/y/g, "i")
    .replace(/([a-z])\1+/g, "$1");
  const first = s.charAt(0);
  return first + s.slice(1).replace(/[aeiouhw]/g, "");
}

/** 0..1 similarity between what was heard and a stored name (handles first-name-only and word order). */
export function nameScore(heard: string, name: string): number {
  const h = fold(heard);
  const n = fold(name);
  if (!h || !n) return 0;
  if (n === h) return 1;
  if (n.includes(h) && h.length >= 3) return 0.95;
  const hw = h.split(" ");
  const nw = n.split(" ");
  let total = 0;
  for (const w of hw) {
    let best = 0;
    for (const x of nw) {
      const jw = jaroWinkler(w, x);
      const snd = soundKey(w) === soundKey(x) && w.length > 2 ? 0.92 : 0;
      best = Math.max(best, jw, snd);
    }
    total += best;
  }
  const words = total / hw.length;
  const whole = jaroWinkler(h, n);
  return Math.max(words * (hw.length <= nw.length ? 1 : 0.85), whole);
}

export function bestMatches<T>(heard: string, items: T[], name: (t: T) => string, limit = 5, min = 0.78): { item: T; score: number }[] {
  return items
    .map((item) => ({ item, score: nameScore(heard, name(item)) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
