// Edge Function: send-push (Primavera / MT 24 Horas Express)
// Envia notificações push via FCM HTTP v1 usando a Service Account do Firebase.
// Suporta conversão automática de tokens APNs nativos do iOS (Apple) para FCM via Google BatchImport.
import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-application-name',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SA_RAW = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

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

let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;

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
  cachedToken = { value: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cachedToken.value;
}

const RETRY_DELAYS_MS = [400, 1200, 3000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome = "success" | "invalid" | "transient" | "auth" | "quota" | "config";

function classifyFcm(httpStatus: number, json: any): { outcome: Outcome; code: string; message: string } {
  const err = json?.error ?? {};
  const details: any[] = Array.isArray(err.details) ? err.details : [];
  const fcmDetail = details.find((d) => String(d?.["@type"] ?? "").includes("FcmError"));
  const code = String(fcmDetail?.errorCode ?? err.status ?? (httpStatus ? `HTTP_${httpStatus}` : "NETWORK"));
  const message = String(err.message ?? "");

  if (
    code === "UNREGISTERED" ||
    code === "NOT_FOUND" ||
    httpStatus === 404 ||
    (code === "INVALID_ARGUMENT" && /not a valid FCM|registration token|Invalid registration/i.test(message))
  ) {
    return { outcome: "invalid", code: code === "HTTP_404" ? "UNREGISTERED" : code, message };
  }
  if (code === "SENDER_ID_MISMATCH" || httpStatus === 403) return { outcome: "config", code, message };
  if (code === "THIRD_PARTY_AUTH_ERROR" || code === "UNAUTHENTICATED" || httpStatus === 401) {
    return { outcome: "auth", code, message };
  }
  if (code === "QUOTA_EXCEEDED" || httpStatus === 429) return { outcome: "quota", code, message };
  return { outcome: "transient", code, message };
}

type SendResult = {
  ok: boolean;
  status: number;
  attempts: number;
  token: string;
  error?: string;
  invalid?: boolean;
  outcome?: Outcome;
  code?: string;
  response?: unknown;
};

// Conversão transparente de APNs Hex para FCM Registration Token
async function convertApnsToFcm(
  accessToken: string,
  apnsToken: string,
  bundleId: string,
): Promise<string | null> {
  const candidateBundles = [
    bundleId,
    "com.mt24horasexpress.entregador",
    "com.mt24horasexpress.delivery",
    "com.mt24horasexpress.cliente",
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
          console.log(`[APNs->FCM] Convertido com sucesso via bundle ${bId} (sandbox=${sandbox})`);
          return mapped.registration_token;
        }
      } catch (errImport) {
        console.warn(`[APNs->FCM] Falha batchImport bundle ${bId}:`, errImport);
      }
    }
  }
  return null;
}

