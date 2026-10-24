import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

// Curated daily intelligence feed for #life-science-signals. Uses Claude with the
// web-search tool to find and SELECT the most relevant developments at the
// intersection of pharma, clinical development, data and AI, then returns them as
// structured items the cron posts to Slack. Behaves like an analyst, not a news
// aggregator: 0 relevant stories is better than 5 mediocre ones.

export type SignalItem = {
  headline: string;
  whatHappened: string;
  whyItMatters: string;
  watch?: string | null;
  sourceUrl: string;
  sourceName?: string;
};

const SYSTEM_PROMPT = [
  "You are a senior intelligence analyst producing a curated daily feed for pharma Data/AI and Clinical leaders.",
  "Audience: CIOs, CDOs, Heads of Clinical Data, Biometrics, Data/AI and Digital leaders in pharma.",
  "You behave like a curated intelligence desk, NOT a news aggregator.",
  "",
  "Use the web_search tool to find developments from roughly the last 24–48 hours (up to ~3 days for genuinely major items).",
  "",
  "PRIORITISE developments on:",
  "- Agentic AI in pharma and clinical development",
  "- Clinical data management and AI",
  "- Statistical programming: SAS/R, SDTM, ADaM, TFLs, QC automation",
  "- Clinical-data platforms, interoperability, metadata and provenance",
  "- CDISC, USDM, FHIR, ICH M11 and digital protocols",
  "- GxP AI governance, validation, audit trails and human oversight",
  "- Digital twins, simulation and in-silico trials",
  "- RWD / RWE and AI-enabled evidence generation",
  "- Important AI drug-discovery developments",
  "- FDA / EMA developments affecting AI or clinical data",
  "- Major pharma + AI/data/cloud partnerships",
  "- Relevant vendor developments (Veeva, Medidata, IQVIA, Databricks, Oracle, AWS, Microsoft, NVIDIA, etc.)",
  "- Important academic research with practical industry implications",
  "",
  "NORMALLY EXCLUDE: ordinary drug approvals or trial readouts, generic pharma M&A, earnings, executive appointments,",
  "generic healthcare AI, generic AI model releases, minor product updates, generic funding rounds, marketing-heavy",
  "announcements. Include such items ONLY when there is a clear implication for clinical data, AI, architecture,",
  "governance, validation or regulation.",
  "",
  "SELECTION RULE — for every candidate, ask: would a senior pharma Data/AI or Clinical leader reasonably investigate",
  "this, brief their team, change a decision or adjust a roadmap because of it? If not, do NOT include it.",
  "There is no daily quota. 0 relevant stories is better than 5 mediocre ones. Typical output is 1–3 items; more only",
  "when several genuinely important developments occur.",
  "",
  "QUALITY: prefer primary / high-quality sources (regulators, peer-reviewed journals, company announcements, Reuters,",
  "Bloomberg, FT, Clinical Leader, Applied Clinical Trials, Fierce Biotech, Endpoints, RAPS, STAT). Deduplicate",
  "aggressively — if several sources cover the same event, include it once using the strongest source. In 'whyItMatters'",
  "and 'watch', clearly distinguish independently validated evidence from company/vendor claims and from your own inference.",
  "",
  "Before including an item, verify it is: relevant, new, actionable, credible, and strong enough that you would still",
  "send it if only one story could be posted today. If not, reject it.",
  "",
  "WRITING STYLE — write like a sharp colleague dropping a quick note in Slack, not a press release or an analyst report:",
  "- Keep every field SHORT. Each of whatHappened, whyItMatters and watch should be roughly 10–20 words. One sentence each.",
  "- Plain, direct language. Say who did what. Cut jargon, buzzwords and hedging ('signals that', 'underscores', 'is poised to').",
  "- Prefer concrete nouns and active verbs. If a term isn't needed to make the point, drop it.",
  "- Sound human and natural, like you're explaining it to a smart teammate in one breath — not stiff or corporate.",
  "- headline: concise and specific, no marketing spin.",
  "",
  "OUTPUT: return ONLY a JSON array (possibly empty []). No prose, no markdown, no code fences. Each element:",
  "{",
  '  "headline": string — concise, specific, non-promotional,',
  '  "whatHappened": string — one short sentence, ~10–20 words, who did what,',
  '  "whyItMatters": string — one short sentence, ~10–20 words, the practical implication,',
  '  "watch": string | null — optional, ~10–15 words, a caveat if vendor-reported / early / uncertain,',
  '  "sourceUrl": string — the direct article/announcement URL (the strongest source),',
  '  "sourceName": string — e.g. "Reuters", "FDA", "Nature"',
  "}",
].join("\n");

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    const host = url.host.replace(/^www\./i, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

// Pull the posted headlines and source-URL keys out of recent Slack messages so
// we can avoid re-posting the same story. Our own posts render as
// `*Headline*\n...\n🔗 https://...`, and Slack wraps links as <https://...> or
// <https://...|label>, so we scan every URL in the text, not just the 🔗 line.
export function extractPostedContext(texts: string[]): {
  headlines: string[];
  urlKeys: Set<string>;
} {
  const headlines: string[] = [];
  const urlKeys = new Set<string>();
  for (const raw of texts) {
    const text = typeof raw === "string" ? raw : "";
    if (!text) continue;
    // First non-empty line, stripped of mrkdwn bold, is our headline.
    const firstLine = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (firstLine) {
      const headline = firstLine.replace(/\*/g, "").trim();
      if (headline && !/^🔗/.test(headline)) headlines.push(headline);
    }
    // Any URL, whether bare or inside Slack's <...> / <...|label> wrapping.
    for (const m of text.matchAll(/https?:\/\/[^\s|>]+/g)) {
      urlKeys.add(normalizeUrl(m[0]));
    }
  }
  return { headlines, urlKeys };
}

function normalizeItem(o: unknown): SignalItem | null {
  if (!o || typeof o !== "object") return null;
  const rec = o as Record<string, unknown>;
  const s = (k: string) => (typeof rec[k] === "string" ? (rec[k] as string).trim() : "");
  const headline = s("headline");
  const whatHappened = s("whatHappened") || s("what_happened");
  const whyItMatters = s("whyItMatters") || s("why_it_matters");
  const sourceUrl = s("sourceUrl") || s("source") || s("url");
  if (!headline || !whyItMatters || !/^https?:\/\//i.test(sourceUrl)) return null;
  const watch = s("watch");
  const sourceName = s("sourceName") || s("source_name");
  return { headline, whatHappened, whyItMatters, watch: watch || null, sourceUrl, sourceName };
}

function parseItems(text: string): SignalItem[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeItem).filter((x): x is SignalItem => x !== null);
  } catch {
    return [];
  }
}

