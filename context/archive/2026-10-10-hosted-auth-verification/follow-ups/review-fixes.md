# Implementation review follow-ups

## F1 — Complete hosted refresh evidence

- **Source**: ../reviews/impl-review.md, F1
- **Selected action**: Complete the evidence; owner confirmed this choice on 2026-10-11.
- **Status**: Complete, 2026-10-11.
- **Recorded owner observations**: The same 15-second trial waited until expiry plus at least
  30 seconds, produced a token with a later expiry, and retained dashboard access on a subsequent
  request. The owner then supplied local metadata showing both access and refresh fingerprints
  changed, and confirmed only a dashboard reload in the same session without reauthentication.
  The renewed token was issued 2801 seconds after the old token expired and had a 3600-second lifetime.
- **Remaining work**: None for F1. Earlier owner restoration and cleanup confirmations remain recorded.
- **Completion**: verification.md records only the timing and separate token-change booleans;
  F1's Decision is FIXED in the saved review.

## F2 — Identify the post-fix production deployment

- **Source**: ../reviews/impl-review.md, F2
- **Selected action**: Complete the evidence; owner confirmed this choice on 2026-10-11.
- **Status**: Complete, 2026-10-11.
- **Recorded evidence**: b8c6423/bf72462e/7176faa8 describes the initial successful deployment,
  before the HTTPS cookie fix. A local read-only Wrangler deployment-list attempt failed because
  Cloudflare authentication is unavailable in this workspace. The owner subsequently supplied
  successful build e53e5b96 and matching runtime/deployed version
  62cb28c8-fcdf-4479-8065-37671e1c6f5e. The supplied log confirms the pinned Node version,
  skipped automatic install, npm ci, every verify:deploy gate and successful production deployment.
  The owner then supplied source commit 17e7ae4. Available Git history identifies the merge on
  origin/master and confirms it includes the HTTPS cookie and disabled Astro-session fixes.
- **Remaining work**: None for F2. Remote inventory remains owner-attributed rather than independently
  inspected.
- **Completion**: verification.md associates the later hosted observations with the identified
  post-fix commit/build/version; F2's Decision is FIXED in the saved review.

## F3 — Complete SMTP limits and tracking observations

- **Source**: ../reviews/impl-review.md, F3
- **Selected action**: Complete the evidence; owner supplied provider observations on 2026-10-11.
- **Status**: Complete, 2026-10-11.
- **Recorded evidence**: Brevo permits 300 emails/day shared by Marketing & Transactional; 295/300
  remained (98%) at observation. The sender is replaced with a provider address on brevosend.com.
  A delivered confirmation link uses a sendibt3.com tracking wrapper. Neither the full sender address
  nor the wrapped link is copied into repository files, and the link was not opened during triage.
  The owner then supplied a hosted Rate Limits screenshot showing 30 emails/hour per project and
  confirmed that the tracking redirect correctly confirms the account and leads to PrintPlan.
- **Remaining work**: None for F3. No tracking setting change was needed for the reported behavior.
- **Documentation**: https://supabase.com/docs/guides/auth/rate-limits and
  https://supabase.com/docs/guides/auth/auth-smtp (current documentation fetched with Context7);
  https://help.brevo.com/hc/en-us/articles/209421325-Why-is-the-URL-of-my-links-different-from-what-I-have-chosen.
- **Completion**: verification.md records the attributed, sanitized outcomes; F3's Decision is FIXED
  in the saved review.

## F4 — Record browser and viewport details

- **Source**: ../reviews/impl-review.md, F4
- **Selected action**: Complete the evidence; owner supplied versions and explicitly accepted Brave
  instead of Chrome on 2026-10-11.
- **Status**: Complete, 2026-10-11.
- **Recorded evidence**: Brave 1.95.104 (official x86_64), Chromium 153.0.8010.53, Firefox 157.0.1
  (64-bit), and a 427 × 952 pixel narrow viewport. Fixture labels remain A/B; no physical phone model
  or separate Chrome run is claimed.
- **Remaining work**: None for F4.
- **Completion**: verification.md records the actual environments; the Phase 3 amendment and durable
  runbook reflect the accepted browser choice. F4's Decision is FIXED in the saved review.

## F5 — Format the three flagged documents

- **Source**: ../reviews/impl-review.md, F5
- **Selected action**: Apply the formatting fix; owner confirmed on 2026-10-11.
- **Status**: Complete, 2026-10-11.
- **Changes**: Prettier formatted verification.md, plan-brief.md and context/foundation/roadmap.md.
- **Verification**: Targeted `npx prettier --check` on those same three files passed with exit 0:
  “All matched files use Prettier code style!”
- **Remaining work**: None for F5.
- **Completion**: F5's Decision is FIXED in the saved review.

## F6 — Document the accepted runtime scope

- **Source**: ../reviews/impl-review.md, F6
- **Selected action**: Add the scope/rationale/validation record; owner confirmed on 2026-10-11.
- **Status**: Complete, 2026-10-11.
- **Changes**: Phase 1's accepted scope addendum describes HTTPS Secure-cookie wiring in
  src/lib/supabase.ts and src/middleware.ts and disabling unused Astro sessions in astro.config.mjs.
  It names the landing commits, explains the reasons and references passing local/remote gates,
  the local smoke, and owner-attributed hosted cookie and binding observations.
- **Remaining work**: None for F6. The addendum is explicitly retrospective; no runtime code or
  Progress entries are changed during triage.
- **Completion**: F6's Decision is FIXED in the saved review.

## F7 — Reconcile the short-expiry instructions

- **Source**: ../reviews/impl-review.md, F7
- **Selected action**: Update the guide and brief; owner confirmed on 2026-10-11.
- **Status**: Complete, 2026-10-11.
- **Changes**: The durable guide and brief now use the recorded selected short lifetime; 300 seconds
  is an example. Fresh-token metadata must match the chosen lifetime. Waiting beyond actual expiry
  plus 30 seconds and mandatory restoration to 3600 seconds are preserved. The full plan's wait
  estimate also reflects the selected lifetime.
- **Verification**: Final targeted Prettier checking of the guide, brief, full plan, verification record
  and roadmap passed with exit 0: “All matched files use Prettier code style!”
- **Remaining work**: None for F7.
- **Completion**: F7's Decision is FIXED; all seven review findings are resolved and the saved review
  verdict is APPROVED.
