# Autonomous FamFlix Curation

## Goal

Replace static shelves and a per-title approval inbox with an automatically
maintained streaming catalogue: current regional picks, stable favourites,
controlled discovery, and storage usage that stays within an agreed budget.
Exact replication of personalized streaming-provider home screens is not promised.

## Ownership

- WatchWarden must be useful independently of FamFlix Ops, OpenAI and Discord.
  Core policy, scheduling, evidence, preview, review persistence and owner decisions
  belong in WatchWarden. Its local UI must provide the same essential decisions;
  the fuller review UI remains a planned feature, not already implemented.
- WatchWarden owns trend ingestion, source provenance, ranking, shelf publication,
  acquisition planning, and the optional visual preview/configuration console.
- FamFlix Ops owns conversation, preference interpretation, explanations,
  exceptions, approvals, and operational health reporting through a typed API.
  This is an optional interface for this owner's stack, not a mandatory backend
  or dependency. Without Ops, ambiguous cases stay visible in WatchWarden's local
  review records and must not become silent automatic deletions.
- Reclaimerr remains the retention/deletion authority. WatchWarden must not run a
  competing deletion policy. No AI output overrides hard protections.
- Plex owns its client experience and global home layout. Never adopt or change
  untracked collections or unrelated hubs automatically.

## Product Rules

- Separate feature, acquire, and retire decisions. Leaving a shelf is not consent
  to delete media. Preserve explicit requests, favourites, and active viewing.
- Approve a bounded acquisition policy rather than every ordinary suggestion.
  Until that policy is explicitly configured, existing approval rules remain.
- Label official Canadian charts separately from global popularity filtered by
  Canadian platform availability. Every ranking records source and freshness.
- Publish only verified local titles. Preserve existing shelves on unavailable,
  stale, partial, or ambiguous source data; expose degraded health instead.
- Reconcile both membership and ranked order, and read back the result. Unchanged
  desired shelves should not be rewritten. A job that cannot verify must fail.
- Use minimum featured residency, displacement thresholds, cooldowns, and distinct
  discovery lanes. Do not shuffle chart ranks merely to manufacture movement.
- Count queued acquisitions against storage and download budgets; reconcile actual
  imported size. Reserve free space and bound movie quality and TV season scope.
- Retirement considers shelf exposure, viewing recency/progress/completion,
  sustained demand, explicit requests/protection, storage pressure, and reacquisition
  cost. Missing activity is unknown, not proof nobody wants a title.
- Keep shared rows concise. Do not recreate the retired FamFlix Requests rows.
- User-requested media outranks speculative WatchWarden acquisitions by lowering
  ONLY positively identified WatchWarden download jobs. Never promote, demote,
  resume, force-start, or otherwise rewrite user or unidentified job priorities.

## WatchWarden-Only Download Demotion

The optional `download-priority` job runs every minute when explicitly enabled.
It uses a dedicated Jellyseerr requester ID, a complete request inventory, and
complete Radarr/Sonarr queues to resolve exact download IDs. A non-declined human
request, missing requester identity, shared/ambiguous download, or mismatched
download-client name prevents WatchWarden ownership. No title-name matching is used.

- SABnzbd: set verified WatchWarden jobs from Normal/High to Low (`-1`). Already
  low, paused, forced, and unknown states are untouched. No queue-wide sort.
- qBittorrent: move verified incomplete WatchWarden jobs behind other eligible
  downloads using `bottomPrio`. Do not write other hashes, force-start/resume,
  change bandwidth limits, or enable queueing. If queueing is disabled, report
  that ordering is ineffective rather than changing the client's settings.
- Other jobs naturally shift ordinal position when a WatchWarden torrent moves
  behind them; no priority command targets those jobs.
- Observe mode proposes counts without priority writes. Apply mode rereads
  ownership and queues before bounded writes, then verifies demotions. Failed or
  ambiguous execution is reported as failed, never as an automatic success/retry.
- The worker is disabled by default. Configuration is listed in `.env.example`.
  Both Arr inventories are mandatory. Configured client names must match the
  corresponding names in Arr; only configured clients can receive writes.

Activation sequence: back up database/configuration and retain rollback images;
inspect the old acquisition/cleanup settings; verify a dedicated requester account
and exact client names; enable observe mode and review real identity matches;
then explicitly switch `DOWNLOAD_PRIORITY_MODE=apply`. No live queue changes have
been performed by this implementation. The one-minute schedule is polling, not an
instantaneous Jellyseerr approval webhook. Queue priority is not a guaranteed
bandwidth reservation and cannot manufacture missing download sources.

