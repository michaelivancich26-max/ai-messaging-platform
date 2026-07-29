// Three defects in the Stripe webhook, all of which cost real money or lie to a
// paying customer.
//
// 1. NO IDEMPOTENCY. Stripe retries a webhook until it gets a 2xx, and a retry
//    re-ran the whole handler. Combined with (3) it could resurrect a
//    subscription that had already ended.
// 2. NO ORDERING GUARD. Events for one subscription can arrive out of order. A
//    retried 'updated' landing after a 'deleted' re-granted the entitlement.
// 3. GRANTED ON AN UNPAID SESSION. checkout.session.completed never read
//    payment_status, so an asynchronous payment method handed out Pro before any
//    money moved.
//
// Plus the cancellation flag: a cancelled subscription keeps working until the
// period ends, and the billing page told those users their plan "renews".
//
// The webhook verifies a Stripe signature, so this signs its own payloads with
// the same secret the server is running with.
// Run: NEXTAUTH_SECRET=... STRIPE_WEBHOOK_SECRET=... node scripts/verify-billing.js
const crypto = require("crypto");
const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
const WH = process.env.STRIPE_WEBHOOK_SECRET;
if (!SECRET) { console.error("NEXTAUTH_SECRET required"); process.exit(1); }
if (!WH) { console.log("STRIPE_WEBHOOK_SECRET not set — skipping (the webhook can't be exercised without it)"); process.exit(0); }

const P = "vbl-";
const USER = `${P}payer`;
const SUB = `sub_${P}1`;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// Stripe's scheme: t=<unix>,v1=<hmac of "<t>.<body>">
function sign(body) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", WH).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

let eventSeq = 0;
async function send(type, object, opts = {}) {
  const id = opts.id ?? `evt_${P}${++eventSeq}`;
  const body = JSON.stringify({
    id, object: "event", type,
    created: opts.created ?? Math.floor(Date.now() / 1000),
    data: { object },
  });
  const res = await fetch(`${SERVER}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": sign(body) },
    body,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const readUser = async () => (await prisma.$queryRawUnsafe(
  `SELECT "isPro","proStatus","proCancelAtPeriodEnd","proCurrentPeriodEnd" FROM "User" WHERE id=$1`, USER))[0] ?? {};

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "StripeEvent" WHERE id LIKE $1`, `evt_${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

async function main() {
  await clean();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password,"stripeSubscriptionId","stripeCustomerId")
     VALUES ($1,$1,$1 || '@t.local','x',$2,'cus_test')`, USER, SUB);

  const now = Math.floor(Date.now() / 1000);
  const monthEnd = now + 30 * 86400;

  // ── 3. An unpaid completed checkout must not grant Pro ─────────────────────
  const unpaid = await send("checkout.session.completed", {
    id: "cs_unpaid", object: "checkout.session", client_reference_id: USER,
    customer: "cus_test", subscription: SUB, payment_status: "unpaid", status: "complete",
  });
  let u = await readUser();
  check("an unpaid checkout does not grant Pro", unpaid.status === 200 && !u.isPro,
    `status=${unpaid.status} isPro=${u.isPro}`);

  // ── the paid one does ──────────────────────────────────────────────────────
  await send("customer.subscription.updated", {
    id: SUB, object: "subscription", status: "active", cancel_at_period_end: false,
    current_period_end: monthEnd, items: { data: [{ current_period_end: monthEnd }] },
  }, { created: now });
  u = await readUser();
  check("an active subscription grants Pro", !!u.isPro, `isPro=${u.isPro} status=${u.proStatus}`);
  check("and is not marked as cancelling", !u.proCancelAtPeriodEnd);

  // ── cancellation flag ──────────────────────────────────────────────────────
  await send("customer.subscription.updated", {
    id: SUB, object: "subscription", status: "active", cancel_at_period_end: true,
    current_period_end: monthEnd, items: { data: [{ current_period_end: monthEnd }] },
  }, { created: now + 10 });
  u = await readUser();
  check("cancelling is recorded while access continues", !!u.isPro && !!u.proCancelAtPeriodEnd,
    `isPro=${u.isPro} cancelling=${u.proCancelAtPeriodEnd}`);

  // and the status endpoint says so, since that's what the page renders
  const tok = await encode({ token: { id: USER, username: USER }, secret: SECRET });
  const st = await fetch(`${SERVER}/api/billing/status`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
  check("billing status reports the cancellation", st.cancelAtPeriodEnd === true,
    `cancelAtPeriodEnd=${st.cancelAtPeriodEnd}`);

  // ── 1. Idempotency: the same event twice must act once ─────────────────────
  const dupId = `evt_${P}dup`;
  await send("customer.subscription.deleted", {
    id: SUB, object: "subscription", status: "canceled", cancel_at_period_end: false,
    current_period_end: monthEnd, items: { data: [{ current_period_end: monthEnd }] },
  }, { id: dupId, created: now + 20 });
  const after1 = await readUser();
  const replay = await send("customer.subscription.deleted", {
    id: SUB, object: "subscription", status: "canceled", cancel_at_period_end: false,
    current_period_end: monthEnd, items: { data: [{ current_period_end: monthEnd }] },
  }, { id: dupId, created: now + 20 });
  check("a replayed event is recognised as a duplicate", replay.body.duplicate === true,
    `body=${JSON.stringify(replay.body)}`);
  check("the cancellation stuck", !after1.isPro, `isPro=${after1.isPro} status=${after1.proStatus}`);

  // ── 2. Ordering: a stale 'updated' must not resurrect the subscription ─────
  await send("customer.subscription.updated", {
    id: SUB, object: "subscription", status: "active", cancel_at_period_end: false,
    current_period_end: monthEnd, items: { data: [{ current_period_end: monthEnd }] },
  }, { created: now + 5 });                     // generated BEFORE the delete
  u = await readUser();
  check("a stale event cannot resurrect a cancelled subscription", !u.isPro,
    `isPro=${u.isPro} status=${u.proStatus}`);

  // a genuinely newer event still applies, or the guard would freeze the account
  await send("customer.subscription.updated", {
    id: SUB, object: "subscription", status: "active", cancel_at_period_end: false,
    current_period_end: monthEnd, items: { data: [{ current_period_end: monthEnd }] },
  }, { created: now + 99 });
  u = await readUser();
  check("a newer event still applies", !!u.isPro, `isPro=${u.isPro} status=${u.proStatus}`);

  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : `\nbilling holds: paid-only, once-only, in-order, and honest about cancelling`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
