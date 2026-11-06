package org.arst113.mtsdebug;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.IBinder;
import android.os.Parcel;
import android.os.RemoteException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

public final class OemBinderProbe {
    private static final String PKG="ru.smart_itech.oem";
    private static final String INTERFACE="ru.smart_itech.oem_api.IOemService";
    // Decompiled from original OEMServiceClient-DV8235.apk, not guessed.
    private static final int SET_ADB_TRANSACTION=39;

    public static String attemptEnable(Activity activity) {
        try {
            ApplicationInfo info=activity.getPackageManager().getApplicationInfo(PKG,0);
            if((info.flags & ApplicationInfo.FLAG_SYSTEM)==0)
                return "ПРОПУЩЕНО: пакет ru.smart_itech.oem не является системным";
        }catch(PackageManager.NameNotFoundException ex){
            return "ПРОПУЩЕНО: установленная OEM-служба ru.smart_itech.oem не найдена";
        }catch(Exception ex){
            return "ПРОПУЩЕНО: проверка пакета "+ex.getClass().getSimpleName();
        }
        final AtomicReference<String> state=new AtomicReference<>("TIMEOUT: ответ OEM-службы отсутствует");
        final AtomicBoolean isBound=new AtomicBoolean(false);
        final CountDownLatch finished=new CountDownLatch(1);
        final ServiceConnection connection=new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder){
                new Thread(()->{
                    Parcel data=Parcel.obtain(), reply=Parcel.obtain();
                    try {
                        data.writeInterfaceToken(INTERFACE);
                        data.writeInt(1);
                        boolean supported=binder.transact(SET_ADB_TRANSACTION,data,reply,0);
                        if(supported) {
                            reply.readException();
                            state.set("Binder 39 выполнен без исключения. Проверяем adbd; подтверждения активации пока нет.");
                        } else {
                            state.set("Binder 39 отклонён: неизвестная транзакция");
                        }
                    }catch(SecurityException e){
                        state.set("ДОСТУП ЗАПРЕЩЁН (Binder): "+truncate(e.getMessage()));
                    }catch(RemoteException e){
                        state.set("OEM-служба недоступна: "+truncate(e.getMessage()));
                    }catch(Exception e){
                        state.set("Binder ошибка: "+e.getClass().getSimpleName()+" "+truncate(e.getMessage()));
                    }finally{
                        data.recycle();reply.recycle();finished.countDown();
                    }
                },"oem-binder-39").start();
            }
            @Override public void onServiceDisconnected(ComponentName name){
                state.set("Соединение с OEM-службой прервано");finished.countDown();
            }
            @Override public void onNullBinding(ComponentName name){
                state.set("OEM-служба вернула null Binder");finished.countDown();
            }
            @Override public void onBindingDied(ComponentName name){
                state.set("OEM-служба уничтожила привязку");finished.countDown();
            }
        };
        activity.runOnUiThread(()->{
            try{
                Intent request=new Intent(INTERFACE).setPackage(PKG);
                boolean bound=activity.bindService(request,connection,Context.BIND_AUTO_CREATE);
                isBound.set(bound);
                if(!bound){state.set("bindService=false: сервис не найден или не экспортирован");finished.countDown();}
            }catch(SecurityException e){
                state.set("ДОСТУП ЗАПРЕЩЁН при привязке: "+truncate(e.getMessage()));finished.countDown();
            }catch(Exception e){
                state.set("bindService ошибка: "+e.getClass().getSimpleName()+" "+truncate(e.getMessage()));finished.countDown();
            }
        });
        try{ finished.await(6500,TimeUnit.MILLISECONDS); }
        catch(InterruptedException ex){Thread.currentThread().interrupt();state.set("Операция прервана");}
        finally{
            if(isBound.get())activity.runOnUiThread(()->{
                try{activity.unbindService(connection);}catch(Exception ignored){}
            });
        }
        return state.get();
    }
    private static String truncate(String s){
        if(s==null)return "";return s.length()>250?s.substring(0,250):s;
    }
}
