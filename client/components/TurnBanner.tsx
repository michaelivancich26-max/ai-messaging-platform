"use client";

import type { DebateTurnState, DebatePosition } from "@/lib/types";

interface Props {
  turn: DebateTurnState;
  myPosition: DebatePosition | null;
  myUserId: string;
  isOwner: boolean;
  isAdmin: boolean;
  onClaimFloor: () => void;
  onPassTurn: () => void;
  onEndStructured: () => void;
}

export default function TurnBanner({ turn, myPosition, myUserId, isOwner, isAdmin, onClaimFloor, onPassTurn, onEndStructured }: Props) {
  if (turn.mode !== "structured") return null;

  const isMySide = myPosition === turn.currentSide;
  const isMyTurn = turn.currentSpeakerId === myUserId;
  const floorClaimed = !!turn.currentSpeakerId;
  const canPass = isOwner || isAdmin || isMyTurn;

  const sideIsFor = turn.currentSide === "FOR";

  return (
    <div className={`shrink-0 border-t px-4 py-2.5 flex items-center gap-3 transition-colors ${
      isMyTurn
        ? "border-emerald-800/40 bg-emerald-950/30"
        : sideIsFor
        ? "border-gray-800 bg-gray-900/50"
        : "border-gray-800 bg-gray-900/50"
    }`}>
      {/* Pulse dot + status */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`h-2 w-2 rounded-full shrink-0 ${
          sideIsFor ? "bg-emerald-400" : "bg-red-400"
        } ${!floorClaimed ? "animate-pulse" : ""}`} />
        <span className="text-xs text-gray-400 truncate">
          {isMyTurn ? (
            <span className="font-semibold text-emerald-300">You have the floor — make your argument</span>
          ) : floorClaimed ? (
            <><span className="font-semibold text-gray-200">{turn.currentSpeakerName}</span> has the floor</>
          ) : (
            <>
              <span className={`font-semibold ${sideIsFor ? "text-emerald-400" : "text-red-400"}`}>
                {turn.currentSide}
              </span>
              {" "}side — waiting for someone to claim the floor
            </>
          )}
        </span>
        <span className="shrink-0 text-[10px] text-gray-700 ml-1">Turn {turn.turnNumber}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isMySide && !floorClaimed && !isMyTurn && (
          <button
            onClick={onClaimFloor}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              sideIsFor
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
            className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors"
          >
            {isMyTurn ? "Pass" : "Skip"}
          </button>
        )}
        {(isOwner || isAdmin) && (
          <button
            onClick={onEndStructured}
            className="rounded-full border border-gray-700/60 px-2.5 py-1 text-[10px] text-gray-600 hover:border-red-700/40 hover:text-red-400 transition-colors"
            title="End structured debate mode"
          >
            Free chat
          </button>
        )}
      </div>
    </div>
  );
}
