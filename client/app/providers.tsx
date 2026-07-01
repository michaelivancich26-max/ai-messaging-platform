"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";

function IOSViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Prevent iOS from panning the page when the keyboard appears.
    // Without this, the fixed body "shifts up" and the header disappears.
    function onScroll() { window.scrollTo(0, 0); }
    vv.addEventListener("scroll", onScroll);
    return () => vv.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><IOSViewportFix />{children}</SessionProvider>;
}
