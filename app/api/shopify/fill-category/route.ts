import { NextRequest, NextResponse } from "next/server";
import {
  fetchMetafieldDefinitions,
  fetchProductCurrentMetafields,
  syncProductToShopify,
  syncRawMetafields,
  MetafieldDefinition,
} from "@/lib/shopify";
import { generateCategoryFieldValues } from "@/lib/ai";
import type { AIModel, SyncPayload } from "@/types";

interface SlimProduct {
  id: number;
  title: string;
  vendor: string;
  productType: string;
  tags: string;
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{ sku: string; barcode: string; option1: string | null; option2: string | null }>;
}

/** Rule-based Google Merchant fields derived from product data (no AI needed). */
function deriveGoogleFields(p: SlimProduct): SyncPayload["fields"] {
  const colorOpt = p.options.find((o) => /colou?r|couleur/i.test(o.name));
  const sizeOpt = p.options.find((o) => /size|taille|pointure/i.test(o.name));
  const tags = (p.tags ?? "").toLowerCase().split(",").map((t) => t.trim()).filter(Boolean);

  const isMale = tags.some((t) =>
    ["homme", "hommes", "men", "man", "masculin", "male", "garçon", "garcon", "boy"].includes(t)
  );
  const isFemale = tags.some((t) =>
    ["femme", "femmes", "women", "woman", "féminin", "feminin", "female", "fille", "girl"].includes(t)
  );
  const isKid = tags.some((t) =>
    ["kid", "kids", "enfant", "enfants", "children", "child", "youth", "bébé", "bebe", "baby", "junior"].includes(t)
  );

  const firstVariant = p.variants?.[0];
  const isValidGtin = /^\d{8}$|^\d{12,14}$/.test(firstVariant?.barcode ?? "");

  const fields: SyncPayload["fields"] = {
    googleGender: isMale ? "male" : isFemale ? "female" : "unisex",
    googleAgeGroup: isKid ? "kids" : "adult",
    googleCondition: "new",
  };
  if (p.vendor) fields.googleBrand = p.vendor;
  if (colorOpt?.values.length) fields.googleColor = colorOpt.values.join(" / ");
  if (sizeOpt?.values.length) fields.googleSize = sizeOpt.values.join(", ");
  if (firstVariant?.sku) fields.googleMpn = firstVariant.sku;
  if (isValidGtin && firstVariant?.barcode) fields.googleGtin = firstVariant.barcode;
  return fields;
}

export async function POST(req: NextRequest) {
  try {
    const { products, model = "openai" } = (await req.json()) as {
      products: SlimProduct[];
      model?: AIModel;
    };

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: "Aucun produit fourni" }, { status: 400 });
    }

    // ── Fetch all metafield definitions once for the whole batch ──────────────
    let taxonomyDefs: MetafieldDefinition[] = [];
    try {
      const allDefs = await fetchMetafieldDefinitions();
      // Exclude google/* and global/* — those are handled by the main sync
      taxonomyDefs = allDefs.filter((d) => d.namespace !== "google" && d.namespace !== "global");
    } catch {
      // GraphQL unavailable — continue with rule-based only
      taxonomyDefs = [];
    }

    const results: Array<{
      productId: number;
      googleFields: number;
      taxonomyFields: number;
      status: "applied" | "failed";
      error?: string;
    }> = [];

    for (const product of products) {
      try {
        // ── Step 1: Rule-based Google Merchant fields ─────────────────────────
        const googleFields = deriveGoogleFields(product);
        await syncProductToShopify({ productId: product.id, fields: googleFields });

        // ── Step 2: AI taxonomy fields ────────────────────────────────────────
        let taxonomyFilled = 0;

        if (taxonomyDefs.length > 0) {
          const existing = await fetchProductCurrentMetafields(product.id);
          const existingMap = new Map(existing.map((m) => [`${m.namespace}:${m.key}`, m.value]));

          // Only ask AI about definitions that are currently empty
          const emptyDefs = taxonomyDefs.filter((d) => {
            const val = existingMap.get(`${d.namespace}:${d.key}`);
            return !val || val === "";
          });

          if (emptyDefs.length > 0) {
            const aiValues = await generateCategoryFieldValues(
              {
                title: product.title,
                vendor: product.vendor,
                productType: product.productType,
                tags: product.tags,
                options: product.options,
                variantTitles: product.variants
                  .map((v) => [v.option1, v.option2].filter(Boolean).join(" / "))
                  .filter(Boolean),
              },
              emptyDefs,
              model
            );

            if (aiValues.length > 0) {
              const metafields = aiValues.map((f) => {
                const def = taxonomyDefs.find((d) => d.namespace === f.namespace && d.key === f.key);
                return {
                  namespace: f.namespace,
                  key: f.key,
                  value: f.value,
                  type: def?.typeName ?? "single_line_text_field",
                };
              });
              await syncRawMetafields(product.id, metafields);
              taxonomyFilled = aiValues.length;
            }
          }
        }

        results.push({
          productId: product.id,
          googleFields: Object.keys(googleFields).length,
          taxonomyFields: taxonomyFilled,
          status: "applied",
        });
      } catch (err) {
        results.push({
          productId: product.id,
          googleFields: 0,
          taxonomyFields: 0,
          status: "failed",
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }

      // Rate limit — one product at a time
      if (products.length > 1) {
        await new Promise((r) => setTimeout(r, 700));
      }
    }

    const applied = results.filter((r) => r.status === "applied").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const totalTaxonomy = results.reduce((s, r) => s + r.taxonomyFields, 0);

    return NextResponse.json({ applied, failed, totalTaxonomy, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
