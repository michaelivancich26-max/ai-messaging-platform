export type MessageType = "human" | "ai_interjection" | "summary";

export type DebatePosition = "FOR" | "AGAINST" | "NEUTRAL";

export interface UserPositionEntry {
  userId: string;
  username: string;
  position: DebatePosition;
}

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

export type ClaimStatus = "PENDING" | "SUPPORTED" | "REFUTED" | "CONTESTED";

export interface ClaimInfo {
  id: string;
  messageId: string;
  claimantId: string;
  status: ClaimStatus;
  reasoning?: string;
  challengeCount: number;
}

export interface CredScore {
  userId: string;
  score: number;
  supported: number;
  refuted: number;
  contested: number;
  total: number;
}

export interface DebateTurnState {
  mode: "open" | "structured";
  currentSide: "FOR" | "AGAINST";
  currentSpeakerId: string | null;
  currentSpeakerName: string | null;
  turnNumber: number;
}

export function parseAIContent(content: string): AIPayload {
  try {
    return JSON.parse(content) as AIPayload;
  } catch {
    return { type: "factual", text: content };
  }
}
