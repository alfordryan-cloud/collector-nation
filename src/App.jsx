import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import MuxPlayer from "@mux/mux-player-react";
import VideoCMS from "./VideoCMS.jsx";

// ============================================================
// SHOPIFY CONFIG — uses public products.json (no token needed)
// ============================================================
const SHOPIFY_DOMAIN = "collector-station.myshopify.com";

// ============================================================
// MUX CONFIG
// ============================================================
const MUX_VOD_PLAYBACK_ID = "rR8P8mSaKDzz02TsftugTUdI00cQPJX00o";

// Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_ANON_KEY || ""
);

async function fetchVideosFromDB() {
  // Check env vars are loaded before attempting
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || key === "PASTE_YOUR_TOKEN_HERE") {
    console.warn("Supabase env vars not configured");
    return [];
  }
  const { data, error } = await supabase
    .from("videos")
    .select("*, video_products(*)")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
const MUX_LIVE_PLAYBACK_ID = "IumlbKCxz8GwwZSu4ASkGIYU5uh7opdNABuI77yhTgw";

// Fetch products from public JSON feed — no auth required
async function fetchShopifyProducts() {
  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/products.json?limit=250`,
    { headers: { "Accept": "application/json" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.products;
}

// Normalize Shopify product to our internal format
function normalizeProduct(p) {
  const variant = p.variants?.[0];
  const price = parseFloat(variant?.price || 0);
  const compareAt = variant?.compare_at_price ? parseFloat(variant.compare_at_price) : null;
  const inventory = p.variants?.reduce((s, v) => s + (v.inventory_quantity || 0), 0) ?? 0;
  const available = p.variants?.some(v => v.available) ?? false;
  const image = p.images?.[0]?.src || null;

  const tags = Array.isArray(p.tags) ? p.tags : (p.tags ? p.tags.split(", ") : []);
  let badge = null;
  if (!available) badge = null;
  else if (compareAt && compareAt > price) badge = "SALE";
  else if (tags.includes("new")) badge = "NEW";
  else if (tags.includes("hot") || tags.includes("trending")) badge = "HOT";

  return {
    id: String(p.id),
    handle: p.handle,
    name: p.title,
    description: p.body_html?.replace(/<[^>]+>/g, "") || "",
    vendor: p.vendor,
    category: p.product_type || "Products",
    price,
    compareAtPrice: compareAt,
    available,
    primaryImage: image,
    images: p.images?.map(i => i.src) || [],
    variants: p.variants || [],
    defaultVariant: variant,
    badge,
    tags,
  };
}

// ============================================================
// MOCK DATA (videos, ads, schedule)
// ============================================================
const MOCK_DATA = {
  liveStream: { title: "The Collector Nation Live", viewers: 1847 },
  schedule: [
    { time: "2:00 PM", title: "Market Pulse Live", host: "Ryan Alford", live: true },
    { time: "4:00 PM", title: "The Break Room", host: "Cole & Team", live: false },
    { time: "6:00 PM", title: "Investor's Edge", host: "Ryan Alford", live: false },
    { time: "8:00 PM", title: "Rookie Report", host: "Jake Williams", live: false },
    { time: "10:00 PM", title: "After Hours Breaks", host: "Collector Station Crew", live: false },
  ],
  categories: ["All", "Breaks", "Market News", "Interviews", "How-To", "Investing"],
  videos: [
    { id: "v1", title: "2024 Topps Chrome Mega Box Break", category: "Breaks", duration: "24:18", views: "48K", creator: "Cole", isNew: true, isTrending: true, muxPlaybackId: MUX_VOD_PLAYBACK_ID },
    { id: "v2", title: "Rookie Card Market Report — Q1 2025", category: "Market News", duration: "18:42", views: "31K", creator: "Ryan Alford", isNew: true, isTrending: false, muxPlaybackId: null },
    { id: "v3", title: "PSA Grading Explained — Complete Guide", category: "How-To", duration: "32:05", views: "92K", creator: "Ryan Alford", isNew: false, isTrending: true, muxPlaybackId: null },
    { id: "v4", title: "Prizm vs Optic: Which Wins in 2025?", category: "Investing", duration: "21:30", views: "67K", creator: "Jake Williams", isNew: false, isTrending: true, muxPlaybackId: null },
    { id: "v5", title: "The God Pack Pull — $1,200 Pokémon", category: "Breaks", duration: "9:47", views: "214K", creator: "Cole", isNew: false, isTrending: true, muxPlaybackId: null },
    { id: "v6", title: "Collector Interview: Building a Million Dollar PC", category: "Interviews", duration: "45:12", views: "28K", creator: "Ryan Alford", isNew: false, isTrending: false, muxPlaybackId: null },
    { id: "v7", title: "Football Rookie Watch: Draft Season", category: "Market News", duration: "15:55", views: "41K", creator: "Jake Williams", isNew: true, isTrending: false, muxPlaybackId: null },
    { id: "v8", title: "Sealed Wax Investing 101", category: "Investing", duration: "28:10", views: "55K", creator: "Ryan Alford", isNew: false, isTrending: false, muxPlaybackId: null },
  ],
  campaigns: [
    { id: "cam1", name: "PSA Summer Push", advertiser: "PSA Grading", budget: 5000, cpm: 12.00, impressionGoal: 416666, impressionsDelivered: 287430, start: "2025-04-01", end: "2025-06-30", status: "active", placement: "pre-roll" },
    { id: "cam2", name: "COMC Q2 Awareness", advertiser: "COMC Marketplace", budget: 3000, cpm: 8.50, impressionGoal: 352941, impressionsDelivered: 89221, start: "2025-04-15", end: "2025-05-15", status: "active", placement: "in-feed" },
    { id: "cam3", name: "Beckett Price Guide", advertiser: "Beckett Media", budget: 2500, cpm: 15.00, impressionGoal: 166666, impressionsDelivered: 166666, start: "2025-03-01", end: "2025-03-31", status: "completed", placement: "banner" },
  ],
};

// ============================================================
// STYLES
// ============================================================
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=Barlow:wght@300;400;500&family=Oswald:wght@500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --black:#080808;--surface:#111;--surface2:#181818;--surface3:#222;
    --border:#2a2a2a;--border2:#333;--red:#C0272D;--red-dim:#8a1c20;
    --gold:#C9A84C;--white:#f0f0f0;--gray:#888;--gray2:#555;--live:#00c853;
    --fd:'Oswald',sans-serif;--fc:'Barlow Condensed',sans-serif;--fb:'Barlow',sans-serif;
  }
  html,body,#root{height:100%;background:var(--black);color:var(--white);font-family:var(--fb);font-size:14px;-webkit-font-smoothing:antialiased}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--surface)}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
  .app{display:flex;flex-direction:column;min-height:100vh}

  .nav{position:sticky;top:0;z-index:100;background:var(--black);border-bottom:1px solid var(--border);padding:0 16px;height:56px;display:flex;align-items:center;gap:12px}
  .nav-logo{font-family:var(--fd);font-size:20px;font-weight:700;letter-spacing:1px;display:flex;align-items:center;gap:4px;flex-shrink:0}
  .nav-logo .r{color:var(--red)}.nav-logo .g{color:var(--gold);font-size:22px}
  .nav-tabs{display:flex;gap:2px;overflow-x:auto;flex:1;scrollbar-width:none}
  .nav-tabs::-webkit-scrollbar{display:none}
  .ntab{padding:6px 12px;border-radius:4px;font-family:var(--fc);font-size:13px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--gray);background:none;border:none;cursor:pointer;white-space:nowrap;transition:all .15s}
  .ntab:hover{color:var(--white);background:var(--surface2)}.ntab.on{color:var(--white);background:var(--red)}
  .cart-btn{position:relative;background:none;border:none;cursor:pointer;color:var(--gray);font-size:18px;padding:4px;display:flex;align-items:center;transition:color .15s}
  .cart-btn:hover{color:var(--white)}
  .cbadge{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:var(--red);color:var(--white);font-family:var(--fc);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center}

  .live-badge{display:inline-flex;align-items:center;gap:5px;background:var(--red);color:var(--white);font-family:var(--fc);font-size:11px;font-weight:700;letter-spacing:1px;padding:2px 7px;border-radius:2px}
  .ldot{width:6px;height:6px;border-radius:50%;background:#fff;animation:lp 1.2s infinite}
  @keyframes lp{0%,100%{opacity:1}50%{opacity:.3}}

  .live-wrap{position:relative;background:#000;aspect-ratio:16/9;max-height:420px;overflow:hidden}
  .live-ph{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#0a0a0a,#1a1a1a,#0f0f0f);gap:12px}
  .live-art{font-family:var(--fd);font-size:clamp(28px,6vw,56px);font-weight:700;letter-spacing:2px;color:var(--white);text-align:center;line-height:1}
  .live-art span{color:var(--red)}
  .live-play{width:60px;height:60px;border-radius:50%;background:var(--red);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--white);transition:transform .2s;margin-top:8px}
  .live-play:hover{transform:scale(1.08)}
  .live-ov{position:absolute;bottom:0;left:0;right:0;padding:12px 16px;background:linear-gradient(transparent,rgba(0,0,0,.9));display:flex;align-items:flex-end;justify-content:space-between}
  .live-ov-title{font-family:var(--fc);font-size:16px;font-weight:700;color:var(--white)}
  .live-vw{font-family:var(--fc);font-size:12px;color:var(--gray);display:flex;align-items:center;gap:5px}
  .vwdot{width:6px;height:6px;border-radius:50%;background:var(--live)}
  .sched{padding:0 16px;overflow-x:auto;scrollbar-width:none;display:flex;gap:2px;border-bottom:1px solid var(--border)}
  .sched::-webkit-scrollbar{display:none}
  .sched-item{flex-shrink:0;padding:10px 14px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}
  .sched-item:hover{background:var(--surface2)}.sched-item.on{border-bottom-color:var(--red)}
  .sched-time{font-family:var(--fc);font-size:11px;color:var(--gray);letter-spacing:.5px;text-transform:uppercase;margin-bottom:2px}
  .sched-title{font-family:var(--fc);font-size:13px;font-weight:600;color:var(--white);white-space:nowrap}
  .sched-host{font-family:var(--fb);font-size:11px;color:var(--gray2);margin-top:1px}

  .shdr{display:flex;align-items:center;justify-content:space-between;padding:20px 16px 12px}
  .stitle{font-family:var(--fd);font-size:18px;font-weight:600;letter-spacing:.5px;color:var(--white);display:flex;align-items:center;gap:8px}
  .stitle::before{content:'';width:3px;height:18px;background:var(--red);border-radius:1px;display:inline-block}

  .cpills{display:flex;gap:6px;padding:0 16px 12px;overflow-x:auto;scrollbar-width:none}
  .cpills::-webkit-scrollbar{display:none}
  .cpill{padding:5px 14px;border-radius:20px;flex-shrink:0;font-family:var(--fc);font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;border:1px solid var(--border2);color:var(--gray);background:none;cursor:pointer;transition:all .15s}
  .cpill:hover{color:var(--white);border-color:var(--gray)}.cpill.on{background:var(--red);border-color:var(--red);color:var(--white)}

  .vgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--border);margin:0 16px;border-radius:6px;overflow:hidden}
  .vcard{background:var(--surface2);cursor:pointer;transition:background .15s}.vcard:hover{background:var(--surface3)}
  .vthumb{position:relative;aspect-ratio:16/9;background:var(--surface3);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:28px;}
  .vdur{position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.85);color:var(--white);font-family:var(--fc);font-size:11px;font-weight:600;padding:2px 5px;border-radius:2px}
  .vbadge{position:absolute;top:6px;left:6px;font-family:var(--fc);font-size:10px;font-weight:700;padding:2px 5px;border-radius:2px}
  .vinfo{padding:8px 10px 10px}
  .vtitle{font-family:var(--fc);font-size:13px;font-weight:600;color:var(--white);line-height:1.3;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .vmeta{display:flex;align-items:center;justify-content:space-between;font-family:var(--fb);font-size:11px;color:var(--gray2)}

  .pgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:0 16px}
  .pcard{background:var(--surface2);border-radius:6px;overflow:hidden;border:1px solid var(--border);cursor:pointer;transition:border-color .15s,transform .15s}
  .pcard:hover{border-color:var(--red);transform:translateY(-2px)}
  .pcard.sold{opacity:.55}
  .pimg{aspect-ratio:1;background:var(--surface3);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
  .pimg img{width:100%;height:100%;object-fit:cover}
  .pimg-ph{font-size:36px;opacity:.4}
  .pbadge{position:absolute;top:6px;right:6px;font-family:var(--fc);font-size:9px;font-weight:700;letter-spacing:.5px;padding:2px 5px;border-radius:2px}
  .pbadge.hot{background:#ff6d00;color:#fff}.pbadge.new{background:var(--gold);color:#000}
  .pbadge.low{background:var(--red);color:#fff}.pbadge.sale{background:#00c853;color:#000}
  .sold-ov{position:absolute;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:var(--fc);font-size:12px;font-weight:700;color:var(--gray);letter-spacing:1px}
  .pinfo{padding:8px}
  .pname{font-family:var(--fc);font-size:12px;font-weight:600;color:var(--white);line-height:1.3;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .pprice{font-family:var(--fc);font-size:14px;font-weight:700;color:var(--gold)}
  .pcompare{font-family:var(--fc);font-size:11px;color:var(--gray2);text-decoration:line-through;margin-left:4px}
  .pinv{font-size:10px;color:var(--gray2);margin-top:2px}

  .skel-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:0 16px}
  .skel{background:var(--surface2);border-radius:6px;overflow:hidden;border:1px solid var(--border);animation:sh 1.5s infinite}
  .skel-img{aspect-ratio:1;background:var(--surface3)}
  .skel-line{height:12px;background:var(--surface3);margin:8px;border-radius:2px}
  .skel-line.s{width:60%}
  @keyframes sh{0%,100%{opacity:1}50%{opacity:.5}}

  .modal{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.96);display:flex;flex-direction:column;animation:fi .2s ease}
  @keyframes fi{from{opacity:0}to{opacity:1}}
  .mhdr{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0}
  .mclose{background:none;border:none;cursor:pointer;color:var(--gray);font-size:20px;padding:4px;display:flex;align-items:center}
  .mclose:hover{color:var(--white)}
  .mtitle{font-family:var(--fc);font-size:15px;font-weight:600;color:var(--white);flex:1;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
  .mbody{flex:1;overflow-y:auto}

  .pdtl{padding:16px}
  .pdtl-img{aspect-ratio:1;background:#fff;border-radius:8px;overflow:hidden;margin-bottom:16px;display:flex;align-items:center;justify-content:center}
  .pdtl-img img{width:100%;height:100%;object-fit:contain}
  .pdtl-name{font-family:var(--fd);font-size:22px;font-weight:600;color:var(--white);margin-bottom:4px}
  .pdtl-vendor{font-family:var(--fc);font-size:12px;color:var(--gray);letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px}
  .pdtl-price{font-family:var(--fd);font-size:32px;font-weight:700;color:var(--gold);margin-bottom:8px;display:flex;align-items:baseline;gap:8px}
  .pdtl-compare{font-size:20px;color:var(--gray2);text-decoration:line-through}
  .pdtl-inv{font-family:var(--fc);font-size:12px;margin-bottom:16px}
  .inv-ok{color:var(--live)}.inv-low{color:var(--gold)}.inv-out{color:var(--red)}
  .pdtl-desc{font-size:13px;color:var(--gray);line-height:1.6;margin-bottom:16px}
  .var-label{font-family:var(--fc);font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--gray);margin-bottom:6px}
  .var-pills{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
  .vpill{padding:5px 12px;border-radius:3px;border:1px solid var(--border2);font-family:var(--fc);font-size:12px;font-weight:600;color:var(--gray);background:none;cursor:pointer;transition:all .15s}
  .vpill:hover{color:var(--white);border-color:var(--gray)}.vpill.on{background:var(--surface3);border-color:var(--red);color:var(--white)}
  .vpill.na{opacity:.4;cursor:not-allowed;text-decoration:line-through}
  .atc-btn{width:100%;padding:14px;border-radius:4px;background:var(--red);color:var(--white);border:none;cursor:pointer;font-family:var(--fc);font-size:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;transition:background .15s}
  .atc-btn:hover{background:#d42d34}.atc-btn:disabled{background:var(--gray2);cursor:not-allowed}
  .shopify-btn{width:100%;padding:14px;border-radius:4px;background:#5c6bc0;color:var(--white);border:none;cursor:pointer;font-family:var(--fc);font-size:14px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;transition:background .15s}
  .shopify-btn:hover{background:#4a56a6}

  .cart-drawer{position:fixed;inset:0;z-index:300;display:flex;flex-direction:column;background:var(--black);animation:sfr .25s ease}
  @keyframes sfr{from{transform:translateX(100%)}to{transform:translateX(0)}}
  .chdr{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
  .ctitle{font-family:var(--fd);font-size:20px;font-weight:600;color:var(--white)}
  .citems{flex:1;overflow-y:auto;padding:16px}
  .citem{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
  .citem-img{width:60px;height:60px;border-radius:4px;background:var(--surface2);flex-shrink:0;overflow:hidden}
  .citem-img img{width:100%;height:100%;object-fit:cover}
  .citem-ph{width:60px;height:60px;border-radius:4px;background:var(--surface2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px}
  .citem-name{font-family:var(--fc);font-size:14px;font-weight:600;color:var(--white);margin-bottom:4px}
  .citem-var{font-size:11px;color:var(--gray2);margin-bottom:4px}
  .citem-price{font-family:var(--fc);font-size:13px;color:var(--gold)}
  .crm{background:none;border:none;cursor:pointer;color:var(--gray);margin-left:auto;font-size:16px;align-self:flex-start}
  .cftr{padding:16px;border-top:1px solid var(--border)}
  .ctotal{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .ctotal-lbl{font-family:var(--fc);font-size:14px;font-weight:600;color:var(--gray);text-transform:uppercase;letter-spacing:.5px}
  .ctotal-val{font-family:var(--fd);font-size:24px;font-weight:700;color:var(--white)}
  .co-btn{width:100%;padding:14px;border-radius:4px;background:var(--red);color:var(--white);border:none;cursor:pointer;font-family:var(--fc);font-size:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
  .empty-cart{padding:40px 16px;text-align:center}

  .player-stage{aspect-ratio:16/9;background:linear-gradient(135deg,#0d0d0d,#1a1a1a);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;position:relative}
  .p-play{width:64px;height:64px;border-radius:50%;background:var(--red);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--white);transition:transform .2s}
  .p-play:hover{transform:scale(1.08)}
  .pcontrols{padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border)}
  .pbar{width:100%;height:4px;border-radius:2px;background:var(--border2);position:relative;cursor:pointer;margin-bottom:8px}
  .pfill{height:100%;border-radius:2px;background:var(--red)}
  .pcrow{display:flex;align-items:center;justify-content:space-between;font-family:var(--fc);font-size:12px;color:var(--gray)}
  .cbtn{background:none;border:none;cursor:pointer;color:var(--gray);font-size:16px;padding:4px;display:flex}
  .cbtn:hover{color:var(--white)}
  /* Shoppable bar — always sits below video, featured state uses transform to pop */
  .shop-ov-wrap{
    overflow:hidden;
    border-top:2px solid var(--gold);
    border-bottom:1px solid rgba(201,168,76,.2);
  }
  .shop-ov-featured{
    background:rgba(8,8,8,.98);
    padding:14px 14px;
    display:flex;align-items:center;gap:12px;cursor:pointer;
    transform:translateY(0);
    animation:shopPop .4s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes shopPop{
    from{transform:translateY(100%);opacity:0}
    to{transform:translateY(0);opacity:1}
  }
  .shop-ov-docked{
    background:rgba(0,0,0,.97);
    padding:10px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;
    animation:shopSettle .25s ease;
  }
  @keyframes shopSettle{
    from{transform:translateY(-2px);opacity:.9}
    to{transform:translateY(0);opacity:1}
  }
  .shop-ov-img{width:44px;height:44px;border-radius:4px;object-fit:cover;flex-shrink:0}
  .shop-ov-img-lg{width:52px;height:52px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid rgba(201,168,76,.4)}
  .shop-ov-btn{padding:6px 14px;border-radius:3px;background:var(--gold);color:#000;border:none;cursor:pointer;font-family:var(--fc);font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;white-space:nowrap}
  .shop-ov-img{width:48px;height:48px;border-radius:4px;object-fit:cover;flex-shrink:0}
  .shop-ov-btn{margin-left:auto;padding:6px 14px;border-radius:3px;background:var(--gold);color:#000;border:none;cursor:pointer;font-family:var(--fc);font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;white-space:nowrap}
  .preroll{position:absolute;inset:0;z-index:10;background:var(--black);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
  .pr-skip{position:absolute;bottom:12px;right:12px;padding:6px 14px;border-radius:3px;background:rgba(255,255,255,.1);border:1px solid var(--border2);color:var(--white);font-family:var(--fc);font-size:12px;font-weight:600;cursor:pointer}

  .ad-infeed{margin:16px;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:12px 14px;display:flex;gap:12px;align-items:center}
  .ad-lbl{font-family:var(--fc);font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
  .ad-cta{padding:5px 12px;border-radius:3px;background:var(--gold);color:#000;border:none;cursor:pointer;font-family:var(--fc);font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}

  .sbar{display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:8px 12px;margin:12px 16px}
  .sinput{background:none;border:none;outline:none;color:var(--white);font-family:var(--fb);font-size:14px;flex:1}
  .sinput::placeholder{color:var(--gray2)}

  .avatar{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--red-dim));display:flex;align-items:center;justify-content:center;font-family:var(--fd);font-size:26px;font-weight:700;color:var(--white);flex-shrink:0}

  .admin-tabs{display:flex;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--border);padding:0 16px}
  .admin-tabs::-webkit-scrollbar{display:none}
  .atab{padding:12px 14px;flex-shrink:0;font-family:var(--fc);font-size:13px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--gray);background:none;border:none;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}
  .atab:hover{color:var(--white)}.atab.on{color:var(--red);border-bottom-color:var(--red)}
  .stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px}
  .stat-card{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:14px}
  .slbl{font-family:var(--fc);font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--gray);margin-bottom:6px}
  .sval{font-family:var(--fd);font-size:26px;font-weight:700;color:var(--white)}
  .ssub{font-size:11px;color:var(--gray2);margin-top:4px}
  .spill{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:10px;font-family:var(--fc);font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
  .spill.active{background:rgba(0,200,83,.15);color:var(--live)}.spill.completed{background:rgba(136,136,136,.15);color:var(--gray)}
  .dbar{height:4px;border-radius:2px;background:var(--border2);overflow:hidden}
  .dfill{height:100%;border-radius:2px;background:var(--live)}
  .dtable{width:100%;border-collapse:collapse}
  .dtable th{font-family:var(--fc);font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--gray);padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
  .dtable td{padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--white)}
  .dtable tr:hover td{background:var(--surface2)}
  .tag{display:inline-flex;align-items:center;padding:2px 8px;border-radius:3px;font-family:var(--fc);font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;background:var(--surface3);color:var(--gray);margin-right:4px}
  .flbl{display:block;font-family:var(--fc);font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--gray);margin-bottom:5px}
  .finput{width:100%;padding:9px 12px;background:var(--surface3);border:1px solid var(--border2);border-radius:4px;color:var(--white);font-family:var(--fb);font-size:13px;outline:none}
  .fsel{width:100%;padding:9px 12px;background:var(--surface3);border:1px solid var(--border2);border-radius:4px;color:var(--white);font-family:var(--fb);font-size:13px;outline:none}
  .fsub{width:100%;padding:12px;border-radius:4px;background:var(--red);color:var(--white);border:none;cursor:pointer;font-family:var(--fc);font-size:14px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-top:6px}

  .live-chip{display:inline-flex;align-items:center;gap:4px;background:rgba(92,107,192,.15);border:1px solid rgba(92,107,192,.3);color:#7986cb;font-family:var(--fc);font-size:10px;font-weight:700;letter-spacing:.5px;padding:2px 7px;border-radius:3px}
  .live-chip-dot{width:5px;height:5px;border-radius:50%;background:#7986cb;animation:lp 2s infinite}

  .toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:999;background:var(--surface2);border:1px solid var(--border2);border-left:3px solid var(--gold);padding:10px 16px;border-radius:4px;font-family:var(--fc);font-size:13px;font-weight:600;color:var(--white);white-space:nowrap;animation:ti .25s ease, to .25s ease 2.5s forwards;pointer-events:none}
  @keyframes ti{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  @keyframes to{to{opacity:0;transform:translateX(-50%) translateY(10px)}}

  .err-banner{margin:16px;background:rgba(192,39,45,.1);border:1px solid var(--red-dim);border-radius:6px;padding:12px 14px;font-family:var(--fc);font-size:13px;color:var(--white);line-height:1.6}

  .bnav{position:fixed;bottom:0;left:0;right:0;z-index:90;background:var(--black);border-top:1px solid var(--border);display:flex;height:56px}
  .bnav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;background:none;border:none;font-family:var(--fc);font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--gray);transition:color .15s}
  .bnav-item.on{color:var(--red)}
  .bicon{font-size:18px}
  .gap{height:80px}
  .divider{height:1px;background:var(--border);margin:0 16px}
  .hitem{display:flex;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer}
  .hitem:hover{background:var(--surface2)}
  .hthumb{width:80px;height:45px;flex-shrink:0;background:var(--surface3);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:20px}
  .htitle{font-family:var(--fc);font-size:13px;font-weight:600;color:var(--white);line-height:1.3;margin-bottom:3px}
  .hmeta{font-size:11px;color:var(--gray2)}
`;

const fp = (n) => `$${parseFloat(n).toFixed(2)}`;
const fmt = (n) => n>=1e6?(n/1e6).toFixed(1)+"M":n>=1000?(n/1000).toFixed(0)+"K":String(n);
const pct = (a,b) => b>0?Math.min(100,Math.round((a/b)*100)):0;

function Toast({msg}){ return msg?<div className="toast">{msg}</div>:null; }

// ============================================================
// PRE-ROLL
// ============================================================
function PreRoll({onSkip, onImpression}) {
  const [cd, setCd] = useState(5);
  useEffect(()=>{
    onImpression?.();
    const t = setInterval(()=>setCd(c=>{if(c<=1){clearInterval(t);return 0;}return c-1;}),1000);
    return ()=>clearInterval(t);
  },[]);
  const cam = MOCK_DATA.campaigns.find(c=>c.placement==="pre-roll"&&c.status==="active");
  return (
    <div className="preroll">
      <div style={{fontFamily:"var(--fc)",fontSize:11,color:"var(--gray)",letterSpacing:".5px",textTransform:"uppercase"}}>Advertisement</div>
      <div style={{textAlign:"center",padding:"0 24px"}}>
        <div style={{fontFamily:"var(--fd)",fontSize:28,fontWeight:700,color:"var(--white)",marginBottom:6}}>{cam?.advertiser||"PSA Grading"}</div>
        <div style={{fontSize:14,color:"var(--gray)"}}>The world's most trusted grading service</div>
      </div>
      <div style={{fontFamily:"var(--fc)",fontSize:13,color:"var(--gray)"}}>{cd>0?`Skip in ${cd}s`:"Ad complete"}</div>
      {cd===0&&<button className="pr-skip" onClick={onSkip}>Continue to Video</button>}
    </div>
  );
}

// ============================================================
// VIDEO PLAYER
// ============================================================
function VideoPlayer({video, products, onClose, onAddToCart, onImpression}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showAd, setShowAd] = useState(true);
  const [shopProd, setShopProd] = useState(null);
  const [shopDocked, setShopDocked] = useState(false);
  const [showProd, setShowProd] = useState(false);
  const timer = useRef(null);
  const muxRef = useRef(null);
  const dockTimer = useRef(null);
  // Track which timestamps have already fired so we dont re-trigger
  const firedTimestamps = useRef(new Set());
  // Ref mirror of shopProd for use inside onTimeUpdate closure
  const shopProdRef = useRef(null);

  // Keep ref in sync with state
  useEffect(()=>{ shopProdRef.current = shopProd; },[shopProd]);

  // When a product is set, show featured for 3s then switch to docked
  // Use a separate effect that only triggers on shopProd identity change
  const shopProdId = shopProd?.id;
  useEffect(()=>{
    if(!shopProdId) return;
    setShopDocked(false);
    clearTimeout(dockTimer.current);
    dockTimer.current = setTimeout(()=>setShopDocked(true), 3000);
    return ()=>clearTimeout(dockTimer.current);
  },[shopProdId]);

  // Simulated player timer (for videos without Mux playback ID)
  useEffect(()=>{
    if(playing&&!showAd&&!video.muxPlaybackId){
      timer.current = setInterval(()=>{
        setProgress(p=>{
          const next = p+0.4;
          if(next>=100){clearInterval(timer.current);setPlaying(false);return 100;}
          return next;
        });
      },200);
    } else clearInterval(timer.current);
    return()=>clearInterval(timer.current);
  },[playing,showAd,video.muxPlaybackId]);

  return (
    <div className="modal">
      <div className="mhdr">
        <button className="mclose" onClick={onClose}>✕</button>
        <div className="mtitle">{video.title}</div>
      </div>
      <div className="mbody">
        <div style={{position:"relative",background:"#000"}}>
          {showAd ? (
            <div className="player-stage">
              <PreRoll onSkip={()=>setShowAd(false)} onImpression={()=>onImpression?.({type:"pre-roll",campaignId:"cam1"})}/>
            </div>
          ) : video.muxPlaybackId ? (
            /* Wrap player in relative container so featured overlay
               positions against the video frame only */
            <MuxPlayer
              ref={muxRef}
              playbackId={video.muxPlaybackId}
              streamType="on-demand"
              autoPlay={false}
              accentColor="#C0272D"
              style={{width:"100%",display:"block",maxHeight:"60vh","--controls":"auto"}}
              onTimeUpdate={e=>{
                const el = e.target;
                if(!el||!el.duration) return;
                const currentSec = el.currentTime;
                setProgress((currentSec/el.duration)*100);
                // Use ref to check current value — avoids stale closure bug
                if(video.taggedProducts?.length>0 && !shopProdRef.current){
                  video.taggedProducts.forEach(tp=>{
                    const tsKey = tp.timestamp_seconds;
                    // Only fire if not already fired for this timestamp
                    if(firedTimestamps.current.has(tsKey)) return;
                    if(Math.abs(currentSec - tsKey) < 2){
                      const prod = products.find(p=>p.handle===tp.shopify_handle);
                      if(prod){
                        firedTimestamps.current.add(tsKey);
                        setShopProd(prod);
                      }
                    }
                  });
                }
              }}
              onPlay={()=>setPlaying(true)}
              onPause={()=>setPlaying(false)}
            />
          ) : (
            <div style={{position:"relative"}}>
              <div className="player-stage">
                <div style={{textAlign:"center"}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:"clamp(16px,4vw,26px)",fontWeight:600,color:"var(--white)",padding:"0 20px",lineHeight:1.2}}>{video.title}</div>
                  <div style={{fontFamily:"var(--fc)",fontSize:13,color:"var(--gray)",marginTop:6}}>{video.creator}</div>
                </div>
                <button className="p-play" style={playing?{background:"rgba(255,255,255,.1)"}:{}} onClick={()=>setPlaying(!playing)}>
                  {playing?"⏸":"▶"}
                </button>
                {shopProd&&playing&&(
                  <div className="shop-ov" onClick={()=>{setShowProd(true);setPlaying(false);}}>
                    {shopProd.primaryImage&&<img className="shop-ov-img" src={shopProd.primaryImage} alt={shopProd.name}/>}
                    <div>
                      <div style={{fontFamily:"var(--fc)",fontSize:10,color:"var(--gold)",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase"}}>Featured Product</div>
                      <div style={{fontFamily:"var(--fc)",fontSize:14,fontWeight:600,color:"var(--white)"}}>{shopProd.name}</div>
                      <div style={{fontFamily:"var(--fc)",fontSize:13,color:"var(--gold)",fontWeight:700}}>{fp(shopProd.price)}</div>
                    </div>
                    <button className="shop-ov-btn">Shop Now</button>
                  </div>
                )}
              </div>
              <div className="pcontrols">
                <div className="pbar" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setProgress(((e.clientX-r.left)/r.width)*100);}}>
                  <div className="pfill" style={{width:progress+"%"}}/>
                </div>
                <div className="pcrow">
                  <div style={{display:"flex",gap:4}}>
                    <button className="cbtn" onClick={()=>setPlaying(!playing)}>{playing?"⏸":"▶"}</button>
                    <button className="cbtn">🔊</button>
                  </div>
                  <span>{video.duration}</span>
                  <button className="cbtn">⛶</button>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* SHOPPABLE BAR — slides up from below video, then settles */}
        {shopProd&&(
          <div className="shop-ov-wrap">
            <div
              className={shopDocked?"shop-ov-docked":"shop-ov-featured"}
              onClick={()=>{setShowProd(true);muxRef.current?.pause();}}
            >
              {shopProd.primaryImage
                ? <img className={shopDocked?"shop-ov-img":"shop-ov-img-lg"} src={shopProd.primaryImage} alt={shopProd.name}/>
                : <div style={{width:shopDocked?44:52,height:shopDocked?44:52,borderRadius:shopDocked?4:6,background:"var(--surface3)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>📦</div>
              }
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"var(--fc)",fontSize:10,color:"var(--gold)",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:shopDocked?1:3}}>
                  🛍 {shopDocked?"Shoppable":"Featured Product"}
                </div>
                <div style={{fontFamily:"var(--fc)",fontSize:shopDocked?13:15,fontWeight:700,color:"var(--white)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:shopDocked?1:2}}>
                  {shopProd.name}
                </div>
                <div style={{fontFamily:"var(--fc)",fontSize:shopDocked?12:14,color:"var(--gold)",fontWeight:700}}>
                  {fp(shopProd.price)}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:shopDocked?"row":"column",gap:shopDocked?6:5,flexShrink:0,alignItems:"flex-end"}}>
                <button className="shop-ov-btn">Shop Now</button>
                <button
                  onClick={e=>{e.stopPropagation();setShopProd(null);clearTimeout(dockTimer.current);}}
                  style={{padding:shopDocked?"6px 8px":"3px 8px",borderRadius:3,background:shopDocked?"rgba(255,255,255,.08)":"none",border:shopDocked?"1px solid var(--border2)":"none",color:"var(--gray)",cursor:"pointer",fontSize:shopDocked?12:11,fontFamily:"var(--fc)",letterSpacing:".5px"}}
                >
                  {shopDocked?"✕":"dismiss"}
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{padding:"16px 16px 8px"}}>
          <div style={{fontFamily:"var(--fd)",fontSize:20,fontWeight:600,color:"var(--white)",marginBottom:6}}>{video.title}</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <span style={{fontFamily:"var(--fc)",fontSize:12,color:"var(--gray)"}}>{video.creator}</span>
            <span style={{fontFamily:"var(--fc)",fontSize:12,color:"var(--gray2)"}}>{video.views} views · {video.category}</span>
          </div>
        </div>
        <div className="gap"/>
      </div>
      {showProd&&shopProd&&<ProductDetail product={shopProd} onClose={()=>{setShowProd(false);setShopProd(null);}} onAddToCart={onAddToCart}/>}
    </div>
  );
}

// ============================================================
// PRODUCT DETAIL
// ============================================================
function ProductDetail({product, onClose, onAddToCart}) {
  const [selVar, setSelVar] = useState(product.variants?.find(v=>v.available)||product.variants?.[0]);
  const [adding, setAdding] = useState(false);
  const avail = selVar?.available ?? product.available;
  const invEl = !avail
    ? <span className="inv-out">Out of Stock</span>
    : <span className="inv-ok">In Stock</span>;

  return (
    <div className="modal" style={{zIndex:300}}>
      <div className="mhdr">
        <button className="mclose" onClick={onClose}>✕</button>
        <div className="mtitle">{product.name}</div>
        <span className="live-chip"><span className="live-chip-dot"/>Live</span>
      </div>
      <div className="mbody">
        <div className="pdtl">
          <div className="pdtl-img">
            {product.primaryImage?<img src={product.primaryImage} alt={product.name}/>:<span style={{fontSize:80,opacity:.3}}>📦</span>}
          </div>
          {product.vendor&&<div className="pdtl-vendor">{product.vendor}</div>}
          <div className="pdtl-name">{product.name}</div>
          <div className="pdtl-price">
            {fp(selVar?.price||product.price)}
            {product.compareAtPrice&&<span className="pdtl-compare">{fp(product.compareAtPrice)}</span>}
          </div>
          <div className="pdtl-inv">{invEl} · Ships from Easley, SC</div>
          {product.variants?.length>1&&(
            <div style={{marginBottom:16}}>
              <div className="var-label">Option</div>
              <div className="var-pills">
                {product.variants.map(v=>(
                  <button key={v.id} className={`vpill${selVar?.id===v.id?" on":""}${!v.available?" na":""}`}
                    onClick={()=>v.available&&setSelVar(v)}>{v.title}</button>
                ))}
              </div>
            </div>
          )}
          {product.description&&<div className="pdtl-desc">{product.description.slice(0,280)}{product.description.length>280?"…":""}</div>}
          <button className="atc-btn" disabled={adding||!avail}
            onClick={async()=>{setAdding(true);await onAddToCart(product,selVar);setAdding(false);onClose();}}>
            {adding?"Adding…":avail?"Add to Cart":"Out of Stock"}
          </button>
          <button className="shopify-btn" onClick={()=>window.open(`https://${SHOPIFY_DOMAIN}/products/${product.handle}`,'_blank')}>
            View on Collector Station →
          </button>
          <div style={{marginTop:16,padding:"10px 12px",background:"var(--surface2)",borderRadius:4,fontSize:12,color:"var(--gray)",lineHeight:1.6}}>
            <span className="live-chip" style={{marginBottom:6,display:"inline-flex"}}><span className="live-chip-dot"/>Live Shopify Inventory</span><br/>
            Collector Station · 210 E Main St, Easley, SC<br/>
            In-store pickup available · Free shipping over $75
          </div>
        </div>
        <div className="gap"/>
      </div>
    </div>
  );
}

// ============================================================
// CART
// ============================================================
function Cart({items, onClose, onRemove}) {
  const total = items.reduce((s,i)=>s+(i.price*i.qty),0);
  return (
    <div className="cart-drawer">
      <div className="chdr">
        <div className="ctitle">Your Cart</div>
        <button className="mclose" onClick={onClose}>✕</button>
      </div>
      <div className="citems">
        {items.length===0?(
          <div className="empty-cart">
            <div style={{fontSize:48,marginBottom:12,opacity:.4}}>🛒</div>
            <div style={{fontFamily:"var(--fc)",fontSize:16,fontWeight:600,color:"var(--gray)",marginBottom:6}}>Cart is Empty</div>
            <div style={{fontSize:12,color:"var(--gray2)"}}>Add products from the shop or shoppable videos</div>
          </div>
        ):items.map((item,i)=>(
          <div key={i} className="citem">
            {item.image?<div className="citem-img"><img src={item.image} alt={item.name}/></div>:<div className="citem-ph">📦</div>}
            <div style={{flex:1}}>
              <div className="citem-name">{item.name}</div>
              {item.varTitle!=="Default Title"&&<div className="citem-var">{item.varTitle}</div>}
              <div className="citem-price">{fp(item.price)} × {item.qty}</div>
            </div>
            <button className="crm" onClick={()=>onRemove(i)}>✕</button>
          </div>
        ))}
      </div>
      {items.length>0&&(
        <div className="cftr">
          <div className="ctotal">
            <div className="ctotal-lbl">Subtotal</div>
            <div className="ctotal-val">{fp(total)}</div>
          </div>
          <button className="co-btn" onClick={()=>window.open(`https://${SHOPIFY_DOMAIN}/cart`,'_blank')}>
            Checkout on Shopify →
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LIVE TAB
// ============================================================
function LiveTab({onImpression}) {
  const [active, setActive] = useState(0);
  const cam = MOCK_DATA.campaigns.find(c=>c.placement==="in-feed"&&c.status==="active");
  return (
    <div>
      <div style={{background:"var(--surface)",borderBottom:"1px solid var(--border)"}}>
        <div className="live-wrap">
          <MuxPlayer
            playbackId={MUX_LIVE_PLAYBACK_ID}
            streamType="live"
            autoPlay={false}
            muted={false}
            style={{width:"100%",display:"block","--controls":"auto"}}
            accentColor="#C0272D"
            onError={()=>{}}
          />
          <div className="live-ov" style={{pointerEvents:"none"}}>
            <div>
              <div style={{marginBottom:4}}><span className="live-badge"><span className="ldot"/>LIVE</span></div>
              <div className="live-ov-title">{MOCK_DATA.liveStream.title}</div>
            </div>
            <div className="live-vw"><span className="vwdot"/>{MOCK_DATA.liveStream.viewers.toLocaleString()} watching</div>
          </div>
        </div>
        <div className="sched">
          {MOCK_DATA.schedule.map((s,i)=>(
            <div key={i} className={`sched-item${active===i?" on":""}`} onClick={()=>setActive(i)}>
              <div className="sched-time">{s.live?<span className="live-badge" style={{padding:"1px 5px",fontSize:9}}><span className="ldot"/>LIVE</span>:s.time}</div>
              <div className="sched-title">{s.title}</div>
              <div className="sched-host">{s.host}</div>
            </div>
          ))}
        </div>
      </div>
      {cam&&(
        <div className="ad-infeed" onClick={()=>onImpression?.({type:"in-feed",campaignId:cam.id})}>
          <div style={{width:72,height:72,borderRadius:4,background:"var(--surface3)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🏷</div>
          <div style={{flex:1}}>
            <div className="ad-lbl">Sponsored · {cam.advertiser}</div>
            <div style={{fontFamily:"var(--fc)",fontSize:15,fontWeight:700,color:"var(--white)",marginBottom:3}}>List Your Cards on COMC</div>
            <div style={{fontSize:12,color:"var(--gray)",marginBottom:8}}>Reach millions of collectors. Free listings.</div>
            <button className="ad-cta">Learn More</button>
          </div>
        </div>
      )}
      <div className="gap"/>
    </div>
  );
}

// ============================================================
// VOD TAB
// ============================================================
function VODTab({onSelect, history, dbVideos=[]}) {
  const [cat, setCat] = useState("All");

  // Build category list from real DB videos
  const cats = ["All", ...Array.from(new Set(dbVideos.map(v=>v.category).filter(Boolean)))];
  const filtered = cat==="All" ? dbVideos : dbVideos.filter(v=>v.category===cat);

  const toVideo = (v) => ({
    id: v.id,
    title: v.title,
    creator: v.creator||"",
    category: v.category||"",
    duration: v.duration||"",
    thumbnail_url: v.thumbnail_url||null,
    views: "—",
    isNew: true,
    isTrending: false,
    muxPlaybackId: v.mux_playback_id,
    // Pass full tagged product list with handle + timestamp
    taggedProducts: (v.video_products||[]).map(vp=>({
      shopify_handle: vp.shopify_handle,
      timestamp_seconds: vp.timestamp_seconds,
      product_name: vp.product_name,
    })),
  });

  return (
    <div>
      {history.length>0&&<>
        <div className="shdr"><div className="stitle">Continue Watching</div></div>
        <div style={{display:"flex",gap:10,padding:"0 16px 16px",overflowX:"auto",scrollbarWidth:"none"}}>
          {history.slice(0,4).map((v,i)=>(
            <div key={i} style={{flexShrink:0,width:180,cursor:"pointer"}} onClick={()=>onSelect(v)}>
              <div style={{aspectRatio:"16/9",background:"var(--surface2)",borderRadius:4,overflow:"hidden",marginBottom:6,position:"relative"}}>
                {v.thumbnail_url
                  ?<img src={v.thumbnail_url} alt={v.title} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,opacity:.4}}>🎬</div>
                }
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"var(--border2)"}}>
                  <div style={{width:(20+i*18)+"%",height:"100%",background:"var(--red)"}}/>
                </div>
              </div>
              <div style={{fontFamily:"var(--fc)",fontSize:12,fontWeight:600,color:"var(--white)",lineHeight:1.3}}>{v.title}</div>
            </div>
          ))}
        </div>
        <div className="divider"/>
      </>}

      <div className="shdr">
        <div className="stitle">All Videos</div>
        <span style={{fontFamily:"var(--fc)",fontSize:12,color:"var(--gray)"}}>{dbVideos.length} video{dbVideos.length!==1?"s":""}</span>
      </div>

      {cats.length>1&&<div className="cpills">
        {cats.map(c=><button key={c} className={`cpill${cat===c?" on":""}`} onClick={()=>setCat(c)}>{c}</button>)}
      </div>}

      {dbVideos.length===0?(
        <div style={{padding:"48px 16px",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12,opacity:.3}}>🎬</div>
          <div style={{fontFamily:"var(--fd)",fontSize:18,fontWeight:600,color:"var(--white)",marginBottom:6}}>No videos yet</div>
          <div style={{fontFamily:"var(--fc)",fontSize:13,color:"var(--gray)"}}>Upload videos in the CMS tab to get started</div>
        </div>
      ):(
        <div className="vgrid">
          {filtered.map(v=>(
            <div key={v.id} className="vcard" onClick={()=>onSelect(toVideo(v))}>
              <div className="vthumb" style={{opacity:1}}>
                {v.thumbnail_url
                  ?<img src={v.thumbnail_url} alt={v.title} style={{width:"100%",height:"100%",objectFit:"cover",position:"absolute",inset:0}}/>
                  :<div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%",fontSize:28,opacity:.3}}>🎬</div>
                }
                {v.duration&&<div className="vdur">{v.duration}</div>}
                {v.video_products?.length>0&&<div className="vbadge" style={{background:"#0070f3",color:"#fff",bottom:6,left:6,top:"auto"}}>🛍 SHOP</div>}
              </div>
              <div className="vinfo">
                <div className="vtitle">{v.title}</div>
                <div className="vmeta">
                  <span style={{color:"var(--gray)",fontWeight:500}}>{v.creator||"Collector Station"}</span>
                  <span>{v.category||""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="gap"/>
    </div>
  );
}

// ============================================================
// SHOP TAB
// ============================================================
function ShopTab({products, loading, error, onSelect, onImpression}) {
  const [cat, setCat] = useState("All");
  const cats = ["All",...Array.from(new Set(products.map(p=>p.category).filter(Boolean)))];
  const filtered = cat==="All"?products:products.filter(p=>p.category===cat);
  const bannerCam = MOCK_DATA.campaigns.find(c=>c.placement==="banner"&&c.status==="active");
  return (
    <div>
      {bannerCam&&(
        <div style={{margin:"12px 16px",background:"linear-gradient(90deg,#1a1208,#2a1e0c)",border:"1px solid #6b5520",borderRadius:6,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:"var(--fc)",fontSize:10,color:"var(--gold)",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:2}}>Sponsored · {bannerCam.advertiser}</div>
            <div style={{fontFamily:"var(--fc)",fontSize:15,fontWeight:700,color:"var(--white)"}}>Get Cards Graded by Beckett</div>
          </div>
          <button onClick={()=>onImpression?.({type:"banner",campaignId:bannerCam.id})} style={{padding:"6px 12px",background:"var(--gold)",color:"#000",border:"none",borderRadius:3,fontFamily:"var(--fc)",fontSize:11,fontWeight:700,cursor:"pointer"}}>Shop</button>
        </div>
      )}
      <div className="shdr">
        <div className="stitle">The Shop</div>
        <span className="live-chip"><span className="live-chip-dot"/>Live Inventory</span>
      </div>
      <div className="cpills">
        {cats.map(c=><button key={c} className={`cpill${cat===c?" on":""}`} onClick={()=>setCat(c)}>{c}</button>)}
      </div>
      {error&&(
        <div className="err-banner">
          ⚠️ Could not load products from Shopify.<br/>
          <span style={{fontSize:11,color:"var(--gray)"}}>{error}</span><br/>
          <span style={{fontSize:11,color:"var(--gray)"}}>Make sure your store is live and products are published.</span>
        </div>
      )}
      {loading?(
        <div className="skel-grid">
          {[1,2,3,4].map(i=><div key={i} className="skel"><div className="skel-img"/><div className="skel-line" style={{margin:"10px 8px 4px"}}/><div className="skel-line s" style={{margin:"0 8px 10px"}}/></div>)}
        </div>
      ):(
        <div className="pgrid">
          {filtered.length===0?(
            <div style={{gridColumn:"1/-1",padding:"40px 0",textAlign:"center",color:"var(--gray)",fontFamily:"var(--fc)"}}>No products in this category</div>
          ):filtered.map(p=>(
            <div key={p.id} className={`pcard${!p.available?" sold":""}`} onClick={()=>onSelect(p)}>
              <div className="pimg">
                {p.primaryImage?<img src={p.primaryImage} alt={p.name}/>:<span className="pimg-ph">📦</span>}
                {p.badge&&<span className={`pbadge ${p.badge==="HOT"?"hot":p.badge==="NEW"?"new":p.badge==="LOW STOCK"?"low":p.badge==="SALE"?"sale":""}`}>{p.badge}</span>}
                {!p.available&&<div className="sold-ov">SOLD OUT</div>}
              </div>
              <div className="pinfo">
                <div className="pname">{p.name}</div>
                <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                  <div className="pprice">{fp(p.price)}</div>
                  {p.compareAtPrice&&<span className="pcompare">{fp(p.compareAtPrice)}</span>}
                </div>
                <div className="pinv">{p.available?"In Stock":"Out of Stock"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="gap"/>
    </div>
  );
}

// ============================================================
// SEARCH TAB
// ============================================================
function SearchTab({onVideoSelect, onProductSelect, products}) {
  const [q, setQ] = useState("");
  const trending = ["Topps Chrome","Pokémon God Pack","PSA Grading","Prizm Football","Sealed Wax"];
  const vr = q.length>1?MOCK_DATA.videos.filter(v=>v.title.toLowerCase().includes(q.toLowerCase())||v.creator.toLowerCase().includes(q.toLowerCase())):[];
  const pr = q.length>1?products.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.category?.toLowerCase().includes(q.toLowerCase())):[];
  return (
    <div>
      <div className="sbar">
        <span style={{color:"var(--gray)",fontSize:14}}>⌕</span>
        <input className="sinput" placeholder="Search videos, products, creators…" value={q} onChange={e=>setQ(e.target.value)} autoFocus/>
        {q&&<button onClick={()=>setQ("")} style={{background:"none",border:"none",color:"var(--gray)",cursor:"pointer",fontSize:14}}>✕</button>}
      </div>
      {!q&&(
        <div style={{padding:"0 16px"}}>
          <div style={{fontFamily:"var(--fc)",fontSize:13,fontWeight:600,color:"var(--gray)",letterSpacing:".5px",textTransform:"uppercase",padding:"12px 0 8px"}}>Trending</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {trending.map(t=><button key={t} onClick={()=>setQ(t)} style={{padding:"6px 14px",background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:20,color:"var(--white)",fontFamily:"var(--fc)",fontSize:12,fontWeight:600,cursor:"pointer"}}>🔥 {t}</button>)}
          </div>
        </div>
      )}
      {q&&(
        <div style={{padding:"0 16px"}}>
          {vr.length>0&&<>
            <div style={{fontFamily:"var(--fc)",fontSize:13,fontWeight:600,color:"var(--gray)",letterSpacing:".5px",textTransform:"uppercase",padding:"12px 0 8px"}}>Videos ({vr.length})</div>
            {vr.map(v=><div key={v.id} className="hitem" onClick={()=>onVideoSelect(v)}><div className="hthumb">🎬</div><div><div className="htitle">{v.title}</div><div className="hmeta">{v.creator} · {v.views}</div></div></div>)}
          </>}
          {pr.length>0&&<>
            <div style={{fontFamily:"var(--fc)",fontSize:13,fontWeight:600,color:"var(--gray)",letterSpacing:".5px",textTransform:"uppercase",padding:"12px 0 8px"}}>Products ({pr.length})</div>
            {pr.map(p=><div key={p.id} className="hitem" onClick={()=>onProductSelect(p)}>
              <div style={{width:80,height:45,flexShrink:0,borderRadius:3,overflow:"hidden",background:"var(--surface3)"}}>
                {p.primaryImage?<img src={p.primaryImage} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",fontSize:20}}>📦</span>}
              </div>
              <div><div className="htitle">{p.name}</div><div className="hmeta">{fp(p.price)} · {p.available ? "In Stock" : "Out of Stock"}</div></div>
            </div>)}
          </>}
          {vr.length===0&&pr.length===0&&<div style={{padding:"40px 0",textAlign:"center",color:"var(--gray)"}}>
            <div style={{fontSize:40,marginBottom:12}}>⌕</div>
            <div style={{fontFamily:"var(--fc)",fontSize:16,fontWeight:600}}>No results for "{q}"</div>
          </div>}
        </div>
      )}
      <div className="gap"/>
    </div>
  );
}

// ============================================================
// PROFILE TAB
// ============================================================
function ProfileTab({history, onSelect}) {
  return (
    <div>
      <div style={{padding:"24px 16px 16px",display:"flex",alignItems:"center",gap:16,borderBottom:"1px solid var(--border)"}}>
        <div className="avatar">R</div>
        <div>
          <div style={{fontFamily:"var(--fd)",fontSize:20,fontWeight:600,color:"var(--white)"}}>Ryan Alford</div>
          <div style={{fontSize:12,color:"var(--gray)",marginTop:2}}>Member since Jan 2024 · Pro</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",padding:16,gap:1,background:"var(--border)",margin:16,borderRadius:6,overflow:"hidden"}}>
        {[{v:history.length,l:"Watched"},{v:"3",l:"Saved"},{v:"$0",l:"Spent"}].map((s,i)=>(
          <div key={i} style={{background:"var(--surface2)",padding:12,textAlign:"center"}}>
            <div style={{fontFamily:"var(--fd)",fontSize:22,fontWeight:700,color:"var(--white)"}}>{s.v}</div>
            <div style={{fontFamily:"var(--fc)",fontSize:10,color:"var(--gray)",letterSpacing:".5px",textTransform:"uppercase",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div className="shdr"><div className="stitle">Watch History</div></div>
      {history.length===0
        ?<div style={{padding:"24px 16px",textAlign:"center",color:"var(--gray)",fontFamily:"var(--fc)"}}>No watch history yet</div>
        :history.map((v,i)=>(
          <div key={i} className="hitem" onClick={()=>onSelect(v)}>
            <div className="hthumb">🎬</div>
            <div><div className="htitle">{v.title}</div><div className="hmeta">{v.creator} · {v.category}</div></div>
          </div>
        ))
      }
      <div className="gap"/>
    </div>
  );
}

// ============================================================
// ADMIN TAB
// ============================================================
function AdminTab({products, impressions}) {
  const [tab, setTab] = useState("dashboard");
  const tabs = [{id:"dashboard",l:"Dashboard"},{id:"campaigns",l:"Campaigns"},{id:"impressions",l:"Impressions"},{id:"content",l:"Content"},{id:"products",l:"Products"},{id:"new",l:"+ Campaign"}];
  const totalImps = MOCK_DATA.campaigns.reduce((s,c)=>s+c.impressionsDelivered,0)+impressions.length;
  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 56px)"}}>
      <div className="admin-tabs">
        {tabs.map(t=><button key={t.id} className={`atab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>)}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:16}}>
        {tab==="dashboard"&&<>
          <div className="stat-grid">
            {[
              {l:"Total Impressions",v:fmt(totalImps),s:"↑ 14% this week"},
              {l:"Active Campaigns",v:MOCK_DATA.campaigns.filter(c=>c.status==="active").length,s:`${[...new Set(MOCK_DATA.campaigns.map(c=>c.advertiser))].length} advertisers`},
              {l:"Shopify Products",v:products.length,s:"Live inventory"},
              {l:"eCPM (avg)",v:"$11.40",s:"↑ $0.80 vs last mo."},
            ].map((s,i)=><div key={i} className="stat-card"><div className="slbl">{s.l}</div><div className="sval">{s.v}</div><div className="ssub">{s.s}</div></div>)}
          </div>
        </>}
        {tab==="campaigns"&&MOCK_DATA.campaigns.map(c=>{
          const dp=pct(c.impressionsDelivered,c.impressionGoal);
          return(
            <div key={c.id} style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:6,padding:12,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontFamily:"var(--fc)",fontSize:14,fontWeight:700,color:"var(--white)",marginBottom:2}}>{c.name}</div>
                  <div style={{fontSize:11,color:"var(--gray2)"}}>{c.advertiser} · {c.placement}</div>
                </div>
                <span className={`spill ${c.status}`}>{c.status}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                {[{l:"Budget",v:`$${c.budget.toLocaleString()}`},{l:"CPM",v:`$${c.cpm.toFixed(2)}`},{l:"Goal",v:fmt(c.impressionGoal)}].map((s,i)=>(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontFamily:"var(--fc)",fontSize:11,color:"var(--gray)",letterSpacing:".5px",textTransform:"uppercase",marginBottom:2}}>{s.l}</div>
                    <div style={{fontFamily:"var(--fc)",fontSize:14,fontWeight:700,color:"var(--white)"}}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--fc)",fontSize:11,color:"var(--gray)",marginBottom:4}}>
                <span>Delivery</span><span>{fmt(c.impressionsDelivered)} / {fmt(c.impressionGoal)} ({dp}%)</span>
              </div>
              <div className="dbar"><div className="dfill" style={{width:dp+"%",background:dp>=100?"var(--gray2)":dp>=80?"var(--gold)":"var(--live)"}}/></div>
            </div>
          );
        })}
        {tab==="impressions"&&<>
          <div style={{fontFamily:"var(--fc)",fontSize:14,fontWeight:700,color:"var(--white)",marginBottom:14}}>Live Impression Log</div>
          <table className="dtable">
            <thead><tr><th>Type</th><th>Campaign</th><th>Time</th></tr></thead>
            <tbody>
              {[...impressions].reverse().map((imp,i)=>{
                const cam=MOCK_DATA.campaigns.find(c=>c.id===imp.campaignId);
                return<tr key={i}><td><span className="tag">{imp.type}</span></td><td>{cam?.name||"Ad"}</td><td style={{color:"var(--gray2)"}}>{new Date(imp.timestamp).toLocaleTimeString()}</td></tr>;
              })}
              {impressions.length===0&&<tr><td colSpan={3} style={{textAlign:"center",color:"var(--gray2)",padding:20}}>Interact with ads to log impressions</td></tr>}
            </tbody>
          </table>
        </>}
        {tab==="content"&&<VideoCMS/>}
        {tab==="products"&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontFamily:"var(--fc)",fontSize:14,fontWeight:700,color:"var(--white)"}}>Shopify Inventory ({products.length})</div>
            <span className="live-chip"><span className="live-chip-dot"/>Live Sync</span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table className="dtable">
              <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Type</th></tr></thead>
              <tbody>
                {products.map(p=>(
                  <tr key={p.id}>
                    <td style={{maxWidth:160}}><div style={{display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{p.name}</div></td>
                    <td style={{color:"var(--gold)",whiteSpace:"nowrap"}}>{fp(p.price)}</td>
                    <td style={{color:p.available?"var(--live)":"var(--red)"}}>{p.available?"In Stock":"Sold Out"}</td>
                    <td><span className="tag">{p.category||"—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:12,textAlign:"center",fontFamily:"var(--fc)",fontSize:11,color:"var(--gray)"}}>
            Synced from collector-station.myshopify.com · products.json
          </div>
        </>}
        {tab==="new"&&<>
          <div style={{fontFamily:"var(--fc)",fontSize:14,fontWeight:700,color:"var(--white)",marginBottom:16}}>New Insertion Order</div>
          {[{l:"Advertiser Name",t:"text",ph:"e.g. PSA Grading"},{l:"Campaign Name",t:"text",ph:"e.g. Summer Push"},{l:"Budget ($)",t:"number",ph:"5000"},{l:"CPM Rate ($)",t:"number",ph:"12.00"},{l:"Start Date",t:"date"},{l:"End Date",t:"date"}].map((f,i)=>(
            <div key={i} style={{marginBottom:14}}><label className="flbl">{f.l}</label><input className="finput" type={f.t} placeholder={f.ph}/></div>
          ))}
          <div style={{marginBottom:14}}>
            <label className="flbl">Placement</label>
            <select className="fsel"><option>Pre-Roll</option><option>Mid-Roll</option><option>In-Feed</option><option>Banner</option></select>
          </div>
          <button className="fsub">Create Insertion Order</button>
        </>}
        <div className="gap"/>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [tab, setTab] = useState("live");
  const [selVideo, setSelVideo] = useState(null);
  const [selProduct, setSelProduct] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [history, setHistory] = useState([]);
  const [impressions, setImpressions] = useState([]);
  const [toast, setToast] = useState(null);
  const [cart, setCart] = useState([]);

  // Shopify products state
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // DB videos from Supabase
  const [dbVideos, setDbVideos] = useState([]);

  useEffect(()=>{
    fetchShopifyProducts()
      .then(raw=>{ setProducts(raw.map(normalizeProduct)); setLoading(false); })
      .catch(err=>{ setError(err.message); setLoading(false); });
    fetchVideosFromDB()
      .then(setDbVideos)
      .catch(err=>console.error("DB videos error:", err));
  },[]);

  const showToast = useCallback((msg)=>{ setToast(msg); setTimeout(()=>setToast(null),3000); },[]);

  const handleVideoSelect = useCallback((v)=>{
    setSelVideo(v);
    setHistory(prev=>[v,...prev.filter(x=>x.id!==v.id)].slice(0,20));
  },[]);

  const handleAddToCart = useCallback((product, variant)=>{
    setCart(prev=>{
      const key = variant?.id||product.id;
      const exists = prev.find(i=>i.key===key);
      if(exists) return prev.map(i=>i.key===key?{...i,qty:i.qty+1}:i);
      return [...prev,{
        key, id:product.id, name:product.name,
        price:parseFloat(variant?.price||product.price),
        varTitle:variant?.title||"Default Title",
        image:product.primaryImage, qty:1,
      }];
    });
    showToast(`Added: ${product.name}`);
  },[showToast]);

  const handleRemoveFromCart = useCallback((idx)=>{
    setCart(prev=>prev.filter((_,i)=>i!==idx));
  },[]);

  const handleImpression = useCallback((data)=>{
    setImpressions(prev=>[...prev,{...data,timestamp:new Date().toISOString()}]);
  },[]);

  const cartCount = cart.reduce((s,i)=>s+i.qty,0);
  const navTabs = [{id:"live",l:"Live"},{id:"vod",l:"Watch"},{id:"shop",l:"Shop"},{id:"search",l:"Discover"},{id:"profile",l:"Profile"},{id:"admin",l:"CMS"}];
  const bnav = [{id:"live",l:"Live",i:"📺"},{id:"vod",l:"Watch",i:"🎬"},{id:"shop",l:"Shop",i:"🛍"},{id:"search",l:"Search",i:"⌕"},{id:"admin",l:"Admin",i:"⚙"}];

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-logo">
            <img src="/cn-logo.png" alt="Collector Nation" style={{height:38,width:"auto",objectFit:"contain",display:"block"}}/>
          </div>
          <div className="nav-tabs">
            {navTabs.map(t=><button key={t.id} className={`ntab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>)}
          </div>
          <button className="cart-btn" onClick={()=>setShowCart(true)}>
            🛒{cartCount>0&&<span className="cbadge">{cartCount}</span>}
          </button>
        </nav>

        <div style={{flex:1,overflowY:"auto",paddingBottom:56}}>
          {tab==="live"&&<LiveTab onImpression={handleImpression}/>}
          {tab==="vod"&&<VODTab onSelect={handleVideoSelect} history={history} dbVideos={dbVideos}/>}
          {tab==="shop"&&<ShopTab products={products} loading={loading} error={error} onSelect={setSelProduct} onImpression={handleImpression}/>}
          {tab==="search"&&<SearchTab onVideoSelect={handleVideoSelect} onProductSelect={setSelProduct} products={products}/>}
          {tab==="profile"&&<ProfileTab history={history} onSelect={handleVideoSelect}/>}
          {tab==="admin"&&<AdminTab products={products} impressions={impressions}/>}
        </div>

        <div className="bnav">
          {bnav.map(item=>(
            <button key={item.id} className={`bnav-item${tab===item.id?" on":""}`} onClick={()=>setTab(item.id)}>
              <span className="bicon">{item.i}</span>{item.l}
            </button>
          ))}
        </div>

        {selVideo&&<VideoPlayer video={selVideo} products={products} onClose={()=>setSelVideo(null)} onAddToCart={handleAddToCart} onImpression={handleImpression}/>}
        {selProduct&&!selVideo&&<ProductDetail product={selProduct} onClose={()=>setSelProduct(null)} onAddToCart={handleAddToCart}/>}
        {showCart&&<Cart items={cart} onClose={()=>setShowCart(false)} onRemove={handleRemoveFromCart}/>}
        <Toast msg={toast}/>
      </div>
    </>
  );
}
