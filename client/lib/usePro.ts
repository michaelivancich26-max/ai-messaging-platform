"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export interface ProStatus {
  isPro: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;   // that date is when access ENDS, not renews
  manageable: boolean;   // has a Stripe customer → can open the billing portal
  configured: boolean;   // billing is wired up server-side (keys present)
}

// Live Pro status, read from the server (never the session JWT, which is minted at
// login and wouldn't reflect a fresh Stripe upgrade). `refresh` lets a page re-pull
// after returning from Stripe checkout.
export function usePro() {
  const { status: authStatus } = useSession();
  const [pro, setPro] = useState<ProStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (authStatus !== "authenticated") { setLoading(false); return; }
    setLoading(true);
    api(`${SERVER}/api/billing/status`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setPro(d as ProStatus); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authStatus]);

  useEffect(() => { refresh(); }, [refresh]);

  // Treat the pre-auth window as loading so Pro users don't flash the upsell before
  // the status fetch resolves.
  return { isPro: !!pro?.isPro, pro, loading: loading || authStatus === "loading", refresh };
}