## Delivery Steps

### Managed Catalogue Budget And Retention

- The effective default `catalogue.storage.maxStorageBytes` is **1 TB decimal**
  (1,000,000,000,000 bytes), configurable through authenticated settings. This is
  an acquisition budget, not a filesystem quota or measured free-space claim.
- Count all WatchWarden-owned retained titles, even after they leave the shelves,
  plus pending reservations. Human requests are not speculative WatchWarden media.
  Protected titles can exceed the target; stop acquisitions rather than delete
  protected media to force the number back under the budget.
- Both WatchWarden submission paths reserve capacity under a PostgreSQL
  transaction-level advisory lock before requesting media. Unknown/partial/stale
  accounting or missing movie/show reservation sizes blocks acquisition. Automatic
  deferral does not stop shelf refresh. Reservations never expire/release on a
  blind timeout because a remote request may still be executing.
- `catalogue.storageEvidence`, `catalogue.reservations`, and
  `catalogue.retentionReview` are worker-owned and cannot be overwritten by ordinary
  settings saves. No production settings or accounting have been written yet.
- The footprint collector and actual import/reservation reconciliation are not
  implemented yet. Until complete, acquisitions fail closed. Do not seed an empty
  snapshot merely to make admission succeed. Movie/show reservation sizes start
  unset, not guessed; future TV reservations must cover the selected season scope.
- Rotation cleanup now records a bounded non-destructive review instead of
  calling Jellyseerr media deletion, regardless of the old deleteUnwatched flag.
  Reclaimerr remains independent; its native rules/protections were not changed.
- Retention policy keeps explicit requests, pins/permanent titles, active viewing,
  viewing in progress, linked-account Watchlist titles, recent playback, featured
  titles, and sustained demand. Missing source coverage is unknown, not absence.
  The current worker only has pins/retention dates and recorded recent playback;
  unimplemented live/requester/Watchlist/progress evidence stays unknown.
- Complete evidence with uncertain demand becomes an owner decision. Missing
  evidence is an Ops investigation first, not an owner coin toss. Even an eligible
  retirement candidate is not deletion authority. The read-only status endpoint
  exposes reasons to Ops; proactive Discord decision-card delivery is still pending.

Implementation and activation checklist:

- [x] Add configurable 1 TB effective maximum and serialized admission reservations.
- [x] Add deterministic keep/review/retirement decisions and non-destructive reviews.
- [x] Expose bounded budget/protection evidence through the scoped Ops read tool.
- [ ] Collect full owned-media byte accounting, including retained/imported media,
  pending downloads, and ownership changes after human requests.
- [ ] Reconcile reservation/import outcomes durably without replaying uncertain requests.
- [ ] Verify active/progress history and linked-user Watchlist coverage per title.
- [ ] Connect complete protection decisions to Reclaimerr without weakening native rules.
- [ ] Deliver deduplicated owner decision cards only after Ops resolves evidence gaps.

### UX Direction

Revise the existing dashboard around the daily operating experience, not a large
suggestion inbox. Keep the visual console; let Discord handle exceptions.

1. **Home Preview:** the first few movie/TV shelves, with actual posters/order,
   source provenance, last verified refresh, and pending additions/removals.
2. **Storage:** used/reserved/headroom against the configurable 1 TB budget,
   protected retained bytes, accounting freshness, and acquisition blockers.
3. **Protected:** favourites, requests, Watchlists and in-progress viewing, each
   with its reason and evidence freshness. Leaving a shelf is not leaving Plex.
4. **Needs Your Decision:** only evidence-complete tradeoffs with a recommended
   keep/retire action, storage impact, and concise reasoning. Missing telemetry
   belongs in health/investigation, not this queue.

Keep acquisition count/byte limits and minimum shelf residency visible in policy
settings; remove the obsolete immediate-deletion controls during the UI update.
Do not redesign the dashboard before byte accounting and protection sources can
support truthful states. The UX redesign has not been implemented in this slice.

### 1. Verified shelf reconciliation (in progress)

- [ ] Inspect sanitized runtime job outcomes/settings and owned Plex collections.
- [x] Reconcile ranked order as well as additions/removals; test unchanged members
  with changed rank, creation, empty targets, retries, and failed verification.
- [x] Confirm per-shelf failure propagates to job status; preserve that behavior.
- [ ] Check scheduling, stale running jobs, and concurrent runs with isolated tests.
- [ ] Audit source completeness/freshness before publication and acquisition.
- [ ] After backup and deployment approval, verify an unattended scheduled update
  and actual movie/TV ordering on the household's Plex clients.

