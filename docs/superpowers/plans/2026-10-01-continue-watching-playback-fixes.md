# Continue Watching Playback Fixes

> **For agentic workers:** Execute inline with superpowers:executing-plans. Use test-driven-development for each fix.

**Goal:** Restore the saved online provider, track the next episode, and keep resumed playback open.

**Architecture:** Keep the existing history schema and synchronization. Open the saved online component with its explicit provider and carry its recipe through playlist items so Lampa's destroy/create/start sequence retains context. Keep the online activity alive during playback for lazy episode resolution.

**Tech Stack:** Browser JavaScript, Node.js VM tests, Chromium acceptance check.

**Spec:** The user's three reported bugs in this conversation.

## Global Constraints

- Edit the active `ContinueWatching.js` entry and its tests only, plus this plan.
- Do not migrate or reset saved history; test with synthetic histories in isolated browser contexts.
- Keep the Lampac synchronization schema and transport unchanged.

## Review Focus

- Multiple online buttons: the saved Lampac component must retain ownership of resume.
- A provider with `show: false`: explicit saved selection must survive default-provider fallback.
- The core playlist listener runs before the plugin and destroys playback before creating the next episode.
- Delayed updates for the previous episode must not undo the active episode selection.
- A failed or unrelated launch must not overwrite other titles or restore progress into another provider.

### Task 1: Saved provider restoration

**Files:** `ContinueWatching.js`, `tests/ContinueWatching.playback.test.js`.
**Interfaces:** Preserve `openSameMode(event, mode)` compatibility; pass optional saved activity context through the orchestrator and button callback.

- [x] Add a failing test with both Lampac and generic online actions, and another with saved Phantom hidden from default selection.
- [x] Run the playback tests and confirm provider assertions fail on the original entry.
- [x] Open the saved component with `lampac_custom_select` and prefer the Lampac action for legacy callers.
- [x] Repeat the focused tests and confirm the provider assertions pass.

### Task 2: Playlist episode capture

**Files:** `ContinueWatching.js`, `tests/ContinueWatching.playback.test.js`.
**Interfaces:** Carry `card` and `lampac_resume` online metadata on playback items; preserve existing explicit metadata.

- [x] Add a failing test reproducing core `destroy → create → start → playlist set → select` events.
- [x] Run the focused test and confirm the saved episode remains previous.
- [x] Preserve context on playlist items and ignore delayed internal progress for inactive online items.
- [x] Confirm selection, progress, source, synchronization import, and unrelated histories are preserved.

### Task 3: Player lifecycle and verification

**Files:** `ContinueWatching.js`, `tests/ContinueWatching.playback.test.js`.
**Interfaces:** Successful native resume resolves `{launched: true}` without navigating away from the playback activity.

- [x] Add a failing test for premature activity return after successful start.
- [x] Remove successful-launch navigation; retain failure cleanup and finite timeouts.
- [x] Run `node --test --test-isolation=none tests/*.test.js` and `git diff --check`; all pass.
- [x] Check the public entry with real jQuery and Lampa player/playlist code in isolated Chromium; retain observed results without touching the user's history.
- [x] Review the complete diff before reporting completion.

## Verification record

- Original entry: 10 of the 12 playback checks fail; timeout ownership and external callback compatibility already pass.
- Updated entry: all 12 playback checks pass. Complete repository suite: 21 checks pass, including the existing standalone fixture suites.
- The runner uses `--test-isolation=none` because this execution sandbox blocks Node child-process spawning.
- Independent read-only review found no Critical or Important issues and checked the upstream Lampa and Android event/serialization paths.
- Chromium uses the actual Lampa client and Lampac online plugin, synthetic source responses, and a local 600-second MP4. Saved hidden Phantom remains selected despite a second online button, playback seeks to 321 seconds, and next-episode playback saves S01E02 while keeping all 20 unrelated records.
- No user/browser/server history was edited. A physical Android player round-trip was not part of this verification.
