import type {
  ShopifyProduct,
  ShopifyMetafield,
  EnrichedProduct,
  SyncPayload,
} from "@/types";
import { computeHealth } from "./validators";

const API_VERSION = "2024-10";

function getCredentials() {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!domain || !token) {
    throw new Error(
      "Variables d'environnement manquantes : SHOPIFY_SHOP_DOMAIN et/ou SHOPIFY_ACCESS_TOKEN. " +
      "Ajoutez-les dans Vercel (Settings → Environment Variables) ou dans votre fichier .env.local."
    );
  }
  return { domain, token };
}

function shopifyUrl(path: string) {
  const { domain } = getCredentials();
  return `https://${domain}/admin/api/${API_VERSION}${path}`;
}

function shopifyHeaders() {
  const { token } = getCredentials();
  return {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
  };
}

async function shopifyFetch<T>(
  path: string,
  options: RequestInit = {},
  retries = 3
): Promise<T> {
  const res = await fetch(shopifyUrl(path), {
    ...options,
    headers: {
      ...shopifyHeaders(),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 429 && retries > 0) {
    const retryAfter = parseFloat(res.headers.get("Retry-After") ?? "1");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return shopifyFetch<T>(path, options, retries - 1);
  }

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
    let response = await fetch(shopifyUrl(url), { headers: shopifyHeaders() });
    let attempt = 0;
    while (response.status === 429 && attempt < 5) {
      const retryAfter = parseFloat(response.headers.get("Retry-After") ?? "2");
      await new Promise((r) => setTimeout(r, retryAfter * 1000 * Math.pow(2, attempt)));
      response = await fetch(shopifyUrl(url), { headers: shopifyHeaders() });
      attempt++;
    }
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

  // Build the metafields array for upsert (Shopify creates or updates by namespace+key)
  const metafields: ShopifyMetafield[] = [];

  if (fields.seoTitle !== undefined && fields.seoTitle !== "") {
    metafields.push({ namespace: "global", key: "title_tag", value: fields.seoTitle, type: "single_line_text_field" });
  }
  if (fields.seoDescription !== undefined && fields.seoDescription !== "") {
    metafields.push({ namespace: "global", key: "description_tag", value: fields.seoDescription, type: "single_line_text_field" });
  }
  // Fallbacks for fields Google requires — prevents "Demoted: Missing X" errors
  const REQUIRED_DEFAULTS: Partial<SyncPayload["fields"]> = {
    googleCondition: "new",
    googleAgeGroup: "adult",
  };

  for (const [fieldKey, metafieldKey] of Object.entries(GOOGLE_METAFIELD_KEY_MAP)) {
    const value =
      (fields[fieldKey as keyof typeof fields] as string | undefined) ||
      (REQUIRED_DEFAULTS[fieldKey as keyof typeof REQUIRED_DEFAULTS] as string | undefined);
    if (value) {
      metafields.push({ namespace: "google", key: metafieldKey, value, type: "single_line_text_field" });
    }
  }

  // Build the product update body (description + handle + metafields all in one PUT)
  const productBody: Record<string, unknown> = { id: productId };
  if (fields.description !== undefined && fields.description !== "") productBody.body_html = fields.description;
  if (fields.urlHandle !== undefined && fields.urlHandle !== "") productBody.handle = fields.urlHandle;
  if (metafields.length > 0) productBody.metafields = metafields;

  // Single PUT — Shopify upserts metafields by namespace+key (no 422 on existing fields)
  await shopifyFetch(`/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({ product: productBody }),
  });
}

/** Rename variant options on a product. Pass ALL options (unchanged ones too) to avoid data loss. */
export async function renameProductOptions(
  productId: number,
  options: Array<{ id: number; name: string }>
): Promise<void> {
  await shopifyFetch(`/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({ product: { id: productId, options } }),
  });
}

// ─── GraphQL (metafield definitions + current values) ─────────────────────────

export interface MetafieldDefinition {
  namespace: string;
  key: string;
  name: string;
  typeName: string;
  choices: string[];
}

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const { domain, token } = getCredentials();
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${await res.text()}`);
  const data = await res.json() as { data: T; errors?: Array<{ message: string }> };
  if (data.errors?.length) throw new Error(`GraphQL: ${data.errors.map((e) => e.message).join(", ")}`);
  return data.data;
}

/** Fetches all product metafield definitions defined in the store. */
export async function fetchMetafieldDefinitions(): Promise<MetafieldDefinition[]> {
  const data = await shopifyGraphQL<{
    metafieldDefinitions: {
      nodes: Array<{
        namespace: string;
        key: string;
        name: string;
        type: { name: string };
        validations: Array<{ name: string; value: string }>;
      }>;
    };
  }>(`{
    metafieldDefinitions(ownerType: PRODUCT, first: 250) {
      nodes { namespace key name type { name } validations { name value } }
    }
  }`);

  return data.metafieldDefinitions.nodes.map((d) => {
    const cv = d.validations.find((v) => v.name === "choices");
    let choices: string[] = [];
    if (cv?.value) { try { choices = JSON.parse(cv.value) as string[]; } catch { /* ignore */ } }
    return { namespace: d.namespace, key: d.key, name: d.name, typeName: d.type.name, choices };
  });
}

/** Fetches the metafields currently set on a single product (all namespaces). */
export async function fetchProductCurrentMetafields(
  productId: number
): Promise<Array<{ namespace: string; key: string; value: string }>> {
  const data = await shopifyGraphQL<{
    product: { metafields: { nodes: Array<{ namespace: string; key: string; value: string }> } };
  }>(`query($id: ID!) {
    product(id: $id) { metafields(first: 250) { nodes { namespace key value } } }
  }`, { id: `gid://shopify/Product/${productId}` });
  return data.product.metafields.nodes;
}

