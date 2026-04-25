// ─── SUPABASE CONFIG ──────────────────────────────────────
var SUPABASE_URL     = "https://atnuchpxnaqoovgxhnra.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_V-NudG0zyPo9BEz1XZcAoA_Y__ZH7Ti";
var ADMIN_PASSWORD   = "spencer2024"; 

// ─── SUPABASE CLIENT ─────────────────────────────────────
if (typeof dbClient === "undefined") var dbClient = null; 
var isSupabaseReady = false;
var isRestApiMode = false;

async function restRequest(path, options = {}) {
  const method = options.method || "GET";
  const headers = { 
    apikey: SUPABASE_ANON_KEY, 
    Authorization: `Bearer ${SUPABASE_ANON_KEY}` 
  };
  if (options.prefer) headers.Prefer = options.prefer;
  if (options.body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers, body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase REST ${method} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function initSupabase() {
  try {
    if (SUPABASE_URL.includes("YOUR_PROJECT") || SUPABASE_ANON_KEY.includes("YOUR_ANON")) {
      setupLocalBC(); return false;
    }
    // Check for the global window.supabase provided by the CDN
    if (typeof window.supabase === "undefined" || typeof window.supabase.createClient === "undefined") {
      isRestApiMode = true; isSupabaseReady = true;
      window.__spencerDataMode = "supabase-rest";
      updateStatusIndicator(true); return true;
    }
    dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } }
    });
    isRestApiMode = false; isSupabaseReady = true;
    window.__spencerDataMode = "supabase-realtime";
    updateStatusIndicator(true);
    return true;
  } catch (e) {
    isRestApiMode = true; isSupabaseReady = true;
    window.__spencerDataMode = "supabase-rest";
    updateStatusIndicator(true); 
    return true;
  }
}

function updateStatusIndicator(isReady) {
  const dots = document.querySelectorAll(".logo-dot, #db-status-dot, .live-dot");
  dots.forEach(dot => {
    dot.style.background = isReady ? "#00ffa3" : "#ff4d4d";
    dot.style.boxShadow = isReady ? "0 0 10px #00ffa3" : "0 0 10px #ff4d4d";
  });
}

if (typeof initFirebase === "undefined") var initFirebase = initSupabase;

// ─── LOCAL STORAGE FALLBACK ────────────────────────────────
var LOCAL_KEY = "spencerLiveQueue";
var bc = null;
function setupLocalBC() { if (typeof BroadcastChannel !== "undefined") bc = new BroadcastChannel("queue_sync"); }
function localGet() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { requests: [], settings: { accepting_requests: true, live_name: "Spencer's Live 🎸" } }; }
  catch { return { requests: [], settings: { accepting_requests: true } }; }
}
function localSave(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  if (bc) bc.postMessage({ type: "update" });
}

function normalizeSettingsRow(row = {}) {
  return {
    acceptingRequests: typeof row.accepting_requests !== "undefined" ? row.accepting_requests : !!row.acceptingRequests,
    liveName: row.live_name || row.liveName || "",
    now_playing_song: row.now_playing_song,
    now_playing_artist: row.now_playing_artist,
    now_playing_requester: row.now_playing_requester
  };
}

function normalizeRequestRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    requester: r.requester || "Anonymous",
    song: r.song || "Unknown Song",
    artist: r.artist || "Unknown Artist",
    learnLater: r.learn_later || false,
    status: r.status || "pending",
    createdAt: r.created_at || new Date().toISOString(),
    tipAmount: r.tip_amount || 0,
    tier: r.tier || "free", // free, boost, priority, instant
    isVerified: r.is_verified || false,
    orderPos: typeof r.order_pos !== "undefined" ? r.order_pos : r.orderPos
  };
}

// ─── DB ENGINE ──────────────────────────────────────────
if (typeof _listeners === "undefined") var _listeners = { queue: [], pending: [], all: [], settings: [] };
function _notify(type) {
  console.log(`[DB] Notify: ${type}`);
  if (type === "requests") {
    _listeners.queue.forEach(fn => _fetchQueue().then(fn).catch(e => console.error(e)));
    _listeners.pending.forEach(fn => _fetchPending().then(fn).catch(e => console.error(e)));
    _listeners.all.forEach(fn => _fetchHistory().then(fn).catch(e => console.error(e)));
  }
  if (type === "settings") _listeners.settings.forEach(fn => _fetchSettings().then(fn).catch(e => console.error(e)));
}

async function _fetchQueue() {
  if (isRestApiMode) {
    const d = await restRequest("requests?status=in.(approved,playing)&select=*&order=order_pos.asc");
    return (d || []).map(normalizeRequestRow);
  }
  const { data } = await dbClient.from("requests").select("*").in("status", ["approved", "playing"]).order("order_pos", { ascending: true });
  return (data || []).map(normalizeRequestRow);
}

