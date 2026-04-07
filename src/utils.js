// ============================================================
// SHARED UTILITIES — extracted so they can be tested in isolation
// ============================================================

/**
 * Parse a timestamp string into seconds
 * Handles: "1:30" → 90, "90" → 90, null/undefined → 0
 */
export function parseTimestamp(val) {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  if (str.includes(':')) {
    const [m, s] = str.split(':');
    return (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
  }
  const n = parseInt(str);
  return isNaN(n) ? 0 : n;
}

/**
 * Format seconds into mm:ss display string
 * Handles: 90 → "1:30", null → "0:00", "90" → "1:30"
 */
export function fmtTimestamp(secs) {
  const n = parseInt(secs) || 0;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format price to $X.XX
 */
export function fmtPrice(n) {
  return `$${parseFloat(n || 0).toFixed(2)}`;
}

/**
 * Check whether a tagged product should fire at a given playback time
 * Returns the product handle to fire, or null
 */
export function getProductToFire(currentSec, taggedProducts, firedSet) {
  if (!taggedProducts?.length || currentSec < 0.5) return null;
  for (const tp of taggedProducts) {
    const ts = parseInt(tp.timestamp_seconds) || 0;
    if (firedSet.has(ts)) continue;
    if (currentSec >= ts) {
      return tp;
    }
  }
  return null;
}

/**
 * Build a Shopify cart URL from cart items
 */
export function buildShopifyCartUrl(domain, items) {
  if (!items?.length) return `https://${domain}/cart`;
  const lineItems = items
    .filter(i => i.variantNumericId)
    .map(i => `${i.variantNumericId}:${i.qty}`)
    .join(',');
  return lineItems
    ? `https://${domain}/cart/${lineItems}`
    : `https://${domain}/cart`;
}

/**
 * Normalize a Shopify product from products.json format
 */
export function normalizeShopifyProduct(p) {
  const variant = p.variants?.[0];
  const price = parseFloat(variant?.price || 0);
  const compareAt = variant?.compare_at_price ? parseFloat(variant.compare_at_price) : null;
  const available = p.variants?.some(v => v.available) ?? false;
  const tags = Array.isArray(p.tags) ? p.tags : (p.tags ? p.tags.split(', ') : []);

  let badge = null;
  if (available && compareAt && compareAt > price) badge = 'SALE';
  else if (available && tags.includes('new')) badge = 'NEW';
  else if (available && (tags.includes('hot') || tags.includes('trending'))) badge = 'HOT';

  return {
    id: String(p.id),
    handle: p.handle,
    name: p.title,
    price,
    compareAtPrice: compareAt,
    available,
    primaryImage: p.images?.[0]?.src || null,
    variants: p.variants || [],
    defaultVariant: variant,
    badge,
    tags,
  };
}
