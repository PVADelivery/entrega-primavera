import { useAntiSpamMonitor } from "@/hooks/useAntiSpamMonitor";

interface GlobalAntiSpamProps {
  appName?: string;
}

export function GlobalAntiSpam({ appName = "App Entregador" }: GlobalAntiSpamProps) {
  useAntiSpamMonitor({ appName });
  return null;
}
