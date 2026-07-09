"use client";

import { useId } from "react";
import { avatarSVG, type Appearance } from "@/lib/avatar";

// Renders a composable flat-vector avatar bust as inline SVG. `size` is the
// square width/height in CSS px. `dir`/`animated` are accepted for backward
// compatibility with older call sites but no longer affect the static bust.
export default function AvatarSprite({
  appearance, size = 44, className, style,
}: {
  appearance: Appearance;
  size?: number;
  dir?: unknown;
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const sig = `${appearance.skin}.${appearance.hair}.${appearance.hairColor}.${appearance.shirt}.${appearance.pants}.${appearance.hat}`;

  return (
    <svg
      key={sig}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, display: "block", ...style }}
      role="img"
      dangerouslySetInnerHTML={{ __html: avatarSVG(appearance, uid) }}
    />
  );
}
