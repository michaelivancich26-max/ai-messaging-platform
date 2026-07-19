import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { query, messages } = await req.json();

  if (!query || !messages?.length) {
    return NextResponse.json({ id: null });
  }

  // Send only the line index, not the full cuid, on every line — the server maps
  // the chosen index back to the id from the same `messages` array it was given,
  // so the model doesn't have to echo (and pay input tokens for) a cuid per line.
  const transcript = messages
    .map((m: { id: string; content: string; type: string; user?: { username: string } }, i: number) => {
      const sender = m.type === "human" ? (m.user?.username ?? "user") : "AI";
      return `[${i}] ${sender}: ${m.content}`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: `You are a message search engine. Given a transcript of chat messages and a search query, return ONLY the bracketed index [i] of the single best matching message. If nothing matches, return null. Respond with raw JSON only: {"i": <number>} or {"i": null}.

Search query: "${query}"

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
    const id = Number.isInteger(i) && i >= 0 && i < messages.length ? messages[i].id : null;
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ id: null });
  }
}
