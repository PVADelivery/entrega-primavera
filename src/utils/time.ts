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
    if (!str.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(str)) {
      str = str.replace(" ", "T") + "Z";
    }
    timestamp = new Date(str).getTime();
  }

  if (isNaN(timestamp)) return 999999;

  const now = Date.now();
  const elapsedMs = now - timestamp;
  return Math.floor(elapsedMs / 1000);
}
