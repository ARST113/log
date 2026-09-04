# Lampac Continue Watching Sync Design

## Purpose

Move `ContinueWatching.js` progress synchronization from `Lampa.Storage.sync`
(the CUB-backed storage worker) to the existing authenticated storage API on
`https://lampac.fun`, without changing the plugin UI, the Continue button, the
Android APK, Just+ Player, or the Lampac server.

The result must synchronize a portable resume record between Lampa clients for
online video, torrents, series, and anime. A record includes the playback
position, season/episode selection, compact playlist metadata, and supported
segment metadata needed by Just+ Player 1.3.10.

## User-visible contract

- Existing Continue button placement, label, focus behavior, and launch behavior
  remain unchanged.
- The user continues to configure Lampac synchronization with the standard
  Lampac Sync script. Its token may be `arx.lamp`, `tol`, `nast`, or another
  non-empty value.
- Two clients configured with tokens/aliases belonging to the same Lampac
  account share progress because Lampac resolves them to one canonical
  `requestInfo.user_uid`.
- Changing the configured Lampac identity selects the storage owned by the
  newly resolved Lampac account. ContinueWatching never treats a short token as
  a global unauthenticated lookup key.
- Local continuation keeps working when the server is unavailable.

## Constraints

- Modify only `ContinueWatching.js`, its automated tests, and project
  documentation in `ARST113/log`.
- Do not modify or rebuild any APK.
- Do not modify or deploy the Lampac server.
- Do not call `Lampa.Storage.sync` for ContinueWatching data and do not access a
  CUB synchronization endpoint.
- Do not add a setting, dialog, notification, button, or any other UX element.
- Do not persist source-device `account_email`, `uid`, `nws_id`, AES keys,
  request headers containing credentials, RCH response bodies, or transient
  resolved/proxy media URLs in the remote document.
- Preserve the accepted behavior that progress is shared across translations;
  the most recent valid record controls the selected translation.
- Pixel/Android online-source selection remains outside this change; no PidTor
  preference is introduced.

## Existing server contract

The deployed Lampac `StorageController` provides:

- `GET /storage/get?path=<path>&pathfile=<name>`
- `POST /storage/set?path=<path>&pathfile=<name>` with the document as the raw
  request body

Lampac derives the physical file from the canonical authenticated
`requestInfo.user_uid` and `pathfile`. The plugin uses:

- `path=continuewatch`
- `pathfile=continue_watch_v6_<profile>`

`<profile>` is `lampac_profile_id` when present, otherwise the active Lampa
profile ID, otherwise `default`. `profile_id` is also sent through the standard
Lampac authentication query.

The remote JSON body has this envelope:

```json
{
  "schema": 1,
  "updated_at": 2000000,
  "records": {
    "c_123": {
      "v": 6,
      "card_key": "tmdb:tv:123",
      "source": "online",
      "activity_at": 2000000,
      "season": 1,
      "episode": 2,
      "timeline_hash": "episode-hash",
      "time": 320,
      "duration": 3000,
      "percent": 11,
      "current_index": 1
    }
  }
}
```

The existing v6 record schema remains authoritative. Online and torrent
playlist subobjects are retained after the existing sanitizer and compactor
have run.

## Lampac identity discovery

ContinueWatching discovers the current standard Lampac Sync token without
adding UI:

1. Inspect `document.scripts` for a script hosted by `lampac.fun` whose URL is
   `/sync/js/<token>` and URL-decode the final path segment.
2. Also support `/sync.js?token=<token>`.
3. Re-scan when building each request so a script loaded before or after
   ContinueWatching works.
4. Add the discovered token to requests as the `token` query parameter.
5. Add existing `account_email`, `lampac_unic_id` as `uid`, and
   `lampac_profile_id` when present, matching Lampac's own `account(url)`
   helper. A token is never copied into the remote body or diagnostic API.
6. If no token is discoverable, a registered email or UID may still authorize
   the request. If none exist, remote synchronization is skipped while local
   continuation remains enabled.

Arbitrary token text is handled with `URL`/`URLSearchParams`; it is not used as
a filesystem path and is never concatenated into a URL without encoding.