/** Returns each option with its currently-linked metafield (namespace + key), if any. */
export async function fetchProductOptionsWithLinks(
  productId: number
): Promise<Array<{ id: string; name: string; linkedMetafield: { namespace: string; key: string } | null }>> {
  const data = await shopifyGraphQL<{
    product: {
      options: Array<{
        id: string;
        name: string;
        linkedMetafield: { namespace: string; key: string } | null;
      }>;
    };
  }>(`query($id: ID!) {
    product(id: $id) {
      options { id name linkedMetafield { namespace key } }
    }
  }`, { id: `gid://shopify/Product/${productId}` });
  return data.product.options;
}

/** Returns the metafield definitions attached to the product's Shopify taxonomy category. */
export async function fetchCategoryMetafieldDefinitions(
  productId: number
): Promise<Array<{ namespace: string; key: string; name: string }>> {
  try {
    const data = await shopifyGraphQL<{
      product: {
        category: {
          metafieldDefinitions: { nodes: Array<{ namespace: string; key: string; name: string }> };
        } | null;
      };
    }>(`query($id: ID!) {
      product(id: $id) {
        category { metafieldDefinitions(first: 50) { nodes { namespace key name } } }
      }
    }`, { id: `gid://shopify/Product/${productId}` });
    return data.product.category?.metafieldDefinitions.nodes ?? [];
  } catch {
    return []; // field may not exist in all API versions
  }
}

/** Links a product option (by GID) to a metafield definition so Shopify auto-populates it. */
export async function linkOptionToMetafield(
  productId: number,
  optionGid: string,
  namespace: string,
  key: string
): Promise<boolean> {
  try {
    const data = await shopifyGraphQL<{
      productOptionUpdate: { userErrors: Array<{ message: string }> };
    }>(`mutation($productId: ID!, $option: OptionUpdateInput!, $variantStrategy: ProductOptionUpdateVariantStrategy!) {
      productOptionUpdate(productId: $productId, option: $option, variantStrategy: $variantStrategy) {
        product { id }
        userErrors { field message }
      }
    }`, {
      productId: `gid://shopify/Product/${productId}`,
      option: { id: optionGid, linkedMetafield: { namespace, key } },
      variantStrategy: "LEAVE_AS_IS",
    });
    return data.productOptionUpdate.userErrors.length === 0;
  } catch {
    return false;
  }
}

/** Writes arbitrary metafields to a product (upsert by namespace+key). */
export async function syncRawMetafields(
  productId: number,
  metafields: Array<{ namespace: string; key: string; value: string; type: string }>
): Promise<void> {
  await shopifyFetch(`/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({ product: { id: productId, metafields } }),
  });
}

// ─── Bulk sync ─────────────────────────────────────────────────────────────────

export async function syncMultipleProducts(payloads: SyncPayload[]): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  // Sequential with a small delay — avoids flooding Shopify's rate limit (40 req/s bucket)
  for (const payload of payloads) {
    try {
      await syncProductToShopify(payload);
      success++;
    } catch (err) {
      failed++;
      errors.push(err instanceof Error ? err.message : "Unknown error");
    }
    // ~600ms between products → stays well under Shopify's 2 req/s sustained limit
    if (payloads.length > 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  return { success, failed, errors };
}
