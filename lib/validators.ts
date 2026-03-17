import type { EnrichedProduct, HealthStatus } from "@/types";

export interface FieldValidation {
  field: string;
  label: string;
  valid: boolean;
  warning?: string;
  error?: string;
}

export function validateSeoTitle(value: string): FieldValidation {
  const label = "Meta Title SEO";
  if (!value) return { field: "seoTitle", label, valid: false, error: "Champ requis" };
  if (value.length > 60) return { field: "seoTitle", label, valid: false, warning: `Trop long (${value.length}/60 car.)` };
  if (value.length < 20) return { field: "seoTitle", label, valid: false, warning: `Trop court (${value.length}/20 min)` };
  return { field: "seoTitle", label, valid: true };
}

export function validateSeoDescription(value: string): FieldValidation {
  const label = "Meta Description SEO";
  if (!value) return { field: "seoDescription", label, valid: false, error: "Champ requis" };
  if (value.length > 160) return { field: "seoDescription", label, valid: false, warning: `Trop long (${value.length}/160 car.)` };
  if (value.length < 50) return { field: "seoDescription", label, valid: false, warning: `Trop court (${value.length}/50 min)` };
  return { field: "seoDescription", label, valid: true };
}

export function validateUrlHandle(value: string): FieldValidation {
  const label = "URL Handle";
  if (!value) return { field: "urlHandle", label, valid: false, error: "Champ requis" };
  if (!/^[a-z0-9-]+$/.test(value)) return { field: "urlHandle", label, valid: false, error: "Uniquement lettres minuscules, chiffres et tirets" };
  return { field: "urlHandle", label, valid: true };
}

export function validateDescription(value: string): FieldValidation {
  const label = "Description produit";
  if (!value || value === "<p></p>" || value.trim() === "") {
    return { field: "description", label, valid: false, error: "Champ requis" };
  }
  const textLength = value.replace(/<[^>]+>/g, "").length;
  if (textLength < 100) return { field: "description", label, valid: false, warning: `Description trop courte (${textLength} car.)` };
  return { field: "description", label, valid: true };
}

export function validateGtin(value: string): FieldValidation {
  const label = "GTIN";
  if (!value) return { field: "googleGtin", label, valid: false, warning: "Recommandé pour Google Shopping" };
  // Strip spaces, dashes and other non-digit characters before validating
  const digits = value.replace(/\D/g, "");
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) {
    return { field: "googleGtin", label, valid: false, error: `Format invalide (${digits.length} chiffres — EAN-13 requis)` };
  }
  return { field: "googleGtin", label, valid: true };
}

export function validateGoogleCondition(value: string): FieldValidation {
  const label = "Condition";
  if (!value) return { field: "googleCondition", label, valid: false, error: "Champ requis pour Google Shopping" };
  if (!["new", "used", "refurbished"].includes(value)) {
    return { field: "googleCondition", label, valid: false, error: "Valeur invalide" };
  }
  return { field: "googleCondition", label, valid: true };
}

export function computeHealth(product: EnrichedProduct): HealthStatus {
  const seoValidations = [
    validateSeoTitle(product.seoTitle),
    validateSeoDescription(product.seoDescription),
    validateUrlHandle(product.urlHandle),
    validateDescription(product.description),
  ];

  const googleValidations = [
    validateGoogleCondition(product.googleCondition),
    { field: "googleCategory", label: "Catégorie Google", valid: !!product.googleCategory, error: !product.googleCategory ? "Champ requis" : undefined },
    { field: "googleBrand", label: "Marque", valid: !!product.googleBrand, error: !product.googleBrand ? "Champ requis" : undefined },
    validateGtin(product.googleGtin),
    { field: "googleMpn", label: "MPN", valid: !!product.googleMpn, warning: !product.googleMpn ? "Recommandé" : undefined },
    { field: "googleColor", label: "Couleur", valid: !!product.googleColor, warning: !product.googleColor ? "Recommandé" : undefined },
    { field: "googleMaterial", label: "Matière", valid: !!product.googleMaterial, warning: !product.googleMaterial ? "Recommandé" : undefined },
    { field: "googleSize", label: "Taille", valid: !!product.googleSize, warning: !product.googleSize ? "Recommandé" : undefined },
  ];

  const seoErrors = seoValidations.filter((v) => !v.valid && v.error);
  const seoWarnings = seoValidations.filter((v) => !v.valid && v.warning);
  const googleErrors = googleValidations.filter((v) => !v.valid && v.error);
  const googleWarnings = googleValidations.filter((v) => !v.valid && v.warning);

  const seoRequired = 4;
  const googleRequired = 4; // condition, category, brand, gtin

  const seoScore = Math.round(
    ((seoRequired - seoErrors.length) / seoRequired) * 100
  );
  const googleScore = Math.round(
    ((googleRequired - googleErrors.length) / googleRequired) * 100
  );

  const missingFields = [
    ...seoErrors.map((v) => v.label),
    ...googleErrors.map((v) => v.label),
  ];

  const warnings = [
    ...seoWarnings.map((v) => `${v.label}: ${v.warning}`),
    ...googleWarnings.map((v) => `${v.label}: ${v.warning}`),
  ];

  const score = Math.round((seoScore + googleScore) / 2);

  return { score, seoScore, googleScore, missingFields, warnings };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
