import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { rateLimit, tooMany } from "@/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_MESSAGES = 200;      // cap the transcript this paid call is billed for
const MAX_LINE_CHARS = 500;
const MAX_TRANSCRIPT_CHARS = 16_000;

export async function POST(req: NextRequest) {
  // This calls a paid model, so it must be authenticated and rate-limited — it used
  // to be wide open, letting anyone run up an unbounded Anthropic bill on an
  // attacker-supplied transcript.
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string; email?: string } | undefined)?.id
    ?? session?.user?.email;
  if (!uid) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { ok, retryAfter } = rateLimit(`vibe:${uid}`, 10, 60_000);
  if (!ok) return tooMany(retryAfter, "Search is rate-limited — try again in a moment.");

  const { query, messages } = await req.json();

  if (!query || typeof query !== "string" || !messages?.length) {
    return NextResponse.json({ id: null });
  }

  // Bound the paid input: cap line count, per-line length, and total transcript size
  // so a huge attacker-supplied payload can't drive an unbounded input-token bill.
  const capped: { id: string; content: string; type: string; user?: { username: string } }[] =
    (messages as any[]).slice(0, MAX_MESSAGES);

  // Send only the line index, not the full cuid, on every line — the server maps
  // the chosen index back to the id from the same `messages` array it was given,
  // so the model doesn't have to echo (and pay input tokens for) a cuid per line.
  const transcript = capped
    .map((m, i: number) => {
      const sender = m.type === "human" ? (m.user?.username ?? "user") : "AI";
      return `[${i}] ${sender}: ${String(m.content ?? "").slice(0, MAX_LINE_CHARS)}`;
    })
    .join("\n")
    .slice(0, MAX_TRANSCRIPT_CHARS);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: `You are a message search engine. Given a transcript of chat messages and a search query, return ONLY the bracketed index [i] of the single best matching message. If nothing matches, return null. Respond with raw JSON only: {"i": <number>} or {"i": null}.

Search query: "${query.slice(0, 500)}"

Transcript:
${transcript}`,
      },
    ],
  });

  try {
    const text = (response.content[0] as { type: string; text: string }).text.trim();
    const match = text.match(/\{[\s\S]*?\}/);
    const { i } = JSON.parse(match?.[0] ?? "{}");
    // Direct numeric index — guard the range explicitly so index 0 (falsy) isn't lost.
    const id = Number.isInteger(i) && i >= 0 && i < capped.length ? capped[i].id : null;
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ id: null });
  }
}
