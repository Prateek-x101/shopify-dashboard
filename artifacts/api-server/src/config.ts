import fs from "fs";
import path from "path";

const SETTINGS_FILE = path.join(process.cwd(), "settings.json");

interface Config {
  storeUrl: string;
  shopifyAccessToken: string;
  shiprocketEmail: string;
  shiprocketPassword: string;
  emailUser: string;
  emailPass: string;
}

const defaults: Config = {
  storeUrl: process.env.SHOPIFY_STORE_URL ?? "fccevc-p1.myshopify.com",
  shopifyAccessToken: process.env.SHOPIFY_CUSTOM_APP_ACCESS_TOKEN ?? process.env.SHOPIFY_ACCESS_TOKEN ?? "",
  shiprocketEmail: process.env.SHIPROCKET_EMAIL ?? "",
  shiprocketPassword: process.env.SHIPROCKET_PASSWORD ?? "",
  emailUser: process.env.EMAIL_USER ?? "",
  emailPass: process.env.EMAIL_PASS ?? "",
};

let saved: Partial<Config> = {};
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    saved = JSON.parse(raw);
  }
} catch (err) {
  // Ignore or log loading failure
}

export const config: Config = {
  storeUrl: saved.storeUrl ?? defaults.storeUrl,
  shopifyAccessToken: saved.shopifyAccessToken ?? defaults.shopifyAccessToken,
  shiprocketEmail: saved.shiprocketEmail ?? defaults.shiprocketEmail,
  shiprocketPassword: saved.shiprocketPassword ?? defaults.shiprocketPassword,
  emailUser: saved.emailUser ?? defaults.emailUser,
  emailPass: saved.emailPass ?? defaults.emailPass,
};

export function saveConfig(updates: Partial<Config>) {
  Object.assign(config, updates);
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save settings.json:", err);
  }
}
