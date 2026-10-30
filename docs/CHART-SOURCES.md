# Chart Sources And Refresh Reliability

## Decision

Keep identity metadata, popularity, regional availability, and platform home-screen
editorial choices separate. A weekly metadata update is not a weekly audience chart.
WatchWarden currently uses TMDB and Netflix adapters; TVDB identifiers are not a
chart feed in the current registry.

| Source | What it measures | Window/region | Role |
| --- | --- | --- | --- |
| Netflix Tudum country Top 10 | Official Netflix country chart | Dated weekly period, including Canada | Primary Netflix Canada chart signal |
| TMDB trending | Interest across TMDB | Day/week windows, global | Discovery and momentum, not Canadian viewing ranks |
| TMDB provider discovery | TMDB popularity filtered by subscription availability | Canadian/US availability, global popularity | Fill platform discovery shelves, never label as official platform ranks |
| JustWatch Streaming Charts | JustWatch user activity/interest | Daily updates; 24-hour, 7-day, 30-day windows; Canada | Candidate regional cross-service signal, subject to API access/terms |
| TVDB/TMDB identity metadata | Title/episode IDs, metadata and release information | Metadata-specific | Canonical matching, not audience rankings |

Public documentation checked on 2026-10-29:

- [TMDB trending](https://developer.themoviedb.org/reference/trending-all):
  provides day/week windows, not a Canadian audience parameter. A window is not
  a guarantee that every title changes weekly.
- [Netflix Canada shows](https://www.netflix.com/tudum/top10/canada/tv): the
  retrieved chart identified the period 2026-10-19 through 2026-10-25. This is a
  weekly chart, not the viewer's personalized first home rows.
- [JustWatch Canada charts](https://www.justwatch.com/ca/streaming-charts):
  describes daily updates based on offer clicks, Watchlist additions and seen
  marks, and offers an official API access form. This is interest, not platform
  stream counts. Credentials, pricing, permitted use, coverage and access have
  not been established; no scraping adapter has been installed.

No verified official Canadian Prime Video or Apple TV audience feed has been
established here. Do not silently substitute global TMDB popularity and call it
their Top 10. Until a suitable source is licensed/verified, label those shelves
as editorial discovery, or use fewer shelves with stronger source coverage.

## Ingestion Contract

- Track source, ranking basis, ranking region, availability region, chart period,
  provider, fetch time, source publication time and completeness separately.
- Preserve original feed ranks. Select the newest rank in the preferred region,
  not a title's best rank over the last week. History is useful for momentum,
  not a substitute for the current chart.
- Publish from complete per-source batches. Titles absent from a newer complete
  chart must leave that chart's candidate set; do not union a week of old charts.
- A weekly chart remaining unchanged midweek is healthy. Refetching it does not
  make its chart period newer. Stale/partial/failed ingestion must not masquerade
  as a fresh source success or erase a previously verified shelf.
- Rank changes update collection order as well as membership. Read back both.
- Missing identity mappings require review. Never guess the first search result.
- Source outages do not authorize downloads or deletion, and do not require Ops
  to keep WatchWarden's local status and review evidence available.

## Implemented In This Slice

- Fixed historical-best rank selection that ignored newer worse ranks.
- Worker now loads saved UI schedules at startup over environment defaults.
  A restart is required; invalid cron expressions fail startup instead of silently
  omitting the affected scheduled task.
- Added a synthetic two-cycle source-to-Plex test proving membership/order changes
  and idempotent repeats without Ops.
- Added explicit provenance to adapters and accurate provider-discovery labels.
- Netflix rejects incomplete ten-card charts, unresolved/ambiguous matches, and
  supports additional season/part labels before identity resolution.
- Failed/empty trend adapters no longer advance source success and now fail the
  overall trend job after collecting available source results.

## Remaining Release Gates

- [ ] Store publication/chart-period evidence from supported source data; current
  adapter sourcePublishedAt remains explicitly unknown.
- [ ] Implement complete atomic source batches and rank all candidates from the
  latest batch before local-library filtering. Legacy lookback snapshots can
  still retain titles missing from a newer chart for up to the query window.
- [ ] Enforce per-shelf source freshness/completeness before publication; failure
  reporting alone does not stop a separately scheduled shelf job using old data.
- [ ] Verify JustWatch API access/terms before selecting it as an actual dependency.
- [ ] Inspect saved schedules, source coverage, enabled shelves and real job outcomes
  after a backed-up runtime restoration. The local services are currently stopped.
- [ ] Observe unattended membership/order changes and actual household TV display.
  Synthetic tests are not proof that the historical production problem is solved.