import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.appdeskmusica.mobile",
  appName: "App Desk Musica Mobile",
  webDir: "dist",
  server: {
    androidScheme: "http",
    cleartext: true,
  },
};

export default config;
