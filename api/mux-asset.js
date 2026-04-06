// Vercel serverless function — proxies Mux asset/upload status checks
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, id } = req.query;
  if (!id || !type) {
    return res.status(400).json({ error: 'Missing type or id' });
  }

  const tokenId = process.env.VITE_MUX_TOKEN_ID;
  const secret = process.env.VITE_MUX_SECRET;
  const credentials = Buffer.from(`${tokenId}:${secret}`).toString('base64');

  const endpoint = type === 'upload'
    ? `https://api.mux.com/video/v1/uploads/${id}`
    : `https://api.mux.com/video/v1/assets/${id}`;

  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Basic ${credentials}` },
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Mux API error' });
    }
    return res.status(200).json(data.data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
