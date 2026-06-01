const DRIVER_INVITE_BASE_URL = "https://entregador.eprajadelivery.com";
const COMPANY_INVITE_BASE_URL = "https://lojista.eprajadelivery.com";

export type InviteRole = "driver" | "company";

export function getInviteBaseUrl(role: InviteRole, currentOrigin?: string) {
  if (role === "driver") {
    return DRIVER_INVITE_BASE_URL;
  }

  const origin = currentOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    return origin;
  }

  return COMPANY_INVITE_BASE_URL;
}

export function buildInviteLink(token: string, role: InviteRole, currentOrigin?: string) {
  return `${getInviteBaseUrl(role, currentOrigin)}/invite/${token}`;
}