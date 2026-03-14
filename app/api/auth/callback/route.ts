import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!code || !shop || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
  }

  // Exchange code for permanent access token
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  const data = await tokenResponse.json();
  const token = data.access_token;

  if (!token) {
    return NextResponse.json(
      { error: 'Impossible de récupérer le token', details: data },
      { status: 400 }
    );
  }

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Token Shopify récupéré</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 640px; margin: 60px auto; padding: 20px; background: #f5f5f5; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h1 { color: #1a1a1a; margin-top: 0; }
    .token-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 14px; word-break: break-all; color: #166534; }
    .copy-btn { background: #16a34a; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 15px; margin-top: 12px; width: 100%; }
    .copy-btn:hover { background: #15803d; }
    .steps { background: #eff6ff; border-radius: 8px; padding: 20px; margin-top: 24px; }
    .steps h3 { margin-top: 0; color: #1e40af; }
    .steps ol { margin: 0; padding-left: 20px; color: #1e3a8a; line-height: 1.8; }
    code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ Token Shopify récupéré !</h1>
    <p>Voici votre token d'accès permanent :</p>
    <div class="token-box" id="token">${token}</div>
    <button class="copy-btn" onclick="navigator.clipboard.writeText('${token}').then(() => { this.textContent = '✅ Copié !'; setTimeout(() => this.textContent = 'Copier le token', 2000); })">
      Copier le token
    </button>
    <div class="steps">
      <h3>Prochaines étapes :</h3>
      <ol>
        <li>Copiez le token ci-dessus</li>
        <li>Dans Vercel → Settings → Environment Variables</li>
        <li>Ajoutez <code>SHOPIFY_ACCESS_TOKEN</code> = votre token</li>
        <li>Redéployez l'application</li>
      </ol>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