async function sendToToken(
  reqId: string,
  sa: ServiceAccount,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  isIosToken = false,
  badgeCount = 1,
): Promise<SendResult> {
  const explicitApp = (data.app || data.target || "").toLowerCase();
  const explicitBundle = data.bundleId;

  let targetApp: "marketplace" | "lojista" | "entregador";
  if (explicitApp === "entregador" || explicitApp === "driver" || data.type === "delivery" || data.type === "ride") {
    targetApp = "entregador";
  } else if (explicitApp === "lojista" || explicitApp === "merchant" || explicitApp === "company" || data.type === "new_order" || Boolean(data.companyId)) {
    targetApp = "lojista";
  } else {
    targetApp = "marketplace";
  }

  let defaultBundleId: string;
  let defaultSound: string;
  let channelId: string;

  if (targetApp === "entregador") {
    defaultBundleId = "com.mt24horasexpress.entregador";
    defaultSound = "ring.mp3";
    channelId = "mt24_driver_alerts_v40";
  } else if (targetApp === "lojista") {
    defaultBundleId = "com.mt24horasexpress.delivery";
    defaultSound = "ring.mp3";
    channelId = "mt24_store_orders";
  } else {
    defaultBundleId = "com.mt24horasexpress.cliente";
    defaultSound = "default";
    channelId = "mt24_marketplace_orders";
  }

  const resolvedBundleId = explicitBundle || defaultBundleId;
  const iosSound = defaultSound;

  let targetToken = token.trim();
  const isApnsHex = /^[0-9a-fA-F]{64}$/.test(targetToken);
  if (isApnsHex) {
    const converted = await convertApnsToFcm(accessToken, targetToken, resolvedBundleId);
    if (converted) {
      targetToken = converted;
    }
  }

  const isIos = isIosToken || data.platform === "ios" || data.isIos === "true" || isApnsHex;

  // Payloads otimizados conforme arquitetura homologada do Apple Push Notification Service (APNs)
  const payload = {
    message: {
      token: targetToken,
      // O bloco raiz notification é MANDATÓRIO para o iOS acordar o app e exibir o banner em background/bloqueado
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        title,
        body,
        message: body,
        sound: defaultSound,
        channel_id: channelId,
        priority: "high",
        platform: isIos ? "ios" : "android",
      },
      android: {
        priority: "HIGH",
        ttl: "300s",
        direct_boot_ok: true,
        notification: {
          title,
          body,
          channel_id: channelId,
          sound: "ring",
          notification_priority: "PRIORITY_MAX",
          visibility: "PUBLIC",
          default_sound: false,
          default_vibrate_timings: false,
          vibrate_timings: ["0s", "0.8s", "0.25s", "0.8s", "0.25s", "0.8s"],
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
          "apns-topic": resolvedBundleId,
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: iosSound,
            badge: badgeCount,
          },
        },
      },
    },
  };

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  let last: SendResult = { ok: false, status: 0, attempts: 0, token };

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    last.attempts = attempt + 1;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      last.status = res.status;
      const json = await res.json().catch(() => ({}));
      last.response = json;

      if (res.ok) {
        last.ok = true;
        last.outcome = "success";
        return last;
      }

      const c = classifyFcm(res.status, json);
      last.outcome = c.outcome;
      last.code = c.code;
      last.error = c.message || `HTTP ${res.status}`;
      if (c.outcome === "invalid") {
        last.invalid = true;
        return last;
      }
      if (c.outcome !== "transient" || attempt === RETRY_DELAYS_MS.length) {
        return last;
      }
    } catch (e: any) {
      last.error = e?.message || "Erro de rede";
      last.outcome = "transient";
      if (attempt === RETRY_DELAYS_MS.length) return last;
    }

    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  return last;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    let sa: ServiceAccount | null = null;
    if (SA_RAW) {
      try {
        sa = typeof SA_RAW === "string" ? JSON.parse(SA_RAW) : SA_RAW;
      } catch (e) {
        console.error(`[send-push:${reqId}] Erro ao parsear service account:`, e);
      }
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || body.type;

    // ── 1. REGISTRO E CONVERSÃO DE TOKEN DE DISPOSITIVO (iPhone / Android) ──
    if (action === "register_token" || action === "save_token") {
      let rawToken = String(body.token ?? body.fcmToken ?? "").trim();
      if (!rawToken) return json({ error: "token ausente" }, 400);

      const userId = body.userId ? String(body.userId) : null;
      const driverId = body.driverId ? String(body.driverId) : null;
      const platform = body.platform ? String(body.platform).toLowerCase() : "unknown";
      const appType = body.app ? String(body.app).toLowerCase().trim() : "entregador";
      const explicitBundle = body.bundleId ? String(body.bundleId).trim() : "com.mt24horasexpress.entregador";
      const now = new Date().toISOString();
      const outcome: Record<string, string> = {};

      // Se for token nativo APNs da Apple (64 caracteres hexadecimais), converte automaticamente
      const isApnsHex = /^[0-9a-fA-F]{64}$/.test(rawToken);
      if (isApnsHex && sa) {
        try {
          const accessToken = await getAccessToken(sa);
          const fcmToken = await convertApnsToFcm(accessToken, rawToken, explicitBundle);
          if (fcmToken) {
            console.log(`[send-push:${reqId}] APNs convertido para FCM com sucesso: ${fcmToken.slice(0, 15)}...`);
            rawToken = fcmToken;
            outcome.apns_converted = "ok";
          }
        } catch (errConv) {
          console.warn(`[send-push:${reqId}] Aviso ao converter APNs:`, errConv);
        }
      }

      // Upsert em device_tokens
      const up = await supabase
        .from("device_tokens")
        .upsert(
          {
            token: rawToken,
            user_id: userId,
            platform,
            app: appType,
            bundle_id: explicitBundle,
            updated_at: now,
          },
          { onConflict: "token" },
        );
      outcome.device_tokens = up.error ? `erro: ${up.error.message}` : "ok";

      // Reativa token em caso de quarentena
      await supabase
        .from("device_tokens")
        .update({ disabled_at: null, app: appType, bundle_id: explicitBundle, updated_at: now })
        .eq("token", rawToken);

      // Atualiza na tabela delivery_drivers
      if (driverId) {
        await supabase.from("delivery_drivers").update({ fcm_token: rawToken, updated_at: now }).eq("id", driverId);
      } else if (userId) {
        await supabase.from("delivery_drivers").update({ fcm_token: rawToken, updated_at: now }).eq("user_id", userId);
        await supabase.from("delivery_drivers").update({ fcm_token: rawToken, updated_at: now }).eq("id", userId);
      }

      return json({ registered: true, token: rawToken, outcome });
    }

    // ── 2. CANCELAMENTO DE CORRIDA (UPDATE EVENT: status != pending ou motorista atribuído) ──
    const record = body.record || body;
    const eventType = body.type; // 'INSERT' | 'UPDATE'
    const isCancelled = record.status === 'cancelled' || record.status === 'cancelada';
    const isNoLongerPending = record.status && record.status !== 'pending' && record.status !== 'broadcasted';
    const hasDriverAssigned = Boolean(record.driver_id && record.driver_id !== 'none' && record.driver_id !== '00000000-0000-0000-0000-000000000000');
    const isAcceptedOrFinished = eventType === 'UPDATE' && (isNoLongerPending || hasDriverAssigned);

    if (sa && (isCancelled || isAcceptedOrFinished)) {
      console.log(`[send-push:${reqId}] Corrida ${record.id} aceita ou cancelada (status: ${record.status}). Disparando cancelamento...`);

      let query = supabase
        .from('delivery_drivers')
        .select('fcm_token, user_id')
        .eq('is_online', true)
        .not('fcm_token', 'is', null)
        .neq('fcm_token', '');

      if (!isCancelled && record.driver_id) {
        query = query.neq('id', record.driver_id).neq('user_id', record.driver_id);
      }

      const { data: drivers } = await query;
      const tokens = (drivers || []).map((d: any) => d.fcm_token).filter(Boolean);

      if (tokens.length > 0) {
        const accessToken = await getAccessToken(sa);
        const cancelRequests = tokens.map(async (t: string) => {
          const msg = {
            message: {
              token: t,
              data: {
                type: "cancel_delivery",
                deliveryId: String(record.id),
                rideId: String(record.id),
                status: String(record.status || "accepted"),
              },
              android: { priority: "HIGH", ttl: "120s", direct_boot_ok: true },
              apns: {
                headers: {
                  "apns-priority": "5",
                  "apns-push-type": "background",
                  "apns-topic": "com.mt24horasexpress.entregador",
                },
                payload: {
                  aps: { "content-available": 1 },
                  type: "cancel_delivery",
                  deliveryId: String(record.id),
                },
              },
            },
          };
          return fetch(`https://fcm.googleapis.com/v1/projects/${sa!.project_id}/messages:send`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(msg),
          }).then((r) => r.json()).catch((e) => ({ error: e.message }));
        });
        await Promise.all(cancelRequests);
      }

      return json({ success: true, action: "cancelled", count: tokens.length });
    }

    // ── 3. ENVIO DE NOVA CORRIDA / ENTREGA (INSERT EVENT ou DISPARO DIRETO) ──
    if (!sa) {
      return json({ error: "Configuração do Firebase ausente: configure o secret FIREBASE_SERVICE_ACCOUNT." }, 500);
    }

    const isRideRequest = body.table === 'ride_requests' || record.vehicle_type === 'taxi' || record.vehicle_type === 'mototaxi';
    const isTaxi = record.vehicle_type === 'taxi';

    let companyName = record.company_name || record.store_name || record.company_title || "";
    let pickupAddr = record.pickup_address || record.origin_address || record.store_address || record.pickup_location || "";
    let dropoffAddr = record.delivery_address || record.dropoff_address || record.address || record.destination_address || record.customer_address || "";
    let deliveryFee = Number(record.delivery_fee) || Number(record.driver_fee) || Number(record.value) || Number(record.price) || Number(record.total_value) || 0;

    if (isRideRequest) {
      companyName = isTaxi ? '🚕 Táxi Express' : '🏍️ Moto Táxi Express';
      pickupAddr = pickupAddr || 'Ponto de Embarque';
      dropoffAddr = dropoffAddr || 'Destino do Passageiro';
      deliveryFee = Number(record.price || (isTaxi ? 15.0 : 10.0));
    } else {
      if (record.order_id) {
        const { data: ord } = await supabase.from('orders').select('*').eq('id', record.order_id).maybeSingle();
        if (ord) {
          if (!companyName) companyName = ord.company_name || ord.store_name || ord.company_title || "";
          if (!dropoffAddr) dropoffAddr = ord.delivery_address || ord.customer_address || ord.address || "";
          if (!deliveryFee || deliveryFee === 0) deliveryFee = Number(ord.delivery_fee) || Number(ord.shipping_fee) || 0;
          if (!record.company_id && ord.company_id) record.company_id = ord.company_id;
        }
      }
      const companyId = record.company_id || record.companyId || record.store_id;
      if (companyId) {
        const { data: comp } = await supabase.from('companies').select('name, address').eq('id', companyId).maybeSingle();
        if (comp) {
          companyName = comp.name || companyName || "MT 24 Horas Express";
          if (!pickupAddr && comp.address) pickupAddr = comp.address;
        }
      }
    }

    const norm = (v: unknown, fallback: string) => {
      const s = String(v ?? "").trim();
      return !s || s === "-" || s === "—" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined" ? fallback : s;
    };

    companyName = norm(companyName, isRideRequest ? (isTaxi ? "🚕 Táxi Express" : "🏍️ Moto Táxi") : "MT 24 Horas Express");
    pickupAddr = norm(pickupAddr, isRideRequest ? "Ponto de Embarque" : "Retirada na Loja");
    dropoffAddr = norm(dropoffAddr, isRideRequest ? "Destino do Passageiro" : "Endereço do cliente");
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) deliveryFee = 0;

    const driverEarnings = isRideRequest
      ? deliveryFee
      : ((record.commission && Number(record.commission) > 0)
          ? Number(record.commission)
          : (record.driver_fee && Number(record.driver_fee) > 0)
            ? Number(record.driver_fee)
            : deliveryFee * 0.75);

    const feeText = `R$ ${driverEarnings.toFixed(2).replace('.', ',')}`;

    const formattedDetails = isRideRequest
      ? `🚗 Tipo: ${companyName}\n📍 Origem: ${pickupAddr}\n🏁 Destino: ${dropoffAddr}\n💰 Valor: ${feeText}`
      : `🏬 Loja: ${companyName}\n📍 Coleta: ${pickupAddr}\n🏁 Entrega: ${dropoffAddr}\n💰 Ganhos: ${feeText}`;

    const pushTitle = isRideRequest
      ? (isTaxi ? `🚕 Nova Corrida de Táxi (${feeText})` : `🏍️ Nova Corrida de Moto Táxi (${feeText})`)
      : `🏬 ${companyName}`;

    const pushBody = isRideRequest
      ? (pickupAddr && dropoffAddr ? `Embarque: ${pickupAddr} ➔ Destino: ${dropoffAddr}` : (pickupAddr ? `Embarque: ${pickupAddr}` : `Destino: ${dropoffAddr}`))
      : (pickupAddr && dropoffAddr ? `Retirada: ${pickupAddr} ➔ Entrega: ${dropoffAddr}` : `Entrega: ${dropoffAddr}`);

    // Busca motoristas online
    let query = supabase
      .from('delivery_drivers')
      .select('fcm_token, is_online, vehicle_type, vehicle, service_types, id, user_id')
      .eq('is_online', true);

    if (record.driver_id) {
      query = query.or(`id.eq.${record.driver_id},user_id.eq.${record.driver_id}`);
    }

    const { data: rawDrivers, error: drvErr } = await query;
    if (drvErr || !rawDrivers || rawDrivers.length === 0) {
      return json({ sent: 0, total: 0, warning: "Nenhum motorista online encontrado" });
    }

    // Filtra motoristas habilitados
    const eligibleDrivers = rawDrivers.filter((drv) => {
      const services = Array.isArray(drv.service_types) ? drv.service_types.map((s: any) => String(s).toLowerCase().replace(/_/g, "")) : [];
      const dVeh = String(drv.vehicle_type || drv.vehicle || "").toLowerCase().replace(/_/g, "");

      if (isRideRequest) {
        if (isTaxi) {
          if (services.length > 0) {
            return services.some((s: any) => s.includes("taxi") || s.includes("car") || s.includes("passageiro") || s.includes("corrida"));
          }
          return dVeh.includes("car") || dVeh.includes("taxi") || !dVeh.includes("moto");
        } else {
          if (services.length > 0) {
            return services.some((s: any) => s.includes("mototaxi") || s.includes("moto") || s.includes("passageiro") || s.includes("corrida"));
          }
          return dVeh.includes("moto") || !dVeh.includes("car");
        }
      } else {
        if (services.length > 0) {
          const isExclusiveTaxi = services.every((s: any) => s.includes("taxi") || s.includes("car")) &&
            !services.some((s: any) => s.includes("entrega") || s.includes("delivery") || s.includes("moto") || s.includes("motoboy") || s.includes("encomenda"));
          if (isExclusiveTaxi && !record.driver_id) return false;
        }
        return true;
      }
    });

    if (eligibleDrivers.length === 0) {
      return json({ sent: 0, total: 0, warning: "Nenhum motorista habilitado para esta modalidade" });
    }

    const directTokens = eligibleDrivers.map((d: any) => d.fcm_token).filter((t: string) => t && t.trim().length > 10);
    const onlineUserIds = eligibleDrivers.map((d: any) => d.user_id).filter((u: string) => Boolean(u));

    // Busca tokens em device_tokens para cobrir iPhones e múltiplos dispositivos
    const additionalTokens: string[] = [];
    const tokenPlatformMap = new Map<string, string>();

    if (onlineUserIds.length > 0) {
      const { data: devTokens } = await supabase
        .from("device_tokens")
        .select("token, platform")
        .in("user_id", onlineUserIds)
        .is("disabled_at", null);

      if (devTokens) {
        for (const dt of devTokens) {
          const tk = String(dt?.token || "").trim();
          if (tk.length > 10) {
            additionalTokens.push(tk);
            if (dt.platform) {
              tokenPlatformMap.set(tk, String(dt.platform).toLowerCase());
            }
          }
        }
      }
    }

    const allDriverTokens = Array.from(new Set([...directTokens, ...additionalTokens]));

    // Preenche plataforma também para tokens diretos
    const missingTokens = directTokens.filter((t) => !tokenPlatformMap.has(t));
    if (missingTokens.length > 0) {
      const { data: dtExtra } = await supabase
        .from("device_tokens")
        .select("token, platform")
        .in("token", missingTokens);
      (dtExtra ?? []).forEach((dt: any) => {
        if (dt?.token && dt?.platform) {
          tokenPlatformMap.set(String(dt.token).trim(), String(dt.platform).toLowerCase());
        }
      });
    }

    if (allDriverTokens.length === 0) {
      return json({ sent: 0, total: 0, warning: "Nenhum token FCM/APNs ativo encontrado" });
    }

    // Calcula badge count de entregas ativas para o ícone no iPhone
    let deliveryBadge = 1;
    try {
      const { count: availableCount } = await supabase
        .from("deliveries")
        .select("*", { count: "exact", head: true })
        .or("status.eq.broadcasted,status.eq.available,status.eq.pending");
      if (availableCount && availableCount > 0) {
        deliveryBadge = availableCount;
      }
    } catch (_) {}

    const extraData = {
      type: isRideRequest ? "ride" : "delivery",
      deliveryId: String(record.id),
      rideId: String(record.id),
      address: formattedDetails,
      details: formattedDetails,
      storeName: companyName,
      pickup: pickupAddr,
      dropoff: dropoffAddr,
      fee: feeText,
      title: pushTitle,
      body: pushBody,
      status: String(record.status || "pending"),
      created_at: String(record.created_at || new Date().toISOString()),
      driver_id: String(record.driver_id || ""),
      vehicle_type: String(record.vehicle_type || ""),
      route: isRideRequest ? `/driver?rideId=${record.id}` : `/driver?deliveryId=${record.id}`,
    };

    console.log(`[send-push:${reqId}] Disparando push para ${allDriverTokens.length} dispositivo(s) (iOS/Android)...`);

    const accessToken = await getAccessToken(sa);
    const results = await Promise.all(
      allDriverTokens.map((t: string) => {
        const isIos = tokenPlatformMap.get(t) === "ios" || /^[0-9a-fA-F]{64}$/.test(t);
        return sendToToken(reqId, sa!, accessToken, t, pushTitle, pushBody, extraData, isIos, deliveryBadge);
      }),
    );

    const sent = results.filter((r) => r.ok).length;
    const invalidTokens = results.filter((r) => r.invalid).map((r) => r.token);
    if (invalidTokens.length > 0) {
      await supabase.from("delivery_drivers").update({ fcm_token: null }).in("fcm_token", invalidTokens);
      await supabase.from("device_tokens").update({ disabled_at: new Date().toISOString() }).in("token", invalidTokens);
    }

    return json({
      sent,
      total: allDriverTokens.length,
      invalid: invalidTokens.length,
      results: results.map((r) => ({
        ok: r.ok,
        status: r.status,
        attempts: r.attempts,
        outcome: r.outcome,
        token: `${r.token.slice(0, 12)}…`,
      })),
    });

  } catch (err: any) {
    console.error(`[send-push:${reqId}] Erro fatal:`, err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
