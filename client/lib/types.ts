export type MessageType = "human" | "ai_interjection" | "summary";

export interface ChatMessage {
  id: string;
  content: string;
  senderType: "HUMAN" | "AI";
  type: MessageType;
  createdAt: string;
  userId: string | null;
  roomId: string;
  user?: { username: string } | null;
}

export type AIPayload =
  | { type: "factual"; text: string; sarcasm?: boolean }
  | { type: "ambiguity"; pronoun: string; referent: string; quote: string }
  | { type: "summary"; text: string }
  | { type: "mention_response"; text: string };

export function parseAIContent(content: string): AIPayload {
  try {
    return JSON.parse(content) as AIPayload;
  } catch {
    return { type: "factual", text: content };
  }
}
