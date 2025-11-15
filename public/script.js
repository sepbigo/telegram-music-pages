
const API = window.API_BASE_URL || '';

const listEl = document.getElementById('list');
const loadingEl = document.getElementById('loading');
const playerPanel = document.getElementById('playerPanel');
const audioEl = document.getElementById('audio');
const nowTitle = document.getElementById('nowTitle');
const nowMeta = document.getElementById('nowMeta');
const searchInput = document.getElementById('searchInput');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const queueEl = document.getElementById('queue');
const themeToggle = document.getElementById('themeToggle');

let songs = [];
let page = 1;
const pageSize = 8;
let queue = JSON.parse(localStorage.getItem('tm_queue') || '[]');
let likes = JSON.parse(localStorage.getItem('tm_likes') || '{}');

function api(path, opts={}) {
  opts.headers = opts.headers || {};
  return fetch((API||'') + path, opts);
}

function setLoading(v){ loadingEl.style.display = v ? 'block' : 'none'; }
async function fetchSongs(){ setLoading(true); try{
    const resp = await api('/api/songs');
    const data = await resp.json();
    songs = data.songs || [];
    renderGrouped(songs);
}catch(e){ listEl.innerHTML = `<div class="loading">加载失败：${e.message}</div>`; } finally{ setLoading(false); } }

function formatSeconds(sec){ if(!sec) return ''; const s = Math.floor(sec%60).toString().padStart(2,'0'); const m = Math.floor(sec/60).toString(); return `${m}:${s}`; }
function escapeHtml(text){ return (text||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderGrouped(songsAll){
  const groups = {};
  for(const s of songsAll){
    const cid = (s.chat && s.chat.id) || 'unknown';
    if(!groups[cid]) groups[cid] = { chat: s.chat || {id:cid, title:cid}, items: [] };
    groups[cid].items.push(s);
  }
  listEl.innerHTML = '';
  for(const gid of Object.keys(groups)){
    const g = groups[gid];
    const header = document.createElement('div');
    header.style.gridColumn = '1/-1';
    header.style.padding = '8px 6px';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.innerHTML = `<div style="display:flex;align-items:center;gap:12px"><div style="width:56px;height:56px;border-radius:8px;background:linear-gradient(135deg,#eef2ff,#fff);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--muted)">${escapeHtml((g.chat.title||g.chat.id).slice(0,2).toUpperCase())}</div><div><div style="font-weight:600">${escapeHtml(g.chat.title || g.chat.id)}</div><div style="font-size:12px;color:var(--muted)">${g.items.length} 首</div></div></div>`;
    listEl.appendChild(header);
    for(const s of g.items){
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="thumb">${(s.title||s.file_name||'--').slice(0,2).toUpperCase()}</div>
        <div class="info">
          <div class="titleItem">${escapeHtml(s.title || s.file_name || 'audio')}</div>
          <div class="meta">${s.performer ? escapeHtml(s.performer) + ' · ' : ''}${formatSeconds(s.duration)} ${s.mime ? ' · '+s.mime : ''}</div>
        </div>
        <div class="actions">
          <button class="btn play">播放</button>
          <button class="btn like">${likes[s.file_id] ? '❤️' : '♡'}</button>
          <button class="btn add">队列</button>
        </div>
      `;
      card.querySelector('.play').onclick = ()=>playSong(s);
      card.querySelector('.like').onclick = (e)=>{ e.stopPropagation(); toggleLike(s, card.querySelector('.like')); };
      card.querySelector('.add').onclick = (e)=>{ e.stopPropagation(); addToQueue(s); };
      card.onclick = ()=>playSong(s);
      listEl.appendChild(card);
    }
  }
}

function playSong(s){
  playerPanel.classList.remove('hidden');
  nowTitle.textContent = s.title || s.file_name || '音频';
  nowMeta.textContent = `${s.performer || ''} · ${formatSeconds(s.duration)} · ${s.mime || ''}`;
  audioEl.src = (API||'') + '/api/file?file_id=' + encodeURIComponent(s.file_id);
  audioEl.play().catch(()=>{});
  pushHistory(s);
}

function addToQueue(s){ queue.push(s); persistQueue(); renderQueue(); }
function renderQueue(){ queueEl.innerHTML=''; for(const q of queue){ const d=document.createElement('div'); d.className='qitem'; d.textContent=(q.title||q.file_name||'audio'); queueEl.appendChild(d);} }
function persistQueue(){ localStorage.setItem('tm_queue', JSON.stringify(queue)); }
function toggleLike(s, btn){ likes[s.file_id] = likes[s.file_id] ? false : true; if(!likes[s.file_id]) delete likes[s.file_id]; localStorage.setItem('tm_likes', JSON.stringify(likes)); btn.textContent = likes[s.file_id] ? '❤️' : '♡'; }
function pushHistory(s){ const h = JSON.parse(localStorage.getItem('tm_history')||'[]'); h.unshift({file_id:s.file_id,title:s.title||s.file_name||'',time:Date.now()}); localStorage.setItem('tm_history', JSON.stringify(h.slice(0,50))); }

prevBtn.addEventListener('click', ()=>{ page = Math.max(1, page-1); });
nextBtn.addEventListener('click', ()=>{ page++; });

themeToggle && themeToggle.addEventListener('click', ()=>{ const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', t); localStorage.setItem('tm_theme', t); });
window.addEventListener('load', ()=>{ const t = localStorage.getItem('tm_theme') || 'light'; document.documentElement.setAttribute('data-theme', t); renderQueue(); fetchSongs(); setInterval(fetchSongs, 60*1000); });
