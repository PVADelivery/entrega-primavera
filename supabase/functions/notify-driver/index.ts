import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import admin from "npm:firebase-admin@11.11.1";

let saParsed: any = null;

function initFirebase() {
  if (admin.apps && admin.apps.length > 0) return true;
  const firebaseSaJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
  if (!firebaseSaJson) {
    console.warn("FIREBASE_SERVICE_ACCOUNT env var is missing");
    return false;
  }
  try {
    saParsed = typeof firebaseSaJson === "string" ? JSON.parse(firebaseSaJson) : firebaseSaJson;
    admin.initializeApp({
      credential: admin.credential.cert(saParsed)
    });
    console.log("Firebase Admin SDK initialized successfully");
    return true;
  } catch (e: any) {
    console.error("Firebase init failed:", e?.message);
    return false;
  }
}

function b64url(bytes: Uint8Array | string): string {
  const arr = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  arr.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

let cachedOAuthToken: { value: string; exp: number } | null = null;

async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedOAuthToken && cachedOAuthToken.exp - 60 > now) return cachedOAuthToken.value;

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OAuth falhou: ${JSON.stringify(json)}`);
  cachedOAuthToken = { value: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cachedOAuthToken.value;
}

// Conversão transparente de tokens APNs nativos da Apple para FCM Registration Tokens
async function convertApnsToFcm(
  accessToken: string,
  apnsToken: string,
  bundleId = "com.mt24horasexpress.entregador",
): Promise<string | null> {
  const candidateBundles = [
    bundleId,
    "com.mt24horasexpress.entregador",
    "com.mt24horasexpress.delivery",
    "com.mt24horasexpress.cliente",
    "com.primavera.cliente",
    "com.primavera.entregador",
    "com.primavera.lojista",
  ].filter((val, idx, self) => Boolean(val) && self.indexOf(val) === idx);

  for (const bId of candidateBundles) {
    for (const sandbox of [false, true]) {
      try {
        const importRes = await fetch("https://iid.googleapis.com/iid/v1:batchImport", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "access_token_auth": "true",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            application: bId,
            sandbox: sandbox,
            apns_tokens: [apnsToken.trim()],
          }),
        });
        const importData = await importRes.json();
        const mapped = importData?.results?.[0];
        if (mapped?.status === "OK" && mapped.registration_token) {
          console.log(`[APNs->FCM] Convertido com sucesso: bundle=${bId}, sandbox=${sandbox}`);
          return mapped.registration_token;
        }
      } catch (errImport) {
        console.warn(`[APNs->FCM] Falha batchImport bundle ${bId}:`, errImport);
      }
    }
  }
  return null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-application-name',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

function sanitize(input: unknown, max = 120): string {
  const s = String(input ?? "").replace(/[\r\n\t]+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get("NOTIFY_DRIVER_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-webhook-secret") ?? "";
    const authHeader = req.headers.get("authorization") ?? "";

    if (expectedSecret && providedSecret !== expectedSecret && !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const firebaseReady = initFirebase();
    if (!firebaseReady || !saParsed) {
      return new Response(JSON.stringify({ error: 'FIREBASE_SERVICE_ACCOUNT not configured or invalid' }), { status: 500 });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(JSON.stringify({ error: 'Missing Supabase vars' }), { status: 500 });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json();
    const action = payload?.action || payload?.type;

    // ── SUPORTE A REGISTRO DIRETO DE TOKEN DO DISPOSITIVO (iPhone / Android) ──
    if (action === "register_token" || action === "save_token") {
      let rawToken = String(payload.token ?? payload.fcmToken ?? "").trim();
      if (!rawToken) return new Response(JSON.stringify({ error: "token ausente" }), { status: 400, headers: corsHeaders });

      const userId = payload.userId ? String(payload.userId) : null;
      const driverId = payload.driverId ? String(payload.driverId) : null;
      const platform = payload.platform ? String(payload.platform).toLowerCase() : "unknown";
      const appType = payload.app ? String(payload.app).toLowerCase().trim() : "entregador";
      const explicitBundle = payload.bundleId ? String(payload.bundleId).trim() : "com.mt24horasexpress.entregador";
      const now = new Date().toISOString();

      if (/^[0-9a-fA-F]{64,}$/i.test(rawToken)) {
        try {
          const accessToken = await getAccessToken(saParsed);
          const fcmToken = await convertApnsToFcm(accessToken, rawToken, explicitBundle);
          if (fcmToken) rawToken = fcmToken;
        } catch (e) {
          console.warn("[notify-driver] Falha ao converter APNs no registro:", e);
        }
      }

      await adminClient.from("device_tokens").upsert({
        token: rawToken,
        user_id: userId,
        platform,
        app: appType,
        bundle_id: explicitBundle,
        updated_at: now,
      }, { onConflict: "token" });

      if (driverId) {
        await adminClient.from("delivery_drivers").update({ fcm_token: rawToken, updated_at: now }).eq("id", driverId);
      } else if (userId) {
        await adminClient.from("delivery_drivers").update({ fcm_token: rawToken, updated_at: now }).eq("user_id", userId);
        await adminClient.from("delivery_drivers").update({ fcm_token: rawToken, updated_at: now }).eq("id", userId);
      }

      return new Response(JSON.stringify({ registered: true, token: rawToken }), { headers: corsHeaders });
    }

    const record = payload?.record || payload;
    if (!record || !record.id) {
      return new Response(JSON.stringify({ error: 'No record found' }), { status: 400 });
    }

    const status = String(record.status || '').toLowerCase();
    if (status !== 'pending' && status !== 'broadcasted') {
      return new Response(JSON.stringify({ message: 'Status is not pending/broadcasted, ignoring' }), { status: 200 });
    }

    // Busca tokens de motoristas online
    const tokenSet = new Set<string>();
    const onlineUserIds: string[] = [];

    if (record.driver_id) {
      try {
        const { data: driver } = await adminClient
          .from('delivery_drivers')
          .select('fcm_token, user_id, is_online')
          .or(`id.eq.${record.driver_id},user_id.eq.${record.driver_id}`)
          .maybeSingle();

        if (driver?.fcm_token && driver.fcm_token.length > 10 && driver?.is_online === true) {
          tokenSet.add(driver.fcm_token);
        }
        if (driver?.user_id) onlineUserIds.push(driver.user_id);
      } catch (e: any) {
        console.warn("Could not query assigned driver:", e?.message);
      }
    } else {
      try {
        const { data: drivers } = await adminClient
          .from('delivery_drivers')
          .select('fcm_token, user_id, is_online')
          .eq('is_online', true)
          .not('fcm_token', 'is', null);

        for (const d of (drivers ?? [])) {
          if (d?.fcm_token && d.fcm_token.length > 10) {
            tokenSet.add(d.fcm_token);
          }
          if (d?.user_id) onlineUserIds.push(d.user_id);
        }
      } catch (e: any) {
        console.warn("Could not query delivery_drivers:", e?.message);
      }
    }

    // Busca também em device_tokens para incluir iPhones e múltiplos aparelhos do mesmo motorista
    if (onlineUserIds.length > 0) {
      try {
        const { data: devTokens } = await adminClient
          .from("device_tokens")
          .select("token")
          .in("user_id", onlineUserIds)
          .is("disabled_at", null);

        for (const dt of (devTokens ?? [])) {
          const t = String(dt?.token || "").trim();
          if (t.length > 10) tokenSet.add(t);
        }
      } catch (errDev) {
        console.warn("Could not query device_tokens:", errDev);
      }
    }

    const rawTokens = Array.from(tokenSet);
    if (rawTokens.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No registered driver tokens found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Converte tokens APNs hexadecimais (iPhone) para FCM Registration Tokens
    let accessToken: string | null = null;
    try {
      accessToken = await getAccessToken(saParsed);
    } catch (e) {
      console.warn("Failed to get OAuth token for BatchImport:", e);
    }

    const finalTokens: string[] = [];
    for (const t of rawTokens) {
      if (/^[0-9a-fA-F]{64,}$/i.test(t) && accessToken) {
        const converted = await convertApnsToFcm(accessToken, t, "com.mt24horasexpress.entregador");
        if (converted) {
          finalTokens.push(converted);
          adminClient.from("delivery_drivers").update({ fcm_token: converted }).eq("fcm_token", t).then(() => {});
          continue;
        }
      }
      finalTokens.push(t);
    }

    const isRide = payload?.table === 'ride_requests' ||
      record.vehicle_type === 'mototaxi' ||
      record.vehicle_type === 'taxi' ||
      record.type === 'ride' ||
      record.type === 'mototaxi' ||
      record.type === 'taxi' ||
      (!record.company_id && record.pickup_address && record.dropoff_address && !record.order_id);

    const isTaxi = record.vehicle_type === 'taxi' || record.type === 'taxi';

    let storeName = sanitize(record.company_name || record.store_name || '');
    let pickup = sanitize(record.pickup_address || record.origin_address || '');
    let dropoff = sanitize(record.delivery_address || record.address || record.dropoff_address || '');

    if (!isRide && (!storeName || !pickup) && record.company_id) {
      try {
        const { data: comp } = await adminClient
          .from('companies')
          .select('name, address')
          .eq('id', record.company_id)
          .maybeSingle();
        if (comp) {
          if (!storeName && comp.name) storeName = sanitize(comp.name);
          if (!pickup && comp.address) pickup = sanitize(comp.address);
        }
      } catch (e: any) {
        console.warn("Could not query company:", e?.message);
      }
    }

    let notifTitle = '';
    let notifBody = '';

    if (isRide) {
      notifTitle = isTaxi ? '🚕 Nova Corrida de Táxi!' : '🏍️ Nova Corrida de Moto Táxi!';
      if (pickup && dropoff) {
        notifBody = `Embarque: ${pickup} ➔ Destino: ${dropoff}`;
      } else if (pickup) {
        notifBody = `Embarque: ${pickup}`;
      } else if (dropoff) {
        notifBody = `Destino: ${dropoff}`;
      } else {
        notifBody = isTaxi ? 'Nova corrida de táxi disponível' : 'Nova corrida de moto táxi disponível';
      }
    } else {
      notifTitle = storeName ? `🏬 ${storeName}` : 'MT 24 Horas Express - Nova Entrega!';
      if (pickup && dropoff) {
        notifBody = `Retirada: ${pickup} ➔ Entrega: ${dropoff}`;
      } else if (pickup) {
        notifBody = `Retirada: ${pickup}`;
      } else if (dropoff) {
        notifBody = `Entrega: ${dropoff}`;
      } else {
        notifBody = 'Nova entrega disponível';
      }
    }

    const deliveryTag = isRide ? `ride_${record.id}` : `delivery_${record.id}`;

    // Calcula badge count de corridas ativas para o ícone no iPhone
    let deliveryBadge = 1;
    try {
      const { count: availableCount } = await adminClient
        .from("deliveries")
        .select("*", { count: "exact", head: true })
        .or("status.eq.broadcasted,status.eq.available,status.eq.pending");
      if (availableCount && availableCount > 0) deliveryBadge = availableCount;
    } catch (_) {}

    const message = {
      notification: {
        title: notifTitle,
        body: notifBody
      },
      data: {
        type: isRide ? (isTaxi ? 'taxi' : 'mototaxi') : 'delivery',
        deliveryId: String(record.id),
        rideId: String(record.id),
        storeName: String(storeName || (isRide ? (isTaxi ? 'Táxi Express' : 'Moto Táxi Express') : '')),
        pickup: String(pickup || ''),
        dropoff: String(dropoff || ''),
        fee: String(record.price || record.value || record.delivery_fee || (isRide ? (isTaxi ? '15,00' : '10,00') : '8,80')),
        title: notifTitle,
        body: notifBody,
        message: notifBody,
        sound: 'notification_sound.mp3',
        priority: 'high',
        route: isRide ? `/driver?rideId=${record.id}` : `/driver?deliveryId=${record.id}`
      },
      android: {
        priority: 'high' as const,
        collapseKey: deliveryTag,
        notification: {
          channelId: 'mt24_driver_alerts_v40',
          sound: 'ring',
          priority: 'max' as const,
          defaultSound: false,
          defaultVibrateTimings: true,
          visibility: 'public' as const,
          tag: deliveryTag
        }
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
          'apns-topic': 'com.mt24horasexpress.entregador'
        },
        payload: {
          aps: {
            alert: {
              title: notifTitle,
              body: notifBody
            },
            sound: 'notification_sound.mp3',
            badge: deliveryBadge
          }
        }
      },
      tokens: finalTokens
    };

    let response: any = null;
    if (typeof admin.messaging().sendEachForMulticast === 'function') {
      response = await admin.messaging().sendEachForMulticast(message);
    } else {
      const sendPromises = finalTokens.map((token: string) =>
        admin.messaging().send({
          token,
          notification: message.notification,
          data: message.data,
          android: message.android,
          apns: message.apns
        }).then(() => ({ success: true })).catch((err: any) => ({ success: false, error: err?.message }))
      );
      const results = await Promise.all(sendPromises);
      const successCount = results.filter(r => r.success).length;
      response = { successCount, failureCount: results.length - successCount, responses: results };
    }

    console.log(`Push sent to ${finalTokens.length} drivers, success: ${response.successCount}, failure: ${response.failureCount}`);

    return new Response(JSON.stringify({ success: true, response }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error("Error sending push:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
