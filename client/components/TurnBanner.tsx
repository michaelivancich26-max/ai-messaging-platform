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
}

export default function TurnBanner({ turn, myPosition, myUserId, isOwner, isAdmin, onClaimFloor, onPassTurn, onEndStructured, stances }: Props) {
  if (turn.mode !== "structured") return null;

  const isMySide = myPosition === turn.currentSide;
  const isMyTurn = turn.currentSpeakerId === myUserId;
  const floorClaimed = !!turn.currentSpeakerId;
  const canPass = isOwner || isAdmin || isMyTurn;

  const stanceList = stances ?? ["FOR", "AGAINST"];
  const sideIdx = stanceList.indexOf(turn.currentSide);
  const sideIsFirst = sideIdx === 0 || sideIdx === -1;

  return (
    <div className={`shrink-0 border-t px-4 py-2.5 flex items-center gap-3 transition-colors ${
      isMyTurn
        ? "border-emerald-800/40 bg-emerald-100 dark:bg-emerald-950/30"
        : sideIsFirst
        ? "border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50"
        : "border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50"
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
              <span className={`font-semibold ${sideIsFirst ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {turn.currentSide}
              </span>
              {" "}side — waiting for someone to claim the floor
            </>
          )}
        </span>
        <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-700 ml-1">Turn {turn.turnNumber}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isMySide && !floorClaimed && !isMyTurn && (
          <button
            onClick={onClaimFloor}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              sideIsFirst
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-red-600 text-white hover:bg-red-500"
            }`}
          >
            Claim floor
          </button>
        )}
        {canPass && (
          <button
            onClick={onPassTurn}
            className="rounded-full border border-gray-300 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-500 hover:border-gray-300 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {isMyTurn ? "Pass" : "Skip"}
          </button>
        )}
        {(isOwner || isAdmin) && (
          <button
            onClick={onEndStructured}
            className="rounded-full border border-gray-300/60 dark:border-gray-700/60 px-2.5 py-1 text-[10px] text-gray-500 dark:text-gray-600 hover:border-red-700/40 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="End structured debate mode"
          >
            Free chat
          </button>
        )}
      </div>
    </div>
  );
}
