package org.arst113.mtsdebug;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * On-device diagnostics and explicit user-operated entry points to system settings.
 * A normal app has no authority to enable ADB on a locked operator firmware.
 */
public class MainActivity extends Activity {
    private final StringBuilder report = new StringBuilder();
    private TextView reportView;
    private LinearLayout foundActivities;
    private final List<LaunchTarget> attempts = new ArrayList<>();

    private static final int BG = 0xff101820;
    private static final int PANEL = 0xff233447;
    private static final int FOCUS = 0xff1872b4;
    private static final int WHITE = Color.WHITE;

    private static final class LaunchTarget {
        final String name;
        final Intent intent;

        LaunchTarget(String name, Intent intent) {
            this.name = name;
            this.intent = intent;
        }
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        ScrollView scroller = new ScrollView(this);
        scroller.setFillViewport(true);
        scroller.setBackgroundColor(BG);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(22), dp(16), dp(22), dp(24));
        scroller.addView(page);
        setContentView(scroller);

        TextView title = text("MTS DEBUG TOOLBOX 0.1", 25, WHITE, true);
        page.addView(title);
        TextView info = text("Диагностика режима разработчика: ZTE / Android TV\nУправление кнопками пульта. После проверки экрана нажми «Назад».", 16, 0xffb7cbdd, false);
        page.addView(info);