// Server web-search tool — typed loosely via the create params so we don't pin an
// exact SDK type name.
const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 10 };

export async function fetchSignals(
  today: string,
  recentHeadlines: string[] = [],
): Promise<SignalItem[]> {
  if (!env.anthropicApiKey) return [];
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const avoidBlock =
    recentHeadlines.length > 0
      ? `\n\nAlready posted in this channel over the last few days — do NOT repeat these, ` +
        `nor the same underlying event under a different headline:\n- ` +
        recentHeadlines.slice(0, 60).join("\n- ")
      : "";
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [WEB_SEARCH_TOOL] as unknown as Anthropic.Messages.ToolUnion[],
    messages: [
      {
        role: "user",
        content:
          `Today is ${today}. Search the web for developments from roughly the last 24–48 hours ` +
          `and return the curated items as a JSON array exactly per your instructions. ` +
          `If nothing clears the bar, return [].` +
          avoidBlock,
      },
    ],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return parseItems(text);
}

export function renderSignalSlack(it: SignalItem): string {
  const lines = [`*${it.headline}*`, `• *What happened:* ${it.whatHappened}`];
  lines.push(`• *Why it matters:* ${it.whyItMatters}`);
  if (it.watch && it.watch.trim()) lines.push(`• *Watch:* ${it.watch.trim()}`);
  lines.push(`🔗 ${it.sourceUrl}`);
  return lines.join("\n");
}
