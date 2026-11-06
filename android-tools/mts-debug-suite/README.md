# MTS ADB Auto v0.5.1 (single APK)

Standalone Android TV utility integrating functional settings intents and device
information from Developer Options Shortcut & Device Info 1.058 and Settings App 1.4.
No additional applications are required.

One large button runs diagnostics, attempts to set ADB on devices that already
grant WRITE_SECURE_SETTINGS or su, probes adbd, scans exported OEM developer
activities, opens a promising screen, then checks again on return to the app.

It reports number of probes, denials and OEM candidates. Opening a Settings
screen is not proof that ADB is enabled. Operator security restrictions remain.

OpenRouter integration sends diagnostics to openrouter/free and displays its
advice. Its key is injected at build time from the GitHub Actions encrypted
secret MTS_OPENROUTER_API_KEY. If absent, offline diagnostics remain functional.
The repository rejected direct publication of the supplied key.

Separate package org.arst113.mtsadb.fix051 avoids signing conflict with older builds.

## v0.5.1 field fix
- Root cause from screenshots: v0.5.0 broadly scanned package names containing "mts"; accidentally launched KION as if it were a developer-settings Activity.
- Auto-selection now only considers system Settings components and explicitly recognized OEMServiceClient packages. The old generic ACTION_SETTINGS and device info fallbacks are excluded from the automatic flow.
- The first target is com.android.settings.DevelopmentSettings, which was found in strings from the original Developer Options Shortcut 1.058 APK.
- All diagnostics are persisted in SharedPreferences so the report survives low-memory activity recreation.
- Shows local ADB status immediately before a system settings handoff. OpenRouter still requires a separately configured GitHub Actions secret.
