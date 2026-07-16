// Does the server actually open a token NextAuth actually issued?
//
// The server can't call NextAuth's decode — that lives in the client's Next.js
// runtime — so services/auth.ts re-derives the encryption key independently.
// That derivation is copied from next-auth v4 internals (an empty salt, one
// exact info string), and getting it wrong does NOT raise an error: you derive
// a perfectly valid key that decrypts nothing, and the symptom is every user
// appearing signed out.
//
// So this mints a token with next-auth's OWN encoder, reached through the
// client's node_modules, and asserts the server opens it. Testing our decrypt
// against our own encrypt would prove nothing — both halves would share the
// same mistake. Run it after any next-auth upgrade.
//
//   npm run auth:verify

import { verifySessionToken } from "../services/auth";

// The real thing, out of the client's dependency tree — not a reimplementation.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encode } = require("../client/node_modules/next-auth/jwt");

async function main() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("FAIL: NEXTAUTH_SECRET is not set — cannot test.");
    process.exit(1);
  }

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };

  // 1. A token next-auth issued must open, with the claims intact.
  const token = await encode({
    token: { id: "user-123", username: "testuser", isAdmin: true },
    secret,
    maxAge: 60,
  });
  const actor = await verifySessionToken(token);
  check("a real next-auth token verifies", actor !== null,
    actor ? "" : "THE KEY DERIVATION IS WRONG — this is the whole point of this test");
  check("id survives", actor?.id === "user-123", actor?.id);
  check("username survives", actor?.username === "testuser", actor?.username);
  check("isAdmin survives", actor?.isAdmin === true, String(actor?.isAdmin));

  // 2. Everything not provably good must be rejected.
  check("garbage rejected", (await verifySessionToken("not-a-token")) === null);
  check("empty rejected", (await verifySessionToken("")) === null);
  check("null rejected", (await verifySessionToken(null)) === null);

  // A token minted under a different secret must not open under ours. This is
  // the actual forgery attempt — if it passes, anyone can mint their own.
  const foreign = await encode({
    token: { id: "attacker", username: "attacker" },
    secret: "a-completely-different-secret-value-abc123",
    maxAge: 60,
  });
  check("token from a foreign secret rejected", (await verifySessionToken(foreign)) === null);

  // Tampering with the ciphertext must fail the AEAD tag, not silently decode.
  const tampered = token.slice(0, -4) + "AAAA";
  check("tampered token rejected", (await verifySessionToken(tampered)) === null);

  // An expired token must not be honoured. next-auth's clockTolerance is 15s,
  // so this is dated well outside it.
  const expired = await encode({
    token: { id: "user-123", username: "testuser" },
    secret,
    maxAge: -60,
  });
  check("expired token rejected", (await verifySessionToken(expired)) === null);

  // A token carrying no identity is not an identity.
  const empty = await encode({ token: {}, secret, maxAge: 60 });
  check("token without id/username rejected", (await verifySessionToken(empty)) === null);

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
