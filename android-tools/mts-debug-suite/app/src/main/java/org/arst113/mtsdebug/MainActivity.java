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
    private TextView adviceView;
    private LinearLayout extraOptions;
    private final ArrayList<AutoAdbAssistant.Target> autoTargets=new ArrayList<>();
    private boolean autoRunning=false,autoHandoff=false;
    private long lastAutoLaunch=0;
    private int nextAuto=0;


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

        TextView title=text("MTS ADB AUTO 0.5.1",25,WHITE,true);
        page.addView(title);
        page.addView(text("Единая утилита: Developer Options, Device Info, Settings App. Все проверки доступны из одной кнопки.",17,0xffb7cbdd,false));
        section(page,"АВТОМАТИЧЕСКИЙ ПОДБОР ADB");
        button(page,"ЗАПУСТИТЬ АВТОПОДБОР ADB",this::startAutoAdb);
        page.addView(text("Проверяет ADB, права, su, компоненты OEM и открывает доступный экран. После возврата из системных настроек проверка продолжится.",16,0xffffcf9a,false));
        section(page,"Результат анализа");
        adviceView=text("Анализ будет показан после нажатия главной кнопки.",16,0xffcfe7fa,false);
        adviceView.setPadding(dp(8),dp(10),dp(8),dp(10));
        adviceView.setBackgroundColor(0xff192b3b);
        page.addView(adviceView);
        section(page,"Журнал и статистика");
        button(page,"Скопировать отчёт",this::copyReport);
        button(page,"Поделиться отчётом",this::shareReport);
        button(page,"Дополнительные функции (показать / скрыть)",()->
            extraOptions.setVisibility(extraOptions.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));
        extraOptions=new LinearLayout(this);
        extraOptions.setOrientation(LinearLayout.VERTICAL);
        extraOptions.setVisibility(View.GONE);
        button(extraOptions,"Developer Options — настройки разработчика",()->
            launch(new LaunchTarget("Developer Options",new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))));
        button(extraOptions,"Device Info — сведения об устройстве",this::deviceReport);
        button(extraOptions,"Settings App — настройки приложений",()->
            launch(new LaunchTarget("Settings App / Applications",new Intent(Settings.ACTION_APPLICATION_SETTINGS))));
        button(extraOptions,"Settings App — настройки сети",()->
            launch(new LaunchTarget("Settings App / Wireless",new Intent(Settings.ACTION_WIRELESS_SETTINGS))));
        button(extraOptions,"Settings App — сведения о системе",()->
            launch(new LaunchTarget("Settings App / Device",new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))));
        button(extraOptions,"OEMServiceClient — поиск",this::openOemServiceClient);
        button(extraOptions,"Root и загрузчик — диагностика",this::rootDiagnostics);
        button(extraOptions,"ADB: служба и адрес",this::adbDiagnostics);
        page.addView(extraOptions);
        reportView=text("",15,0xffcde5f6,false);
        reportView.setTextIsSelectable(true);
        reportView.setPadding(dp(8),dp(10),dp(8),dp(10));
        reportView.setBackgroundColor(0xff192532);
        page.addView(reportView);
        String prior=getSharedPreferences("adb_diagnostics",MODE_PRIVATE).getString("log","");
        if(!prior.isEmpty()){
            report.append(prior);
            reportView.setText(report.toString());
            adviceView.setText("Восстановлен последний журнал. Проверь строки АDB ПОСЛЕ и выбранные компоненты ниже.");
        }
        append("MTS ADB Auto 0.5.1 запущен. Нажми главную кнопку для нового автоподбора.");
    }

    private void startAutoAdb() {
        if(autoRunning){append("Проверка уже выполняется.");return;}
        autoRunning=true;
        autoHandoff=false;
        nextAuto=0;
        autoTargets.clear();
        report.setLength(0);
        reportView.setText("");
        adviceView.setText("Проверяю локальные способы...");
        getSharedPreferences("adb_diagnostics",MODE_PRIVATE).edit().putString("log","").apply();
        append("Начат автоподбор ADB.");
        AutoAdbAssistant.check(this,r->{
            append(r.log);
            append("ИТОГ: проверок "+r.checks+", запретов "+r.denials
                +", системных экранов "+r.targets.size()+", adbd="+r.adbState);
            autoTargets.addAll(r.targets);
            String adbStatus="running".equals(r.adbState) ? "Служба adbd запущена, требуется авторизация с компьютера." : "Служба adbd не запущена. Найдено "+r.targets.size()+" целевых экранов разработчика. Другие приложения запускаться не будут.";
            adviceView.setText(adbStatus);
            AutoAdbAssistant.analyze(report.toString(),text->
                runOnUiThread(()->adviceView.setText(text)));
            if("running".equals(r.adbState)){
                append("adbd запущен. Проверить авторизацию на ПК: adb devices.");
                autoRunning=false;
                return;
            }
            new android.os.Handler(getMainLooper()).postDelayed(this::openNextAuto,1100);
        });
    }

    private void openNextAuto(){
        while(nextAuto<autoTargets.size()){
            AutoAdbAssistant.Target t=autoTargets.get(nextAuto++);
            if(launch(new LaunchTarget(t.label,t.intent))){
                autoHandoff=true;
                lastAutoLaunch=android.os.SystemClock.elapsedRealtime();
                append("Открыт кандидат "+nextAuto+"/"+autoTargets.size()+": "+t.label
                    +". Если отладка разрешена, включи её и вернись кнопкой «Назад».");
                getSharedPreferences("adb_diagnostics",MODE_PRIVATE).edit()
                    .putString("last_target",t.label).apply();
                return;
            }
        }
        append("Варианты открытия исчерпаны. Системный запрет ADB может оставаться.");
        autoRunning=false;
        autoHandoff=false;
    }

    @Override protected void onResume(){
        super.onResume();
        if(!autoHandoff||!autoRunning)return;
        long elapsed=android.os.SystemClock.elapsedRealtime()-lastAutoLaunch;
        autoHandoff=false;
        long delay=elapsed<900 ? 1000-elapsed : 350;
        new android.os.Handler(getMainLooper()).postDelayed(()->{
            if(!autoRunning)return;
            String state=AutoAdbAssistant.prop("init.svc.adbd");
            append("Возврат из настроек: adbd="+state);
            if("running".equals(state)){
                append("adbd теперь запущен. Проверь ADB-авторизацию на компьютере.");
                autoRunning=false;
            }else openNextAuto();
        },delay);
    }

    @SuppressWarnings("deprecation")
    private void openOemServiceClient() {
        PackageManager pm=getPackageManager();
        int found=0;
        try {
            for(PackageInfo pkg:pm.getInstalledPackages(PackageManager.GET_ACTIVITIES)){
                String label="";
                try{
                    android.content.pm.ApplicationInfo ai=pm.getApplicationInfo(pkg.packageName,0);
                    label=String.valueOf(pm.getApplicationLabel(ai));
                }catch(Exception ignored){}
                String identity=(pkg.packageName+" "+label).toLowerCase(Locale.ROOT);
                if(!identity.contains("oemserviceclient"))continue;
                found++;
                append("OEMServiceClient найден: "+pkg.packageName);
                Intent launcher=pm.getLaunchIntentForPackage(pkg.packageName);
                if(launcher!=null&&launch(new LaunchTarget("OEMServiceClient",launcher)))return;
                if(pkg.activities!=null){
                    for(ActivityInfo activity:pkg.activities){
                        if(!activity.enabled||!activity.exported)continue;
                        if(launch(explicit("OEMServiceClient: "+activity.name,
                                    pkg.packageName,activity.name)))return;
                    }
                }
                Intent details=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    android.net.Uri.parse("package:"+pkg.packageName));
                if(launch(new LaunchTarget("Карточка OEMServiceClient",details)))return;
            }
        }catch(Exception e){
            append("OEMServiceClient: ошибка поиска "+e.getClass().getSimpleName());
        }
        append("OEMServiceClient не найден или заблокирован прошивкой; совпадений="+found);
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
        if (report.length()>18000) report.delete(0, report.length()-16000);
        if (reportView != null) reportView.setText(report.toString());
        getSharedPreferences("adb_diagnostics",MODE_PRIVATE).edit()
            .putString("log",report.toString()).apply();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
