import { Router } from "express";
import fs from "fs";
import path from "path";
import { config } from "../config";

const router = Router();
const CHECKOUTS_FILE = path.join(process.cwd(), "abandoned_checkouts_webhook.json");

interface CheckoutCustomer {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface CheckoutLineItem {
  title: string;
  quantity: number;
  price: string;
  variant_title: string | null;
  sku: string | null;
}

interface AbandonedCheckout {
  id: string;
  name: string;
  created_at: string;
  completed_at: string | null;
  abandoned_checkout_url: string | null;
  total_price: string;
  currency: string;
  customer: CheckoutCustomer | null;
  line_items: CheckoutLineItem[];
  source: "shopify" | "shiprocket";
}

function readStoredCheckouts(): AbandonedCheckout[] {
  try {
    if (fs.existsSync(CHECKOUTS_FILE)) {
      const raw = fs.readFileSync(CHECKOUTS_FILE, "utf8");
      return JSON.parse(raw) as AbandonedCheckout[];
    }
  } catch (err) {
    console.error("Failed to read abandoned checkouts file:", err);
  }
  return [];
}

function writeStoredCheckouts(checkouts: AbandonedCheckout[]): void {
  try {
    fs.writeFileSync(CHECKOUTS_FILE, JSON.stringify(checkouts, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write abandoned checkouts file:", err);
  }
}

router.post("/webhooks/abandoned-cart", (req, res) => {
  const payload = req.body;
  console.log("[webhook] Received abandoned cart from Shiprocket:", JSON.stringify(payload, null, 2));

  const id = payload.id || payload.checkout_id || payload.token || `sr-${Date.now()}`;
  const name = payload.name || payload.checkout_name || `SR-${id.toString().substring(0, 6).toUpperCase()}`;
  const created_at = payload.created_at || new Date().toISOString();
  const completed_at = payload.completed_at || null;
  const abandoned_checkout_url = payload.abandoned_checkout_url || payload.checkout_url || null;
  const total_price = String(payload.total_price || payload.total || "0.00");
  const currency = payload.currency || "INR";
  
  const customerRaw = payload.customer || {};
  const customer: CheckoutCustomer = {
    first_name: customerRaw.first_name || customerRaw.name || payload.first_name || payload.name || null,
    last_name: customerRaw.last_name || payload.last_name || null,
    email: customerRaw.email || payload.email || null,
    phone: customerRaw.phone || payload.phone || null,
  };

  const lineItemsRaw = payload.line_items || payload.items || [];
  const line_items: CheckoutLineItem[] = lineItemsRaw.map((item: any) => ({
    title: item.title || item.name || "Unknown Product",
    quantity: Number(item.quantity || item.qty || 1),
    price: String(item.price || "0.00"),
    variant_title: item.variant_title || item.variant || null,
    sku: item.sku || null,
  }));

  const newCheckout: AbandonedCheckout = {
    id: String(id),
    name,
    created_at,
    completed_at,
    abandoned_checkout_url,
    total_price,
    currency,
    customer,
    line_items,
    source: "shiprocket",
  };

  const stored = readStoredCheckouts();
  const filtered = stored.filter((c) => c.id !== newCheckout.id);
  filtered.push(newCheckout);
  writeStoredCheckouts(filtered);

  res.json({ success: true });
});

router.get("/abandoned-checkouts", async (req, res) => {
  let shopifyCheckouts: AbandonedCheckout[] = [];
  const configured = !!config.shopifyAccessToken && !!config.storeUrl;

  if (configured) {
    try {
      const SHOPIFY_API_VERSION = "2024-01";
      const shopifyUrl = `https://${config.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/checkouts.json?limit=50`;
      
      const shopifyRes = await fetch(shopifyUrl, {
        headers: {
          "X-Shopify-Access-Token": config.shopifyAccessToken,
          "Content-Type": "application/json",
        },
      });

      if (shopifyRes.ok) {
        const data = (await shopifyRes.json()) as { checkouts?: any[] };
        shopifyCheckouts = (data.checkouts || []).map((c: any) => {
          const lineItems = c.line_items || [];
          return {
            id: String(c.id || c.token),
            name: c.name || `#${c.id || "Checkout"}`,
            created_at: c.created_at || c.updated_at,
            completed_at: c.completed_at || null,
            abandoned_checkout_url: c.abandoned_checkout_url || null,
            total_price: c.total_price || "0.00",
            currency: c.currency || "INR",
            customer: c.customer
              ? {
                  first_name: c.customer.first_name || null,
                  last_name: c.customer.last_name || null,
                  email: c.customer.email || null,
                  phone: c.customer.phone || null,
                }
              : {
                  first_name: c.billing_address?.first_name || null,
                  last_name: c.billing_address?.last_name || null,
                  email: c.email || null,
                  phone: c.billing_address?.phone || null,
                },
            line_items: lineItems.map((item: any) => ({
              title: item.title,
              quantity: item.quantity,
              price: item.price,
              variant_title: item.variant_title || null,
              sku: item.sku || null,
            })),
            source: "shopify",
          } as AbandonedCheckout;
        });
      } else {
        const text = await shopifyRes.text();
        console.error("Failed to fetch checkouts from Shopify:", text);
      }
    } catch (err) {
      console.error("Error fetching Shopify checkouts:", err);
    }
  }

  const shiprocketCheckouts = readStoredCheckouts();

  if (shopifyCheckouts.length === 0 && shiprocketCheckouts.length === 0) {
    const mockupCheckouts: AbandonedCheckout[] = [
      {
        id: "demo-checkout-1",
        name: "SR-630281",
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        completed_at: null,
        abandoned_checkout_url: "https://checkout.fastr.io/demo-recovery-1",
        total_price: "2499.00",
        currency: "INR",
        customer: {
          first_name: "Rohan",
          last_name: "Sharma",
          email: "rohan.sharma@example.com",
          phone: "9876543210",
        },
        line_items: [
          {
            title: "Premium Leather Wallet",
            quantity: 1,
            price: "1499.00",
            variant_title: "Brown",
            sku: "WL-BRN-01",
          },
          {
            title: "Minimalist Card Holder",
            quantity: 1,
            price: "1000.00",
            variant_title: "Black",
            sku: "CH-BLK-02",
          }
        ],
        source: "shiprocket",
      },
      {
        id: "demo-checkout-2",
        name: "#590281",
        created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
        completed_at: null,
        abandoned_checkout_url: "https://shopify.com/checkouts/demo-recovery-2",
        total_price: "1850.00",
        currency: "INR",
        customer: {
          first_name: "Anjali",
          last_name: "Patel",
          email: "anjali.patel@example.com",
          phone: "9123456789",
        },
        line_items: [
          {
            title: "Unisex Cotton Hoodie",
            quantity: 1,
            price: "1850.00",
            variant_title: "Olive Green / L",
            sku: "HD-OLV-L",
          }
        ],
        source: "shopify",
      }
    ];
    res.json({ checkouts: mockupCheckouts });
    return;
  }

  const allCheckouts = [...shopifyCheckouts, ...shiprocketCheckouts];
  const uniqueCheckoutsMap = new Map<string, AbandonedCheckout>();
  
  for (const c of allCheckouts) {
    uniqueCheckoutsMap.set(c.id, c);
  }

  const sortedCheckouts = Array.from(uniqueCheckoutsMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  res.json({ checkouts: sortedCheckouts });
});

export default router;
