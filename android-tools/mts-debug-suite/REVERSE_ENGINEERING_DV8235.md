# SDMC DV8235 OEMServiceClient 1.2 — code analysis

Source: OEMServiceClient-DV8235.apk, sha256 4e9f85d11479916db7cae2c3f2dc472375c74f323db09488ef09f04e24a31386. User-supplied APK is **not committed**.

Manifest package com.dcw.oemserviceclient declares android:sharedUserId="android.uid.system"; activity MainActivity exported.

Decompiler trace:
- MainActivity.onClick -> OEMServiceClient.setAdb(true) for SET ADB TRUE; false for SET ADB FALSE.
- OEMServiceClient.setAdb(boolean) silently returns if mOemService==null; otherwise calls IOemService.setAdbEnabled(boolean), catches RemoteException without visible feedback.
- Service binding: Intent action=ru.smart_itech.oem_api.IOemService, package=ru.smart_itech.oem, BIND_AUTO_CREATE.
- AIDL proxy method writes interface token ru.smart_itech.oem_api.IOemService and int 1 for true, transacts 39, then readException(), method returns void.

The implementation of the privileged service is in package ru.smart_itech.oem, not the supplied APK. Its Binder might enforce calling UID or signature. The original client's android.uid.system sharedUserId may be significant. Ordinary third-party app can safely test bind/transact, but cannot defeat permission checks. Binder success does not prove adbd running. Version 0.7 probes the precise protocol, reports any denial, and reads init.svc.adbd afterward.