### 2. Trustworthy sources and stable rotation

- Source selection and cadence decisions are tracked in
  [chart sources and refresh reliability](CHART-SOURCES.md).
- [ ] Validate Canadian chart coverage and harden ambiguous title matching.
- [ ] Track source failures without turning them into empty successful snapshots.
- [ ] Separate chart shelves, platform discovery, and rotating Fresh Picks.
- [ ] Persist residency, exposure, displacement thresholds, and reacquisition cooldown.
- [ ] Preview which owned rows to promote and which redundant Plex rows to demote;
  apply presentation changes only with owner approval.

### 3. Bounded automatic acquisition

- [ ] Agree on genres/exclusions, quality, weekly additions, bytes, free-space
  reserve, and TV episode/season scope. Start with movies.
- [ ] Add durable reservations, canonical identity, idempotency, and import verification.
- [ ] Support unattended in-policy requests and a concise exception/digest workflow.
- [ ] Test unavailable providers, oversized imports, pending requests, restarts,
  and budget exhaustion without creating live requests.

### 4. Demand-aware retention

- [ ] Inventory enabled WatchWarden cleanup/export behavior and native Reclaimerr
  policies. Back up configuration before an approved cutover.
- [ ] Disable competing WatchWarden deletion before enabling autonomous acquisitions.
- [ ] Design one retention policy with active-playback, progress, favourites,
  requester, minimum-availability, and incomplete-telemetry protections.
- [ ] Run retirement recommendations in shadow mode; no live deletion tests.
- [ ] Agree on revised automatic-retention authority explicitly before activation.

### 5. FamFlix Ops integration

- [x] Add an initial authenticated recorded-status endpoint and opt-in Ops read
  tool. Unknown source freshness and lack of live Plex verification are explicit.
- [x] Add a dedicated server-enforced read-only curation token and synthetic HTTP
  tests denying all other reads/writes. Project observed/applied demotion results.
- [ ] Add an authenticated, versioned, bounded read-only curation-status endpoint:
  last attempt/success, source freshness, desired/verified shelves, differences,
  selection reasons, policy state, and budget usage. Exclude secrets/private paths.
- [ ] Add an Ops read tool for questions such as "Why is this featured?" and
  "Are the Netflix shelves actually updating?" with unavailable/stale states.
- [ ] Add typed preview/preference actions with audit and existing Ops approvals;
  do not accept arbitrary AI-generated API calls or shell commands.
- [ ] Use OpenAI for preference interpretation and evidence-backed editorial
  judgement, not fabricated charts, identity matching, or safety enforcement.
- [ ] Ensure unattended curation continues without Ops or OpenAI availability.

## Release Gates

Each slice needs focused regression tests and type checking. Integration tests use
synthetic services, not live acquisition/deletion. Before runtime changes, back up
the database/configuration, retain a rollback image, inspect active work, and limit
recreation to affected WatchWarden services. No automatic push or production
deployment is implied by a source commit.

Success means unattended verified shelf changes, accurate degraded health, useful
featured-title viewing, bounded bytes/churn, and no loss of protected content.
Measure these over scheduled cycles rather than treating a passing unit test or a
single manually triggered sync as end-to-end acceptance.

## Implementation Record

### 2026-10-29

- Read-only baseline: 31 scoring tests and 8 source-adapter tests passed.
- Confirmed collection publication diffs membership but does not apply ranked order
  or verify membership after writes. This is a local defect, not yet a complete
  diagnosis of the reported unattended-refresh failure.
- Found optional rotation cleanup that deletes bot-requested out-of-rotation media.
  Its live enabled state is unknown; no runtime policies have been changed.
- Implemented custom Plex order, exact membership/order read-back, incomplete-read
  rejection, and no order rewrite when the collection already matches. Newly
  created collection IDs are persisted before subsequent writes so normal failed
  sync retries retain ownership. A crash between remote creation and persistence
  remains an unresolved cross-system transaction window.
- Shelf lastSyncAt now advances only after recommendation publication succeeds.
  The existing per-shelf error aggregation already fails the overall job.
- Added GET /plex/curation-status, authenticated by the existing Plex router.
  The v1 payload projects recorded job attempts/successes and at most 100 shelf
  records. It deliberately does not claim live visibility, verified source
  freshness, desired/current differences, or budget accounting yet.
- Added the disabled-by-default watchwarden_status read tool in FamFlix Ops.
  It accepts no model-supplied path/method, uses only the status GET, caps the
  response at 256 KiB, and drops non-contract fields from model evidence.
