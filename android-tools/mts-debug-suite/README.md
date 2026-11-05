# MTS Debug Toolbox (Android TV)

Open-source, TV-remote-friendly Android app for diagnosing access to
Developer Options on ZTE ZXV10 B866 (MTS), Android 12, and similar devices.

Features:
- Android build/model/security information.
- Launch standard Developer Options / Device Info / Settings intents.
- Test known Android and Android TV settings components.
- Discover exported settings Activities by package; attempt only exported ones.
- Probe whether TCP port 5555 is listening on localhost (not proof of ADB).
- Copy a diagnostic report, including exact exceptions from denied launches.
- Non-destructive root/bootloader feasibility report: Linux kernel version, build, Verified Boot and bootloader properties, Magisk presence, and optional su uid check.
- Optional, explicitly confirmed root/SU attempt to set development_settings_enabled
  and adb_enabled, without forcing USB property changes or rebooting.
- Focusable controls, dark high-contrast TV layout.

**Limitations:** A regular Android APK cannot grant itself WRITE_SECURE_SETTINGS
or override OEM policy. Android may intentionally return 0 for
Settings.Global.ADB_ENABLED and DEVELOPMENT_SETTINGS_ENABLED to third-party
apps, so the app does not claim to know their true values.

Root check is advisory, not an exploit. There is no general one-click root for locked Android 12 B866 firmware; do not flash another revision's boot image. Some documented B866 Android 12 downgrade paths require UART/test points and carry a substantial brick risk. The report helps determine the precise firmware before attempting a device-specific repair.

The older "Developer Options Shortcut & Device Info" and "Settings App" APKs
are not redistributed or decompiled into this project. This is an independent
implementation of the relevant functions.

### Build locally
JDK 17+, Android SDK 35+, Gradle 8.9:
    gradle assembleDebug

The GitHub Actions workflow in the repository root builds and publishes
m.apk on the mts-debug-suite branch following source changes.

**Security:** The app does not run privileged operations automatically.
Root is optional; confirmation is required. This tool does not remove
device-owner controls or bypass verified boot. Use only on your own device.
