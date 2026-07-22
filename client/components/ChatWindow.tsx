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
  const isEmpty = messages.length === 0 && (!streamingMsgs || streamingMsgs.size === 0);
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
      {isEmpty && (
        <div className="flex flex-col items-center gap-3 py-16 text-center animate-fadeIn">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5h8M8 14h5M21 12a8.96 8.96 0 0 1-1.03 4.19c-.16.31-.24.66-.2 1.01L20.25 21l-3.5-.73a1.5 1.5 0 0 0-.86.09A9 9 0 1 1 21 12Z" />
            </svg>
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-gray-900 dark:text-white">No messages yet</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Be the first to make an argument.</p>
          </div>
        </div>
      )}
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
