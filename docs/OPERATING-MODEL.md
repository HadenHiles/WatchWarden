# Operating Model

## Start And Resume

From the WatchWarden repository:

```sh
docker compose up -d --wait
```

This starts PostgreSQL, API, worker and web together. The API runs database
migrations before becoming healthy; the worker waits for the healthy API.
All four services use `restart: always` to recover when the Docker daemon starts.
No NAS reboot was induced during verification. The database and exports persist
in named volumes. Never use `docker compose down -v` to restart the application.

Fresh installs use a Compose-managed network. An existing reverse-proxy/media
network is optional via WATCHWARDEN_MEDIA_NETWORK and
WATCHWARDEN_MEDIA_NETWORK_EXTERNAL. The existing installation keeps its shared
network, but a second pre-created WatchWarden LAN network is no longer required.

Production browser sessions require HTTPS. The LAN HTTP login redirects to the
configured NEXTAUTH_URL; do not disable Secure cookies to work around an HTTP
login loop. Existing admin credentials and Cloudflare Access remain unchanged.

## Home Shelves

The deployed definitions are deliberately short and library-specific:

| Row | Library | Maximum | Latest verified membership |
| --- | --- | --- | --- |
| Top 10 Movies | Movies | 10 | 10 |
| Top 10 Shows | TV | 10 | 10 |
| New Releases | Movies | 20 | 20 |
| Netflix Picks | TV | 20 | 8 |
| Prime Video Picks | TV | 20 | 6 |
| Apple TV Picks | TV | 20 | 15 |

These are curated locally available selections, not a claim to replicate every
personalized streaming-platform row. Empty rows are not padded with unrelated
titles. Names contain no dash separators. The old 13 definitions were backed up;
their previously registered Plex IDs were already absent. No media was deleted.

Provider discovery uses complete committed batches. Country-specific provider
IDs matter: Prime is TMDB 119 in Canada and 9 in the US. Partial Netflix identity
resolution is recorded explicitly; only verified matches are used, never a guessed
first search result. Missing identities are not fictitious completed chart coverage.

Whole-library Plex genre counts apply a modest discovery boost, normally up to
15 percent and always capped at 20 percent. It does not alter official chart
ranks, human request priority, download queue settings or hard exclusions. Missing
genre evidence is neutral.

### Plex Home Presentation

Settings separates inline Library cards from Library Recommended rows and Home
publication. The operator selected `plexHome.hideCollectionCards=true` and
`plexHome.publishToLibrary=true`: hide only WatchWarden's inline collection cards,
while retaining the owned rows on Library Recommended and owner/shared Home.
The explicit Collections tab remains available. Users need the corresponding
libraries pinned; cross-library Home grouping follows each user's pinned order.

Only registered WatchWarden collections receive collection-mode changes. Movies
and TV retain their existing global collection mode and native recommendation
visibility. Routine sync no longer suppresses built-in Plex rows, even if an old
manageRecommendations setting exists. Collection mode is written with PUT to
`/library/collections/{id}/prefs` and verified using metadata with
`includePreferences=1`; GET on the preference endpoint is unsupported.

Within each library, Recently Added leads, followed by WatchWarden's ranked rows,
then existing native discovery rows. Preserve unknown rows and their flags.
To reapply this arrangement explicitly from the repository, with running services:

```sh
docker exec -i -w /app/apps/api watchwarden-api node --input-type=module < scripts/order-plex-home.mjs
```

The script backs up each original row list in the protected exports volume and
verifies both order and unchanged visibility. It does not change media membership,
recommendation flags or global library settings.

Presentation regression gate: 136 tests passed (50 scoring, 73 integration,
13 API), including live-shaped preferences, independent promotion, idempotence
and missing-mode rejection. Existing release safety gates remain unchanged.

Live verification on 2026-10-31: the browser-triggered acquisition-free refresh
completed after deployment. All six collections read back mode 0 with all three
managed-hub promotion flags enabled and their existing membership counts intact.
Row order survived sync; both global library modes remain 2. The owner confirmed
Recently Released Movies should remain disabled to avoid a similar second release
row. Every other native visibility flag matches the original presentation backup.
The Plex browser showed all six Home rows and populated Movies/TV Library grids
without the WatchWarden inline cards. Family TV-client caching remains unverified.

## Core Routine Jobs