async function _fetchPending() {
  if (isRestApiMode) {
    const d = await restRequest("requests?status=eq.pending&select=*&order=created_at.asc");
    return (d || []).map(normalizeRequestRow);
  }
  const { data } = await dbClient.from("requests").select("*").eq("status", "pending").order("created_at", { ascending: true });
  return (data || []).map(normalizeRequestRow);
}

async function _fetchHistory() {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    if (isRestApiMode) {
      const d = await restRequest(`requests?created_at=gte.${twentyFourHoursAgo}&order=id.desc&limit=200`);
      return (d || []).map(normalizeRequestRow);
    }
    const { data, error } = await dbClient
      .from("requests")
      .select("*")
      .gte("created_at", twentyFourHoursAgo)
      .order("id", { ascending: false })
      .limit(200);
      
    if (error) throw error;
    console.log(`[DB] History Fetched: ${data?.length || 0} items (last 24h)`);
    return (data || []).map(normalizeRequestRow);
  } catch (err) {
    console.error("Fetch History Error:", err);
    return [];
  }
}

async function _fetchSettings() {
  if (isRestApiMode) {
    const d = await restRequest("settings?id=eq.main&select=*&limit=1");
    return normalizeSettingsRow((d && d[0]) || {});
  }
  const { data } = await dbClient.from("settings").select("*").eq("id", "main").single();
  return normalizeSettingsRow(data || {});
}

let _chan = null;
function _ensureRealtime() {
  if (_chan || !dbClient || isRestApiMode) return;
  _chan = dbClient.channel("db-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, () => _notify("requests"))
    .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => _notify("settings"))
    .subscribe();
}

