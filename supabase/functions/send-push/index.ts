import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { JWT } from "npm:google-auth-library@9"

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record
    const oldRecord = payload.old_record
    const eventType = payload.type // 'INSERT' or 'UPDATE'
    
    if (!record) {
      return new Response("No record payload", { status: 200 })
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
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
    
    const accessTokenObj = await client.getAccessToken()
    const accessToken = accessTokenObj.token
    const projectId = serviceAccount.project_id
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

    // =========================================================================
    // CASE A: UPDATE EVENT — Delivery accepted or cancelled by another driver
    // =========================================================================
    const wasPending = oldRecord && (oldRecord.status === 'pending' || oldRecord.status === 'broadcasted')
    const isNoLongerPending = record.status !== 'pending' && record.status !== 'broadcasted'

    if (eventType === 'UPDATE' && wasPending && isNoLongerPending) {
      console.log(`Corrida ${record.id} aceita/cancelada. Enviando comando CANCEL_DELIVERY para os demais entregadores...`)

      let query = supabaseClient
        .from('delivery_drivers')
        .select('fcm_token')
        .not('fcm_token', 'is', null)
        .eq('is_online', true)

      if (record.driver_id) {
        query = query.neq('id', record.driver_id)
      }

      const { data: drivers } = await query
      if (!drivers || drivers.length === 0) {
        return new Response("No online drivers to cancel notification", { status: 200 })
      }

      const tokens = drivers.map(d => d.fcm_token).filter(Boolean)
      const cancelRequests = tokens.map(token => {
        const message = {
          message: {
            token: token,
            data: {
              type: "cancel_delivery",
              deliveryId: record.id
            },
            android: {
              priority: "HIGH",
              ttl: "120s",
              direct_boot_ok: true
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
        }).then(res => res.json())
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
        .select('name, address, trade_name')
        .eq('id', companyId)
        .maybeSingle();
      if (comp) {
        companyName = comp.trade_name || comp.name || companyName || "MT 24 Horas Express";
        if (!pickupAddr && comp.address) pickupAddr = comp.address;
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

    companyName = norm(companyName, "MT 24 Horas Express")
    pickupAddr = norm(pickupAddr, "Retirada na Loja")
    dropoffAddr = norm(dropoffAddr, "Endereço do cliente")
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) deliveryFee = 0
    const feeText = `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`

    const formattedDetails = `🏬 Loja: ${companyName}\n📍 Coleta: ${pickupAddr}\n🏁 Entrega: ${dropoffAddr}\n💰 Ganhos: ${feeText}`
    const pushTitle = `🏬 ${companyName}`;
    const pushBody = `🏁 Entrega: ${dropoffAddr}`;

    let query = supabaseClient
      .from('delivery_drivers')
      .select('fcm_token')
      .not('fcm_token', 'is', null)
      .eq('is_online', true)

    if (record.driver_id) {
       query = query.eq('id', record.driver_id)
    }

    const { data: drivers, error } = await query

    if (error || !drivers || drivers.length === 0) {
      return new Response("No online drivers with push tokens found", { status: 200 })
    }

    const tokens = drivers.map(d => d.fcm_token).filter(Boolean)
    console.log(`Enviando push para ${tokens.length} dispositivos...`)

    // Firebase HTTP v1 API aceita apenas 1 mensagem por request
    const requests = tokens.map(token => {
      const message = {
        message: {
          token: token,
          data: {
            type: "delivery",
            deliveryId: record.id,
            address: formattedDetails,
            details: formattedDetails,
            storeName: companyName,
            pickup: pickupAddr,
            dropoff: dropoffAddr,
            fee: feeText,
            title: pushTitle,
            body: pushBody
          },
          android: {
            priority: "HIGH",
            ttl: "300s",
            direct_boot_ok: true
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title: pushTitle,
                  body: pushBody
                },
                sound: "default",
                category: "DELIVERY_ACTION"
              }
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
      }).then(res => res.json())
    })

    const results = await Promise.all(requests)
    console.log("FCM Results:", results)

    return new Response(JSON.stringify({ success: true, count: tokens.length, results: results }), {
      headers: { "Content-Type": "application/json" }
    })

  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
})
