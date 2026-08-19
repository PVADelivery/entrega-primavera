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

    public static final String PREFS_NAME = "eprajadriver";

    public static DeliveryOverlayPlugin instance;
    public static String latestDetails = "";
    public static String latestDeliveryId = "";
    public static String latestStore = "";
    public static String latestPickup = "";
    public static String latestDropoff = "";
    public static String latestFee = "";

    private BroadcastReceiver callReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            String deliveryId = intent.getStringExtra("deliveryId");
            JSObject ret = new JSObject();
            if (deliveryId != null) {
                ret.put("deliveryId", deliveryId);
            }
            if (IncomingCallActivity.ACTION_CALL_ACCEPTED.equals(action)) {
                ret.put("status", "accepted");
                notifyListeners("onCallResponse", ret);
            } else if (IncomingCallActivity.ACTION_CALL_REJECTED.equals(action)) {
                ret.put("status", "rejected");
                notifyListeners("onCallResponse", ret);
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

    public void triggerCallResponse(String status, String deliveryId) {
        JSObject ret = new JSObject();
        if (deliveryId != null) {
            ret.put("deliveryId", deliveryId);
        }
        ret.put("status", status);
        notifyListeners("onCallResponse", ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } else {
            call.resolve();
        }
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
        // Mesmo sem permissão de sobreposição, iniciamos o serviço em primeiro
        // plano: ele mantém o processo vivo para o FCM continuar chegando
        // depois de vários minutos com o app fechado/em segundo plano.
        Intent intent = new Intent(getContext(), OverlayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSObject ret = new JSObject();
        boolean canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || Settings.canDrawOverlays(getContext());
        ret.put("success", true);
        if (!canOverlay) {
            ret.put("reason", "Permissão de sobreposição não concedida (serviço ativo mesmo assim).");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void stopOverlay(PluginCall call) {
        Intent intent = new Intent(getContext(), OverlayService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @PluginMethod
    public void testIncomingCall(PluginCall call) {
        String details = call.getString("details", "Nova entrega próxima a você!");
        String deliveryId = call.getString("deliveryId", "");
        String storeName = call.getString("storeName", "");
        String pickup = call.getString("pickup", "");
        String dropoff = call.getString("dropoff", "");
        String fee = call.getString("fee", "");

        latestDetails = details;
        latestDeliveryId = deliveryId;
        latestStore = storeName;
        latestPickup = pickup;
        latestDropoff = dropoff;
        latestFee = fee;

        Intent intent = new Intent(getContext(), IncomingCallActivity.class);
        intent.putExtra("details", details);
        intent.putExtra("deliveryId", deliveryId);
        intent.putExtra("storeName", storeName);
        intent.putExtra("pickup", pickup);
        intent.putExtra("dropoff", dropoff);
        intent.putExtra("fee", fee);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        getContext().startActivity(intent);
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
            intent.setPackage(getContext().getPackageName()); // FORÇA EXPLICITO
            getContext().sendBroadcast(intent);
        }
        call.resolve();
    }

    /**
     * Salva o contexto do entregador (driver_id + auth token) no SharedPreferences.
     * Chamado pelo JS logo após o login, para que o aceite nativo funcione
     * mesmo quando o app está morto e o JS não está rodando.
     */
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

    /**
     * Recebe do JS o resultado da confirmação do aceite no Supabase e repassa
     * para o card nativo, que só fecha depois desse retorno.
     */
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
}
