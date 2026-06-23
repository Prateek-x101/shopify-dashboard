import { Router } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router = Router();

const DEFAULT_STORE_URL = process.env.SHOPIFY_STORE_URL ?? "fccevc-p1.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN ?? "";

let storeUrl = DEFAULT_STORE_URL;

router.get("/settings", async (req, res) => {
  const configured = !!SHOPIFY_TOKEN && !!storeUrl;

  let storeName: string | null = null;
  if (configured) {
    const shopRes = await fetch(
      `https://${storeUrl}/admin/api/2024-01/shop.json`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
    ).catch(() => null);
    if (shopRes?.ok) {
      const data = (await shopRes.json()) as { shop?: { name?: string } };
      storeName = data.shop?.name ?? null;
    }
  }

  res.json({
    store_url: storeUrl,
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

  storeUrl = parsed.data.store_url;

  res.json({
    store_url: storeUrl,
    api_configured: !!SHOPIFY_TOKEN && !!storeUrl,
    store_name: null,
  });
});

export default router;
