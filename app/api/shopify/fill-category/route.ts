import { NextRequest, NextResponse } from "next/server";
import {
  fetchProductCurrentMetafields,
  syncProductToShopify,
  syncRawMetafields,
} from "@/lib/shopify";
import { generateCategoryFieldValues } from "@/lib/ai";
import { detectAgeGroup } from "@/lib/prompts";
import type { AIModel, SyncPayload } from "@/types";

// ─── Category detection ───────────────────────────────────────────────────────

interface FieldDef {
  namespace: string;
  key: string;
  name: string;
  type: string;
  typeName: string;
  choices: string[];
}

function f(namespace: string, key: string, name: string, type = "single_line_text_field", choices: string[] = []): FieldDef {
  return { namespace, key, name, type, typeName: type, choices };
}

const SHOE_KEYWORDS = ["basket", "chaussure", "sneaker", "shoe", "boot", "sandale", "mocassin", "espadrille", "derby", "oxford"];
const TOP_KEYWORDS = ["t-shirt", "tshirt", "sweat", "hoodie", "veste", "jacket", "chemise", "polo", "pull", "manteau", "parka", "gilet", "top", "shirt"];
const BOTTOM_KEYWORDS = ["pantalon", "jean", "short", "jogging", "legging", "jupe"];
const ACCESSORY_KEYWORDS = ["casquette", "bonnet", "sac", "bag", "ceinture", "écharpe", "chapeau", "gant", "montre"];

function detectCategory(title: string, productType: string, tags: string): "shoes" | "tops" | "bottoms" | "accessories" | "other" {
  const text = `${title} ${productType} ${tags}`.toLowerCase();
  if (SHOE_KEYWORDS.some((k) => text.includes(k))) return "shoes";
  if (TOP_KEYWORDS.some((k) => text.includes(k))) return "tops";
  if (BOTTOM_KEYWORDS.some((k) => text.includes(k))) return "bottoms";
  if (ACCESSORY_KEYWORDS.some((k) => text.includes(k))) return "accessories";
  return "other";
}

// ─── Category schemas ─────────────────────────────────────────────────────────
// google/* namespace: confirmed to show in "Champs méta Catégorie" by Shopify
// shopify/* namespace: best-effort Shopify taxonomy keys (may vary by store version)

const COMMON_FIELDS: FieldDef[] = [
  f("google", "color",     "Couleur"),
  f("google", "material",  "Matériau principal"),
  f("google", "gender",    "Sexe cible",    "single_line_text_field", ["male", "female", "unisex"]),
  f("google", "age_group", "Tranche d'âge", "single_line_text_field", ["adult", "kids"]),
];

const SHOE_EXTRA_FIELDS: FieldDef[] = [
  f("shopify", "closure-type",    "Type de fermeture"),
  f("shopify", "shoe-style",      "Style de baskets (basse/haute/mi-haute)"),
  f("shopify", "heel-height-type","Type de hauteur du talon (plat/bas/moyen/haut)"),
  f("shopify", "occasion",        "Style d'occasion (casual/sport/lifestyle)"),
  f("shopify", "activity",        "Activité physique (lifestyle/marche/running…)"),
  f("shopify", "shoe-fit",        "Coupe de la chaussure (regular/large/étroit)"),
  f("shopify", "toe-style",       "Style de bout (arrondi/carré/pointu)"),
];

const TOP_EXTRA_FIELDS: FieldDef[] = [
  f("shopify", "sleeve-length-type", "Longueur des manches"),
  f("shopify", "neckline",           "Encolure (col rond/col V/col polo…)"),
  f("shopify", "fit",                "Coupe (regular/slim/oversized)"),
  f("shopify", "occasion",           "Style d'occasion"),
];

const BOTTOM_EXTRA_FIELDS: FieldDef[] = [
  f("shopify", "fit",        "Coupe (regular/slim/wide/straight)"),
  f("shopify", "rise-style", "Hauteur de taille (taille haute/normale/basse)"),
  f("shopify", "occasion",   "Style d'occasion"),
];

