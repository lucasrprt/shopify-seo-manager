import type {
  ShopifyProduct,
  ShopifyMetafield,
  EnrichedProduct,
  SyncPayload,
  GOOGLE_METAFIELD_MAP,
} from "@/types";
import { computeHealth } from "./validators";

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VERSION = "2024-10";

function shopifyUrl(path: string) {
  return `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${path}`;
}

function shopifyHeaders() {
  return {
    "X-Shopify-Access-Token": ACCESS_TOKEN,
    "Content-Type": "application/json",
  };
}

async function shopifyFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(shopifyUrl(path), {
    ...options,
    headers: {
      ...shopifyHeaders(),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let url = "/products.json?limit=250&fields=id,title,vendor,product_type,body_html,handle,status,tags,images,variants,options,created_at,updated_at";

  while (url) {
    const response = await fetch(shopifyUrl(url), { headers: shopifyHeaders() });
    if (!response.ok) throw new Error(`Shopify error ${response.status}`);

    const data = (await response.json()) as { products: ShopifyProduct[] };
    products.push(...data.products);

    const linkHeader = response.headers.get("Link");
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      const nextUrl = new URL(nextMatch[1]);
      url = nextUrl.pathname.replace(`/admin/api/${API_VERSION}`, "") + nextUrl.search;
    } else {
      break;
    }
  }

  return products;
}

export async function fetchProductMetafields(
  productId: number
): Promise<ShopifyMetafield[]> {
  const data = await shopifyFetch<{ metafields: ShopifyMetafield[] }>(
    `/products/${productId}/metafields.json`
  );
  return data.metafields;
}

export async function fetchProductWithMetafields(
  productId: number
): Promise<EnrichedProduct> {
  const [productData, metafields] = await Promise.all([
    shopifyFetch<{ product: ShopifyProduct }>(`/products/${productId}.json`),
    fetchProductMetafields(productId),
  ]);

  return enrichProduct(productData.product, metafields);
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

export function enrichProduct(
  product: ShopifyProduct,
  metafields: ShopifyMetafield[]
): EnrichedProduct {
  const getMeta = (namespace: string, key: string) =>
    metafields.find((m) => m.namespace === namespace && m.key === key)?.value ?? "";

  const enriched: EnrichedProduct = {
    shopify: { ...product, metafields },
    seoTitle: getMeta("global", "title_tag"),
    seoDescription: getMeta("global", "description_tag"),
    urlHandle: product.handle,
    description: product.body_html ?? "",
    googleCategory: getMeta("google", "custom_product_type"),
    googleCondition: getMeta("google", "condition") as EnrichedProduct["googleCondition"],
    googleAgeGroup: getMeta("google", "age_group") as EnrichedProduct["googleAgeGroup"],
    googleGender: getMeta("google", "gender") as EnrichedProduct["googleGender"],
    googleGtin: getMeta("google", "gtin"),
    googleMpn: getMeta("google", "mpn"),
    googleBrand: getMeta("google", "brand") || product.vendor,
    googleColor: getMeta("google", "color"),
    googleMaterial: getMeta("google", "material"),
    googleSize: getMeta("google", "size"),
    googlePattern: getMeta("google", "pattern"),
    googleItemGroupId: getMeta("google", "item_group_id"),
    health: { score: 0, seoScore: 0, googleScore: 0, missingFields: [], warnings: [] },
  };

  enriched.health = computeHealth(enriched);
  return enriched;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

const GOOGLE_METAFIELD_KEY_MAP: Record<string, string> = {
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

export async function syncProductToShopify(payload: SyncPayload): Promise<void> {
  const { productId, fields } = payload;
  const updates: Promise<unknown>[] = [];

  // Update product body & handle
  const productUpdate: Record<string, string> = {};
  if (fields.description !== undefined) productUpdate.body_html = fields.description;
  if (fields.urlHandle !== undefined) productUpdate.handle = fields.urlHandle;

  if (Object.keys(productUpdate).length > 0) {
    updates.push(
      shopifyFetch(`/products/${productId}.json`, {
        method: "PUT",
        body: JSON.stringify({ product: { id: productId, ...productUpdate } }),
      })
    );
  }

  // SEO metafields (global namespace)
  const seoMetafields: ShopifyMetafield[] = [];
  if (fields.seoTitle !== undefined) {
    seoMetafields.push({ namespace: "global", key: "title_tag", value: fields.seoTitle, type: "single_line_text_field" });
  }
  if (fields.seoDescription !== undefined) {
    seoMetafields.push({ namespace: "global", key: "description_tag", value: fields.seoDescription, type: "single_line_text_field" });
  }

  // Google Merchant metafields
  const googleMetafields: ShopifyMetafield[] = [];
  for (const [fieldKey, metafieldKey] of Object.entries(GOOGLE_METAFIELD_KEY_MAP)) {
    const value = fields[fieldKey as keyof typeof fields];
    if (value !== undefined && value !== "") {
      googleMetafields.push({
        namespace: "google",
        key: metafieldKey,
        value: value as string,
        type: "single_line_text_field",
      });
    }
  }

  const allMetafields = [...seoMetafields, ...googleMetafields];
  if (allMetafields.length > 0) {
    updates.push(
      shopifyFetch(`/products/${productId}/metafields.json`, {
        method: "POST",
        body: JSON.stringify({ metafield: allMetafields[0] }),
      })
    );

    // Shopify requires one metafield per request, so batch them
    for (const metafield of allMetafields) {
      updates.push(
        shopifyFetch(`/products/${productId}/metafields.json`, {
          method: "POST",
          body: JSON.stringify({ metafield }),
        })
      );
    }
  }

  await Promise.allSettled(updates);
}

export async function syncMultipleProducts(payloads: SyncPayload[]): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  const results = await Promise.allSettled(
    payloads.map((p) => syncProductToShopify(p))
  );

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      success++;
    } else {
      failed++;
      errors.push(result.reason?.message ?? "Unknown error");
    }
  }

  return { success, failed, errors };
}
