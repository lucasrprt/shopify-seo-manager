import type { EnrichedProduct } from "@/types";

export function buildProductContext(product: EnrichedProduct): string {
  const p = product.shopify;
  const variants = p.variants.slice(0, 10).map((v) => ({
    titre: v.title,
    prix: v.price,
    sku: v.sku,
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
      seo_title_existant: product.seoTitle || null,
      seo_description_existante: product.seoDescription || null,
      url_handle_existant: product.urlHandle || null,
    },
    null,
    2
  );
}

export const SYSTEM_PROMPT = `Tu es un expert en SEO e-commerce français et en optimisation Google Shopping pour une boutique streetwear/art urbain (Walk By Streetart).
Tu génères du contenu de qualité professionnelle, persuasif et optimisé pour maximiser le taux de clic (CTR) dans les résultats Google.

Tes textes doivent :
- Être rédigés en français correct et naturel, avec un ton urbain/lifestyle moderne
- Utiliser les mots-clés pertinents de manière fluide
- Respecter strictement les longueurs : meta title ≤60 car., meta description ≤160 car.
- Maximiser le CTR : inclure des éléments déclencheurs de clic (livraison, CTA, urgence douce, émojis ciblés)
- La meta description DOIT mentionner "Livraison offerte dès 90€" et se terminer par un CTA actif

Pour Google Shopping, tu dois inférer les champs à partir des données produit disponibles et fournir des valeurs précises selon les spécifications Google Merchant Center.`;

export function buildFullGenerationPrompt(product: EnrichedProduct): string {
  const context = buildProductContext(product);

  return `Génère tous les champs SEO et Google Merchant pour ce produit streetwear/art urbain.

## Données produit
${context}

## Instructions CTR pour le meta title
- Si "seo_title_existant" est non-null et déjà bon (contient le nom produit, ≤60 car.), améliore-le subtilement plutôt que de le remplacer complètement
- Sinon, structure : [Nom produit] [Attribut différenciant] | Walk By Streetart
- Ex : "Baskets Grises Unisexe Urban Style | Walk By Streetart"
- 20-60 caractères, mot-clé principal en tête

## Instructions CTR pour la meta description
- Si "seo_description_existante" est non-null et contient déjà "Livraison offerte dès 90€" et un CTA, améliore-la plutôt que de la remplacer
- Sinon, construire depuis zéro avec : "🚚 Livraison offerte dès 90€ ·" en début, 1-2 attributs clés, CTA actif en fin
- Émojis autorisés : 🚚 ✅ ⭐ 🔥 (max 2 par description)
- 120-160 caractères maximum

## Format de réponse
Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte (pas de texte avant/après) :

{
  "seoTitle": "Titre SEO optimisé (20-60 caractères, [Produit] [Attribut] | Walk By Streetart)",
  "seoDescription": "🚚 Livraison offerte dès 90€ · [attributs clés]. [CTA actif] (120-160 caractères)",
  "urlHandle": "url-produit-en-tirets-sans-accents",
  "description": "<p>Description HTML complète du produit en français (200-500 mots). Utilise des balises <p>, <ul>, <li>, <strong>. Mets en avant les caractéristiques, avantages et usage. Ton urbain/lifestyle. NE MENTIONNE PAS les tailles disponibles, le stock, la disponibilité ou les quantités.</p>",
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
- N'invente pas de GTIN, laisse vide si non disponible
- Dans la description, NE MENTIONNE JAMAIS les tailles en stock, la disponibilité, les quantités ou les pointures disponibles`;
}

export function buildSeoOnlyPrompt(product: EnrichedProduct): string {
  const context = buildProductContext(product);

  return `Génère uniquement les champs SEO pour ce produit streetwear/art urbain (Walk By Streetart).

## Données produit
${context}

## Instructions CTR
- Meta title : si "seo_title_existant" est déjà bon (≤60 car., contient le produit), améliore-le ; sinon crée [Produit] [Attribut] | Walk By Streetart (20-60 car.)
- Meta description : si "seo_description_existante" contient déjà "Livraison offerte dès 90€" et un CTA, améliore-la ; sinon crée depuis zéro avec "🚚 Livraison offerte dès 90€ ·" + attributs + CTA (120-160 car.)
- Description : si "description_existante" est déjà complète (>200 mots), améliore-la ; sinon crée depuis zéro. Ton urbain/lifestyle, sans mention de stock ni disponibilité

Retourne UNIQUEMENT un objet JSON valide :

{
  "seoTitle": "Titre SEO (20-60 car.) — ex: Veste Bomber Noir Oversize | Walk By Streetart",
  "seoDescription": "🚚 Livraison offerte dès 90€ · [attributs]. [CTA] (120-160 car.)",
  "urlHandle": "url-en-tirets-sans-accents",
  "description": "<p>Description HTML complète en français, ton urbain/lifestyle (sans mention de stock, tailles disponibles ou disponibilité)...</p>"
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
