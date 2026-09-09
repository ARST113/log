const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const entry = path.join(__dirname, '..', 'ContinueWatching.js')
const code = fs.readFileSync(entry, 'utf8')

assert.doesNotThrow(() => new Function(code), 'public plugin entry must be valid JavaScript')
assert.match(code, /lampac_resume_history_v1/, 'public entry must use the Lampac Sync recipe schema')
assert.match(code, /plugin_watch_resume_ready/, 'public entry must expose the universal runtime guard')
assert.match(code, /resume-torrent-file/, 'public entry must contain direct torrent restoration')
assert.match(code, /createNativeOnline/, 'public entry must contain direct online restoration')
assert.doesNotMatch(code, /__CW_V6_VERSION__/, 'legacy ContinueWatching runtime must not remain active')

console.log('ContinueWatching universal entry: OK')
