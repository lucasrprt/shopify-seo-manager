import { NextRequest, NextResponse } from "next/server";
import { syncProductToShopify } from "@/lib/shopify";
import type { EnrichedProduct, SyncPayload } from "@/types";

/** Derive category metafield values from a product's own data (no AI needed).
 *  This replicates what Shopify shows as "Champs méta Catégorie" suggestions:
 *  vendor → brand, variant options → color/size, tags → gender/age group.
 */
function deriveCategory(p: EnrichedProduct): Partial<SyncPayload["fields"]> {
  const opts = p.shopify.options ?? [];
  const colorOpt = opts.find((o) => /colou?r|couleur/i.test(o.name));
  const sizeOpt = opts.find((o) => /size|taille/i.test(o.name));

  const tags = (p.shopify.tags ?? "")
    .toLowerCase()
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const isMale = tags.some((t) =>
    ["homme", "hommes", "men", "man", "masculin", "male", "garçon", "garcon", "boy"].includes(t)
  );
  const isFemale = tags.some((t) =>
    ["femme", "femmes", "women", "woman", "féminin", "feminin", "female", "fille", "girl"].includes(t)
  );
  const isKid = tags.some((t) =>
    ["kid", "kids", "enfant", "enfants", "children", "child", "youth", "bébé", "bebe", "baby", "junior"].includes(t)
  );

  const gender = isMale ? "male" : isFemale ? "female" : "unisex";
  const ageGroup = isKid ? "kids" : "adult";

  const firstVariant = p.shopify.variants?.[0];
  const barcode = firstVariant?.barcode ?? "";
  const isValidGtin = /^\d{8}$|^\d{12,14}$/.test(barcode);

  const fields: Partial<SyncPayload["fields"]> = {};

  if (p.shopify.vendor) fields.googleBrand = p.shopify.vendor;
  if (colorOpt?.values.length) fields.googleColor = colorOpt.values.join(" / ");
  if (sizeOpt?.values.length) fields.googleSize = sizeOpt.values.join(", ");
  fields.googleGender = gender;
  fields.googleAgeGroup = ageGroup;
  fields.googleCondition = "new";
  if (firstVariant?.sku) fields.googleMpn = firstVariant.sku;
  if (isValidGtin) fields.googleGtin = barcode;

  return fields;
}

export async function POST(req: NextRequest) {
  try {
    const { products } = (await req.json()) as { products: EnrichedProduct[] };

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: "Aucun produit fourni" }, { status: 400 });
    }

    const results: Array<{
      productId: number;
      fields: Partial<SyncPayload["fields"]>;
      status: "applied" | "skipped" | "failed";
    }> = [];

    for (const product of products) {
      const fields = deriveCategory(product);

      if (Object.keys(fields).length === 0) {
        results.push({ productId: product.shopify.id, fields, status: "skipped" });
        continue;
      }

      try {
        await syncProductToShopify({ productId: product.shopify.id, fields });
        results.push({ productId: product.shopify.id, fields, status: "applied" });
      } catch {
        results.push({ productId: product.shopify.id, fields, status: "failed" });
      }
    }

    const applied = results.filter((r) => r.status === "applied").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({ applied, skipped, failed, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
