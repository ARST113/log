# Lampac Continue Watching Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ContinueWatching's CUB storage worker with authenticated Lampac Storage synchronization that preserves position, series/playlist state, and segments across clients.

**Architecture:** Keep the existing synchronous local store and durable outbox as the playback hot path. Add one serialized Lampac GET/merge/POST/verify cycle that discovers the standard `/sync/js/{token}` identity, transports a sanitized versioned envelope, and repairs whole-document write conflicts with at most three attempts.

**Tech Stack:** ES5-compatible browser JavaScript, Lampa `Reguest`/`Storage` APIs, Node.js `vm` regression harness, built-in `assert`.

**Spec:** `docs/superpowers/specs/2026-09-04-lampac-continue-watching-sync-design.md`

## Global Constraints

- Modify only `ContinueWatching.js`, `tests/ContinueWatching.v6.1.test.js`, and project documentation in `ARST113/log`.
- Do not modify/rebuild an APK, Lampac server code/configuration, or Continue button UX.
- Do not call `Lampa.Storage.sync` or a CUB sync endpoint for ContinueWatching data.
- Use `https://lampac.fun/storage/get` and `/storage/set`, `path=continuewatch`, `pathfile=continue_watch_v6_<profile>`, and envelope schema `1`.
- Discover arbitrary standard Lampac Sync tokens from `/sync/js/<token>` and `/sync.js?token=<token>`; never hardcode `arx.lamp` as the only accepted token.
- Never persist token, `account_email`, `uid`, `nws_id`, AES material, credential headers, RCH bodies, or transient resolved/proxy media URLs in the remote document.
- Preserve cross-translation shared progress, playlist/episode state, segment metadata, local offline behavior, and existing resolver localization on the target device.
- Every production change follows a witnessed red-green TDD cycle.

---

### Task 1: Authenticated Lampac storage transport and conflict-safe integration

**Files:**
- Modify: `ContinueWatching.js:1-365`
- Modify: `ContinueWatching.js:1755-1831`
- Modify: `tests/ContinueWatching.v6.1.test.js:1-1855`

**Interfaces:**
- Consumes: existing `profileId()`, `storageKey()`, `outboxKey()`, `store()`, `queueOutbox(record)`, `flushOutbox(forceWrite)`, `sanitizeRecordResolvers(record)`, `compactRecord(record)`, `richnessCompatible(a,b)`, `rejectEqualTimeDowngrade(old,record)`, and lifecycle `install()`.
- Produces: `discoverLampacToken(): string`, `lampacIdentity(): object`, `remoteProfileId(): string`, `lampacStorageUrl(action): string`, `mergeRecordMaps(...maps): object`, `pullRemote(callback): void`, `pushRemote(records,callback): void`, and `syncRemote(reason): void`. These remain private except narrowly exposed under `ContinueWatchV6.testing` in test mode.

- [ ] **Step 1: Extend the VM harness without changing production behavior**

Add complete `document.scripts` fixtures, retained `Storage.listener` callbacks,
a `storageSyncCalls` counter, and a `requests` log containing `{url, post,
params, timeout}`. Add harness methods that replace script URLs and dispatch a
named storage change. The default request handler must still fail requests so
existing tests remain deterministic.

```js
const scriptUrls = [];
const storageListeners = [];
const requests = [];
let storageSyncCalls = 0;

document.scripts = scriptUrls.map((src) => ({ src }));
Lampa.Storage.listener.follow = (name, callback) => {
    if (name === 'change') storageListeners.push(callback);
};
Lampa.Storage.sync = () => { storageSyncCalls += 1; };
```

- [ ] **Step 2: Write identity and URL tests that fail because Lampac transport does not exist**

Add literal assertions for all supported script forms and tokens:

```js
const pathToken = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
assert.equal(pathToken.api.testing.discoverLampacToken(), 'arx.lamp');

const queryToken = harness({ scripts: ['https://lampac.fun/sync.js?token=tol'] });
assert.equal(queryToken.api.testing.discoverLampacToken(), 'tol');

const changedToken = harness({ scripts: ['https://lampac.fun/sync/js/nast'] });
assert.equal(new URL(changedToken.api.testing.lampacStorageUrl('get')).searchParams.get('token'), 'nast');
```

Also assert the URL uses HTTPS, the exact `/storage/get` or `/storage/set`
path, `path=continuewatch`, the literal profile-derived `pathfile`, and existing
`uid`, `account_email`, and `profile_id` parameters. Assert an untrusted other
host's `/sync/js/...` is ignored.

- [ ] **Step 3: Run the identity tests and witness the expected RED failure**

Run:

```powershell
& 'C:\Users\Иван\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\ContinueWatching.v6.1.test.js
```

Expected: FAIL because `discoverLampacToken`/`lampacStorageUrl` are undefined;
the failure must not be a harness syntax error.

- [ ] **Step 4: Implement the minimum identity and URL helpers**

In `ContinueWatching.js`, add `LAMPAC_BASE`, `REMOTE_SCHEMA`,
`REMOTE_PATH`, and finite request/debounce constants. Implement URL parsing via
`new URL(src, location.href)`, accept only the `lampac.fun` host, decode path or
query tokens, and re-scan on each call. Use `URL.searchParams.set` for every
query value. Do not expose identity values through `ContinueWatchV6.sync()`.

Make `profileId()` fall back to `lampac_profile_id`, then `default`; remove all
`profileId() === 'guest'` write suppression. Do not yet add network lifecycle
calls.

- [ ] **Step 5: Run the identity tests and witness GREEN**

Run the command from Step 3. Expected: all existing fixtures plus the new
identity fixtures pass, `storageSyncCalls === 0`, and no network call occurs
without an explicit test trigger.

