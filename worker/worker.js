// Cloudflare Worker - full API implementation for Telegram Music
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/songs' && request.method === 'GET') return await handleSongs(request, env);
      if (url.pathname === '/api/file' && request.method === 'GET') return await handleFile(request, env);
      if (url.pathname === '/api/channels' && request.method === 'GET') return await handleGetChannels(request, env);
      if (url.pathname.startsWith('/api/channel/') && request.method === 'POST') return await handleSetChannel(request, env);
      if (url.pathname === '/webhook' && request.method === 'POST') return await handleWebhook(request, env);
      if (url.pathname === '/api/admin/create' && request.method === 'POST') return await handleAdminCreate(request, env);
      if (url.pathname === '/api/admin/login' && request.method === 'POST') return await handleAdminLogin(request, env);
      if (url.pathname === '/api/admin/logout' && request.method === 'POST') return await handleAdminLogout(request, env);
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
  }
};

async function jsonResponse(obj, status=200){
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' }});
}

// helper hash
async function hash(p){
  const enc = new TextEncoder();
  const data = enc.encode(p);
  const h = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Admin (D1)
async function handleAdminCreate(req, env){
  const body = await req.json();
  const { admin_secret, username, password } = body;
  if (!env.ADMIN_SECRET || admin_secret !== env.ADMIN_SECRET) return jsonResponse({ error: 'admin_secret invalid' }, 403);
  if (!env.MUSIC_D1) return jsonResponse({ error: 'D1 not configured' }, 500);
  // create tables if not exist
  await env.MUSIC_D1.prepare(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, created_at INTEGER)`).run();
  await env.MUSIC_D1.prepare(`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, token TEXT UNIQUE, expires_at INTEGER)`).run();
  await env.MUSIC_D1.prepare(`CREATE TABLE IF NOT EXISTS channels (chat_id TEXT PRIMARY KEY, title TEXT, cover TEXT, description TEXT, updated_at INTEGER)`).run();
  const hp = await hash(password);
  await env.MUSIC_D1.prepare(`INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)`).bind(username, hp, Date.now()).run();
  return jsonResponse({ ok: true });
}

async function handleAdminLogin(req, env){
  if (!env.MUSIC_D1) return jsonResponse({ error: 'D1 not configured' }, 500);
  const body = await req.json();
  const username = body.username || 'admin';
  const password = body.password || '';
  const hp = await hash(password);
  const row = await env.MUSIC_D1.prepare(`SELECT id, username, password_hash FROM admins WHERE username = ?`).bind(username).all();
  const admin = row.results && row.results[0] ? row.results[0] : null;
  if (!admin) return jsonResponse({ error: 'invalid' }, 401);
  if (admin.password_hash !== hp) return jsonResponse({ error: 'invalid' }, 401);
  // create session
  const token = crypto.getRandomValues(new Uint8Array(24)).reduce((s,b)=>s+('00'+b.toString(16)).slice(-2),'');
  const expires = Date.now() + 1000*60*60*24;
  await env.MUSIC_D1.prepare(`INSERT INTO sessions (admin_id, token, expires_at) VALUES (?, ?, ?)`).bind(admin.id, token, expires).run();
  return jsonResponse({ token, expires });
}

async function validateSession(token, env){
  if (!env.MUSIC_D1) return null;
  const now = Date.now();
  const r = await env.MUSIC_D1.prepare(`SELECT s.token, s.expires_at, a.id as admin_id, a.username FROM sessions s JOIN admins a ON s.admin_id=a.id WHERE s.token = ?`).bind(token).all();
  const row = r.results && r.results[0] ? r.results[0] : null;
  if (!row) return null;
  if (row.expires_at < now) return null;
  return { admin_id: row.admin_id, username: row.username };
}

async function handleAdminLogout(req, env){
  if (!env.MUSIC_D1) return jsonResponse({ error: 'D1 not configured' }, 500);
  const token = (req.headers.get('authorization') || '').replace('Bearer ','').trim();
  if (!token) return jsonResponse({ error: 'missing token' }, 401);
  await env.MUSIC_D1.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  return jsonResponse({ ok: true });
}

// Channels
async function handleGetChannels(req, env){
  if (env.MUSIC_KV) {
    const raw = await env.MUSIC_KV.get('channels');
    const channels = raw ? JSON.parse(raw) : {};
    return jsonResponse({ channels });
  } else if (env.MUSIC_D1) {
    const r = await env.MUSIC_D1.prepare(`SELECT chat_id, title, cover, description FROM channels ORDER BY updated_at DESC`).all();
    const out = {};
    for (const row of r.results || []) out[row.chat_id] = { chat_id: row.chat_id, title: row.title, cover: row.cover, description: row.description };
    return jsonResponse({ channels: out });
  } else {
    return jsonResponse({ channels: {} });
  }
}

async function handleSetChannel(req, env){
  const token = (req.headers.get('authorization') || '').replace('Bearer ','').trim();
  const sess = await validateSession(token, env);
  if (!sess) return jsonResponse({ error: 'unauthorized' }, 401);
  const chatId = req.url.split('/api/channel/')[1];
  const body = await req.json();
  const meta = { title: body.title, cover: body.cover, description: body.description };
  if (env.MUSIC_KV) {
    const raw = await env.MUSIC_KV.get('channels');
    const obj = raw ? JSON.parse(raw) : {};
    obj[chatId] = Object.assign(obj[chatId] || {}, meta);
    await env.MUSIC_KV.put('channels', JSON.stringify(obj));
    return jsonResponse({ ok: true, channel: obj[chatId] });
  } else if (env.MUSIC_D1) {
    await env.MUSIC_D1.prepare(`INSERT OR REPLACE INTO channels (chat_id, title, cover, description, updated_at) VALUES (?, ?, ?, ?, ?)`).bind(chatId, meta.title||null, meta.cover||null, meta.description||null, Date.now()).run();
    return jsonResponse({ ok: true, channel: meta });
  } else {
    return jsonResponse({ error: 'no storage' }, 500);
  }
}

// Songs list (KV preferred; fallback to getUpdates)
async function handleSongs(req, env){
  if (env.MUSIC_KV) {
    const raw = await env.MUSIC_KV.get('songs_full');
    const songs = raw ? JSON.parse(raw) : [];
    // attach channel meta
    const chraw = await env.MUSIC_KV.get('channels');
    const ch = chraw ? JSON.parse(chraw) : {};
    for (const s of songs) if (s.chat && ch[s.chat.id]) s.chat.meta = ch[s.chat.id];
    return jsonResponse({ songs });
  }
  // fallback getUpdates
  const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  const updatesUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=100`;
  const uresp = await fetch(updatesUrl);
  const uj = await uresp.json();
  const messages = (uj.result || []).map(u => u.message || u.channel_post || u.edited_message).filter(Boolean);
  const songs = [];
  for (const msg of messages) {
    const pick = msg.audio || msg.voice || (msg.document && msg.document.mime_type && msg.document.mime_type.startsWith('audio') ? msg.document : null);
    if (!pick) continue;
    const file_id = pick.file_id;
    const title = msg.caption || pick.file_name || pick.title || '';
    const performer = pick.performer || '';
    const duration = pick.duration || 0;
    const mime = pick.mime_type || (msg.document && msg.document.mime_type) || '';
    const chat = { id: String((msg.chat && msg.chat.id) || (msg.sender_chat && msg.sender_chat.id) || ''), title: msg.chat && msg.chat.title || msg.chat && msg.chat.username || (msg.sender_chat && msg.sender_chat.title) || '' };
    songs.push({ file_id, title, performer, duration, mime, file_name: pick.file_name || null, date: msg.date || 0, chat });
  }
  const map = new Map();
  for (const s of songs) map.set(s.file_id, s);
  const out = Array.from(map.values()).sort((a,b)=> (b.date||0)-(a.date||0));
  return jsonResponse({ songs: out });
}

