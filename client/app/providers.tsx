"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import AppChrome from "@/components/AppChrome";
import ThemeProvider from "@/components/ThemeProvider";
import CookieConsent from "@/components/CookieConsent";
import AgreementGate from "@/components/AgreementGate";

function IOSViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // On iOS, when the virtual keyboard appears, the browser pans the
    // layout viewport upward so the focused input stays visible. Because
    // the body is `position: fixed`, it stays anchored to the layout
    // viewport origin — not to the visual viewport — so it shifts off
    // screen. We fix this by keeping the body exactly co-incident with
    // the visual viewport at all times.
    function update() {
      document.body.style.top    = `${vv!.offsetTop}px`;
      document.body.style.height = `${vv!.height}px`;
    }

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.body.style.top    = "";
      document.body.style.height = "";
    };
  }, []);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><ThemeProvider><IOSViewportFix /><AppChrome>{children}</AppChrome><AgreementGate /><CookieConsent /></ThemeProvider></SessionProvider>;
}
