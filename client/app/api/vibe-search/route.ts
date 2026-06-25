import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { query, messages } = await req.json();

  if (!query || !messages?.length) {
    return NextResponse.json({ id: null });
  }

  const transcript = messages
    .map((m: { id: string; content: string; type: string; user?: { username: string } }, i: number) => {
      const sender = m.type === "human" ? (m.user?.username ?? "user") : "AI";
      return `[${i}] id=${m.id} ${sender}: ${m.content}`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: `You are a message search engine. Given a transcript of chat messages and a search query, return ONLY the id of the single best matching message. If nothing matches, return null. Respond with raw JSON only: {"id": "..."} or {"id": null}.

Search query: "${query}"

Transcript:
${transcript}`,
      },
    ],
  });

  try {
    const text = (response.content[0] as { type: string; text: string }).text.trim();
    const match = text.match(/\{[\s\S]*?\}/);
    const { id } = JSON.parse(match?.[0] ?? "{}");
    return NextResponse.json({ id: id ?? null });
  } catch {
    return NextResponse.json({ id: null });
  }
}
