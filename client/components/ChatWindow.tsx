import type { ChatMessage } from "@/lib/types";
import type { Annotation } from "@/app/room/[roomId]/page";
import MessageBubble from "./MessageBubble";
import AIInterjectionCard from "./AIInterjectionCard";
import SummaryCard from "./SummaryCard";

interface Props {
  messages: ChatMessage[];
  currentUsername: string;
  annotations: Record<string, Annotation>;
  highlightedId?: string | null;
  messageRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export default function ChatWindow({ messages, currentUsername, annotations, highlightedId, messageRefs }: Props) {
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
              annotation={annotations[msg.id]}
              highlighted={highlightedId === msg.id}
            />
          </div>
        );
      })}
    </div>
  );
}
