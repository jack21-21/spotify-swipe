/**
 * Spotify Swipe — Main Application Controller & Swiping Engine
 * Physics-based swiping, real Spotify Web API playlist sync, dynamic chameleon theming,
 * and live Spotify Connect playback.
 */

'use strict';

const App = (() => {
  // DOM Elements
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // State
  let userProfile = null;
  let spotifyDevices = [];
  let activePlaylist = {
    id: null,
    name: 'My Spotify Playlist',
    url: null,
    tracks: []
  };

  // Customization & Settings State
  let currentAlbumStyle = localStorage.getItem('swipe_album_style') || 'record';
  if (['normal', 'minimal'].includes(currentAlbumStyle)) currentAlbumStyle = 'frame';
  let autoPlayPreviews = localStorage.getItem('swipe_auto_preview') !== 'false';
  let autoSpotifyDesktop = localStorage.getItem('swipe_spotify_desktop') !== 'false';
  let allUserPlaylists = [];

  let deck = [];
  let currentIndex = 0;
  let history = []; // Swiped history for Undo
  let isLoadingDeck = false;
  let deckOffset = 0;

  let visualizer = null;

  // Drag physics state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let currentDragX = 0;
  let currentDragY = 0;
  let activeCardEl = null;

  // Confetti generator helper
  function triggerConfetti(originX, originY) {
    const colors = ThemeManager.getCurrentColors();
    const pri = `rgb(${colors.pri.join(',')})`;
    const sec = `rgb(${colors.sec.join(',')})`;
    const container = $('#confetti-container');
    if (!container) return;

    for (let i = 0; i < 32; i++) {
      const conf = document.createElement('div');
      conf.className = 'confetti-particle';
      const size = Math.random() * 8 + 4;
      conf.style.width = `${size}px`;
      conf.style.height = `${size * 1.5}px`;
      conf.style.background = Math.random() > 0.4 ? pri : sec;
      conf.style.left = `${originX || window.innerWidth / 2}px`;
      conf.style.top = `${originY || window.innerHeight / 2}px`;

      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 260 + 120;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity - 100;

      container.appendChild(conf);

      conf.animate([
        { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${vx}px, ${vy + 300}px) rotate(${Math.random() * 720}deg) scale(0)`, opacity: 0 }
      ], {
        duration: Math.random() * 800 + 700,
        easing: 'cubic-bezier(.25,1,.5,1)'
      }).onfinish = () => conf.remove();
    }
  }

  // Toast Notification
  function showToast(msg, icon = '🎵') {
    const toast = $('#toast');
    if (!toast) return;
    toast.querySelector('.toast-icon').textContent = icon;
    toast.querySelector('.toast-text').textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  /* ---------------------------- Initialization ---------------------------- */

  async function init() {
    // Ensure valid media style (defaults to 'record' Picture Disc)
    const validFormats = ['record', 'vinyl', 'cd', 'cassette', 'frame'];
    if (!validFormats.includes(currentAlbumStyle)) {
      currentAlbumStyle = 'record';
    }
    document.body.dataset.albumStyle = currentAlbumStyle;
    document.body.dataset.mediaType = currentAlbumStyle;

    // Load saved master volume
    const savedVol = parseFloat(localStorage.getItem('swipe_volume') || '0.85');
    AudioManager.setVolume(savedVol);
    const masterSlider = $('#master-vol-slider');
    const masterText = $('#master-vol-text');
    if (masterSlider) masterSlider.value = Math.round(savedVol * 100);
    if (masterText) masterText.textContent = `${Math.round(savedVol * 100)}%`;

    initVisualizer();
    bindEvents();
    setupWindowControls();
    setupAudioProgress();

    // Check Spotify Auth Status and Devices
    await checkAuthStatus();
    await checkSpotifyDevices();

    // Sync visualizer dropdown with initial mode
    const vizSelect = $('#viz-mode-select');
    if (vizSelect && visualizer) {
      vizSelect.value = visualizer.getMode();
    }

    // Check URL params for auth success/error
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_success')) {
      showToast('Connected to your Spotify account!', '💚');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('auth_error')) {
      showToast(`Spotify login error: ${params.get('auth_error')}`, '⚠️');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Update buttons
    updateButtonStates();

    // Show Setup Modal on start
    openSetupModal();
  }

  function initVisualizer() {
    const canvas = $('#viz-canvas');
    if (canvas) {
      visualizer = new AudioVisualizer(canvas);
    }
  }

  function setupAudioProgress() {
    AudioManager.onTimeUpdate((cur, dur, progress) => {
      // Update timer readout in card teaser pill
      const timerEl = $('#preview-timer-text');
      if (timerEl) {
        const curMin = Math.floor(cur / 60);
        const curSec = Math.floor(cur % 60);
        const durMin = Math.floor(dur / 60);
        const durSec = Math.floor(dur % 60);
        timerEl.textContent = `${curMin}:${curSec < 10 ? '0' : ''}${curSec} / ${durMin}:${durSec < 10 ? '0' : ''}${durSec}`;
      }

      // Update linear scrubber
      const scrubber = $('#preview-progress-bar');
      if (scrubber) {
        scrubber.style.width = `${progress * 100}%`;
      }
    });

    AudioManager.onStateChange((isPlaying, track) => {
      updatePlaybackButtons(isPlaying);

      // Picture Disc, Vinyl, CD & Cassette animation
      const pictureDiscEl = $('.card.active .picture-disc-object');
      const vinylEl = $('.card.active .vinyl-disc-object');
      const cdEl = $('.card.active .cd-disc-object');
      const tapeReels = $$('.card.active .tape-reel');
      if (pictureDiscEl) {
        if (isPlaying) pictureDiscEl.classList.add('playing');
        else pictureDiscEl.classList.remove('playing');
      }
      if (vinylEl) {
        if (isPlaying) vinylEl.classList.add('playing');
        else vinylEl.classList.remove('playing');
      }
      if (cdEl) {
        if (isPlaying) cdEl.classList.add('playing');
        else cdEl.classList.remove('playing');
      }
      tapeReels.forEach(reel => {
        if (isPlaying) reel.classList.add('playing');
        else reel.classList.remove('playing');
      });

      // Pulse indicator
      const pulseWave = $('#teaser-waveform');
      if (pulseWave) {
        pulseWave.classList.toggle('active', isPlaying);
      }
    });
  }

  function updatePlaybackButtons(isPlaying) {
    const pauseSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    const playSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

    // Main controls bar play button
    const mainPlayIcon = $('#main-play-icon');
    if (mainPlayIcon) {
      mainPlayIcon.innerHTML = isPlaying ? pauseSvg : playSvg;
    }

    // Card inner play button
    const cardPlayBtn = $('.card.active #card-play-btn');
    if (cardPlayBtn) {
      cardPlayBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
    }
  }

  function updateButtonStates() {
    // Undo button enabled / disabled
    const undoBtn = $('#btn-undo');
    if (undoBtn) {
      if (history.length > 0) {
        undoBtn.classList.remove('disabled');
        undoBtn.title = `Undo last swipe (${history.length} available) [Z]`;
      } else {
        undoBtn.classList.add('disabled');
        undoBtn.title = 'No swipes to undo';
      }
    }
  }

  /* ---------------------------- Spotify Auth & Devices ---------------------------- */

  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (data.authenticated && data.user) {
        userProfile = data.user;
        renderUserProfile();
      } else {
        userProfile = null;
        renderLoggedOut();
      }
    } catch (e) {
      console.warn('Failed to check auth status:', e);
    }
  }

  function renderUserProfile() {
    $('#auth-btn-text').textContent = userProfile.display_name;
    $('#status-dot').className = 'status-dot ready';
    $('#titlebar-status-text').textContent = `Connected as ${userProfile.display_name}`;
    if (userProfile.avatar) {
      $('#auth-btn-avatar').src = userProfile.avatar;
      $('#auth-btn-avatar').style.display = 'block';
      $('#modal-user-avatar').src = userProfile.avatar;
      $('#modal-user-avatar').style.display = 'block';
    }
    $('#modal-user-name').textContent = userProfile.display_name;
    $('#modal-user-badge').style.display = 'flex';
    const profileBtn = $('#btn-login-spotify');
    if (profileBtn) {
      profileBtn.title = `Connected as ${userProfile.display_name} — Click to Boot Up Spotify & Open Playlist 🚀`;
    }
  }

  function renderLoggedOut() {
    $('#auth-btn-text').textContent = 'Connect Spotify';
    $('#status-dot').className = 'status-dot';
    $('#titlebar-status-text').textContent = 'Not Connected';
    $('#auth-btn-avatar').style.display = 'none';
    $('#modal-user-badge').style.display = 'none';
  }

  async function checkSpotifyDevices() {
    try {
      const res = await fetch('/api/spotify/devices');
      const data = await res.json();
      spotifyDevices = data.devices || [];

      const devicePill = $('#spotify-device-pill');
      const deviceName = $('#spotify-device-name');
      if (spotifyDevices.length > 0) {
        const activeDev = spotifyDevices.find(d => d.is_active) || spotifyDevices[0];
        let dName = activeDev.name || 'Desktop App';
        dName = dName.replace(/^DESKTOP-/i, 'PC-');
        if (deviceName) deviceName.textContent = `Spotify: ${dName}`;
        if (devicePill) {
          devicePill.classList.add('connected');
          devicePill.title = `Connected to ${activeDev.name} (${activeDev.type}) — Click to Boot Up Spotify`;
        }
      } else {
        if (deviceName) deviceName.textContent = 'Spotify App (Standby)';
        if (devicePill) {
          devicePill.classList.remove('connected');
          devicePill.title = 'Spotify App (Standby) — Click to Launch Spotify';
        }
      }
    } catch (e) {
      console.warn('Devices check:', e);
    }
  }

  /* ---------------------------- Deck & Discovery ---------------------------- */

  async function loadDeck(reset = false) {
    if (isLoadingDeck) return;
    isLoadingDeck = true;
    showLoadingSpinner(true);

    if (reset) {
      deck = [];
      currentIndex = 0;
      deckOffset = 0;
      $('#card-stack').innerHTML = '';
    }

    try {
      // Collect all track IDs in active playlist + all swiped history + current deck to ensure 0 duplicates
      const allExcluded = new Set();
      if (activePlaylist && activePlaylist.tracks) {
        activePlaylist.tracks.forEach(t => { if (t && t.id) allExcluded.add(t.id); });
      }
      history.forEach(h => { if (h && h.track && h.track.id) allExcluded.add(h.track.id); });
      deck.forEach(t => { if (t && t.id) allExcluded.add(t.id); });

      const excludeQuery = allExcluded.size > 0 
        ? `&exclude_ids=${encodeURIComponent(Array.from(allExcluded).slice(0, 150).join(','))}` 
        : '';

      const res = await fetch(`/api/discover?offset=${deckOffset}&limit=10${excludeQuery}`);
      const data = await res.json();
      const tracks = data.tracks || [];

      if (tracks.length > 0) {
        const deduplicated = tracks.filter(t => !allExcluded.has(t.id));
        deck.push(...(deduplicated.length > 0 ? deduplicated : tracks));
        deckOffset += tracks.length;
        renderCards();
      } else if (deck.length === 0) {
        showEmptyDeckState();
      }
    } catch (e) {
      console.error('Failed to load deck:', e);
      showToast('Error loading songs. Please check connection.', '⚠️');
    } finally {
      isLoadingDeck = false;
      showLoadingSpinner(false);
    }
  }

  function showLoadingSpinner(show) {
    const spinner = $('#deck-loading');
    if (spinner) spinner.style.display = show ? 'flex' : 'none';
  }

  function showEmptyDeckState() {
    $('#card-stack').innerHTML = `
      <div class="deck-empty-state glass-card">
        <div class="empty-icon">🎧</div>
        <h2>No more songs!</h2>
        <p>You've swiped through all available tracks in this batch.</p>
        <div class="empty-actions">
          <button class="liquid-btn" onclick="App.openSetupModal()">
            <span class="btn-text">Create Another Playlist</span>
            <div class="liquid-reflection"></div>
          </button>
          <button class="glass-btn" onclick="App.loadMoreSongs()">
            Load More Songs
          </button>
        </div>
      </div>
    `;
  }

  /* ---------------------------- Card Rendering ---------------------------- */

  function renderCards() {
    const stack = $('#card-stack');
    stack.innerHTML = '';

    const remaining = deck.slice(currentIndex, currentIndex + 3);

    if (remaining.length === 0) {
      if (!isLoadingDeck) {
        loadDeck();
      }
      return;
    }

    remaining.forEach((track, i) => {
      const card = createCardElement(track, i);
      stack.appendChild(card);
    });

    // Make top card active
    const topCard = stack.querySelector('.card[data-index="0"]');
    if (topCard) {
      topCard.classList.add('active');
      setupCardInteraction(topCard);
      onActiveCardChanged(remaining[0]);
    }
  }

  function createCardElement(track, stackPosition) {
    const card = document.createElement('div');
    card.className = `card card-depth-${stackPosition}`;
    card.dataset.index = stackPosition;
    card.dataset.trackId = track.id;
    card.dataset.mediaType = currentAlbumStyle;

    const coverUrl = track.cover_art || 'https://misc.scdn.co/detail-page-image/default-640.png';
    const volPercent = Math.round((AudioManager.getVolume ? AudioManager.getVolume() : 0.85) * 100);

    card.innerHTML = `
      <!-- Swiping Decision Stamps -->
      <div class="stamp stamp-like">LIKE</div>
      <div class="stamp stamp-nope">NOPE</div>
      <div class="stamp stamp-super">SUPER LIKE</div>

      <!-- Top Card Header: Spotify Meta & Physical Media Quick-Switcher -->
      <div class="card-brand-header">
        <div class="brand-pill" title="Spotify Verified Track">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          <span>Spotify</span>
        </div>

        <!-- Quick Physical Media Switcher Pill (5 Modes) -->
        <div class="media-format-pill" title="Switch Physical Media Presentation">
          <button class="media-toggle-btn ${currentAlbumStyle === 'record' ? 'active' : ''}" data-fmt="record" onclick="App.setMediaFormat('record', event)" title="Picture Disc (Design on Vinyl Record)">💿</button>
          <button class="media-toggle-btn ${currentAlbumStyle === 'vinyl' ? 'active' : ''}" data-fmt="vinyl" onclick="App.setMediaFormat('vinyl', event)" title="Vinyl Sleeve & Record">🎵</button>
          <button class="media-toggle-btn ${currentAlbumStyle === 'cd' ? 'active' : ''}" data-fmt="cd" onclick="App.setMediaFormat('cd', event)" title="Compact Disc & Jewel Case">💽</button>
          <button class="media-toggle-btn ${currentAlbumStyle === 'cassette' ? 'active' : ''}" data-fmt="cassette" onclick="App.setMediaFormat('cassette', event)" title="Retro Cassette Tape">📼</button>
          <button class="media-toggle-btn ${currentAlbumStyle === 'frame' ? 'active' : ''}" data-fmt="frame" onclick="App.setMediaFormat('frame', event)" title="Picture Frame">🖼️</button>
        </div>

        <div class="plays-pill" title="Personal listen frequency in your library">
          <span>🎧 ${track.plays ? track.plays.toLocaleString() : '35'} plays</span>
        </div>
      </div>

      <!-- Hero Artwork: Physical Media Stage (Picture Disc, Vinyl, CD, Cassette, Frame) -->
      <div class="card-art-stage">
        <!-- 0. Pure Picture Disc (Design directly on the spinning record) -->
        <div class="physical-media-wrapper media-record">
          <div class="picture-disc-object">
            <img src="${coverUrl}" alt="${escapeHtml(track.name)}" class="picture-disc-art" loading="eager" onerror="this.onerror=null; this.src='https://misc.scdn.co/detail-page-image/default-640.png';">
            <div class="picture-disc-edge"></div>
            <div class="picture-disc-grooves"></div>
            <div class="picture-disc-sheen"></div>
            <div class="picture-disc-center">
              <div class="disc-spindle-hole"></div>
            </div>
          </div>
        </div>

        <!-- 1. Vinyl Record Experience (Centered Composition) -->
        <div class="physical-media-wrapper media-vinyl">
          <div class="album-sleeve-jacket">
            <img src="${coverUrl}" alt="${escapeHtml(track.name)}" class="sleeve-artwork-img" loading="eager" onerror="this.onerror=null; this.src='https://misc.scdn.co/detail-page-image/default-640.png';">
            <div class="sleeve-spine-edge"></div>
            <div class="sleeve-mouth-shadow"></div>
            <div class="sleeve-gloss"></div>
          </div>
          <div class="vinyl-disc-object">
            <div class="vinyl-groove-rings"></div>
            <div class="vinyl-light-sheen"></div>
            <div class="vinyl-spindle-center" style="background-image: url('${coverUrl}')">
              <div class="vinyl-spindle-hole"></div>
            </div>
          </div>
        </div>

        <!-- 2. Holographic CD & Jewel Case (Centered Composition) -->
        <div class="physical-media-wrapper media-cd">
          <div class="cd-jewel-case">
            <img src="${coverUrl}" alt="${escapeHtml(track.name)}" class="cd-booklet-img" loading="eager" onerror="this.onerror=null; this.src='https://misc.scdn.co/detail-page-image/default-640.png';">
            <div class="jewel-case-hinge"></div>
            <div class="jewel-case-plastic-rim"></div>
            <div class="jewel-case-reflection"></div>
          </div>
          <div class="cd-disc-object">
            <div class="cd-holo-rainbow"></div>
            <div class="cd-data-grooves"></div>
            <div class="cd-inner-ring">
              <div class="cd-spindle-hole"></div>
            </div>
          </div>
        </div>

        <!-- 3. Retro Cassette Tape Experience -->
        <div class="physical-media-wrapper media-cassette">
          <div class="cassette-shell">
            <div class="cassette-screws">
              <span class="screw top-left"></span>
              <span class="screw top-right"></span>
              <span class="screw bottom-left"></span>
              <span class="screw bottom-right"></span>
            </div>
            <div class="cassette-label" style="background-image: linear-gradient(rgba(10, 10, 15, 0.72), rgba(10, 10, 15, 0.8)), url('${coverUrl}')">
              <div class="cassette-label-header">
                <span>SIDE A</span>
                <span>HIGH FIDELITY</span>
              </div>
              <div class="cassette-label-title">${escapeHtml(track.name)}</div>
              <div class="cassette-label-artist">${escapeHtml(track.artist)}</div>
            </div>
            <div class="cassette-tape-window">
              <div class="tape-reel"><span class="reel-teeth"></span></div>
              <div class="tape-reel"><span class="reel-teeth"></span></div>
            </div>
          </div>
        </div>

        <!-- 4. Picture Frame Experience -->
        <div class="physical-media-wrapper media-frame">
          <div class="art-frame-container">
            <div class="art-frame-inner">
              <img src="${coverUrl}" alt="${escapeHtml(track.name)}" class="card-art-img" loading="eager" onerror="this.onerror=null; this.src='https://misc.scdn.co/detail-page-image/default-640.png';">
              <div class="art-frame-glass"></div>
              <div class="art-frame-glow"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Track Information -->
      <div class="card-info">
        <div class="track-header-meta">
          <h2 class="track-title" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</h2>
          <p class="track-artist" title="${escapeHtml(track.artist)}">${escapeHtml(track.artist)}</p>
        </div>

        <div class="track-album-sub">
          <span class="album-tag">${escapeHtml(track.album)}</span>
          <span class="dot-sep">•</span>
          <span class="year-tag">${track.release_year || '2024'}</span>
          <span class="dot-sep">•</span>
          <span class="duration-tag">${track.duration || '3:00'}</span>
        </div>

        <!-- Audio Player Bar -->
        <div class="card-audio-bar">
          <button class="teaser-play-btn" id="card-play-btn" onclick="AudioManager.togglePlay()" title="Play / Pause Audio Preview">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          
          <div class="teaser-track-info">
            <div class="teaser-timer-row">
              <span class="teaser-badge">Audio Preview</span>
              <span class="teaser-timer" id="preview-timer-text">0:00 / 0:30</span>
            </div>
            <div class="teaser-progress-track">
              <div class="teaser-progress-bar" id="preview-progress-bar"></div>
            </div>
          </div>

          <div class="teaser-waveform" id="teaser-waveform">
            <span class="w-bar"></span>
            <span class="w-bar"></span>
            <span class="w-bar"></span>
            <span class="w-bar"></span>
            <span class="w-bar"></span>
          </div>

          <!-- In-Card Preview Volume Slider -->
          <div class="card-volume-bar" title="Preview Volume">
            <button class="card-vol-icon-btn" onclick="App.toggleMute(event)" title="Mute / Unmute">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            </button>
            <input type="range" class="card-vol-range" min="0" max="100" value="${volPercent}" oninput="App.onVolumeChange(this.value, event)" title="Adjust Preview Volume">
          </div>
        </div>
      </div>
    `;

    return card;
  }

  function onActiveCardChanged(track) {
    if (!track) return;

    // 1. Morph Theme Palette over 1.4s
    ThemeManager.extractPalette(track.cover_art, () => {});

    // 2. Play Audio Preview Teaser in App (if enabled)
    if (autoPlayPreviews) {
      AudioManager.playTrack(track, true);
    }

    // 3. Auto-play on Spotify Desktop App (if enabled)
    if (autoSpotifyDesktop) {
      playTrackOnSpotifyDesktop(track.uri, false);
    }

    // 4. Pre-fetch next track's palette for zero lag
    const nextTrack = deck[currentIndex + 1];
    if (nextTrack) {
      const preloadImg = new Image();
      preloadImg.src = nextTrack.cover_art;
    }

    // 5. If running low on cards, fetch more
    if (deck.length - currentIndex <= 4 && !isLoadingDeck) {
      loadDeck();
    }
  }

  async function playTrackOnSpotifyDesktop(trackUri, notify = true) {
    try {
      const res = await fetch('/api/spotify/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_uri: trackUri })
      });
      const data = await res.json();
      if (data.status === 'playing' && notify) {
        showToast('Playing full track on your Spotify app! 🎧', '🟢');
      }
    } catch (e) {
      console.warn('Spotify play failed:', e);
    }
  }

  /* ---------------------------- Swiping Drag Physics ---------------------------- */

  function setupCardInteraction(card) {
    activeCardEl = card;

    const onStart = (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;

      isDragging = true;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      dragStartX = clientX;
      dragStartY = clientY;
      card.classList.add('dragging');
      card.style.transition = 'none';

      AudioManager.init();
    };

    const onMove = (e) => {
      if (!isDragging) return;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      currentDragX = clientX - dragStartX;
      currentDragY = clientY - dragStartY;

      const rot = currentDragX * 0.08;
      card.style.transform = `translate(${currentDragX}px, ${currentDragY}px) rotate(${rot}deg)`;

      // Stamp opacities
      const likeStamp = card.querySelector('.stamp-like');
      const nopeStamp = card.querySelector('.stamp-nope');
      const superStamp = card.querySelector('.stamp-super');

      const likeRatio = Math.max(0, Math.min(1, currentDragX / 100));
      const nopeRatio = Math.max(0, Math.min(1, -currentDragX / 100));
      const superRatio = (currentDragY < -60 && Math.abs(currentDragX) < 60)
        ? Math.max(0, Math.min(1, -currentDragY / 120))
        : 0;

      if (superRatio > 0.4) {
        if (superStamp) superStamp.style.opacity = superRatio;
        if (likeStamp) likeStamp.style.opacity = 0;
        if (nopeStamp) nopeStamp.style.opacity = 0;
      } else {
        if (superStamp) superStamp.style.opacity = 0;
        if (likeStamp) likeStamp.style.opacity = likeRatio;
        if (nopeStamp) nopeStamp.style.opacity = nopeRatio;
      }

      // Parallax effect on next card behind
      const nextCard = $('#card-stack .card[data-index="1"]');
      if (nextCard) {
        const pullProgress = Math.min(1, Math.abs(currentDragX) / 200);
        const scale = 0.94 + (0.06 * pullProgress);
        const ty = 16 - (16 * pullProgress);
        const opacity = 0.72 + (0.28 * pullProgress);
        nextCard.style.transform = `translateY(${ty}px) scale(${scale})`;
        nextCard.style.opacity = opacity;
      }
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      card.classList.remove('dragging');

      const threshold = 110;
      const superThreshold = -120;

      if (currentDragY < superThreshold && Math.abs(currentDragX) < 80) {
        swipe('super');
      } else if (currentDragX > threshold) {
        swipe('right');
      } else if (currentDragX < -threshold) {
        swipe('left');
      } else {
        // Reset back to center with spring physics
        card.style.transition = 'transform 0.45s cubic-bezier(.34, 1.56, .64, 1)';
        card.style.transform = 'translate(0px, 0px) rotate(0deg)';
        const likeStamp = card.querySelector('.stamp-like');
        const nopeStamp = card.querySelector('.stamp-nope');
        const superStamp = card.querySelector('.stamp-super');
        if (likeStamp) likeStamp.style.opacity = 0;
        if (nopeStamp) nopeStamp.style.opacity = 0;
        if (superStamp) superStamp.style.opacity = 0;

        const nextCard = $('#card-stack .card[data-index="1"]');
        if (nextCard) {
          nextCard.style.transition = 'transform 0.45s ease, opacity 0.45s ease';
          nextCard.style.transform = 'translateY(16px) scale(0.94)';
          nextCard.style.opacity = '0.72';
        }
      }

      currentDragX = 0;
      currentDragY = 0;
    };

    card.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    card.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);

    // 3D Tilt Parallax on Mouse Move when hovered
    card.addEventListener('mousemove', (e) => {
      if (isDragging) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const tiltX = (y - centerY) / centerY * -5;
      const tiltY = (x - centerX) / centerX * 5;
      card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    });

    card.addEventListener('mouseleave', () => {
      if (isDragging) return;
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    });
  }

  /* ---------------------------- Swipe Execution ---------------------------- */

  async function swipe(direction) {
    const currentTrack = deck[currentIndex];
    if (!currentTrack) return;

    const card = $('#card-stack .card.active');
    if (!card) return;

    // Record in history for undo
    history.push({ track: currentTrack, direction, index: currentIndex });
    updateButtonStates();

    // Fly off screen animation
    card.style.transition = 'transform 0.5s cubic-bezier(.22, 1, .36, 1), opacity 0.4s ease';

    if (direction === 'right' || direction === 'super') {
      const stamp = card.querySelector(direction === 'super' ? '.stamp-super' : '.stamp-like');
      if (stamp) stamp.style.opacity = 1;
      card.style.transform = `translate(${window.innerWidth * 0.9}px, ${direction === 'super' ? -400 : -100}px) rotate(35deg)`;

      // Add to real Spotify playlist
      await addTrackToActivePlaylist(currentTrack);
      triggerConfetti();
      showToast(`Added "${currentTrack.name}" to Spotify playlist!`, '💚');
    } else {
      const stamp = card.querySelector('.stamp-nope');
      if (stamp) stamp.style.opacity = 1;
      card.style.transform = `translate(-${window.innerWidth * 0.9}px, 60px) rotate(-35deg)`;
    }

    card.style.opacity = '0';

    setTimeout(() => {
      card.remove();
      currentIndex++;
      renderCards();
    }, 360);
  }

  function undoLastSwipe() {
    if (history.length === 0) {
      showToast('No swipes to undo.', 'ℹ️');
      return;
    }
    const last = history.pop();
    updateButtonStates();

    currentIndex = last.index;

    // If it was added to playlist, remove it from activePlaylist tracks locally
    if (last.direction === 'right' || last.direction === 'super') {
      activePlaylist.tracks = activePlaylist.tracks.filter(t => t.id !== last.track.id);
      updatePlaylistUI();
    }

    renderCards();
    showToast(`Restored "${last.track.name}"`, '⏪');
  }

  /* ---------------------------- Playlist Operations ---------------------------- */

  async function addTrackToActivePlaylist(track) {
    activePlaylist.tracks.push(track);
    updatePlaylistUI();

    try {
      const res = await fetch('/api/playlist/add-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_id: activePlaylist.id,
          track_uri: track.uri,
          track_id: track.id,
          name: track.name,
          artist: track.artist,
          cover_art: track.cover_art
        })
      });
      const data = await res.json();
      if (data.status === 'added') {
        $('#drawer-sync-status').textContent = 'Synced with Spotify 🟢';
      }
    } catch (e) {
      console.warn('Failed to sync track with Spotify backend:', e);
    }
  }

  function updatePlaylistUI() {
    const count = activePlaylist.tracks.length;
    // Calculate total runtime from all tracks in the active playlist
    const totalMs = activePlaylist.tracks.reduce((acc, t) => acc + (t.duration_ms || 180000), 0);
    const totalSec = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const runtimeStr = hours > 0 
      ? (mins > 0 ? `${hours} hr ${mins} mins` : `${hours} hr`)
      : `${mins} mins`;

    $('#playlist-count-badge').textContent = count;
    $('#drawer-track-count').textContent = `${count} song${count === 1 ? '' : 's'} • ${runtimeStr}`;
    $('#active-playlist-pill-name').textContent = activePlaylist.name;
    $('#drawer-playlist-title').textContent = activePlaylist.name;

    // Detect duplicate count for 1-click clean button
    const seenTids = new Set();
    let dupeCount = 0;
    for (const t of activePlaylist.tracks) {
      if (t && t.id) {
        if (seenTids.has(t.id)) dupeCount++;
        else seenTids.add(t.id);
      }
    }
    const cleanBtn = $('#btn-drawer-clean-dupes');
    if (cleanBtn) {
      if (dupeCount > 0) {
        cleanBtn.textContent = `✨ Delete ${dupeCount} Duplicate${dupeCount === 1 ? '' : 's'}`;
        cleanBtn.classList.add('has-dupes');
      } else {
        cleanBtn.textContent = '✨ Delete Duplicates';
        cleanBtn.classList.remove('has-dupes');
      }
    }

    // Render Drawer Track List
    const trackListEl = $('#drawer-tracklist');
    if (trackListEl) {
      if (activePlaylist.tracks.length === 0) {
        trackListEl.innerHTML = `
          <div class="empty-drawer-state">
            <span class="empty-drawer-icon">🎧</span>
            <p>No songs in this playlist yet.<br>Swipe right on any song to add it to Spotify!</p>
          </div>
        `;
      } else {
        trackListEl.innerHTML = activePlaylist.tracks.map((t, idx) => `
          <div class="drawer-track-item">
            <span class="track-num">${idx + 1}</span>
            <img src="${t.cover_art}" alt="" class="drawer-track-thumb">
            <div class="drawer-track-details">
              <span class="drawer-track-name">${escapeHtml(t.name)}</span>
              <span class="drawer-track-artist">${escapeHtml(t.artist)} • ${t.duration || '3:00'}</span>
            </div>
            <button class="drawer-play-mini" onclick="App.playOnSpotify('${t.uri}')" title="Play on Spotify">
              ▶
            </button>
            <a href="${t.spotify_url || `https://open.spotify.com/track/${t.id}`}" target="_blank" class="drawer-spotify-link" title="Open in Spotify">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            </a>
            <button class="drawer-remove-track-btn" onclick="App.removeTrack('${t.uri}', '${t.id}', event)" title="Remove from Spotify playlist">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `).join('');
      }
    }

    // Direct Spotify Playlist link button
    const spotifyBtn = $('#btn-open-spotify-playlist');
    if (spotifyBtn) {
      if (activePlaylist.url) {
        spotifyBtn.href = activePlaylist.url;
        spotifyBtn.style.display = 'inline-flex';
      } else {
        spotifyBtn.style.display = 'none';
      }
    }
  }

  /* ---------------------------- Setup Modal ---------------------------- */

  function openSetupModal() {
    const modal = $('#setup-modal');
    if (!modal) return;
    modal.classList.add('active');

    const nameInput = $('#playlist-name-input');
    if (nameInput && !nameInput.value) {
      nameInput.value = '🔥 My Swiped Playlist 2026';
    }

    loadUserPlaylistsForSelector();
  }

  function closeSetupModal() {
    const modal = $('#setup-modal');
    if (modal) modal.classList.remove('active');
  }

  async function loadUserPlaylistsForSelector() {
    const selectEl = $('#existing-playlist-select');
    if (!selectEl) return;
    try {
      const res = await fetch('/api/playlists');
      const data = await res.json();
      const playlists = data.playlists || [];

      if (playlists.length > 0) {
        selectEl.innerHTML = '<option value="">-- Or Select an Existing Playlist --</option>' +
          playlists.map(p => {
            const runtimePart = p.runtime_approx ? ` • ${p.runtime_approx}` : '';
            return `<option value="${p.id}" data-url="${p.external_url}">${escapeHtml(p.name)} (${p.tracks_total} songs${runtimePart})</option>`;
          }).join('');
        $('#existing-playlist-group').style.display = 'block';
      } else {
        $('#existing-playlist-group').style.display = 'none';
      }
    } catch (e) {
      console.warn('Could not load user playlists:', e);
    }
  }

  async function handleStartSession() {
    const nameInput = $('#playlist-name-input');
    const existingSelect = $('#existing-playlist-select');
    const publicCheck = $('#playlist-public-check');

    const existingId = existingSelect ? existingSelect.value : null;

    if (existingId) {
      const selectedOption = existingSelect.options[existingSelect.selectedIndex];
      const pName = selectedOption.text.split(' (')[0];
      const pUrl = selectedOption.dataset.url;

      activePlaylist.id = existingId;
      activePlaylist.name = pName;
      activePlaylist.url = pUrl;
      activePlaylist.tracks = [];

      try {
        const res = await fetch('/api/playlist/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlist_id: existingId, playlist_name: pName, playlist_url: pUrl })
        });
        const data = await res.json();
        if (data.details && Array.isArray(data.details.tracks)) {
          activePlaylist.tracks = data.details.tracks;
          if (data.details.name) activePlaylist.name = data.details.name;
          if (data.details.url) activePlaylist.url = data.details.url;
        }
      } catch (e) {
        console.warn('Select playlist error:', e);
      }

      showToast(`Loaded ${activePlaylist.tracks.length} songs from "${activePlaylist.name}"!`, '✅');
    } else {
      const pName = (nameInput && nameInput.value.trim()) || 'My Spotify Playlist';
      activePlaylist.name = pName;
      activePlaylist.tracks = [];

      const isPublic = publicCheck ? publicCheck.checked : false;

      // Create on Spotify API
      try {
        const res = await fetch('/api/playlist/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: pName, description: 'Created with Spotify Swipe', public: isPublic })
        });
        const data = await res.json();
        if (data.status === 'success' && data.playlist) {
          activePlaylist.id = data.playlist.id;
          activePlaylist.url = data.playlist.url;
          showToast(`Created Spotify playlist "${pName}" on your account!`, '💚');
        } else {
          showToast(`Started session "${pName}"!`, '🎵');
        }
      } catch (e) {
        console.warn('Playlist creation notice:', e);
        showToast(`Started session "${pName}"!`, '🎵');
      }
    }

    updatePlaylistUI();
    closeSetupModal();
    loadDeck(true);
  }

  /* ---------------------------- Slide-Over Drawer ---------------------------- */

  function togglePlaylistDrawer() {
    const drawer = $('#playlist-drawer');
    const overlay = $('#drawer-backdrop');
    if (!drawer) return;
    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      drawer.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
    } else {
      drawer.classList.add('open');
      if (overlay) overlay.classList.add('open');
    }
  }

  /* ---------------------------- 1-Click Clean Duplicates & Track Remove ---------------------------- */

  async function cleanPlaylistDuplicates() {
    if (!activePlaylist.id) {
      showToast('No active Spotify playlist selected.', '⚠️');
      return;
    }

    showToast('Scanning and cleaning duplicate songs...', '🧹');
    try {
      const res = await fetch('/api/playlist/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: activePlaylist.id })
      });
      const data = await res.json();
      if (data.status === 'success' || data.status === 'clean') {
        const removed = data.removed_count || 0;
        if (data.details && Array.isArray(data.details.tracks)) {
          activePlaylist.tracks = data.details.tracks;
          if (data.details.name) activePlaylist.name = data.details.name;
        }
        updatePlaylistUI();
        if (removed > 0) {
          triggerConfetti();
          showToast(`Cleaned! Deleted ${removed} duplicate song${removed === 1 ? '' : 's'} on Spotify! ✨`, '✅');
        } else {
          showToast('No duplicates found in this playlist! All clean. ✨', '👌');
        }
      } else {
        showToast('Deduplication check completed.', '🎵');
      }
    } catch (e) {
      console.warn('Deduplicate failed:', e);
      showToast('Could not clean duplicates from Spotify.', '⚠️');
    }
  }

  async function removeTrackFromPlaylist(trackUri, trackId, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    if (!activePlaylist.id) {
      activePlaylist.tracks = activePlaylist.tracks.filter(t => t.uri !== trackUri && t.id !== trackId);
      updatePlaylistUI();
      showToast('Removed track from list.', '🗑️');
      return;
    }

    try {
      const res = await fetch('/api/playlist/remove-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_id: activePlaylist.id,
          track_uri: trackUri,
          track_id: trackId
        })
      });
      const data = await res.json();
      if (data.status === 'removed' || data.status === 'success') {
        activePlaylist.tracks = activePlaylist.tracks.filter(t => t.uri !== trackUri && t.id !== trackId);
        updatePlaylistUI();
        showToast('Removed song from Spotify playlist!', '🗑️');
      } else {
        showToast('Could not remove song from Spotify.', '⚠️');
      }
    } catch (e) {
      console.warn('Remove track error:', e);
      showToast('Error removing track from Spotify.', '⚠️');
    }
  }

  /* ---------------------------- Playlist Swap Management ---------------------------- */

  async function openSwapModal() {
    const modal = $('#swap-modal');
    if (!modal) return;
    modal.classList.add('active');

    // Close drawer if open
    const drawer = $('#playlist-drawer');
    const overlay = $('#drawer-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');

    const searchInput = $('#swap-playlist-search');
    if (searchInput) searchInput.value = '';

    await fetchAllPlaylists();
    renderSwapList('');
  }

  function closeSwapModal() {
    const modal = $('#swap-modal');
    if (modal) modal.classList.remove('active');
  }

  async function fetchAllPlaylists() {
    try {
      const res = await fetch('/api/playlists');
      const data = await res.json();
      allUserPlaylists = data.playlists || [];
    } catch (e) {
      console.warn('Fetch playlists error:', e);
    }
  }

  function renderSwapList(filterText = '') {
    const listEl = $('#swap-playlist-list');
    if (!listEl) return;

    const q = filterText.toLowerCase().trim();
    const filtered = allUserPlaylists.filter(p => p.name.toLowerCase().includes(q));

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">No playlists matched your search.</div>';
      return;
    }

    listEl.innerHTML = filtered.map(p => {
      const isActive = p.id === activePlaylist.id;
      return `
        <div class="swap-playlist-item ${isActive ? 'active' : ''}" onclick="App.swapToPlaylist('${p.id}', '${escapeHtml(p.name)}', '${p.external_url}')">
          <div class="swap-item-info">
            <span class="swap-item-name">${escapeHtml(p.name)} ${isActive ? '🟢 Active' : ''}</span>
            <span class="swap-item-meta">${p.tracks_total} songs • ${p.runtime_approx || '~0 mins'}</span>
          </div>
          <span class="swap-item-btn">${isActive ? 'Selected' : 'Switch ➔'}</span>
        </div>
      `;
    }).join('');
  }

  async function swapToPlaylist(playlistId, playlistName, playlistUrl) {
    closeSwapModal();
    showToast(`Swapping to "${playlistName}"...`, '🔄');

    activePlaylist.id = playlistId;
    activePlaylist.name = playlistName;
    activePlaylist.url = playlistUrl;
    activePlaylist.tracks = [];

    try {
      const res = await fetch('/api/playlist/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: playlistId, playlist_name: playlistName, playlist_url: playlistUrl })
      });
      const data = await res.json();
      if (data.details && Array.isArray(data.details.tracks)) {
        activePlaylist.tracks = data.details.tracks;
        if (data.details.name) activePlaylist.name = data.details.name;
        if (data.details.url) activePlaylist.url = data.details.url;
      }
    } catch (e) {
      console.warn('Swap select error:', e);
    }

    updatePlaylistUI();
    loadDeck(true);
    showToast(`Active playlist switched to "${activePlaylist.name}"!`, '✅');
  }

  /* ---------------------------- App & Display Settings ---------------------------- */

  function openSettingsModal() {
    const modal = $('#settings-modal');
    if (!modal) return;
    modal.classList.add('active');

    const styleSelect = $('#setting-album-style');
    if (styleSelect) styleSelect.value = currentAlbumStyle;

    const vizSelect = $('#setting-viz-mode');
    if (vizSelect && visualizer) vizSelect.value = visualizer.getMode();

    const autoPreviewCheck = $('#setting-auto-preview');
    if (autoPreviewCheck) autoPreviewCheck.checked = autoPlayPreviews;

    const desktopCheck = $('#setting-spotify-desktop');
    if (desktopCheck) desktopCheck.checked = autoSpotifyDesktop;
  }

  function closeSettingsModal() {
    const modal = $('#settings-modal');
    if (modal) modal.classList.remove('active');
  }

  function saveSettings() {
    const styleSelect = $('#setting-album-style');
    if (styleSelect) {
      setMediaFormat(styleSelect.value);
    }

    const vizSelect = $('#setting-viz-mode');
    if (vizSelect && visualizer) {
      const vMode = vizSelect.value;
      visualizer.setMode(vMode);
      const topViz = $('#viz-mode-select');
      if (topViz) topViz.value = vMode;
    }

    const autoPreviewCheck = $('#setting-auto-preview');
    if (autoPreviewCheck) {
      autoPlayPreviews = autoPreviewCheck.checked;
      localStorage.setItem('swipe_auto_preview', autoPlayPreviews);
    }

    const desktopCheck = $('#setting-spotify-desktop');
    if (desktopCheck) {
      autoSpotifyDesktop = desktopCheck.checked;
      localStorage.setItem('swipe_spotify_desktop', autoSpotifyDesktop);
    }

    closeSettingsModal();
    showToast('Display & playback settings saved! ✨', '⚙️');
  }

  /* ---------------------------- Physical Media & Volume Engine ---------------------------- */

  function setMediaFormat(format, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const validFormats = ['record', 'vinyl', 'cd', 'cassette', 'frame'];
    if (!validFormats.includes(format)) format = 'record';

    currentAlbumStyle = format;
    localStorage.setItem('swipe_album_style', format);
    document.body.dataset.albumStyle = format;
    document.body.dataset.mediaType = format;

    // Update all cards in stack
    const cards = $$('.card');
    cards.forEach(card => {
      card.dataset.mediaType = format;
      const btns = card.querySelectorAll('.media-toggle-btn');
      btns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.fmt === format);
      });
    });

    // Sync Settings modal dropdown
    const select = $('#setting-album-style');
    if (select) select.value = format;

    const names = {
      record: 'Picture Disc 💿',
      vinyl: 'Vinyl Sleeve & Disc 🎵',
      cd: 'Compact Disc 💽',
      cassette: 'Cassette Tape 📼',
      frame: 'Picture Frame 🖼️'
    };
    showToast(`Switched to ${names[format]}`, '✨');
  }

  function onVolumeChange(val, event) {
    if (event) event.stopPropagation();
    const num = Math.max(0, Math.min(100, Number(val)));
    const ratio = num / 100;
    AudioManager.setVolume(ratio);
    localStorage.setItem('swipe_volume', ratio);

    // Sync master slider & percentage text
    const masterSlider = $('#master-vol-slider');
    const masterText = $('#master-vol-text');
    if (masterSlider) masterSlider.value = num;
    if (masterText) masterText.textContent = `${num}%`;

    // Sync in-card sliders
    const cardSliders = $$('.card-vol-range');
    cardSliders.forEach(slider => { slider.value = num; });
  }

  function toggleMute(event) {
    if (event) event.stopPropagation();
    const isMuted = AudioManager.toggleMute();
    const masterIcon = $('#master-vol-icon');
    const muteSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
    const volSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';

    if (masterIcon) {
      masterIcon.innerHTML = isMuted ? muteSvg : volSvg;
    }
    showToast(isMuted ? 'Muted preview audio' : 'Unmuted preview audio', isMuted ? '🔇' : '🔊');
  }

  /* ---------------------------- Event Handlers ---------------------------- */

  function bindEvents() {
    // Action Buttons
    $('#btn-swipe-nope')?.addEventListener('click', () => swipe('left'));
    $('#btn-swipe-like')?.addEventListener('click', () => swipe('right'));
    $('#btn-undo')?.addEventListener('click', () => undoLastSwipe());
    $('#btn-toggle-audio')?.addEventListener('click', () => AudioManager.togglePlay());

    // Spotify Desktop App Stream Button
    $('#btn-play-spotify-app')?.addEventListener('click', () => {
      const currentTrack = deck[currentIndex];
      if (currentTrack) {
        playTrackOnSpotifyDesktop(currentTrack.uri, true);
      }
    });

    // Master Volume Controls
    $('#master-vol-slider')?.addEventListener('input', (e) => onVolumeChange(e.target.value, e));
    $('#btn-master-mute')?.addEventListener('click', (e) => toggleMute(e));

    // Drawer Toggles & Actions
    $('#nav-playlist-pill')?.addEventListener('click', togglePlaylistDrawer);
    $('#btn-close-drawer')?.addEventListener('click', togglePlaylistDrawer);
    $('#drawer-backdrop')?.addEventListener('click', togglePlaylistDrawer);
    $('#btn-drawer-clean-dupes')?.addEventListener('click', cleanPlaylistDuplicates);
    $('#btn-drawer-swap')?.addEventListener('click', openSwapModal);

    // Swap Playlist Modal Triggers
    $('#btn-swap-playlist')?.addEventListener('click', openSwapModal);
    $('#btn-swap-close')?.addEventListener('click', closeSwapModal);
    $('#swap-playlist-search')?.addEventListener('input', (e) => renderSwapList(e.target.value));

    // Settings Modal Triggers
    $('#btn-open-settings')?.addEventListener('click', openSettingsModal);
    $('#btn-settings-close')?.addEventListener('click', closeSettingsModal);
    $('#btn-save-settings')?.addEventListener('click', saveSettings);

    // Visualizer Dropdown Selector (10 Modes)
    $('#viz-mode-select')?.addEventListener('change', (e) => {
      if (visualizer) {
        visualizer.setMode(e.target.value);
        showToast(`Visualizer: ${e.target.options[e.target.selectedIndex].text}`, '✨');
      }
    });

    // Modal Triggers
    $('#btn-new-playlist')?.addEventListener('click', openSetupModal);
    $('#btn-modal-close')?.addEventListener('click', closeSetupModal);
    $('#btn-start-swiping')?.addEventListener('click', handleStartSession);

    // Existing playlist selection change
    $('#existing-playlist-select')?.addEventListener('change', (e) => {
      const startBtnText = $('#btn-start-swiping .btn-text');
      const nameInput = $('#playlist-name-input');
      if (e.target.value) {
        const selName = e.target.options[e.target.selectedIndex].text.split(' (')[0];
        if (startBtnText) startBtnText.textContent = `Add to "${selName}" & Start Swiping 🔥`;
        if (nameInput) nameInput.disabled = true;
      } else {
        if (startBtnText) startBtnText.textContent = 'Create on Spotify & Start Swiping 🔥';
        if (nameInput) nameInput.disabled = false;
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        swipe('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        swipe('right');
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        swipe('super');
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        AudioManager.togglePlay();
      } else if (e.key === 'z' || e.key === 'Z') {
        undoLastSwipe();
      } else if (e.key === 's' || e.key === 'S') {
        const currentTrack = deck[currentIndex];
        if (currentTrack) playTrackOnSpotifyDesktop(currentTrack.uri, true);
      } else if (e.key === 'm' || e.key === 'M') {
        const isMuted = AudioManager.toggleMute();
        showToast(isMuted ? 'Muted' : 'Unmuted', isMuted ? '🔇' : '🔊');
      }
    });
  }

  function setupWindowControls() {
    window.minimizeWindow = () => {
      if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.minimize();
      }
    };
    window.toggleMaximizeWindow = () => {
      if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.toggle_maximize();
      }
    };
    window.closeWindow = () => {
      if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.close();
      } else {
        window.close();
      }
    };

    setupWindowResizeGrip();
  }

  function setupWindowResizeGrip() {
    const grip = $('#window-resize-grip');
    if (!grip) return;

    let isResizing = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;

    grip.addEventListener('pointerdown', (e) => {
      isResizing = true;
      grip.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      startW = window.innerWidth;
      startH = window.innerHeight;
      e.preventDefault();
    });

    grip.addEventListener('pointermove', (e) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newW = Math.max(800, Math.round(startW + dx));
      const newH = Math.max(600, Math.round(startH + dy));

      if (window.pywebview && window.pywebview.api && window.pywebview.api.resize) {
        window.pywebview.api.resize(newW, newH);
      }
    });

    const stopResize = () => { isResizing = false; };
    grip.addEventListener('pointerup', stopResize);
    grip.addEventListener('pointercancel', stopResize);
  }

  function onProfileClick(event) {
    if (userProfile && userProfile.display_name) {
      openSpotifyDesktopApp(event);
    }
  }

  async function openSpotifyDesktopApp(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const pId = activePlaylist.id;
    const pName = activePlaylist.name || 'Your Spotify Playlist';
    showToast(`Opening "${pName}" on Spotify... 🚀`, '💚');

    // Trigger Spotify protocol URL on client
    if (pId) {
      window.location.href = `spotify:playlist:${pId}`;
    } else {
      window.location.href = `spotify:`;
    }

    // Trigger native Windows desktop application launcher from backend
    try {
      await fetch('/api/spotify/launch-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: pId })
      });
    } catch (e) {
      console.warn('Launch Spotify App error:', e);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    init,
    openSetupModal,
    closeSetupModal,
    openSettingsModal,
    closeSettingsModal,
    openSwapModal,
    closeSwapModal,
    swapToPlaylist,
    cleanDuplicates: cleanPlaylistDuplicates,
    removeTrack: removeTrackFromPlaylist,
    loadMoreSongs: () => loadDeck(false),
    togglePlaylistDrawer,
    setMediaFormat,
    onVolumeChange,
    toggleMute,
    onProfileClick,
    openSpotifyDesktopApp,
    playOnSpotify: (uri) => playTrackOnSpotifyDesktop(uri, true),
    getTrackById: (id) => deck.find(t => t.id === id) || activePlaylist.tracks.find(t => t.id === id)
  };
})();

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