- [ ] **Step 6: Write failing pull/merge tests**

Create deterministic fixtures where `Lampa.Reguest.native` returns:

1. a remote movie record in `{schema:1,updated_at,records}`;
2. a disjoint remote series record plus a local movie record;
3. an older one-item remote playlist versus an equal-time ten-item outbox;
4. malformed JSON, `schema:2`, `{accsdb:{...}}`, and a request failure.

Drive the virtual callbacks/timers and assert observable local
`ContinueWatchV6.record()`/`sync().store` results. The first three must hydrate
or union without downgrading; the four error variants must retain the original
local object and outbox byte-for-byte.

- [ ] **Step 7: Run the pull tests and witness RED**

Run the command from Step 3. Expected: FAIL because `pullRemote` and
`mergeRecordMaps` are undefined or no remote record reaches the local store.

- [ ] **Step 8: Implement minimum pull and deterministic record-map merge**

Implement a one-shot Lampac request wrapper using `Lampa.Reguest.native` with a
finite timeout. Parse both object and string responses. Accept `success:false`
with `msg:'outFile'` as an empty document; reject all other error and malformed
payloads.

`mergeRecordMaps` must union keys and choose one same-key record using the
existing `activity_at`, `richnessCompatible`, and `rejectEqualTimeDowngrade`
rules. Sanitize/compact deep copies before they enter the local store. Pull must
merge remote + local + outbox, then call `writeStore(merged)` and `refreshUI()`.

- [ ] **Step 9: Run the pull tests and witness GREEN**

Run the command from Step 3. Expected: all identity, pull, and pre-existing
fixtures pass.

- [ ] **Step 10: Write failing push, sanitization, verification, and bounded-conflict tests**

Save online and torrent records that contain segments plus source-device
credentials/transient URLs. Assert the first POST:

- targets `/storage/set`;
- has a raw JSON envelope with `schema === 1`;
- retains season, episode, current index, compact playlist, and segments;
- has no normalized query/body keys `token`, `account_email`, `uid`, `nws_id`,
  `aesgcmkey`, and no RCH body;
- contains no transient direct/proxy media URL after existing sanitization.

Return success to the POST, then return a verification GET missing the local
record. Assert the client merges and performs a second POST containing both
server and local records. Repeat conflicts and assert total POST attempts never
exceed three and the outbox remains available.

- [ ] **Step 11: Run push/conflict tests and witness RED**

Run the command from Step 3. Expected: FAIL because no Lampac POST/verification
cycle occurs.

- [ ] **Step 12: Implement the serialized push/verify/retry cycle**

Add remote state fields for `busy`, `queued`, and a single debounce timer.
`syncRemote(reason)` performs GET -> merge -> POST only when needed ->
verification GET. A differing verification document is merged and retried,
with an exact maximum of three POST attempts per cycle. A call while busy sets
one queued follow-up flag. Network failure keeps local store and outbox.

`flushOutbox()` continues synchronously merging into the local store but now
schedules `syncRemote('outbox')` instead of `Lampa.Storage.sync`. `saveRecord()`
still updates the local object before any request.

- [ ] **Step 13: Run push/conflict tests and witness GREEN**

Run the command from Step 3. Expected: all fixtures pass and request-log
assertions show the bounded GET/POST sequence.

- [ ] **Step 14: Write failing lifecycle/no-CUB tests**

Create separate harness instances and assert:

- installation with a remote identity schedules/pulls Lampac data;
- focus and visible `visibilitychange` cause a later pull;
- changes to `account`, `account_email`, `lampac_unic_id`, and
  `lampac_profile_id` cause a later pull;
- no lifecycle path calls `Lampa.Storage.sync`;
- `ContinueWatchV6.sync()` contains no token/email/UID or credential-bearing
  URL.

- [ ] **Step 15: Run lifecycle tests and witness RED**

Run the command from Step 3. Expected: FAIL because installation still calls
`ensureSync`/the CUB worker and lifecycle events do not invoke Lampac pulls.

- [ ] **Step 16: Replace lifecycle wiring and bump the plugin version**

Remove `ensureSync()` and the `worker_storage` listener. Start Lampac hydration
from `install()`, focus, visible `visibilitychange`, and the listed storage
identity changes. Preserve the two existing delayed recovery opportunities but
route them through `syncRemote`. Bump `VERSION` to
`v6.2.0-lampac-storage-sync-20260904`; update the version assertion only after
the lifecycle RED failure has been witnessed.

- [ ] **Step 17: Run the complete local regression suite**

Run:

```powershell
& 'C:\Users\Иван\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\ContinueWatching.v6.1.test.js
& 'C:\Users\Иван\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\Online2.external-android-playlist.test.js
```

Expected: both exit `0`; ContinueWatching reports all old and new fixtures
passed, and Online2 reports `PASS`.

- [ ] **Step 18: Perform security and scope self-review**

Inspect the staged diff and verify only the allowed plugin, test, and documentation paths changed. Search
production code for `Lampa.Storage.sync` and confirm ContinueWatching has no
call. Inspect recorded POST fixtures to confirm credentials appear only in the
URL and not in the JSON body. Confirm no UX strings/settings/buttons and no
APK/server files were added.

- [ ] **Step 19: Commit the implementation**

```powershell
git add ContinueWatching.js tests/ContinueWatching.v6.1.test.js docs/superpowers/specs/2026-09-04-lampac-continue-watching-sync-design.md docs/superpowers/plans/2026-09-04-lampac-continue-watching-sync.md
git commit -m "feat: sync continue watching through Lampac storage"
```

Expected: one commit on the current feature branch containing only the allowed
plugin, tests, and documentation changes.