// File proxy
async function handleFile(req, env){
  const url = new URL(req.url);
  const fileId = url.searchParams.get('file_id');
  if (!fileId) return new Response('missing file_id', { status: 400 });
  const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  const getFileUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const gfResp = await fetch(getFileUrl);
  const gj = await gfResp.json();
  if (!gj.ok || !gj.result || !gj.result.file_path) return new Response('no file_path', { status: 502 });
  const filePath = gj.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
  const upstream = await fetch(fileUrl);
  if (!upstream.ok) return new Response('failed to fetch file', { status: 502 });
  const headers = new Headers(upstream.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'no-cache');
  return new Response(upstream.body, { status: 200, headers });
}

// Webhook
async function handleWebhook(req, env){
  try {
    const body = await req.json();
    const msg = body.message || body.channel_post || body.edited_message;
    if (msg) {
      const pick = msg.audio || msg.voice || (msg.document && msg.document.mime_type && msg.document.mime_type.startsWith('audio') ? msg.document : null);
      const chatId = String((msg.chat && msg.chat.id) || (msg.sender_chat && msg.sender_chat.id) || '');
      const chatTitle = msg.chat && msg.chat.title || msg.chat && msg.chat.username || (msg.sender_chat && msg.sender_chat.title) || '';
      if (pick) {
        const file_id = pick.file_id;
        const title = msg.caption || pick.file_name || pick.title || '';
        const performer = pick.performer || '';
        const duration = pick.duration || 0;
        const mime = pick.mime_type || (msg.document && msg.document.mime_type) || '';
        const item = { file_id, title, performer, duration, mime, file_name: pick.file_name||null, date: msg.date||0, chat: { id: chatId, title: chatTitle } };
        if (env.MUSIC_KV) {
          const raw = await env.MUSIC_KV.get('songs_full');
          const arr = raw ? JSON.parse(raw) : [];
          if (!arr.find(x=>x.file_id===file_id)) {
            arr.unshift(item);
            await env.MUSIC_KV.put('songs_full', JSON.stringify(arr.slice(0,500)));
          }
          const rawChannels = await env.MUSIC_KV.get('channels');
          const ch = rawChannels ? JSON.parse(rawChannels) : {};
          if (!ch[chatId]) ch[chatId] = { chat_id: chatId, title: chatTitle, cover: null, description: null };
          await env.MUSIC_KV.put('channels', JSON.stringify(ch));
        } else if (env.MUSIC_D1) {
          await env.MUSIC_D1.prepare(`CREATE TABLE IF NOT EXISTS songs (file_id TEXT PRIMARY KEY, title TEXT, performer TEXT, duration INTEGER, mime TEXT, file_name TEXT, date INTEGER, chat_id TEXT)`).run();
          await env.MUSIC_D1.prepare(`INSERT OR REPLACE INTO songs (file_id, title, performer, duration, mime, file_name, date, chat_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(file_id, title, performer, duration, mime, pick.file_name||null, msg.date||0, chatId).run();
          await env.MUSIC_D1.prepare(`INSERT OR REPLACE INTO channels (chat_id, title, updated_at) VALUES (?, ?, ?)`).bind(chatId, chatTitle, Date.now()).run();
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return jsonResponse({ ok: true });
}