- Verification: 62 WatchWarden tests passed (31 scoring, 28 integrations, 3 API).
  Integration/dependency builds and API/worker type checks passed. Ops: 284 tests
  passed, 5 opt-in tests skipped. No production service/configuration changed,
  no acquisition/deletion performed, and no TV-client or scheduled-cycle acceptance
  claimed. Turbo emitted certificate/cache warnings but completed successfully.

### 2026-10-29 Follow-Up

- Added requester-based ownership preservation to both submission paths. Existing
  human requests are not converted into WatchWarden-owned records. Existing stored
  records are not bulk rewritten; the demotion worker uses fresh Jellyseerr evidence.
- Implemented the disabled-by-default demotion worker described above, bounded
  request/Arr/client inventories, synthetic protocol tests, and recorded mode/results
  in the read-only status contract. No requests were submitted during testing.
- Added the endpoint-scoped `CURATION_READ_TOKEN`. This credential cannot invoke
  job triggers, settings, media actions, or unrelated reads, even if accidentally
  configured with the same value as the admin token. Use a distinct random value.
- Read-only local Docker inspection found API, worker, web, and PostgreSQL stopped
  for nine days. No running worker means no scheduled updates on this engine.
  Why they stopped, saved policies, other deployment locations, source health, and
  actual Plex-client presentation remain unverified. Containers were not restarted
  because old enabled automation could acquire/delete media on startup.
- Verification: 88 WatchWarden tests passed (31 scoring, 52 integrations, 5 API);
  API/worker dependency builds passed. Ops: 285 passed, 5 opt-in skips. The corrected
  SAB position-response contract also passed the 24 focused priority/ownership
  tests. No runtime configuration, other-title priority, acquisition, or deletion
  changes were made.

### 2026-10-29 Catalogue Policy Foundation

- Pushed the earlier WatchWarden and Ops commits at the owner's request.
- Implemented the budget/retention foundation and release gates documented above.
  No live accounting, Watchlist coverage, automated owner notices, or production
  configuration is claimed. The runtime services remain stopped pending rollout.
- Verification: 105 WatchWarden tests passed (44 scoring, 52 integrations, 9 API),
  API/worker builds and final request-path type checks passed. Reservation tests use
  a serialized transaction double, not a live PostgreSQL concurrency acceptance.
  Ops: 286 tests passed, five opt-in tests skipped. No media or priorities changed.

### 2026-10-29 Standalone Refresh And Source Review

- Clarified that Ops is optional; core decisions/status belong in WatchWarden.
- Reproduced and fixed a ranking bug that selected an old rank 1 instead of a
  newer rank 12. Preserved CA/US preference while selecting the latest rank.
- Found saved UI cron values were never read by the worker. They now load at
  startup, with explicit failure for invalid schedules instead of silent omission.
- Verified source roles against public documentation and documented the remaining
  batch, publication-date and per-shelf freshness gates. TVDB is not a current
  ranking feed. TMDB global trends are not Canadian viewing ranks.
- Hardened Netflix chart completeness/identity and aggregate source error reporting.
  Source adapters retain explicit unknown publication times, not fabricated dates.
- Verification: 114 WatchWarden tests passed (45 scoring, 57 integrations, 12 API),
  API/worker builds and final worker type check passed. A synthetic two-cycle Plex
  reconciliation test updates and verifies membership/order with no Ops dependency.
  No production services, collections, download priorities or media were changed.

## Initial Ops Connection

Deploy the tested WatchWarden API and worker together only after backup, active-job
inspection, and rollback preparation. The API endpoint is GET
`/plex/curation-status` and returns `{ success: true, data: { version: 1, ... } }`.
Configure a distinct random `CURATION_READ_TOKEN` (at least 32 characters) in the
WatchWarden API and mount the same value as the Ops secret named below. It permits
only this exact GET. Do not use the administrative API_SECRET for Ops. Credential
provisioning and private runtime connectivity still need deployment verification.

Ops configuration is opt-in and references a mounted secret, never a literal key:

```json
{
  "watchwarden": {
    "enabled": true,
    "baseUrl": "http://watchwarden-api:4000",
    "secret": "watchwarden_api_key"
  }
}
```

The example URL is illustrative: verify private reachability from the Ops worker,
use protected transport across hosts, and mount the credential through the existing
Ops secrets mechanism. Do not expose a public endpoint for convenience. Leave the
feature absent/disabled until the API version, credential scope, and runtime path
are verified. The current reader reports recorded outcomes, not an authoritative
"healthy" state; it must not infer trend freshness from an empty successful run.