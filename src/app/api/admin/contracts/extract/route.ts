import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminAction } from "@/lib/auth";
import { listAllMembers, listClients, listProjects } from "@/lib/airtable";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Server-side PDF → contract-fields extractor. Admin uploads a signed
// contract PDF via the "+ New contract" wizard. We hand the raw PDF
// straight to Claude (it natively reads PDF documents — no separate
// text-extraction step) along with a strict JSON schema, and pipe the
// returned values back to the client to pre-populate the edit modal.
// The admin always reviews + edits before Save, so a confident-but-
// wrong guess from the model is corrected in seconds rather than
// silently committed.

const MAX_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = [
  "You are a contract-extraction assistant for the HTP42 consulting portal.",
  "",
  "Read the PDF the user attaches and produce a single JSON object that captures",
  "what you can confidently identify. Treat the model output as a draft for an",
  "admin to review — when in doubt, leave the field empty rather than guessing.",
  "",
  "Return STRICTLY valid JSON matching this schema:",
  "{",
  '  "side": "Client" | "Network Member" | "Partner" | "Other" | ""',
  '       — pick "Client" when HTP42 contracts WITH a client / customer organisation.',
  '       — pick "Network Member" when HTP42 contracts WITH a consultant / freelancer.',
  '       — pick "Partner" when HTP42 contracts WITH another firm as a partner.',
  '       — pick "Other" for anything else (IP holding co., HR, etc.).',
  '       — leave empty if genuinely uncertain.',
  '  "contractType": "NDA" | "MSA" | "SOW" | "Other" | ""',
  '       — SOW for project-scoped statements of work / order forms.',
  '       — MSA for master service agreements, framework agreements.',
  '       — NDA for non-disclosure agreements.',
  '       — Other when none of the above (service agreement, MoU, etc.).',
  '  "otherDescription": string — only populate when contractType is "Other"; a few words describing the contract.',
  '  "signatory1Name": string — the first person who signed.',
  '  "signatory1Role": string — their job title at signature.',
  '  "signatory1Company": string — their legal entity / company name.',
  '  "signatory1Date": string — date in ISO yyyy-mm-dd if present; empty otherwise.',
  '  "signatory2Name": string — second signatory if any.',
  '  "signatory2Role": string',
  '  "signatory2Company": string',
  '  "signatory2Date": string — ISO yyyy-mm-dd if present.',
  '  "signatureDate": string — earliest signing date in ISO yyyy-mm-dd; empty if unclear.',
  '  "expiryDate": string — explicit expiry date in ISO yyyy-mm-dd; empty if open-ended.',
  '  "stage": "Draft" | "Under Negotiation" | "Pending Signature" | "Signed" | "Terminated" | ""',
  '       — set to "Signed" only when the PDF clearly shows BOTH signatures.',
  '       — set to "Pending Signature" when fully drafted but one signature is missing.',
  '       — leave empty if unclear.',
  '  "keyTerms": string — 3-8 short bullets, each starting with "• ", separated by newlines.',
  '       Example: "• 12-month renewable term\\n• Confidentiality 3 years post-termination\\n• IP assigned to HTP42".',
  '  "comment": string — leave empty unless there is a notable caveat the admin should know.',
  '  "clientHint": string — the client / customer organisation name as it appears in the PDF (when side is "Client"). Leave empty otherwise.',
  '  "memberHint": string — the network member / consultant full name as it appears in the PDF (when side is "Network Member"). Leave empty otherwise.',
  '  "projectHint": string — the project code, name, or reference (e.g. "ECS-2026-06", "Halstead study") as it appears in the PDF. Leave empty if not mentioned.',
  "}",
  "",
  "Critical rules:",
  "- Return ONLY the JSON object. No commentary, no Markdown fences, no explanation.",
  "- Use empty strings (\"\") for fields you cannot confidently fill.",
  "- All dates must be ISO yyyy-mm-dd — convert d/m/yyyy or natural-language dates.",
  "- Key Terms bullets must be substantive — skip boilerplate clauses; focus on what an admin would want to know without opening the PDF (term length, confidentiality, IP, exclusivity, governing law, payment terms).",
  "- Do not invent counterparty names, dates, or amounts. If you can't read it, leave it blank.",
].join("\n");

