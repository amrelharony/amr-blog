// Server-side KB matching — ported verbatim from Js/chatbot-llm.js (TF-IDF-ish scorer).
// The 2.12 MB knowledge base lives ONLY on the server; the client never downloads it.
import kbData from "./kb-docs.json";

export interface KBEntry {
  keys: string[];
  cat: string;
  answer: string;
}
export interface KBMatch {
  entry: KBEntry;
  score: number;
}
export interface KBResult {
  matches: KBMatch[];
  confidence: "welcome" | "low" | "good" | "high";
  topScore: number;
}

const KB = kbData as KBEntry[];

// ── Synonym groups (query expansion) ──
// Null-prototype: both maps below are indexed by strings derived from the visitor's
// chat message (see the ngrams in matchQuery), so a plain `{}` resolves keys like
// "constructor" and "__proto__" through Object.prototype. `SYNONYMS[ng]` then handed
// scoreEntry a function/object that passed its truthiness check and blew up on
// iteration ("syns is not iterable"), 500-ing /api/chat for that message.
const SYNONYMS: Record<string, Set<string>> = Object.create(null);
const _synGroups: string[][] = [
  ["pm", "project management", "pmp", "project manager", "pmi"],
  ["scrum", "agile", "sprint", "scrum master", "psm", "retrospective", "standup"],
  ["dt", "digital transformation", "digitalization", "modernization", "digital"],
  ["fintech", "financial technology", "fin tech", "digital finance", "digital banking"],
  ["cert", "certification", "certifications", "certified", "credential", "badge", "qualification"],
  ["book", "bilingual executive", "publication", "author", "writing", "wrote", "publish"],
  ["mentor", "mentoring", "mentorship", "coaching", "adplist", "coach", "guidance"],
  ["data", "analytics", "data science", "bi", "business intelligence", "data analysis"],
  ["ai", "artificial intelligence", "machine learning", "ml", "genai", "gpt"],
  ["career", "experience", "journey", "timeline", "professional", "work history", "path"],
  ["edu", "education", "university", "degree", "academic", "school", "studied"],
  ["banking", "bank", "financial services", "finance", "financial sector"],
  ["leadership", "lead", "leader", "manage", "management", "delivery lead", "manager"],
  ["kanban", "flow", "wip", "lean", "pull system"],
  ["product", "product ownership", "po", "product management", "pspo", "backlog"],
  ["conference", "conferences", "speaking", "event", "stage", "talk", "keynote", "spoke", "speaker"],
  ["testimonial", "testimonials", "review", "feedback", "recommendation", "endorsement"],
  ["impact", "metrics", "stats", "numbers", "results", "achievement", "accomplishment"],
  ["contact", "email", "linkedin", "calendly", "reach", "connect", "social", "whatsapp", "telegram"],
  ["safe", "scaled agile", "safe 6", "enterprise agile", "agile release train"],
  ["org", "organization", "organizations", "company", "association", "affiliation", "member"],
];
_synGroups.forEach((group) => {
  group.forEach((term) => {
    if (!SYNONYMS[term]) SYNONYMS[term] = new Set();
    group.forEach((other) => {
      if (other !== term) SYNONYMS[term].add(other);
    });
  });
});

const _keyFreq: Record<string, number> = Object.create(null);
KB.forEach((e) => e.keys.forEach((k) => (_keyFreq[k] = (_keyFreq[k] || 0) + 1)));
const _maxFreq = Math.max(1, ...Object.values(_keyFreq));

function scoreEntry(entry: KBEntry, words: string[], ngrams: string[], q: string): number {
  let score = 0;
  for (const w of words) {
    if (w.length < 2) continue;
    for (const key of entry.keys) {
      if (key === w) {
        score += 5 * (1 + Math.log(_maxFreq / (_keyFreq[key] || 1)));
      } else if (key.length > 2 && (key.includes(w) || w.includes(key))) {
        score += 2;
      }
    }
  }
  for (const ng of ngrams) {
    const syns = SYNONYMS[ng];
    if (syns) {
      for (const syn of syns) {
        if (entry.keys.indexOf(syn) >= 0) {
          score += 4;
          break;
        }
      }
    }
  }
  for (const key of entry.keys) {
    if (key.length > 2 && q.includes(key)) score += 6;
  }
  if (entry.cat && q.includes(entry.cat)) score += 3;
  return score;
}

export function matchQuery(query: string): KBResult {
  if (!query || !query.trim()) return { matches: [], confidence: "welcome", topScore: 0 };
  const q = query.toLowerCase().replace(/[?!.,;:'"]/g, "").trim();
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  const ngrams = [...words];
  for (let i = 0; i < words.length - 1; i++) ngrams.push(words[i] + " " + words[i + 1]);
  for (let i = 0; i < words.length - 2; i++) ngrams.push(words[i] + " " + words[i + 1] + " " + words[i + 2]);

  const scored = KB.map((entry) => ({ entry, score: scoreEntry(entry, words, ngrams, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length || scored[0].score < 8) {
    return { matches: scored.slice(0, 1), confidence: "low", topScore: scored[0]?.score || 0 };
  }
  const topScore = scored[0].score;
  const confidence = topScore >= 15 ? "high" : "good";
  const seen = new Set<string>();
  const matches: KBMatch[] = [];
  for (const s of scored) {
    if (matches.length >= 3) break;
    const sig = s.entry.answer.substring(0, 80);
    if (seen.has(sig)) continue;
    seen.add(sig);
    matches.push(s);
  }
  return { matches, confidence, topScore };
}

// Strip HTML → plain context paragraphs for the LLM prompt.
export function buildContext(result: KBResult): string {
  let ctx = "";
  for (const m of result.matches) {
    ctx += m.entry.answer.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() + "\n\n";
  }
  return ctx.trim();
}

export function matchedCats(result: KBResult): string[] {
  return [...new Set(result.matches.map((m) => m.entry.cat).filter(Boolean))];
}
