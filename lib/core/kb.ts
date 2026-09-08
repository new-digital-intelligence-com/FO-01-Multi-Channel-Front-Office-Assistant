/**
 * The FAQ knowledge base. Deliberately a flat file for the POC — swap for a real
 * source later without touching the tool layer.
 *
 * Rule that matters: if nothing matches, the caller must escalate rather than improvise.
 * See lib/core/rules.md, "What we answer directly".
 */
export interface Entry {
  id: string;
  q: string[];
  a: string;
  tags: string[];
}

export const KB: Entry[] = [
  {
    id: "hours",
    q: ["opening hours", "when are you open", "what time do you close", "horaires"],
    a: "We're open Monday to Friday, 09:00–18:00, and Saturday 10:00–14:00. Closed Sundays and public holidays.",
    tags: ["general"],
  },
  {
    id: "location",
    q: ["where are you", "address", "location", "how do i find you"],
    a: "We're at 12 Rue de la Paix, and there's parking behind the building. The entrance is on the courtyard side.",
    tags: ["general"],
  },
  {
    id: "pricing",
    q: ["how much", "price", "pricing", "cost", "rates", "combien"],
    a: "Standard engagements start at €2,500. The final figure depends on scope, so we quote after a short call rather than guessing up front.",
    tags: ["sales"],
  },
  {
    id: "lead-time",
    q: ["how long", "lead time", "when can you start", "turnaround", "delivery time"],
    a: "Typical lead time is two to three weeks from signed scope. Urgent work can sometimes be slotted sooner — worth asking.",
    tags: ["sales", "delivery"],
  },
  {
    id: "booking",
    q: ["book", "appointment", "schedule a call", "meeting", "rendez-vous"],
    a: "Send three times that suit you and we'll confirm one. Calls are 30 minutes and there's no charge for the first one.",
    tags: ["sales"],
  },
  {
    id: "services",
    q: ["what do you do", "services", "what do you offer", "scope"],
    a: "We handle front-office automation: intake across phone, email, chat and messaging, routed into whatever system you already run.",
    tags: ["general"],
  },
];

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
const TRIGGERS: { team: string; terms: string[] }[] = [
  { team: "Finance", terms: ["refund", "rembours", "chargeback", "double charge", "duplicate charge", "overcharge", "invoice dispute", "billing error"] },
  { team: "Management", terms: ["complain", "complaint", "unacceptable", "lawyer", "legal action", "sue you", "court", "press", "journalist", "injur", "unsafe", "emergency", "speak to a human", "real person", "talk to someone", "manager", "supervisor", "reclamation"] },
  { team: "Support", terms: ["not working", "doesn't work", "broken", "outage", "is down", "bug", "error message", "crash"] },
  { team: "Sales", terms: ["cancel my", "cancellation", "terminate my contract", "end my contract", "discount", "renegotiate"] },
];

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
