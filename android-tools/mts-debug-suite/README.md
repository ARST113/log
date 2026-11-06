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

## v0.6.0 — offline OEM APK exporter for REA

The new prominent button reads the installed system app `com.dcw.oemserviceclient` via `ApplicationInfo.publicSourceDir` and starts a short-lived HTTP server on the TV (`port 8765`). The phone/PC on the same Wi-Fi can download the APK with a one-time randomized URL. The server stops after one download or 5 minutes. This does not enable ADB, does not request root, and does not send anything to OpenRouter. Package access may be denied by OEM SELinux rules. Once the APK is on a PC, use REA + JADX to inspect `SET ADB TRUE` and understand why the service does not activate `adbd` on the operator firmware.

This version has package name `org.arst113.mtsadb.rea06` so it can be installed beside 0.5.x. Old v0.5.x releases remain available.
