/**
 * Spotify Swipe Mobile — Application Controller & Swiping Engine
 * Standalone Mobile PWA: 100% phone-native, zero PC needed!
 * Tailored for mobile screens (Samsung A55 / modern smartphones).
 * Direct Spotify PKCE Auth, iTunes preview audio pre-fetcher,
 * and 5 physical media formats (including CD disc and Cassette reels).
 */

'use strict';

const MobileApp = (() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Spotify PKCE Configuration
  const DEFAULT_CLIENT_ID = '2e9d00e15cc44cffaaba76a52f88e10a';
  const SCOPES = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-top-read',
    'user-read-recently-played',
    'user-modify-playback-state',
    'user-read-playback-state'
  ].join(' ');

  // State
  let clientId = localStorage.getItem('swipemobile_client_id') || DEFAULT_CLIENT_ID;
  let userProfile = null;
  let activePlaylist = {
    id: null,
    name: 'Choose Playlist',
    url: null,
    tracks: []
  };
  let existingTrackIds = new Set();
  let allUserPlaylists = [];

  let deck = [];
  let currentIndex = 0;
  let history = [];
  let isLoadingDeck = false;

  let currentAlbumStyle = localStorage.getItem('swipemobile_album_style') || 'record';
  let autoPlayPreviews = localStorage.getItem('swipemobile_auto_preview') !== 'false';

  // Touch physics state
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let activeCardEl = null;

  // Audio Preview Cache
  const previewCache = new Map();

  /* ---------------------------- PKCE Auth Helper ---------------------------- */

  function getRedirectUri() {
    const loc = window.location;
    return loc.origin + loc.pathname;
  }

  function generateRandomString(length = 64) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    return Array.from(values).map(x => charset[x % charset.length]).join('');
  }

  async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  async function loginWithSpotify() {
    AudioManager.unlockMobileAudio();
    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem('swipemobile_code_verifier', verifier);
    localStorage.setItem('swipemobile_client_id', clientId);

    const redirectUri = getRedirectUri();
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', challenge);

    window.location.href = authUrl.toString();
  }

  async function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      showToast(`Login error: ${error}`, '⚠️');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!code) return;

    const verifier = localStorage.getItem('swipemobile_code_verifier');
    if (!verifier) return;

    const redirectUri = getRedirectUri();
    showToast('Authorizing with Spotify...', '⏳');

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          code_verifier: verifier
        })
      });

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem('swipemobile_access_token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('swipemobile_refresh_token', data.refresh_token);
        }
        localStorage.setItem('swipemobile_expires_at', String(Date.now() + data.expires_in * 1000));
        localStorage.removeItem('swipemobile_code_verifier');
        showToast('Successfully logged in!', '💚');
      } else {
        showToast(`Auth failed: ${data.error_description || data.error}`, '⚠️');
      }
    } catch (err) {
      console.error('[PKCE] Token exchange error:', err);
      showToast('Could not complete Spotify authorization.', '⚠️');
    } finally {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async function getValidAccessToken() {
    let token = localStorage.getItem('swipemobile_access_token');
    const expiresAt = parseInt(localStorage.getItem('swipemobile_expires_at') || '0', 10);
    const refreshToken = localStorage.getItem('swipemobile_refresh_token');

    if (token && Date.now() < expiresAt - 60000) {
      return token;
    }

    if (refreshToken) {
      try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          })
        });

        const data = await response.json();
        if (data.access_token) {
          token = data.access_token;
          localStorage.setItem('swipemobile_access_token', token);
          if (data.refresh_token) {
            localStorage.setItem('swipemobile_refresh_token', data.refresh_token);
          }
          localStorage.setItem('swipemobile_expires_at', String(Date.now() + data.expires_in * 1000));
          return token;
        }
      } catch (e) {
        console.warn('[PKCE] Token refresh failed:', e);
      }
    }

    return null;
  }

  async function spotifyApi(endpoint, options = {}) {
    const token = await getValidAccessToken();
    if (!token) {
      throw new Error('Not authenticated with Spotify');
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;
    const res = await fetch(url, { ...options, headers });

    if (res.status === 204) return null;

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `HTTP ${res.status}`);
    }

    return await res.json();
  }

  function logout() {
    localStorage.removeItem('swipemobile_access_token');
    localStorage.removeItem('swipemobile_refresh_token');
    localStorage.removeItem('swipemobile_expires_at');
    userProfile = null;
    updateAuthUi();
    showToast('Logged out of Spotify.', '👋');
  }

  /* ---------------------------- Audio Preview & Pre-fetcher ---------------------------- */

  async function resolvePreviewUrl(track) {
    if (!track) return null;
    if (track.preview_url) return track.preview_url;
    if (previewCache.has(track.id)) {
      track.preview_url = previewCache.get(track.id);
      return track.preview_url;
    }

    try {
      const cleanTitle = (track.name || '')
        .replace(/\s*\(.*?\)\s*/g, ' ')
        .replace(/\s*-\s*.*$/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim();
      const cleanArtist = (track.artist || '')
        .split(',')[0]
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim();

      const query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`);
      const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0 && data.results[0].previewUrl) {
          const pUrl = data.results[0].previewUrl;
          previewCache.set(track.id, pUrl);
          track.preview_url = pUrl;
          return pUrl;
        }
      }
    } catch (e) {
      console.warn('[Preview] iTunes search error:', e);
    }
    return null;
  }

  /**
   * Pre-fetches preview audio for upcoming cards so play is instantaneous on mobile
   */
  async function prefetchPreviewsForDeck() {
    const batch = deck.slice(currentIndex, currentIndex + 6);
    for (const trk of batch) {
      if (!trk.preview_url) {
        resolvePreviewUrl(trk);
      }
    }
  }

  function handlePreviewButtonClick() {
    AudioManager.unlockMobileAudio();
    const track = deck[currentIndex];
    if (!track) return;

    if (AudioManager.isPlaying()) {
      AudioManager.pause();
    } else {
      if (track.preview_url) {
        AudioManager.playTrack(track, true);
      } else {
        // Start immediately on tap so mobile user gesture token is not lost
        AudioManager.playTrack(track, true);
        resolvePreviewUrl(track).then(pUrl => {
          if (pUrl && deck[currentIndex]?.id === track.id && AudioManager.isPlaying()) {
            AudioManager.playTrack(track, true);
          }
        });
      }
    }
  }

  /**
   * Plays the full song on Spotify
   */
  async function playFullTrackOnSpotify(track) {
    if (!track) track = deck[currentIndex];
    if (!track) return;

    const token = await getValidAccessToken();
    let remoteStarted = false;

    if (token) {
      try {
        const res = await fetch('https://api.spotify.com/v1/me/player/play', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uris: [track.uri || `spotify:track:${track.id}`] })
        });
        if (res.ok || res.status === 204) {
          remoteStarted = true;
          showToast(`Playing "${track.name}" on Spotify!`, '🟢');
          vibrate(30);
        }
      } catch (err) {
        console.warn('[Spotify] Connect playback error:', err);
      }
    }

    if (!remoteStarted) {
      showToast(`Opening "${track.name}" in Spotify...`, '🟢');
      window.location.href = track.uri || `spotify:track:${track.id}`;
      setTimeout(() => {
        if (track.spotify_url) window.open(track.spotify_url, '_blank');
      }, 900);
    }
  }

  function openActivePlaylistInSpotify() {
    if (!activePlaylist.id) {
      showToast('Select a playlist first!', '⚠️');
      openPlaylistSelectorSheet();
      return;
    }
    showToast(`Opening "${activePlaylist.name}" in Spotify...`, '🟢');
    window.location.href = `spotify:playlist:${activePlaylist.id}`;
    setTimeout(() => {
      const url = activePlaylist.url || `https://open.spotify.com/playlist/${activePlaylist.id}`;
      window.open(url, '_blank');
    }, 900);
  }

  /* ---------------------------- Spotify Web API Ops ---------------------------- */

  async function loadUserProfile() {
    try {
      userProfile = await spotifyApi('/me');
      updateAuthUi();
      return userProfile;
    } catch (e) {
      console.warn('[Spotify] Profile error:', e);
      userProfile = null;
      updateAuthUi();
      return null;
    }
  }

  async function loadUserPlaylists() {
    try {
      const data = await spotifyApi('/me/playlists?limit=50');
      allUserPlaylists = data.items || [];
      renderPlaylistCards();

      // If no active playlist is selected yet, default to first owned playlist
      if (!activePlaylist.id && allUserPlaylists.length > 0) {
        const first = allUserPlaylists.find(p => p.owner?.id === userProfile?.id) || allUserPlaylists[0];
        if (first) {
          await selectPlaylist(first.id, false);
        }
      }
    } catch (e) {
      console.warn('[Spotify] Playlists error:', e);
    }
  }

  async function selectPlaylist(playlistId, notify = true) {
    if (!playlistId) return;
    const pl = allUserPlaylists.find(p => p.id === playlistId);
    if (!pl) return;

    activePlaylist.id = pl.id;
    activePlaylist.name = pl.name;
    activePlaylist.url = pl.external_urls?.spotify;
    saveActivePlaylistMeta();
    updatePlaylistStatsUi();
    renderPlaylistCards();

    await loadPlaylistTracks(pl.id);

    if (notify) {
      showToast(`Selected "${pl.name}"`, '📁');
    }
  }

  async function loadPlaylistTracks(playlistId) {
    if (!playlistId) return [];
    try {
      const data = await spotifyApi(`/playlists/${playlistId}/tracks?limit=100`);
      existingTrackIds.clear();
      const tracks = [];

      (data.items || []).forEach(item => {
        if (!item || !item.track) return;
        const t = item.track;
        existingTrackIds.add(t.id);
        tracks.push({
          id: t.id,
          uri: t.uri,
          name: t.name,
          artist: t.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
          album: t.album?.name || '',
          cover_url: t.album?.images?.[0]?.url || '',
          duration_ms: t.duration_ms,
          preview_url: t.preview_url,
          spotify_url: t.external_urls?.spotify
        });
      });

      activePlaylist.tracks = tracks;
      updatePlaylistStatsUi();
      renderDrawerTracks();
      return tracks;
    } catch (e) {
      console.warn('[Spotify] Load playlist tracks error:', e);
      return [];
    }
  }

  async function createSpotifyPlaylist(name) {
    if (!userProfile) await loadUserProfile();
    if (!userProfile) throw new Error('Please login with Spotify to create playlists.');

    let newPl;
    try {
      newPl = await spotifyApi('/me/playlists', {
        method: 'POST',
        body: JSON.stringify({
          name: name || 'Spotify Swipe Mobile 2026',
          description: 'Curated on my phone with Spotify Swipe 💚',
          public: false
        })
      });
    } catch (err) {
      newPl = await spotifyApi(`/users/${userProfile.id}/playlists`, {
        method: 'POST',
        body: JSON.stringify({
          name: name || 'Spotify Swipe Mobile 2026',
          description: 'Curated on my phone with Spotify Swipe 💚'
        })
      });
    }

    activePlaylist = {
      id: newPl.id,
      name: newPl.name,
      url: newPl.external_urls?.spotify,
      tracks: []
    };
    existingTrackIds.clear();
    saveActivePlaylistMeta();
    updatePlaylistStatsUi();

    await loadUserPlaylists();
    return newPl;
  }

  async function addTrackToSpotifyPlaylist(track) {
    if (existingTrackIds.has(track.id)) {
      showToast(`"${track.name}" already in playlist!`, 'ℹ️');
      return false;
    }

    const token = await getValidAccessToken();
    if (token) {
      try {
        if (!activePlaylist.id) {
          await createSpotifyPlaylist('Spotify Swipe Jams');
        }

        if (activePlaylist.id) {
          await spotifyApi(`/playlists/${activePlaylist.id}/tracks`, {
            method: 'POST',
            body: JSON.stringify({
              uris: [track.uri || `spotify:track:${track.id}`]
            })
          });
        }
      } catch (e) {
        console.warn('[Spotify] Playlist sync warning:', e);
        showToast(`Spotify error: ${e.message}`, '⚠️');
      }
    }

    existingTrackIds.add(track.id);
    activePlaylist.tracks.push(track);
    saveActivePlaylistMeta();
    updatePlaylistStatsUi();
    renderDrawerTracks();
    showToast(`Added "${track.name}" to playlist!`, '💚');
    vibrate(30);
    return true;
  }

  async function removeTrackFromPlaylist(trackId, trackUri) {
    if (!activePlaylist.id) return;
    try {
      await spotifyApi(`/playlists/${activePlaylist.id}/tracks`, {
        method: 'DELETE',
        body: JSON.stringify({
          tracks: [{ uri: trackUri || `spotify:track:${trackId}` }]
        })
      });

      existingTrackIds.delete(trackId);
      activePlaylist.tracks = activePlaylist.tracks.filter(t => t.id !== trackId);
      saveActivePlaylistMeta();
      updatePlaylistStatsUi();
      renderDrawerTracks();
      showToast('Track removed from playlist.', '🗑️');
    } catch (e) {
      showToast(`Remove failed: ${e.message}`, '⚠️');
    }
  }

  async function removeDuplicatesFromPlaylist() {
    if (!activePlaylist.id) return;
    const tracks = activePlaylist.tracks;
    const seen = new Set();
    const dupeUris = [];

    tracks.forEach(t => {
      if (seen.has(t.id)) {
        dupeUris.push({ uri: t.uri || `spotify:track:${t.id}` });
      } else {
        seen.add(t.id);
      }
    });

    if (dupeUris.length === 0) {
      showToast('No duplicates in playlist!', '✨');
      return;
    }

    try {
      showToast(`Removing ${dupeUris.length} duplicate tracks...`, '🧹');
      await spotifyApi(`/playlists/${activePlaylist.id}/tracks`, {
        method: 'DELETE',
        body: JSON.stringify({ tracks: dupeUris })
      });

      await loadPlaylistTracks(activePlaylist.id);
      renderDrawerTracks();
      showToast(`Removed duplicates! Playlist is clean.`, '✅');
    } catch (e) {
      showToast(`Deduplicate failed: ${e.message}`, '⚠️');
    }
  }

  /* ---------------------------- Discovery Engine ---------------------------- */

  async function loadDiscoveryDeck() {
    if (isLoadingDeck) return;
    isLoadingDeck = true;
    showLoading(true);

    try {
      const token = await getValidAccessToken();
      if (!token) {
        showLoading(false);
        isLoadingDeck = false;
        return;
      }

      const [topShort, topMed, recent] = await Promise.allSettled([
        spotifyApi('/me/top/tracks?limit=50&time_range=short_term'),
        spotifyApi('/me/top/tracks?limit=50&time_range=medium_term'),
        spotifyApi('/me/player/recently-played?limit=50')
      ]);

      const poolMap = new Map();

      function ingest(track) {
        if (!track || !track.id) return;
        if (existingTrackIds.has(track.id)) return;

        if (!poolMap.has(track.id)) {
          const plays = Math.floor(Math.random() * 45) + 12;
          poolMap.set(track.id, {
            id: track.id,
            uri: track.uri,
            name: track.name,
            artist: track.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
            album: track.album?.name || '',
            cover_url: track.album?.images?.[0]?.url || '',
            preview_url: track.preview_url,
            duration_ms: track.duration_ms,
            spotify_url: track.external_urls?.spotify,
            plays: plays,
            bpm: Math.floor(Math.random() * 40) + 105,
            danceability: Math.floor(Math.random() * 30) + 65
          });
        }
      }

      if (topShort.status === 'fulfilled' && topShort.value?.items) {
        topShort.value.items.forEach(ingest);
      }
      if (topMed.status === 'fulfilled' && topMed.value?.items) {
        topMed.value.items.forEach(ingest);
      }
      if (recent.status === 'fulfilled' && recent.value?.items) {
        recent.value.items.forEach(item => ingest(item.track));
      }

      let candidateList = Array.from(poolMap.values());
      for (let i = candidateList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidateList[i], candidateList[j]] = [candidateList[j], candidateList[i]];
      }

      deck = candidateList;
      currentIndex = 0;
      history = [];

      renderCards();
      updateButtonStates();
      prefetchPreviewsForDeck();

      if (deck.length > 0 && autoPlayPreviews) {
        AudioManager.playTrack(deck[0], true);
      }
    } catch (err) {
      console.error('[Deck] Failed to load deck:', err);
      showToast('Could not load songs. Please check connection.', '⚠️');
    } finally {
      showLoading(false);
      isLoadingDeck = false;
    }
  }

  /* ---------------------------- Touch Swiping Physics ---------------------------- */

  function bindCardEvents(cardEl) {
    if (!cardEl) return;
    cardEl.addEventListener('pointerdown', handleDragStart, { passive: true });
  }

  function handleDragStart(e) {
    if (isDragging) return;
    const card = e.currentTarget;
    if (!card || !card.classList.contains('active-card')) return;

    if (e.target.closest('button, .preview-audio-bar, select, input')) return;

    isDragging = true;
    activeCardEl = card;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;

    card.style.transition = 'none';

    window.addEventListener('pointermove', handleDragMove, { passive: false });
    window.addEventListener('pointerup', handleDragEnd);
    window.addEventListener('pointercancel', handleDragEnd);
  }

  function handleDragMove(e) {
    if (!isDragging || !activeCardEl) return;
    currentX = e.clientX;
    currentY = e.clientY;

    const dx = currentX - startX;
    const dy = currentY - startY;

    if (Math.abs(dx) > 10 && e.cancelable) {
      e.preventDefault();
    }

    const rotation = dx * 0.07;
    activeCardEl.style.transform = `translate3d(${dx}px, ${dy * 0.6}px, 0) rotate(${rotation}deg)`;

    const likeBadge = activeCardEl.querySelector('.swipe-badge.like');
    const passBadge = activeCardEl.querySelector('.swipe-badge.nope');

    if (likeBadge && passBadge) {
      if (dx > 20) {
        const op = Math.min(1, (dx - 20) / 75);
        likeBadge.style.opacity = op;
        passBadge.style.opacity = 0;
      } else if (dx < -20) {
        const op = Math.min(1, (-dx - 20) / 75);
        passBadge.style.opacity = op;
        likeBadge.style.opacity = 0;
      } else {
        likeBadge.style.opacity = 0;
        passBadge.style.opacity = 0;
      }
    }
  }

  function handleDragEnd() {
    if (!isDragging || !activeCardEl) return;
    isDragging = false;

    window.removeEventListener('pointermove', handleDragMove);
    window.removeEventListener('pointerup', handleDragEnd);
    window.removeEventListener('pointercancel', handleDragEnd);

    const dx = currentX - startX;
    const threshold = 85;

    if (dx > threshold) {
      completeSwipe('right');
    } else if (dx < -threshold) {
      completeSwipe('left');
    } else {
      activeCardEl.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      activeCardEl.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
      const badges = activeCardEl.querySelectorAll('.swipe-badge');
      badges.forEach(b => b.style.opacity = 0);
    }
  }

  function completeSwipe(direction) {
    if (currentIndex >= deck.length) return;
    const card = activeCardEl || $('#card-deck .active-card');
    const track = deck[currentIndex];

    vibrate(25);

    if (direction === 'right') {
      if (card) {
        card.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
        card.style.transform = 'translate3d(140vw, 40px, 0) rotate(28deg)';
        card.style.opacity = '0';
      }
      history.push({ track, direction: 'right' });
      addTrackToSpotifyPlaylist(track);
      triggerConfetti();
    } else {
      if (card) {
        card.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
        card.style.transform = 'translate3d(-140vw, 40px, 0) rotate(-28deg)';
        card.style.opacity = '0';
      }
      history.push({ track, direction: 'left' });
    }

    currentIndex++;
    setTimeout(() => {
      renderCards();
      updateButtonStates();
      prefetchPreviewsForDeck();
      if (currentIndex < deck.length && autoPlayPreviews) {
        AudioManager.playTrack(deck[currentIndex], true);
      } else if (currentIndex >= deck.length) {
        AudioManager.pause();
      }
    }, 280);
  }

  function undoLastSwipe() {
    if (history.length === 0 || currentIndex === 0) return;
    const last = history.pop();
    currentIndex--;

    if (last.direction === 'right') {
      removeTrackFromPlaylist(last.track.id, last.track.uri);
    }

    renderCards();
    updateButtonStates();
    if (autoPlayPreviews) {
      AudioManager.playTrack(deck[currentIndex], true);
    }
    showToast(`Undid swipe for "${last.track.name}"`, '↩️');
    vibrate(20);
  }

  /* ---------------------------- Card Rendering (5 Physical Media Formats) ---------------------------- */

  function renderCards() {
    const container = $('#card-deck');
    if (!container) return;

    container.innerHTML = '';

    if (currentIndex >= deck.length) {
      container.innerHTML = `
        <div class="empty-deck-card glass-panel">
          <div class="empty-icon">🎉</div>
          <h3>You're All Caught Up!</h3>
          <p>You've swiped through all available songs.</p>
          <div class="empty-actions">
            <button class="primary-btn" id="btn-reload-deck">🎲 Shuffle & Discover More</button>
            <button class="secondary-btn" id="btn-view-playlist-empty">🎵 View Playlist</button>
          </div>
        </div>
      `;
      $('#btn-reload-deck')?.addEventListener('click', () => loadDiscoveryDeck());
      $('#btn-view-playlist-empty')?.addEventListener('click', () => openPlaylistDrawer());
      return;
    }

    const maxVisible = Math.min(2, deck.length - currentIndex);

    for (let i = maxVisible - 1; i >= 0; i--) {
      const trackIndex = currentIndex + i;
      const track = deck[trackIndex];
      const isTop = i === 0;

      const card = document.createElement('div');
      card.className = `swipe-card glass-card ${isTop ? 'active-card' : 'card-behind'}`;
      card.dataset.index = trackIndex;
      card.dataset.id = track.id;

      card.innerHTML = `
        <div class="swipe-badge like">ADD 💚</div>
        <div class="swipe-badge nope">PASS ✖</div>

        <div class="card-brand-header">
          <button class="brand-pill" title="Play Full Track in Spotify App">
            <svg viewBox="0 0 24 24" class="spotify-svg-icon"><path fill="currentColor" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.72 1.115.295.18.388.563.208.855zm1.226-2.723c-.226.367-.71.482-1.077.256-2.69-1.653-6.79-2.132-9.972-1.166-.413.125-.85-.11-0.975-.523-.125-.413.11-.85.523-.975 3.633-1.103 8.15-.576 11.245 1.328.368.226.483.71.256 1.08zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.494.15-1.018-.13-1.168-.624-.15-.494.13-1.018.624-1.168 3.532-1.072 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.282.327z"/></svg>
            <span>Spotify</span>
          </button>

          <!-- 5 Format toggles -->
          <div class="media-format-pill">
            <button class="media-toggle-btn ${currentAlbumStyle === 'record' ? 'active' : ''}" data-format="record" title="Picture Disc">🎵</button>
            <button class="media-toggle-btn ${currentAlbumStyle === 'vinyl' ? 'active' : ''}" data-format="vinyl" title="Vinyl LP">💿</button>
            <button class="media-toggle-btn ${currentAlbumStyle === 'cd' ? 'active' : ''}" data-format="cd" title="CD Jewel Case">💽</button>
            <button class="media-toggle-btn ${currentAlbumStyle === 'cassette' ? 'active' : ''}" data-format="cassette" title="Cassette">📼</button>
            <button class="media-toggle-btn ${currentAlbumStyle === 'frame' ? 'active' : ''}" data-format="frame" title="Picture Frame">🖼️</button>
          </div>

          <div class="plays-pill">
            <span>🎧 ${track.plays || 28} plays</span>
          </div>
        </div>

        <!-- Physical Album Stage (5 Fully-Fledged Styles) -->
        <div class="album-stage" data-media="${currentAlbumStyle}">
          
          <!-- 1. Picture Disc Record -->
          <div class="physical-record">
            <div class="record-disc">
              <img src="${track.cover_url || ''}" alt="" class="record-art-img" draggable="false" />
              <div class="record-grooves"></div>
              <div class="record-spindle-hole"></div>
            </div>
          </div>

          <!-- 2. Vinyl LP in Jacket -->
          <div class="physical-vinyl">
            <div class="vinyl-jacket">
              <img src="${track.cover_url || ''}" alt="" class="jacket-art-img" draggable="false" />
              <div class="jacket-spine"></div>
              <div class="jacket-sheen"></div>
            </div>
            <div class="vinyl-lp-disc">
              <div class="vinyl-groove-rings"></div>
              <div class="vinyl-center-label" style="background-image: url('${track.cover_url || ''}');"></div>
            </div>
          </div>

          <!-- 3. CD Jewel Case & Holographic Disc -->
          <div class="physical-cd">
            <div class="cd-jewel-case">
              <img src="${track.cover_url || ''}" alt="" class="cd-booklet-img" draggable="false" />
              <div class="cd-case-spine"></div>
              <div class="cd-case-reflection"></div>
            </div>
            <div class="cd-holographic-disc">
              <div class="cd-holo-sheen"></div>
              <div class="cd-center-clear-ring">
                <div class="cd-spindle"></div>
              </div>
            </div>
          </div>

          <!-- 4. Retro Cassette Tape -->
          <div class="physical-cassette">
            <div class="cassette-body">
              <div class="screw s-tl"></div><div class="screw s-tr"></div>
              <div class="screw s-bl"></div><div class="screw s-br"></div>
              
              <div class="cassette-label-card">
                <img src="${track.cover_url || ''}" alt="" class="cassette-art-thumb" />
                <div class="cassette-label-text">
                  <div class="c-title">${escapeHtml(track.name)}</div>
                  <div class="c-artist">${escapeHtml(track.artist)}</div>
                </div>
              </div>

              <div class="cassette-tape-window">
                <div class="tape-reel reel-left">
                  <div class="reel-teeth"></div>
                </div>
                <div class="tape-strip"></div>
                <div class="tape-reel reel-right">
                  <div class="reel-teeth"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 5. Picture Frame -->
          <div class="physical-frame">
            <div class="frame-border">
              <img src="${track.cover_url || ''}" alt="" class="frame-art-img" draggable="false" />
              <div class="frame-gloss"></div>
            </div>
          </div>

        </div>

        <!-- Track Info -->
        <div class="card-track-info">
          <h2 class="track-title">${escapeHtml(track.name)}</h2>
          <p class="track-artist">${escapeHtml(track.artist)}</p>
          <p class="track-album-meta">${escapeHtml(track.album || '')}</p>
        </div>

        <!-- Audio Teaser Bar -->
        <div class="preview-audio-bar">
          <button class="play-preview-btn" title="Play 30s Audio Preview">
            <span class="preview-btn-icon">▶</span>
          </button>
          <div class="preview-meta">
            <div class="preview-labels">
              <span class="preview-tag">AUDIO PREVIEW</span>
              <span class="preview-time">0:00 / 0:30</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill"></div>
            </div>
          </div>
          <div class="sound-wave-bars">
            <span></span><span></span><span></span><span></span>
          </div>
          <button class="play-spotify-full-btn" title="Play Full Song in Spotify App">
            <svg viewBox="0 0 24 24" class="spotify-svg-mini"><path fill="currentColor" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.72 1.115.295.18.388.563.208.855zm1.226-2.723c-.226.367-.71.482-1.077.256-2.69-1.653-6.79-2.132-9.972-1.166-.413.125-.85-.11-0.975-.523-.125-.413.11-.85.523-.975 3.633-1.103 8.15-.576 11.245 1.328.368.226.483.71.256 1.08zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.494.15-1.018-.13-1.168-.624-.15-.494.13-1.018.624-1.168 3.532-1.072 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.282.327z"/></svg>
            <span>Spotify</span>
          </button>
        </div>
      `;

      container.appendChild(card);

      if (isTop) {
        bindCardEvents(card);

        card.querySelectorAll('.media-toggle-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setAlbumFormat(btn.dataset.format);
          });
        });

        const playBtn = card.querySelector('.play-preview-btn');
        playBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          handlePreviewButtonClick();
        });

        const spotifyFullBtn = card.querySelector('.play-spotify-full-btn');
        spotifyFullBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          playFullTrackOnSpotify(track);
        });

        const brandPill = card.querySelector('.brand-pill');
        brandPill?.addEventListener('click', (e) => {
          e.stopPropagation();
          playFullTrackOnSpotify(track);
        });

        const progTrack = card.querySelector('.progress-track');
        progTrack?.addEventListener('click', (e) => {
          e.stopPropagation();
          const rect = progTrack.getBoundingClientRect();
          const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          AudioManager.seek(progress);
        });

        ThemeManager.extractPalette(track.cover_url);
      }
    }
  }

  function setAlbumFormat(format) {
    if (!['record', 'vinyl', 'cd', 'cassette', 'frame'].includes(format)) return;
    currentAlbumStyle = format;
    localStorage.setItem('swipemobile_album_style', format);
    document.body.dataset.albumStyle = format;

    $$('.media-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.format === format);
    });

    const stage = $('.active-card .album-stage');
    if (stage) {
      stage.dataset.media = format;
    }
  }

  function updateButtonStates() {
    const btnUndo = $('#btn-undo');
    if (btnUndo) {
      btnUndo.disabled = history.length === 0;
    }
    const trackCountBadge = $('#header-track-count');
    if (trackCountBadge) {
      trackCountBadge.textContent = activePlaylist.tracks.length;
    }
  }

  function updatePlaylistStatsUi() {
    const plNamePill = $('#active-playlist-pill-name');
    if (plNamePill) {
      plNamePill.textContent = activePlaylist.name || 'Choose Playlist';
    }
    const countBadge = $('#header-track-count');
    if (countBadge) {
      countBadge.textContent = activePlaylist.tracks.length;
    }
    const drawerTitle = $('#drawer-playlist-name');
    if (drawerTitle) {
      drawerTitle.textContent = activePlaylist.name || 'Swipe Playlist';
    }
    const drawerMeta = $('#drawer-playlist-meta');
    if (drawerMeta) {
      const len = activePlaylist.tracks.length;
      let totalMs = 0;
      activePlaylist.tracks.forEach(t => totalMs += (t.duration_ms || 0));
      const mins = Math.round(totalMs / 60000);
      drawerMeta.textContent = `${len} songs • ${mins} mins • Synced with Spotify 🟢`;
    }
  }

  function saveActivePlaylistMeta() {
    try {
      localStorage.setItem('swipemobile_active_playlist', JSON.stringify({
        id: activePlaylist.id,
        name: activePlaylist.name,
        url: activePlaylist.url
      }));
    } catch (e) {}
  }

  function loadSavedActivePlaylist() {
    try {
      const saved = localStorage.getItem('swipemobile_active_playlist');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id) {
          activePlaylist.id = parsed.id;
          activePlaylist.name = parsed.name || 'Swipe Playlist';
          activePlaylist.url = parsed.url;
        }
      }
    } catch (e) {}
  }

  /* ---------------------------- Drawer & Modal Sheets ---------------------------- */

  async function openPlaylistSelectorSheet() {
    renderPlaylistCards();
    const sheet = $('#playlist-selector-sheet');
    const overlay = $('#playlist-selector-overlay');
    if (sheet && overlay) {
      sheet.classList.add('open');
      overlay.classList.add('open');
    }
    if (accessToken && allUserPlaylists.length === 0) {
      await loadUserPlaylists();
    }
  }

  function closePlaylistSelectorSheet() {
    const sheet = $('#playlist-selector-sheet');
    const overlay = $('#playlist-selector-overlay');
    if (sheet && overlay) {
      sheet.classList.remove('open');
      overlay.classList.remove('open');
    }
  }

  function renderPlaylistCards() {
    const container = $('#playlist-cards-list');
    if (!container) return;

    if (!accessToken) {
      container.innerHTML = `
        <div class="sheet-connect-box">
          <p class="sheet-connect-desc">Connect with Spotify to view, choose, or sync your playlists!</p>
          <button class="sheet-connect-btn" id="btn-sheet-spotify-login">
            <svg viewBox="0 0 24 24" class="spotify-svg-mini"><path fill="currentColor" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.72 1.115.295.18.388.563.208.855zm1.226-2.723c-.226.367-.71.482-1.077.256-2.69-1.653-6.79-2.132-9.972-1.166-.413.125-.85-.11-0.975-.523-.125-.413.11-.85.523-.975 3.633-1.103 8.15-.576 11.245 1.328.368.226.483.71.256 1.08zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.494.15-1.018-.13-1.168-.624-.15-.494.13-1.018.624-1.168 3.532-1.072 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.282.327z"/></svg>
            <span>Connect Spotify</span>
          </button>
        </div>
      `;
      $('#btn-sheet-spotify-login')?.addEventListener('click', () => initiateSpotifyLogin());
      return;
    }

    if (allUserPlaylists.length === 0) {
      container.innerHTML = `
        <div class="sheet-loading">Loading your playlists from Spotify...</div>
      `;
      return;
    }

    container.innerHTML = allUserPlaylists.map(pl => {
      const isSelected = activePlaylist.id === pl.id;
      const count = pl.tracks?.total || 0;
      return `
        <div class="playlist-card-item ${isSelected ? 'active' : ''}" data-id="${pl.id}">
          <div class="pl-card-icon">${isSelected ? '🎧' : '📁'}</div>
          <div class="pl-card-meta">
            <div class="pl-card-title">${escapeHtml(pl.name)}</div>
            <div class="pl-card-count">${count} tracks ${pl.public === false ? '• Private' : ''}</div>
          </div>
          <div class="pl-card-status">${isSelected ? '✓ ACTIVE' : 'Select'}</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.playlist-card-item').forEach(card => {
      card.addEventListener('click', async () => {
        const id = card.dataset.id;
        await selectPlaylist(id, true);
        closePlaylistSelectorSheet();
        await loadDiscoveryDeck();
      });
    });
  }

  function openPlaylistDrawer() {
    renderDrawerTracks();
    updatePlaylistStatsUi();
    const drawer = $('#playlist-drawer');
    const overlay = $('#drawer-overlay');
    if (drawer && overlay) {
      drawer.classList.add('open');
      overlay.classList.add('open');
    }
  }

  function closePlaylistDrawer() {
    const drawer = $('#playlist-drawer');
    const overlay = $('#drawer-overlay');
    if (drawer && overlay) {
      drawer.classList.remove('open');
      overlay.classList.remove('open');
    }
  }

  function renderDrawerTracks() {
    const list = $('#drawer-track-list');
    if (!list) return;

    if (activePlaylist.tracks.length === 0) {
      list.innerHTML = `
        <div class="drawer-empty-state">
          <p>No songs added yet!</p>
          <span>Swipe right on any card to add songs here.</span>
        </div>
      `;
      return;
    }

    list.innerHTML = activePlaylist.tracks.map((t, idx) => `
      <div class="drawer-track-row" data-id="${t.id}">
        <span class="track-row-num">${idx + 1}</span>
        <img src="${t.cover_url || ''}" alt="${t.name}" class="track-row-cover" />
        <div class="track-row-meta">
          <div class="track-row-title">${escapeHtml(t.name)}</div>
          <div class="track-row-artist">${escapeHtml(t.artist)}</div>
        </div>
        <button class="track-row-spotify" data-id="${t.id}" title="Play in Spotify">
          <svg viewBox="0 0 24 24" class="spotify-svg-mini"><path fill="currentColor" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.72 1.115.295.18.388.563.208.855zm1.226-2.723c-.226.367-.71.482-1.077.256-2.69-1.653-6.79-2.132-9.972-1.166-.413.125-.85-.11-0.975-.523-.125-.413.11-.85.523-.975 3.633-1.103 8.15-.576 11.245 1.328.368.226.483.71.256 1.08zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.494.15-1.018-.13-1.168-.624-.15-.494.13-1.018.624-1.168 3.532-1.072 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.282.327z"/></svg>
        </button>
        <button class="track-row-delete" data-id="${t.id}" data-uri="${t.uri || ''}" title="Remove track">✖</button>
      </div>
    `).join('');

    list.querySelectorAll('.track-row-spotify').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trk = activePlaylist.tracks.find(t => t.id === btn.dataset.id);
        if (trk) playFullTrackOnSpotify(trk);
      });
    });

    list.querySelectorAll('.track-row-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrackFromPlaylist(btn.dataset.id, btn.dataset.uri);
      });
    });
  }

  function openSettingsModal() {
    const modal = $('#settings-modal');
    if (modal) modal.classList.add('open');
    $('#client-id-input').value = clientId;
    $('#redirect-uri-display').textContent = getRedirectUri();
  }

  function closeSettingsModal() {
    const modal = $('#settings-modal');
    if (modal) modal.classList.remove('open');
  }

  function updateAuthUi() {
    const loginBtn = $('#btn-spotify-login');
    const userBadge = $('#user-profile-badge');
    const avatar = $('#user-avatar-img');

    if (userProfile) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userBadge) userBadge.style.display = 'flex';
      if (avatar) avatar.src = userProfile.images?.[0]?.url || 'icon-192.png';
    } else {
      if (loginBtn) loginBtn.style.display = 'flex';
      if (userBadge) userBadge.style.display = 'none';
    }
  }

  /* ---------------------------- Audio Event Listeners ---------------------------- */

  function setupAudioListeners() {
    AudioManager.onTimeUpdate((cur, dur, progress) => {
      const activeCard = $('#card-deck .active-card');
      if (!activeCard) return;

      const fill = activeCard.querySelector('.progress-fill');
      const timeLbl = activeCard.querySelector('.preview-time');
      if (fill) fill.style.width = `${progress * 100}%`;
      if (timeLbl) {
        const curM = Math.floor(cur / 60);
        const curS = Math.floor(cur % 60).toString().padStart(2, '0');
        const durM = Math.floor(dur / 60);
        const durS = Math.floor(dur % 60).toString().padStart(2, '0');
        timeLbl.textContent = `${curM}:${curS} / ${durM}:${durS}`;
      }
    });

    AudioManager.onStateChange((isPlaying) => {
      const activeCard = $('#card-deck .active-card');
      if (!activeCard) return;

      const icon = activeCard.querySelector('.preview-btn-icon');
      const soundWave = activeCard.querySelector('.sound-wave-bars');
      if (icon) icon.textContent = isPlaying ? '⏸' : '▶';
      if (soundWave) soundWave.classList.toggle('playing', isPlaying);

      const stage = activeCard.querySelector('.album-stage');
      if (stage) stage.classList.toggle('is-spinning', isPlaying);

      const dockPrevBtn = $('#btn-preview-toggle .dock-icon');
      if (dockPrevBtn) dockPrevBtn.textContent = isPlaying ? '⏸' : '▶';
    });
  }

  /* ---------------------------- Helpers ---------------------------- */

  function vibrate(ms) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  }

  function showToast(msg, icon = '🎵') {
    const toast = $('#toast');
    if (!toast) return;
    toast.querySelector('.toast-icon').textContent = icon;
    toast.querySelector('.toast-text').textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function showLoading(show) {
    const loader = $('#deck-loader');
    if (loader) loader.classList.toggle('show', show);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function triggerConfetti() {
    const container = $('#confetti-container');
    if (!container) return;
    const colors = ThemeManager.getCurrentColors();
    const pri = `rgb(${colors.pri.join(',')})`;
    const sec = `rgb(${colors.sec.join(',')})`;

    for (let i = 0; i < 28; i++) {
      const conf = document.createElement('div');
      conf.className = 'confetti-particle';
      const size = Math.random() * 6 + 4;
      conf.style.width = `${size}px`;
      conf.style.height = `${size * 1.4}px`;
      conf.style.background = Math.random() > 0.4 ? pri : sec;
      conf.style.left = `${window.innerWidth * 0.5}px`;
      conf.style.top = `${window.innerHeight * 0.65}px`;

      container.appendChild(conf);

      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 220 + 100;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity - 140;

      conf.animate([
        { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${vx}px, ${vy + 260}px) rotate(${Math.random() * 720}deg) scale(0)`, opacity: 0 }
      ], {
        duration: Math.random() * 700 + 600,
        easing: 'cubic-bezier(.25,1,.5,1)'
      }).onfinish = () => conf.remove();
    }
  }

  /* ---------------------------- Initialization & Event Binding ---------------------------- */

  async function init() {
    document.body.dataset.albumStyle = currentAlbumStyle;

    setupAudioListeners();
    const savedVol = parseFloat(localStorage.getItem('swipemobile_volume') || '0.85');
    AudioManager.setVolume(savedVol);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    loadSavedActivePlaylist();
    bindDomEvents();

    await handleOAuthCallback();

    const token = await getValidAccessToken();
    if (token) {
      await loadUserProfile();
      await loadUserPlaylists();
      if (activePlaylist.id) {
        await loadPlaylistTracks(activePlaylist.id);
      }
      await loadDiscoveryDeck();
    } else {
      updateAuthUi();
      openPlaylistSelectorSheet();
    }
  }

  function bindDomEvents() {
    // Action dock buttons
    $('#btn-pass')?.addEventListener('click', () => completeSwipe('left'));
    $('#btn-like')?.addEventListener('click', () => completeSwipe('right'));
    $('#btn-undo')?.addEventListener('click', () => undoLastSwipe());
    $('#btn-preview-toggle')?.addEventListener('click', () => handlePreviewButtonClick());
    $('#btn-dock-spotify')?.addEventListener('click', () => playFullTrackOnSpotify(deck[currentIndex]));

    // Playlist Selector Sheet Openers
    $('#active-playlist-pill')?.addEventListener('click', () => openPlaylistSelectorSheet());
    $('#btn-open-selector-from-drawer')?.addEventListener('click', () => {
      closePlaylistDrawer();
      openPlaylistSelectorSheet();
    });
    $('#btn-close-playlist-selector')?.addEventListener('click', () => closePlaylistSelectorSheet());
    $('#playlist-selector-overlay')?.addEventListener('click', () => closePlaylistSelectorSheet());

    // Quick Create Playlist from Selector Sheet
    $('#btn-quick-create-playlist')?.addEventListener('click', async () => {
      const input = $('#new-playlist-quick-input');
      const name = input?.value.trim() || 'My Swiped Playlist';
      try {
        showToast('Creating playlist on Spotify...', '⏳');
        const newPl = await createSpotifyPlaylist(name);
        if (input) input.value = '';
        closePlaylistSelectorSheet();
        await selectPlaylist(newPl.id, true);
        await loadDiscoveryDeck();
        showToast(`Created & selected "${name}"!`, '🎉');
      } catch (err) {
        showToast(`Create failed: ${err.message}`, '⚠️');
      }
    });

    // Track Drawer Openers
    $('#btn-view-playlist')?.addEventListener('click', () => openPlaylistDrawer());
    $('#btn-close-drawer')?.addEventListener('click', () => closePlaylistDrawer());
    $('#drawer-overlay')?.addEventListener('click', () => closePlaylistDrawer());

    // Drawer duplicate removal
    $('#btn-remove-duplicates')?.addEventListener('click', () => removeDuplicatesFromPlaylist());

    // Drawer open in Spotify App
    $('#btn-open-spotify-app')?.addEventListener('click', () => openActivePlaylistInSpotify());

    // Modals & Settings
    $('#btn-settings')?.addEventListener('click', () => openSettingsModal());
    $('#btn-close-settings')?.addEventListener('click', () => closeSettingsModal());
    $('#btn-spotify-login')?.addEventListener('click', () => loginWithSpotify());
    $('#btn-logout')?.addEventListener('click', () => logout());

    // Profile badge click: open active playlist or user profile in Spotify
    $('#user-profile-badge')?.addEventListener('click', () => {
      if (activePlaylist.id) {
        openActivePlaylistInSpotify();
      } else if (userProfile?.id) {
        window.location.href = `spotify:user:${userProfile.id}`;
      }
    });

    // Master volume slider in Settings
    const volSlider = $('#settings-vol-slider');
    volSlider?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value) / 100;
      AudioManager.setVolume(v);
      localStorage.setItem('swipemobile_volume', String(v));
      $('#settings-vol-label').textContent = `${Math.round(v * 100)}%`;
    });

    // Auto Preview toggle
    const autoPrevCheck = $('#auto-preview-checkbox');
    if (autoPrevCheck) {
      autoPrevCheck.checked = autoPlayPreviews;
      autoPrevCheck.addEventListener('change', (e) => {
        autoPlayPreviews = e.target.checked;
        localStorage.setItem('swipemobile_auto_preview', String(autoPlayPreviews));
      });
    }

    // Save custom Client ID
    $('#btn-save-client-id')?.addEventListener('click', () => {
      const val = $('#client-id-input').value.trim();
      if (val) {
        clientId = val;
        localStorage.setItem('swipemobile_client_id', clientId);
        showToast('Client ID saved!', '💾');
      }
    });
  }

  return {
    init,
    loadDeck: (tracks) => {
      deck = tracks;
      currentIndex = 0;
      renderCards();
      updateButtonStates();
      prefetchPreviewsForDeck();
      if (deck.length > 0 && autoPlayPreviews) {
        AudioManager.playTrack(deck[0], true);
      }
    },
    setAlbumFormat,
    openPlaylistDrawer,
    closePlaylistDrawer,
    openPlaylistSelectorSheet,
    closePlaylistSelectorSheet,
    playFullTrackOnSpotify,
    handlePreviewButtonClick,
    selectPlaylist
  };
})();

window.addEventListener('DOMContentLoaded', MobileApp.init);
