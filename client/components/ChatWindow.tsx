import type { ChatMessage, ClaimInfo, CredScore, UserPositionEntry } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import AIInterjectionCard, { AIStreamingCard } from "./AIInterjectionCard";
import SummaryCard from "./SummaryCard";

interface Props {
  messages: ChatMessage[];
  currentUsername: string;
  currentUserId?: string;
  isAdmin?: boolean;
  highlightedId?: string | null;
  messageRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  streamingMsgs?: Map<string, { text: string; sarcasm: boolean; isMention?: boolean }>;
  claims?: Record<string, ClaimInfo>;
  credibilityScores?: Record<string, CredScore>;
  positions?: Record<string, UserPositionEntry>;
  onStakeClaim?: (messageId: string) => void;
  onChallengeClaim?: (claimId: string) => void;
  onUserClick?: (userId: string, username: string) => void;
  onSubDebate?: (messageId: string, content: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  stances?: string[];
}

export default function ChatWindow({ messages, currentUsername, currentUserId, isAdmin, highlightedId, messageRefs, streamingMsgs, claims, credibilityScores, positions, onStakeClaim, onChallengeClaim, onUserClick, onSubDebate, onReact, onEdit, onDelete, stances }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
      {messages.map((msg) => {
        const refCallback = messageRefs
          ? (el: HTMLDivElement | null) => { messageRefs.current[msg.id] = el; }
          : undefined;

        if (msg.type === "summary") return (
          <div key={msg.id} ref={refCallback}>
            <SummaryCard message={msg} />
          </div>
        );
        if (msg.type === "ai_interjection") return (
          <div key={msg.id} ref={refCallback}>
            <AIInterjectionCard message={msg} />
          </div>
        );
        return (
          <div key={msg.id} ref={refCallback}>
            <MessageBubble
              message={msg}
              isSelf={msg.user?.username === currentUsername}
              highlighted={highlightedId === msg.id}
              claim={claims?.[msg.id]}
              credScore={msg.userId ? credibilityScores?.[msg.userId] : undefined}
              senderPosition={msg.userId ? positions?.[msg.userId]?.position : undefined}
              stances={stances}
              onStakeClaim={onStakeClaim}
              onChallengeClaim={onChallengeClaim}
              onUserClick={onUserClick}
              onSubDebate={onSubDebate}
              onReact={onReact}
              onEdit={onEdit}
              onDelete={onDelete}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
          </div>
        );
      })}
      {streamingMsgs && Array.from(streamingMsgs.entries()).map(([tempId, { text, sarcasm, isMention }]) => (
        <AIStreamingCard key={tempId} text={text} sarcasm={sarcasm} isMention={isMention} />
      ))}
    </div>
  );
}
