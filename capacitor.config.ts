import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mt24horasexpress.entregador',
  appName: 'MT 24 Horas Express - Entregador',
  webDir: 'dist/client',
  server: {
    url: 'https://entregador.mt24horasexpress.com/driver',
    errorPath: 'error.html',
    cleartext: false,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    LocalNotifications: {
      sound: "ring.wav"
    }
  }
};

export default config;
