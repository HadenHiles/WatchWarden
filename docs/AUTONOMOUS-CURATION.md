# Autonomous FamFlix Curation

## Goal

Replace static shelves and a per-title approval inbox with an automatically
maintained streaming catalogue: current regional picks, stable favourites,
controlled discovery, and storage usage that stays within an agreed budget.
Exact replication of personalized streaming-provider home screens is not promised.

## Ownership

- WatchWarden owns trend ingestion, source provenance, ranking, shelf publication,
  acquisition planning, and the optional visual preview/configuration console.
- FamFlix Ops owns conversation, preference interpretation, explanations,
  exceptions, approvals, and operational health reporting through a typed API.
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

## Delivery Steps

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

## Initial Ops Connection

Deploy the tested WatchWarden API and worker together only after backup, active-job
inspection, and rollback preparation. The API endpoint is GET
`/plex/curation-status` and returns `{ success: true, data: { version: 1, ... } }`.
The existing API_SECRET bearer authentication applies. It is an administrative
credential, not a server-enforced read-only token; adding a dedicated read-only
credential is a prerequisite before enabling this connection in production.

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