export async function POST(request: Request) {
  const session = await requireAdminAction("contracts", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!env.anthropicApiKey) {
    return NextResponse.json(
      { error: "PDF extraction is not configured. Ask an admin to set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  const file = form.get("pdf");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
      },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  try {
    // Fetch the lookup lists in parallel with the Anthropic call so the
    // fuzzy matching at the bottom has the data ready by the time the
    // extraction returns.
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const [response, clients, projects, members] = await Promise.all([
      client.messages.create({
        // Sonnet 4.6 reads PDFs significantly faster than Opus 4.8 with
        // no meaningful drop in field-extraction quality. The admin
        // reviews every field before save anyway, so we optimise for
        // turnaround time here.
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: "Extract the contract fields from this PDF and return the JSON object as instructed.",
              },
            ],
          },
        ],
      }),
      listClients(),
      listProjects(),
      listAllMembers(),
    ]);
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    // Strip an optional ``` fence the model occasionally adds despite the
    // instruction; harmless if absent.
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Could not parse the model's response.", raw: cleaned },
        { status: 502 },
      );
    }

    // Fuzzy-match the textual hints Claude emitted against the existing
    // Airtable records. We return record IDs (clientRecordIds /
    // projectRecordIds / memberRecordIds) so the create endpoint can
    // link them directly, exactly as if an admin had picked them.
    const clientHint = stringField(parsed, "clientHint");
    const projectHint = stringField(parsed, "projectHint");
    const memberHint = stringField(parsed, "memberHint");
    const sigCompany = stringField(parsed, "signatory1Company");

    const matchedClientId = fuzzyMatch(
      [clientHint, sigCompany].filter(Boolean).join(" "),
      clients.map((c) => ({ id: c.id, label: `${c.clientCode} ${c.clientName}` })),
    );
    const matchedProjectId = fuzzyMatch(
      projectHint,
      projects.map((p) => ({ id: p.id, label: `${p.projectCode} ${p.projectName}` })),
    );
    const matchedMemberId = fuzzyMatch(
      [memberHint, stringField(parsed, "signatory1Name")].filter(Boolean).join(" "),
      members.map((m) => ({
        id: m.id,
        label: `${m.memberCode} ${m.fullName}`,
      })),
    );

    return NextResponse.json({
      ok: true,
      fields: parsed,
      // Add the matched record IDs as parallel keys so the create
      // payload can spread them in without needing to know about hints.
      matches: {
        clientRecordIds: matchedClientId ? [matchedClientId] : [],
        projectRecordIds: matchedProjectId ? [matchedProjectId] : [],
        memberRecordIds: matchedMemberId ? [matchedMemberId] : [],
      },
      filename: file.name,
      pdfBase64: base64,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited. Try again in a moment." },
        { status: 429 },
      );
    }
    if (e instanceof Anthropic.APIError) {
      // Surface the real Anthropic error message so admins know whether
      // it's a "PDF too long" / "doc too many pages" / "format unsupported"
      // problem vs. a transient server issue. Logged server-side too.
      console.error("contract extract anthropic error", e.status, e.message);
      return NextResponse.json(
        { error: `Extraction failed (${e.status}): ${e.message}` },
        { status: 502 },
      );
    }
    console.error("contract extract error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed." },
      { status: 500 },
    );
  }
}

function stringField(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  return typeof v === "string" ? v.trim() : "";
}

// Fuzzy-match the hint string against a list of {id, label} candidates.
// Two-step scoring:
//   1. Exact code prefix / contained-in-label match wins outright. Useful
//      for "ECS-2026-06" hitting "ECS-2026-06 Halstead Studies".
//   2. Otherwise compare normalized token overlap (Jaccard-ish). Pick the
//      best score; ignore matches below a confidence floor so we don't
//      pollute the new contract with a random link.
function fuzzyMatch(
  hint: string,
  candidates: Array<{ id: string; label: string }>,
): string | null {
  const h = normalize(hint);
  if (!h) return null;
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    const label = normalize(c.label);
    if (!label) continue;
    let score = 0;
    if (label.includes(h) || h.includes(label)) {
      score = 1;
    } else {
      score = jaccard(h, label);
    }
    if (!best || score > best.score) best = { id: c.id, score };
  }
  // 0.55 chosen empirically — high enough to skip a single-word coincidence
  // ("the", "agreement") but loose enough that "Halstead Studies" still
  // matches "ECS-2026-06 Halstead Studies".
  if (!best || best.score < 0.55) return null;
  return best.id;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: string, b: string): number {
  const A = new Set(a.split(/\s+/).filter((t) => t.length > 1));
  const B = new Set(b.split(/\s+/).filter((t) => t.length > 1));
  if (A.size === 0 || B.size === 0) return 0;
  let intersect = 0;
  for (const t of A) if (B.has(t)) intersect += 1;
  const union = A.size + B.size - intersect;
  return union === 0 ? 0 : intersect / union;
}