        section(page, "1. Быстрые варианты");
        attempts.add(new LaunchTarget("Стандартный Android — параметры разработчика",
            new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)));
        attempts.add(new LaunchTarget("Android — сведения об устройстве",
            new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS)));
        attempts.add(new LaunchTarget("Android — основные настройки",
            new Intent(Settings.ACTION_SETTINGS)));
        attempts.add(new LaunchTarget("Android — настройки приложений",
            new Intent(Settings.ACTION_APPLICATION_SETTINGS)));

        // Known AOSP / Android TV component names. OEM builds may omit or block them.
        attempts.add(explicit("AOSP — DevelopmentSettingsDashboardActivity",
            "com.android.settings",
            "com.android.settings.Settings$DevelopmentSettingsDashboardActivity"));
        attempts.add(explicit("AOSP — DevelopmentSettingsActivity",
            "com.android.settings",
            "com.android.settings.Settings$DevelopmentSettingsActivity"));
        attempts.add(explicit("AOSP — legacy DevelopmentSettings",
            "com.android.settings",
            "com.android.settings.DevelopmentSettings"));
        attempts.add(explicit("Android TV — development screen",
            "com.android.tv.settings",
            "com.android.tv.settings.device.development.DevelopmentSettingsActivity"));
        attempts.add(explicit("Android TV — main settings",
            "com.android.tv.settings",
            "com.android.tv.settings.MainSettings"));

        button(page, "Автоподбор: открыть первый доступный экран", () -> {
            append("Начата проверка вариантов. Успешный запуск Activity не означает разрешение на ADB.");
            for (LaunchTarget target : attempts) {
                if (launch(target)) return;
            }
            append("Ни один из известных экранов не открылся.");
        });

        for (LaunchTarget target : attempts) {
            button(page, target.name, () -> launch(target));
        }
        button(page, "Запустить системное приложение Settings", () -> {
            launchPackage("com.android.settings");
        });
        button(page, "Запустить приложение Android TV Settings", () -> {
            launchPackage("com.android.tv.settings");
        });

        section(page, "2. Поиск скрытых экранов");
        TextView hint = text("Сканируются только известные пакеты системных настроек. Можно запускать найденные экспортированные Activity по отдельности; закрытые система не разрешит.", 15, 0xffb7cbdd, false);
        page.addView(hint);
        button(page, "Найти доступные Activity (аналог Activity Launcher)", this::scanActivities);
        foundActivities = new LinearLayout(this);
        foundActivities.setOrientation(LinearLayout.VERTICAL);
        page.addView(foundActivities);

        section(page, "3. Диагностика");
        button(page, "Проверить локальный порт 5555", this::probePort);
        button(page, "Обновить сведения о прошивке", this::deviceReport);
        button(page, "Root/Bootloader: проверить возможности (без изменений)", this::rootDiagnostics);
        button(page, "Root: запросить su и проверить uid", this::confirmSuCheck);
        button(page, "Запустить Magisk, если установлен", () -> launchPackage("com.topjohnwu.magisk"));
        button(page, "Root/SU: попытаться включить Developer Options + USB ADB", this::confirmRoot);

        section(page, "4. Журнал и результаты");
        TextView warning = text(
            "Внимание: Android скрывает фактические значения adb_enabled и development_settings_enabled от обычных приложений. Открытый порт 5555 тоже не доказывает, что ADB авторизован. Утилита не снимает ограничения оператора.",
            15, 0xffffcf9a, false);
        page.addView(warning);
        button(page, "Скопировать отчёт", this::copyReport);
        button(page, "Поделиться отчётом", this::shareReport);
        reportView = text("", 14, 0xffcde5f6, false);
        reportView.setTextIsSelectable(true);
        reportView.setPadding(dp(8), dp(10), dp(8), dp(10));
        reportView.setBackgroundColor(0xff192532);
        page.addView(reportView);

        append("Запуск приложения.");
        deviceReport();
    }

    private LaunchTarget explicit(String title, String pkg, String cls) {
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(pkg, cls));
        return new LaunchTarget(title, intent);
    }

    private void section(LinearLayout page, String label) {
        TextView view = text(label, 19, WHITE, true);
        view.setPadding(0, dp(22), 0, dp(9));
        page.addView(view);
    }

    private TextView text(String content, int sp, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(content);
        v.setTextSize(sp);
        v.setTextColor(color);
        if (bold) v.setTypeface(null, 1);
        v.setGravity(Gravity.START);
        return v;
    }

    private void button(LinearLayout page, String label, Runnable action) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(17);
        b.setTextColor(WHITE);
        b.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        b.setPadding(dp(15), dp(12), dp(12), dp(12));
        b.setFocusable(true);
        b.setFocusableInTouchMode(false);
        b.setMinHeight(dp(60));
        b.setOnFocusChangeListener((v, focus) -> styleButton(b, focus));
        styleButton(b, false);
        b.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.bottomMargin = dp(7);
        page.addView(b, p);
    }

    private void styleButton(Button b, boolean focused) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(focused ? FOCUS : PANEL);
        shape.setCornerRadius(dp(9));
        shape.setStroke(dp(focused ? 3 : 1), focused ? 0xffa3e3ff : 0xff39526b);
        b.setBackground(shape);
    }

    private boolean launch(LaunchTarget target) {
        try {
            startActivity(new Intent(target.intent));
            append("ОТКРЫТО / передано системе: " + target.name
                + ". Проверь, не появился ли запрет OEM внутри окна.");
            return true;
        } catch (ActivityNotFoundException e) {
            append("НЕТ ЭКРАНА: " + target.name + " — " + e.getMessage());
        } catch (SecurityException e) {
            append("ЗАПРЕТ ДОСТУПА: " + target.name + " — " + e.getMessage());
        } catch (Exception e) {
            append("ОШИБКА: " + target.name + " — " + e.toString());
        }
        return false;
    }

    private void launchPackage(String packageName) {
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage(packageName);
            if (intent == null) {
                append("Нет доступного launch-intent у " + packageName);
            } else {
                launch(new LaunchTarget("Приложение " + packageName, intent));
            }
        } catch (Exception ex) {
            append("Ошибка запуска " + packageName + ": " + ex);
        }
    }

    @SuppressWarnings("deprecation")
    private void scanActivities() {
        foundActivities.removeAllViews();
        PackageManager pm = getPackageManager();
        String[] pkgs = {
            "com.android.settings",
            "com.android.tv.settings",
            "com.zte.stb.settings",
            "ru.mts.mtstv"
        };
        int total = 0;
        for (String pkg : pkgs) {
            try {
                PackageInfo pi = pm.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES);
                int found = 0;
                if (pi.activities != null) {
                    Arrays.sort(pi.activities, (a, b) -> a.name.compareToIgnoreCase(b.name));
                    for (ActivityInfo activity : pi.activities) {
                        String n = activity.name.toLowerCase(Locale.ROOT);
                        if (!activity.enabled || !activity.exported) continue;
                        if (!(n.contains("develop") || n.contains("debug")
                            || n.contains("deviceinfo") || n.contains("about")
                            || n.contains("setting"))) continue;
                        if (found >= 25) break;
                        String name = activity.name;
                        String display = "Открыть: " + pkg + " / " + name.substring(name.lastIndexOf('.') + 1);
                        button(foundActivities, display, () -> launch(explicit(display, pkg, name)));
                        found++;
                        total++;
                    }
                }
                append("СКАН " + pkg + ": экспортированных подходящих Activity " + found);
            } catch (PackageManager.NameNotFoundException e) {
                append("СКАН " + pkg + ": пакет отсутствует или недоступен для обнаружения.");
            } catch (Exception e) {
                append("СКАН " + pkg + ": " + e.toString());
            }
        }
        append("Найдено " + total + " потенциальных точек входа. Встроенные OEM-ограничения сохраняются.");
        if (total == 0) {
            foundActivities.addView(text("Доступных экспортированных экранов не найдено.", 16, WHITE, false));
        }
    }

    private void deviceReport() {
        append("УСТРОЙСТВО: " + Build.MANUFACTURER + " " + Build.MODEL
            + "; product=" + Build.PRODUCT + "; device=" + Build.DEVICE
            + "; Android=" + Build.VERSION.RELEASE + "; API=" + Build.VERSION.SDK_INT);
        append("BUILD: " + Build.DISPLAY + " / " + Build.FINGERPRINT);
        append("ro.debuggable=" + prop("ro.debuggable")
            + "; ro.secure=" + prop("ro.secure")
            + "; ro.build.type=" + prop("ro.build.type"));
        append("persist.sys.usb.config=" + prop("persist.sys.usb.config")
            + "; sys.usb.config=" + prop("sys.usb.config")
            + "; service.adb.tcp.port=" + prop("service.adb.tcp.port"));
        boolean privileged = checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS")
            == PackageManager.PERMISSION_GRANTED;
        append("WRITE_SECURE_SETTINGS: " + (privileged ? "предоставлено" : "не предоставлено")
            + ". ADB_ENABLED/DEVELOPMENT_SETTINGS_ENABLED нельзя достоверно читать обычному APK.");
    }

    private String prop(String key) {
        Process proc = null;
        try {
            proc = new ProcessBuilder("/system/bin/getprop", key)
                .redirectErrorStream(true).start();
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8));
            String val = reader.readLine();
            if (!proc.waitFor(1, TimeUnit.SECONDS)) {
                proc.destroy();
                return "(timeout)";
            }
            return val == null || val.trim().isEmpty() ? "(empty)" : val.trim();
        } catch (Exception e) {
            return "(unavailable: " + e.getClass().getSimpleName() + ")";
        } finally {
            if (proc != null) proc.destroy();
        }
    }

    private void probePort() {
        append("Проверка localhost:5555...");
        new Thread(() -> {
            boolean listening;
            String error = "";
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress("127.0.0.1", 5555), 650);
                listening = true;
            } catch (Exception e) {
                listening = false;
                error = e.getClass().getSimpleName();
            }
            final String result = listening
                ? "TCP 127.0.0.1:5555 ОТКРЫТ. Это не подтверждает ADB и не означает доступ с ПК."
                : "TCP 127.0.0.1:5555 закрыт или недоступен (" + error + ").";
            runOnUiThread(() -> append(result));
        }).start();
    }

    /**
     * This is an advisory non-destructive probe. A property can be omitted or
     * spoofed by OEM firmware and is NOT proof that flashing is safe.
     */
    private void rootDiagnostics() {
        append("ROOT/BOOTLOADER: чтение сведений без изменения системы.");
        append("CHIPSET: hardware=" + Build.HARDWARE + "; board=" + Build.BOARD
            + "; ABIs=" + Arrays.toString(Build.SUPPORTED_ABIS));
        append("KERNEL: " + shellLine("/system/bin/uname", "-r"));
        append("SECURITY PATCH: " + Build.VERSION.SECURITY_PATCH);
        append("ro.boot.verifiedbootstate=" + prop("ro.boot.verifiedbootstate")
            + "; ro.boot.vbmeta.device_state=" + prop("ro.boot.vbmeta.device_state"));
        append("ro.boot.flash.locked=" + prop("ro.boot.flash.locked")
            + "; ro.oem_unlock_supported=" + prop("ro.oem_unlock_supported")
            + "; ro.boot.veritymode=" + prop("ro.boot.veritymode"));
        append("su (путь, наличие не гарантирует root): "
            + shellLine("/system/bin/sh", "-c", "command -v su || echo not-found"));
        try {
            getPackageManager().getPackageInfo("com.topjohnwu.magisk", 0);
            append("MAGISK: пакет обнаружен; проверка root требует su -c id.");
        } catch (Exception ex) {
            append("MAGISK: установленный пакет не обнаружен / скрыт.");
        }
        append("Для root нужны доступные привилегии su ИЛИ совместимый разблокированный bootloader/образ, либо проверенная уязвимость конкретной прошивки. Этот APK не разблокирует загрузчик.");
    }

    private String shellLine(String... cmd) {
        Process p = null;
        try {
            p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8));
            String first = reader.readLine();
            if (!p.waitFor(2, TimeUnit.SECONDS)) {
                p.destroy();
                return "(timeout)";
            }
            return first == null ? "(пусто)" : first.trim();
        } catch (Exception e) {
            return "(недоступно: " + e.getClass().getSimpleName() + ")";
        } finally {
            if (p != null) p.destroy();
        }
    }

    private void confirmSuCheck() {
        new AlertDialog.Builder(this)
            .setTitle("Проверка привилегий su")
            .setMessage("Приложение выполнит только команду 'su -c id'. Если установлен менеджер root, он может запросить подтверждение. Разделы и настройки не изменяются.")
            .setNegativeButton("Отмена", (d, w) -> {})
            .setPositiveButton("Проверить", (d, w) -> {
                new Thread(() -> {
                    String result = shellLine("su", "-c", "id");
                    runOnUiThread(() -> append(
                        "ПРОВЕРКА SU: " + result + " | uid=0 означает root в рамках этого запуска."));
                }).start();
            })
            .show();
    }

    private void confirmRoot() {
        new AlertDialog.Builder(this)
            .setTitle("Попытка через root/SU")
            .setMessage("Только для твоей собственной приставки. Приложение запросит права su и выполнит команды settings put global development_settings_enabled 1 и adb_enabled 1. На обычной прошивке root отсутствует. Запускаем?")
            .setNegativeButton("Отмена", (d, w) -> append("Попытка SU отменена."))
            .setPositiveButton("Попробовать", (d, w) -> tryRoot())
            .show();
    }

    private void tryRoot() {
        append("SU: запрос root и попытка изменить два системных параметра...");
        new Thread(() -> {
            Process p = null;
            String outcome;
            try {
                p = new ProcessBuilder("su", "-c",
                    "settings put global development_settings_enabled 1 && settings put global adb_enabled 1")
                    .redirectErrorStream(true).start();
                BufferedReader in = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder lines = new StringBuilder();
                long until = System.currentTimeMillis() + 12000;
                while (System.currentTimeMillis() < until && in.ready()) {
                    String l = in.readLine();
                    if (l == null) break;
                    lines.append(l).append(' ');
                }
                boolean finished = p.waitFor(12, TimeUnit.SECONDS);
                int rc = finished ? p.exitValue() : -1;
                outcome = "SU завершение=" + rc + "; вывод=" + lines;
                if (rc == 0) {
                    outcome += "; команды приняты, но реальную активацию ADB следует проверить на ПК/в настройках.";
                } else if (!finished) {
                    outcome += "; запрос root мог быть заблокирован или не подтверждён.";
                }
            } catch (Exception e) {
                outcome = "SU недоступен: " + e.toString();
            } finally {
                if (p != null) p.destroy();
            }
            String result = outcome;
            runOnUiThread(() -> append(result));
        }).start();
    }

    private void copyReport() {
        ClipboardManager c = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (c != null) {
            c.setPrimaryClip(ClipData.newPlainText("MTS debug report", report.toString()));
            Toast.makeText(this, "Диагностический отчёт скопирован", Toast.LENGTH_SHORT).show();
        }
    }

    private void shareReport() {
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, report.toString());
            startActivity(Intent.createChooser(i, "Поделиться диагностикой"));
        } catch (Exception e) {
            append("Невозможно открыть меню обмена: " + e.toString());
        }
    }

    private void append(String line) {
        String time = new SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(new Date());
        report.append("[").append(time).append("] ").append(line).append("\n");
        if (reportView != null) reportView.setText(report.toString());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
