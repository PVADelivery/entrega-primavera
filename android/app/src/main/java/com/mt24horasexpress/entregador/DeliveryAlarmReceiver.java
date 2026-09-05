package com.mt24horasexpress.entregador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * BroadcastReceiver acionado pelo AlarmManager aos 2 minutos exatos
 * da criação da corrida, garantindo o despertar do aparelho mesmo em Doze Mode.
 */
public class DeliveryAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "DeliveryAlarmReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Alarme de 2 minutos disparado pelo AlarmManager!");

        String deliveryId = intent.getStringExtra("deliveryId");
        String storeName  = intent.getStringExtra("storeName");
        String pickup     = intent.getStringExtra("pickup");
        String dropoff    = intent.getStringExtra("dropoff");
        String fee        = intent.getStringExtra("fee");
        String details    = intent.getStringExtra("details");

        if (deliveryId == null || deliveryId.isEmpty()) {
            Log.w(TAG, "deliveryId ausente no disparo do alarme.");
            return;
        }

        MyFirebaseMessagingService.triggerDeliveryAlertFromAlarm(
                context, deliveryId, storeName, pickup, dropoff, fee, details
        );
    }
}
