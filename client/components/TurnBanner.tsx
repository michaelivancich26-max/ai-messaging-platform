"use client";

import type { DebateTurnState } from "@/lib/types";

interface Props {
  turn: DebateTurnState;
  myPosition: string | null;
  myUserId: string;
  isOwner: boolean;
  isAdmin: boolean;
  onClaimFloor: () => void;
  onPassTurn: () => void;
  onEndStructured: () => void;
  stances?: string[];
  // Pending pass vote for the current side, if any (majority of the side must agree).
  passVote?: { side: string; voters: string[]; needed: number } | null;
}

export default function TurnBanner({ turn, myPosition, myUserId, isOwner, isAdmin, onClaimFloor, onPassTurn, onEndStructured, stances, passVote }: Props) {
  if (turn.mode !== "structured") return null;

  const isMySide = myPosition === turn.currentSide;
  const isMyTurn = turn.currentSpeakerId === myUserId;
  const floorClaimed = !!turn.currentSpeakerId;
  // Passing is now a side decision: any current-side member can vote to pass, and
  // an off-side owner/admin can still force it to unstick a stall. The side needs
  // a majority — reflected on the button and in the status line.
  const canPass = isMySide || isOwner || isAdmin;
  const iVoted = !!passVote && passVote.voters.includes(myUserId);
  const votePending = !!passVote && passVote.needed > 1;

  const stanceList = stances ?? ["FOR", "AGAINST"];
  const sideIdx = stanceList.indexOf(turn.currentSide);
  const sideIsFirst = sideIdx === 0 || sideIdx === -1;

  return (
    <div className={`shrink-0 border-t px-4 py-2.5 flex items-center gap-3 transition-colors ${
      isMyTurn
        ? "border-emerald-300 dark:border-emerald-800/40 bg-emerald-100 dark:bg-emerald-950/30"
        : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
    }`}>
      {/* Pulse dot + status */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`h-2 w-2 rounded-full shrink-0 ${
          sideIsFirst ? "bg-emerald-400" : "bg-red-400"
        } ${!floorClaimed ? "animate-pulse" : ""}`} />
        <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
          {isMyTurn ? (
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">You have the floor — make your argument</span>
          ) : floorClaimed ? (
            <><span className="font-semibold text-gray-800 dark:text-gray-200">{turn.currentSpeakerName}</span> has the floor</>
          ) : (
            <>
              <span className={`font-semibold ${sideIsFirst ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {turn.currentSide}
              </span>
              {" "}side — waiting for someone to claim the floor
            </>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400 ml-1">Turn {turn.turnNumber}</span>
        {votePending && (
          <span className="shrink-0 ml-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400" title="Members of the current side agreeing to pass the turn">
            · {passVote!.voters.length}/{passVote!.needed} to pass
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isMySide && !floorClaimed && !isMyTurn && (
          <button
            onClick={onClaimFloor}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              sideIsFirst
                ? "bg-emerald-700 text-white hover:bg-emerald-600"
                : "bg-red-600 text-white hover:bg-red-500"
            }`}
          >
            Claim floor
          </button>
        )}
        {canPass && (
          <button
            onClick={onPassTurn}
            title={!isMySide
              ? "Force the turn to the other side (moderator)"
              : iVoted
                ? "You voted to pass — click to retract"
                : "Vote to pass your side's turn — a majority of your side must agree"}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              isMySide && iVoted
                ? "border-amber-400 bg-amber-100 text-amber-700 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-300"
                : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {!isMySide
              ? "Force pass"
              : votePending
                ? `Pass ${passVote!.voters.length}/${passVote!.needed}`
                : (iVoted ? "Voted · undo" : "Pass turn")}
          </button>
        )}
        {(isOwner || isAdmin) && (
          <button
            onClick={onEndStructured}
            className="rounded-full border border-gray-300 dark:border-gray-700 px-2.5 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="End structured debate mode"
          >
            Free chat
          </button>
        )}
      </div>
    </div>
  );
}
