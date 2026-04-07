import { describe, it, expect } from 'vitest'
import {
  parseTimestamp,
  fmtTimestamp,
  fmtPrice,
  getProductToFire,
  buildShopifyCartUrl,
  normalizeShopifyProduct,
} from './utils.js'

// ============================================================
// parseTimestamp
// ============================================================
describe('parseTimestamp', () => {
  it('parses mm:ss format', () => {
    expect(parseTimestamp('1:30')).toBe(90)
    expect(parseTimestamp('0:15')).toBe(15)
    expect(parseTimestamp('10:00')).toBe(600)
    expect(parseTimestamp('1:05')).toBe(65)
  })
  it('parses raw seconds', () => {
    expect(parseTimestamp('90')).toBe(90)
    expect(parseTimestamp('0')).toBe(0)
    expect(parseTimestamp('600')).toBe(600)
  })
  it('handles numeric input', () => {
    expect(parseTimestamp(90)).toBe(90)
    expect(parseTimestamp(0)).toBe(0)
  })
  it('handles null/undefined/empty → 0', () => {
    expect(parseTimestamp(null)).toBe(0)
    expect(parseTimestamp(undefined)).toBe(0)
    expect(parseTimestamp('')).toBe(0)
    expect(parseTimestamp('abc')).toBe(0)
  })
})

// ============================================================
// fmtTimestamp
// ============================================================
describe('fmtTimestamp', () => {
  it('formats seconds to mm:ss', () => {
    expect(fmtTimestamp(90)).toBe('1:30')
    expect(fmtTimestamp(65)).toBe('1:05')
    expect(fmtTimestamp(0)).toBe('0:00')
    expect(fmtTimestamp(600)).toBe('10:00')
  })
  it('never returns NaN', () => {
    expect(fmtTimestamp(null)).toBe('0:00')
    expect(fmtTimestamp(undefined)).toBe('0:00')
    expect(fmtTimestamp('abc')).toBe('0:00')
    expect(fmtTimestamp(NaN)).toBe('0:00')
  })
  it('round-trips with parseTimestamp', () => {
    const cases = [0, 15, 65, 90, 600, 3661]
    cases.forEach(secs => {
      expect(parseTimestamp(fmtTimestamp(secs))).toBe(secs)
    })
  })
})

// ============================================================
// fmtPrice
// ============================================================
describe('fmtPrice', () => {
  it('formats prices correctly', () => {
    expect(fmtPrice(9.99)).toBe('$9.99')
    expect(fmtPrice(100)).toBe('$100.00')
    expect(fmtPrice(0)).toBe('$0.00')
  })
  it('handles null/undefined', () => {
    expect(fmtPrice(null)).toBe('$0.00')
    expect(fmtPrice(undefined)).toBe('$0.00')
  })
})

// ============================================================
// getProductToFire — the stale closure bug we kept hitting
// ============================================================
describe('getProductToFire', () => {
  const tags = [
    { timestamp_seconds: 15, shopify_handle: 'product-a' },
    { timestamp_seconds: 60, shopify_handle: 'product-b' },
    { timestamp_seconds: 120, shopify_handle: 'product-c' },
  ]

  it('does not fire before 0.5s', () => {
    expect(getProductToFire(0, tags, new Set())).toBeNull()
    expect(getProductToFire(0.3, tags, new Set())).toBeNull()
  })

  it('does not fire before timestamp', () => {
    expect(getProductToFire(10, tags, new Set())).toBeNull()
    expect(getProductToFire(14.9, tags, new Set())).toBeNull()
  })

  it('fires exactly at timestamp', () => {
    const result = getProductToFire(15, tags, new Set())
    expect(result?.shopify_handle).toBe('product-a')
  })

  it('fires after timestamp', () => {
    const result = getProductToFire(20, tags, new Set())
    expect(result?.shopify_handle).toBe('product-a')
  })

  it('does NOT re-fire already-fired timestamps', () => {
    const fired = new Set([15])
    const result = getProductToFire(20, tags, fired)
    expect(result?.shopify_handle).not.toBe('product-a')
  })

  it('fires second product at its timestamp', () => {
    const fired = new Set([15])
    const result = getProductToFire(62, tags, fired)
    expect(result?.shopify_handle).toBe('product-b')
  })

  it('handles empty taggedProducts', () => {
    expect(getProductToFire(30, [], new Set())).toBeNull()
    expect(getProductToFire(30, null, new Set())).toBeNull()
  })

  it('handles string timestamp_seconds from DB', () => {
    const dbTags = [{ timestamp_seconds: '15', shopify_handle: 'product-a' }]
    const result = getProductToFire(16, dbTags, new Set())
    expect(result?.shopify_handle).toBe('product-a')
  })
})

// ============================================================
// buildShopifyCartUrl
// ============================================================
describe('buildShopifyCartUrl', () => {
  const domain = 'collector-station.myshopify.com'

  it('builds correct cart URL with items', () => {
    const items = [
      { variantNumericId: '12345', qty: 2 },
      { variantNumericId: '67890', qty: 1 },
    ]
    expect(buildShopifyCartUrl(domain, items))
      .toBe('https://collector-station.myshopify.com/cart/12345:2,67890:1')
  })

  it('returns base cart URL for empty cart', () => {
    expect(buildShopifyCartUrl(domain, []))
      .toBe('https://collector-station.myshopify.com/cart')
  })

  it('skips items without variantNumericId', () => {
    const items = [
      { variantNumericId: '12345', qty: 1 },
      { qty: 1 }, // missing ID
    ]
    expect(buildShopifyCartUrl(domain, items))
      .toBe('https://collector-station.myshopify.com/cart/12345:1')
  })
})

// ============================================================
// normalizeShopifyProduct
// ============================================================
describe('normalizeShopifyProduct', () => {
  const mockProduct = {
    id: 123456,
    handle: 'test-product',
    title: 'Test Product',
    variants: [{ price: '49.99', compare_at_price: '59.99', available: true }],
    images: [{ src: 'https://example.com/img.jpg' }],
    tags: ['new', 'sports'],
  }

  it('normalizes price correctly', () => {
    const p = normalizeShopifyProduct(mockProduct)
    expect(p.price).toBe(49.99)
    expect(p.compareAtPrice).toBe(59.99)
  })

  it('sets SALE badge when compare price is higher', () => {
    const p = normalizeShopifyProduct(mockProduct)
    expect(p.badge).toBe('SALE')
  })

  it('sets NEW badge when no compare price but has new tag', () => {
    const p = normalizeShopifyProduct({
      ...mockProduct,
      variants: [{ price: '49.99', available: true }],
    })
    expect(p.badge).toBe('NEW')
  })

  it('handles tags as array', () => {
    const p = normalizeShopifyProduct({ ...mockProduct, tags: ['hot'] })
    expect(p.tags).toContain('hot')
  })

  it('handles tags as comma string', () => {
    const p = normalizeShopifyProduct({ ...mockProduct, tags: 'hot, trending' })
    expect(p.tags).toContain('hot')
    expect(p.tags).toContain('trending')
  })

  it('handles missing images', () => {
    const p = normalizeShopifyProduct({ ...mockProduct, images: [] })
    expect(p.primaryImage).toBeNull()
  })

  it('id is always a string', () => {
    const p = normalizeShopifyProduct(mockProduct)
    expect(typeof p.id).toBe('string')
  })
})
