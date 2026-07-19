"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AppShell from "./AppShell";

// Focused / pre-auth surfaces render without the unified shell.
const BARE_PREFIXES = ["/room", "/verify-email", "/reset-password", "/legal"];

// Wraps every page in the unified navigation shell, except the routes above
// (the login screen at "/", the focused debate room, and auth flows).
export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const bare = pathname === "/" || BARE_PREFIXES.some((p) => pathname.startsWith(p));
  if (bare) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
