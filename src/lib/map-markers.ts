/**
 * Utilitários unificados de Pins e Marcadores com Emojis para MapLibre GL
 * Sistema PVA Delivery / Corridas / Táxi / Entregas
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

// 3. Marcador de Partida / Embarque (PIN VERDE COMPACTO)
export function createPickupPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "pickup-pin-container pointer-events-none";
  el.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    width: 28px;
    height: 36px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
    transform: translate(-50%, -100%);
    cursor: pointer;
  `;

  el.innerHTML = `
    <div style="
      position: relative;
      width: 24px;
      height: 32px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    ">
      <!-- Pin SVG Verde -->
      <svg width="24" height="32" viewBox="0 0 38 48" fill="none" style="position: absolute; inset: 0;">
        <path d="M19 1C9.06 1 1 8.98 1 18.83c0 13.16 15.72 27.13 16.39 27.72a2.43 2.43 0 0 0 3.22 0C21.28 45.96 37 32 37 18.83 37 8.98 28.94 1 19 1Z" fill="#16a34a"/>
        <path d="M19 1.75c-9.52 0-17.25 7.65-17.25 17.08 0 12.61 15.28 26.24 16.14 26.99.63.55 1.59.55 2.22 0 .86-.75 16.14-14.38 16.14-26.99C36.25 9.4 28.52 1.75 19 1.75Z" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
        <circle cx="19" cy="18.5" r="11" fill="#ffffff"/>
      </svg>
      <!-- Ícone interno / Ponto Verde Central -->
      <div style="
        position: absolute;
        top: 6.5px;
        left: 50%;
        transform: translateX(-50%);
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: #16a34a;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 4px; height: 4px; border-radius: 50%; background: #ffffff;"></div>
      </div>
    </div>
    <!-- Sombra no chão -->
    <div style="
      width: 10px;
      height: 3px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.3);
      filter: blur(1px);
      margin-top: -1px;
    "></div>
  `;
  return el;
}

// 4. Marcador de Destino / Desembarque (PIN VERMELHO COMPACTO)
export function createDropoffPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "dropoff-pin-container pointer-events-none";
  el.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    width: 28px;
    height: 36px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
    transform: translate(-50%, -100%);
    cursor: pointer;
  `;

  el.innerHTML = `
    <div style="
      position: relative;
      width: 24px;
      height: 32px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    ">
      <!-- Pin SVG Vermelho -->
      <svg width="24" height="32" viewBox="0 0 38 48" fill="none" style="position: absolute; inset: 0;">
        <path d="M19 1C9.06 1 1 8.98 1 18.83c0 13.16 15.72 27.13 16.39 27.72a2.43 2.43 0 0 0 3.22 0C21.28 45.96 37 32 37 18.83 37 8.98 28.94 1 19 1Z" fill="#dc2626"/>
        <path d="M19 1.75c-9.52 0-17.25 7.65-17.25 17.08 0 12.61 15.28 26.24 16.14 26.99.63.55 1.59.55 2.22 0 .86-.75 16.14-14.38 16.14-26.99C36.25 9.4 28.52 1.75 19 1.75Z" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
        <circle cx="19" cy="18.5" r="11" fill="#ffffff"/>
      </svg>
      <!-- Ícone interno / Bandeira Central -->
      <div style="
        position: absolute;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        width: 12px;
        height: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #dc2626;
      ">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 21V4h10l-1.5 4L18 12H5v9H3v-9"/>
        </svg>
      </div>
    </div>
    <!-- Sombra no chão -->
    <div style="
      width: 10px;
      height: 3px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.3);
      filter: blur(1px);
      margin-top: -1px;
    "></div>
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
