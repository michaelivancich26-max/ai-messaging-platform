# Agent Handoff — Grounds for Debate

Pick-up point as of `3225413` on `main`. Read the **Traps** section before touching code — it will save you a broken deploy or a day chasing a measurement artifact.

---

## 0. TL;DR — where things stand

The **Grounds Pro** waves are done except tournaments: entitlement + Stripe + the free Arena cap, the AI post-match coach, the Belief Map, custom AI opponents with a community library, and advanced analytics have all shipped. **Wave 6 — tournaments/brackets — is the one Pro item left**, and it is designed but unbuilt (see §6).

Most recent work has not been Pro at all. It has been making the two competitive modes into real products (`/rapid` and `/compete` are now feature homepages, not launchers), giving finished matches something to study (**the Tape**), making the judge coherent, and a long run of correctness and privacy fixes found by auditing. See §7.

Working rhythm for every change: **build → typecheck both projects → verify against the running app → adversarial review → prove the fix against the pre-fix code → commit → push**. Pushing to `main` deploys.

---

## 1. The product & stack

**Grounds for Debate** is a structured-debate platform. (The repo is named `ai-messaging-platform` for historical reasons — ignore that.) Brand: **GROUNDS** green · **FOR** ink · **DEBATE** red. Design philosophy: **good faith is the point** — changing your mind on evidence is rewarded; it is deliberately *not* a rage-bait comment section. The *proposition* (an arguable claim) is the primitive, not the topic.

Surfaces: **Rapid Fire** (`/rapid`, matched with a stranger who holds the opposite view), the **belief Deck** (`/deck`, take sides on claims; feeds Rapid matching), **Common Grounds** (`/lobby`), **Battle Grounds** (`/compete`, ranked 1v1 + team), **Arena** (`/arena`, AI opponents, 5 tiers), **Learn** (`/learn`, lessons + puzzles), **Watch** (`/watch`), **Community** (`/community`, search + every leaderboard), the **Tape** (`/match/[roomName]/review`), profiles (`/dashboard`, `/u/[username]`), friends, DMs.

