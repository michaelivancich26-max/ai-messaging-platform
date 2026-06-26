"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { parseAIContent } from "@/lib/types";

interface GNode {
  id: string;
  label: string;
  type: string;
  roomId: string;
  correctionCount: number;
  // simulation state
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface RawMessage {
  id: string;
  content: string;
  createdAt: string;
  senderType: string;
}

interface GEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  roomId: string;
}

interface Room {
  id: string;
  name: string;
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const ROOM_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ec4899",
  "#3b82f6", "#8b5cf6", "#f97316", "#14b8a6",
  "#ef4444", "#84cc16",
];

const TYPE_COLOR: Record<string, string> = {
  person: "#818cf8",
  place: "#34d399",
  topic: "#fbbf24",
  concept: "#c084fc",
};

export default function GraphPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";

  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<GNode | null>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<RawMessage[]>([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionsExpanded, setCorrectionsExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<GNode[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const [, forceRender] = useState(0);

  const W = typeof window !== "undefined" ? window.innerWidth - 256 - 2 : 1000;
  const H = typeof window !== "undefined" ? window.innerHeight : 700;

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;

    fetch(`${SERVER}/api/graph?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(data => {
        const rawNodes: Omit<GNode, "x" | "y" | "vx" | "vy">[] = data.nodes ?? [];
        const initialized = rawNodes.map(n => ({
          ...n,
          correctionCount: n.correctionCount ?? 0,
          x: W / 2 + (Math.random() - 0.5) * 300,
          y: H / 2 + (Math.random() - 0.5) * 300,
          vx: 0, vy: 0,
        }));
        nodesRef.current = initialized;
        setNodes(initialized);
        setEdges(data.edges ?? []);
        setRooms(data.rooms ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [status, userId]);

  // Force simulation
  useEffect(() => {
    if (loading) return;

    function tick() {
      const ns = nodesRef.current;
      if (ns.length === 0) { animRef.current = requestAnimationFrame(tick); return; }

      const REPEL = 3500;
      const ATTRACT = 0.04;
      const GRAVITY = 0.015;
      const DAMPING = 0.8;
      const MIN_DIST = 40;

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DIST);
          const force = REPEL / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          ns[i].vx -= fx; ns[i].vy -= fy;
          ns[j].vx += fx; ns[j].vy += fy;
        }
      }

      // Attraction along edges
      const idToIdx = new Map(ns.map((n, i) => [n.id, i]));
      for (const e of edges) {
        const i = idToIdx.get(e.fromNodeId);
        const j = idToIdx.get(e.toNodeId);
        if (i == null || j == null) continue;
        const dx = ns[j].x - ns[i].x;
        const dy = ns[j].y - ns[i].y;
        ns[i].vx += dx * ATTRACT; ns[i].vy += dy * ATTRACT;
        ns[j].vx -= dx * ATTRACT; ns[j].vy -= dy * ATTRACT;
      }

      // Gravity + bounds
      const cx = W / 2, cy = H / 2;
      for (const n of ns) {
        if (dragRef.current?.id === n.id) continue;
        n.vx += (cx - n.x) * GRAVITY;
        n.vy += (cy - n.y) * GRAVITY;
        n.vx *= DAMPING; n.vy *= DAMPING;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(24, Math.min(W - 24, n.x));
        n.y = Math.max(24, Math.min(H - 24, n.y));
      }

      forceRender(v => v + 1);
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [loading, edges, W, H]);

  // Sync nodesRef when nodes state changes externally
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const roomColorMap = new Map(rooms.map((r, i) => [r.id, ROOM_COLORS[i % ROOM_COLORS.length]]));
  const roomNameMap = new Map(rooms.map(r => [r.id, r.name]));

  const visibleNodes = nodesRef.current.filter(n =>
    (selectedRoomIds.size === 0 || selectedRoomIds.has(n.roomId)) &&
    (!filterType || n.type === filterType)
  );
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = edges.filter(e => visibleNodeIds.has(e.fromNodeId) && visibleNodeIds.has(e.toNodeId));

  const selectedEdges = selected
    ? edges.filter(e => e.fromNodeId === selected.id || e.toNodeId === selected.id)
    : [];
  const selectedNeighbourIds = new Set(selectedEdges.flatMap(e => [e.fromNodeId, e.toNodeId]));

  // Drag handlers
  function onMouseDown(e: React.MouseEvent, node: GNode) {
    e.stopPropagation();
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    dragRef.current = { id: node.id, ox: svgPt.x - node.x, oy: svgPt.y - node.y };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const n = nodesRef.current.find(n => n.id === dragRef.current!.id);
    if (n) { n.x = svgPt.x - dragRef.current.ox; n.y = svgPt.y - dragRef.current.oy; n.vx = 0; n.vy = 0; }
  }

  function onMouseUp() { dragRef.current = null; }

  if (status === "loading") return (
    <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-500">Loading…</div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-800 px-3 md:px-5">
          <button className="md:hidden rounded p-1.5 text-gray-400 hover:bg-gray-800"
            onClick={() => setMobileSidebarOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-100">Knowledge Graph</span>
          <span className="text-xs text-gray-600 hidden sm:block">{visibleNodes.length} nodes · {visibleEdges.length} edges</span>

          <div className="ml-auto flex items-center gap-2">
            {/* Room multi-select */}
            <div className="relative">
              <button
                onClick={() => setRoomPickerOpen(v => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-2.5 py-1 text-xs text-gray-300 outline-none ring-1 ring-gray-700 hover:ring-gray-500 transition-colors">
                <span>
                  {selectedRoomIds.size === 0
                    ? "All rooms"
                    : selectedRoomIds.size === 1
                      ? `#${rooms.find(r => selectedRoomIds.has(r.id))?.name}`
                      : `${selectedRoomIds.size} rooms`}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                  className={`h-3 w-3 text-gray-500 transition-transform ${roomPickerOpen ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {roomPickerOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-gray-700 bg-gray-900 shadow-xl py-1"
                  onMouseLeave={() => setRoomPickerOpen(false)}>
                  {/* Select all / none */}
                  <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1.5 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rooms</span>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedRoomIds(new Set())}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">All</button>
                      <button onClick={() => setSelectedRoomIds(new Set(rooms.map(r => r.id)))}
                        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">None</button>
                    </div>
                  </div>
                  <ul className="max-h-60 overflow-y-auto px-1">
                    {rooms.map(r => {
                      const checked = selectedRoomIds.size === 0 || selectedRoomIds.has(r.id);
                      const color = roomColorMap.get(r.id);
                      return (
                        <li key={r.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-800 transition-colors">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedRoomIds(prev => {
                                  // "all" state (empty set) → clicking a room deselects everything except it
                                  if (prev.size === 0) {
                                    return new Set(rooms.filter(x => x.id !== r.id).map(x => x.id));
                                  }
                                  const next = new Set(prev);
                                  if (next.has(r.id)) {
                                    next.delete(r.id);
                                    // if none left, revert to "all"
                                    if (next.size === 0) return new Set();
                                  } else {
                                    next.add(r.id);
                                    // if all selected, revert to "all" state
                                    if (next.size === rooms.length) return new Set();
                                  }
                                  return next;
                                });
                              }}
                              className="h-3.5 w-3.5 shrink-0 accent-indigo-500 cursor-pointer"
                            />
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                            <span className="truncate text-xs text-gray-200">#{r.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Type filter */}
            <select value={filterType ?? ""} onChange={e => setFilterType(e.target.value || null)}
              className="rounded-lg bg-gray-800 px-2 py-1 text-xs text-gray-300 outline-none ring-1 ring-gray-700">
              <option value="">All types</option>
              <option value="person">People</option>
              <option value="place">Places</option>
              <option value="topic">Topics</option>
              <option value="concept">Concepts</option>
            </select>

            {selected && (
              <button onClick={() => { setSelected(null); setCorrections([]); setCorrectionsExpanded(false); }}
                className="rounded-lg bg-gray-800 px-3 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                Clear selection
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-600">Loading graph…</div>
        ) : nodesRef.current.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-12 w-12 text-gray-800">
              <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.818a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .845-.143Z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-gray-600">No graph data yet.</p>
            <p className="text-xs text-gray-700">The AI builds the graph as conversations happen in rooms.</p>
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden">
            <svg ref={svgRef} width="100%" height="100%"
              onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onClick={() => { setSelected(null); setCorrections([]); setCorrectionsExpanded(false); }}
              className="cursor-default">

              {/* Edges */}
              <g>
                {visibleEdges.map(e => {
                  const from = nodesRef.current.find(n => n.id === e.fromNodeId);
                  const to = nodesRef.current.find(n => n.id === e.toNodeId);
                  if (!from || !to) return null;
                  const isHighlighted = selectedEdges.some(se => se.id === e.id);
                  return (
                    <g key={e.id}>
                      <line
                        x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke={isHighlighted ? "#6366f1" : "#374151"}
                        strokeWidth={isHighlighted ? 1.5 : 1}
                        strokeOpacity={selected && !isHighlighted ? 0.15 : 0.6}
                      />
                      {/* Edge label */}
                      {isHighlighted && (
                        <text
                          x={(from.x + to.x) / 2}
                          y={(from.y + to.y) / 2 - 4}
                          fill="#818cf8"
                          fontSize={9}
                          textAnchor="middle"
                          className="pointer-events-none select-none">
                          {e.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* Nodes */}
              <g>
                {visibleNodes.map(n => {
                  const isSelected = selected?.id === n.id;
                  const isNeighbour = selectedNeighbourIds.has(n.id);
                  const dimmed = selected && !isSelected && !isNeighbour;
                  const color = TYPE_COLOR[n.type] ?? "#9ca3af";
                  const r = isSelected ? 10 : 7;

                  return (
                    <g key={n.id}
                      transform={`translate(${n.x},${n.y})`}
                      className="cursor-pointer"
                      onMouseDown={ev => onMouseDown(ev, n)}
                      onClick={ev => {
                        ev.stopPropagation();
                        if (isSelected) { setSelected(null); setCorrections([]); setCorrectionsExpanded(false); return; }
                        setSelected(n);
                        setCorrections([]);
                        setCorrectionsExpanded(false);
                        if (n.correctionCount > 0) {
                          setCorrectionsLoading(true);
                          fetch(`${SERVER}/api/graph/nodes/${n.id}/messages`)
                            .then(r => r.json())
                            .then(msgs => { setCorrections(msgs); setCorrectionsLoading(false); })
                            .catch(() => setCorrectionsLoading(false));
                        }
                      }}
                      onMouseEnter={() => setHovered(n)}
                      onMouseLeave={() => setHovered(null)}>

                      {/* Room halo */}
                      <circle r={r + 3}
                        fill={roomColorMap.get(n.roomId) ?? "#4b5563"}
                        opacity={dimmed ? 0.05 : 0.18} />

                      {/* Node */}
                      <circle r={r}
                        fill={color}
                        opacity={dimmed ? 0.15 : 1}
                        stroke={isSelected ? "#fff" : "transparent"}
                        strokeWidth={1.5} />

                      {/* Correction badge */}
                      {n.correctionCount > 0 && (
                        <circle r={3.5} cx={r - 1} cy={-(r - 1)}
                          fill="#f59e0b" opacity={dimmed ? 0.15 : 1} />
                      )}

                      {/* Label */}
                      <text
                        y={r + 11}
                        fill={dimmed ? "#374151" : "#d1d5db"}
                        fontSize={10}
                        textAnchor="middle"
                        className="pointer-events-none select-none">
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Hover tooltip */}
            {hovered && !selected && (
              <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-gray-700 bg-gray-900/95 px-3 py-2 text-xs shadow-xl">
                <p className="font-semibold text-gray-100">{hovered.label}</p>
                <p className="mt-0.5 capitalize text-gray-500">{hovered.type} · #{roomNameMap.get(hovered.roomId)}</p>
              </div>
            )}

            {/* Selection panel */}
            {selected && (
              <div className="absolute right-4 top-4 w-72 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900/95 p-4 text-xs shadow-xl flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: TYPE_COLOR[selected.type] ?? "#9ca3af" }} />
                  <p className="font-semibold text-gray-100 truncate">{selected.label}</p>
                </div>
                <div>
                  <p className="capitalize text-gray-500">{selected.type}</p>
                  <p className="text-gray-500">Room: #{roomNameMap.get(selected.roomId)}</p>
                </div>

                {selectedEdges.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Connections</p>
                    <ul className="space-y-1.5 max-h-32 overflow-y-auto">
                      {selectedEdges.map(e => {
                        const other = nodesRef.current.find(n =>
                          n.id === (e.fromNodeId === selected.id ? e.toNodeId : e.fromNodeId)
                        );
                        return (
                          <li key={e.id} className="flex items-start gap-1.5">
                            <span className="mt-0.5 text-gray-600">→</span>
                            <span>
                              <span className="text-indigo-400">{e.label}</span>
                              {" "}<span className="text-gray-300">{other?.label}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {selected.correctionCount > 0 && (
                  <div>
                    <button
                      onClick={() => setCorrectionsExpanded(v => !v)}
                      className="flex w-full items-center gap-2 rounded-lg bg-amber-950/50 border border-amber-500/20 px-3 py-2 text-left hover:bg-amber-950/70 transition-colors">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-amber-300 font-semibold">
                        {selected.correctionCount} AI Correction{selected.correctionCount !== 1 ? "s" : ""}
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                        className={`ml-auto h-3.5 w-3.5 text-amber-500 transition-transform ${correctionsExpanded ? "rotate-180" : ""}`}>
                        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {correctionsExpanded && (
                      <div className="mt-2 space-y-2">
                        {correctionsLoading ? (
                          <p className="text-center text-gray-600 py-2">Loading…</p>
                        ) : corrections.map(msg => {
                          const payload = parseAIContent(msg.content);
                          const text = payload.type === "factual" ? payload.text : payload.type === "ambiguity" ? `"${payload.quote}" — ${payload.pronoun} refers to ${payload.referent}` : "";
                          const isSarcasm = payload.type === "factual" && payload.sarcasm;
                          const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                          return (
                            <div key={msg.id} className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-3 py-2">
                              <div className="flex items-center gap-1.5 mb-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-amber-400">
                                  <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
                                </svg>
                                <span className="text-amber-300 font-semibold">AI Note</span>
                                {isSarcasm && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-400">sarcasm</span>}
                                <span className="ml-auto text-gray-600">{time}</span>
                              </div>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{text}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-xl border border-gray-800 bg-gray-900/90 px-3 py-2.5 text-[10px]">
              {Object.entries(TYPE_COLOR).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="capitalize text-gray-500">{type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
