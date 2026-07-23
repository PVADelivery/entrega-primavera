const DRIVER_INVITE_BASE_URL = "https://entregador.mt24horasexpress.com";
const COMPANY_INVITE_BASE_URL = "https://lojista.mt24horasexpress.com";

export type InviteRole = "driver" | "company";

export function getInviteBaseUrl(role: InviteRole, currentOrigin?: string) {
  const origin = currentOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    return origin;
  }

  if (role === "driver") {
    return DRIVER_INVITE_BASE_URL;
  }

  return COMPANY_INVITE_BASE_URL;
}

export function buildInviteLink(token: string, role: InviteRole, currentOrigin?: string) {
  return `${getInviteBaseUrl(role, currentOrigin)}/invite/${token}`;
}