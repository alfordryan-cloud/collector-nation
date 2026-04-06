// Vercel serverless function — proxies Mux upload URL creation
// Runs server-side so secret key is never exposed to browser
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tokenId = process.env.VITE_MUX_TOKEN_ID;
  const secret = process.env.VITE_MUX_SECRET;

  if (!tokenId || !secret) {
    return res.status(500).json({ error: 'Mux credentials not configured' });
  }

  try {
    const credentials = Buffer.from(`${tokenId}:${secret}`).toString('base64');
    const origin = req.headers.origin || 'https://collector-nation-alfordryan-cloud.vercel.app';

    const response = await fetch('https://api.mux.com/video/v1/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        cors_origin: origin,
        new_asset_settings: {
          playback_policy: ['public'],
          mp4_support: 'none',
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Mux API error' });
    }

    return res.status(200).json({
      uploadId: data.data.id,
      uploadUrl: data.data.url,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
