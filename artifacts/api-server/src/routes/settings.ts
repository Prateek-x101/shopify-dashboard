import { Router } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { config, saveConfig } from "../config";

const router = Router();

router.get("/settings", async (req, res) => {
  const configured = !!config.shopifyAccessToken && !!config.storeUrl;

  let storeName: string | null = null;
  if (configured) {
    const shopRes = await fetch(
      `https://${config.storeUrl}/admin/api/2024-01/shop.json`,
      { headers: { "X-Shopify-Access-Token": config.shopifyAccessToken } }
    ).catch(() => null);
    if (shopRes?.ok) {
      const data = (await shopRes.json()) as { shop?: { name?: string } };
      storeName = data.shop?.name ?? null;
    }
  }

  res.json({
    store_url: config.storeUrl,
    shopify_access_token: config.shopifyAccessToken,
    shiprocket_email: config.shiprocketEmail,
    shiprocket_password: config.shiprocketPassword,
    email_user: config.emailUser,
    email_pass: config.emailPass,
    api_configured: configured,
    store_name: storeName,
  });
});

router.put("/settings", (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  saveConfig({
    storeUrl: parsed.data.store_url,
    shopifyAccessToken: parsed.data.shopify_access_token,
    shiprocketEmail: parsed.data.shiprocket_email,
    shiprocketPassword: parsed.data.shiprocket_password,
    emailUser: parsed.data.email_user,
    emailPass: parsed.data.email_pass,
  });

  res.json({
    store_url: config.storeUrl,
    shopify_access_token: config.shopifyAccessToken,
    shiprocket_email: config.shiprocketEmail,
    shiprocket_password: config.shiprocketPassword,
    email_user: config.emailUser,
    email_pass: config.emailPass,
    api_configured: !!config.shopifyAccessToken && !!config.storeUrl,
    store_name: null,
  });
});

export default router;
