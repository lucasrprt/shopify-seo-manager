export interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  grams: number;
  barcode: string | null;
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
  width: number;
  height: number;
}

export interface ShopifyMetafield {
  id?: number;
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ShopifyOption {
  id: number;
  name: string;
  values: string[];
}

export interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  body_html: string;
  handle: string;
  status: "active" | "draft" | "archived";
  tags: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  options: ShopifyOption[];
  metafields?: ShopifyMetafield[];
  created_at: string;
  updated_at: string;
}

export interface EnrichedProduct {
  shopify: ShopifyProduct;
  // SEO fields
  seoTitle: string;
  seoDescription: string;
  urlHandle: string;
  description: string;
  // Google Merchant fields
  googleCategory: string;
  googleCondition: "new" | "used" | "refurbished" | "";
  googleAgeGroup: string;
  googleGender: string;
  googleGtin: string;
  googleMpn: string;
  googleBrand: string;
  googleColor: string;
  googleMaterial: string;
  googleSize: string;
  googlePattern: string;
  googleItemGroupId: string;
  // Health
  health: HealthStatus;
}

export interface HealthStatus {
  score: number;
  seoScore: number;
  googleScore: number;
  missingFields: string[];
  warnings: string[];
}

export interface GeneratedContent {
  seoTitle: string;
  seoDescription: string;
  urlHandle: string;
  description: string;
  googleCategory: string;
  googleCondition: "new" | "used" | "refurbished";
  googleAgeGroup: string;
  googleGender: string;
  googleBrand: string;
  googleColor: string;
  googleMaterial: string;
  googleSize: string;
  googlePattern: string;
  googleItemGroupId: string;
  googleGtin: string;
  googleMpn: string;
}

export type AIModel = "claude" | "openai";

export interface FilterState {
  search: string;
  healthMin: number;
  healthMax: number;
  missingType: "all" | "seo" | "google" | "both";
  missingField: string; // specific error label, e.g. "Meta Title SEO"
  vendor: string;
  productType: string;
  status: "all" | "active" | "draft" | "archived";
}

export interface SyncPayload {
  productId: number;
  fields: {
    seoTitle?: string;
    seoDescription?: string;
    urlHandle?: string;
    description?: string;
    googleCategory?: string;
    googleCondition?: string;
    googleAgeGroup?: string;
    googleGender?: string;
    googleGtin?: string;
    googleMpn?: string;
    googleBrand?: string;
    googleColor?: string;
    googleMaterial?: string;
    googleSize?: string;
    googlePattern?: string;
    googleItemGroupId?: string;
  };
}

export const SEO_FIELDS = ["seoTitle", "seoDescription", "urlHandle", "description"] as const;

export const GOOGLE_FIELDS = [
  "googleCategory",
  "googleCondition",
  "googleAgeGroup",
  "googleGender",
  "googleGtin",
  "googleMpn",
  "googleBrand",
  "googleColor",
  "googleMaterial",
  "googleSize",
  "googlePattern",
  "googleItemGroupId",
] as const;

export const GOOGLE_METAFIELD_MAP: Record<string, string> = {
  googleCategory: "custom_product_type",
  googleCondition: "condition",
  googleAgeGroup: "age_group",
  googleGender: "gender",
  googleGtin: "gtin",
  googleMpn: "mpn",
  googleBrand: "brand",
  googleColor: "color",
  googleMaterial: "material",
  googleSize: "size",
  googlePattern: "pattern",
  googleItemGroupId: "item_group_id",
};
