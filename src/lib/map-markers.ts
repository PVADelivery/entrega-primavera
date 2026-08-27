/**
 * Utilitários unificados de Pins e Marcadores com Emojis para MapLibre GL
 * Sistema PVA Delivery / Corridas / Táxi / Entregas
 * Padrão Oficial Google Maps Pins
 */

// 1. Função padrão para converter qualquer Emoji em ImageData (Canvas) para MapLibre map.addImage()
export function createEmojiImage(emoji: string, size = 48): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível obter contexto 2D do Canvas");

  ctx.clearRect(0, 0, size, size);
  ctx.font = `${Math.round(size * 0.75)}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);

  return ctx.getImageData(0, 0, size, size);
}

// 2. Registra imagens de emojis no mapa (Symbol Layers)
export function registerMapEmojis(map: any) {
  if (!map) return;
  const emojis = [
    { id: "emoji-mototaxi", emoji: "🏍️" },
    { id: "emoji-taxi", emoji: "🚖" },
    { id: "emoji-pin-origem", emoji: "🟢" },
    { id: "emoji-pin-destino", emoji: "🔴" },
    { id: "emoji-pin", emoji: "📍" },
  ];

  emojis.forEach(({ id, emoji }) => {
    try {
      if (!map.hasImage(id)) {
        const imgData = createEmojiImage(emoji, 48);
        map.addImage(id, imgData);
      }
    } catch (e) {
      console.warn(`[MapLibre] Aviso ao registrar imagem ${id}:`, e);
    }
  });
}

// 3. Marcador de Partida / Embarque (PIN VERDE OFICIAL GOOGLE MAPS - PURO)
export function createPickupPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "pickup-pin-container pointer-events-none";
  el.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 34px;
    transform: translate(-50%, -100%);
    cursor: pointer;
  `;

  el.innerHTML = `
    <svg width="26" height="34" viewBox="0 0 24 24" fill="#34A853" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `;
  return el;
}

// 4. Marcador de Destino / Desembarque (PIN VERMELHO OFICIAL GOOGLE MAPS - PURO)
export function createDropoffPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "dropoff-pin-container pointer-events-none";
  el.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 34px;
    transform: translate(-50%, -100%);
    cursor: pointer;
  `;

  el.innerHTML = `
    <svg width="26" height="34" viewBox="0 0 24 24" fill="#EA4335" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `;
  return el;
}

// 5. Marcador de Veículo / Motorista EMOJI COM TAMANHO PROPORCIONAL E COMPACTO
export function createVehicleMarkerElement(vehicleType: string = "moto"): HTMLElement {
  const isTaxi = vehicleType.toLowerCase().includes("taxi") && !vehicleType.toLowerCase().includes("moto") ||
                 vehicleType.toLowerCase().includes("car") ||
                 vehicleType.toLowerCase().includes("carro");
  
  const emoji = isTaxi ? "🚖" : "🏍️";

  const el = document.createElement("div");
  el.className = "vehicle-emoji-marker pointer-events-none";
  el.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    line-height: 1;
    user-select: none;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
    transform: translate(-50%, -50%);
    cursor: pointer;
  `;

  el.innerHTML = `<span>${emoji}</span>`;
  return el;
}

// 6. Marcador da Localização do Usuário (Ponto Pulsante Compacto)
export function createUserLocationElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "user-location-marker pointer-events-none";
  el.style.cssText = `
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    transform: translate(-50%, -50%);
  `;

  el.innerHTML = `
    <div style="
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.4);
      animation: userPulse 2s cubic-bezier(0, 0, 0.2, 1) infinite;
    "></div>
    <div style="
      position: relative;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #10b981;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      z-index: 2;
    "></div>

    <style>
      @keyframes userPulse {
        0% { transform: scale(0.6); opacity: 0.9; }
        70% { transform: scale(1.6); opacity: 0; }
        100% { transform: scale(1.6); opacity: 0; }
      }
    </style>
  `;
  return el;
}