if (typeof DB === "undefined") var DB = {
  onQueueChange(cb) {
    if (isSupabaseReady) {
      _listeners.queue.push(cb); _ensureRealtime(); _fetchQueue().then(cb);
      if (isRestApiMode) setInterval(() => _fetchQueue().then(cb), 2000);
    } else {
      const poll = () => cb((localGet().requests || []).filter(r => r.status === "approved" || r.status === "playing").sort((a, b) => (a.order_pos || 0) - (b.order_pos || 0)).map(normalizeRequestRow));
      poll(); setInterval(poll, 1500); if (bc) bc.onmessage = poll;
    }
  },
  onPendingChange(cb) {
    if (isSupabaseReady) {
      _listeners.pending.push(cb); _ensureRealtime(); _fetchPending().then(cb);
      if (isRestApiMode) setInterval(() => _fetchPending().then(cb), 2000);
    } else {
      const poll = () => cb((localGet().requests || []).filter(r => r.status === "pending").map(normalizeRequestRow));
      poll(); setInterval(poll, 1500); if (bc) bc.onmessage = poll;
    }
  },
  onSettingsChange(cb) {
    if (isSupabaseReady) {
      _listeners.settings.push(cb); _ensureRealtime(); _fetchSettings().then(cb);
      if (isRestApiMode) setInterval(() => _fetchSettings().then(cb), 2000);
    } else {
      const poll = () => cb(normalizeSettingsRow(localGet().settings || {}));
      poll(); setInterval(poll, 2000); if (bc) bc.onmessage = poll;
    }
  },
  onNowPlayingChange(cb) {
    return this.onSettingsChange(s => s.now_playing_song ? cb({ song: s.now_playing_song, artist: s.now_playing_artist, requester: s.now_playing_requester }) : cb(null));
  },
  async submitRequest(req) {
    const row = {
      requester: req.requester,
      song: req.song,
      artist: req.artist,
      learn_later: req.learnLater,
      status: "pending",
      tip_amount: req.tipAmount || 0,
      tier: req.tier || "free",
      order_pos: 9999
    };
    if (isSupabaseReady) {
      if (isRestApiMode) {
        await restRequest("requests", { method: "POST", body: row });
      } else {
        const { error } = await dbClient.from("requests").insert(row);
        if (error) throw error;
      }
    } else {
      const d = localGet(); d.requests.push(Object.assign({}, req, { id: Date.now(), status: "pending", created_at: Date.now() })); localSave(d);
    }
  },
  onAllChange(cb) {
    if (isSupabaseReady) {
      _listeners.all.push(cb); _ensureRealtime(); _fetchHistory().then(cb).catch(e => console.error(e));
      if (isRestApiMode) setInterval(() => _fetchHistory().then(cb).catch(e => console.error(e)), 5000);
    } else {
      const poll = () => {
        const items = (localGet().requests || []).sort((a,b) => b.id - a.id).map(normalizeRequestRow);
        cb(items);
      };
      poll(); setInterval(poll, 2000);
    }
  },
  async approveRequest(id) {
    if (isSupabaseReady) {
      const { data: req } = await dbClient.from("requests").select("id, tier, tip_amount").eq("id", id).single();
      let orderPos = Date.now();
      if (req?.tier === "priority" || req?.tier === "instant") orderPos = -1;
      else if (req?.tier === "boost") orderPos = Date.now() - ((req?.tip_amount || 0) * 10000);

      if (isRestApiMode) await restRequest(`requests?id=eq.${id}`, { method: "PATCH", body: { status: "approved", order_pos: orderPos } });
      else await dbClient.from("requests").update({ status: "approved", order_pos: orderPos }).eq("id", id);
      
      if (req?.tier === "instant") {
        const { data: fullReq } = await dbClient.from("requests").select("*").eq("id", id).single();
        if (fullReq) this.setNowPlaying(normalizeRequestRow(fullReq));
      }
    } else {
      const d = localGet(); const r = d.requests.find(x => String(x.id) === String(id)); 
      if (r) {
        r.status = "approved";
        let base = Date.now();
        if (r.tier === "priority" || r.tier === "instant") r.orderPos = -1;
        else if (r.tier === "boost") r.orderPos = base - ((r.tipAmount || 0) * 10000);
        else r.orderPos = base;
      }
      localSave(d);
    }
    _notify("requests");
  },
  async reorder(items) {
    if (isSupabaseReady) {
      for (let i = 0; i < items.length; i++) {
        if (isRestApiMode) await restRequest(`requests?id=eq.${items[i].id}`, { method: "PATCH", body: { order_pos: i } });
        else await dbClient.from("requests").update({ order_pos: i }).eq("id", items[i].id);
      }
    } else {
      const d = localGet();
      items.forEach((it, i) => { const r = d.requests.find(x => x.id === it.id); if (r) r.order_pos = i; });
      localSave(d);
    }
    _notify("requests");
  },
  async pinNext(id) {
    if (isSupabaseReady) {
      const items = await _fetchQueue();
      for (const item of items) {
        const newPos = item.id === id ? -1 : item.order_pos;
        if (isRestApiMode) await restRequest(`requests?id=eq.${item.id}`, { method: "PATCH", body: { order_pos: newPos } });
        else await dbClient.from("requests").update({ order_pos: newPos }).eq("id", item.id);
      }
      // Re-normalize all to 0, 1, 2...
      const fresh = await _fetchQueue();
      await this.reorder(fresh.map(f => ({ id: f.id })));
    } else {
      const d = localGet();
      d.requests.filter(r => r.status === "approved").forEach(r => {
        if (r.id === id) r.order_pos = -1;
      });
      d.requests.sort((a,b) => (a.order_pos||0)-(b.order_pos||0)).forEach((r,i) => r.order_pos = i);
      localSave(d);
    }
    _notify("requests");
  },
  async rejectRequest(id) {
    if (isSupabaseReady) {
      if (isRestApiMode) await restRequest(`requests?id=eq.${id}`, { method: "PATCH", body: { status: "rejected" } });
      else await dbClient.from("requests").update({ status: "rejected" }).eq("id", id);
    } else {
      const d = localGet(); const r = d.requests.find(x => String(x.id) === String(id)); if (r) r.status = "rejected"; localSave(d);
    }
    _notify("requests");
  },
  async markPlayed(id) {
    if (isSupabaseReady) {
      if (isRestApiMode) await restRequest(`requests?id=eq.${id}`, { method: "PATCH", body: { status: "played" } });
      else await dbClient.from("requests").update({ status: "played" }).eq("id", id);
    } else {
      const d = localGet(); const r = d.requests.find(x => String(x.id) === String(id)); if (r) r.status = "played"; localSave(d);
    }
    _notify("requests");
  },
  async setNowPlaying(np) {
    const row = { id: "main", now_playing_song: np?.song || null, now_playing_artist: np?.artist || null, now_playing_requester: np?.requester || null };
    if (isSupabaseReady) {
      if (isRestApiMode) await restRequest("settings", { method: "POST", prefer: "resolution=merge-duplicates", body: row });
      else await dbClient.from("settings").upsert(row);
    }
    _notify("settings");
  },
  async updateSettings(s) {
    const row = { id: "main", accepting_requests: s.acceptingRequests, live_name: s.liveName };
    if (isSupabaseReady) {
      if (isRestApiMode) await restRequest("settings", { method: "POST", prefer: "resolution=merge-duplicates", body: row });
      else await dbClient.from("settings").upsert(row);
    }
    _notify("settings");
  }
};

const AUTH_KEY = "spencerAdminAuth";
function isLoggedIn() { return sessionStorage.getItem(AUTH_KEY) === "true"; }
function login(pw) { if (pw === ADMIN_PASSWORD) { sessionStorage.setItem(AUTH_KEY, "true"); return true; } return false; }
function logout() { sessionStorage.removeItem(AUTH_KEY); }

function timeAgo(ts) {
  if (!ts) return "";
  const ms = typeof ts === "number" ? ts : new Date(ts).getTime();
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function sanitize(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function getQRUrl(url, size = 200) { return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`; }

function showToast(msg, type = "info", duration = 3000) {
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ""}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

// Auto-init on load
initSupabase();
