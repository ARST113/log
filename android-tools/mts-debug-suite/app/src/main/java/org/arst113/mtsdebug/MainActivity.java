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
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.net.Uri;
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
import java.net.NetworkInterface;
import java.net.InetAddress;
import java.net.Inet4Address;
import java.util.Enumeration;
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

        TextView title = text("MTS ADB TOOLBOX 0.4", 25, WHITE, true);
        page.addView(title);
        TextView info = text("Приоритет: настоящие приложения из 4PDA и OEM-компонент.\nСтрелки пульта — выбор, OK — запуск.", 16, 0xffb7cbdd, false);
        page.addView(info);

        section(page, "1. Приложения из инструкций 4PDA");
        page.addView(text("Запуск ОРИГИНАЛЬНЫХ приложений, если они установлены на приставке. Эта утилита не содержит их APK внутри.", 16, 0xffb7cbdd, false));
        button(page, "1. Developer Options Shortcut & Device Info 1.058", () ->
            openDeveloperOptionsTool());
        button(page, "2. Settings App 1.4 (экран APPS / App development)", () ->
            openOriginalApp("settings app",
                "Settings App 1.4 не установлено или не видно. Оригинальный APK опубликован в теме SDMC DV8235 на 4PDA, сообщение №1765.",
                "https://4pda.to/forum/index.php?showtopic=1054076&st=1760"));
        section(page, "2. Способ из 4PDA: OEMServiceClient");
        page.addView(text("На SDMC DV8235: системные приложения → OEMServiceClient → Открыть → SET ADB TRUE. На ZTE B866 компонент может отсутствовать. Метод не запускается автоматически.", 15, 0xffffd09e, false));
        button(page, "Найти и открыть OEMServiceClient", this::openOemServiceClient);

        section(page, "3. Проверка результата");
        button(page, "Проверить ADB и показать IP приставки", this::adbDiagnostics);
        button(page, "Скопировать журнал для диагностики", this::copyReport);

        section(page, "4. Дополнительные инструменты");
        LinearLayout extras = new LinearLayout(this);
        extras.setOrientation(LinearLayout.VERTICAL);
        extras.setVisibility(View.GONE);
        button(page, "Показать / скрыть технические варианты", () -> {
            extras.setVisibility(extras.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
        });
        button(extras, "Открыть стандартные настройки разработчика", () ->
            launch(new LaunchTarget("Обычный экран Android Developer Options",
                new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))));
        button(extras, "Открыть Android TV Settings", () -> launchPackage("com.android.tv.settings"));
        button(extras, "Найти экспортированные системные Activity", this::scanActivities);
        foundActivities = new LinearLayout(this);
        foundActivities.setOrientation(LinearLayout.VERTICAL);
        extras.addView(foundActivities);
        button(extras, "Проверить порт 5555", this::probePort);
        button(extras, "Root и загрузчик: только диагностика", this::rootDiagnostics);
        button(extras, "Проверить наличие su", this::confirmSuCheck);
        button(extras, "Попытаться включить ADB через существующие системные права",
            this::confirmPrivilegedAdb);
        button(extras, "Попытаться включить ADB через существующий root",
            this::confirmRoot);
        page.addView(extras);

        section(page, "5. Журнал и результаты");
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
        adbDiagnostics();
    }

    private void openDeveloperOptionsTool() {
        String pkg = "options.developer.com.developeroptions";
        try {
            getPackageManager().getApplicationInfo(pkg, 0);
            append("Найден оригинальный Developer Options Shortcut: " + pkg);
            launchPackage(pkg);
        } catch (PackageManager.NameNotFoundException e) {
            openOriginalApp("developer options shortcut",
                "Оригинальный Developer Options Shortcut & Device Info 1.058 не обнаружен. Его APK уже есть в ARST113/log (a.apk).",
                "https://cdn.jsdelivr.net/gh/ARST113/log@apk-downloads/a.apk");
        }
    }

    @SuppressWarnings("deprecation")
    private void openOriginalApp(String searchLabel, String missingMessage, String source) {
        PackageManager pm = getPackageManager();
        String exact = searchLabel.toLowerCase(Locale.ROOT);
        String selected = null;
        int best = Integer.MAX_VALUE;
        try {
            for (ApplicationInfo info : pm.getInstalledApplications(0)) {
                String label = String.valueOf(pm.getApplicationLabel(info)).toLowerCase(Locale.ROOT).trim();
                String packageName = info.packageName.toLowerCase(Locale.ROOT);
                int rank = label.equals(exact) ? 0
                    : label.startsWith(exact) ? 1
                    : label.contains(exact) ? 2
                    : packageName.contains(exact.replace(" ", "")) ? 3 : 100;
                if (rank < best) { selected = info.packageName; best = rank; }
            }
        } catch (Exception e) {
            append("Не удалось проверить установленные приложения: " + e.toString());
        }
        if (selected != null && best < 100) {
            append("Найдено приложение " + selected + " (совпадение=" + best + ")");
            launchPackage(selected);
        } else {
            append(missingMessage);
            new AlertDialog.Builder(this)
                .setTitle("Программа не найдена")
                .setMessage(missingMessage + "\n\nОткрыть страницу с оригинальной программой?")
                .setNegativeButton("Закрыть", (d, w) -> {})
                .setPositiveButton("Открыть", (d, w) -> openUrl(source))
                .show();
        }
    }

    @SuppressWarnings("deprecation")
    private void openOemServiceClient() {
        PackageManager pm = getPackageManager();
        ArrayList<ApplicationInfo> found = new ArrayList<>();
        try {
            for (ApplicationInfo info : pm.getInstalledApplications(0)) {
                String label = String.valueOf(pm.getApplicationLabel(info)).toLowerCase(Locale.ROOT);
                String pkg = info.packageName.toLowerCase(Locale.ROOT);
                if (label.contains("oemserviceclient") || pkg.contains("oemserviceclient")) {
                    found.add(info);
                }
            }
        } catch (Exception e) {
            append("OEMServiceClient: ошибка перечня пакетов — " + e);
        }
        if (found.isEmpty()) {
            append("OEMServiceClient отсутствует или не обнаружен в этой прошивке.");
            new AlertDialog.Builder(this).setTitle("OEMServiceClient не обнаружен")
                .setMessage("Метод SET ADB TRUE описан для SDMC DV8235. На текущей приставке компонент не найден. Проверь системные приложения вручную: Настройки → Приложения → Показать системные приложения.")
                .setPositiveButton("Понятно", (d, w) -> {})
                .show();
            return;
        }
        for (ApplicationInfo info : found) {
            String pkg = info.packageName;
            append("OEMServiceClient найден: " + pkg + " (uid=" + info.uid + ")");
            Intent main = pm.getLaunchIntentForPackage(pkg);
            if (main != null) {
                launch(new LaunchTarget("OEMServiceClient " + pkg, main));
                return;
            }
            try {
                PackageInfo pi = pm.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES);
                if (pi.activities != null) {
                    for (ActivityInfo activity : pi.activities) {
                        if (activity.exported && activity.enabled) {
                            if (launch(explicit("OEMServiceClient: " + activity.name, pkg, activity.name))) {
                                append("В интерфейсе OEMServiceClient найди кнопку SET ADB TRUE.");
                                return;
                            }
                        }
                    }
                }
            } catch (Exception ex) { append("OEMServiceClient: " + ex); }
            Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + pkg));
            if (launch(new LaunchTarget("Сведения о системном OEMServiceClient", details))) {
                append("В сведениях о приложении попробуй кнопку «Открыть» → SET ADB TRUE.");
                return;
            }
        }
        append("OEMServiceClient обнаружен, но прошивка заблокировала все доступные способы открытия.");
    }

    private void openUrl(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (Exception e) { append("Не удалось открыть страницу: " + e); }
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

    private int adbActivityPriority(String name) {
        if (name.contains("adb") || name.contains("development") || name.contains("debug")) return 0;
        if (name.contains("usb") || name.contains("wireless")) return 1;
        if (name.contains("about") || name.contains("deviceinfo")) return 2;
        return 3;
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
                    Arrays.sort(pi.activities, (a, b) -> {
                        String x = a.name.toLowerCase(Locale.ROOT);
                        String y = b.name.toLowerCase(Locale.ROOT);
                        int sx = adbActivityPriority(x), sy = adbActivityPriority(y);
                        return sx != sy ? Integer.compare(sx, sy) : x.compareTo(y);
                    });
                    for (ActivityInfo activity : pi.activities) {
                        String n = activity.name.toLowerCase(Locale.ROOT);
                        if (!activity.enabled || !activity.exported) continue;
                        if (!(n.contains("develop") || n.contains("debug")
                            || n.contains("deviceinfo") || n.contains("about")
                            || n.contains("setting") || n.contains("adb")
                            || n.contains("wireless") || n.contains("usb"))) continue;
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

    private void adbDiagnostics() {
        append("ADB: Неразрушающая проверка. Статус службы и свойства не подтверждают USB-авторизацию.");
        append("ADB init.svc.adbd=" + prop("init.svc.adbd")
            + ", init.svc.usbd=" + prop("init.svc.usbd"));
        append("ADB ro.adb.secure=" + prop("ro.adb.secure")
            + ", sys.usb.state=" + prop("sys.usb.state"));
        append("ADB persist.adb.tcp.port=" + prop("persist.adb.tcp.port")
            + ", service.adb.tcp.port=" + prop("service.adb.tcp.port"));
        append("ADB: Действительные значения adb_enabled и adb_wifi_enabled скрыты от сторонних приложений.");
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces != null) {
                while (interfaces.hasMoreElements()) {
                    NetworkInterface network = interfaces.nextElement();
                    if (!network.isUp() || network.isLoopback()) continue;
                    Enumeration<InetAddress> addresses = network.getInetAddresses();
                    while (addresses.hasMoreElements()) {
                        InetAddress address = addresses.nextElement();
                        if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                            append("IP приставки: " + network.getName() + " = " + address.getHostAddress());
                        }
                    }
                }
            }
        } catch (Exception e) {
            append("Сетевые адреса недоступны: " + e);
        }
        append("Проверка с компьютера: adb devices (USB), или adb connect IP:ПОРТ при уже разрешённой сетевой отладке.");
    }

    private void confirmPrivilegedAdb() {
        boolean allowed = checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS")
            == PackageManager.PERMISSION_GRANTED;
        if (!allowed) {
            append("ADB: WRITE_SECURE_SETTINGS не предоставлено; обычное приложение не имеет права включать отладку напрямую.");
            new AlertDialog.Builder(this)
                .setTitle("Системных прав нет")
                .setMessage("Android не предоставил WRITE_SECURE_SETTINGS. Этот метод без root или системной подписи недоступен. Попробуй открыть параметры разработчика или проверку su.")
                .setPositiveButton("Понятно", (d, w) -> {})
                .show();
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("ADB: системный метод")
            .setMessage("Подтверждаешь изменение системных параметров development_settings_enabled и adb_enabled? Этот способ доступен только при уже предоставленных привилегиях.")
            .setNegativeButton("Отмена", (d, w) -> {})
            .setPositiveButton("Включить", (d, w) -> {
                try {
                    boolean dev = Settings.Global.putInt(getContentResolver(),
                        Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 1);
                    boolean adb = Settings.Global.putInt(getContentResolver(),
                        Settings.Global.ADB_ENABLED, 1);
                    append("ADB системный метод: запись Dev=" + dev + ", USB ADB=" + adb
                        + ". Это не подтверждение активной ADB-сессии. Проверь подключение на компьютере.");
                    adbDiagnostics();
                } catch (SecurityException e) {
                    append("ADB системный метод: запрещено прошивкой — " + e.toString());
                } catch (Exception e) {
                    append("ADB системный метод: ошибка — " + e.toString());
                }
            })
            .show();
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
