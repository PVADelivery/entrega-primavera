package com.mt24horasexpress.entregador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeliveryOverlay")
public class DeliveryOverlayPlugin extends Plugin {

    public static final String PREFS_NAME = "mt24horas_entregador";

    public static DeliveryOverlayPlugin instance;
    private static String pendingAcceptedDeliveryId = null;

    public static String latestDetails = "";
    public static String latestDeliveryId = "";
    public static String latestStore = "";
    public static String latestPickup = "";
    public static String latestDropoff = "";
    public static String latestFee = "";

    private final BroadcastReceiver callReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();
            String deliveryId = intent.getStringExtra("deliveryId");
            if (IncomingCallActivity.ACTION_CALL_ACCEPTED.equals(action)) {
                setPendingAccepted(deliveryId);
                triggerDeliveryAccepted(deliveryId);
                triggerCallResponse("accepted", deliveryId);
            } else if (IncomingCallActivity.ACTION_CALL_REJECTED.equals(action)) {
                triggerDeliveryDeclined(deliveryId);
                triggerCallResponse("rejected", deliveryId);
            }
        }
    };

    @Override
    public void load() {
        super.load();
        instance = this;
        IntentFilter filter = new IntentFilter();
        filter.addAction(IncomingCallActivity.ACTION_CALL_ACCEPTED);
        filter.addAction(IncomingCallActivity.ACTION_CALL_REJECTED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(callReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(callReceiver, filter);
        }
    }

    public void triggerFcmTokenRefresh(String token) {
        JSObject ret = new JSObject();
        ret.put("token", token);
        notifyListeners("onFcmTokenRefresh", ret);
    }

    public void triggerDeliveryDeclined(String deliveryId) {
        JSObject ret = new JSObject();
        ret.put("deliveryId", deliveryId);
        notifyListeners("onDeliveryDeclined", ret);
    }

    public static void setPendingAccepted(String deliveryId) {
        pendingAcceptedDeliveryId = deliveryId;
    }

    public void triggerDeliveryAccepted(String deliveryId) {
        if (deliveryId == null || deliveryId.isEmpty()) return;
        pendingAcceptedDeliveryId = deliveryId;
        JSObject ret = new JSObject();
        ret.put("deliveryId", deliveryId);
        notifyListeners("onDeliveryAccepted", ret);
    }

    public void triggerCallResponse(String status, String deliveryId) {
        JSObject ret = new JSObject();
        if (deliveryId != null) {
            ret.put("deliveryId", deliveryId);
        }
        ret.put("status", status);
        notifyListeners("onCallResponse", ret);
    }

    @PluginMethod
    public void getPendingAcceptedDelivery(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("deliveryId", pendingAcceptedDeliveryId != null ? pendingAcceptedDeliveryId : "");
        pendingAcceptedDeliveryId = null;
        call.resolve(ret);
    }

    @PluginMethod
    public void getPendingFcmToken(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String token = prefs.getString("pending_fcm_token", "");
        JSObject ret = new JSObject();
        ret.put("token", token);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void checkOverlayPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.os.PowerManager pm = (android.os.PowerManager) getContext()
                        .getSystemService(Context.POWER_SERVICE);
                String pkg = getContext().getPackageName();
                boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(pkg);
                ret.put("ignoring", ignoring);
                Boolean prompt = call.getBoolean("prompt", false);
                if (!ignoring && Boolean.TRUE.equals(prompt)) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:" + pkg));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                }
            } else {
                ret.put("ignoring", true);
            }
        } catch (Exception e) {
            ret.put("ignoring", false);
            ret.put("error", e.getMessage());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void startOverlay(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), OverlayService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception e) {
            android.util.Log.w("DeliveryOverlayPlugin", "Erro ao iniciar serviço em segundo plano: " + e.getMessage());
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopOverlay(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), OverlayService.class);
            getContext().stopService(intent);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void testIncomingCall(PluginCall call) {
        // Desativado: Usar única e exclusivamente o Card Flutuante Oficial MT 24 Horas
        call.resolve();
    }

    @PluginMethod
    public void updateIncomingCall(PluginCall call) {
        final String details = call.getString("details", "");
        final String deliveryId = call.getString("deliveryId", "");
        final String storeName = call.getString("storeName", "");
        final String pickup = call.getString("pickup", "");
        final String dropoff = call.getString("dropoff", "");
        final String fee = call.getString("fee", "");

        latestDetails = details;
        latestDeliveryId = deliveryId;
        if (!storeName.isEmpty()) latestStore = storeName;
        if (!pickup.isEmpty()) latestPickup = pickup;
        if (!dropoff.isEmpty()) latestDropoff = dropoff;
        if (!fee.isEmpty()) latestFee = fee;

        if (IncomingCallActivity.instance != null) {
            IncomingCallActivity.instance.runOnUiThread(() -> {
                IncomingCallActivity.instance.updateCall(details, deliveryId, storeName, pickup, dropoff, fee);
            });
        } else {
            Intent intent = new Intent(IncomingCallActivity.ACTION_UPDATE_CALL);
            intent.putExtra("details", details);
            intent.putExtra("deliveryId", deliveryId);
            intent.putExtra("storeName", storeName);
            intent.putExtra("pickup", pickup);
            intent.putExtra("dropoff", dropoff);
            intent.putExtra("fee", fee);
            intent.setPackage(getContext().getPackageName());
            getContext().sendBroadcast(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void saveDriverContext(PluginCall call) {
        String driverId = call.getString("driverId", "");
        String userToken = call.getString("userToken", "");
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString("driver_id", driverId)
                .putString("user_token", userToken)
                .apply();
        call.resolve();
    }

    @PluginMethod
    public void reportCallResult(PluginCall call) {
        final boolean success = Boolean.TRUE.equals(call.getBoolean("success", false));
        final String message = call.getString("message", "");
        if (IncomingCallActivity.instance != null) {
            IncomingCallActivity.instance.onCallResult(success, message);
        }
        call.resolve();
    }

    @PluginMethod
    public void dismissIncomingCall(PluginCall call) {
        if (IncomingCallActivity.instance != null) {
            IncomingCallActivity.instance.runOnUiThread(() -> {
                IncomingCallActivity.instance.finish();
            });
        } else {
            Intent intent = new Intent(IncomingCallActivity.ACTION_CANCEL_CALL);
            intent.setPackage(getContext().getPackageName());
            getContext().sendBroadcast(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelDeliveryNotification(PluginCall call) {
        String deliveryId = call.getString("deliveryId", "");
        if (deliveryId != null && !deliveryId.isEmpty()) {
            MyFirebaseMessagingService.dismissDeliveryAlert(getContext(), deliveryId);
        }
        call.resolve();
    }

    @PluginMethod
    public void showDeliveryCard(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void hideDeliveryCard(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setDriverOnlineStatus(PluginCall call) {
        Boolean isOnline = call.getBoolean("isOnline", true);
        getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean("is_online", Boolean.TRUE.equals(isOnline))
                .apply();
        call.resolve();
    }

    @PluginMethod
    public void stopNativeAudio(PluginCall call) {
        NativeSoundPlayer.stopSound();
        call.resolve();
    }

    @PluginMethod
    public void playNativeAudio(PluginCall call) {
        NativeSoundPlayer.playDeliveryAlert(getContext());
        call.resolve();
    }
}