**Monorepo, two npm projects:**
- **Server** — Express + Prisma + Socket.io + Redis at repo root, `server.ts` (~9k lines), port **3001**. Cannot import from `client/`.
- **Client** — Next.js 14 **App Router** in `client/`, port **3000**.
- **AI** — Anthropic Haiku (`claude-haiku-4-5`) in `services/*.ts`. The admin proposition generator uses `claude-sonnet-5` (pennies — don't downgrade).

**Deploy:** `main` auto-deploys to **Railway** (server) + **Vercel** (client). Server secrets live in Railway, client build/runtime in Vercel. Postgres + Redis run via `docker compose` locally (DB `ai_messaging`, user `aiuser`).

---

## 2. Running & verifying locally

- **Server:** `node --env-file=.env -r ts-node/register/transpile-only server.ts` from the repo root. The `dev` script does **not** load `.env`. It refuses to boot without `NEXTAUTH_SECRET`. On boot it logs `[Stripe] billing configured/OFF …` and `[DB] … ready` per runtime table — **any `[DB] … setup failed` line is a real problem**, not noise.
- **Client:** `npm run dev` from `client/`, or `preview_start {name:"client"}`.
- **`preview_start {name:"server"}` starts the CLIENT** — the launch config it reads only has a client entry. Start the server yourself.
- **Killing the server:** `pkill` is unreliable here. Kill by port:
  `Get-NetTCPConnection -State Listen -LocalPort 3001 | Select -Expand OwningProcess -Unique | %{ Stop-Process -Id $_ -Force }`

**Verification loop:**
1. **Typecheck both:** `npx tsc --noEmit` at root **and** in `client/`.
2. **Raw SQL isn't typechecked.** Run it against Docker Postgres, or exercise the endpoint.
3. **Client build** for anything that could prerender: `npm run build` in `client/` (dev server OFF — Trap #5).
4. **Regression scripts** in `scripts/` — see §5.
5. **Prove the fix.** For any bug fix, run the new check against the *pre-fix* code and watch it fail. This session that discipline caught a "fix" that fixed nothing and a "defect" that was a measurement error. Temporarily revert with a scratch script, run, restore.

---

## 3. TRAPS — read, or repeat someone's mistakes

1. **DB schema is raw SQL at boot, not Prisma migrations.** Columns/tables are added with `ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` in `start()`. **Never `prisma migrate dev`** — it drops the raw-SQL tables. `prisma generate` only.
2. **ONE STATEMENT PER `$executeRawUnsafe`.** It goes through a prepared statement, and Postgres rejects multiple commands with `42601`. Three boot blocks had batched SQL and threw on *every* boot; the catch swallowed it, so existing databases looked fine while a **fresh** database would silently never get those tables. Fixed, but the shape is easy to reintroduce.
3. **Raw-SQL columns are invisible to Prisma.** `isBot`, `deletedAt`, `rapidElo`, `proCancelAtPeriodEnd` and friends are NOT in `schema.prisma`. Naming one in a `prisma.x.create/update/where` **throws at runtime**, and `as any` hides it from tsc. Use `$queryRawUnsafe`/`$executeRawUnsafe` for them. This has bitten twice — once it would have broken every bot reply.
4. **`useSearchParams()` must be wrapped in `<Suspense>`** or `next build` exits 1 and **blocks all Vercel deploys**.
5. **Never `next build` while `next dev` runs** — corrupts `client/.next`. Recovery: stop dev, delete `.next`, restart.
6. **Entitlement/authz is read FRESH from the DB server-side.** Never trust the session JWT — it is minted at login and won't reflect a later upgrade. `userIsPro(userId)` reads `isPro` fresh.
7. **Light theme is default** (`darkMode: "class"`). Every colour must pass in **both** themes. The secondary-text token is **`text-gray-500 dark:text-gray-400`** — the inverted form fails contrast. Brand green is too light as text on white; use `brand-green-ink` / `brand-red-ink`.
8. **All client→server calls use `api()`** from `client/lib/api.ts`; sockets use `getSocket()`. A bare `fetch()` 401s.
9. **No BigInt to `res.json`.** Cast `::int` in SQL.
10. **The `/api` wall 401s every path**, including ones that don't exist — so you cannot fingerprint a deployed server by probing for a route. Verify server deploys another way.
11. **Duplicated chrome:** the desktop rail and mobile top bar are both mounted (CSS-hidden per breakpoint). Mount viewport-singletons once via a media-query hook or their effects double-run.
12. **AI cost is frequency-driven** (all Haiku). Prompt caching doesn't apply; `max_tokens` isn't a lever. Rate-limit and cache any paid path.

### The browser pane is a **hidden document** — this invalidates whole classes of measurement

`document.hidden === true`, `hasFocus() === false`, and **CSS transitions never advance**. A bare probe element with `transition: opacity 200ms` sits at its from-value forever. Consequences:

- **`computer{screenshot}` always times out.** Don't plan around screenshots; use `read_page` and `javascript_tool`.
- **`getComputedStyle` lies about anything transitioning.** Check the **specified** value (`el.getAttribute("style")`, or the class list) instead. Working code was deleted this session on the strength of a computed value that could never have updated.
- **Clicking may not move focus.** Dispatch `new FocusEvent("focusin", {bubbles:true})` — that is what React listens to.
- **A detached node keeps its last computed style.** If a state change unmounts what you are measuring, you read stale values forever. Re-query after every state change; never hold a reference across one.
- Truncating a `className` in debug output (`.slice(0, 90)`) will cut off the very class you are checking.

---

## 4. Product rules that are not negotiable

- **Sell improvement / insight / convenience / status — never outcomes.** Core debating stays free. Never sell ELO, Grounds Score or wins.
- **Never AI assist inside a ranked match.** The coach is post-match only, and this is now *enforced* (`409 in_progress`), not merely intended — it previously was not.
- **A rating a user already earned must never debut behind the Pro gate.**
- **Changing your mind counts for you, not against you.** Open Minds is a leaderboard, not a penalty.

---

## 5. Regression scripts (`scripts/`)

All take a live server on `:3001` and `NEXTAUTH_SECRET`; they mint **NextAuth JWEs** via `encode()` from `client/node_modules/next-auth/jwt` — a plain signed JWT is rejected. Each cleans up after itself.

| Script | Guards |
| --- | --- |
| `verify-authorization` | only the owner can edit a profile |
| `verify-private-room` | private-room membership on REST + socket paths |
| `verify-message-author` | messages never ship password/email (this leaked once) |
| `verify-pro-integrity` | Grounds Score faucet; deletion kills billing + sessions |
| `verify-billing` | webhook idempotency, ordering, paid-only grants, cancellation flag |
| `verify-leaderboards` | no tombstones on boards, no rank drift, no minted belief credit, search/directory exclusions |
| `verify-bot-exclusion` | bots stay off every board; coaching stays post-match |
| `verify-rapid-pairing` / `-race` | pairing on genuine disagreement; a round settles once |
| `verify-aftermath` | the belief loop closes and logs a changed mind |
| `verify-battle-curated` / `-abandon` | ranked matches carry their claim; abandoned ones end |
| `verify-analytics` | analytics aggregates, de-identified opponents |
| `verify-judge-shadow` | shadow vs rubric authority |
| `verify-puzzles` | puzzle answers stay unguessable by position |

**`verify-battle-abandon` takes ~2.5 min** — it waits for the real scheduled sweep. It used to be flaky; the cause was the test reading the sweep's intermediate `judging`/`closing` states as terminal, not a defect in the sweep.

**`verify-billing` needs `STRIPE_WEBHOOK_SECRET`** and a server booted with any `STRIPE_SECRET_KEY`. Signature verification is pure HMAC, so a fake key exercises the whole webhook offline; the script skips itself if the secret is absent.

---

## 6. What's left

1. **Wave 6 — tournaments/brackets.** Designed and adversarially critiqued, not built. The critique's conclusion: make brackets **unranked**, and sell the *hosting*, not the winning.
2. **Stripe has never been exercised end to end with a real card.** The webhook logic is now covered by `verify-billing` against signed payloads, but live keys reject test cards — validate in Stripe **test mode** or trust the tests plus `/admin/pro`.
3. **`RANKED_JUDGE` stays unset** in Railway, which means `shadow`: the model decides and the rubric is recorded beside it. Promote it only when `GET /api/admin/judge-shadow` has real volume, and judge by **`avgMarginWhenDisagreeing`** — disagreements clustered on near-ties are fine; disagreements on blowouts are not.
4. **The credential leak's aftermath is a product decision, not a code one.** Chat messages briefly shipped every author's bcrypt hash and email to everyone in the room. It is fixed and covered by `verify-message-author`, but whether it warrants a forced password reset and a privacy-policy notification has never been decided.
5. Smaller: custom-claim drafts all land in the `society` category because the form never asks; `/analytics` and `/beliefs` have only ever been audited in empty states.

---

## 7. Recent trail

`3225413` typing fade · `7c2db49` typing loses the box · `6bf681f` puzzle answers de-patterned · `566eac2` bots/tombstones unfindable · `af46a7f` bots off boards + coach guard + profile standings · `57559cd` seven leaderboards in Community · `bacab8c` caret + clipping · `d5621d8` typing practice · `4f93139` Battle Grounds home · `15fdf2d` Rapid home · `3092c96` judge shadow · `5a08429` the Tape · `d0196c3` abandonment sweep · `ac2bf88` ranked matches remember their claim.

Two things worth knowing about that trail:

- **Auditing paid.** Four instances of "authenticated but never checked ownership" were found and fixed, plus a socket bypass, plus the message credential leak, plus deleted accounts being publicly listed by their raw `deleted_<userId>` name on five surfaces, plus practice bots ranking on the public Grounds Score board.
- **Adversarial review produces confident falsehoods too.** Multi-agent sweeps found real defects that would not have surfaced otherwise — and also "confirmed" findings written against stale copies of a file, and one claiming bots would pollute a board via a mechanism that could not happen. Verify against the database or the running app, never against the claim.

## 8. Memory

Persistent notes live in `~/.claude/…/memory/` (indexed by `MEMORY.md`) and auto-load in the same environment. Most relevant: **grounds-pro-premium-tier**, **authorization-model**, **api-spend-model**, **rate-limiting**, **rapid-fire-pivot**, **grounds-for-debate-local-setup**.
