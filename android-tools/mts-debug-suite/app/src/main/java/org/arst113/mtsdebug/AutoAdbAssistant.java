package org.arst113.mtsdebug;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.net.NetworkInterface;
import java.net.InetAddress;
import java.net.Inet4Address;
import java.util.Enumeration;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public final class AutoAdbAssistant {
    public static final class Target {
        public final String label;
        public final Intent intent;
        Target(String label,Intent intent){this.label=label;this.intent=intent;}
    }
    public static final class Result {
        public final String log,adbState;
        public final int checks,denials;
        public final ArrayList<Target> targets;
        Result(String log,String adbState,int checks,int denials,ArrayList<Target> targets){
            this.log=log;this.adbState=adbState;this.checks=checks;
            this.denials=denials;this.targets=targets;
        }
    }
    public interface ResultCallback{void done(Result result);}
    public interface TextCallback{void done(String text);}

    public static void check(Activity activity,ResultCallback callback) {
        new Thread(()->{
            StringBuilder log=new StringBuilder();
            ArrayList<Target> candidates=new ArrayList<>();
            int steps=0,denied=0;
            add(log,"УСТРОЙСТВО: "+Build.MANUFACTURER+" "+Build.MODEL
                +"; Android="+Build.VERSION.RELEASE+"; API="+Build.VERSION.SDK_INT);
            add(log,"СБОРКА: "+Build.DISPLAY+"; "+Build.FINGERPRINT);
            add(log,"ЗАЩИТА: ro.debuggable="+prop("ro.debuggable")
                +", ro.secure="+prop("ro.secure")
                +", verifiedbootstate="+prop("ro.boot.verifiedbootstate"));
            add(log,"ADB ДО: adbd="+prop("init.svc.adbd")
                +", tcp="+prop("service.adb.tcp.port"));
            steps++;
            if(activity.checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS")
                    ==PackageManager.PERMISSION_GRANTED) {
                try{
                    boolean dev=Settings.Global.putInt(activity.getContentResolver(),
                        Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,1);
                    boolean adb=Settings.Global.putInt(activity.getContentResolver(),
                        Settings.Global.ADB_ENABLED,1);
                    add(log,"СИСТЕМНАЯ ЗАПИСЬ: developer="+dev+", adb="+adb);
                }catch(Exception e){denied++;add(log,"СИСТЕМНАЯ ЗАПИСЬ: отказ "+e.getClass().getSimpleName());}
            }else{denied++;add(log,"СИСТЕМНАЯ ЗАПИСЬ: нет разрешения WRITE_SECURE_SETTINGS");}
            steps++;
            String su=cmd(4000,"su","-c","id");
            if(su.contains("uid=0")){
                add(log,"ROOT: uid=0 получен. Пробую включить настройки отладки.");
                String result=cmd(4000,"su","-c",
                    "settings put global development_settings_enabled 1; settings put global adb_enabled 1; setprop ctl.start adbd");
                add(log,"ROOT: "+trim(result,200));
            }else{denied++;add(log,"ROOT: су не предоставлен ("+trim(su,120)+")");}
            steps++;
            try(Socket socket=new Socket()){
                socket.connect(new InetSocketAddress("127.0.0.1",5555),550);
                add(log,"TCP 5555: порт открыт (это не доказывает ADB)");
            }catch(Exception e){add(log,"TCP 5555: порт закрыт");}
            steps++;
            try {
                Enumeration<NetworkInterface> nets=NetworkInterface.getNetworkInterfaces();
                while(nets!=null&&nets.hasMoreElements()){
                    NetworkInterface net=nets.nextElement();
                    if(!net.isUp()||net.isLoopback())continue;
                    Enumeration<InetAddress> addresses=net.getInetAddresses();
                    while(addresses.hasMoreElements()){
                        InetAddress address=addresses.nextElement();
                        if(address instanceof Inet4Address&&!address.isLoopbackAddress()){
                            add(log,"IP приставки: "+net.getName()+"="+address.getHostAddress());
                        }
                    }
                }
            }catch(Exception e){add(log,"IP-адрес не определён: "+e.getClass().getSimpleName());}
            steps++;
            add(log,"OEM Binder: вызов setAdbEnabled(true) по протоколу OEMServiceClient 1.2.");
            String binderResult=OemBinderProbe.attemptEnable(activity);
            add(log,"OEM Binder: "+binderResult);
            steps++;
            if(binderResult.startsWith("ДОСТУП ЗАПРЕЩЁН") || binderResult.startsWith("ПРОПУЩЕНО")
                || binderResult.startsWith("TIMEOUT") || binderResult.startsWith("bindService=false")) denied++;
            try { Thread.sleep(850); } catch(InterruptedException e) { Thread.currentThread().interrupt(); }
            String after=prop("init.svc.adbd");
            add(log,"ADB ПОСЛЕ OEM BINDER: adbd="+after);
            steps++;
            // For Android 12 MTS firmware, the old broad package scan could match
            // KION's developer/debug Activity. Never launch third-party/launcher
            // packages, and never use ACTION_SETTINGS as an automatic fallback.
            Set<String> foundKeys=new HashSet<>();
            int possible=0;
            ArrayList<Target> systemTargets=new ArrayList<>();
            try{
                for(PackageInfo pkg:activity.getPackageManager().getInstalledPackages(
                        PackageManager.GET_ACTIVITIES)){
                    String p=pkg.packageName.toLowerCase(Locale.ROOT);
                    boolean settingsPackage=p.equals("com.android.settings")
                        ||p.equals("com.android.tv.settings")
                        ||p.startsWith("com.zte.") && p.contains("setting");
                    boolean oemServicePackage=p.contains("oemserviceclient");
                    if(!settingsPackage&&!oemServicePackage)continue;
                    if(pkg.applicationInfo==null || (pkg.applicationInfo.flags &
                        android.content.pm.ApplicationInfo.FLAG_SYSTEM)==0)continue;
                    if(pkg.activities==null)continue;
                    for(ActivityInfo info:pkg.activities){
                        if(!info.enabled||!info.exported)continue;
                        String n=info.name.toLowerCase(Locale.ROOT);
                        boolean devActivity=n.contains("development")
                            ||n.contains("developer")||n.contains("wirelessdebug")
                            ||n.contains("usbdebug")||n.contains("adb");
                        boolean serviceActivity=oemServicePackage && n.contains("oemservice");
                        if(!devActivity&&!serviceActivity)continue;
                        if(!foundKeys.add(p+"/"+n))continue;
                        possible++;
                        systemTargets.add(new Target(pkg.packageName+"/"+info.name,
                            new Intent().setComponent(new ComponentName(pkg.packageName,info.name))));
                    }
                }
            }catch(Exception e){add(log,"Поиск OEM: "+e.getClass().getSimpleName());}
            systemTargets.sort(Comparator.comparingInt(t->rank(t.label)));
            add(log,"OEM-сканирование: найдено ЦЕЛЕВЫХ экспортированных Activity="+possible);
            // Original Developer Options Shortcut 1.058 uses this AOSP class
            // and ACTION_APPLICATION_DEVELOPMENT_SETTINGS; these take priority.
            candidates.add(new Target("Developer Options 1.058: com.android.settings.DevelopmentSettings",
                new Intent().setComponent(new ComponentName(
                    "com.android.settings","com.android.settings.DevelopmentSettings"))));
            for(Target t:systemTargets){
                if(candidates.size()>=9)break;
                if(!t.label.equalsIgnoreCase("com.android.settings/com.android.settings.DevelopmentSettings"))
                    candidates.add(t);
            }
            candidates.add(new Target("Developer Options: системный Intent в com.android.settings",
                new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
                    .setPackage("com.android.settings")));
            candidates.add(new Target("Android TV: Developer Options в com.android.tv.settings",
                new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
                    .setPackage("com.android.tv.settings")));
            steps+=1+candidates.size();
            add(log,"АВТОПОДБОР: проверено "+steps+", отказов "+denied+", переходов "+candidates.size());
            Result result=new Result(log.toString(),after,steps,denied,candidates);
            activity.runOnUiThread(()->callback.done(result));
        },"adb-auto").start();
    }
    private static int rank(String s){
        s=s.toLowerCase(Locale.ROOT);
        if(s.contains("oemservice")||s.contains("adb"))return 0;
        if(s.contains("develop")||s.contains("debug"))return 1;
        return 2;
    }
    private static void add(StringBuilder out,String s){out.append(s).append('\n');}
    private static String trim(String s,int max){return s.length()>max?s.substring(0,max):s;}
    public static String prop(String name){
        String s=cmd(1200,"/system/bin/getprop",name);
        int cut=s.lastIndexOf(" [exit=");
        if(cut>=0)s=s.substring(0,cut);
        return s.trim().isEmpty()?"(empty)":trim(s.trim(),120);
    }
    private static String cmd(int ms,String...cmd){
        Process p=null;
        try{
            p=new ProcessBuilder(cmd).redirectErrorStream(true).start();
            if(!p.waitFor(ms,TimeUnit.MILLISECONDS)){p.destroyForcibly();return "timeout";}
            StringBuilder out=new StringBuilder();
            try(BufferedReader b=new BufferedReader(new InputStreamReader(p.getInputStream(),StandardCharsets.UTF_8))){
                String l;while((l=b.readLine())!=null&&out.length()<600)out.append(l).append(" ");
            }
            return out.toString().trim()+" [exit="+p.exitValue()+"]";
        }catch(Exception e){return e.getClass().getSimpleName();}
        finally{if(p!=null)p.destroy();}
    }

    public static void analyze(String report,TextCallback callback){
        String apiKey=BuildConfig.OPENROUTER_API_KEY;
        if(apiKey==null||apiKey.isEmpty()){
            callback.done("Локальная диагностика завершена. Ключ OpenRouter не передан в сборку через защищённый секрет GitHub Actions; онлайн-анализ недоступен.");
            return;
        }
        new Thread(()->{
            HttpURLConnection c=null;
            try{
                c=(HttpURLConnection)new URL("https://openrouter.ai/api/v1/chat/completions").openConnection();
                c.setRequestMethod("POST");c.setDoOutput(true);
                c.setConnectTimeout(8000);c.setReadTimeout(22000);
                c.setRequestProperty("Authorization","Bearer "+apiKey);
                c.setRequestProperty("Content-Type","application/json; charset=utf-8");
                c.setRequestProperty("X-Title","MTS ADB Auto");
                JSONObject body=new JSONObject().put("model","openrouter/free").put("max_tokens",850);
                JSONArray messages=new JSONArray();
                messages.put(new JSONObject().put("role","system").put("content",
                    "Ты специалист по Android TV. По-русски определи, работает ли adbd, что не разрешила система, и какие безопасные шаги доступны. Не утверждай, что ADB включён, пока adbd stopped. Ты только анализируешь, не исполняешь команды."));
                messages.put(new JSONObject().put("role","user").put("content",trim(report,6500)));
                body.put("messages",messages);
                try(OutputStream w=c.getOutputStream()){
                    w.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                int status=c.getResponseCode();
                InputStream stream=status==200?c.getInputStream():c.getErrorStream();
                StringBuilder response=new StringBuilder();
                if(stream!=null){
                    try(BufferedReader b=new BufferedReader(new InputStreamReader(stream,StandardCharsets.UTF_8))){
                        String l;while((l=b.readLine())!=null&&response.length()<10000)response.append(l);
                    }
                }
                if(status!=200){callback.done("OpenRouter HTTP "+status+": "+trim(response.toString(),250));return;}
                JSONArray choices=new JSONObject(response.toString()).getJSONArray("choices");
                String answer=choices.getJSONObject(0).getJSONObject("message").optString("content","");
                callback.done(answer.isEmpty()?"Модель вернула пустой ответ.":answer);
            }catch(Exception e){callback.done("OpenRouter недоступен: "+e.getClass().getSimpleName());}
            finally{if(c!=null)c.disconnect();}
        },"openrouter-analysis").start();
    }
}
