"use client";

import { useEffect, useRef } from "react";
import { drawCharacter, GRID_W, GRID_H, type Appearance, type Dir } from "@/lib/avatar";

// Renders a composable pixel character to a canvas. `size` is the target width
// in CSS px; height follows the sprite's aspect. Optionally animates a walk.
export default function AvatarSprite({
  appearance, size = 44, dir = "down", animated = false, className, style,
}: {
  appearance: Appearance;
  size?: number;
  dir?: Dir;
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const padW = GRID_W + 2, padH = GRID_H + 3;
  const cell = size / padW;
  const w = size, h = padH * cell;
  const sig = `${appearance.skin}.${appearance.hair}.${appearance.hairColor}.${appearance.shirt}.${appearance.pants}.${appearance.hat}`;

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    let raf = 0; const t0 = performance.now();
    const paint = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const frame = animated ? Math.floor((t - t0) / 150) % 4 : 0;
      drawCharacter(ctx, cell, cell, cell, appearance, dir, frame);
      if (animated) raf = requestAnimationFrame(paint);
    };
    paint(t0);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [sig, dir, animated, w, h, cell, appearance]);

  return <canvas ref={ref} width={w} height={h} style={{ width: w, height: h, imageRendering: "pixelated", ...style }} className={className} />;
}
