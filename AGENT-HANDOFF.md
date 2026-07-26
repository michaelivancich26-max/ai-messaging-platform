# Agent Handoff — Grounds for Debate / Grounds Pro

Pick-up point as of commit `92f8b2a` on `main`. This doc is for another agent continuing the **Grounds Pro premium-tier** build. Read it before touching code — the "Traps" section will save you a broken deploy.

---

## 0. TL;DR — what to do next

The premium tier is being built **wave by wave**. **Waves 1–2 are shipped** (entitlement + Stripe billing + free Arena cap; AI post-match coach). The next task is **Wave 3 — the Belief Map** (a Pro-gated visualization of a user's deck positions and how they've shifted over time). See §6 for the full roadmap.

Working rhythm for every change: **build → typecheck both projects → validate any raw SQL against Docker Postgres (and/or `next build`) → adversarial-review workflow → fix findings → commit → push to `main`**. Ultracode is on, so orchestrate reviews via the Workflow tool and adversarially verify.

Billing is **live** (real Stripe keys are set in Railway). The local dev stack is currently **down**; Docker Postgres/Redis are up.

---

## 1. The product & stack

**Grounds for Debate** is a structured-debate platform. (The repo is named `ai-messaging-platform` for historical reasons — ignore that.) Brand wordmark: **GROUNDS** green · **FOR** ink · **DEBATE** red. Design philosophy: **good faith is the point** — changing your mind on evidence is rewarded; it is deliberately *not* a rage-bait comment section. The *proposition* (an arguable claim) is the primitive, not the topic.

Core surfaces: **Rapid Fire** (`/rapid`, "Omegle for debate" — matched with a stranger who holds the opposite view), the **belief Deck** (`/deck`, "Where you stand" — swipe claims, take sides; feeds Rapid matching; also embedded as a tab in `/rapid`), **Common Grounds** (`/lobby`, open rooms), **Battle Grounds** (`/compete`, ranked 1v1 + team, ELO), **Arena** (`/arena`, AI bot opponents, 5 tiers), **Training/Learn** (`/learn`, lessons + puzzles), **Watch** (`/watch`, spectate), **Community** (`/community`, player search + leaderboard), a **Debate hub** (`/debate`), profiles (`/dashboard`, `/u/[username]`), friends (`/friends`), DMs (`/messages`).

