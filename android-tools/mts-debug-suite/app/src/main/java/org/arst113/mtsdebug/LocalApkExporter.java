package org.arst113.mtsdebug;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Enumeration;

/**
 * Serves a single installed package APK via a temporary one-shot LAN HTTP link.
 * Does not require ADB, root, or storage permission.
 * No APK or personal information is uploaded to an external service.
 */
public final class LocalApkExporter {
    public interface Callback { void message(String msg); }
    private static final String TAG="MtsApkExport";
    private static final int PORT=8765;
    private static volatile boolean active=false;

    public static void start(Activity activity, String packageName, Callback callback) {
        if(active){callback.message("Экспорт уже активен. Используй показанную ранее ссылку.");return;}
        File apk;
        try {
            ApplicationInfo app=activity.getPackageManager().getApplicationInfo(packageName,0);
            String path=app.publicSourceDir!=null?app.publicSourceDir:app.sourceDir;
            apk=new File(path);
            if(!apk.isFile() || !apk.canRead()){
                callback.message("APK найден, но Android не разрешает прочитать "+path);
                return;
            }
        }catch(PackageManager.NameNotFoundException ex){
            callback.message("Пакет "+packageName+" не обнаружен. На этой прошивке имя может отличаться.");
            return;
        }catch(Exception ex){
            callback.message("Не удалось получить системный APK: "+ex.getClass().getSimpleName());
            return;
        }
        final File file=apk;
        final int nonce=new SecureRandom().nextInt(900000)+100000;
        final String expected="/oem-"+nonce+".apk";
        active=true;
        new Thread(()->{
            try(ServerSocket server=new ServerSocket(PORT)){
                server.setSoTimeout(300000);
                String ip=localIp();
                report(activity,callback,
                    "OEMServiceClient APK найден: "+file.length()+" байт.\n"
                    +"Открой НА ТЕЛЕФОНЕ в той же Wi-Fi сети:\n"
                    +"http://"+ip+":"+PORT+expected+"\n"
                    +"Ссылка действует пять минут и закрывается после скачивания.\n"
                    +"Затем пришли скачанный APK в чат для анализа REA.");
                long until=System.currentTimeMillis()+300000;
                boolean sent=false;
                while(System.currentTimeMillis()<until && !sent){
                    try(Socket socket=server.accept()){
                        socket.setSoTimeout(4500);
                        BufferedReader request=new BufferedReader(new InputStreamReader(
                            socket.getInputStream(),StandardCharsets.ISO_8859_1));
                        String start=request.readLine();
                        if(start==null)continue;
                        String[] parts=start.split(" ");
                        String verb=parts.length>0?parts[0]:"";
                        String path=parts.length>1?parts[1]:"";
                        OutputStream out=new BufferedOutputStream(socket.getOutputStream());
                        if(!verb.equals("GET") || !path.equals(expected)){
                            byte[] bytes="Not found".getBytes(StandardCharsets.UTF_8);
                            out.write(("HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: "
                                +bytes.length+"\r\nConnection: close\r\n\r\n")
                                .getBytes(StandardCharsets.US_ASCII));
                            out.write(bytes);
                            out.flush();
                            continue;
                        }
                        out.write(("HTTP/1.1 200 OK\r\n"
                            +"Content-Type: application/vnd.android.package-archive\r\n"
                            +"Content-Disposition: attachment; filename=\"OEMServiceClient-DV8235.apk\"\r\n"
                            +"Content-Length: "+file.length()+"\r\n"
                            +"Cache-Control: no-store\r\n"
                            +"Connection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        try(BufferedInputStream input=new BufferedInputStream(new FileInputStream(file))){
                            byte[] buffer=new byte[32768];
                            int n;
                            while((n=input.read(buffer))!=-1)out.write(buffer,0,n);
                        }
                        out.flush();
                        sent=true;
                        report(activity,callback,"APK передан устройству в локальной сети. Ссылка закрыта.\n"
                            +"Отправь OEMServiceClient-DV8235.apk в чат — REA сможет разобрать SET ADB TRUE.");
                    }catch(java.net.SocketTimeoutException ex){
                        break;
                    }catch(java.net.SocketException ex){
                        report(activity,callback,"Ошибка локальной передачи: "+ex.getMessage());
                    }catch(java.io.IOException ex){
                        report(activity,callback,"Ошибка чтения APK: "+ex.getMessage());
                    }
                }
                if(!sent)report(activity,callback,"Срок ссылки истёк или передача не завершена. Повтори экспорт.");
            }catch(Exception ex){
                Log.e(TAG,"Server",ex);
                report(activity,callback,"Не удалось запустить локальную передачу: "+ex.getClass().getSimpleName()
                    +" ("+ex.getMessage()+")");
            }finally{active=false;}
        },"local-apk-export").start();
    }

    private static void report(Activity a,Callback c,String message){
        a.runOnUiThread(()->c.message(message));
    }
    private static String localIp(){
        try{
            Enumeration<NetworkInterface> list=NetworkInterface.getNetworkInterfaces();
            while(list!=null&&list.hasMoreElements()){
                NetworkInterface nic=list.nextElement();
                if(!nic.isUp()||nic.isLoopback())continue;
                if(!nic.getName().matches("wlan[0-9]+|eth[0-9]+|en[0-9]+"))continue;
                Enumeration<InetAddress> ips=nic.getInetAddresses();
                while(ips.hasMoreElements()){
                    InetAddress a=ips.nextElement();
                    if(a instanceof Inet4Address&&a.isSiteLocalAddress())return a.getHostAddress();
                }
            }
        }catch(Exception ignored){}
        return "IP_ПРИСТАВКИ";
    }
}
