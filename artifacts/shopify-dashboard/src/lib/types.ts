export interface LineItem {
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: string;
  imageUrl: string | null;
}

export interface Address {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
}

export interface Store {
  id: number;
  name: string;
  shopDomain: string;
  publicDomain: string | null;
  accessToken: string | null;
  color: string;
  shiprocketAccountId: number | null;
  whatsappAccountId: number | null;
  emailAccountId: number | null;
  webhookSecret: string | null;
  active: boolean;
  fulfillInShopify?: boolean;
  notifyOnFulfill?: boolean;
  lastOrderSyncAt: string | null;
  lastError: string | null;
}

export interface OrderRow {
  id: number;
  storeId: number;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentMethod: "COD" | "Prepaid";
  totalPrice: string;
  tags: string;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  lineItems: LineItem[];
  itemCount: number;
  addressIssue: string | null;
  srOrderId: string | null;
  srStatus: string | null;
  srStatusCode: string | null;
  awb: string | null;
  courier: string | null;
  lastWaStatus: string | null;
  lastWaAt: string | null;
  lastEmailAt: string | null;
  unreadCount: number;
  srMeta?: SrMeta | null;
  srUpdatedAt?: string | null;
  complaintStatus?: "open" | "resolved" | null;
  complaintAt?: string | null;
  shippingAddress?: Address | null;
  confirmedAt?: string | null;
  shopifyFulfilledAt?: string | null;
  shopifyFulfillError?: string | null;
  quality?: Quality | null;
  labelUrl?: string | null;
  source?: string | null;
  zip?: string | null;
  conversation?: Conversation;
}

export interface SrMeta {
  etd?: string | null;
  pickupScheduledAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  outForDeliveryAt?: string | null;
  rtoRisk?: string | null;
  shippingCharges?: string | null;
  weight?: string | null;
  trackUrl?: string | null;
}

export interface Conversation {
  waIn: number;
  waUnread: number;
  emailIn: number;
  emailUnread: number;
  sent: number;
  failed: number;
  complaint: boolean;
  lastIn: { channel: "whatsapp" | "email"; body: string; at: string; intent: string | null } | null;
}

export interface Courier {
  id: number;
  name: string;
  rate: number;
  codCharges: number;
  etd: string | null;
  etdDays: number | null;
  rating: number | null;
  surface: boolean;
  recommended: boolean;
}

export interface PackageInput {
  weight: number;
  length: number;
  breadth: number;
  height: number;
}

export interface Message {
  id: number;
  storeId: number | null;
  channel: "whatsapp" | "email";
  direction: "in" | "out";
  contact: string;
  contactName: string | null;
  orderId: number | null;
  checkoutId: number | null;
  subject: string | null;
  body: string;
  mediaUrl: string | null;
  templateName: string | null;
  status: string;
  error: string | null;
  source: string | null;
  read: boolean;
  createdAt: string;
}

export interface OrderDetail extends OrderRow {
  shopifyId: string;
  shippingAddress: Address | null;
  note: string | null;
  srShipmentId: string | null;
  labelUrl: string | null;
  srUpdatedAt: string | null;
  store: { id: number; name: string; color: string; shopDomain: string } | null;
  shopifyAdminUrl: string | null;
  extra: {
    subtotal?: string;
    discounts?: string;
    shipping?: string;
    discountCodes: string[];
    gateways: string[];
    sourceName?: string;
    noteAttributes: { name: string; value: string }[];
  };
  insights: OrderInsights;
  recordingUrl: string | null;
  messages: Message[];
  otherOrders: { id: number; storeId: number; name: string; createdAt: string; totalPrice: string; srStatus: string | null; srStatusCode: string | null; cancelledAt: string | null }[];
  carts: { id: number; source: string; createdAt: string; status: string; totalPrice: string }[];
}

export interface CheckoutRow {
  id: number;
  storeId: number;
  source: "shopify" | "fastrr";
  externalId: string;
  name: string | null;
  createdAt: string;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  lineItems: LineItem[];
  totalPrice: string;
  checkoutUrl: string | null;
  stage: string | null;
  status: "abandoned" | "replied" | "recovered" | "opted_out";
  sentSteps: string[];
  lastSentAt: string | null;
  unreadCount: number;
  recoveredOrderId: number | null;
}

export interface CheckoutDetail extends CheckoutRow {
  shippingAddress: Address | null;
  store: { id: number; name: string; color: string } | null;
  messages: Message[];
  orders: { id: number; name: string; createdAt: string; totalPrice: string; srStatus: string | null }[];
}

export interface WhatsappAccount {
  id: number;
  name: string;
  provider: "web" | "meta";
  phoneNumber: string | null;
  metaPhoneNumberId: string | null;
  metaWabaId: string | null;
  metaAccessToken: string | null;
  metaVerifyToken: string | null;
  metaAppSecret: string | null;
  status: string;
  lastError: string | null;
  session: { state: string; qr: string | null; phone: string | null } | null;
}

export interface MetaTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  body: string;
  headerFormat: string | null;
  paramCount: number;
}

export interface AutomationRule {
  id: number;
  name: string;
  storeId: number | null;
  trigger: "order_created" | "shipment_status" | "abandoned_checkout";
  triggerValue: string;
  delayMinutes: number;
  channel: "whatsapp" | "email";
  messageType: "text" | "template";
  body: string;
  subject: string | null;
  templateName: string | null;
  templateLanguage: string | null;
  templateParams: string[];
  includeImage: boolean;
  enabled: boolean;
  stats?: { sent: number; failed: number; last: string | null };
}

export const SR_STATUSES = [
  { key: "new", label: "New" },
  { key: "awb_assigned", label: "AWB Assigned" },
  { key: "pickup_scheduled", label: "Pickup Scheduled" },
  { key: "picked_up", label: "Picked Up" },
  { key: "in_transit", label: "In Transit" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "ndr", label: "Undelivered / NDR" },
  { key: "rto", label: "RTO in progress" },
  { key: "rto_delivered", label: "RTO Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "lost", label: "Lost / Damaged" },
];

export const ORDER_VARS = ["name", "first_name", "order", "total", "payment", "product", "items", "awb", "courier", "tracking_url", "status", "store", "city"];
export const CHECKOUT_VARS = ["name", "first_name", "total", "product", "items", "checkout_url", "store"];

export interface OrderInsights {
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
    term: string | null;
    campaignId: string | null;
    adId: string | null;
    adsetId: string | null;
    fbclid: boolean;
    gclid: boolean;
  } | null;
  landingPage: string | null;
  landingPath: string | null;
  referrer: string | null;
  device: { type: "Mobile" | "Tablet" | "Desktop"; os: string | null; browser: string | null; model: string | null; inApp: string | null } | null;
  userAgent: string | null;
  ip: string | null;
  journey: string | null;
  recordingFromAttributes: string | null;
  otherAttributes: { name: string; value: string }[];
  shippingMethod: string | null;
  orderStatusUrl: string | null;
  acceptsMarketing: boolean | null;
}

export interface TimelineItem {
  id: string;
  type: string;
  title: string;
  detail: string | null;
  author: string | null;
  createdAt: string;
}

export interface QualityFlag {
  key: string;
  label: string;
  detail?: string;
  severity: "high" | "medium" | "low";
}

export interface Quality {
  score: number;
  level: "good" | "check" | "risky";
  flags: QualityFlag[];
  actions: ("confirm_address" | "confirm_cod" | "check_duplicate" | "ask_prepaid")[];
  history: { orders: number; delivered: number; rto: number; cancelled: number };
  duplicates: { id: number; name: string; createdAt: string }[];
  confirmed: boolean;
}
