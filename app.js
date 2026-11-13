(function () {
  'use strict';

  const DB_NAME = 'cifra_facil_db';
  const DB_VERSION = 1;
  const SONGS_STORE = 'songs';
  const PREFS_STORE = 'prefs';
  const LS_SONGS_KEY = 'cifra_facil_songs_v1';
  const LS_PREFS_KEY = 'cifra_facil_prefs_v1';
  const LS_SEEDED_KEY = 'cifra_facil_seeded_v1';

  const DEFAULT_PREFS = {
    fontSizePx: 18,
    autoScrollSpeed: 1.0,
    voiceSensitivity: 0.6,
    voiceScrollSpeed: 1.2
  };

  // --- LOCAL PERSISTENCE (IndexedDB + localStorage fallback) ---
  const LocalStore = {
    dbPromise: null,
    openDB() {
      if (!('indexedDB' in window)) return Promise.resolve(null);
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(SONGS_STORE)) {
              db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(PREFS_STORE)) {
              db.createObjectStore(PREFS_STORE, { keyPath: 'key' });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
      return this.dbPromise;
    },

    async getAllSongs() {
      const db = await this.openDB();
      if (db) {
        try {
          return await new Promise((resolve, reject) => {
            const tx = db.transaction(SONGS_STORE, 'readonly');
            const req = tx.objectStore(SONGS_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
          });
        } catch { /* fallback below */ }
      }
      try {
        return JSON.parse(localStorage.getItem(LS_SONGS_KEY) || '[]');
      } catch {
        return [];
      }
    },

    async saveSongsBulk(songs) {
      const existing = await this.getAllSongs();
      const byId = new Map(existing.map((s) => [s.id, s]));
      for (const s of songs) byId.set(s.id, s);
      const merged = Array.from(byId.values());
      try {
        localStorage.setItem(LS_SONGS_KEY, JSON.stringify(merged));
      } catch { /* ignore quota */ }
      const db = await this.openDB();
      if (db) {
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(SONGS_STORE, 'readwrite');
            const store = tx.objectStore(SONGS_STORE);
            for (const s of songs) store.put(s);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        } catch { /* fallback saved */ }
      }
    },

    async putSong(song) {
      const all = await this.getAllSongs();
      const next = all.filter((s) => s.id !== song.id);
      next.push(song);
      try {
        localStorage.setItem(LS_SONGS_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      const db = await this.openDB();
      if (db) {
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(SONGS_STORE, 'readwrite');
            tx.objectStore(SONGS_STORE).put(song);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        } catch { /* fallback saved */ }
      }
    },

    async deleteSong(id) {
      const all = (await this.getAllSongs()).filter((s) => s.id !== id);
      try {
        localStorage.setItem(LS_SONGS_KEY, JSON.stringify(all));
      } catch { /* ignore */ }
      const db = await this.openDB();
      if (db) {
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(SONGS_STORE, 'readwrite');
            tx.objectStore(SONGS_STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        } catch { /* fallback saved */ }
      }
    },

    async getPrefs() {
      const db = await this.openDB();
      if (db) {
        try {
          const rec = await new Promise((resolve) => {
            const tx = db.transaction(PREFS_STORE, 'readonly');
            const req = tx.objectStore(PREFS_STORE).get('stage_prefs');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          });
          if (rec && rec.value) return { ...DEFAULT_PREFS, ...rec.value };
        } catch { /* fallback */ }
      }
      try {
        const raw = JSON.parse(localStorage.getItem(LS_PREFS_KEY) || '{}');
        return { ...DEFAULT_PREFS, ...raw };
      } catch {
        return { ...DEFAULT_PREFS };
      }
    },

    async savePrefs(prefs) {
      try {
        localStorage.setItem(LS_PREFS_KEY, JSON.stringify(prefs));
      } catch { /* ignore */ }
      const db = await this.openDB();
      if (db) {
        try {
          await new Promise((resolve) => {
            const tx = db.transaction(PREFS_STORE, 'readwrite');
            tx.objectStore(PREFS_STORE).put({ key: 'stage_prefs', value: prefs });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          });
        } catch { /* ignore */ }
      }
    }
  };

  // --- STATE ---
  const state = {
    songs: [],
    prefs: { ...DEFAULT_PREFS },
    searchQuery: '',
    filter: 'all',
    keyFilter: null,
    editingId: null,
    previewTranspose: 0,
    activeSongId: null,
    parsedStageLines: [],
    isFullScreen: false,
    isAutoScrolling: false,
    autoScrollRaf: null,
    teleprompterRaf: null,
    activeLineIndex: -1,
    voiceStatus: 'idle', // idle | listening | paused | unavailable | error
    voiceSnippet: '',
    voiceErrorMsg: '',
    showVoiceSettings: false,
    recognition: null,
    shouldListen: false,
    pendingDeleteId: null,
    deferredInstallPrompt: null,
    wakeLock: null
  };

  // --- DOM HELPERS ---
  const $ = (id) => document.getElementById(id);

  function showToast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function switchView(viewId) {
    for (const v of document.querySelectorAll('.view')) {
      v.classList.toggle('active', v.id === viewId);
    }
  }

  function updateNetworkBadge() {
    const badge = $('offline-badge');
    if (navigator.onLine) {
      badge.textContent = 'Offline pronto';
      badge.className = 'badge badge-emerald';
    } else {
      badge.textContent = 'Modo Offline ativo';
      badge.className = 'badge badge-emerald';
    }
  }

  // --- CHORD RENDERER ---
  function renderChordSheet(container, lines, fontSizePx, highlightedIdx = -1) {
    container.innerHTML = '';
    container.style.fontSize = `${fontSizePx}px`;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const wrapper = document.createElement('div');
      wrapper.className = 'song-line' + (idx === highlightedIdx ? ' highlighted' : '');
      wrapper.dataset.lineIdx = String(idx);

      if (line.type === 'section') {
        const pill = document.createElement('span');
        pill.className = 'section-pill';
        pill.textContent = line.title;
        wrapper.appendChild(pill);
      } else if (line.type === 'pair') {
        const row = document.createElement('div');
        row.className = 'chord-pair-row';
        const segments = window.ChordEngine.splitAlignedSegments(line.chordsLine, line.lyricsLine);
        for (const seg of segments) {
          const col = document.createElement('span');
          col.className = 'chord-seg';
          const cSpan = document.createElement('span');
          cSpan.className = 'chord-text';
          cSpan.textContent = seg.chords || ' ';
          const lSpan = document.createElement('span');
          lSpan.className = 'lyric-text';
          lSpan.textContent = seg.lyrics || ' ';
          col.appendChild(cSpan);
          col.appendChild(lSpan);
          row.appendChild(col);
        }
        wrapper.appendChild(row);
      } else if (line.type === 'chords') {
        const row = document.createElement('div');
        row.className = 'chords-only-row';
        const tokens = line.chordsLine.trim().split(/\s+/).filter(Boolean);
        for (const tok of tokens) {
          const chip = document.createElement('span');
          chip.className = 'chord-chip';
          chip.textContent = tok;
          row.appendChild(chip);
        }
        wrapper.appendChild(row);
      } else if (line.type === 'lyrics') {
        const p = document.createElement('div');
        p.className = 'lyrics-only-line';
        p.textContent = line.lyricsLine;
        wrapper.appendChild(p);
      } else {
        const spacer = document.createElement('div');
        spacer.className = 'blank-line';
        wrapper.appendChild(spacer);
      }

      container.appendChild(wrapper);
    }
  }

  // --- HOME RENDERING ---
  function renderHome() {
    const sorted = [...state.songs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const favCount = sorted.filter((s) => s.isFavorite).length;
    $('song-count-badge').textContent = `${sorted.length} cifras`;
    $('hero-subtitle').textContent = `${sorted.length} músicas salvas • ${favCount} favoritas • 100% local`;
    $('fav-count').textContent = String(favCount);

    // Recent songs
    const recent = sorted
      .filter((s) => (s.lastOpenedAt || 0) > 0)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 5);

    const recentSec = $('recent-section');
    const recentList = $('recent-list');
    if (recent.length > 0 && state.filter === 'all' && !state.searchQuery.trim()) {
      recentSec.classList.remove('hidden');
      recentList.innerHTML = '';
      for (const song of recent) {
        const key = window.ChordEngine.transposeKey(song.originalKey, song.transposeSteps || 0);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'recent-card';
        card.innerHTML = `
          <div class="recent-card-top">
            <span class="key-pill">${escapeHtml(key)}</span>
            <span class="gold-text">▶</span>
          </div>
          <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(song.title)}</strong>
          <span style="color:var(--text-secondary);font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(song.artist || 'Sem artista')}</span>
        `;
        card.addEventListener('click', () => openStage(song.id));
        recentList.appendChild(card);
      }
    } else {
      recentSec.classList.add('hidden');
    }

    // Available keys subchips
    const keys = [...new Set(sorted.map((s) => window.ChordEngine.transposeKey(s.originalKey, s.transposeSteps || 0)))].sort();
    const keySub = $('key-subchips');
    if (state.filter === 'key' && keys.length > 0) {
      keySub.classList.remove('hidden');
      keySub.innerHTML = '';
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'chip' + (state.keyFilter === null ? ' active' : '');
      allBtn.textContent = 'Todos os tons';
      allBtn.addEventListener('click', () => { state.keyFilter = null; renderHome(); });
      keySub.appendChild(allBtn);

      for (const k of keys) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip chip-mono' + (state.keyFilter === k ? ' active' : '');
        b.textContent = k;
        b.addEventListener('click', () => { state.keyFilter = k; renderHome(); });
        keySub.appendChild(b);
      }
    } else {
      keySub.classList.add('hidden');
    }

    // Filtering
    const q = state.searchQuery.trim().toLowerCase();
    let filtered = sorted.filter((s) => {
      const curKey = window.ChordEngine.transposeKey(s.originalKey, s.transposeSteps || 0);
      const matchQ =
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.artist || '').toLowerCase().includes(q) ||
        (s.originalKey || '').toLowerCase().includes(q) ||
        curKey.toLowerCase().includes(q) ||
        (s.content || '').toLowerCase().includes(q);
      if (!matchQ) return false;
      if (state.filter === 'favorites') return !!s.isFavorite;
      if (state.filter === 'recent') return (s.lastOpenedAt || 0) > 0;
      if (state.filter === 'key') return !state.keyFilter || curKey.toLowerCase() === state.keyFilter.toLowerCase();
      return true;
    });

    if (state.filter === 'recent') {
      filtered.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
    }

    const titles = {
      all: 'Biblioteca de Cifras',
      favorites: 'Suas Favoritas',
      recent: 'Histórico Recente',
      key: 'Filtrado por Tom'
    };
    $('library-heading').textContent = titles[state.filter] || 'Biblioteca de Cifras';
    $('filtered-count').textContent = String(filtered.length);

    const grid = $('library-grid');
    const empty = $('empty-library');
    grid.innerHTML = '';

    if (filtered.length === 0) {
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      for (const song of filtered) {
        const curKey = window.ChordEngine.transposeKey(song.originalKey, song.transposeSteps || 0);
        const card = document.createElement('article');
        card.className = 'song-card';
        card.innerHTML = `
          <div class="song-card-top">
            <div>
              <h4 class="song-card-title">${escapeHtml(song.title)}</h4>
              <p class="song-card-artist">${escapeHtml(song.artist || 'Artista não informado')}</p>
            </div>
            <button class="btn btn-icon fav-btn" type="button" aria-label="Favoritar">${song.isFavorite ? '<span class="gold-text">♥</span>' : '♡'}</button>
          </div>
          <div class="song-card-bottom">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="key-pill">Tom: ${escapeHtml(curKey)}</span>
              ${song.transposeSteps ? `<span style="font-size:0.78rem;color:var(--text-muted)">Orig: ${escapeHtml(song.originalKey)}</span>` : ''}
            </div>
            <div class="song-card-actions">
              <button class="btn btn-icon edit-btn" type="button" title="Editar" aria-label="Editar">✎</button>
              <button class="btn btn-icon del-btn" type="button" title="Excluir" aria-label="Excluir" style="color:var(--coral)">🗑</button>
              <button class="btn btn-gold btn-sm stage-btn" type="button">▶ Palco</button>
            </div>
          </div>
        `;
        card.querySelector('.song-card-top').addEventListener('click', (e) => {
          if (e.target.closest('.fav-btn')) return;
          openStage(song.id);
        });
        card.querySelector('.fav-btn').addEventListener('click', () => toggleFavorite(song.id));
        card.querySelector('.edit-btn').addEventListener('click', () => openEditor(song.id));
        card.querySelector('.del-btn').addEventListener('click', () => requestDelete(song));
        card.querySelector('.stage-btn').addEventListener('click', () => openStage(song.id));
        grid.appendChild(card);
      }
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function toggleFavorite(id) {
    const song = state.songs.find((s) => s.id === id);
    if (!song) return;
    song.isFavorite = !song.isFavorite;
    song.updatedAt = Date.now();
    await LocalStore.putSong(song);
    renderHome();
    if (state.activeSongId === id) renderStageHeader(song);
  }

  function requestDelete(song) {
    state.pendingDeleteId = song.id;
    $('delete-modal-message').textContent = `Tem certeza que deseja remover "${song.title}" da sua biblioteca local?`;
    $('modal-delete').classList.remove('hidden');
  }

  // --- EDITOR ---
  function initEditorKeys() {
    const sel = $('editor-key');
    sel.innerHTML = '';
    for (const k of window.ChordEngine.ALL_KEYS) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    }
  }

  function openEditor(songId = null) {
    stopVoiceAndAutoScroll();
    const existing = songId ? state.songs.find((s) => s.id === songId) : null;
    state.editingId = existing ? existing.id : null;
    state.previewTranspose = existing ? existing.transposeSteps || 0 : 0;

    $('editor-heading').textContent = existing ? 'Editar Cifra' : 'Nova Música';
    $('editor-title').value = existing ? existing.title : '';
    $('editor-artist').value = existing ? existing.artist || '' : '';
    $('editor-key').value = existing ? existing.originalKey || 'G' : 'G';
    $('editor-content').value = existing ? existing.content : '';
    $('editor-title-error').classList.add('hidden');
    $('editor-content-error').classList.add('hidden');

    setEditorTab('edit');
    switchView('view-editor');
  }

  function setEditorTab(tab) {
    const isPreview = tab === 'preview';
    $('tab-editor-edit').classList.toggle('active', !isPreview);
    $('tab-editor-preview').classList.toggle('active', isPreview);
    $('panel-editor-edit').classList.toggle('hidden', isPreview);
    $('panel-editor-preview').classList.toggle('hidden', !isPreview);
    if (isPreview) renderEditorPreview();
  }

  function renderEditorPreview() {
    const title = $('editor-title').value.trim() || 'Sem título';
    const origKey = $('editor-key').value || 'G';
    const curKey = window.ChordEngine.transposeKey(origKey, state.previewTranspose);
    const content = $('editor-content').value;

    $('preview-song-title').textContent = title;
    $('preview-key-info').textContent = `Original: ${origKey} • Atual: ${curKey}`;
    const parsed = window.ChordEngine.parseAndTransposeSong(content, state.previewTranspose, origKey);
    renderChordSheet($('editor-preview-sheet'), parsed, 17, -1);
  }

  async function saveEditor() {
    const title = $('editor-title').value.trim();
    const artist = $('editor-artist').value.trim();
    const originalKey = $('editor-key').value || 'G';
    const content = $('editor-content').value.replace(/\s+$/, '');

    let invalid = false;
    if (!title) {
      $('editor-title-error').textContent = 'Informe o título da música.';
      $('editor-title-error').classList.remove('hidden');
      invalid = true;
    } else {
      $('editor-title-error').classList.add('hidden');
    }
    if (!content.trim()) {
      $('editor-content-error').textContent = 'Cole ou digite a letra com cifras.';
      $('editor-content-error').classList.remove('hidden');
      invalid = true;
    } else {
      $('editor-content-error').classList.add('hidden');
    }
    if (invalid) return;

    const now = Date.now();
    const existing = state.editingId ? state.songs.find((s) => s.id === state.editingId) : null;
    const song = existing
      ? { ...existing, title, artist, originalKey, transposeSteps: state.previewTranspose, content, updatedAt: now }
      : {
          id: (crypto.randomUUID ? crypto.randomUUID() : `song-${now}`),
          title,
          artist,
          originalKey,
          transposeSteps: state.previewTranspose,
          content,
          isFavorite: false,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now
        };

    await LocalStore.putSong(song);
    state.songs = await LocalStore.getAllSongs();
    showToast('Cifra salva com sucesso!');
    openStage(song.id);
  }

  // --- STAGE MODE & TELEPROMPTER ---
  async function requestWakeLock() {
    if ('wakeLock' in navigator && !state.wakeLock) {
      try {
        state.wakeLock = await navigator.wakeLock.request('screen');
        state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
      } catch { /* unsupported or denied */ }
    }
  }

  function releaseWakeLock() {
    if (state.wakeLock) {
      try { state.wakeLock.release(); } catch { /* ignore */ }
      state.wakeLock = null;
    }
  }

  async function openStage(songId) {
    stopVoiceAndAutoScroll();
    const song = state.songs.find((s) => s.id === songId);
    if (!song) return;
    song.lastOpenedAt = Date.now();
    await LocalStore.putSong(song);

    state.activeSongId = song.id;
    state.activeLineIndex = -1;
    state.isFullScreen = false;
    applyStageFullScreenUI();
    renderStage(song);
    switchView('view-stage');
    $('stage-scroll-area').scrollTop = 0;
    requestWakeLock();
  }

  function getActiveSong() {
    return state.songs.find((s) => s.id === state.activeSongId) || null;
  }

  function renderStageHeader(song) {
    $('stage-title').textContent = song.title;
    $('stage-artist').textContent = song.artist || 'Cifra local';
    $('btn-stage-fav').innerHTML = song.isFavorite ? '<span class="gold-text">♥</span>' : '♡';
  }

  function renderStage(song) {
    renderStageHeader(song);
    const steps = song.transposeSteps || 0;
    const curKey = window.ChordEngine.transposeKey(song.originalKey, steps);

    $('stage-current-key').textContent = `Tom: ${curKey}`;
    $('stage-original-key').textContent = steps === 0
      ? 'Original'
      : `Orig: ${song.originalKey} (${steps > 0 ? '+' + steps : steps})`;

    $('stage-fs-title').textContent = song.title;
    $('stage-fs-key').textContent = `${song.artist || 'Cifra'} • Tom ${curKey}`;

    $('stage-font-value').textContent = String(Math.round(state.prefs.fontSizePx));
    $('stage-speed-value').textContent = `${state.prefs.autoScrollSpeed.toFixed(1)}x`;
    $('input-autoscroll-speed').value = String(state.prefs.autoScrollSpeed);
    $('input-voice-sens').value = String(state.prefs.voiceSensitivity);
    $('input-voice-speed').value = String(state.prefs.voiceScrollSpeed);
    updateCalibrationLabels();

    state.parsedStageLines = window.ChordEngine.parseAndTransposeSong(song.content, steps, song.originalKey);
    renderChordSheet($('stage-sheet'), state.parsedStageLines, state.prefs.fontSizePx, state.activeLineIndex);
  }

  function applyStageFullScreenUI() {
    $('stage-topbar').classList.toggle('hidden', state.isFullScreen);
    $('stage-dock-top').classList.toggle('hidden', state.isFullScreen);
    $('stage-fullscreen-header').classList.toggle('hidden', !state.isFullScreen);
    $('btn-exit-fullscreen').classList.toggle('hidden', !state.isFullScreen);
  }

  async function toggleFullScreen(enable) {
    state.isFullScreen = enable;
    applyStageFullScreenUI();
    try {
      if (enable && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!enable && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch { /* iPhone Safari uses CSS fullscreen cleanly */ }
  }

  async function stepTranspose(delta) {
    const song = getActiveSong();
    if (!song) return;
    if (delta === 0) {
      song.transposeSteps = 0;
    } else {
      const next = (song.transposeSteps || 0) + delta;
      const wrapped = ((next % 12) + 12) % 12;
      song.transposeSteps = wrapped > 6 ? wrapped - 12 : wrapped;
    }
    song.updatedAt = Date.now();
    await LocalStore.putSong(song);
    renderStage(song);
  }

  // --- AUTO SCROLL ---
  function startAutoScroll() {
    if (state.voiceStatus === 'listening') pauseVoice();
    state.isAutoScrolling = true;
    $('btn-autoscroll-toggle').textContent = '⏸ Pausar';

    let lastTs = 0;
    let accum = 0;
    const scroller = $('stage-scroll-area');

    const step = (ts) => {
      if (!state.isAutoScrolling) return;
      if (lastTs) {
        const dt = Math.min(0.1, (ts - lastTs) / 1000);
        accum += state.prefs.autoScrollSpeed * 44 * dt;
        if (accum >= 1) {
          const whole = Math.floor(accum);
          const before = scroller.scrollTop;
          scroller.scrollTop += whole;
          accum -= whole;
          if (scroller.scrollTop === before && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
            stopAutoScroll();
            return;
          }
        }
      }
      lastTs = ts;
      state.autoScrollRaf = requestAnimationFrame(step);
    };
    state.autoScrollRaf = requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    state.isAutoScrolling = false;
    if (state.autoScrollRaf) cancelAnimationFrame(state.autoScrollRaf);
    state.autoScrollRaf = null;
    $('btn-autoscroll-toggle').textContent = '▶ Rolar';
  }

  // --- WEB SPEECH API VOCAL TELEPROMPTER ---
  function getSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function updateCalibrationLabels() {
    const sens = state.prefs.voiceSensitivity;
    $('voice-sens-label').textContent = sens < 0.4 ? 'Conservadora' : sens < 0.75 ? 'Equilibrada' : 'Alta';
    $('voice-speed-label').textContent = `${state.prefs.voiceScrollSpeed.toFixed(1)}x`;
  }

  function renderVoiceUI() {
    const banner = $('voice-banner');
    const micBtn = $('btn-mic-toggle');
    const pauseBtn = $('btn-voice-pause');
    const resumeBtn = $('btn-voice-resume');
    const fallbackBtn = $('btn-voice-fallback-auto');
    const settingsBtn = $('btn-voice-settings');
    const calPanel = $('voice-calibration');

    banner.classList.remove('state-listening', 'state-paused', 'state-error');
    micBtn.classList.remove('listening', 'paused');
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.add('hidden');
    fallbackBtn.classList.add('hidden');
    settingsBtn.classList.add('hidden');

    if (state.voiceStatus === 'idle') {
      banner.classList.add('hidden');
      calPanel.classList.add('hidden');
      micBtn.textContent = '🎙 Voz';
      return;
    }

    banner.classList.remove('hidden');
    calPanel.classList.toggle('hidden', !state.showVoiceSettings);

    if (state.voiceStatus === 'listening') {
      banner.classList.add('state-listening');
      micBtn.classList.add('listening');
      micBtn.textContent = '🎙 Ouvindo';
      $('voice-status-title').textContent = 'Ouvindo voz (pt-BR)';
      $('voice-status-detail').textContent = state.voiceSnippet || 'Cante no seu ritmo — o teleprompter acompanha suavemente.';
      pauseBtn.classList.remove('hidden');
      settingsBtn.classList.remove('hidden');
    } else if (state.voiceStatus === 'paused') {
      banner.classList.add('state-paused');
      micBtn.classList.add('paused');
      micBtn.textContent = '▶ Retomar';
      $('voice-status-title').textContent = 'Microfone pausado (progresso mantido)';
      $('voice-status-detail').textContent = state.voiceSnippet || 'Toque em Retomar para continuar de onde parou.';
      resumeBtn.textContent = '▶ Retomar';
      resumeBtn.classList.remove('hidden');
      settingsBtn.classList.remove('hidden');
    } else if (state.voiceStatus === 'unavailable') {
      banner.classList.add('state-error');
      micBtn.textContent = '🎙 Voz';
      $('voice-status-title').textContent = 'Reconhecimento de fala não suportado neste navegador';
      $('voice-status-detail').textContent = state.voiceErrorMsg || 'Este navegador não oferece Web Speech API. Use a rolagem automática por velocidade.';
      fallbackBtn.classList.remove('hidden');
    } else if (state.voiceStatus === 'error') {
      banner.classList.add('state-error');
      micBtn.textContent = '🎙 Voz';
      $('voice-status-title').textContent = 'Microfone interrompido';
      $('voice-status-detail').textContent = state.voiceErrorMsg;
      resumeBtn.textContent = 'Tentar novamente';
      resumeBtn.classList.remove('hidden');
      fallbackBtn.classList.remove('hidden');
    }
  }

  function startTeleprompterGlideLoop() {
    if (state.teleprompterRaf) cancelAnimationFrame(state.teleprompterRaf);
    let lastTs = 0;
    const scroller = $('stage-scroll-area');

    const tick = (ts) => {
      if (state.voiceStatus !== 'listening') return;
      if (lastTs && state.activeLineIndex >= 0) {
        const dt = Math.min(0.08, (ts - lastTs) / 1000);
        const lineEl = document.querySelector(`#stage-sheet .song-line[data-line-idx="${state.activeLineIndex}"]`);
        if (lineEl) {
          const desiredTop = scroller.clientHeight * 0.28;
          const currentOffset = lineEl.offsetTop - scroller.scrollTop;
          const errorPx = currentOffset - desiredTop;
          if (Math.abs(errorPx) > 3) {
            const factor = Math.min(0.35, Math.max(0.04, state.prefs.voiceScrollSpeed * 3.2 * dt));
            const maxStep = 560 * state.prefs.voiceScrollSpeed * dt;
            const step = Math.max(-maxStep, Math.min(maxStep, errorPx * factor));
            scroller.scrollTop += step;
          }
        }
      }
      lastTs = ts;
      state.teleprompterRaf = requestAnimationFrame(tick);
    };
    state.teleprompterRaf = requestAnimationFrame(tick);
  }

  function highlightActiveLine(lineIdx) {
    if (state.activeLineIndex === lineIdx) return;
    const prev = document.querySelector('#stage-sheet .song-line.highlighted');
    if (prev) prev.classList.remove('highlighted');
    state.activeLineIndex = lineIdx;
    const next = document.querySelector(`#stage-sheet .song-line[data-line-idx="${lineIdx}"]`);
    if (next) next.classList.add('highlighted');
  }

  function startVoice() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      state.voiceStatus = 'unavailable';
      state.voiceErrorMsg = 'Seu navegador atual não suporta reconhecimento de fala (Web Speech API). Use a rolagem automática por velocidade ou abra no Chrome/Edge.';
      renderVoiceUI();
      return;
    }

    stopAutoScroll();
    state.shouldListen = true;
    state.voiceStatus = 'listening';
    renderVoiceUI();
    startTeleprompterGlideLoop();
    launchRecognitionSession(Ctor);
  }

  function launchRecognitionSession(Ctor) {
    if (!state.shouldListen) return;
    if (state.recognition) {
      try { state.recognition.onend = null; state.recognition.abort(); } catch { /* ignore */ }
    }

    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onresult = (event) => {
      if (!state.shouldListen) return;
      const result = event.results[event.results.length - 1];
      if (!result) return;
      const candidates = [];
      for (let i = 0; i < result.length; i++) {
        const t = (result[i].transcript || '').trim();
        if (t) candidates.push(t);
      }
      if (!candidates.length) return;

      state.voiceSnippet = candidates[0];
      $('voice-status-detail').textContent = state.voiceSnippet;

      const match = window.LyricMatcher.findBestMatchingLine({
        spokenText: candidates[0],
        alternativeTranscripts: candidates.slice(1),
        lines: state.parsedStageLines,
        currentLineIndex: Math.max(0, state.activeLineIndex),
        isFinalResult: result.isFinal,
        sensitivity: state.prefs.voiceSensitivity
      });

      if (match) {
        highlightActiveLine(match.lineIndex);
      }
    };

    rec.onerror = (event) => {
      if (!state.shouldListen) return;
      const err = event.error;
      if (err === 'no-speech' || err === 'aborted') return;

      state.shouldListen = false;
      state.voiceStatus = 'error';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        state.voiceErrorMsg = 'Permissão de microfone negada. Libere o microfone no navegador ou use a rolagem automática.';
      } else if (err === 'audio-capture') {
        state.voiceErrorMsg = 'Nenhum microfone disponível neste aparelho. Use a rolagem automática por velocidade.';
      } else if (err === 'network') {
        state.voiceErrorMsg = 'O reconhecimento de fala deste navegador precisa de internet. Use a rolagem automática offline!';
      } else {
        state.voiceErrorMsg = `Erro no reconhecimento de voz (${err}). Use a rolagem automática.`;
      }
      renderVoiceUI();
    };

    rec.onend = () => {
      if (state.shouldListen && state.voiceStatus === 'listening') {
        setTimeout(() => launchRecognitionSession(Ctor), 220);
      }
    };

    state.recognition = rec;
    try {
      rec.start();
    } catch (e) {
      state.shouldListen = false;
      state.voiceStatus = 'error';
      state.voiceErrorMsg = 'Não foi possível iniciar o microfone neste navegador. Use a rolagem automática.';
      renderVoiceUI();
    }
  }

  function pauseVoice() {
    state.shouldListen = false;
    if (state.teleprompterRaf) cancelAnimationFrame(state.teleprompterRaf);
    if (state.recognition) {
      try { state.recognition.onend = null; state.recognition.stop(); } catch { /* ignore */ }
    }
    if (state.voiceStatus !== 'unavailable') {
      state.voiceStatus = 'paused';
      renderVoiceUI();
    }
  }

  function endVoice() {
    state.shouldListen = false;
    if (state.teleprompterRaf) cancelAnimationFrame(state.teleprompterRaf);
    if (state.recognition) {
      try { state.recognition.onend = null; state.recognition.abort(); } catch { /* ignore */ }
      state.recognition = null;
    }
    state.voiceStatus = 'idle';
    state.voiceSnippet = '';
    state.showVoiceSettings = false;
    highlightActiveLine(-1);
    renderVoiceUI();
  }

  function stopVoiceAndAutoScroll() {
    stopAutoScroll();
    endVoice();
  }

  // --- EXPORT / IMPORT ---
  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJsonBackup() {
    const payload = {
      app: 'Cifra Fácil',
      version: 1,
      exportedAt: Date.now(),
      songs: state.songs
    };
    downloadFile('cifra-facil-backup.json', JSON.stringify(payload, null, 2), 'application/json');
    showToast('Backup JSON exportado!');
  }

  async function importJsonBackup(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.songs;
      if (!Array.isArray(list)) throw new Error('Formato inválido');
      const now = Date.now();
      const valid = list
        .filter((s) => s && (s.title || s.content))
        .map((s, idx) => ({
          id: s.id || `imp-${now}-${idx}`,
          title: String(s.title || `Música Importada ${idx + 1}`).trim(),
          artist: String(s.artist || ''),
          originalKey: String(s.originalKey || 'C'),
          transposeSteps: Number(s.transposeSteps || 0),
          content: String(s.content || ''),
          isFavorite: Boolean(s.isFavorite),
          createdAt: Number(s.createdAt || now),
          updatedAt: Number(s.updatedAt || now),
          lastOpenedAt: Number(s.lastOpenedAt || 0)
        }));
      await LocalStore.saveSongsBulk(valid);
      state.songs = await LocalStore.getAllSongs();
      renderHome();
      showToast(`${valid.length} cifra(s) importada(s)!`);
    } catch {
      showToast('Arquivo JSON inválido. Verifique o backup selecionado.');
    }
  }

  // --- EVENT WIRING ---
  function bindEvents() {
    window.addEventListener('online', updateNetworkBadge);
    window.addEventListener('offline', updateNetworkBadge);

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      $('btn-guide-install-now').classList.remove('hidden');
    });

    $('btn-install-pwa').addEventListener('click', async () => {
      if (state.deferredInstallPrompt) {
        state.deferredInstallPrompt.prompt();
        const res = await state.deferredInstallPrompt.userChoice;
        if (res.outcome === 'accepted') showToast('Cifra Fácil instalado!');
        state.deferredInstallPrompt = null;
      } else {
        $('modal-guide').classList.remove('hidden');
      }
    });

    $('btn-guide-install-now').addEventListener('click', async () => {
      if (state.deferredInstallPrompt) {
        state.deferredInstallPrompt.prompt();
        await state.deferredInstallPrompt.userChoice;
        state.deferredInstallPrompt = null;
        $('btn-guide-install-now').classList.add('hidden');
      }
    });

    $('btn-open-guide').addEventListener('click', () => $('modal-guide').classList.remove('hidden'));
    $('btn-menu-guide').addEventListener('click', () => {
      $('home-menu-dropdown').classList.add('hidden');
      $('modal-guide').classList.remove('hidden');
    });
    $('btn-close-guide').addEventListener('click', () => $('modal-guide').classList.add('hidden'));
    $('btn-guide-ok').addEventListener('click', () => $('modal-guide').classList.add('hidden'));
    $('modal-guide').addEventListener('click', (e) => {
      if (e.target === $('modal-guide')) $('modal-guide').classList.add('hidden');
    });
    $('modal-delete').addEventListener('click', (e) => {
      if (e.target === $('modal-delete')) {
        state.pendingDeleteId = null;
        $('modal-delete').classList.add('hidden');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $('modal-guide').classList.add('hidden');
        if (!$('modal-delete').classList.contains('hidden')) {
          state.pendingDeleteId = null;
          $('modal-delete').classList.add('hidden');
        }
      }
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && state.isFullScreen) {
        state.isFullScreen = false;
        applyStageFullScreenUI();
      }
    });

    // Home Menu
    $('btn-home-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      $('home-menu-dropdown').classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
      $('home-menu-dropdown').classList.add('hidden');
      $('stage-menu-dropdown').classList.add('hidden');
    });

    $('btn-export-json').addEventListener('click', () => {
      $('home-menu-dropdown').classList.add('hidden');
      exportJsonBackup();
    });
    $('btn-import-json').addEventListener('click', () => {
      $('home-menu-dropdown').classList.add('hidden');
      $('input-import-json').click();
    });
    $('input-import-json').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) importJsonBackup(file);
      e.target.value = '';
    });
    $('btn-restore-demos').addEventListener('click', async () => {
      $('home-menu-dropdown').classList.add('hidden');
      const demos = window.DEMO_SONGS();
      await LocalStore.saveSongsBulk(demos);
      state.songs = await LocalStore.getAllSongs();
      renderHome();
      showToast(`${demos.length} músicas de exemplo restauradas!`);
    });

    // Home Search & Filters
    $('input-search').addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      $('btn-clear-search').classList.toggle('hidden', !state.searchQuery);
      renderHome();
    });
    $('btn-clear-search').addEventListener('click', () => {
      state.searchQuery = '';
      $('input-search').value = '';
      $('btn-clear-search').classList.add('hidden');
      renderHome();
    });

    for (const chip of document.querySelectorAll('#filter-chips .chip')) {
      chip.addEventListener('click', () => {
        for (const c of document.querySelectorAll('#filter-chips .chip')) c.classList.remove('active');
        chip.classList.add('active');
        state.filter = chip.dataset.filter;
        if (state.filter !== 'key') state.keyFilter = null;
        renderHome();
      });
    }

    $('btn-new-song').addEventListener('click', () => openEditor(null));
    $('btn-empty-new').addEventListener('click', () => openEditor(null));
    $('btn-empty-clear').addEventListener('click', () => {
      state.searchQuery = '';
      state.filter = 'all';
      state.keyFilter = null;
      $('input-search').value = '';
      $('btn-clear-search').classList.add('hidden');
      for (const c of document.querySelectorAll('#filter-chips .chip')) {
        c.classList.toggle('active', c.dataset.filter === 'all');
      }
      renderHome();
    });
    $('btn-empty-demos').addEventListener('click', async () => {
      const demos = window.DEMO_SONGS();
      await LocalStore.saveSongsBulk(demos);
      state.songs = await LocalStore.getAllSongs();
      renderHome();
    });

    // Delete Modal
    $('btn-delete-cancel').addEventListener('click', () => {
      state.pendingDeleteId = null;
      $('modal-delete').classList.add('hidden');
    });
    $('btn-delete-confirm').addEventListener('click', async () => {
      if (state.pendingDeleteId) {
        await LocalStore.deleteSong(state.pendingDeleteId);
        state.songs = await LocalStore.getAllSongs();
        renderHome();
        showToast('Cifra removida da biblioteca.');
      }
      state.pendingDeleteId = null;
      $('modal-delete').classList.add('hidden');
    });

    // Editor
    $('btn-editor-back').addEventListener('click', () => switchView('view-home'));
    $('btn-editor-save').addEventListener('click', saveEditor);
    $('tab-editor-edit').addEventListener('click', () => setEditorTab('edit'));
    $('tab-editor-preview').addEventListener('click', () => setEditorTab('preview'));
    $('btn-preview-down').addEventListener('click', () => {
      state.previewTranspose = ((state.previewTranspose - 1) % 12 + 12) % 12;
      if (state.previewTranspose > 6) state.previewTranspose -= 12;
      renderEditorPreview();
    });
    $('btn-preview-up').addEventListener('click', () => {
      state.previewTranspose = ((state.previewTranspose + 1) % 12 + 12) % 12;
      if (state.previewTranspose > 6) state.previewTranspose -= 12;
      renderEditorPreview();
    });

    $('btn-editor-example').addEventListener('click', () => {
      if (!$('editor-title').value.trim()) $('editor-title').value = 'Nova Canção Acústica';
      if (!$('editor-artist').value.trim()) $('editor-artist').value = 'Meu Repertório';
      $('editor-key').value = 'G';
      $('editor-content').value = `[Intro]
G   D/F#   Em7   C9

[Verso 1]
[G]Abro os olhos para um [D/F#]novo amanhecer
[Em7]Com o violão pronto [C9]para tocar
[Am7]Cada acorde traz um [G/B]jeito de viver
[C9]E uma canção [Dsus4]nova [D]no ar

[Refrão]
G              D/F#
Canta junto nessa mesma direção
Em7            C9
O dourado brilha no tom da canção
Am7        G/B      Dsus4   D    G
Música simples direto do coração`;
    });

    for (const btn of document.querySelectorAll('#editor-snippets .chip')) {
      btn.addEventListener('click', () => {
        const area = $('editor-content');
        const snippet = btn.dataset.snippet;
        const cur = area.value;
        const sep = snippet === '[]'
          ? (!cur || /\s$/.test(cur) ? '' : ' ')
          : (!cur || cur.endsWith('\n') ? '' : '\n');
        area.value = cur + sep + snippet;
        area.focus();
      });
    }

    // Stage
    $('btn-stage-back').addEventListener('click', () => {
      stopVoiceAndAutoScroll();
      releaseWakeLock();
      if (state.isFullScreen) toggleFullScreen(false);
      renderHome();
      switchView('view-home');
    });
    $('btn-stage-fav').addEventListener('click', () => {
      if (state.activeSongId) toggleFavorite(state.activeSongId);
    });
    $('btn-stage-fullscreen').addEventListener('click', () => toggleFullScreen(true));
    $('btn-exit-fullscreen').addEventListener('click', () => toggleFullScreen(false));
    $('btn-stage-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      $('stage-menu-dropdown').classList.toggle('hidden');
    });
    $('btn-stage-edit').addEventListener('click', () => {
      $('stage-menu-dropdown').classList.add('hidden');
      if (state.activeSongId) openEditor(state.activeSongId);
    });
    $('btn-stage-export-txt').addEventListener('click', () => {
      $('stage-menu-dropdown').classList.add('hidden');
      const song = getActiveSong();
      if (!song) return;
      const curKey = window.ChordEngine.transposeKey(song.originalKey, song.transposeSteps || 0);
      const txt = window.ChordEngine.exportAsPlainText(song.title, song.artist || '', song.originalKey, curKey, state.parsedStageLines);
      const slug = song.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cifra';
      downloadFile(`${slug}.txt`, txt, 'text/plain;charset=utf-8');
      showToast('Cifra salva em TXT!');
    });
    $('btn-stage-share-txt').addEventListener('click', async () => {
      $('stage-menu-dropdown').classList.add('hidden');
      const song = getActiveSong();
      if (!song) return;
      const curKey = window.ChordEngine.transposeKey(song.originalKey, song.transposeSteps || 0);
      const txt = window.ChordEngine.exportAsPlainText(song.title, song.artist || '', song.originalKey, curKey, state.parsedStageLines);
      if (navigator.share) {
        try {
          await navigator.share({ title: song.title, text: txt });
          return;
        } catch { /* fallback to clipboard */ }
      }
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(txt);
          showToast('Cifra copiada para a área de transferência!');
          return;
        } catch { /* fallback below */ }
      }
      try {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Cifra copiada para a área de transferência!');
      } catch {
        showToast('Use "Exportar cifra (.txt)" para salvar o arquivo.');
      }
    });

    $('btn-transpose-down').addEventListener('click', () => stepTranspose(-1));
    $('btn-transpose-up').addEventListener('click', () => stepTranspose(1));
    $('btn-transpose-reset').addEventListener('click', () => stepTranspose(0));

    $('btn-font-down').addEventListener('click', async () => {
      state.prefs.fontSizePx = Math.max(14, state.prefs.fontSizePx - 2);
      await LocalStore.savePrefs(state.prefs);
      const song = getActiveSong();
      if (song) renderStage(song);
    });
    $('btn-font-up').addEventListener('click', async () => {
      state.prefs.fontSizePx = Math.min(34, state.prefs.fontSizePx + 2);
      await LocalStore.savePrefs(state.prefs);
      const song = getActiveSong();
      if (song) renderStage(song);
    });

    $('btn-autoscroll-toggle').addEventListener('click', () => {
      if (state.isAutoScrolling) stopAutoScroll();
      else startAutoScroll();
    });
    $('input-autoscroll-speed').addEventListener('input', async (e) => {
      state.prefs.autoScrollSpeed = Number(e.target.value);
      $('stage-speed-value').textContent = `${state.prefs.autoScrollSpeed.toFixed(1)}x`;
      await LocalStore.savePrefs(state.prefs);
    });

    // Voice Controls
    $('btn-mic-toggle').addEventListener('click', () => {
      if (state.voiceStatus === 'listening') pauseVoice();
      else startVoice();
    });
    $('btn-voice-pause').addEventListener('click', pauseVoice);
    $('btn-voice-resume').addEventListener('click', startVoice);
    $('btn-voice-stop').addEventListener('click', endVoice);
    $('btn-voice-fallback-auto').addEventListener('click', () => {
      endVoice();
      startAutoScroll();
    });
    $('btn-voice-settings').addEventListener('click', () => {
      state.showVoiceSettings = !state.showVoiceSettings;
      renderVoiceUI();
    });
    $('input-voice-sens').addEventListener('input', async (e) => {
      state.prefs.voiceSensitivity = Number(e.target.value);
      updateCalibrationLabels();
      await LocalStore.savePrefs(state.prefs);
    });
    $('input-voice-speed').addEventListener('input', async (e) => {
      state.prefs.voiceScrollSpeed = Number(e.target.value);
      updateCalibrationLabels();
      await LocalStore.savePrefs(state.prefs);
    });
  }

  // --- BOOTSTRAP ---
  async function init() {
    initEditorKeys();
    bindEvents();
    updateNetworkBadge();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    state.prefs = await LocalStore.getPrefs();
    let songs = await LocalStore.getAllSongs();
    const seeded = localStorage.getItem(LS_SEEDED_KEY) === 'true';
    if (songs.length === 0 && !seeded) {
      songs = window.DEMO_SONGS();
      await LocalStore.saveSongsBulk(songs);
      localStorage.setItem(LS_SEEDED_KEY, 'true');
    } else if (!seeded) {
      localStorage.setItem(LS_SEEDED_KEY, 'true');
    }
    state.songs = songs;
    renderHome();

    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') {
      openEditor(null);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
