/**
 * The FAQ knowledge base. Deliberately a flat file for the POC — swap for a real
 * source later without touching the tool layer.
 *
 * Rule that matters: if nothing matches, the caller must escalate rather than improvise.
 * See lib/core/rules.md, "What we answer directly".
 */
import data from "./knowledge-base.json";

export interface Entry {
  id: string;
  q: string[];
  a: string;
}

/**
 * The knowledge base lives in knowledge-base.json so one file feeds both surfaces: this
 * matcher, and the copy synced into the skill, which answers from it with no server involved.
 */
export const KB: Entry[] = data.entries;

/**
 * Escalation triggers, from rules.md. These OVERRIDE the FAQ lookup: a refund question that
 * happens to share words with an FAQ entry must still escalate, never be answered.
 * Matched as substrings so inflections ("refunded", "cancelling") are caught.
 */
const TRIGGERS: { team: string; terms: string[] }[] = data.triggers;


export interface Match {
  entry: Entry | null;
  score: number;
  covered: boolean;
  /** Set when an escalation trigger fired. Overrides any FAQ match. */
  escalateTo?: string;
}

/**
 * Escalation triggers, from rules.md. These OVERRIDE the FAQ lookup: a refund question
 * that happens to share words with an FAQ entry must still escalate, never be answered.
 * Matched as substrings so inflections ("refunded", "cancelling") are caught.
 */

/** Words that carry no topic signal — they let unrelated questions score high. */
const STOP = new Set([
  "a","an","the","is","are","am","do","does","did","you","your","yours","i","me","my","we","our",
  "what","when","where","who","how","can","could","would","will","to","of","for","in","on","at",
  "it","this","that","be","have","has","get","got","there","and","or","if","please","hi","hello",
  "je","vous","est","les","le","la","des","de","du","un","une","et","que","quoi",
]);

/** Crude stem so "located"/"location" and "book"/"booking" collide. Enough for a POC. */
function stem(w: string): string {
  return w.length > 5 ? w.slice(0, 5) : w;
}

function tokens(text: string): string[] {
  const words: string[] = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  return words.map(stem);
}

/**
 * Content words, falling back to every word when a phrase is nothing but stopwords.
 *
 * "what do you do" is entirely stopwords, so stripping them left nothing to match and a
 * question the knowledge base answers verbatim came back as not covered. Keeping the
 * stopwords for those phrases costs nothing: they only match other stopword-only phrases.
 */
function content(text: string): string[] {
  const all = tokens(text);
  const stripped = all.filter((w) => !STOP.has(stem(w)) && !STOP.has(w));
  return stripped.length > 0 ? stripped : all;
}

/**
 * Escalation triggers first, then a Jaccard overlap on content words.
 *
 * Jaccard rather than recall: recall alone scores "do you offer refunds" against
 * "what do you offer" as a perfect match, because every word of the FAQ phrase appears.
 * Penalising the unmatched query words is what stops that.
 */
export function lookup(question: string): Match {
  const lower = question.toLowerCase();
  for (const t of TRIGGERS) {
    if (t.terms.some((term) => lower.includes(term))) {
      return { entry: null, score: 0, covered: false, escalateTo: t.team };
    }
  }

  const q = new Set(content(question));
  if (q.size === 0) return { entry: null, score: 0, covered: false };

  let best: Entry | null = null;
  let bestScore = 0;

  for (const entry of KB) {
    for (const phrase of entry.q) {
      const p = new Set(content(phrase));
      if (p.size === 0) continue;
      let hits = 0;
      for (const w of p) if (q.has(w)) hits++;
      const union = p.size + q.size - hits;
      const score = union === 0 ? 0 : hits / union;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }

  const covered = bestScore >= 0.5 && !!best?.a;
  return { entry: best, score: Number(bestScore.toFixed(2)), covered };
}
