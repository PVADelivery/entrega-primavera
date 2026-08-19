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
  addListener(
    eventName: 'onCallResponse',
    listenerFunc: (response: { status: 'accepted' | 'rejected'; deliveryId: string }) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const DeliveryOverlayPluginRaw = registerPlugin<DeliveryOverlayPlugin>('DeliveryOverlay');

// Wrapper seguro para evitar o erro "UNIMPLEMENTED" no iOS e Web
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
      addListener: (eventName: any, listenerFunc: any) => {
        return Promise.resolve({ remove: async () => {} }) as any;
      }
    };

if (typeof window !== 'undefined') {
  (window as any).DeliveryOverlay = DeliveryOverlay;
}