## Client data flow

### Local hot path

Playback callbacks remain synchronous. `store()` reads the existing local
`continue_watch_v6_<profile>` object, and `saveRecord()` updates it immediately.
The local outbox `continue_watch_v6_outbox_<profile>` remains the durable retry
queue and is capped at 120 entries.

`profileId()` no longer returns a special non-writing `guest` state. It falls
back to `default`, so local continuation works independently of a CUB account.

### Pull

A remote pull runs on installation, focus/visibility return, relevant Lampac
identity/profile changes, and before a write-repair attempt:

1. GET the authenticated Lampac storage document.
2. Treat `success:false` with `msg:"outFile"` as an empty first-use document.
3. Reject malformed envelopes, unsupported schemas, and authentication error
   payloads without replacing local data.
4. Sanitize every remote record again before accepting it.
5. Merge remote records, the local store, and the outbox.
6. Write the merged result to the local store so the existing synchronous UI
   and launch path see it.
7. If the merged document is richer/newer than the remote copy, push a repair.

### Merge rule

Records with different record keys are unioned. For the same key:

1. A greater valid `activity_at` wins.
2. At equal `activity_at`, compatible records use the existing richness rule;
   the record with more playlist items wins.
3. `rejectEqualTimeDowngrade` prevents an equal-time poorer snapshot replacing
   a richer snapshot.
4. The existing completion guards continue to prevent false `100%` reports
   from replacing a valid partial position.

These rules preserve series/episode selection because the winning record
contains `season`, `episode`, `current_index`, `timeline_hash`, and its compact
playlist.

### Push and conflict repair

Local saves remain debounced. A push sends the sanitized envelope to
`/storage/set`, then performs a verification GET. If another writer replaced or
omitted a record, the client merges the verified server state and retries. A
single synchronization cycle performs at most three POST attempts. Failure
leaves the outbox intact for a later focus/start/save retry.

Only one remote cycle runs at a time. A request arriving while one is active is
coalesced into one follow-up cycle.

## Lifecycle changes

- Remove `ensureSync()` and the CUB `worker_storage` listener.
- Keep local storage-change refresh behavior.
- Trigger Lampac pull/merge at installation and on focus/visibility return.
- Trigger a debounced Lampac cycle after `saveRecord()` and pending-player
  reconciliation.
- Re-run synchronization when `account`, `account_email`, `lampac_unic_id`, or
  `lampac_profile_id` changes.
- `ContinueWatchV6.sync()` may expose transport status and local keys for
  diagnostics but must not expose the discovered token, email, UID, or remote
  URL containing credentials.

## Error handling

- Network errors, timeout, malformed JSON, unsupported schema, and authorization
  errors must not clear or downgrade local records.
- All callbacks are one-shot and guarded against late completion.
- Remote requests have a finite timeout and retry only through the bounded
  synchronization cycle.
- No failure produces a new UI notification.

## Automated verification

The VM test harness will model `document.scripts`, record Lampac network calls,
and drive virtual timers. Tests must prove:

- no ContinueWatching call reaches `Lampa.Storage.sync`;
- tokens `arx.lamp`, `tol`, and `nast` are discovered and URL-encoded correctly;
- GET hydration makes a remote film/series record available locally;
- POST bodies contain the portable envelope and omit credentials and transient
  resolver data;
- union, newer-wins, equal-time-richness, and false-completion guards survive
  round trips;
- a conflicting verification GET causes a bounded merge/retry;
- malformed/unauthorized/offline responses retain local data and the outbox;
- online playlist segments and torrent episode/index fields survive remote
  synchronization;
- all existing ContinueWatching and Online2 regressions remain green.

## Device/browser acceptance

After GitHub publication, 15 testing subagents run in waves of at most three.
The physical clients are one ADB phone and independent browser profiles/contexts;
multiple tabs sharing one storage profile do not count as independent devices.
Scenarios cover online, torrent, and anime playback, Continue-button appearance,
position transfer, in-player episode switching, reverse synchronization, and
segment metadata. No result is marked passed without observable evidence from
the receiving client.
