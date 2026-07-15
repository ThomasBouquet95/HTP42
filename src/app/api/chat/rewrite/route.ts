import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Grammar / spelling rewrite for a single chat message.
// The model is instructed to:
//   - change the minimum number of words (preserve voice + meaning)
//   - auto-detect the input language (French / English in practice for HTP42)
//   - return ONLY the corrected text, no preamble, no quotes, no commentary
const schema = z.object({
  body: z.string().trim().min(1).max(4000),
});

const SYSTEM_PROMPT = [
  "You are a grammar and spelling corrector for chat messages in a workplace messaging app.",
  "",
  "Rules — follow strictly:",
  "1. Match the input language exactly. Detect it (French or English are most common; treat any other language the same way) and produce output in that same language. Never translate.",
  "2. Change the MINIMUM number of words required to fix grammar, spelling, accents, capitalization, and obvious typos. Preserve the writer's voice, register (casual stays casual, formal stays formal), word choice, slang, and idioms wherever they are not strictly wrong.",
  "3. Do not rephrase, summarize, expand, or 'improve' the text. Do not add or remove information. Do not add greetings, sign-offs, or commentary.",
  "4. Preserve original line breaks, lists, bullets, URLs, code fragments (anything that looks like a path, file name, identifier, or technical token), @mentions, emojis, and capitalization style choices that aren't outright errors.",
  "5. If the input is already correct, return it exactly as-is.",
  "6. Return ONLY the corrected text. No quotes around it, no leading/trailing whitespace beyond the original, no explanations, no headers, no Markdown wrappers.",
].join("\n");

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!env.anthropicApiKey) {
    // Soft-disable when the key isn't configured — the UI hides the
    // action and won't have called us, but be defensive in case it does.
    return NextResponse.json(
      { error: "Rewrite is not configured. Ask an admin to set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const input = parsed.data.body;

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    // Adaptive thinking is overkill for this; explicitly disable it so the
    // model goes straight to the corrected text and we stay fast + cheap.
    // max_tokens sized generously vs. the 4k input cap so the corrected
    // output (which is rarely longer) never truncates.
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: input }],
    });
    // Collect every text block (almost always just one) and trim trailing
    // whitespace, but preserve the body's internal structure.
    const rewritten = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .replace(/^[ \t]+|[ \t]+$/g, "");
    if (!rewritten) {
      return NextResponse.json(
        { error: "Empty response from the rewriter." },
        { status: 502 },
      );
    }
    return NextResponse.json({ rewritten });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited by the rewriter. Try again in a moment." },
        { status: 429 },
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Rewrite failed (${e.status}).` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Rewrite failed." },
      { status: 500 },
    );
  }
}