| Job | Purpose | Default/saved behavior |
| --- | --- | --- |
| trend-sync | Fetch, enrich and commit source batches | Every six hours |
| plex-library-sync | Read current library identities and genre balance | Twice hourly |
| plex-sync | Verify owned collection membership, order and publication | Twice hourly |
| tautulli-sync | Observe household viewing, not the bot requester | Every two hours |
| catalogue-observe | Measure managed Plex parts and reconcile reservations | Every 15 minutes |
| jellyseerr-status-sync | Reconcile existing request status | Hourly |
| library-sync | Reconcile the complete Seerr inventory | Every three hours |
| radarr-sync | Read current movie quality metadata | Twice hourly |
| rotation-cleanup | Record non-destructive retention reviews | Daily |
| scoring/lifecycle-eval | Maintain legacy title/suggestion evidence | Saved schedules |
| curation-refresh | Manual complete evidence/publish pass | Not an extra cron |
| export/discover-slider publishing | Legacy integration paths | Disabled unless explicitly enabled |
| download-priority | Demote only verified WatchWarden jobs | Disabled until observe/apply is configured |

UI-saved schedules load at worker startup and need a worker restart after editing.
Invalid schedules fail visibly rather than silently dropping a job. Library
observation no longer triggers repeated full Plex filesystem scans. Manual refresh
never acquires or deletes media and reports incomplete stages without blocking
independent stages unnecessarily.

## Retention And TV Acquisition

The automation account owns acquisition provenance. It is not expected to watch
anything. Household history is aggregated independently of the requester account.
The native Reclaimerr audit found both requester-watch expiry rules exclude the
configured bot namespace, while recent/active playback and unavailable-playback
safeguards remain enabled. The native reality-season policy uses aggregate
playback, not a requirement for bot playback. No native deletion rule was widened.

Run the read-only installation audit with:

```sh
node scripts/audit-retention-cohesion.mjs
```

New default bot TV requests select the first and latest aired seasons, excluding
specials/future seasons. An initial 24-episode bound defers oversized selections or
keeps just the first season rather than requesting an entire long-running show.
Explicit owner season selections remain possible. A tested expansion planner
identifies only the next missing aired season after at least two distinct recent
episodes; automatic expansion execution is not enabled yet.

WatchWarden's own rotation task is review-only. Unknown Watchlist/progress evidence
does not authorize deletion. Standalone Keep pins a title in WatchWarden; it does
not silently claim a corresponding native Reclaimerr protection. Full per-account
Watchlist coverage and a verified protection/retirement handoff remain release gates.

## Storage And Safety Gates

The source default is 1 TB decimal. The operator most recently changed the live
maximum to 3 TB through Settings; that newer value was preserved. The latest complete Plex
logical-part inventory measured 2,044,348,463,524 bytes across 100 managed titles.
This is not verified physical free space or hardlink-adjusted usage.

Automatic acquisition remains disabled in the safe rollout. Reservation sizes are
not silently guessed, and unknown/stale accounting blocks new requests. Budget
pressure never authorizes removing protected media. No new download or media
deletion was used to test this deployment.

## Optional FamFlix Ops Convenience

WatchWarden remains independent. Ops uses distinct endpoint-scoped credentials:
status GET, no-acquisition refresh POST, and exact reviewed-title Keep POST.
Those credentials cannot read arbitrary settings, approve downloads or delete.
The API transport is tailnet-only HTTPS, not a new public endpoint.

Ops polls every five minutes through its existing notification dispatcher. Failed
or stale core jobs, at least 90 percent recorded budget use, and evidence-complete
owner decisions can produce one fingerprinted private-channel notice. Unchanged
issues do not repeat; recovery sends one recovery notice. Unknown per-title
evidence is an investigation, not an owner coin toss. Monitoring uses no model
calls and never refreshes, acquires, deletes or changes policy automatically.

Both a real attention notice and recovery were read back from the configured
Discord channel. The complete curation pipeline passed live, including source,
catalogue, household history, accounting, review and all six ordered collections.
Actual family TV-client placement and future reboot behavior remain observation
checks, not claims inferred from API success.

Release verification: 130 WatchWarden tests passed (50 scoring, 67 integration,
13 API), plus API/worker/web production builds. Ops passed 291 tests with five
opt-in skips. The first complete live pipeline finished at 2026-10-30T04:05:26Z.
No live acquisition, destructive retirement or download-priority mutation was
performed as a test.

## Admin Screen Audit

| Surface | Decision |
| --- | --- |
| Curation | Main overview: recorded storage, shelves, reviews and job status |
| Plex Home | Configure and preview owned shelves |
| Library | Consolidated title/status views |
| Automation | Enabled jobs and real run outcomes; disabled legacy tasks hidden |
| Settings | Budget/policy controls; obsolete deletion/Maintainerr controls removed; save errors explicit |
| Requests | Retained for inspecting existing requests, not primary navigation |
| Exports | Legacy advanced screen, not primary navigation or active default cron |
| Audit | Retained as read-only action evidence |
| Old status/suggestion/discover routes | Compatibility redirects into Library/Plex Home |

Eight active screens passed authenticated desktop loading checks. All five core
screens passed 390px mobile checks without horizontal overflow. A live mobile
Curation screenshot was inspected. Existing artwork/icons/design conventions were
preserved rather than replacing the application with a marketing layout.