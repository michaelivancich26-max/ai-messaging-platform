"use client";

import { useId } from "react";
import {
  avatarSVG, AVATAR_FULL_VIEWBOX, AVATAR_FULL_ASPECT, AVATAR_BUST_VIEWBOX,
  type Appearance,
} from "@/lib/avatar";

// Renders a composable flat-vector character. `crop="full"` draws the whole
// standing figure in a portrait box; `crop="bust"` shows a square, circular
// head-and-shoulders crop of the same art (used in chat). `size` is the width
// in CSS px. `dir`/`animated` are accepted for backward compatibility but no
// longer affect the render.
export default function AvatarSprite({
  appearance, size = 44, crop = "full", className, style,
}: {
  appearance: Appearance;
  size?: number;
  crop?: "full" | "bust";
  dir?: unknown;
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const sig = `${appearance.skin}.${appearance.hair}.${appearance.hairColor}.${appearance.shirt}.${appearance.pants}.${appearance.hat}.${appearance.build}.${appearance.bottom}`;

  const bust = crop === "bust";
  const w = size;
  const h = bust ? size : Math.round(size * AVATAR_FULL_ASPECT);

  return (
    <svg
      key={sig}
      viewBox={bust ? AVATAR_BUST_VIEWBOX : AVATAR_FULL_VIEWBOX}
      width={w}
      height={h}
      className={className}
      style={{ width: w, height: h, display: "block", borderRadius: bust ? "50%" : undefined, ...style }}
      role="img"
      dangerouslySetInnerHTML={{ __html: avatarSVG(appearance, uid) }}
    />
  );
}
