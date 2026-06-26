"use client";

import { useEffect, useRef, useState } from "react";
import { parseAIContent } from "@/lib/types";

interface GNode {
  id: string;
  label: string;
  type: string;
  roomId: string;
  correctionCount: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
}

interface RawMessage {
  id: string;
  content: string;
  createdAt: string;
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const TYPE_COLOR: Record<string, string> = {
  person: "#818cf8",
  place: "#34d399",
  topic: "#fbbf24",
  concept: "#c084fc",
};

interface Props {
  roomName: string;  // room name (slug)
  roomDbId: string;  // Room.id in DB
  onClose: () => void;
}

export default function RoomGraph({ roomName, roomDbId, onClose }: Props) {
  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [hovered, setHovered] = useState<GNode | null>(null);
  const [corrections, setCorrections] = useState<RawMessage[]>([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionsExpanded, setCorrectionsExpanded] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<GNode[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const [, forceRender] = useState(0);

  // Panel is 480px wide
  const W = 480;
  const H = typeof window !== "undefined" ? window.innerHeight - 56 : 600;

  useEffect(() => {
    if (!roomDbId) return;
    setLoading(true);
    fetch(`${SERVER}/api/graph?roomId=${encodeURIComponent(roomDbId)}`)
      .then(r => r.json())
      .then(data => {
        const rawNodes: Omit<GNode, "x" | "y" | "vx" | "vy">[] = data.nodes ?? [];
        const initialized = rawNodes.map(n => ({
          ...n,
          correctionCount: n.correctionCount ?? 0,
          x: W / 2 + (Math.random() - 0.5) * 200,
          y: H / 2 + (Math.random() - 0.5) * 200,
          vx: 0, vy: 0,
        }));
        nodesRef.current = initialized;
        setNodes(initialized);
        setEdges(data.edges ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => cancelAnimationFrame(animRef.current);
  }, [roomDbId]);

  // Force simulation
  useEffect(() => {
    if (loading) return;

    function tick() {
      const ns = nodesRef.current;
      if (ns.length === 0) { animRef.current = requestAnimationFrame(tick); return; }

      const REPEL = 2500;
      const ATTRACT = 0.04;
      const GRAVITY = 0.018;
      const DAMPING = 0.8;
      const MIN_DIST = 35;

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

      const cx = W / 2, cy = H / 2;
      for (const n of ns) {
        if (dragRef.current?.id === n.id) continue;
        n.vx += (cx - n.x) * GRAVITY;
        n.vy += (cy - n.y) * GRAVITY;
        n.vx *= DAMPING; n.vy *= DAMPING;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(20, Math.min(W - 20, n.x));
        n.y = Math.max(20, Math.min(H - 20, n.y));
      }

      forceRender(v => v + 1);
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [loading, edges]);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

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

  function selectNode(n: GNode) {
    if (selected?.id === n.id) { setSelected(null); setCorrections([]); setCorrectionsExpanded(false); return; }
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
  }

  const visibleNodes = nodesRef.current.filter(n => !filterType || n.type === filterType);
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = edges.filter(e => visibleNodeIds.has(e.fromNodeId) && visibleNodeIds.has(e.toNodeId));
  const selectedEdges = selected ? edges.filter(e => e.fromNodeId === selected.id || e.toNodeId === selected.id) : [];
  const selectedNeighbourIds = new Set(selectedEdges.flatMap(e => [e.fromNodeId, e.toNodeId]));

  return (
    <div className="flex h-full flex-col border-l border-gray-800 bg-gray-950 w-full md:w-[480px] md:shrink-0">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-800 px-4">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400 shrink-0">
          <path fillRule="evenodd" d="M10 1a9 9 0 1 0 0 18A9 9 0 0 0 10 1ZM4.5 9.5a.75.75 0 0 0 0 1.5h3.69l-1.22 1.22a.75.75 0 1 0 1.06 1.06l2.5-2.5a.75.75 0 0 0 0-1.06l-2.5-2.5a.75.75 0 0 0-1.06 1.06l1.22 1.22H4.5Zm6.25-3.25a.75.75 0 0 1 .75-.75h.5a3 3 0 0 1 0 6h-.5a.75.75 0 0 1 0-1.5h.5a1.5 1.5 0 0 0 0-3h-.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-semibold text-gray-100">#{roomName} graph</span>
        <span className="text-xs text-gray-600">{visibleNodes.length} nodes</span>
        <select value={filterType ?? ""} onChange={e => setFilterType(e.target.value || null)}
          className="ml-auto rounded-lg bg-gray-800 px-2 py-1 text-xs text-gray-300 outline-none ring-1 ring-gray-700">
          <option value="">All types</option>
          <option value="person">People</option>
          <option value="place">Places</option>
          <option value="topic">Topics</option>
          <option value="concept">Concepts</option>
        </select>
        <button onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-600">Loading graph…</div>
      ) : nodesRef.current.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-gray-800">
            <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.818a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .845-.143Z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-gray-600">No graph data yet for this room.</p>
          <p className="text-xs text-gray-700">The AI builds the graph as conversations happen.</p>
        </div>
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <svg ref={svgRef} width="100%" height="100%"
            onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onClick={() => { setSelected(null); setCorrections([]); setCorrectionsExpanded(false); }}
            className="cursor-default">

            <g>
              {visibleEdges.map(e => {
                const from = nodesRef.current.find(n => n.id === e.fromNodeId);
                const to = nodesRef.current.find(n => n.id === e.toNodeId);
                if (!from || !to) return null;
                const isHighlighted = selectedEdges.some(se => se.id === e.id);
                return (
                  <g key={e.id}>
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={isHighlighted ? "#6366f1" : "#374151"}
                      strokeWidth={isHighlighted ? 1.5 : 1}
                      strokeOpacity={selected && !isHighlighted ? 0.15 : 0.6} />
                    {isHighlighted && (
                      <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 4}
                        fill="#818cf8" fontSize={9} textAnchor="middle" className="pointer-events-none select-none">
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            <g>
              {visibleNodes.map(n => {
                const isSelected = selected?.id === n.id;
                const isNeighbour = selectedNeighbourIds.has(n.id);
                const dimmed = selected && !isSelected && !isNeighbour;
                const color = TYPE_COLOR[n.type] ?? "#9ca3af";
                const r = isSelected ? 10 : 7;

                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} className="cursor-pointer"
                    onMouseDown={ev => onMouseDown(ev, n)}
                    onClick={ev => { ev.stopPropagation(); selectNode(n); }}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(null)}>
                    <circle r={r + 3} fill={color} opacity={dimmed ? 0.04 : 0.12} />
                    <circle r={r} fill={color} opacity={dimmed ? 0.15 : 1}
                      stroke={isSelected ? "#fff" : "transparent"} strokeWidth={1.5} />
                    {n.correctionCount > 0 && (
                      <circle r={3.5} cx={r - 1} cy={-(r - 1)} fill="#f59e0b" opacity={dimmed ? 0.15 : 1} />
                    )}
                    <text y={r + 11} fill={dimmed ? "#374151" : "#d1d5db"} fontSize={10}
                      textAnchor="middle" className="pointer-events-none select-none">
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Hover tooltip */}
          {hovered && !selected && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-gray-700 bg-gray-900/95 px-3 py-2 text-xs shadow-xl">
              <p className="font-semibold text-gray-100">{hovered.label}</p>
              <p className="mt-0.5 capitalize text-gray-500">{hovered.type}</p>
            </div>
          )}

          {/* Selection panel */}
          {selected && (
            <div className="absolute right-3 top-3 w-52 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900/95 p-3 text-xs shadow-xl flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: TYPE_COLOR[selected.type] ?? "#9ca3af" }} />
                <p className="font-semibold text-gray-100 truncate">{selected.label}</p>
              </div>
              <p className="capitalize text-gray-500">{selected.type}</p>

              {selectedEdges.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Connections</p>
                  <ul className="space-y-1 max-h-28 overflow-y-auto">
                    {selectedEdges.map(e => {
                      const other = nodesRef.current.find(n => n.id === (e.fromNodeId === selected.id ? e.toNodeId : e.fromNodeId));
                      return (
                        <li key={e.id} className="flex items-start gap-1">
                          <span className="text-gray-600">→</span>
                          <span><span className="text-indigo-400">{e.label}</span> <span className="text-gray-300">{other?.label}</span></span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {selected.correctionCount > 0 && (
                <div>
                  <button onClick={() => setCorrectionsExpanded(v => !v)}
                    className="flex w-full items-center gap-1.5 rounded-lg bg-amber-950/50 border border-amber-500/20 px-2.5 py-1.5 text-left hover:bg-amber-950/70 transition-colors">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-amber-300 font-semibold">{selected.correctionCount} AI Correction{selected.correctionCount !== 1 ? "s" : ""}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      className={`ml-auto h-3 w-3 text-amber-500 transition-transform ${correctionsExpanded ? "rotate-180" : ""}`}>
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {correctionsExpanded && (
                    <div className="mt-1.5 space-y-1.5">
                      {correctionsLoading ? (
                        <p className="text-center text-gray-600 py-2">Loading…</p>
                      ) : corrections.map(msg => {
                        const payload = parseAIContent(msg.content);
                        const text = payload.type === "factual" ? payload.text
                          : payload.type === "ambiguity" ? `"${payload.quote}" — ${payload.pronoun} → ${payload.referent}`
                          : "";
                        const isSarcasm = payload.type === "factual" && payload.sarcasm;
                        return (
                          <div key={msg.id} className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-2.5 py-2">
                            <div className="flex items-center gap-1 mb-1">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-amber-400">
                                <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
                              </svg>
                              <span className="text-amber-300 font-semibold">AI Note</span>
                              {isSarcasm && <span className="rounded-full bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-400">sarcasm</span>}
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
          <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-xl border border-gray-800 bg-gray-900/90 px-2.5 py-2 text-[10px]">
            {Object.entries(TYPE_COLOR).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="capitalize text-gray-500">{type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
