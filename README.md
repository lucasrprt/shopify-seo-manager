# Shopify SEO Manager

Application Next.js pour gérer les descriptions produits, les champs SEO et les données Google Merchant de votre boutique Shopify (audience française).

## Fonctionnalités

- **Dashboard** : visualisation de tous les produits avec score de santé SEO + Google Merchant
- **Filtres avancés** : par score, champs manquants, marque, type, statut
- **Génération IA** : Claude (Anthropic) ou GPT-4o (OpenAI) pour générer en français :
  - Meta Title & Meta Description SEO optimisés
  - Description produit HTML complète
  - URL Handle propre
  - Tous les champs Google Merchant (catégorie, condition, marque, GTIN, couleur, matière, taille...)
- **Synchronisation Shopify** : mise à jour des metafields directement depuis l'interface
- **Actions groupées** : générer et synchroniser plusieurs produits à la fois
- **Validation en temps réel** : longueur, format, champs requis

## Stack

- **Framework** : Next.js 14 (App Router) + TypeScript
- **UI** : Tailwind CSS + Lucide Icons
- **IA** : Anthropic Claude + OpenAI GPT-4o
- **API** : Shopify Admin REST API

## Installation

### 1. Cloner le dépôt
```bash
git clone https://github.com/votre-compte/shopify-seo-manager.git
cd shopify-seo-manager
npm install
```

### 2. Configurer les variables d'environnement
```bash
cp .env.local.example .env.local
```

Remplissez `.env.local` avec vos clés :

| Variable | Description | Où l'obtenir |
|---|---|---|
| `SHOPIFY_SHOP_DOMAIN` | `votre-boutique.myshopify.com` | URL de votre boutique |
| `SHOPIFY_ACCESS_TOKEN` | Token d'accès Admin | Voir ci-dessous |
| `ANTHROPIC_API_KEY` | Clé API Claude | [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | Clé API OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) |
| `NEXT_PUBLIC_SHOPIFY_DOMAIN` | Même que `SHOPIFY_SHOP_DOMAIN` | — |

### 3. Créer un token d'accès Shopify

1. Depuis votre Shopify Admin, allez dans **Apps** > **Develop apps**
2. Cliquez **Create an app** → donnez-lui un nom (ex: "SEO Manager")
3. Dans **Configuration** > **Admin API access scopes**, activez :
   - `read_products`, `write_products`
   - `read_content`, `write_content`
4. Installez l'app et copiez le **Admin API access token**
5. Collez-le dans `SHOPIFY_ACCESS_TOKEN`

### 4. Lancer en développement
```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000)

## Déploiement sur Vercel

1. Pushez le code sur GitHub
2. Importez le dépôt sur [vercel.com](https://vercel.com)
3. Dans les paramètres du projet Vercel, ajoutez les **Environment Variables** depuis `.env.local.example`
4. Déployez !

> **Sécurité** : `.env.local` est dans `.gitignore` et ne sera jamais committé. Vos clés API restent privées et sont uniquement injectées via Vercel.

## Structure du projet

```
app/
  page.tsx                  # Dashboard principal
  products/[id]/page.tsx    # Éditeur produit
  api/
    shopify/products/       # GET produits Shopify
    shopify/sync/           # POST synchronisation
    generate/               # POST génération IA
components/
  ProductTable.tsx          # Tableau produits
  ProductFilters.tsx        # Barre de filtres
  HealthBadge.tsx           # Badge score santé
  GeneratePanel.tsx         # Panel génération IA
  FieldEditor.tsx           # Champ éditable
  BulkActionBar.tsx         # Actions groupées
lib/
  shopify.ts                # Client API Shopify
  ai.ts                     # Wrapper Claude + OpenAI
  prompts.ts                # Prompts français
  validators.ts             # Validation + score santé
types/
  index.ts                  # Types TypeScript
```

## Licence

MIT
