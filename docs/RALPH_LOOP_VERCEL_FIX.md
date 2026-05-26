# Ralph Loop: Fix Vercel 404 on hypechain.vercel.app

## Context

`https://hypechain.vercel.app/` (the production URL auto-aliased to the GitHub-linked `hypechain` Vercel project) returns **HTTP 404 `x-vercel-error: NOT_FOUND`** even though the project deployed successfully after our latest push to `main`. The previous version of this doc targeted `hype-chain-neon.vercel.app`, which is currently still 200 because it was manually aliased to a 170-day-old working production deployment — that's a workaround, not a fix.

Root cause is now isolated and confirmed: the Vercel project's **Root Directory is set to `.`** (the repo root) instead of `frontend/`. The Next.js app lives under `frontend/`, so Vercel's build runs in the empty repo root, finds no `package.json`, finishes in 0ms, and ships a deployment with no routes.

This doc gives you a self-contained `/ralph-loop:ralph-loop` invocation that drives the project settings into a state where `git push origin main` results in a real Next.js build and `hypechain.vercel.app` returns 200.

Ralph fits because the success condition is a single deterministic check: `curl` the URL, expect 200, expect `HypeChain` in the HTML.

---

## Diagnostic Priors (already verified)

These are baked into the prompt so ralph doesn't waste iterations rediscovering them:

1. **Vercel project Root Directory is `.`, not `frontend`.** Confirmed via `vercel project inspect hypechain`:
   ```
   Root Directory          .
   Framework Preset        Other
   Build Command           `npm run vercel-build` or `npm run build`
   Output Directory        `public` if it exists, or `.`
   Install Command         `yarn install`, `pnpm install`, `npm install`, or `bun install`
   ```
   Framework Preset is `Other` (it should be `Next.js`). With Root Directory `.`, Vercel's build cd's to the repo root and finds no Next.js app there.

2. **Latest production deployment is empty.** `vercel inspect https://hypechain-azu1o7ajm-aarons-projects-7e5720b8.vercel.app` shows `Builds: . [0ms]` — the build step did literally nothing. Status is "Ready" but the deployment contains no routes.

