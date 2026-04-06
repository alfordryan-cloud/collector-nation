// Vercel serverless function — proxies Mux asset deletion
export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { assetId } = req.query;
  if (!assetId) return res.status(400).json({ error: 'Missing assetId' });

  const tokenId = process.env.VITE_MUX_TOKEN_ID;
  const secret = process.env.VITE_MUX_SECRET;
  const credentials = Buffer.from(`${tokenId}:${secret}`).toString('base64');

  try {
    await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Basic ${credentials}` },
    });
    return res.status(200).json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
