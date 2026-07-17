import type { ChatMessage } from "@/lib/types";
import { parseAIContent } from "@/lib/types";

interface Props {
  message: ChatMessage;
}

export default function SummaryCard({ message }: Props) {
  const payload = parseAIContent(message.content);
  const text = payload.type === "summary" ? payload.text : message.content;
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex justify-center animate-fadeIn">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-brand-green-ink dark:text-brand-green">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </span>
          <span className="font-semibold text-brand-green-ink dark:text-brand-green">Conversation Summary</span>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{time}</span>
        </div>
        <p className="leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}
