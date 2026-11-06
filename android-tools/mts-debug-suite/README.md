# MTS ADB Auto v0.5.0 (single APK)

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

Separate package org.arst113.mtsadb avoids signing conflict with older apps.
