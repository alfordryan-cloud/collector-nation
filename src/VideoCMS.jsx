import { useState, useEffect, useCallback, useRef } from "react";
import { parseTimestamp, fmtTimestamp } from "./utils.js";
import { createClient } from "@supabase/supabase-js";
import * as UpChunk from "@mux/upchunk";

// ============================================================
// CLIENTS — reads from env vars, never hardcoded
// ============================================================
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const SHOPIFY_DOMAIN = "collector-station.myshopify.com";

// ============================================================
// MUX API HELPERS — via Vercel serverless proxy (keeps secret server-side)
// ============================================================
async function createMuxUploadUrl() {
  const res = await fetch("/api/create-upload", { method: "POST" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `Upload API error ${res.status}`);
  }
  return await res.json(); // { uploadId, uploadUrl }
}

async function getMuxAsset(uploadId) {
  const res = await fetch(`/api/mux-asset?type=upload&id=${uploadId}`);
  if (!res.ok) throw new Error(`Mux API error ${res.status}`);
  return await res.json();
}

async function getMuxAssetById(assetId) {
  const res = await fetch(`/api/mux-asset?type=asset&id=${assetId}`);
  if (!res.ok) throw new Error(`Mux API error ${res.status}`);
  return await res.json();
}

async function deleteMuxAsset(assetId) {
  await fetch(`/api/mux-delete?assetId=${assetId}`, { method: "DELETE" });
}

