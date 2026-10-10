// Declarações de segurança: garantem que o typecheck passe mesmo se a
// instalação dos pacotes nativos do Capacitor estiver incompleta no ambiente.
// Em runtime, os valores reais vêm dos pacotes instalados.
declare module "@capacitor/local-notifications" {
  export const LocalNotifications: any;
  export type LocalNotificationSchema = any;
  export type Channel = any;
  export type PermissionStatus = any;
}

declare module "@capacitor/status-bar" {
  export const StatusBar: any;
  export const Style: { Dark: string; Light: string; Default: string };
  export type StyleOptions = any;
}
