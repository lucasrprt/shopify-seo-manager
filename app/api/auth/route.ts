import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!shop || !clientId) {
    return NextResponse.json(
      { error: 'Variables manquantes : SHOPIFY_SHOP_DOMAIN ou SHOPIFY_CLIENT_ID' },
      { status: 400 }
    );
  }

  const redirectUri = `${appUrl}/api/auth/callback`;
  const scopes = 'read_products,write_products';

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${clientId}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(authUrl);
}
