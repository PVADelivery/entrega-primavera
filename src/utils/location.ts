/**
 * location.ts
 * Utilitários para cálculos geográficos e detecção de cidade.
 */

export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Cuiabá": { lat: -15.5989, lng: -56.0974 },
  "Várzea Grande": { lat: -15.65, lng: -56.1333 },
  "Diamantino": { lat: -14.4087, lng: -56.4462 },
  "Tangará da Serra": { lat: -14.6231, lng: -57.4851 },
  "Rondonópolis": { lat: -16.4674, lng: -54.6318 },
  "Sinop": { lat: -11.864, lng: -55.509 },
  "Sorriso": { lat: -12.5442, lng: -55.7231 },
  "Lucas do Rio Verde": { lat: -13.06, lng: -55.91 },
  "Nova Mutum": { lat: -13.83, lng: -56.08 },
  "Cáceres": { lat: -16.071, lng: -57.681 },
  "Primavera do Leste": { lat: -15.559, lng: -54.296 },
  "Barra do Bugres": { lat: -15.068, lng: -57.184 },
  "Campo Verde": { lat: -15.547, lng: -55.166 },
  "Poconé": { lat: -16.257, lng: -56.623 },
  "Chapada dos Guimarães": { lat: -15.46, lng: -55.74 },
  "Pontes e Lacerda": { lat: -15.22, lng: -59.33 },
  "Mirassol d'Oeste": { lat: -15.68, lng: -58.11 },
  "Jaciara": { lat: -15.96, lng: -54.96 },
  "Guarantã do Norte": { lat: -9.78, lng: -54.91 },
  "Juína": { lat: -11.41, lng: -58.74 },
  "Colíder": { lat: -10.81, lng: -55.45 },
};

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function findNearestCity(lat: number, lng: number): string | null {
  // Ignorar coordenadas inválidas (comum em erros de sensor GPS)
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return null;

  let nearestCity: string | null = null;
  let minDistance = Infinity;

  Object.entries(CITY_COORDS).forEach(([city, coords]) => {
    const distance = getDistance(lat, lng, coords.lat, coords.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  });

  // Threshold: Apenas atribui se estiver a menos de 30km do centro da cidade
  if (minDistance > 30) {
    console.warn(`[Location] Usuário a ${minDistance.toFixed(1)}km de ${nearestCity}. Fora do raio de detecção.`);
    return null;
  }

  return nearestCity;
}