function getSchemaForCategory(cat: ReturnType<typeof detectCategory>): FieldDef[] {
  switch (cat) {
    case "shoes": return [...COMMON_FIELDS, ...SHOE_EXTRA_FIELDS];
    case "tops": return [...COMMON_FIELDS, ...TOP_EXTRA_FIELDS];
    case "bottoms": return [...COMMON_FIELDS, ...BOTTOM_EXTRA_FIELDS];
    default: return COMMON_FIELDS;
  }
}

// ─── Slim product shape ───────────────────────────────────────────────────────

interface SlimProduct {
  id: number;
  title: string;
  vendor: string;
  productType: string;
  tags: string;
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{ sku: string; barcode: string; option1: string | null; option2: string | null }>;
}

/** Rule-based Google Merchant fields that don't need AI. */
function deriveGoogleFields(p: SlimProduct): SyncPayload["fields"] {
  const colorOpt = p.options.find((o) => /colou?r|couleur/i.test(o.name));
  const sizeOpt = p.options.find((o) => /size|taille|pointure/i.test(o.name));
  const firstVariant = p.variants?.[0];
  const isValidGtin = /^\d{8}$|^\d{12,14}$/.test(firstVariant?.barcode ?? "");

  const fields: SyncPayload["fields"] = {
    googleGender: (() => {
      const tags = (p.tags ?? "").toLowerCase().split(",").map((t) => t.trim());
      if (tags.some((t) => ["homme", "hommes", "men", "man", "masculin", "male", "garçon", "garcon", "boy"].includes(t))) return "male";
      if (tags.some((t) => ["femme", "femmes", "women", "woman", "féminin", "feminin", "female", "fille", "girl"].includes(t))) return "female";
      return "unisex";
    })(),
    googleAgeGroup: detectAgeGroup(p.tags ?? ""),
    googleCondition: "new",
  };

  if (p.vendor) fields.googleBrand = p.vendor;
  if (colorOpt?.values.length) fields.googleColor = colorOpt.values.join(" / ");
  if (sizeOpt?.values.length) fields.googleSize = sizeOpt.values.join(", ");
  if (firstVariant?.sku) fields.googleMpn = firstVariant.sku;
  if (isValidGtin && firstVariant?.barcode) fields.googleGtin = firstVariant.barcode;
  return fields;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { products, model = "openai" } = (await req.json()) as {
      products: SlimProduct[];
      model?: AIModel;
    };

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: "Aucun produit fourni" }, { status: 400 });
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
        // ── Step 1: Rule-based Google fields (brand, size, gtin, mpn, condition, age) ──
        const googleFields = deriveGoogleFields(product);
        await syncProductToShopify({ productId: product.id, fields: googleFields });

        // ── Step 2: Detect category and build AI field list ───────────────────
        const category = detectCategory(product.title, product.productType, product.tags);
        const schema = getSchemaForCategory(category);

        // Fetch current metafields to skip already-filled ones
        const existing = await fetchProductCurrentMetafields(product.id);
        const existingMap = new Map(existing.map((m) => [`${m.namespace}:${m.key}`, m.value]));

        // Fields already filled by rules (google namespace)
        const ruleFilledKeys = new Set(
          Object.entries({
            googleColor: "google:color",
            googleGender: "google:gender",
            googleAgeGroup: "google:age_group",
          })
            .filter(([k]) => googleFields[k as keyof typeof googleFields])
            .map(([, nk]) => nk)
        );

        // Filter to fields not yet filled (by rules or existing metafields)
        const emptyFields = schema.filter((f) => {
          const nk = `${f.namespace}:${f.key}`;
          if (ruleFilledKeys.has(nk)) return false;
          const existing_val = existingMap.get(nk);
          return !existing_val || existing_val === "";
        });

        // ── Step 3: AI fills remaining empty fields ───────────────────────────
        let taxonomyFilled = 0;
        if (emptyFields.length > 0) {
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
            emptyFields,
            model
          );

          if (aiValues.length > 0) {
            await syncRawMetafields(
              product.id,
              aiValues.map((f) => ({
                namespace: f.namespace,
                key: f.key,
                value: f.value,
                type: schema.find((s) => s.namespace === f.namespace && s.key === f.key)?.type ?? "single_line_text_field",
              }))
            );
            taxonomyFilled = aiValues.length;
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
