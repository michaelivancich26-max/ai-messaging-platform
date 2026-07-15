"use client";

export interface Poll {
  id: string;
  question: string;
  options: string[];
  createdBy: string;
  closedAt: string | null;
  channelId: string | null;
  votes: Array<{ userId: string; option: string }>;
}

interface Props {
  poll: Poll;
  currentUserId: string;
  canClose: boolean;
  onVote: (pollId: string, option: string) => void;
  onClose: (pollId: string) => void;
}

export default function PollCard({ poll, currentUserId, canClose, onVote, onClose }: Props) {
  const isClosed = !!poll.closedAt;
  const myVote = poll.votes.find(v => v.userId === currentUserId)?.option ?? null;
  const totalVotes = poll.votes.length;

  const counts = poll.options.reduce<Record<string, number>>((acc, opt) => {
    acc[opt] = poll.votes.filter(v => v.option === opt).length;
    return acc;
  }, {});

  const winner = isClosed
    ? poll.options.reduce((a, b) => (counts[a] ?? 0) >= (counts[b] ?? 0) ? a : b)
    : null;

  return (
    <div className="mx-4 my-2 rounded-xl border border-gray-300/60 dark:border-gray-700/60 bg-white dark:bg-gray-900 p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
            className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400">
            <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.52 2.52 0 0 1 13 4.5Z" />
          </svg>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{poll.question}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isClosed
            ? <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-[10px] text-gray-600 dark:text-gray-400">Closed</span>
            : <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-300">Live</span>
          }
          {!isClosed && canClose && (
            <button onClick={() => onClose(poll.id)}
              className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
              close
            </button>
          )}
        </div>
      </div>

      {/* Options */}
      <ul className="space-y-2">
        {poll.options.map(opt => {
          const count = counts[opt] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyVote = myVote === opt;
          const isWinner = isClosed && opt === winner;

          return (
            <li key={opt}>
              <button
                onClick={() => !isClosed && onVote(poll.id, opt)}
                disabled={isClosed}
                className={`relative w-full overflow-hidden rounded-lg border text-left transition-colors
                  ${isMyVote
                    ? "border-indigo-500 bg-indigo-600/10"
                    : "border-gray-300 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 disabled:hover:border-gray-300 dark:disabled:hover:border-gray-700"
                  }`}
              >
                {/* Fill bar */}
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-500 rounded-lg
                    ${isWinner ? "bg-indigo-500/20" : isMyVote ? "bg-indigo-500/10" : "bg-gray-200/40 dark:bg-gray-700/40"}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    {isMyVote && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                        className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400">
                        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className={`text-sm ${isMyVote ? "text-indigo-800 dark:text-indigo-200 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
                      {opt}
                    </span>
                    {isWinner && (
                      <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-300">winner</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 shrink-0 ml-2">{pct}% · {count}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 text-[11px] text-gray-500 dark:text-gray-400">
        {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        {!isClosed && !myVote && " · tap to vote"}
        {!isClosed && myVote && " · tap another option to change"}
      </p>
    </div>
  );
}