**Monorepo, two npm projects:**
- **Server** — Express + Prisma + Socket.io + Redis at repo root, `server.ts` (~6.5k lines), port **3001**. Cannot import from `client/`.
- **Client** — Next.js 14 **App Router** in `client/`, port **3000**. Most UI work is here.
- **AI** — Anthropic Haiku (`claude-haiku-4-5`) via `new Anthropic()` in `services/*.ts`. The admin proposition generator uses `claude-sonnet-5` (pennies — don't downgrade).

**Deploy:** `main` auto-deploys to **Railway** (server) + **Vercel** (client). Env vars: server secrets in **Railway**, client build/runtime in **Vercel**. Postgres + Redis run via `docker compose` locally (DB `ai_messaging`, user `aiuser`).

---

## 2. Running & verifying locally

Node lives at `C:\Program Files\nodejs` (Windows / Git-Bash). Prepend it to PATH if `node`/`npm` aren't found.

- **Docker** is on PATH only via PowerShell / full path, not the Bash tool. Postgres/Redis containers: `ai-messaging-platform-postgres-1`, `-redis-1`.
- **Server (with env):** the `dev` script (`ts-node-dev … server.ts`) does **not** load `.env`. Run it as:
  `node --env-file=.env -r ts-node/register/transpile-only server.ts` (from repo root). It refuses to boot without `NEXTAUTH_SECRET`. On boot it logs `[Stripe] billing configured/OFF …` and `[DB] … ready` for each runtime table/column.
- **Client:** `npm run dev` from `client/`.
- **Browser preview tool:** the launch config it reads is at the **primary working dir** `.claude/launch.json` (has only a `client` config), *not* the repo's `.claude/launch.json`. `preview_start {name:"server"}` starts the client, not the server — start the server yourself via PowerShell background.

**Verification loop (do all that apply before committing):**
1. **Typecheck both:** `npx tsc --noEmit` at repo root **and** in `client/`. Both must exit 0. (tsc does NOT catch prerender/CSR errors — see Trap #2.)
2. **Raw SQL** isn't typechecked. Validate it against the live schema via Docker before shipping:
   ```
   PW=$(grep -oE 'postgresql://aiuser:[^@]+@' .env | sed -E 's#.*aiuser:(.*)@#\1#')
   docker exec -e PGPASSWORD="$PW" ai-messaging-platform-postgres-1 psql -U aiuser -d ai_messaging -c "<SQL>"
   ```
3. **Client build** for any client change that could prerender: `npm run build` in `client/` (dev server must be OFF — Trap #3). Catches the Suspense/CSR errors tsc misses.
4. **Adversarial review** via the Workflow tool (find → verify dimensions; see prior `review-*` scripts under `…/workflows/scripts/`). Fix confirmed findings; the reviewers correctly reject non-defects.
5. **Live visual checks** (when the stack is up): use the browser tools, but **`computer{screenshot}` times out** — use `read_page` (a11y tree) + `javascript_tool` (`getComputedStyle`, DOM assertions) instead. Register a real account at `/` to see authed pages.

---

## 3. TRAPS — read or repeat someone's mistakes

1. **DB schema is raw SQL at boot, not Prisma migrations.** Columns/tables are added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` in `start()`, accessed with `$queryRawUnsafe`/`$executeRawUnsafe`. **Never run `prisma migrate dev`** — it drops the raw-SQL tables. Some columns ARE in `prisma/schema.prisma` (e.g. `isAdmin`, `RoomMember.role`); if you need `prisma.x` typed access to a new column, add it to the schema **and** the runtime ALTER **and** run `prisma generate` (generate only, never migrate).
2. **`useSearchParams()` must be wrapped in `<Suspense>`** or `next build` fails to prerender that route and **exits 1 — which silently blocks ALL Vercel client deploys**. This already happened (`/pro`, fixed in `518ca58`). Pattern: default export wraps an inner `<Content/>` in `<Suspense>`. Always `npm run build` before pushing new client pages that read search params.
3. **Never `next build` while `next dev` is running** — corrupts `client/.next` ("Cannot find module './xxx.js'"). If it happens: stop dev, delete `.next`, restart.
4. **Entitlement / authz is read FRESH from the DB server-side, never trusted from the client or the session JWT.** The JWT is minted at login and won't reflect a later Pro upgrade. `userIsPro(userId)` reads `"isPro"` fresh; the client `usePro()` fetches live `/api/billing/status`.
5. **Light theme is the default** (`darkMode: "class"`). Every color must read in **both** themes (≥4.5:1 body). The app's secondary-text token is **`text-gray-500 dark:text-gray-400`** — the inverted `text-gray-400 dark:text-gray-500` fails contrast and gets flagged every review. Brand green is too light as text on white — use `brand-green-ink` / `brand-red-ink` for text.
6. **All client→server calls use `api()` from `client/lib/api.ts`** (attaches a Bearer session token); sockets use `getSocket()` from `client/lib/socket.ts`. A bare `fetch()` to the server 401s.
7. **No BigInt to `res.json`.** Postgres `COUNT`/`RANK` return bigint — cast `::int` in SQL and/or `Number()` before responding.
8. **Rate limiting: a limiter that silently drops an event breaks optimistic UI.** Roll back the optimistic bubble on `rateLimited`; exempt connection-critical joins.
9. **Line endings:** repo is CRLF (`core.autocrlf`). Edit files directly; avoid `sed -i`-style rewrites that flip CRLF↔LF (turns a 5-file change into a 100-file diff).
10. **Two `NotificationBell`s / duplicated chrome:** desktop rail and mobile top bar are both mounted (CSS-hidden per breakpoint). Mount viewport-singleton components (like the bell) in exactly one place via a media-query hook, or their effects double-run.
11. **AI cost is frequency-driven** (all Haiku). Prompt caching doesn't apply (prompts below the cacheable minimum); `max_tokens` isn't a cost lever. Any paid-AI path must be rate-limited + cached, and Pro-gate the expensive ones.

---

## 4. Grounds Pro architecture (Waves 1–2, shipped)

**Thesis:** sell improvement / insight / convenience / status — **never outcomes.** Core debating stays free (Rapid/Common/ranked); Pro sells the layer around it. Never sell ELO / Grounds Score / wins; never AI assist in *ranked* matches (practice/Arena only).

**Entitlement (server.ts):** runtime `User` columns `isPro`, `stripeCustomerId`, `stripeSubscriptionId`, `proStatus`, `proCurrentPeriodEnd` (+ unique index on the sub id). `userIsPro(userId)` reads `isPro` fresh. Client `usePro()` (`client/lib/usePro.ts`) fetches `GET /api/billing/status`.

**Stripe (Managed Payments):**
- Webhook `POST /api/stripe/webhook` registered **before `app.use(express.json())`** with `express.raw()` so the signature verifies over the raw body. Handles `checkout.session.completed` (keyed by `client_reference_id`=userId) + `customer.subscription.created/updated/deleted` (keyed by `stripeSubscriptionId`). Reads `current_period_end` from `sub.items.data[0]` as a fallback (moved off the parent in new API versions). Keeps Pro through `past_due` (dunning grace).
- Checkout uses **Managed Payments** (`managed_payments:{enabled:true}`) on the preview API version **`2026-02-25.preview`**, pinned **per-request** via `RequestOptions.apiVersion` on only the product-create + checkout calls. `ensureProPrice()` auto-creates the "Grounds Pro" product ($10/mo, tax code `txcd_10103100`) and caches the price (module + redis key `stripe:pro_price_id`) when `STRIPE_PRICE_ID` is unset. Needs **Managed Payments enabled on the Stripe account**.
- `POST /api/billing/checkout` (rejects if already `isPro`), `/portal`, `/status`. `POST /api/admin/set-pro` (admin-gated) comps/tests without Stripe — driven by the **`/admin/pro`** page (+ "Admin" link in the settings popover).
- Env (Railway / `.env`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_PRICE_ID`. Unset → billing endpoints 503 and the app runs free-tier. `.env.example` documents it.

**First gate — free Arena cap = 5/day** in `POST /api/bot-rooms`: reserved **atomically** via Redis `INCR`-and-gate on `arena:day:<userId>:<UTC-date>` (rolled back on failure; fails open if Redis is down). Returns `402 {code:"arena_limit"}`; client shows an amber → `/pro` nudge.

**Wave 2 — AI post-match coach:** `services/coach.ts` (`coachMatch`) reads a room's HUMAN debate messages (bounded like `services/summarizer.ts`; **excludes spectator-chat** via `NOT:{channel:{isSpectatorChat:true}}`), labels the requester's messages "YOU", asks Haiku for `{summary, strengths, improvements, fallacies, nextTime}`. `GET /api/coach/:roomName` (aiRouteLimiter) is Pro-gated + participant-only (`RoomMember role != 'SPECTATOR'`) + Redis-cached 7d (`?refresh=1` bypasses). `client/components/MatchCoach.tsx` renders beside `RapidAftermath` in both the ended-match overlay and the voided-round banner (`!isSpectator`); non-Pro → upsell. **Coach is not yet on the Arena bot-result screen** (do it in Wave 4).

**Pro UI entry points:** the `/pro` page (checkout/manage; "Live" vs "Rolling out" benefit chips), a **home-page banner**, the settings-menu "Grounds Pro" link, and the Arena/coach nudges. `usePro()` gates all of them.

---

## 5. Where Pro code lives

| Piece | File |
| --- | --- |
| Entitlement + Stripe + billing endpoints + arena cap + coach endpoint + admin/set-pro | `server.ts` (search `Stripe / Pro entitlement`, `Billing / Pro`, `AI post-match coach`) |
| Coach AI | `services/coach.ts` |
| Live Pro status hook | `client/lib/usePro.ts` |
| Upgrade page | `client/app/pro/page.tsx` |
| Admin comp toggle | `client/app/admin/pro/page.tsx` |
| Coach UI | `client/components/MatchCoach.tsx` (rendered in `client/app/room/[roomId]/page.tsx`) |
| Home Pro banner + settings link | `client/app/home/page.tsx`, `client/components/AppShell.tsx` |
| Env template | `.env.example` |

---

## 6. Remaining roadmap (build each as its own reviewed wave; gate via `userIsPro`)

3. **Belief Map** — a Pro visualization of the user's deck positions across topics and how they've **shifted over time** (the product's north-star is mind-change, so lean into that). Data: the belief/deck layer (`services/propositions.ts`, `getDeck`/`recordBelief`, the `Belief` runtime tables). Likely a new server aggregation endpoint + a client page/section. Shareable "where I stand" card is a growth angle.
4. **Arena practice tools + Custom AI opponents** — practice-only assist/drills in Arena (never ranked), and "describe an opponent → AI plays that persona" (`services/debateBot.ts`, `client/lib/bots.ts`). **Also add `MatchCoach` to the Arena bot-result screen** (it's missing there).
5. **Advanced analytics** — rubric trends over time, win-rate by category, head-to-head, rank history. The data mostly exists (`avgLogic/avgEvidence/…`, `elo`/`arenaElo`, the leaderboard/rank queries in `buildProfilePayload`).
6. **Power-user creation** — tournaments/brackets, large/private Common Grounds rooms, room-owner tools.
Later: cosmetics (Pro badge, name colors, profile themes — zero-integrity-risk margin).

---

## 7. Operational status (as of `92f8b2a`)

- **Billing is LIVE** — real Stripe keys are set in **Railway**; the checkout redirect to Stripe works. It has **not** been validated end-to-end because live keys reject test cards — validate in Stripe **test mode** (swap Railway keys to `sk_test_…` + a test webhook, run `4242 4242 4242 4242`, swap back), or trust the reviewed webhook code and use the **`/admin/pro`** toggle to exercise gated features.
- **Vercel** deploys from `main`; a bad `next build` (Trap #2) blocks it — always build client changes locally first. **Railway** deploys from `main` too; env changes need a redeploy/restart to take effect (watch the boot `[Stripe] …` log line).
- **Local stack is DOWN.** Docker Postgres/Redis are up. Start the server via PowerShell (§2), client via `preview_start {name:"client"}` or `npm run dev`.
- Recent trail: `92f8b2a` coach · `913052f` admin toggle · `2bdf757` boot log · `518ca58` Suspense fix · `0456f7c` home banner · `c848a56` err surfacing · `73da120` Managed Payments · `42336bd` Pro wave 1.

## 8. Memory

The prior agent kept persistent notes in `~/.claude/…/memory/` (loaded via `MEMORY.md`). The most relevant: **grounds-pro-premium-tier**, **api-spend-model**, **authorization-model**, **rate-limiting**, **nav-social-redesign**, **grounds-for-debate-local-setup**. If you're in the same environment they auto-load; otherwise the key facts are in this doc.
