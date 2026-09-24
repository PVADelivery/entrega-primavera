import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { JWT } from "npm:google-auth-library@9"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-application-name',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const record = payload.record
    const oldRecord = payload.old_record
    const eventType = payload.type // 'INSERT' or 'UPDATE'
    
    if (!record) {
      return new Response("No record payload", { status: 200, headers: corsHeaders })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!serviceAccountStr) {
      throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable")
    }
    
    const serviceAccount = JSON.parse(serviceAccountStr)
    const client = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [
        'https://www.googleapis.com/auth/firebase.messaging',
        'https://www.googleapis.com/auth/cloud-platform',
      ],
    })
    
    const accessTokenObj = await client.getAccessToken()
    const accessToken = accessTokenObj.token
    const projectId = serviceAccount.project_id
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

    // Função para resolver APNs device token bruto para FCM Registration Token
    const resolveTokenForFcm = async (rawToken: string): Promise<string> => {
      if (!rawToken) return rawToken;
      // APNs device tokens nativos do iOS têm 64 ou 128 caracteres estritamente hexadecimais
      const isHexApns = /^[0-9a-fA-F]{64}$|^[0-9a-fA-F]{128}$/.test(rawToken);
      if (!isHexApns) {
        return rawToken;
      }

      console.log(`[FCM] Token APNs nativo detectado (${rawToken.slice(0, 16)}...). Convertendo via Firebase batchImport...`);
      const bundleId = "com.mt24horasexpress.entregador";

      // Tenta produção (App Store / TestFlight) e desenvolvimento (Sandbox/Xcode)
      for (const isSandbox of [false, true]) {
        try {
          const res = await fetch("https://iid.googleapis.com/iid/v1:batchImport", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "access_token_auth": "true",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              application: bundleId,
              sandbox: isSandbox,
              apns_tokens: [rawToken]
            })
          });

          const data = await res.json();
          const item = data?.results?.[0];
          if (item?.status === "OK" && item?.token) {
            console.log(`[FCM] Token APNs convertido com SUCESSO para FCM (sandbox: ${isSandbox}): ${item.token.slice(0, 15)}...`);
            
            // Atualiza de forma assíncrona o banco com o novo token FCM
            supabaseClient
              .from('delivery_drivers')
              .update({ fcm_token: item.token })
              .eq('fcm_token', rawToken)
              .then(() => {})
              .catch((e: any) => console.warn("[FCM] Falha ao atualizar fcm_token em delivery_drivers:", e?.message));

            supabaseClient
              .from('device_tokens')
              .update({ token: item.token, updated_at: new Date().toISOString() })
              .eq('token', rawToken)
              .then(() => {})
              .catch((e: any) => console.warn("[FCM] Falha ao atualizar device_tokens:", e?.message));

            return item.token;
          } else {
            console.warn(`[FCM] batchImport retornou status não-OK (sandbox=${isSandbox}):`, JSON.stringify(data));
          }
        } catch (e: any) {
          console.warn(`[FCM] Erro na requisição batchImport (sandbox=${isSandbox}):`, e?.message);
        }
      }

      return rawToken;
    };

    // =========================================================================
    // CASE A: UPDATE EVENT — Delivery accepted or cancelled by store/admin/driver
    // =========================================================================
    const isNoLongerPending = record.status !== 'pending' && record.status !== 'broadcasted'
    const isCancelled = record.status === 'cancelled' || record.status === 'cancelada'
    const hasDriverAssigned = Boolean(record.driver_id && record.driver_id !== 'none' && record.driver_id !== '00000000-0000-0000-0000-000000000000')
    const isAcceptedOrFinished = eventType === 'UPDATE' && (isNoLongerPending || hasDriverAssigned)

    if (isCancelled || isAcceptedOrFinished) {
      console.log(`Corrida ${record.id} aceita ou cancelada (status: ${record.status}, driver_id: ${record.driver_id}). Enviando comando CANCEL_DELIVERY para os entregadores...`)

      let query = supabaseClient
        .from('delivery_drivers')
        .select('fcm_token')
        .not('fcm_token', 'is', null)
        .neq('fcm_token', '')

      // Se a corrida foi aceita por um motorista, não cancela para ele.
      // Se foi CANCELADA pelo lojista/admin, cancela para TODOS os motoristas!
      if (!isCancelled && record.driver_id) {
        query = query.neq('id', record.driver_id).neq('user_id', record.driver_id)
      }

      const { data: drivers } = await query
      if (!drivers || drivers.length === 0) {
        return new Response("No drivers to cancel notification", { status: 200 })
      }

      const tokens = drivers.map(d => d.fcm_token).filter(Boolean)
      const cancelRequests = tokens.map(async (rawToken) => {
        const token = await resolveTokenForFcm(rawToken);
        const message = {
          message: {
            token: token,
            data: {
              type: "cancel_delivery",
              deliveryId: String(record.id),
              rideId: String(record.id),
              status: String(record.status || "accepted")
            },
            android: {
              priority: "HIGH",
              ttl: "120s",
              direct_boot_ok: true
            },
            apns: {
              headers: {
                "apns-priority": "5",
                "apns-push-type": "background"
              },
              payload: {
                aps: {
                  "content-available": 1
                },
                type: "cancel_delivery",
                deliveryId: String(record.id),
                rideId: String(record.id)
              }
            }
          }
        }
        return fetch(fcmUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(message)
        }).then(res => res.json()).catch((e) => ({ error: e.message }))
      })

      const cancelResults = await Promise.all(cancelRequests)
      console.log("FCM Cancel Results:", cancelResults)
      return new Response(JSON.stringify({ success: true, action: "cancelled", count: tokens.length }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    // =========================================================================
    // CASE B: INSERT EVENT (or UPDATE to pending/broadcasted) — New Delivery
    // =========================================================================
    if (record.status !== 'pending' && record.status !== 'broadcasted') {
       return new Response("Not a pending delivery", { status: 200 })
    }

    // Busca detalhes completos da corrida incluindo empresa, endereços de coleta/entrega e taxa do entregador
    let companyName = record.company_name || record.store_name || record.company_title || "";
    let pickupAddr = record.pickup_address || record.origin_address || record.store_address || record.pickup_location || "";
    let dropoffAddr = record.delivery_address || record.dropoff_address || record.address || record.destination_address || record.customer_address || "";
    let deliveryFee = Number(record.delivery_fee) || Number(record.driver_fee) || Number(record.value) || Number(record.price) || Number(record.total_value) || 0;

    const isRideRequest = payload.table === 'ride_requests' || record.vehicle_type === 'taxi' || record.vehicle_type === 'mototaxi';
    const isTaxi = record.vehicle_type === 'taxi';

    if (isRideRequest) {
      companyName = isTaxi ? '🚕 Táxi Express' : '🏍️ Moto Táxi Express';
      pickupAddr = record.pickup_address || 'Ponto de Embarque';
      dropoffAddr = record.dropoff_address || 'Destino do Passageiro';
      deliveryFee = Number(record.price || (isTaxi ? 15.0 : 10.0));
    } else {
      // 1. Se houver order_id, buscar os dados reais do pedido (endereço do cliente, taxa e loja)
      if (record.order_id) {
        const { data: ord } = await supabaseClient
          .from('orders')
          .select('*')
          .eq('id', record.order_id)
          .maybeSingle();

        if (ord) {
          if (!companyName) {
            companyName = ord.company_name || ord.store_name || ord.company_title || "";
          }
          if (!dropoffAddr) {
            dropoffAddr = ord.delivery_address || ord.customer_address || ord.address || "";
            if (!dropoffAddr && ord.street) {
              dropoffAddr = `${ord.street}, ${ord.number || 'S/N'}${ord.neighborhood ? ' - ' + ord.neighborhood : ''}`;
            }
          }
          if (!deliveryFee || deliveryFee === 0) {
            deliveryFee = Number(ord.delivery_fee) || Number(ord.shipping_fee) || Number(ord.driver_fee) || Number(ord.total_delivery_fee) || 0;
          }
          if (!record.company_id && ord.company_id) {
            record.company_id = ord.company_id;
          }
        }
      }

      // 2. Se houver company_id, buscar nome fantasia e endereço oficial da loja
      const companyId = record.company_id || record.companyId || record.store_id;
      if (companyId) {
        const { data: comp } = await supabaseClient
          .from('companies')
          .select('name, address')
          .eq('id', companyId)
          .maybeSingle();
        if (comp) {
          companyName = comp.name || companyName || "MT 24 Horas Express";
          if (!pickupAddr && comp.address) pickupAddr = comp.address;
        }
      }
    }

    // Normalização final: nunca enviar vazio, "-", "—", "null" ou "undefined"
    const norm = (v: unknown, fallback: string) => {
      const s = String(v ?? "").trim()
      if (!s || s === "-" || s === "—" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") {
        return fallback
      }
      return s
    }

    companyName = norm(companyName, isRideRequest ? (isTaxi ? "🚕 Táxi Express" : "🏍️ Moto Táxi") : "MT 24 Horas Express")
    pickupAddr = norm(pickupAddr, isRideRequest ? "Ponto de Embarque" : "Retirada na Loja")
    dropoffAddr = norm(dropoffAddr, isRideRequest ? "Destino do Passageiro" : "Endereço do cliente")
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) deliveryFee = 0

    // Ganhos: 100% da corrida para o motorista de táxi/mototáxi ou 75% da entrega para o motoboy
    const driverEarnings = isRideRequest
      ? deliveryFee
      : ((record.commission && Number(record.commission) > 0)
          ? Number(record.commission)
          : (record.driver_fee && Number(record.driver_fee) > 0)
            ? Number(record.driver_fee)
            : deliveryFee * 0.75);

    const feeText = `R$ ${driverEarnings.toFixed(2).replace('.', ',')}`

    const formattedDetails = isRideRequest
      ? `🚗 Tipo: ${companyName}\n📍 Origem: ${pickupAddr}\n🏁 Destino: ${dropoffAddr}\n💰 Valor: ${feeText}`
      : `🏬 Loja: ${companyName}\n📍 Coleta: ${pickupAddr}\n🏁 Entrega: ${dropoffAddr}\n💰 Ganhos: ${feeText}`

    const pushTitle = isRideRequest
      ? (isTaxi ? `🚕 Nova Corrida de Táxi (${feeText})` : `🏍️ Nova Corrida de Moto Táxi (${feeText})`)
      : `🏬 ${companyName}`;

    const pushBody = isRideRequest
      ? (pickupAddr && dropoffAddr ? `Embarque: ${pickupAddr} ➔ Destino: ${dropoffAddr}` : (pickupAddr ? `Embarque: ${pickupAddr}` : `Destino: ${dropoffAddr}`))
      : (pickupAddr && dropoffAddr ? `Retirada: ${pickupAddr} ➔ Entrega: ${dropoffAddr}` : `Entrega: ${dropoffAddr}`);

    let query = supabaseClient
      .from('delivery_drivers')
      .select('fcm_token, is_online, vehicle_type, vehicle, service_types, id, user_id')
      .eq('is_online', true)
      .not('fcm_token', 'is', null)
      .neq('fcm_token', '');

    if (record.driver_id) {
       query = query.or(`id.eq.${record.driver_id},user_id.eq.${record.driver_id}`);
    }

    const { data: rawDrivers, error } = await query;

    if (error || !rawDrivers || rawDrivers.length === 0) {
      console.log("Nenhum entregador online com token FCM encontrado");
      return new Response("No drivers with push tokens found", { status: 200 });
    }

    // Filtra motoristas estritamente habilitados para o tipo de serviço (Corrida vs Entrega)
    const drivers = rawDrivers.filter(drv => {
      const services = Array.isArray(drv.service_types) ? drv.service_types.map((s: any) => String(s).toLowerCase().replace(/_/g, "")) : [];
      const dVeh = String(drv.vehicle_type || drv.vehicle || "").toLowerCase().replace(/_/g, "");

      if (isRideRequest) {
        // Se for corrida de passageiro (Táxi ou Moto Táxi)
        if (isTaxi) {
          // Táxi (Carro)
          if (services.length > 0) {
            return services.some((s: any) => s.includes("taxi") || s.includes("car") || s.includes("passageiro") || s.includes("corrida"));
          }
          return dVeh.includes("car") || dVeh.includes("taxi") || !dVeh.includes("moto");
        } else {
          // Moto Táxi
          if (services.length > 0) {
            return services.some((s: any) => s.includes("mototaxi") || s.includes("moto") || s.includes("passageiro") || s.includes("corrida"));
          }
          return dVeh.includes("moto") || !dVeh.includes("car");
        }
      } else {
        // Se for entrega de pedidos/encomendas
        if (services.length > 0) {
          const isExclusiveTaxi = services.every((s: any) => s.includes("taxi") || s.includes("car")) &&
            !services.some((s: any) => s.includes("entrega") || s.includes("delivery") || s.includes("moto") || s.includes("motoboy") || s.includes("encomenda"));
          if (isExclusiveTaxi && !record.driver_id) return false;
        }
        return true;
      }
    });

    if (drivers.length === 0) {
      console.log("Nenhum motorista habilitado para este tipo de corrida/entrega");
      return new Response("No eligible drivers found", { status: 200 });
    }

    const tokens = drivers.map(d => d.fcm_token).filter(Boolean)
    console.log(`Enviando push para ${tokens.length} dispositivos elegíveis...`)

    // Firebase HTTP v1 API aceita apenas 1 mensagem por request
    const requests = tokens.map(async (rawToken) => {
      const token = await resolveTokenForFcm(rawToken);
      const message = {
        message: {
          token: token,
          notification: {
            title: pushTitle,
            body: pushBody,
          },
          data: {
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
            vehicle_type: String(record.vehicle_type || "")
          },
          android: {
            priority: "HIGH",
            ttl: "300s",
            direct_boot_ok: true,
            notification: {
              title: pushTitle,
              body: pushBody,
              channel_id: "mt24_delivery_alerts_v35",
              sound: "ring",
              notification_priority: "PRIORITY_MAX",
              visibility: "PUBLIC",
              default_sound: false,
              default_vibrate_timings: false,
              vibrate_timings: ["0s", "0.8s", "0.25s", "0.8s", "0.25s", "0.8s"]
            }
          },
          webpush: {
            headers: {
              Urgency: "high"
            },
            notification: {
              title: pushTitle,
              body: pushBody,
              icon: "/favicon-v3.png",
              badge: "/favicon-v3.png",
              vibrate: [500, 200, 500, 200, 500],
              requireInteraction: true
            }
          },
          apns: {
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert"
            },
            payload: {
              aps: {
                alert: {
                  title: pushTitle,
                  body: isRideRequest
                    ? `Passageiro aguardando! Destino: ${dropoffAddr} • ${feeText}`
                    : `Retirada: ${pickupAddr} ➔ Entrega: ${dropoffAddr} • ${feeText}`
                },
                sound: "default",
                badge: 1,
                "content-available": 1
              },
              type: isRideRequest ? "ride" : "delivery",
              deliveryId: String(record.id),
              rideId: String(record.id),
              storeName: companyName,
              pickup: pickupAddr,
              dropoff: dropoffAddr,
              fee: feeText,
              status: String(record.status || "pending")
            }
          }
        }
      };

      console.log(`[FCM] Envio iniciado para token ${token.slice(0, 15)}...`);
      try {
        const response = await fetch(fcmUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(message)
        });
        const resJson = await response.json();

        if (response.ok) {
          console.log(`[FCM] Mensagem enviada com sucesso: message_id = ${resJson.name || "OK"}`);
          return { success: true, messageId: resJson.name, token: token.slice(0, 15) + "..." };
        } else {
          console.error(`[FCM] Envio falhou. Status: ${response.status}. Erro: ${JSON.stringify(resJson.error || resJson)}`);
          
          // Tratamento de token inválido / não registrado (UNREGISTERED ou NOT_FOUND)
          const errorCode = resJson?.error?.details?.[0]?.errorCode || resJson?.error?.status;
          if (errorCode === "UNREGISTERED" || resJson?.error?.code === 404) {
            console.warn(`[FCM] Token ${token.slice(0, 15)}... é inválido ou expirou. Limpando do banco...`);
            supabaseClient
              .from('delivery_drivers')
              .update({ fcm_token: null })
              .or(`fcm_token.eq.${token},fcm_token.eq.${rawToken}`)
              .then(() => {})
              .catch((e: any) => console.warn("[FCM] Erro ao limpar token inválido:", e?.message));
          }

          return { success: false, status: response.status, error: resJson.error || resJson };
        }
      } catch (err: any) {
        console.error(`[FCM] Erro de rede/fetch:`, err?.message);
        return { success: false, error: err?.message };
      }
    });

    const results = await Promise.all(requests)
    console.log("FCM Results:", results)

    return new Response(JSON.stringify({ success: true, count: tokens.length, results: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
