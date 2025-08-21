import React, { useEffect, useMemo, useRef, useState } from "react";

// DnB Live Set Timeline — v3.2
// - Markers move with clips
// - Spacebar toggles play/pause
// - Display media title and timing
// - Import YouTube setlists
// - Clips can move decks & sticky Add Clip button

const BPM = 174;
const SECS_PER_BEAT = 60 / BPM;
const BEATS_PER_PHRASE = 8;
const BASE_PX_PER_BEAT = 28;
const DEFAULT_TAIL_PADDING_SEC = 10;
const ICON_SIZE = 12;

const SUBGENRE_COLORS = {
  Liquid: "#3b82f6",
  Neurofunk: "#ef4444",
  JumpUp: "#f59e0b",
  Minimal: "#10b981",
  Jungle: "#8b5cf6",
  Roller: "#14b8a6",
  Dancefloor: "#e11d48",
};

const REMIX_COLORS = {
  None: "",
  Bootleg: "#f43f5e",
  VIP: "#22c55e",
  Dub: "#0ea5e9",
  "Genre Flip": "#a855f7",
};

const TRANSITION_COLORS = {
  DropSwap: "#22c55e",
  Cut: "#f97316",
  DoubleDrop: "#0ea5e9",
  Blend: "#a3e635",
};

const EFFECT_COLORS = {
  Filter: "#eab308",
  Reverb: "#38bdf8",
  Delay: "#f472b6",
  FX: "#94a3b8",
};

const MARKER_TYPE_COLORS = { transition: "#0ea5e9", effect: "#eab308" };
const CAMELOT_COLORS = {
  '1A':'#FF9999','2A':'#FFB266','3A':'#FFE599','4A':'#E5FF99','5A':'#CCFF99','6A':'#99FFB2',
  '7A':'#99FFFF','8A':'#99D6FF','9A':'#B3B3FF','10A':'#D0B3FF','11A':'#FFB3FF','12A':'#FFCCD6',
  '1B':'#FF6666','2B':'#FF9966','3B':'#FFFF66','4B':'#B2FF66','5B':'#66FF66','6B':'#66FF99',
  '7B':'#66FFFF','8B':'#66CCFF','9B':'#6666FF','10B':'#9966FF','11B':'#FF66FF','12B':'#FF66CC'
};
const CAMELOT_VALUE_MAP = {
  '1A':1,'2A':2,'3A':3,'4A':4,'5A':5,'6A':6,'7A':7,'8A':8,'9A':9,'10A':10,'11A':11,'12A':12,
  '1B':13,'2B':14,'3B':15,'4B':16,'5B':17,'6B':18,'7B':19,'8B':20,'9B':21,'10B':22,'11B':23,'12B':24
};
const VALUE_TO_CAMELOT = Object.fromEntries(Object.entries(CAMELOT_VALUE_MAP).map(([k,v])=>[v,k]));
const SHAPE_BY_TYPE = { transition: "square", effect: "triangle" };

