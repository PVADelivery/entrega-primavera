/**
 * Safely calculates elapsed seconds since created_at timestamp.
 * Handles ISO strings, UTC strings, naive database strings, and timestamps without timezone offset bugs.
 */
export function getElapsedSeconds(created_at: string | Date | number | null | undefined): number {
  if (!created_at) return 0;
  let timestamp: number;

  if (typeof created_at === "number") {
    timestamp = created_at;
  } else if (created_at instanceof Date) {
    timestamp = created_at.getTime();
  } else {
    let str = String(created_at).trim();
    // Se a string não contiver indicador de fuso (Z ou +/-hh:mm), normaliza para UTC padrão do Postgres
    let normalized = str.replace(" ", "T");
    if (!normalized.endsWith("Z") && !/[+-]\d{2}(:?\d{2})?$/.test(normalized)) {
      normalized += "Z";
    }
    let parsed = new Date(normalized).getTime();

    if (isNaN(parsed)) {
      parsed = new Date(str).getTime();
    }

    if (isNaN(parsed)) {
      return 0;
    }
    timestamp = parsed;
  }

  const now = Date.now();
  const elapsedMs = now - timestamp;

  if (elapsedMs < 0) {
    return 0;
  }

  return Math.floor(elapsedMs / 1000);
}
