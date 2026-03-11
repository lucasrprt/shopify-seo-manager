import type { EnrichedProduct } from "@/types";

export function buildProductContext(product: EnrichedProduct): string {
  const p = product.shopify;
  const variants = p.variants.slice(0, 10).map((v) => ({
    titre: v.title,
    prix: v.price,
    sku: v.sku,
    stock: v.inventory_quantity,
    option1: v.option1,
    option2: v.option2,
    barcode: v.barcode,
  }));

  const options = p.options.map((o) => `${o.name}: ${o.values.join(", ")}`);

  return JSON.stringify(
    {
      titre: p.title,
      marque: p.vendor,
      type: p.product_type,
      tags: p.tags,
      description_existante: p.body_html?.replace(/<[^>]+>/g, " ").slice(0, 500),
      options,
      variantes: variants,
      handle_actuel: p.handle,
    },
    null,
    2
  );
}

export const SYSTEM_PROMPT = `Tu es un expert en SEO e-commerce français et en optimisation Google Shopping.
Tu génères du contenu de qualité professionnelle, persuasif et optimisé pour le référencement naturel français.

Tes textes doivent :
- Être rédigés en français correct et naturel
- Utiliser les mots-clés pertinents de manière fluide
- Respecter les bonnes pratiques SEO (meta title ≤60 car., meta description ≤160 car.)
- Être persuasifs et orientés conversion
- Respecter le champ de longueur requis

Pour Google Shopping, tu dois inférer les champs à partir des données produit disponibles et fournir des valeurs précises selon les spécifications Google Merchant Center.`;

export function buildFullGenerationPrompt(product: EnrichedProduct): string {
  const context = buildProductContext(product);

  return `Génère tous les champs SEO et Google Merchant pour ce produit.

## Données produit
${context}

## Instructions
Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte (pas de texte avant/après) :

{
  "seoTitle": "Titre SEO optimisé (20-60 caractères, avec le nom du produit et mots-clés)",
  "seoDescription": "Description meta SEO engageante (50-160 caractères, avec call-to-action)",
  "urlHandle": "url-produit-en-tirets-sans-accents",
  "description": "<p>Description HTML complète du produit en français (200-500 mots). Utilise des balises <p>, <ul>, <li>, <strong>. Mets en avant les caractéristiques, avantages et usage.</p>",
  "googleCategory": "Catégorie Google Merchant (ex: Vêtements et accessoires > Vêtements > Chemises)",
  "googleCondition": "new",
  "googleAgeGroup": "adult",
  "googleGender": "unisex",
  "googleBrand": "Nom de la marque",
  "googleColor": "Couleur principale en français",
  "googleMaterial": "Matière principale en français",
  "googleSize": "Taille si applicable",
  "googlePattern": "Motif si applicable",
  "googleItemGroupId": "ID groupe article si variantes",
  "googleGtin": "Code GTIN si disponible dans les données (sinon chaîne vide)",
  "googleMpn": "Référence fabricant si disponible dans SKU (sinon chaîne vide)"
}

Règles importantes :
- googleCondition DOIT être "new", "used" ou "refurbished"
- googleAgeGroup DOIT être "newborn", "infant", "toddler", "kids" ou "adult"
- googleGender DOIT être "male", "female" ou "unisex"
- urlHandle DOIT être en minuscules avec des tirets, sans accents ni caractères spéciaux
- Si une information n'est pas disponible, utilise une chaîne vide ""
- N'invente pas de GTIN, laisse vide si non disponible`;
}

export function buildSeoOnlyPrompt(product: EnrichedProduct): string {
  const context = buildProductContext(product);

  return `Génère uniquement les champs SEO pour ce produit.

## Données produit
${context}

Retourne UNIQUEMENT un objet JSON valide :

{
  "seoTitle": "Titre SEO optimisé (20-60 caractères)",
  "seoDescription": "Description meta (50-160 caractères)",
  "urlHandle": "url-en-tirets",
  "description": "<p>Description HTML complète en français...</p>"
}`;
}

export function buildGoogleOnlyPrompt(product: EnrichedProduct): string {
  const context = buildProductContext(product);

  return `Génère uniquement les champs Google Merchant pour ce produit.

## Données produit
${context}

Retourne UNIQUEMENT un objet JSON valide :

{
  "googleCategory": "...",
  "googleCondition": "new",
  "googleAgeGroup": "adult",
  "googleGender": "unisex",
  "googleBrand": "...",
  "googleColor": "...",
  "googleMaterial": "...",
  "googleSize": "...",
  "googlePattern": "",
  "googleItemGroupId": "",
  "googleGtin": "",
  "googleMpn": ""
}

googleCondition DOIT être "new", "used" ou "refurbished"
googleAgeGroup DOIT être "newborn", "infant", "toddler", "kids" ou "adult"
googleGender DOIT être "male", "female" ou "unisex"`;
}