// ============================================================
// SUPABASE HELPERS
// ============================================================
async function fetchVideos() {
  const { data, error } = await supabase
    .from("videos")
    .select(`*, video_products(*)`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function insertVideo(video) {
  const { data, error } = await supabase
    .from("videos")
    .insert(video)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateVideo(id, updates) {
  const { error } = await supabase
    .from("videos")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

async function deleteVideo(id) {
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) throw error;
}

async function saveVideoProducts(videoId, products) {
  // Always delete existing tags first — await fully before inserting
  const { error: delError } = await supabase
    .from("video_products")
    .delete()
    .eq("video_id", videoId);
  if (delError) throw delError;

  // If no products left, we're done — tags cleared
  if (!products.length) return;

  // Insert fresh set
  const { error } = await supabase.from("video_products").insert(
    products.map(p => ({
      video_id: videoId,
      shopify_product_id: p.shopify_product_id,
      shopify_handle: p.shopify_handle,
      product_name: p.product_name,
      timestamp_seconds: (() => { const n = parseInt(p.timestamp_seconds); return isNaN(n) ? 0 : n; })(),
      duration_seconds: parseInt(p.duration_seconds) || 8,
    }))
  );
  if (error) throw error;
}

// ============================================================
// THUMBNAIL UPLOAD — uploads to Supabase Storage
// ============================================================
async function uploadThumbnail(videoId, file) {
  const ext = file.name.split(".").pop();
  const path = `thumbnails/${videoId}.${ext}`;
  const { error } = await supabase.storage
    .from("video-assets")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("video-assets").getPublicUrl(path);
  return data.publicUrl;
}

// ============================================================
// SHOPIFY PRODUCT FETCH (for tagging)
// ============================================================
async function fetchShopifyProducts() {
  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/products.json?limit=250`,
    { headers: { Accept: "application/json" } }
  );
  const data = await res.json();
  return data.products.map(p => ({
    id: String(p.id),
    handle: p.handle,
    title: p.title,
    image: p.images?.[0]?.src || null,
    price: parseFloat(p.variants?.[0]?.price || 0),
  }));
}

// ============================================================
// FORMAT HELPERS
// ============================================================
const fmtDuration = fmtTimestamp; // alias

// ============================================================
// STYLES
// ============================================================
const cmsStyles = `
  .cms-wrap { background: var(--black); min-height: 100%; }
  .cms-inner { padding: 0 16px 100px; }

  /* UPLOAD ZONE */
  .upload-zone {
    border: 2px dashed var(--border2); border-radius: 8px;
    padding: 32px 16px; text-align: center; cursor: pointer;
    transition: all .2s; background: var(--surface2);
    margin-bottom: 20px;
  }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--red); background: rgba(192,39,45,.05); }
  .upload-zone-icon { font-size: 40px; margin-bottom: 12px; }
  .upload-zone-title { font-family: var(--fd); font-size: 18px; font-weight: 600; color: var(--white); margin-bottom:4px; }
  .upload-zone-sub { font-family: var(--fc); font-size: 12px; color: var(--gray); letter-spacing: .5px; }

  /* UPLOAD PROGRESS */
  .upload-progress { background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .up-filename { font-family: var(--fc); font-size: 14px; font-weight: 600; color: var(--white); margin-bottom: 8px; display: flex; justify-content: space-between; }
  .up-bar { height: 6px; border-radius: 3px; background: var(--border2); overflow: hidden; margin-bottom: 8px; }
  .up-fill { height: 100%; border-radius: 3px; background: var(--red); transition: width .3s; }
  .up-status { font-family: var(--fc); font-size: 11px; color: var(--gray); letter-spacing: .5px; text-transform: uppercase; }
  .up-status.done { color: var(--live); }
  .up-status.err { color: var(--red); }

  /* VIDEO LIST */
  .video-list-item {
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px; margin-bottom: 10px;
    transition: border-color .15s;
  }
  .video-list-item:hover { border-color: var(--border2); }
  .vli-top { display: flex; gap: 12px; align-items: flex-start; }
  .vli-thumb {
    width: 100px; height: 56px; border-radius: 4px; flex-shrink: 0;
    background: var(--surface3); overflow: hidden; position: relative;
  }
  .vli-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .vli-thumb-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px; opacity: .4; }
  .vli-info { flex: 1; min-width: 0; }
  .vli-title { font-family: var(--fc); font-size: 14px; font-weight: 700; color: var(--white); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vli-meta { font-size: 11px; color: var(--gray2); margin-bottom: 6px; }
  .vli-actions { display: flex; gap: 6px; margin-top: 4px; }
  .vli-btn { padding: 4px 10px; border-radius: 3px; border: 1px solid var(--border2); background: none; color: var(--gray); font-family: var(--fc); font-size: 11px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; cursor: pointer; transition: all .15s; }
  .vli-btn:hover { color: var(--white); border-color: var(--gray); }
  .vli-btn.danger:hover { color: var(--red); border-color: var(--red); }
  .vli-btn.primary { background: var(--red); border-color: var(--red); color: var(--white); }

  /* STATUS BADGES */
  .vstatus { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 10px; font-family: var(--fc); font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
  .vstatus.ready { background: rgba(0,200,83,.15); color: var(--live); }
  .vstatus.processing { background: rgba(201,168,76,.15); color: var(--gold); }
  .vstatus.error { background: rgba(192,39,45,.15); color: var(--red); }
  .vstatus-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: lp 1.5s infinite; }

  /* EDIT PANEL */
  .edit-panel {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: 8px; padding: 16px; margin-top: 10px;
  }
  .ep-title { font-family: var(--fd); font-size: 16px; font-weight: 600; color: var(--white); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .ep-title::before { content: ''; width: 3px; height: 16px; background: var(--red); border-radius: 1px; }
  .ep-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .fg { margin-bottom: 12px; }
  .fl { display: block; font-family: var(--fc); font-size: 11px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; color: var(--gray); margin-bottom: 5px; }
  .fi { width: 100%; padding: 9px 12px; background: var(--surface3); border: 1px solid var(--border2); border-radius: 4px; color: var(--white); font-family: var(--fb); font-size: 13px; outline: none; transition: border-color .15s; }
  .fi:focus { border-color: var(--red); }
  .fsel { width: 100%; padding: 9px 12px; background: var(--surface3); border: 1px solid var(--border2); border-radius: 4px; color: var(--white); font-family: var(--fb); font-size: 13px; outline: none; }
  .fta { width: 100%; padding: 9px 12px; background: var(--surface3); border: 1px solid var(--border2); border-radius: 4px; color: var(--white); font-family: var(--fb); font-size: 13px; outline: none; resize: vertical; min-height: 70px; }
  .save-btn { width: 100%; padding: 12px; border-radius: 4px; background: var(--red); color: var(--white); border: none; cursor: pointer; font-family: var(--fc); font-size: 14px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; transition: background .15s; margin-top: 4px; }
  .save-btn:hover { background: #d42d34; }
  .save-btn:disabled { background: var(--gray2); cursor: not-allowed; }

  /* PRODUCT TAGGER */
  .tagger { border: 1px solid var(--border2); border-radius: 6px; overflow: hidden; margin-top: 12px; }
  .tagger-hdr { background: var(--surface3); padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; }
  .tagger-title { font-family: var(--fc); font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--white); }
  .tagger-add { padding: 4px 10px; border-radius: 3px; background: var(--red); color: var(--white); border: none; cursor: pointer; font-family: var(--fc); font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
  .tag-row { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-top: 1px solid var(--border); }
  .tag-row-img { width: 36px; height: 36px; border-radius: 3px; flex-shrink: 0; object-fit: cover; background: var(--surface3); }
  .tag-row-img-ph { width: 36px; height: 36px; border-radius: 3px; flex-shrink: 0; background: var(--surface3); display: flex; align-items: center; justify-content: center; font-size: 16px; }
  .tag-row-info { flex: 1; min-width: 0; }
  .tag-row-name { font-family: var(--fc); font-size: 12px; font-weight: 600; color: var(--white); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag-row-ts { font-size: 11px; color: var(--gold); margin-top: 2px; }
  .tag-rm { background: none; border: none; cursor: pointer; color: var(--gray); font-size: 14px; flex-shrink: 0; }
  .tag-rm:hover { color: var(--red); }
  .empty-tags { padding: 20px; text-align: center; font-family: var(--fc); font-size: 12px; color: var(--gray2); }

  /* PRODUCT PICKER MODAL */
  .picker-modal { position: fixed; inset: 0; z-index: 400; background: rgba(0,0,0,.9); display: flex; flex-direction: column; animation: fi .2s ease; }
  .picker-hdr { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .picker-title { font-family: var(--fc); font-size: 15px; font-weight: 700; color: var(--white); flex: 1; }
  .picker-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
  .picker-search { display: flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--border2); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
  .picker-input { background: none; border: none; outline: none; color: var(--white); font-family: var(--fb); font-size: 14px; flex: 1; }
  .picker-input::placeholder { color: var(--gray2); }
  .picker-item { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 6px; cursor: pointer; transition: background .15s; margin-bottom: 4px; }
  .picker-item:hover { background: var(--surface2); }
  .picker-item-img { width: 48px; height: 48px; border-radius: 4px; object-fit: cover; flex-shrink: 0; background: var(--surface3); }
  .picker-item-img-ph { width: 48px; height: 48px; border-radius: 4px; flex-shrink: 0; background: var(--surface3); display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .picker-item-name { font-family: var(--fc); font-size: 13px; font-weight: 600; color: var(--white); margin-bottom: 2px; }
  .picker-item-price { font-family: var(--fc); font-size: 12px; color: var(--gold); }
  .ts-input-wrap { margin-top: 8px; }
  .ts-label { font-family: var(--fc); font-size: 11px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; color: var(--gray); margin-bottom: 5px; display: block; }
  .ts-row { display: flex; gap: 8px; align-items: center; }
  .ts-input { flex: 1; padding: 8px 12px; background: var(--surface3); border: 1px solid var(--border2); border-radius: 4px; color: var(--white); font-family: var(--fb); font-size: 13px; outline: none; }
  .ts-confirm { padding: 8px 14px; border-radius: 4px; background: var(--red); color: var(--white); border: none; cursor: pointer; font-family: var(--fc); font-size: 12px; font-weight: 700; letter-spacing: .5px; white-space: nowrap; }

  /* MUXID BADGE */
  .mux-badge { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,102,0,.1); border: 1px solid rgba(255,102,0,.3); color: #ff6600; font-family: var(--fc); font-size: 9px; font-weight: 700; letter-spacing: .5px; padding: 2px 6px; border-radius: 3px; }

  /* EMPTY STATE */
  .empty-videos { padding: 48px 16px; text-align: center; }
  .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: .3; }
  .empty-title { font-family: var(--fd); font-size: 18px; font-weight: 600; color: var(--white); margin-bottom: 6px; }
  .empty-sub { font-family: var(--fc); font-size: 13px; color: var(--gray); }

  /* CONFIRM DELETE */
  .confirm-overlay { position: fixed; inset: 0; z-index: 500; background: rgba(0,0,0,.85); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .confirm-box { background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; padding: 24px; max-width: 320px; width: 100%; }
  .confirm-title { font-family: var(--fd); font-size: 18px; font-weight: 600; color: var(--white); margin-bottom: 8px; }
  .confirm-sub { font-size: 13px; color: var(--gray); margin-bottom: 20px; line-height: 1.5; }
  .confirm-btns { display: flex; gap: 8px; }
  .confirm-cancel { flex: 1; padding: 12px; border-radius: 4px; border: 1px solid var(--border2); background: none; color: var(--gray); font-family: var(--fc); font-size: 13px; font-weight: 600; cursor: pointer; }
  .confirm-delete { flex: 1; padding: 12px; border-radius: 4px; border: none; background: var(--red); color: var(--white); font-family: var(--fc); font-size: 13px; font-weight: 700; cursor: pointer; }

  /* SECTION HDR */
  .cms-shdr { display: flex; align-items: center; justify-content: space-between; padding: 20px 0 12px; }
  .cms-stitle { font-family: var(--fd); font-size: 18px; font-weight: 600; color: var(--white); display: flex; align-items: center; gap: 8px; }
  .cms-stitle::before { content: ''; width: 3px; height: 18px; background: var(--red); border-radius: 1px; display: inline-block; }
  .cms-count { font-family: var(--fc); font-size: 12px; color: var(--gray); }

  /* TOAST */
  .cms-toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 999; background: var(--surface2); border: 1px solid var(--border2); border-left: 3px solid var(--live); padding: 10px 16px; border-radius: 4px; font-family: var(--fc); font-size: 13px; font-weight: 600; color: var(--white); white-space: nowrap; animation: ti .25s ease; pointer-events: none; }
`;

// ============================================================
// PRODUCT PICKER MODAL
// ============================================================
function ProductPicker({ products, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [timestamp, setTimestamp] = useState("");
  const [duration, setDuration] = useState("8");

  const filtered = query.length > 1
    ? products.filter(p => p.title.toLowerCase().includes(query.toLowerCase()))
    : products;

  return (
    <div className="picker-modal">
      <div className="picker-hdr">
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray)", fontSize: 20, display: "flex" }}>✕</button>
        <div className="picker-title">{selected ? "Set Timestamp" : "Tag a Product"}</div>
      </div>
      <div className="picker-body">
        {!selected ? (
          <>
            <div className="picker-search">
              <span style={{ color: "var(--gray)", fontSize: 14 }}>⌕</span>
              <input className="picker-input" placeholder="Search products…" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            </div>
            {filtered.map(p => (
              <div key={p.id} className="picker-item" onClick={() => setSelected(p)}>
                {p.image
                  ? <img className="picker-item-img" src={p.image} alt={p.title} />
                  : <div className="picker-item-img-ph">📦</div>
                }
                <div>
                  <div className="picker-item-name">{p.title}</div>
                  <div className="picker-item-price">${p.price.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div>
            <div className="picker-item" style={{ background: "var(--surface2)", borderRadius: 6, marginBottom: 16 }}>
              {selected.image
                ? <img className="picker-item-img" src={selected.image} alt={selected.title} />
                : <div className="picker-item-img-ph">📦</div>
              }
              <div>
                <div className="picker-item-name">{selected.title}</div>
                <div className="picker-item-price">${selected.price.toFixed(2)}</div>
              </div>
            </div>
            <div className="ts-input-wrap">
              <label className="ts-label">Timestamp — when should this appear? (mm:ss)</label>
              <input
                className="ts-input"
                placeholder="e.g. 1:30 or 90"
                value={timestamp}
                onChange={e => setTimestamp(e.target.value)}
                autoFocus
                style={{width:"100%",marginBottom:10}}
              />
              <label className="ts-label" style={{marginTop:8}}>Duration — how long to show it? (seconds, default 8)</label>
              <input
                className="ts-input"
                placeholder="e.g. 8"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                style={{width:"100%",marginBottom:10}}
              />
              <button className="ts-confirm" style={{width:"100%"}} onClick={() => {
                const secs = parseTimestamp(timestamp);
                onPick({
                  shopify_product_id: selected.id,
                  shopify_handle: selected.handle,
                  product_name: selected.title,
                  timestamp_seconds: secs,
                  duration_seconds: parseInt(duration) || 8,
                  _image: selected.image,
                });
              }}>
                Tag Product
              </button>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--gray)" }}>
                Timestamp: mm:ss (e.g. 1:30) or seconds (e.g. 90)<br/>
                Duration: how many seconds the card stays visible
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ marginTop: 12, background: "none", border: "none", color: "var(--gray)", cursor: "pointer", fontFamily: "var(--fc)", fontSize: 12, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase" }}>
              ← Back to Products
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// VIDEO EDIT PANEL
// ============================================================
function VideoEditPanel({ video, shopifyProducts, onSave, onClose }) {
  const [form, setForm] = useState({
    title: video.title || "",
    creator: video.creator || "",
    category: video.category || "",
    description: video.description || "",
  });
  const [taggedProducts, setTaggedProducts] = useState([]);

  // Sync tagged products — use stringify for deep comparison
  const vpKey = JSON.stringify((video.video_products||[]).map(v=>v.id+v.timestamp_seconds));
  useEffect(()=>{
    setTaggedProducts(
      (video.video_products || []).map((vp, i) => ({
        _id: vp.id || `new-${i}-${Date.now()}`, // stable ID for keying
        shopify_product_id: vp.shopify_product_id,
        shopify_handle: vp.shopify_handle,
        product_name: vp.product_name,
        timestamp_seconds: parseInt(vp.timestamp_seconds) || 0,
        duration_seconds: parseInt(vp.duration_seconds) || 8,
        _image: shopifyProducts.find(p => p.id === vp.shopify_product_id)?.image || null,
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[video.id, vpKey]);
  const [showPicker, setShowPicker] = useState(false);
  const [editingTagIdx, setEditingTagIdx] = useState(null);
  const [editTs, setEditTs] = useState("");
  const [editDur, setEditDur] = useState("");
  const [saving, setSaving] = useState(false);

  const categories = ["Breaks", "Market News", "Interviews", "How-To", "Investing"];

  const [saveError, setSaveError] = useState(null);
  const [thumbPreview, setThumbPreview] = useState(video.thumbnail_url || null);
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const thumbInputRef = useRef(null);

  const handleThumbChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbFile(file);
    setThumbPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      let thumbnailUrl = video.thumbnail_url;
      // Upload new thumbnail if one was selected
      if (thumbFile) {
        setThumbUploading(true);
        thumbnailUrl = await uploadThumbnail(video.id, thumbFile);
        setThumbUploading(false);
      }
      await updateVideo(video.id, {
        title: form.title,
        creator: form.creator,
        category: form.category,
        ...(thumbnailUrl !== video.thumbnail_url ? { thumbnail_url: thumbnailUrl } : {}),
      });
      await saveVideoProducts(video.id, taggedProducts);
      onSave();
    } catch (err) {
      console.error("Save error:", err);
      setThumbUploading(false);
      setSaveError(err.message || "Save failed — check Supabase RLS policies");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="edit-panel">
      <div className="ep-title">Edit Video</div>

      <div className="fg">
        <label className="fl">Title</label>
        <input className="fi" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Video title" />
      </div>

      <div className="ep-row">
        <div className="fg">
          <label className="fl">Creator</label>
          <input className="fi" value={form.creator} onChange={e => setForm(f => ({ ...f, creator: e.target.value }))} placeholder="Host name" />
        </div>
        <div className="fg">
          <label className="fl">Category</label>
          <select className="fsel" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            <option value="">Select…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* THUMBNAIL */}
      <div className="fg">
        <label className="fl">Thumbnail</label>
        <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
          <div
            style={{width:120,height:68,borderRadius:4,overflow:"hidden",background:"var(--surface3)",flexShrink:0,cursor:"pointer",border:"2px dashed var(--border2)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",transition:"border-color .15s"}}
            onClick={()=>thumbInputRef.current?.click()}
            onMouseEnter={e=>e.currentTarget.style.borderColor="var(--red)"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border2)"}
          >
            {thumbPreview
              ? <img src={thumbPreview} alt="Thumbnail" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <span style={{fontSize:24,opacity:.3}}>🖼</span>
            }
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .15s"}}
              onMouseEnter={e=>e.currentTarget.style.opacity=1}
              onMouseLeave={e=>e.currentTarget.style.opacity=0}
            >
              <span style={{fontFamily:"var(--fc)",fontSize:10,fontWeight:700,color:"#fff",letterSpacing:".5px",textTransform:"uppercase"}}>Change</span>
            </div>
          </div>
          <div style={{flex:1}}>
            <button
              onClick={()=>thumbInputRef.current?.click()}
              style={{width:"100%",padding:"8px 12px",background:"var(--surface3)",border:"1px solid var(--border2)",borderRadius:4,color:"var(--white)",fontFamily:"var(--fc)",fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:".5px",textTransform:"uppercase",marginBottom:6}}
            >
              {thumbUploading ? "Uploading…" : "Upload New Thumbnail"}
            </button>
            <div style={{fontSize:11,color:"var(--gray)",lineHeight:1.5}}>
              JPG or PNG · 16:9 ratio recommended<br/>
              Auto-generated from Mux if not set
            </div>
            {thumbFile && !thumbUploading && (
              <div style={{fontFamily:"var(--fc)",fontSize:11,color:"var(--live)",marginTop:4}}>
                ✓ Ready to save: {thumbFile.name}
              </div>
            )}
          </div>
        </div>
        <input ref={thumbInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{display:"none"}} onChange={handleThumbChange}/>
      </div>

      {/* PRODUCT TAGGER */}
      <div className="fg" style={{ marginTop: 4 }}>
        <label className="fl">Shoppable Product Tags</label>
        <div className="tagger">
          <div className="tagger-hdr">
            <div className="tagger-title">Tagged Products ({taggedProducts.length})</div>
            <button className="tagger-add" onClick={() => setShowPicker(true)}>+ Tag Product</button>
          </div>
          {taggedProducts.length === 0 ? (
            <div className="empty-tags">No products tagged yet — add products to create shoppable moments</div>
          ) : (
            [...taggedProducts]
              .sort((a, b) => (parseInt(a.timestamp_seconds)||0) - (parseInt(b.timestamp_seconds)||0))
              .map((tp) => (
                <div key={tp._id} className="tag-row" style={{flexDirection:"column",alignItems:"stretch",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {tp._image
                      ? <img className="tag-row-img" src={tp._image} alt={tp.product_name} />
                      : <div className="tag-row-img-ph">📦</div>
                    }
                    <div className="tag-row-info" style={{flex:1}}>
                      <div className="tag-row-name">{tp.product_name}</div>
                      <div className="tag-row-ts">⏱ {fmtTimestamp(tp.timestamp_seconds)} · {tp.duration_seconds||8}s visible</div>
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button
                        style={{padding:"4px 8px",background:"var(--surface3)",border:"1px solid var(--border2)",borderRadius:3,color:"var(--gold)",fontFamily:"var(--fc)",fontSize:10,fontWeight:700,cursor:"pointer",letterSpacing:".5px",textTransform:"uppercase"}}
                        onClick={()=>{
                          const isEditing = editingTagIdx===tp._id;
                          setEditingTagIdx(isEditing?null:tp._id);
                          if(!isEditing){
                            setEditTs(fmtTimestamp(tp.timestamp_seconds));
                            setEditDur(String(tp.duration_seconds||8));
                          }
                        }}
                      >
                        {editingTagIdx===tp._id?"Cancel":"Edit"}
                      </button>
                      <button className="tag-rm" onClick={()=>{
                        setTaggedProducts(prev=>prev.filter(p=>p._id!==tp._id));
                        if(editingTagIdx===tp._id) setEditingTagIdx(null);
                      }}>✕</button>
                    </div>
                  </div>
                  {editingTagIdx===tp._id&&(
                    <div style={{background:"var(--surface3)",borderRadius:4,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <label style={{display:"block",fontFamily:"var(--fc)",fontSize:10,fontWeight:600,letterSpacing:".5px",textTransform:"uppercase",color:"var(--gray)",marginBottom:4}}>Timestamp (mm:ss)</label>
                          <input
                            value={editTs}
                            onChange={e=>setEditTs(e.target.value)}
                            placeholder="e.g. 1:30"
                            style={{width:"100%",padding:"7px 10px",background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:3,color:"var(--white)",fontFamily:"var(--fb)",fontSize:13,outline:"none"}}
                          />
                        </div>
                        <div>
                          <label style={{display:"block",fontFamily:"var(--fc)",fontSize:10,fontWeight:600,letterSpacing:".5px",textTransform:"uppercase",color:"var(--gray)",marginBottom:4}}>Duration (secs)</label>
                          <input
                            value={editDur}
                            onChange={e=>setEditDur(e.target.value)}
                            placeholder="8"
                            style={{width:"100%",padding:"7px 10px",background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:3,color:"var(--white)",fontFamily:"var(--fb)",fontSize:13,outline:"none"}}
                          />
                        </div>
                      </div>
                      <button
                        style={{padding:"8px",background:"var(--red)",border:"none",borderRadius:3,color:"var(--white)",fontFamily:"var(--fc)",fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:".5px",textTransform:"uppercase"}}
                        onClick={()=>{
                          const newTs = parseTimestamp(editTs);
                          const newDur = parseInt(editDur)||8;
                          // Update by _id not index — survives sort order changes
                          setTaggedProducts(prev=>prev.map(p=>
                            p._id===tp._id ? {...p, timestamp_seconds:newTs, duration_seconds:newDur} : p
                          ));
                          setEditingTagIdx(null);
                        }}
                      >
                        Update Timestamp
                      </button>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      </div>

      {saveError && (
        <div style={{background:"rgba(192,39,45,.1)",border:"1px solid var(--red-dim)",borderRadius:4,padding:"8px 12px",marginBottom:8,fontFamily:"var(--fc)",fontSize:12,color:"var(--white)"}}>
          ⚠️ {saveError}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="save-btn" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 4, border: "1px solid var(--border2)", background: "none", color: "var(--gray)", fontFamily: "var(--fc)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
      </div>

      {showPicker && (
        <ProductPicker
          products={shopifyProducts}
          onClose={() => setShowPicker(false)}
          onPick={product => {
            setTaggedProducts(prev => [...prev, {
              ...product,
              _id: `new-${Date.now()}-${Math.random()}`,
            }]);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// MAIN VIDEO CMS COMPONENT
// ============================================================
export default function VideoCMS() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shopifyProducts, setShopifyProducts] = useState([]);
  const [uploads, setUploads] = useState([]); // active upload states
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef({});

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load videos and Shopify products
  useEffect(() => {
    loadVideos();
    fetchShopifyProducts().then(setShopifyProducts).catch(console.error);
  }, []);

  async function loadVideos() {
    setLoading(true);
    try {
      const data = await fetchVideos();
      setVideos(data || []);
    } catch (err) {
      console.error("Load videos error:", err);
    } finally {
      setLoading(false);
    }
  }

  // Poll Mux for asset status after upload
  async function pollForPlaybackId(uploadId, videoId) {
    let attempts = 0;
    const maxAttempts = 60; // 5 min max

    const poll = async () => {
      if (attempts++ > maxAttempts) {
        clearInterval(pollRef.current[uploadId]);
        return;
      }
      try {
        const upload = await getMuxAsset(uploadId);
        if (upload.asset_id) {
          const asset = await getMuxAssetById(upload.asset_id);
          if (asset.status === "ready" && asset.playback_ids?.length) {
            const playbackId = asset.playback_ids[0].id;
            const duration = fmtDuration(asset.duration);
            const thumbnail = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=5`;
            await updateVideo(videoId, {
              status: "ready",
              mux_asset_id: asset.id,
              mux_playback_id: playbackId,
              duration,
              thumbnail_url: thumbnail,
            });
            clearInterval(pollRef.current[uploadId]);
            setUploads(prev => prev.map(u =>
              u.uploadId === uploadId
                ? { ...u, status: "ready", playbackId }
                : u
            ));
            loadVideos();
            showToast(`✓ Video ready: ${asset.id.slice(0, 8)}…`);
          } else if (asset.status === "errored") {
            await updateVideo(videoId, { status: "error" });
            clearInterval(pollRef.current[uploadId]);
            setUploads(prev => prev.map(u =>
              u.uploadId === uploadId ? { ...u, status: "error" } : u
            ));
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    };

    pollRef.current[uploadId] = setInterval(poll, 5000);
    poll(); // immediate first check
  }

  // Handle file selection (drag or click)
  const handleFiles = useCallback(async (files) => {
    const videoFiles = Array.from(files).filter(f => f.type.startsWith("video/"));
    if (!videoFiles.length) {
      showToast("Please drop video files only");
      return;
    }

    for (const file of videoFiles) {
      const uploadState = {
        id: Date.now() + Math.random(),
        filename: file.name,
        progress: 0,
        status: "uploading",
        uploadId: null,
      };

      setUploads(prev => [...prev, uploadState]);

      try {
        // 1. Get Mux upload URL
        const { uploadId, uploadUrl } = await createMuxUploadUrl();
        uploadState.uploadId = uploadId;

        // 2. Insert placeholder in Supabase
        const videoRow = await insertVideo({
          title: file.name.replace(/\.[^/.]+$/, ""), // filename without extension
          status: "uploading",
          mux_upload_id: uploadId,
        });

        // 3. Upload file to Mux via UpChunk
        const upload = UpChunk.createUpload({
          endpoint: uploadUrl,
          file,
          chunkSize: 5120, // 5MB chunks
        });

        upload.on("progress", ({ detail }) => {
          setUploads(prev => prev.map(u =>
            u.id === uploadState.id
              ? { ...u, progress: Math.round(detail), uploadId }
              : u
          ));
        });

        upload.on("success", async () => {
          setUploads(prev => prev.map(u =>
            u.id === uploadState.id
              ? { ...u, progress: 100, status: "processing", uploadId }
              : u
          ));
          await updateVideo(videoRow.id, { status: "processing" });
          // Start polling for Mux to finish processing
          pollForPlaybackId(uploadId, videoRow.id);
          loadVideos();
        });

        upload.on("error", async ({ detail }) => {
          console.error("Upload error:", detail);
          setUploads(prev => prev.map(u =>
            u.id === uploadState.id ? { ...u, status: "error" } : u
          ));
          await updateVideo(videoRow.id, { status: "error" });
          showToast(`Upload failed: ${file.name}`);
        });

      } catch (err) {
        console.error("Upload setup error:", err);
        setUploads(prev => prev.map(u =>
          u.id === uploadState.id ? { ...u, status: "error" } : u
        ));
        showToast(`Error: ${err.message}`);
      }
    }
  }, [showToast]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDeleteVideo = async (video) => {
    try {
      // Delete from Mux if we have an asset ID
      if (video.mux_asset_id) {
        await deleteMuxAsset(video.mux_asset_id).catch(console.error);
      }
      // Delete from Supabase (cascades to video_products)
      await deleteVideo(video.id);
      setVideos(prev => prev.filter(v => v.id !== video.id));
      showToast("Video deleted");
    } catch (err) {
      showToast(`Delete failed: ${err.message}`);
    } finally {
      setConfirmDelete(null);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => Object.values(pollRef.current).forEach(clearInterval);
  }, []);

  const statusBadge = (status) => {
    if (status === "ready") return <span className="vstatus ready"><span className="vstatus-dot" />Ready</span>;
    if (status === "processing") return <span className="vstatus processing"><span className="vstatus-dot" />Processing</span>;
    if (status === "uploading") return <span className="vstatus processing"><span className="vstatus-dot" />Uploading</span>;
    return <span className="vstatus error">Error</span>;
  };

  return (
    <>
      <style>{cmsStyles}</style>
      <div className="cms-wrap">
        <div className="cms-inner">

          {/* UPLOAD ZONE */}
          <div className="cms-shdr">
            <div className="cms-stitle">Upload Videos</div>
          </div>

          <div
            className={`upload-zone${dragging ? " drag" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-zone-icon">🎬</div>
            <div className="upload-zone-title">Drag & drop videos here</div>
            <div className="upload-zone-sub">Or click to browse · MP4, MOV, MKV · Any size</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              style={{ display: "none" }}
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {/* ACTIVE UPLOADS */}
          {uploads.map(u => (
            <div key={u.id} className="upload-progress">
              <div className="up-filename">
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{u.filename}</span>
                <span style={{ fontFamily: "var(--fc)", fontSize: 12, color: "var(--gray)", flexShrink: 0 }}>
                  {u.status === "uploading" ? `${u.progress}%` : ""}
                </span>
              </div>
              <div className="up-bar">
                <div className="up-fill" style={{
                  width: u.status === "processing" || u.status === "ready" ? "100%" : `${u.progress}%`,
                  background: u.status === "error" ? "var(--red)" : u.status === "ready" ? "var(--live)" : "var(--red)"
                }} />
              </div>
              <div className={`up-status ${u.status === "ready" ? "done" : u.status === "error" ? "err" : ""}`}>
                {u.status === "uploading" && `Uploading to Mux… ${u.progress}%`}
                {u.status === "processing" && "Processing video — this takes 1-3 minutes"}
                {u.status === "ready" && "✓ Ready to stream"}
                {u.status === "error" && "Upload failed — try again"}
              </div>
            </div>
          ))}

          {/* VIDEO LIBRARY */}
          <div className="cms-shdr">
            <div className="cms-stitle">Video Library</div>
            <div className="cms-count">{videos.length} video{videos.length !== 1 ? "s" : ""}</div>
          </div>

          {loading ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--gray)", fontFamily: "var(--fc)" }}>Loading…</div>
          ) : videos.length === 0 ? (
            <div className="empty-videos">
              <div className="empty-icon">🎬</div>
              <div className="empty-title">No videos yet</div>
              <div className="empty-sub">Upload your first video above to get started</div>
            </div>
          ) : (
            videos.map(video => (
              <div key={video.id} className="video-list-item">
                <div className="vli-top">
                  <div className="vli-thumb">
                    {video.thumbnail_url
                      ? <img src={video.thumbnail_url} alt={video.title} />
                      : <div className="vli-thumb-ph">🎬</div>
                    }
                  </div>
                  <div className="vli-info">
                    <div className="vli-title">{video.title || "Untitled"}</div>
                    <div className="vli-meta">
                      {video.creator && `${video.creator} · `}
                      {video.category && `${video.category} · `}
                      {video.duration && `${video.duration} · `}
                      {video.video_products?.length > 0 && `🛍 ${video.video_products.length} product${video.video_products.length !== 1 ? "s" : ""} tagged · `}
                      {statusBadge(video.status)}
                    </div>
                    {video.mux_playback_id && (
                      <div style={{ marginTop: 4 }}>
                        <span className="mux-badge">MUX · {video.mux_playback_id.slice(0, 12)}…</span>
                      </div>
                    )}
                    <div className="vli-actions">
                      <button className="vli-btn primary" onClick={() => setEditingId(editingId === video.id ? null : video.id)}>
                        {editingId === video.id ? "Close" : "Edit"}
                      </button>
                      <button className="vli-btn danger" onClick={() => setConfirmDelete(video)}>Delete</button>
                    </div>
                  </div>
                </div>

                {editingId === video.id && (
                  <VideoEditPanel
                    video={video}
                    shopifyProducts={shopifyProducts}
                    onSave={() => { loadVideos(); setEditingId(null); showToast("✓ Saved"); }}
                    onClose={() => setEditingId(null)}
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* CONFIRM DELETE */}
        {confirmDelete && (
          <div className="confirm-overlay">
            <div className="confirm-box">
              <div className="confirm-title">Delete Video?</div>
              <div className="confirm-sub">
                "{confirmDelete.title}" will be permanently deleted from Mux and the database. This cannot be undone.
              </div>
              <div className="confirm-btns">
                <button className="confirm-cancel" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="confirm-delete" onClick={() => handleDeleteVideo(confirmDelete)}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="cms-toast">{toast}</div>}
      </div>
    </>
  );
}