function fmtTime(sec) {
  if (isNaN(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtSec2(sec) { // seconds with 2 decimals everywhere numeric seconds are shown
  if (!isFinite(sec)) return "0.00";
  return (Math.round(sec * 100) / 100).toFixed(2);
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function uid(prefix = "id") { return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`; }
function secToPx(sec, pxPerBeat) { const pxPerSec = pxPerBeat / SECS_PER_BEAT; return Math.round(sec * pxPerSec); }
function pxToSec(px, pxPerBeat) { const pxPerSec = pxPerBeat / SECS_PER_BEAT; return px / pxPerSec; }
function intervalsOverlap(a1, a2, b1, b2) { return Math.max(a1, b1) < Math.min(a2, b2); }
function seriesToPath(series, width, height, yOffset) { if (!series || series.length === 0) return ""; const stepX = width / (series.length - 1 || 1); const max = Math.max(1, ...series); const points = series.map((v, i) => `${i * stepX},${yOffset + (height - (v / max) * height)}`); return `M ${points.join(" L ")}`; }
function camelotToValue(k) { if (!k) return 0; return CAMELOT_VALUE_MAP[k] || 0; }

function buildDemo() {
  const mk = (track, name, start, end, sub, remix, camelot, energy) => ({ id: uid('clip'), track, name, startSec: start, endSec: end, baseColor: SUBGENRE_COLORS[sub] || '#3b82f6', remixType: remix, camelot, genre: 'DnB', subgenre: sub, energy, markers: [] });
  return [ mk(0,'Breakbeat Era',2,18,'Liquid','VIP','8A',5), mk(1,'Headcannon (VIP)',10,28,'Neurofunk','Dub','9A',7), mk(2,'City Lights',22,40,'Liquid','None','10A',4), mk(3,'Jungle Tekno',33,50,'Jungle','Genre Flip','11A',6) ];
}

export default function App() {
  const MIN_ZOOM = 0.02, MAX_ZOOM = 6;
  const [zoom, setZoom] = useState(1);
  const pxPerBeat = BASE_PX_PER_BEAT * zoom;
  const pxPerSec = pxPerBeat / SECS_PER_BEAT;
  const ROW_GAP_PX = 12;

  // subtype colors (user-manageable)
  const initialSubtypes = useMemo(()=> ({
    ...TRANSITION_COLORS,
    ...EFFECT_COLORS,
    ...SUBGENRE_COLORS,
    ...REMIX_COLORS,
  }), []);
  const initialSubtypeTypes = useMemo(()=> ({
    ...Object.fromEntries(Object.keys(TRANSITION_COLORS).map(k=>[k,'transition'])),
    ...Object.fromEntries(Object.keys(EFFECT_COLORS).map(k=>[k,'effect'])),
    ...Object.fromEntries(Object.keys(SUBGENRE_COLORS).map(k=>[k,'clip'])),
    ...Object.fromEntries(Object.keys(REMIX_COLORS).map(k=>[k,'remix'])),
  }), []);
  const [subtypes, setSubtypes] = useState(() => {
    const saved = localStorage.getItem('dnb_subtypes_v1');
    if (saved) { try { return JSON.parse(saved); } catch{} }
    return initialSubtypes;
  });
  const [subtypeTypes, setSubtypeTypes] = useState(() => {
    const saved = localStorage.getItem('dnb_subtype_types_v1');
    if (saved) { try { return JSON.parse(saved); } catch{} }
    return initialSubtypeTypes;
  });
  useEffect(()=> localStorage.setItem('dnb_subtypes_v1', JSON.stringify(subtypes)), [subtypes]);
  useEffect(()=> localStorage.setItem('dnb_subtype_types_v1', JSON.stringify(subtypeTypes)), [subtypeTypes]);

  const [clips, setClips] = useState(() => { const saved = localStorage.getItem('dnb_timeline_v2'); if (saved) { try { return JSON.parse(saved); } catch {} } return buildDemo(); });
  useEffect(()=> localStorage.setItem('dnb_timeline_v2', JSON.stringify(clips)), [clips]);

  const [selectedClipId, setSelectedClipId] = useState(null);
  const selectedClip = clips.find(c=>c.id===selectedClipId) || null;
  const [selectedMarkerRef, setSelectedMarkerRef] = useState(null);

  // media state
  const [mediaDurationSec, setMediaDurationSec] = useState(0);
  const [mediaInfo, setMediaInfo] = useState(() => {
    const saved = localStorage.getItem('dnb_media_info');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return { url: '', title: '' };
  });
  useEffect(() => { localStorage.setItem('dnb_media_info', JSON.stringify(mediaInfo)); }, [mediaInfo]);

  const lastClipEnd = useMemo(()=> Math.max(0, ...clips.map(c => c.endSec || 0)), [clips]);
  const maxEnd = Math.max(120, mediaDurationSec || 0, lastClipEnd) + DEFAULT_TAIL_PADDING_SEC;
  const timelineWidthPx = Math.ceil(maxEnd * pxPerSec) + 300;
  const timelineRef = useRef(null);

  // playhead + player refs
  const [playheadSec, setPlayheadSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null); // youtube or sc widget
  const playerTypeRef = useRef(null); // 'youtube' | 'soundcloud'
  const playerReadyRef = useRef(false);
  const rafRef = useRef(null);
  const lastRAF = useRef(null);

  useEffect(()=>{
    const el = timelineRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const timeAtPointer = (el.scrollLeft + mouseX) / pxPerSec;
        const factor = Math.exp(-e.deltaY / 500);
        const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const newPxPerSec = (BASE_PX_PER_BEAT * newZoom) / SECS_PER_BEAT;
        setZoom(newZoom);
        el.scrollLeft = timeAtPointer * newPxPerSec - mouseX;
      } else {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive:false });
    return ()=> el.removeEventListener('wheel', onWheel);
  }, [zoom, pxPerSec]);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey) return;
      const tl = timelineRef.current;
      if (!tl) return;
      if (!tl.contains(e.target)) {
        e.preventDefault();
        tl.scrollLeft += e.deltaY;
      }
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, []);


  // migrate any legacy marker beat fields into seconds relative to clip
  useEffect(()=>{
    setClips(prev => prev.map(c => ({ ...c, markers: (c.markers||[]).map(m => {
      if (m.startSec == null && m.startBeat != null) m.startSec = c.startSec + (m.startBeat * SECS_PER_BEAT);
      if (m.endSec == null && m.endBeat != null) m.endSec = c.startSec + (m.endBeat * SECS_PER_BEAT);
      return m;
    }) })));
  }, []);

  function addClip(track) {
    const trackClips = clips.filter(c=>c.track===track);
    const lastEndT = trackClips.reduce((acc,c)=>Math.max(acc, c.endSec), 0);
    const gap = 1;
    const startSec = lastEndT>0? lastEndT+gap : 0;
    const endSec = startSec + 90; // default length 90s so new clips are sizeable
    const clip = {
      id: uid('clip'), track, name: 'New Clip', startSec, endSec,
      baseColor: subtypes['Liquid'] || '#3b82f6', remixType: 'None',
      camelot: '8A', genre: 'DnB', subgenre: 'Liquid', energy: 6, markers: []
    };
    if (noOverlapOnInsert(clip, clips)) { setClips(prev=>[...prev, clip]); setSelectedClipId(clip.id); }
    else alert('Cannot insert: overlaps an existing clip on this track.');
  }

  function updateClip(id, patch) {
    setClips(prev=>{
      const idx = prev.findIndex(c=>c.id===id);
      if (idx===-1) return prev;
      const current = prev[idx];
      const updated = { ...current, ...patch };
      if (updated.endSec <= updated.startSec) updated.endSec = updated.startSec + 0.001;
      const others = prev.filter((_,i)=>i!==idx);
      if (!noOverlap(updated, others)) return prev;
      if (patch.startSec != null && patch.startSec !== current.startSec) {
        const delta = updated.startSec - current.startSec;
        updated.markers = (current.markers||[]).map(m => ({
          ...m,
          startSec: m.startSec + delta,
          endSec: m.endSec != null ? m.endSec + delta : undefined
        }));
      }
      const copy = [...prev]; copy[idx]=updated; return copy;
    });
  }
  function deleteClip(id) { setClips(prev=> prev.filter(c=>c.id!==id)); if (selectedClipId===id) setSelectedClipId(null); if (selectedMarkerRef && selectedMarkerRef.clipId === id) setSelectedMarkerRef(null); }

  function addMarker(clipId, marker) { // marker may have startSec/endSec (preferred) or startBeat/endBeat
    setClips(prev=> prev.map(c=> c.id===clipId ? { ...c, markers: [...(c.markers||[]), normalizeMarker(marker, c)] } : c));
  }
  function updateMarker(clipId, markerId, patch) { setClips(prev=> prev.map(c=> { if (c.id!==clipId) return c; return { ...c, markers: (c.markers||[]).map(m=> m.id===markerId ? normalizeMarker({ ...m, ...patch }, c) : m) }; })); }
  function deleteMarker(clipId, markerId) { setClips(prev=> prev.map(c=> c.id===clipId ? { ...c, markers: (c.markers||[]).filter(m=> m.id!==markerId) } : c)); if (selectedMarkerRef && selectedMarkerRef.clipId===clipId && selectedMarkerRef.markerId===markerId) setSelectedMarkerRef(null); }

  // subtype management
  function addSubtype(name, type, color) {
    if (!name) return;
    setSubtypes(prev => ({ ...prev, [name]: color }));
    setSubtypeTypes(prev => ({ ...prev, [name]: type }));
  }
  function updateSubtype(name, patch) {
    if (!name) return;
    if (patch.color != null) setSubtypes(prev => ({ ...prev, [name]: patch.color }));
    if (patch.type) setSubtypeTypes(prev => ({ ...prev, [name]: patch.type }));
  }
  function deleteSubtype(name) {
    setSubtypes(prev => { const cp={...prev}; delete cp[name]; return cp; });
    setSubtypeTypes(prev => { const cp={...prev}; delete cp[name]; return cp; });
  }

  function clearAllClips() {
    setClips([]);
    setSelectedClipId(null);
    setSelectedMarkerRef(null);
  }

  function normalizeMarker(m, clip) {
    const out = { ...m };
    if (out.startSec == null && out.startBeat != null) out.startSec = clip.startSec + out.startBeat * SECS_PER_BEAT;
    if (out.endSec == null && out.endBeat != null) out.endSec = clip.startSec + out.endBeat * SECS_PER_BEAT;
    if (!out.id) out.id = uid('m');
    out.startBeat = Math.round((out.startSec - clip.startSec) / SECS_PER_BEAT);
    out.endBeat = out.endSec != null ? Math.round((out.endSec - clip.startSec) / SECS_PER_BEAT) : undefined;
    return out;
  }

  function noOverlapOnInsert(clip, all) { const track = all.filter(c=>c.track===clip.track); return noOverlap(clip, track); }
  function noOverlap(clip, others) { for (const o of others.filter(x=>x.track===clip.track)) { if (intervalsOverlap(clip.startSec, clip.endSec, o.startSec, o.endSec)) return false; } return true; }

  // export/import helpers (full state)
  function exportJSON(){ const state = { clips, subtypes, subtypeTypes, zoom }; const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); download(url, 'timeline_v3.json'); }
  function exportCSV(){
    const header = ['id','track','name','startSec','endSec','baseColor','remixType','camelot','genre','subgenre','energy'];
    const lines = clips.map(c=> [c.id,c.track, (c.name||'').replace(/,/g,';'), fmtSec2(c.startSec),(c.endSec||0).toFixed(2), c.baseColor||'', c.remixType||'', c.camelot||'', c.genre||'', c.subgenre||'', c.energy||''].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); download(url,'timeline.csv');
  }
  function download(url, filename){ const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  function importJSON(file){ const r=new FileReader(); r.onload=()=>{ try{ const data = JSON.parse(String(r.result)); if (data && Array.isArray(data.clips)) { setSubtypes(data.subtypes||initialSubtypes); setSubtypeTypes(data.subtypeTypes||initialSubtypeTypes); setClips(data.clips); } else if (Array.isArray(data)) { setClips(data); } }catch(e){ alert('Invalid JSON file'); console.error(e); } }; r.readAsText(file); }
  function importYTSetlist(file){
    const r = new FileReader();
    r.onload = () => {
      clearAllClips();
      const text = String(r.result||'');
      const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const newClips = [];
      for (const line of lines){
        const m = line.match(/^(\d+):(\d{2})\s+(.*)$/);
        if (!m) continue;
        const startSec = Number(m[1])*60 + Number(m[2]);
        const name = m[3];
        newClips.push({ id: uid('clip'), track:0, name, startSec, endSec:startSec+60, baseColor: subtypes['Liquid'] || '#3b82f6', remixType:'None', camelot:'', genre:'DnB', subgenre:'Liquid', energy:5, markers:[] });
      }
      newClips.sort((a,b)=> a.startSec - b.startSec);
      // adjust end times based on next start if not overlapping
      for (let i=0; i<newClips.length; i++){
        const next = newClips[i+1];
        if (next){
          const diff = next.startSec - newClips[i].startSec;
          if (diff >= 60) newClips[i].endSec = next.startSec;
        }
      }
      const trackEnds = [];
      let lastDeck = -1;
      for (const c of newClips){
        let t = 0;
        while(trackEnds[t] && trackEnds[t] > c.startSec) t++;
        if (t === lastDeck) {
          t++;
          while(trackEnds[t] && trackEnds[t] > c.startSec) t++;
        }
        c.track = t;
        trackEnds[t] = c.endSec;
        lastDeck = t;
      }
      setClips(newClips);
    };
    r.readAsText(file);
  }

  // YouTube / SoundCloud loader
  function loadYouTubeAPI(cb) {
    if (window.YT && window.YT.Player) return cb && cb();
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
    window.onYouTubeIframeAPIReady = () => cb && cb();
  }
  function loadSoundCloudAPI(cb) {
    if (window.SC && window.SC.Widget) return cb && cb();
    const s = document.createElement('script'); s.src = 'https://w.soundcloud.com/player/api.js'; s.onload = () => cb && cb(); document.head.appendChild(s);
  }

  // player management
  function attachPlayer(link) {
    // remove previous
    const el = document.getElementById('player-container'); if (!el) return; el.innerHTML = '';
    playerRef.current = null; playerTypeRef.current = null; playerReadyRef.current = false;
    setMediaDurationSec(0);
    if (!link) { setMediaInfo({ url: '', title: '' }); return; }
    setMediaInfo({ url: link, title: '' });
    if (/youtube.com|youtu.be/.test(link)) {
      playerTypeRef.current = 'youtube';
      loadYouTubeAPI(()=>{
        const id = uid('yt');
        const iframe = document.createElement('div'); iframe.id = id; el.appendChild(iframe);
        playerRef.current = new window.YT.Player(id, { height: '0', width: '0', videoId: extractYouTubeId(link), playerVars: { start: 0, controls: 1 }, events: { onReady: ()=> { playerReadyRef.current = true; try { const d = playerRef.current.getDuration?.() || 0; if (d) setMediaDurationSec(d); const t = playerRef.current.getVideoData?.().title; if (t) setMediaInfo(mi => ({ ...mi, title: t })); } catch {} }, onStateChange: onYTStateChange } });
      });
    } else if (/soundcloud.com/.test(link)) {
      playerTypeRef.current = 'soundcloud';
      loadSoundCloudAPI(()=>{
        const iframe = document.createElement('iframe');
        iframe.id = uid('sc');
        iframe.width='40';
        iframe.height='20';
        iframe.style.display='block';
        iframe.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(link) + '&color=%23ff5500';
        el.appendChild(iframe);
        const widget = window.SC.Widget(iframe);
        playerRef.current = widget;
        playerReadyRef.current = true;
        try { widget.getDuration?.((ms)=> setMediaDurationSec((ms||0)/1000)); } catch {}
        try { widget.getCurrentSound?.(sound => { if (sound && sound.title) setMediaInfo(mi => ({ ...mi, title: sound.title })); }); } catch {}
      });
    } else {
      alert('Unsupported link. Use YouTube or SoundCloud URL.');
    }
  }
  function extractYouTubeId(url) {
    try{ const u = new URL(url); if (u.hostname.includes('youtu.be')) return u.pathname.slice(1); if (u.searchParams.get('v')) return u.searchParams.get('v'); }catch{} return url;
  }

  function onYTStateChange(e) { /* no-op for now */ }

  useEffect(() => {
    if (mediaInfo.url) {
      const input = document.getElementById('media-url');
      if (input) input.value = mediaInfo.url;
      attachPlayer(mediaInfo.url);
    }
  }, []);

  // playback loop and sync
  useEffect(()=>{
    function tick(now) {
      if (!lastRAF.current) lastRAF.current = now;
      const dt = (now - lastRAF.current) / 1000; lastRAF.current = now;
      if (playing) {
        if (playerReadyRef.current && playerRef.current) {
          if (playerTypeRef.current === 'youtube' && playerRef.current.getCurrentTime) {
            const t = playerRef.current.getCurrentTime(); setPlayheadSec(t);
            try { const d = playerRef.current.getDuration?.() || 0; if (d && d !== mediaDurationSec) setMediaDurationSec(d); } catch {}
          } else if (playerTypeRef.current === 'soundcloud' && playerRef.current.getPosition) {
            playerRef.current.getPosition(pos => { setPlayheadSec(pos/1000); });
            playerRef.current.getDuration?.((ms)=> { const d=(ms||0)/1000; if (d && d !== mediaDurationSec) setMediaDurationSec(d); });
          } else {
            setPlayheadSec(s => s + dt);
          }
        } else {
          setPlayheadSec(s => s + dt);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return ()=> { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; lastRAF.current = null; };
  }, [playing, mediaDurationSec]);

  function playPauseToggle() {
    if (!playing) {
      if (playerReadyRef.current && playerRef.current) {
        if (playerTypeRef.current === 'youtube') { try { playerRef.current.seekTo(playheadSec, true); playerRef.current.playVideo(); } catch{} }
        else if (playerTypeRef.current === 'soundcloud') { try { playerRef.current.seekTo(playheadSec*1000); playerRef.current.play(); } catch{} }
      }
      setPlaying(true);
    } else {
      if (playerReadyRef.current && playerRef.current) {
        if (playerTypeRef.current === 'youtube') try { playerRef.current.pauseVideo(); } catch {}
        else if (playerTypeRef.current === 'soundcloud') try { playerRef.current.pause(); } catch {}
      }
      setPlaying(false);
    }
  }

  const playPauseRef = useRef(playPauseToggle);
  playPauseRef.current = playPauseToggle;
  const deleteRef = useRef(() => {});
  deleteRef.current = () => {
    if (selectedMarkerRef) deleteMarker(selectedMarkerRef.clipId, selectedMarkerRef.markerId);
    else if (selectedClipId) deleteClip(selectedClipId);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); playPauseRef.current(); }
      else if (e.key === 'Delete') { e.preventDefault(); deleteRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function seekTo(sec) {
    setPlayheadSec(sec);
    if (playerReadyRef.current && playerRef.current) {
      if (playerTypeRef.current === 'youtube') try { playerRef.current.seekTo(sec, true); } catch {}
      else if (playerTypeRef.current === 'soundcloud') try { playerRef.current.seekTo(sec*1000); } catch {}
    }
  }

  const energySeries = useMemo(()=> buildEnergySeries(clips, Math.ceil(maxEnd / SECS_PER_BEAT)), [clips, maxEnd]);
  const camelotSeries = useMemo(()=> buildCamelotSeries(clips, Math.ceil(maxEnd / SECS_PER_BEAT)), [clips, maxEnd]);

  const [hover, setHover] = useState(null);

  return (
    <div className="h-screen p-2 bg-slate-50 text-slate-900 flex flex-col overflow-hidden overscroll-none" onMouseDown={() => { setSelectedClipId(null); setSelectedMarkerRef(null); }}>
      <header className="flex items-center justify-between mb-1 flex-shrink-0 text-xs">
        <h1 className="text-lg font-bold">DnB Live Set Timeline (v3.2)</h1>
        <div className="flex gap-1 items-center">
          <input placeholder="YouTube or SoundCloud URL" id="media-url" className="px-1 py-0.5 border rounded text-xs" onBlur={(e)=> attachPlayer(e.target.value)} />
          <div id="player-container" style={{ width:150 }} />
          <button onClick={playPauseToggle} className="px-2 py-1 rounded bg-slate-900 text-white text-xs">{playing ? 'Pause' : 'Play'}</button>
          <button onClick={()=> seekTo(0)} className="px-2 py-1 rounded bg-white border text-xs">Reset</button>
          <button onClick={exportJSON} className="px-2 py-1 rounded bg-slate-900 text-white text-xs">Export JSON</button>
          <button onClick={exportCSV} className="px-2 py-1 rounded bg-slate-900 text-white text-xs">Export CSV</button>
          <label className="px-2 py-1 bg-white border rounded cursor-pointer text-xs">Import JSON<input type="file" accept="application/json" className="hidden" onChange={e=> { const f = e.target.files?.[0]; if (f) importJSON(f); }} /></label>
          <label className="px-2 py-1 bg-white border rounded cursor-pointer text-xs">Import Setlist<input type="file" accept="text/plain" className="hidden" onChange={e=> { const f=e.target.files?.[0]; if(f) importYTSetlist(f); }} /></label>
          <button onClick={clearAllClips} className="px-2 py-1 rounded bg-white border text-xs">Clear</button>
        </div>
        {mediaInfo.title && (
          <div className="text-[10px] text-right ml-2">
            <div className="font-semibold">{mediaInfo.title}</div>
            <div>{fmtTime(playheadSec)} / {fmtTime(Math.max(mediaDurationSec - playheadSec,0))} left</div>
          </div>
        )}
      </header>

      <div ref={timelineRef} className="bg-white rounded p-2 shadow overflow-x-auto overflow-y-hidden flex-1">
        {/* Big overall timeline integrated above the tracks */}
        <div style={{ width: timelineWidthPx }} className="mb-2">
          <BigTimelineHeader
            widthPx={timelineWidthPx}
            pxPerBeat={pxPerBeat}
            pxPerSec={pxPerSec}
            clips={clips}
            subtypes={subtypes}
            playheadSec={playheadSec}
            mediaDurationSec={mediaDurationSec}
            onSeek={(sec)=> seekTo(sec)}
          />

          <div id="timeline-tracks" style={{ position:'relative' }}>
            {/* Playhead line */}
            <div onMouseDown={(e)=> onPlayheadMouseDown(e, pxPerBeat, maxEnd, setPlayheadSec)} title={`Playhead: ${fmtTime(playheadSec)} (${fmtSec2(playheadSec)}s)`} style={{ position:'absolute', left: secToPx(playheadSec, pxPerBeat), top:0, bottom:0, width:2, background:'red', zIndex:120 }} />

            {Array.from({ length: 4 }).map((_, t) => (
              <TrackRow key={t} trackIndex={t} pxPerBeat={pxPerBeat} widthPx={timelineWidthPx} onAdd={() => addClip(t)}>
                {clips.filter(c => c.track === t).sort((a,b)=>a.startSec-b.startSec).map(clip => (
                  <ClipView key={clip.id}
                    clip={clip}
                    pxPerBeat={pxPerBeat}
                    pxPerSec={pxPerSec}
                    selected={selectedClipId === clip.id}
                    onSelect={() => setSelectedClipId(clip.id)}
                    onUpdate={(p)=> updateClip(clip.id,p)}
                    onAddMarker={(m)=> addMarker(clip.id,m)}
                    onUpdateMarker={(mid,p)=> updateMarker(clip.id, mid, p)}
                    onDeleteMarker={(mid)=> deleteMarker(clip.id, mid)}
                    onHover={setHover}
                    onClearHover={()=> setHover(null)}
                    onSelectMarker={(mid)=> setSelectedMarkerRef({clipId: clip.id, markerId: mid})} selectedMarkerRef={selectedMarkerRef} subtypeTypes={subtypeTypes} subtypes={subtypes}
                  />
                ))}
              </TrackRow>
            ))}
          </div>

          {/* Graph below deck 4 */}
          <div className="mt-2">
            <h3 className="text-sm font-semibold mb-2">Energy & Camelot</h3>
            <Plots energySeries={energySeries} camelotSeries={camelotSeries} pxPerSec={pxPerSec} seconds={maxEnd} onHover={setHover} />
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2 flex-shrink-0">
        <Legend subtypes={subtypes} subtypeTypes={subtypeTypes} onAddSubtype={addSubtype} onUpdateSubtype={updateSubtype} onDeleteSubtype={deleteSubtype} />
      </div>

      <Inspector
        clip={selectedClip}
        selectedMarkerRef={selectedMarkerRef}
        onChange={(p) => selectedClip && updateClip(selectedClip.id, p)}
        onDelete={() => selectedClip && deleteClip(selectedClip.id)}
        onAddMarker={(m) => selectedClip && addMarker(selectedClip.id, m)}
        onUpdateMarker={(cid, mid, p) => updateMarker(cid, mid, p)}
        onDeleteMarker={(cid, mid) => deleteMarker(cid, mid)}
        onSelectMarker={(cid, mid) => setSelectedMarkerRef({clipId: cid, markerId: mid})}
        subtypes={subtypes}
        subtypeTypes={subtypeTypes}
      />

      {hover && (
        <div className="fixed z-50 text-xs bg-slate-900 text-white px-2 py-1 rounded shadow" style={{ left: hover.x + 12, top: hover.y + 12 }} dangerouslySetInnerHTML={{ __html: hover.html }} />
      )}

    </div>
  );
}

function BigTimelineHeader({ widthPx, pxPerBeat, pxPerSec, clips, subtypes, onSeek, playheadSec=0, mediaDurationSec=0 }) {
  const totalSec = Math.ceil(widthPx / pxPerSec);

  // global markers rendering using seconds (m.startSec in markers)
  const globalMarkers = [];
  for (const c of clips) {
    for (const m of (c.markers||[])) {
      const absSec = m.startSec != null ? m.startSec : (c.startSec + (m.startBeat || 0) * SECS_PER_BEAT);
      const x = Math.round(secToPx(absSec, pxPerBeat));
      globalMarkers.push({ x, subtype: m.subtype, type: m.type, absSec });
    }
  }

  function onClick(e){ const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left; const sec = pxToSec(x, pxPerBeat); onSeek && onSeek(clamp(sec,0,totalSec)); }

  // build second grid with adaptive spacing when zoomed out
  const gridEls = [];
  const minLabelPx = 60; // minimum pixels between time labels
  let labelStep = 5;
  while (secToPx(labelStep, pxPerBeat) < minLabelPx) labelStep *= 2;
  const gridStep = Math.max(1, labelStep / 5);
  for (let s = 0; s <= totalSec; s += gridStep) {
    const x = Math.round(secToPx(s, pxPerBeat));
    const isLabel = Math.abs(s % labelStep) < 1e-6;
    gridEls.push(
      <div key={`g-${s}`} style={{ position:'absolute', left: x, top: 0, bottom: 0, width: 1, background: isLabel ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.06)' }} />
    );
    if (isLabel) {
      gridEls.push(
        <div key={`lbl-${s}`} className="text-[10px] text-slate-600" style={{ position:'absolute', left: x+2, top: 0 }}>{fmtTime(s)}</div>
      );
    }
  }

  // media timeline bar
  const mediaWidth = Math.max(0, Math.min(widthPx, Math.round((mediaDurationSec||0) * (pxPerBeat/SECS_PER_BEAT))));
  const playheadX = Math.round(secToPx(playheadSec, pxPerBeat));

  return (
    <div className="relative overflow-hidden border rounded bg-white p-1 mb-2" style={{ width: widthPx }} onClick={onClick}>
      <div className="relative h-12">
        {/* seconds grid */}
        {gridEls}
        {/* Global markers with mm:ss under each */}
        {globalMarkers.map((gm,i)=> (
          <div key={i} style={{ position:'absolute', left: gm.x - 6, top: 22 }} onMouseDown={(e)=> e.stopPropagation()}>
            <div style={{ width:12, height:12, borderRadius:3, background: subtypes[gm.subtype] || '#333', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            <div style={{ fontSize:10, color:'#444' }}>{fmtTime(gm.absSec)}</div>
          </div>
        ))}
      </div>
      {/* media duration bar */}
      <div className="relative" style={{ height: 8 }}>
        <div className="absolute left-0 top-1 h-2 bg-slate-200 rounded" style={{ width: mediaWidth }} />
        <div className="absolute top-0 bottom-0 w-[2px] bg-red-500" style={{ left: playheadX }} />
        <div className="absolute right-2 top-[-2px] text-[10px] text-slate-600">{mediaDurationSec ? `YT/SC: ${fmtTime(mediaDurationSec)} (${fmtSec2(mediaDurationSec)}s)` : ''}</div>
      </div>
    </div>
  );
}


function Legend({ subtypes, subtypeTypes, onAddSubtype, onUpdateSubtype, onDeleteSubtype }) {
  const [manage, setManage] = useState(false);
  const clipNames = Object.keys(subtypes).filter(k => subtypeTypes[k] === 'clip');
  const remixNames = Object.keys(subtypes).filter(k => subtypeTypes[k] === 'remix');
  const markerNames = Object.keys(subtypes).filter(k => subtypeTypes[k] === 'transition' || subtypeTypes[k] === 'effect');
  const markerItems = markerNames.map(n => ({ name: n, type: subtypeTypes[n] || 'transition' }));
  return (
    <div className="relative w-full border rounded p-2 text-xs" onMouseDown={(e)=> e.stopPropagation()}>
      <button className="absolute top-1 right-1 text-[10px] underline" onMouseDown={(e)=> e.stopPropagation()} onClick={()=> setManage(m=>!m)}>{manage? 'Close':'Manage'}</button>
      <div className="flex items-start w-full">
        <div className="pr-3">
          <div className="font-semibold">Clips (Subgenre)</div>
          <div className="flex gap-1 mt-1 flex-wrap">{clipNames.map(name => (
            <div key={name} className="flex items-center gap-1"><div style={{width:10,height:10,background: subtypes[name],borderRadius:2}}/><div className="text-[10px]">{name}</div></div>
          ))}</div>
        </div>
        <div className="px-3 border-l">
          <div className="font-semibold">Markers (Subtypes)</div>
          <div className="flex gap-2 flex-wrap items-center mt-1">
            {markerItems.map(({name,type}) => (
              <div key={name} className="flex items-center gap-1.5 border px-1.5 py-0.5 rounded">
                {type === 'effect'
                  ? <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: `10px solid ${subtypes[name]}` }} />
                  : <div style={{width:12,height:12,background: subtypes[name],borderRadius:2}} />}
                <div className="text-[10px]">{name}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="pl-3 border-l">
          <div className="font-semibold">Remix (Striped)</div>
          <div className="flex gap-1 mt-1 flex-wrap">{remixNames.map(name => (
            <div key={name} className="flex items-center gap-1"><div style={{width:10,height:10,background: subtypes[name] ? `repeating-linear-gradient(45deg, ${subtypes[name]}, ${subtypes[name]} 6px, #fff 6px, #fff 12px)` : '#fff', border:'1px solid #ddd', borderRadius:2}}/><div className="text-[10px]">{name}</div></div>
          ))}</div>
        </div>
      </div>
      {manage && (
        <SubtypeManager subtypes={subtypes} subtypeTypes={subtypeTypes} onAdd={onAddSubtype} onUpdate={onUpdateSubtype} onDelete={onDeleteSubtype} />
      )}
    </div>
  );
}


function SubtypeManager({ subtypes, subtypeTypes, onAdd, onUpdate, onDelete }) {
  const clipNames = Object.keys(subtypes).filter(k => subtypeTypes[k] === 'clip');
  const markerNames = Object.keys(subtypes).filter(k => subtypeTypes[k] === 'transition' || subtypeTypes[k] === 'effect');
  const remixNames = Object.keys(subtypes).filter(k => subtypeTypes[k] === 'remix');

  const [newClip, setNewClip] = useState({ name: '', color: '#000000' });
  const [newMarker, setNewMarker] = useState({ name: '', type: 'transition', color: '#000000' });
  const [newRemix, setNewRemix] = useState({ name: '', color: '#000000' });

  return (
    <div className="mt-2 border-t pt-2 grid grid-cols-3 gap-2 text-xs">
      {/* Clip subgenres */}
      <div className="pr-2">
        <div className="font-semibold mb-1">Clips</div>
        <div className="grid grid-cols-3 gap-1">
          {clipNames.map(name => (
            <div key={name} className="flex items-center gap-1 mb-1">
              <div className="w-20 truncate">{name}</div>
              <input type="color" className="h-5 w-8" value={subtypes[name]} onChange={e=> onUpdate(name,{ color:e.target.value })} />
              <button className="px-1 py-0.5 bg-rose-600 text-white rounded" onClick={()=> onDelete(name)}>x</button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <input className="flex-1 px-1 py-0.5 border rounded" placeholder="Name" value={newClip.name} onChange={e=> setNewClip({ ...newClip, name:e.target.value })} />
          <input type="color" className="h-5 w-8" value={newClip.color} onChange={e=> setNewClip({ ...newClip, color:e.target.value })} />
          <button className="px-1.5 py-0.5 bg-slate-900 text-white rounded" onClick={()=> { if(!newClip.name.trim()) return; onAdd(newClip.name.trim(),'clip',newClip.color); setNewClip({ name:'', color:'#000000' }); }}>Add</button>
        </div>
      </div>

      {/* Marker subtypes */}
      <div className="px-2 border-l">
        <div className="font-semibold mb-1">Markers</div>
        <div className="grid grid-cols-3 gap-1">
          {markerNames.map(name => (
            <div key={name} className="flex items-center gap-1 mb-1">
              <div className="w-20 truncate">{name}</div>
              <select className="px-1 py-0.5 border rounded" value={subtypeTypes[name]||'transition'} onChange={e=> onUpdate(name,{ type:e.target.value })}>
                <option value="transition">Transition</option>
                <option value="effect">Effect</option>
              </select>
              <input type="color" className="h-5 w-8" value={subtypes[name]} onChange={e=> onUpdate(name,{ color:e.target.value })} />
              <button className="px-1 py-0.5 bg-rose-600 text-white rounded" onClick={()=> onDelete(name)}>x</button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <input className="flex-1 px-1 py-0.5 border rounded" placeholder="Name" value={newMarker.name} onChange={e=> setNewMarker({ ...newMarker, name:e.target.value })} />
          <select className="px-1 py-0.5 border rounded" value={newMarker.type} onChange={e=> setNewMarker({ ...newMarker, type:e.target.value })}>
            <option value="transition">Transition</option>
            <option value="effect">Effect</option>
          </select>
          <input type="color" className="h-5 w-8" value={newMarker.color} onChange={e=> setNewMarker({ ...newMarker, color:e.target.value })} />
          <button className="px-1.5 py-0.5 bg-slate-900 text-white rounded" onClick={()=> { if(!newMarker.name.trim()) return; onAdd(newMarker.name.trim(), newMarker.type, newMarker.color); setNewMarker({ name:'', type:'transition', color:'#000000' }); }}>Add</button>
        </div>
      </div>

      {/* Remix types */}
      <div className="pl-2 border-l">
        <div className="font-semibold mb-1">Remix</div>
        <div className="grid grid-cols-3 gap-1">
          {remixNames.map(name => (
            <div key={name} className="flex items-center gap-1 mb-1">
              <div className="w-20 truncate">{name}</div>
              <input type="color" className="h-5 w-8" value={subtypes[name]} onChange={e=> onUpdate(name,{ color:e.target.value })} />
              <button className="px-1 py-0.5 bg-rose-600 text-white rounded" onClick={()=> onDelete(name)}>x</button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <input className="flex-1 px-1 py-0.5 border rounded" placeholder="Name" value={newRemix.name} onChange={e=> setNewRemix({ ...newRemix, name:e.target.value })} />
          <input type="color" className="h-5 w-8" value={newRemix.color} onChange={e=> setNewRemix({ ...newRemix, color:e.target.value })} />
          <button className="px-1.5 py-0.5 bg-slate-900 text-white rounded" onClick={()=> { if(!newRemix.name.trim()) return; onAdd(newRemix.name.trim(),'remix',newRemix.color); setNewRemix({ name:'', color:'#000000' }); }}>Add</button>
        </div>
      </div>
    </div>
  );
}

function TrackRow({ children, trackIndex, widthPx, pxPerBeat, onAdd }) {
  const rowRef = useRef(null);
  const [btnTop, setBtnTop] = useState(0);
  useEffect(() => {
    const update = () => {
      const rect = document.getElementById(`track-${trackIndex}`)?.getBoundingClientRect();
      if (rect) setBtnTop(rect.top + rect.height / 2);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [trackIndex]);
  return (
    <div className="mb-1" ref={rowRef}>
      <div className="flex items-center gap-2 mb-0.5">
        <div className="px-1.5 py-0.5 bg-slate-800 text-white rounded text-xs">Deck {trackIndex+1}</div>
      </div>
      <div id={`track-${trackIndex}`} className="relative h-20 rounded-lg border overflow-visible" style={{ width: widthPx }}>
        <GridBackground pxPerBeat={pxPerBeat} />
        {children}
      </div>
      <button
        className="fixed right-2 w-6 h-6 rounded-full bg-white border shadow flex items-center justify-center text-base"
        style={{ top: btnTop }}
        onClick={onAdd}
      >
        +
      </button>
    </div>
  );
}

function GridBackground({ pxPerBeat }) {
  let beatStep = 1;
  const minPx = 20;
  while (beatStep * pxPerBeat < minPx) beatStep *= 2;
  const step = pxPerBeat * beatStep;
  const phrase = step * BEATS_PER_PHRASE;
  const style = {
    backgroundImage: `repeating-linear-gradient(to right, rgba(0,0,0,0.04) 0, rgba(0,0,0,0.04) 1px, transparent 1px, transparent ${step}px), repeating-linear-gradient(to right, transparent 0, transparent ${phrase - 2}px, rgba(0,0,0,0.12) ${phrase - 2}px, rgba(0,0,0,0.12) ${phrase}px)`
  };
  return <div className="absolute inset-0" style={style} />;
}

function ClipView({ clip, pxPerBeat, pxPerSec, selected, onSelect, onUpdate, onAddMarker, onUpdateMarker, onDeleteMarker, onHover, onClearHover, onSelectMarker, selectedMarkerRef, subtypeTypes, subtypes }) {
  const left = secToPx(clip.startSec, pxPerBeat);
  const width = Math.max(4, secToPx(clip.endSec - clip.startSec, pxPerBeat));
  const baseColor = subtypes[clip.subgenre] || clip.baseColor;
  const stripe = subtypes[clip.remixType] || '';
  const bg = stripe ? `repeating-linear-gradient(45deg, ${baseColor}, ${baseColor} 12px, ${stripe} 12px, ${stripe} 24px)` : baseColor;

  function startDrag(e) { e.stopPropagation(); e.preventDefault(); onSelect(); const trackEl = document.getElementById(`track-${clip.track}`); if (!trackEl) return; const rect = trackEl.getBoundingClientRect(); const grab = e.clientX - rect.left - left; const onMove = (ev) => { if (ev.buttons !== 1) return cleanup(); const x = ev.clientX - rect.left - grab; const newStart = clamp(pxToSec(x, pxPerBeat), 0, rect.width); const dur = clip.endSec - clip.startSec; onUpdate({ startSec: newStart, endSec: newStart + dur }); }; const cleanup = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', cleanup); document.body.style.userSelect=''; }; document.body.style.userSelect='none'; window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', cleanup); }

  function resizeEdge(e, which) { e.stopPropagation(); e.preventDefault(); const trackEl = document.getElementById(`track-${clip.track}`); if (!trackEl) return; const rect = trackEl.getBoundingClientRect(); const onMove = (ev) => { if (ev.buttons !== 1) return cleanup(); const x = ev.clientX - rect.left; const sec = pxToSec(x, pxPerBeat); if (which === 'left') { const newStart = clamp(sec, 0, clip.endSec - 0.1); onUpdate({ startSec: newStart }); } else { const newEnd = clamp(sec, clip.startSec + 0.1, 99999); onUpdate({ endSec: newEnd }); } }; const cleanup = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', cleanup); document.body.style.userSelect=''; }; document.body.style.userSelect='none'; window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', cleanup); }

  function markerWidthPx(m) { const dur = m.endSec != null ? (m.endSec - m.startSec) : 0; return m.endSec != null ? Math.max(6, secToPx(dur, pxPerBeat)) : 4; }

  function startDragMarker(e, m, mode) {
    e.stopPropagation(); e.preventDefault(); const startX = e.clientX; const startStartSec = m.startSec != null ? m.startSec : (clip.startSec); const startEndSec = m.endSec != null ? m.endSec : startStartSec; const onMove = (ev) => { if (ev.buttons !== 1) return cleanup(); const dxPx = ev.clientX - startX; const dxSec = pxToSec(dxPx, pxPerBeat); if (mode === 'body') { let ns = startStartSec + dxSec; let ne = startEndSec + dxSec; ns = clamp(ns, clip.startSec, clip.endSec); ne = clamp(ne, ns, clip.endSec); onUpdateMarker(m.id, { startSec: ns, endSec: m.endSec != null ? ne : undefined }); } else if (mode === 'left') { let ns = startStartSec + dxSec; ns = clamp(ns, clip.startSec, m.endSec != null ? m.endSec : startEndSec); onUpdateMarker(m.id, { startSec: ns }); } else if (mode === 'right') { let ne = startEndSec + dxSec; ne = clamp(ne, m.startSec != null ? m.startSec : clip.startSec, clip.endSec); onUpdateMarker(m.id, { endSec: ne }); } }; const cleanup = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', cleanup); document.body.style.userSelect=''; }; document.body.style.userSelect='none'; window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', cleanup); }

  function insertMarkerAtClick(e) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const secRel = Math.max(0, pxToSec(x, pxPerBeat));
    const defaultSubtype = Object.keys(subtypes).find(k => subtypeTypes[k] === 'transition') || Object.keys(subtypes)[0] || null;
    const m = { id: uid('m'), type: 'transition', subtype: defaultSubtype, label: '', details: '', startSec: clip.startSec + secRel };
    onAddMarker(m);
  }

  function showClipHover(e) { const html = '<div><b>' + escapeHtml(clip.name) + '</b></div>' + '<div>' + escapeHtml(clip.genre||'') + (clip.subgenre ? ' / ' + escapeHtml(clip.subgenre) : '') + '</div>' + (clip.energy ? ('<div>Energy: ' + escapeHtml(String(clip.energy)) + '</div>') : '') + (clip.remixType && clip.remixType !== 'None' ? ('<div>Remix: ' + escapeHtml(clip.remixType) + '</div>') : ''); onHover({ x: e.clientX, y: e.clientY, html }); }

  function showMarkerHover(e, m) { const typ = m.type === 'transition' ? 'Transition' : 'Effect'; const detailsHtml = m.details ? ('<div style="max-width:260px;white-space:normal">' + escapeHtml(m.details) + '</div>') : ''; const sr = (m.startSec ?? clip.startSec) - clip.startSec; const er = m.endSec != null ? (m.endSec - clip.startSec) : null; const html = '<div><b>' + typ + (m.label ? ': ' + escapeHtml(m.label) : '') + '</b></div>' + detailsHtml + `<div>Start: ${fmtSec2(sr)}s (${fmtTime(m.startSec ?? clip.startSec)})` + (er != null ? `, End: ${fmtSec2(er)}s (${fmtTime(m.endSec)})` : '') + '</div>'; onHover({ x: e.clientX, y: e.clientY, html }); }

  return (
    <div className={"absolute rounded-xl border shadow-inner select-none" + (selected ? " ring-2 ring-sky-500" : "")} style={{ left, width, background: bg, cursor: 'grab', top: '10%', height: '80%' }} onMouseDown={startDrag} onMouseEnter={showClipHover} onMouseLeave={() => onClearHover()} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <div className="absolute top-0 left-0 right-0 h-3 bg-black/10 hover:bg-black/20 cursor-crosshair" onClick={insertMarkerAtClick} title="Click to add a marker here" />

      <div className="px-3 py-2 text-white" style={{ color: '#fff' }}>
        <div className="flex items-center justify-between text-sm font-semibold"><span className="truncate mr-2">{clip.name}</span>{clip.camelot && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: CAMELOT_COLORS[clip.camelot] || 'rgba(0,0,0,0.3)', color:'#fff' }}>{clip.camelot}</span>}</div>
        <div className="text-[11px] opacity-90">{fmtTime(clip.startSec)} – {fmtTime(clip.endSec)} ({fmtSec2(clip.endSec-clip.startSec)}s)</div>
      </div>

      <div className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" onMouseDown={(e) => resizeEdge(e, 'left')} />
      <div className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" onMouseDown={(e) => resizeEdge(e, 'right')} />

      {(clip.markers||[]).map(m => {
        const relLeft = (m.startSec ?? clip.startSec) - clip.startSec;
        const l = Math.round(secToPx(relLeft, pxPerBeat));
        const w = markerWidthPx(m);
        const color = (m.subtype && subtypes[m.subtype]) || m.color || (MARKER_TYPE_COLORS[m.type] || '#000');
        const shape = SHAPE_BY_TYPE[m.type] || 'square';
        const isSel = selectedMarkerRef && selectedMarkerRef.clipId === clip.id && selectedMarkerRef.markerId === m.id;
        if (m.endSec == null) {
          return (
            <div key={m.id} style={{ position: 'absolute', left: l, top: 0, height: '100%', width: ICON_SIZE, zIndex: 70 }}>
              <div style={{ position: 'absolute', left: ICON_SIZE/2 - 2, top: '8%', height: '84%', width: 4, background: color, borderRadius: 2, boxShadow: '0 1px 6px rgba(0,0,0,0.3)', zIndex: 60, opacity: 1 }} onMouseEnter={(e)=> showMarkerHover(e,m)} onMouseLeave={() => onClearHover()} onMouseDown={(e)=> { e.stopPropagation(); onSelectMarker(m.id); startDragMarker(e, m, 'body'); }} />
              <div style={{ position: 'absolute', left: ICON_SIZE/2 - ICON_SIZE/2, top: -ICON_SIZE-6, width: ICON_SIZE, height: ICON_SIZE, zIndex: 65, display:'flex', alignItems:'center', justifyContent:'center' }} onMouseDown={(e)=> { e.stopPropagation(); onSelectMarker(m.id); startDragMarker(e, m, 'body'); }} onMouseEnter={(e)=> showMarkerHover(e,m)} onMouseLeave={() => onClearHover()} title={m.label || m.type}>
                {shape === 'square' && <div style={{ width:ICON_SIZE-6, height:ICON_SIZE-6, background: color, boxShadow: isSel ? '0 0 0 4px rgba(0,0,0,0.12)' : undefined }} />}
                {shape === 'triangle' && <div style={{ width:0, height:0, borderLeft: `${ICON_SIZE/2}px solid transparent`, borderRight: `${ICON_SIZE/2}px solid transparent`, borderBottom: `${ICON_SIZE}px solid ${color}`, transform:'translateY(2px)' }} />}
              </div>
            </div>
          );
        }
        return (
          <div key={m.id} style={{ position:'absolute', left: l, top: '8%', height: '80%', width: w, background: color, opacity: 0.78, borderRadius: 8, zIndex: 50 }} onMouseEnter={(e)=> showMarkerHover(e,m)} onMouseLeave={() => onClearHover()} onMouseDown={(e)=> { e.stopPropagation(); onSelectMarker(m.id); startDragMarker(e, m, 'body'); }}>
            <div style={{ position:'absolute', left: -6, top: '50%', width:10, height:28, background:'rgba(255,255,255,0.92)', border:'1px solid #ddd', transform:'translateY(-50%)', cursor:'ew-resize' }} onMouseDown={(e)=> startDragMarker(e,m,'left')} />
            <div style={{ position:'absolute', right: -6, top: '50%', width:10, height:28, background:'rgba(255,255,255,0.92)', border:'1px solid #ddd', transform:'translateY(-50%)', cursor:'ew-resize' }} onMouseDown={(e)=> startDragMarker(e,m,'right')} />
          </div>
        );
      })}
    </div>
  );
}

function Inspector({ clip, selectedMarkerRef, onChange, onDelete, onAddMarker, onUpdateMarker, onDeleteMarker, onSelectMarker, subtypes, subtypeTypes }) {
  const defaultSub = Object.keys(subtypes).find(k=> subtypeTypes[k] === 'transition') || Object.keys(subtypes)[0] || '';
  const [draft, setDraft] = useState({ type: 'transition', subtype: defaultSub, label: '', details: '', startSec: 0, endSec: undefined });

  useEffect(()=>{ if (!clip) return; const def = Object.keys(subtypes).find(k=> subtypeTypes[k] === 'transition') || Object.keys(subtypes)[0] || ''; setDraft({ type: 'transition', subtype: def, label: '', details: '', startSec: clip.startSec, endSec: undefined }); }, [clip && clip.id, subtypes, subtypeTypes]);

  useEffect(()=>{
    if (!clip || !selectedMarkerRef) return; if (selectedMarkerRef.clipId !== clip.id) return; const m = (clip.markers||[]).find(x=> x.id === selectedMarkerRef.markerId); if (m) setDraft({ type: m.type || 'transition', subtype: m.subtype || (Object.keys(subtypes)[0]||''), label: m.label || '', details: m.details || '', startSec: m.startSec != null ? m.startSec : clip.startSec, endSec: m.endSec }); else setDraft(d=> ({ ...d, details:'' }));
  }, [selectedMarkerRef, clip, subtypes]);

  if (!clip) return null;

  function updateField(field, value) { setDraft(d=> ({ ...d, [field]: value })); if (selectedMarkerRef) { const patch = { [field]: value }; if (field === 'startSec' || field === 'endSec') { patch[field] = value === '' || value == null ? undefined : Number(value); } onUpdateMarker(selectedMarkerRef.clipId, selectedMarkerRef.markerId, patch); } }

  return (
    <div className="mt-2 p-2 bg-white rounded shadow grid grid-cols-2 gap-4 text-xs" onMouseDown={(e)=> e.stopPropagation()}>
      <div>
        <div className="text-sm font-semibold mb-1">Clip Inspector</div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 col-span-2"><span className="w-24">Name</span><input className="flex-1 px-1 py-0.5 border rounded" value={clip.name} onChange={(e)=> onChange({ name: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24">Deck</span><select className="flex-1 px-1 py-0.5 border rounded" value={clip.track} onChange={(e)=> onChange({ track: Number(e.target.value) })}>{Array.from({length:4}).map((_,i)=><option key={i} value={i}>Deck {i+1}</option>)}</select></label>
          <label className="flex items-center gap-2"><span className="w-24">Camelot</span><input className="flex-1 px-1 py-0.5 border rounded" value={clip.camelot||''} onChange={(e)=> onChange({ camelot: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24">Subgenre</span><select className="flex-1 px-1 py-0.5 border rounded" value={clip.subgenre||''} onChange={(e)=> onChange({ subgenre: e.target.value })}><option value="">(custom)</option>{Object.keys(subtypes).filter(k=> subtypeTypes[k]==='clip').map(k=> <option key={k} value={k}>{k}</option>)}</select></label>
          <label className="flex items-center gap-2"><span className="w-24">Remix</span><select className="flex-1 px-1 py-0.5 border rounded" value={clip.remixType} onChange={(e)=> onChange({ remixType: e.target.value })}>{Object.keys(subtypes).filter(k=> subtypeTypes[k]==='remix').map(k => <option key={k} value={k}>{k}</option>)}</select></label>
          <label className="flex items-center gap-2"><span className="w-24">Energy</span><input type="number" className="flex-1 px-1 py-0.5 border rounded" value={clip.energy||5} onChange={(e)=> onChange({ energy: Math.max(1, Math.min(10, Math.round(Number(e.target.value)))) })} /></label>
        </div>
        <div className="mt-2"><button className="px-2 py-1 bg-rose-600 text-white rounded" onClick={()=> onDelete()}>Delete Clip</button></div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-1">Markers (seconds)</div>
        <MarkerEditor
          clip={clip}
          selectedMarkerRef={selectedMarkerRef}
          onAddMarker={onAddMarker}
          onUpdateMarker={onUpdateMarker}
          onDeleteMarker={onDeleteMarker}
          onSelectMarker={onSelectMarker}
          subtypes={subtypes}
          subtypeTypes={subtypeTypes}
        />
      </div>
    </div>
  );
}

function MarkerEditor({ clip, selectedMarkerRef, onAddMarker, onUpdateMarker, onDeleteMarker, onSelectMarker, subtypes, subtypeTypes }) {
  const defaultSub = Object.keys(subtypes).find(k=> subtypeTypes[k] === 'transition') || Object.keys(subtypes)[0] || '';
  const [draft, setDraft] = useState({ type: 'transition', subtype: defaultSub, label: '', details: '', startSec: clip.startSec, endSec: undefined });

  useEffect(()=>{ if (!clip) return; const def = Object.keys(subtypes).find(k=> subtypeTypes[k] === 'transition') || Object.keys(subtypes)[0] || ''; setDraft({ type: 'transition', subtype: def, label: '', details: '', startSec: clip.startSec, endSec: undefined }); }, [clip && clip.id, subtypes, subtypeTypes]);

  useEffect(()=>{
    if (!clip || !selectedMarkerRef) return; if (selectedMarkerRef.clipId !== clip.id) return; const m = (clip.markers||[]).find(x=> x.id === selectedMarkerRef.markerId); if (m) setDraft({ type: m.type || 'transition', subtype: m.subtype || (Object.keys(subtypes)[0]||''), label: m.label || '', details: m.details || '', startSec: m.startSec ?? clip.startSec, endSec: m.endSec });
  }, [selectedMarkerRef, clip, subtypes]);

  function updateField(field, value) { setDraft(d=> ({ ...d, [field]: value })); if (selectedMarkerRef) { const patch = { [field]: value }; if (field === 'startSec' || field === 'endSec') { patch[field] = value === '' || value == null ? undefined : Number(value); } onUpdateMarker(selectedMarkerRef.clipId, selectedMarkerRef.markerId, patch); } }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="col-span-2 grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2"><span className="w-20">Type</span>
          <select className="flex-1 px-2 py-1 border rounded" value={draft.type} onChange={(e)=> updateField('type', e.target.value)}>
            <option value="transition">Transition</option>
            <option value="effect">Effect</option>
          </select>
        </label>
        <label className="flex items-center gap-2"><span className="w-20">Subtype</span>
          <select className="flex-1 px-2 py-1 border rounded" value={draft.subtype} onChange={(e)=> updateField('subtype', e.target.value)}>
            {Object.keys(subtypes).filter(k => subtypeTypes[k] === draft.type).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="col-span-2 flex items-center gap-2"><span className="w-20">Label</span><input className="flex-1 px-2 py-1 border rounded" value={draft.label} onChange={(e)=> updateField('label', e.target.value)} /></label>
        <label className="col-span-2 flex items-center gap-2"><span className="w-20">Details</span><textarea rows={3} className="flex-1 px-2 py-1 border rounded" value={draft.details} onChange={(e)=> updateField('details', e.target.value)} /></label>
      </div>
      <div className="h-32 overflow-y-auto pr-1 border-l pl-2">
        <div className="font-semibold text-sm mb-1">Existing</div>
        {(clip.markers||[]).map(m => (
          <div key={m.id} className="flex items-center gap-1 text-sm mb-1">
            <div style={{width:12,height:12,background: (m.subtype && subtypes[m.subtype]) || m.color || (MARKER_TYPE_COLORS[m.type]||'#000'), borderRadius:3}} />
            <button className="text-left flex-1" onClick={()=> onSelectMarker(clip.id, m.id)}>
              <div className="truncate w-32" title={m.label}>{m.label || '(no label)'}</div>
              <div className="text-xs text-slate-600 truncate" title={m.details}>{m.details || ''}</div>
            </button>
            <div className="w-16 text-right">{m.startSec!=null?`${fmtSec2(m.startSec)}s`:''}</div>
            <div className="w-16 text-right">{m.endSec!=null?`${fmtSec2(m.endSec)}s`:''}</div>
            <button className="px-1.5 py-0.5 bg-white border rounded text-xs" onClick={()=> onUpdateMarker(clip.id, m.id, m.endSec!=null ? { endSec: undefined, endBeat: undefined } : { endSec: m.startSec + SECS_PER_BEAT * BEATS_PER_PHRASE })}>{m.endSec!=null ? 'Point' : 'Interval'}</button>
            <button className="px-1.5 py-0.5 bg-rose-600 text-white rounded text-xs" onClick={()=> onDeleteMarker(clip.id, m.id)}>Del</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Plots({ energySeries, camelotSeries, pxPerSec, seconds, onHover }) {
  const width = Math.ceil(seconds * pxPerSec);
  const height = 100;
  const energyPath = seriesToPath(energySeries, width, height, 0);
  const camelotPath = seriesToPath((camelotSeries||[]).map(v=>v||0), width, height, 0);
  const gradId = useMemo(() => uid('camGrad'), []);
  const stops = (camelotSeries||[]).map((v,i) => {
    const label = VALUE_TO_CAMELOT[v];
    const color = CAMELOT_COLORS[label] || '#0ea5e9';
    const offset = (i / ((camelotSeries.length - 1) || 1)) * 100;
    return <stop key={i} offset={`${offset}%`} stopColor={color} />;
  });

  function onMove(e){
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const ratio = rect.width > 0 ? x / rect.width : 0;
    const idx = Math.round(ratio * (energySeries.length - 1));
    const tSec = idx * SECS_PER_BEAT;
    const energy = energySeries[idx] ?? 0;
    const cam = camelotSeries[idx] ?? 0;
    const html = `<div><b>${fmtTime(tSec)} (${fmtSec2(tSec)}s)</b></div><div>Energy: ${energy}</div><div>Camelot: ${cam}</div>`;
    onHover?.({ x: e.clientX, y: e.clientY, html });
  }
  function onLeave(){ onHover?.(null); }

  return (
    <div style={{ width, position:'relative' }} onMouseMove={onMove} onMouseLeave={onLeave}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id={gradId} x1="0" x2="100%" y1="0" y2="0">{stops}</linearGradient>
        </defs>
        <path d={energyPath} fill="none" strokeWidth={2} stroke="#059669" strokeLinecap="round" strokeLinejoin="round" />
        <path d={camelotPath} fill="none" strokeWidth={2} stroke={`url(#${gradId})`} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function buildEnergySeries(clips, samples) { const out = new Array(Math.max(1, samples)).fill(0); for (let i=0;i<out.length;i++) { const t = i * SECS_PER_BEAT; const active = clips.filter(c => c.startSec <= t && t < c.endSec); if (active.length === 0) { out[i]=0; continue; } const maxEnergy = Math.max(...active.map(a=>a.energy||0)); out[i] = maxEnergy + (active.length-1); } return out; }
function buildCamelotSeries(clips, samples) { const out = new Array(Math.max(1, samples)).fill(0); for (let i=0;i<out.length;i++) { const t = i * SECS_PER_BEAT; const active = clips.filter(c => c.startSec <= t && t < c.endSec); if (active.length === 0) { out[i]=0; continue; } active.sort((a,b)=> (b.energy||0)-(a.energy||0)); out[i] = camelotToValue(active[0].camelot||''); } return out; }
function escapeHtml(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

function onPlayheadMouseDown(e, pxPerBeat, maxEnd, setPlayheadSec) {
  e.stopPropagation();
  const container = document.getElementById('timeline-tracks');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const onMove = (ev) => {
    const x = ev.clientX - rect.left;
    const sec = pxToSec(x, pxPerBeat);
    setPlayheadSec(clamp(sec, 0, maxEnd));
  };
  const cleanup = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', cleanup);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', cleanup);
}

// ----------------------------
// Tiny dev-time sanity tests
// ----------------------------
if (typeof window !== 'undefined' && !window.__DNB_TL_TESTED__) {
  window.__DNB_TL_TESTED__ = true;
  try {
    console.assert(fmtSec2(1.234) === '1.23', 'fmtSec2 rounds down');
    console.assert(fmtSec2(1.235) === '1.24', 'fmtSec2 rounds up');
    console.assert(fmtTime(65) === '1:05', 'fmtTime mm:ss');
    console.assert(pxToSec(secToPx(12.34, 28), 28) > 12 && pxToSec(secToPx(12.34, 28), 28) < 12.7, 'px<->sec roughly invert');
    console.assert(escapeHtml('<a>"\' + "'" + '&') === '&lt;a&gt;&quot;&#39;&amp;', 'escapeHtml mapping');
  } catch (e) {
    console.warn('Sanity tests failed', e);
  }
}