3. **The 3 fix commits are already merged to `main`** (PR #7, rebased). On the remote `main`:
   ```
   74857853 fix(frontend): defer Supabase init for build-time safety
   9dff6491 fix(frontend): tighten Next.js 16 build config
   9ca06882 chore(frontend): migrate package manager pnpm → bun
   ```
   These commits are correct; the build never runs them, so they don't help yet.

4. **`.vercel/project.json` lives at the repo root**, not in `frontend/`. Linked project: `prj_XhGBka5UqfP9VdZDBXGhLRGFWd1m` (`hypechain`). If you re-link from inside `frontend/`, the repo-root `.vercel/` should be removed (only AFTER `frontend/.vercel/` exists).

5. **`hype-chain-neon.vercel.app` still 200**, because it's a manual alias I set earlier pointing at a 170-day-old production deployment. Don't be misled — it doesn't reflect the current main.

6. **Vercel CLI is authenticated** as `aaronlin098-1452`. No login needed.

7. **No `vercel.json` at the repo root** (verified — only `frontend/vercel.json` exists). So nothing at the root is overriding the project's framework detection.

---

## Run This Command

Paste exactly:

```
/ralph-loop:ralph-loop "$(cat docs/RALPH_LOOP_VERCEL_FIX.md | sed -n '/^## Prompt Body$/,/^## End Prompt Body$/p' | sed '1d;$d')" --max-iterations 15 --completion-promise "DEPLOYMENT_FIXED"
```

Or copy the **Prompt Body** section below directly into the `/ralph-loop:ralph-loop "..."` argument.

---

## Prompt Body

You are working in the HypeChain monorepo. The Next.js frontend at `frontend/` was merged to `main` (PR #7 rebased, commits 9ca06882 → 9dff6491 → 74857853 land on top of 5d1962be). The GitHub-linked Vercel project auto-deployed but produced an empty deployment, so `https://hypechain.vercel.app/` returns **404 NOT_FOUND**. Drive the deployment back to a working state by fixing Vercel project settings so the build actually runs against `frontend/`.

### Success Criteria (Completion Promise)

Output the literal string `<promise>DEPLOYMENT_FIXED</promise>` ONLY when ALL of these are true on the same iteration:

1. `curl -s -o /dev/null -w "%{http_code}" https://hypechain.vercel.app/` prints `200`
2. `curl -s https://hypechain.vercel.app/ | grep -q HypeChain` exits with code `0`
3. `vercel inspect $(vercel ls hypechain --prod 2>&1 | awk '/Ready/{print $2; exit}')` shows the most recent build's duration is **non-zero** (i.e. there was an actual build, not a 0ms placeholder)

Verify all three at the end of every iteration. If any fail, do not emit the promise — continue iterating.

### Step 0: Auth Guard (run FIRST every iteration)

Run `vercel whoami`. If it errors with credentials-not-found, output exactly:

```
BLOCKED: run 'vercel login' then resume
```

Stop the current iteration immediately. Do NOT output `<promise>DEPLOYMENT_FIXED</promise>` — this is a planned halt, not completion.

### Diagnostic Priors

Treat these as established facts; do not re-investigate from scratch:

- Vercel project `hypechain` has **Root Directory `.`** and **Framework Preset `Other`**. The bug. Confirmed via `vercel project inspect hypechain`.
- The latest production deployment had build duration `[0ms]`. The build step ran nothing because Root Directory is wrong.
- The 3 fix commits (`9ca06882`, `9dff6491`, `74857853`) are already on `main`. They're correct; they just never get built.
- `.vercel/project.json` is at the repo root pointing at `prj_XhGBka5UqfP9VdZDBXGhLRGFWd1m`. The local link is fine but the linked project's settings are wrong.
- No root-level `vercel.json`. Only `frontend/vercel.json` exists.
- `hype-chain-neon.vercel.app` is manually aliased to a 170-day-old deployment — ignore it for verification, the canonical target is `hypechain.vercel.app`.

### Iteration Playbook (in order)

**1. Fix Root Directory + Framework Preset.**

Try in this order, stop at the first that succeeds:

a. **CLI re-link from `frontend/`** — usually the cleanest:
   ```bash
   cd frontend
   vercel link --yes --project hypechain
   # Vercel may prompt for confirmation; --yes auto-accepts
   cd ..
   # If the relink succeeded, frontend/.vercel/project.json now exists.
   # Then remove the stale root link:
   [ -d frontend/.vercel ] && rm -rf .vercel
   ```

b. **REST API patch** — if (a) doesn't change the project's Root Directory setting:
   ```bash
   TEAM_ID=team_T3GoOwqEDAms8fAkscDzCl0i
   PROJECT_ID=prj_XhGBka5UqfP9VdZDBXGhLRGFWd1m
   # Get a token from `cat ~/.local/share/com.vercel.cli/auth.json` or env VERCEL_TOKEN
   curl -X PATCH "https://api.vercel.com/v9/projects/$PROJECT_ID?teamId=$TEAM_ID" \
     -H "Authorization: Bearer $VERCEL_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"rootDirectory":"frontend","framework":"nextjs"}'
   ```

c. **Dashboard fallback** — if (a) and (b) both fail, output exactly:
   ```
   BLOCKED: open https://vercel.com/aarons-projects-7e5720b8/hypechain/settings — set Root Directory to "frontend" and Framework Preset to "Next.js", then continue the loop
   ```
   Stop the iteration. This is a planned halt, NOT a completion promise.

Verify success: `vercel project inspect hypechain | grep -E "Root Directory|Framework Preset"` should now show `Root Directory: frontend` and `Framework Preset: Next.js`.

**2. Validate environment variables on the production target.**
   - `vercel env pull frontend/.env.vercel.production --environment=production`
   - Confirm these keys exist and are non-empty: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `HACKNYU_SUPABASE_URL`, `HACKNYU_SUPABASE_ANON_KEY`.
   - Any missing → `vercel env add <NAME> production` and prompt the user via output (do NOT invent values).

**3. Local build sanity (only if Step 1 succeeded).**
   - `cd frontend && bun install && bun run build`. If it fails locally, fix the surfaced error before redeploying — no point pushing broken code.

**4. Trigger a fresh production deployment.**
   - `cd frontend && vercel --prod --yes`. This forces a redeploy using the now-correct project settings.
   - Capture the deployment URL from the output.

**5. Read build logs.**
   - `vercel inspect <new-deployment-url> --logs` and read the last 100 lines. Surface any compile/runtime error verbatim into your reasoning for the next iteration. Critically: confirm the build duration is now > 0ms (look at `Builds:` section).

**6. Verify (success criteria above).** Run all three checks. Only emit the completion promise if all pass.

### Hard Constraints

- Do NOT modify anything outside `frontend/` and `.vercel/`. Specifically: leave `backend/`, `contracts/`, `migrations/`, `hacknyu-app/`, and `docs/` (except for the findings file below) untouched.
- Do NOT delete `.vercel/` at the repo root unless `frontend/.vercel/` already exists.
- Do NOT push directly to `main` from this loop. The 3 fix commits are already on `main`; do not commit further code unless step 3 surfaces a bug.
- Do NOT remove the manual `hype-chain-neon.vercel.app` alias — it's a safety net for the demo. Once `hypechain.vercel.app` is working, the loop is done; the alias can be retargeted in a separate step if desired.
- Do NOT fabricate environment variable values. If a value is unknown, halt and ask via output.
- Do NOT emit the completion promise if any verification check fails.

### Stuck Behavior (after 10 iterations without success)

On iteration 10, write `docs/RALPH_LOOP_VERCEL_FIX_FINDINGS.md` (overwrite previous) containing:

1. Everything that was tried, chronologically.
2. The exact last Vercel build error (verbatim) — or, if Step 1 never succeeded, the response from the API patch / dashboard fallback.
3. Three concrete manual next steps the user could take.

Then continue iterating up to the `--max-iterations 15` cap. Do NOT emit `<promise>DEPLOYMENT_FIXED</promise>` unless all checks actually pass.

## End Prompt Body

---

## After the Loop Finishes

Verify manually:

```bash
# 1. Status code
curl -s -o /dev/null -w "%{http_code}\n" https://hypechain.vercel.app/
# expect: 200

# 2. Content sanity
curl -s https://hypechain.vercel.app/ | grep -q HypeChain && echo OK
# expect: OK

# 3. Build duration is non-zero (real build ran)
vercel inspect $(vercel ls hypechain --prod 2>&1 | awk '/Ready/{print $2; exit}') | grep -A2 "Builds"
# expect: a positive duration, NOT [0ms]

# 4. Project settings stick
vercel project inspect hypechain | grep -E "Root Directory|Framework Preset"
# expect: frontend, Next.js

# 5. Marketplace route
curl -s -o /dev/null -w "%{http_code}\n" https://hypechain.vercel.app/marketplace
# expect: 200

# 6. API route (JSON, not 404)
curl -s https://hypechain.vercel.app/api/listings | head -c 200
# expect: JSON starting with {"success":...
```

If `docs/RALPH_LOOP_VERCEL_FIX_FINDINGS.md` was created, read it for what's blocking.

## Out of Scope (Intentionally Not Touched by This Loop)

- `frontend/components/ui/button.tsx` — `outline` variant referenced in pages but not defined
- `frontend/app/listings/page.tsx` — uses `listing.name`/`listing.image` against `NFTListing` type
- `frontend/hooks/useWebSocket.ts` — calls `WebSocketService.getInstance()` (no such method)
- `frontend/__tests__/nft-card.test.tsx` — asserts `'SOL'` against `'USDC'` rendering
- `hacknyu-app/` — unused boilerplate
- Retargeting `hype-chain-neon.vercel.app` to the new deployment (do separately once the canonical URL works)
