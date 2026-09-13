/**
 * Safely calculates elapsed seconds since created_at timestamp.
 * Handles ISO strings, UTC strings, naive database strings, and timestamps without timezone offset bugs.
 */
export function getElapsedSeconds(created_at: string | Date | number | null | undefined): number {
  if (!created_at) return 999999;
  let timestamp: number;

  if (typeof created_at === "number") {
    timestamp = created_at;
  } else if (created_at instanceof Date) {
    timestamp = created_at.getTime();
  } else {
    let str = String(created_at).trim();
    // Se a data vier do Postgres sem indicador de timezone (Z ou offset +/-), assume UTC adicionando Z
    if (!str.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
      str = str.replace(" ", "T") + "Z";
    } else {
      str = str.replace(" ", "T");
    }

    const parsed = new Date(str).getTime();
    if (isNaN(parsed)) {
      return 999999;
    }
    timestamp = parsed;
  }

  const now = Date.now();
  const elapsedMs = now - timestamp;

  // Se a diferença for positiva mas pequena ou negativa por descompasso de relógio de segundos, tolera
  return Math.floor(elapsedMs / 1000);
}
