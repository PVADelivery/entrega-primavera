import { registerPlugin, PluginListenerHandle, Capacitor } from '@capacitor/core';

export interface IncomingCallOptions {
  details: string;
  deliveryId: string;
  storeName?: string;
  pickup?: string;
  dropoff?: string;
  fee?: string;
}

export interface DeliveryOverlayPlugin {
  requestOverlayPermission(): Promise<void>;
  requestBatteryOptimizationExemption(): Promise<{ ignoring: boolean; error?: string }>;
  startOverlay(): Promise<{ success: boolean; reason?: string }>;
  stopOverlay(): Promise<void>;
  dismissIncomingCall(): Promise<void>;
  testIncomingCall(options: IncomingCallOptions): Promise<void>;
  updateIncomingCall(options: IncomingCallOptions): Promise<void>;
  reportCallResult(options: { success: boolean; message?: string }): Promise<void>;
  saveDriverContext(options: { driverId: string; userToken: string }): Promise<void>;
  getPendingAcceptedDelivery(): Promise<{ deliveryId: string }>;
  getPendingFcmToken(): Promise<{ token: string }>;
  cancelDeliveryNotification(options: { deliveryId: string }): Promise<void>;
  setDriverOnlineStatus(options: { isOnline: boolean }): Promise<void>;
  showDeliveryCard(options: { deliveryId: string; storeName?: string; pickup?: string; dropoff?: string; fee?: string }): Promise<void>;
  hideDeliveryCard(options: { deliveryId: string }): Promise<void>;
  stopNativeAudio(): Promise<void>;
  playNativeAudio(): Promise<void>;
  addListener(
    eventName: 'onFcmTokenRefresh' | 'onDeliveryDeclined' | 'onDeliveryAccepted' | 'onCallResponse',
    listenerFunc: (response: any) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const DeliveryOverlayPluginRaw = registerPlugin<DeliveryOverlayPlugin>('DeliveryOverlay');

// Wrapper seguro para evitar o erro "UNIMPLEMENTED" no iOS e Web
// No Android, passamos a instância original diretamente para evitar qualquer perda de contexto do Capacitor
export const DeliveryOverlay: DeliveryOverlayPlugin = Capacitor.getPlatform() === 'android'
  ? DeliveryOverlayPluginRaw
  : {
      requestOverlayPermission: async () => {},
      requestBatteryOptimizationExemption: async () => ({ ignoring: true }),
      startOverlay: async () => ({ success: false, reason: 'not_android' }),
      stopOverlay: async () => {},
      dismissIncomingCall: async () => {},
      testIncomingCall: async () => {},
      updateIncomingCall: async () => {},
      reportCallResult: async () => {},
      saveDriverContext: async () => {},
      getPendingAcceptedDelivery: async () => ({ deliveryId: "" }),
      getPendingFcmToken: async () => ({ token: "" }),
      cancelDeliveryNotification: async () => {},
      setDriverOnlineStatus: async () => {},
      showDeliveryCard: async () => {},
      hideDeliveryCard: async () => {},
      stopNativeAudio: async () => {},
      playNativeAudio: async () => {},
      addListener: (eventName: any, listenerFunc: any) => {
        const handle = { remove: async () => {} };
        const promise = Promise.resolve(handle);
        return Object.assign(promise, handle) as any;
      }
    };

if (typeof window !== 'undefined') {
  (window as any).DeliveryOverlay = DeliveryOverlay;
}
