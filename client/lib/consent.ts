// Cookie / storage consent. The site currently sets only strictly-necessary
// cookies (the auth session) and functional local storage (theme, room password),
// so nothing non-essential fires before a choice is made. This records the user's
// preference and is the gate ANY future non-essential script (e.g. analytics) must
// check before running — call hasAnalyticsConsent() first.
const KEY = "gfd-cookie-consent";
export const CONSENT_CHANGE_EVENT = "gfd-consent-change";

export type ConsentChoice = "accepted" | "essential";

export function getConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { choice?: ConsentChoice };
    return parsed.choice ?? null;
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
  } catch {
    /* storage blocked — nothing else to do */
  }
}

// Non-essential scripts must gate on this before firing.
export function hasAnalyticsConsent(): boolean {
  return getConsent() === "accepted";
}
