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

  // Spotify Configuration & Full Permissions
  const DEFAULT_CLIENT_ID = '2e9d00e15cc44cffaaba76a52f88e10a';
  const CLIENT_SECRET = 'e8ba4adf3d6d4f23b998fb1c932d4e63';
  const REQUIRED_SCOPE_VERSION = 'v2.1.2-full-perms';

  const SCOPES = [
    'playlist-modify-public',
    'playlist-modify-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-modify',
    'user-library-read',
    'user-read-private',
    'user-read-email',
    'user-top-read',
    'user-read-recently-played',
    'user-modify-playback-state',
    'user-read-playback-state',
    'user-read-currently-playing',
    'streaming'
  ].join(' ');

  // Automatic Scope Upgrade: clear old under-scoped tokens so full write perms are requested
  try {
    const savedScopeVer = localStorage.getItem('swipemobile_scope_version');
    if (savedScopeVer !== REQUIRED_SCOPE_VERSION) {
      localStorage.removeItem('swipemobile_access_token');
      localStorage.removeItem('swipemobile_refresh_token');
      localStorage.removeItem('swipemobile_expires_at');
      localStorage.setItem('swipemobile_scope_version', REQUIRED_SCOPE_VERSION);
    }
  } catch (e) {}

  // Comprehensive Error Code Reference System
  const ERROR_CODES = {
    ERR_AUTH_001: { code: 'ERR_AUTH_001', msg: 'Not signed into Spotify. Tap Connect to authorize your Spotify account.' },
    ERR_AUTH_002: { code: 'ERR_AUTH_002', msg: 'Spotify session expired. Re-authorizing your account...' },
    ERR_AUTH_003: { code: 'ERR_AUTH_003', msg: 'Spotify authorization cancelled by user.' },
    ERR_AUTH_004: { code: 'ERR_AUTH_004', msg: 'Spotify authorization code exchange failed. Please tap Connect to retry.' },
    ERR_SPOTIFY_401: { code: 'ERR_SPOTIFY_401', msg: 'Session unauthorized (401). Tap Connect to sign in.' },
    ERR_SPOTIFY_403: { code: 'ERR_SPOTIFY_403', msg: 'Forbidden (403): Playlist write permission required. Tap Connect to grant access.' },
    ERR_SPOTIFY_404: { code: 'ERR_SPOTIFY_404', msg: 'Not Found (404): Playlist or track not found on Spotify.' },
    ERR_SPOTIFY_429: { code: 'ERR_SPOTIFY_429', msg: 'Spotify API rate limit active. Automatically backing off and retrying...' },
    ERR_PLAYLIST_001: { code: 'ERR_PLAYLIST_001', msg: 'Playlist not owned. Switched to your own Spotify Swipe playlist.' },
    ERR_PLAYLIST_002: { code: 'ERR_PLAYLIST_002', msg: 'Could not create playlist on Spotify. Check account permissions.' },
    ERR_PLAYLIST_003: { code: 'ERR_PLAYLIST_003', msg: 'Failed to sync queue to Spotify. Tap Connect to re-verify permissions.' },
    ERR_TRACK_001: { code: 'ERR_TRACK_001', msg: 'Track already in playlist! Duplicates prevented.' },
    ERR_TRACK_002: { code: 'ERR_TRACK_002', msg: 'Could not resolve Spotify track URI.' },
    ERR_AUDIO_001: { code: 'ERR_AUDIO_001', msg: 'Studio preview unavailable. Tap Spotify icon to stream full song.' },
    ERR_AUDIO_002: { code: 'ERR_AUDIO_002', msg: 'Browser autoplay blocked. Tap any button or card to enable audio.' },
    ERR_AUDIO_003: { code: 'ERR_AUDIO_003', msg: 'Audio playback failed to decode track. Skipping to next song.' },
    ERR_DECK_EMPTY: { code: 'ERR_DECK_EMPTY', msg: 'Reached end of deck! Auto-discovering more songs for you...' },
    ERR_NET_001: { code: 'ERR_NET_001', msg: 'Device is offline. Check your internet connection.' }
  };

  function triggerError(errKey, customDetail = '', actionText = '', onAction = null) {
    const err = ERROR_CODES[errKey] || { code: errKey || 'ERR_UNKNOWN', msg: customDetail || 'An error occurred' };
    const displayMsg = customDetail ? `[${err.code}] ${customDetail}` : `[${err.code}] ${err.msg}`;
    console.warn(`[SpotifySwipe Error] ${displayMsg}`);
    showToast(displayMsg, '⚠️', actionText, onAction);
    return err;
  }

  // State
  let clientId = localStorage.getItem('swipemobile_client_id') || DEFAULT_CLIENT_ID;
  if (!clientId || clientId === '3e3a52392ee74be2a7635b15ab54c3c1') {
    clientId = DEFAULT_CLIENT_ID;
    localStorage.setItem('swipemobile_client_id', clientId);
  }

  let appAccessToken = null;
  let appTokenExpiresAt = 0;

  async function getSpotifyAppToken() {
    if (appAccessToken && Date.now() < appTokenExpiresAt - 60000) {
      return appAccessToken;
    }
    try {
      const basicAuth = btoa(`${DEFAULT_CLIENT_ID}:${CLIENT_SECRET}`);
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          appAccessToken = data.access_token;
          appTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
          return appAccessToken;
        }
      }
    } catch (e) {
      console.warn('[Spotify App Token] Client Credentials token error:', e);
    }
    return null;
  }

  let userProfile = null;
  let activePlaylist = {
    id: null,
    name: 'Spotify Swipe Jams',
    url: null,
    tracks: []
  };
  let existingTrackIds = new Set();
  let allUserPlaylists = [];
  let hasWritePermissionError = false;

  // Session deduplication & Dynamic Taste Learning
  const sessionSeenTrackKeys = new Set();
  let recentLikedArtists = [];
  try {
    const savedTaste = localStorage.getItem('swipemobile_taste_artists');
    if (savedTaste) recentLikedArtists = JSON.parse(savedTaste) || [];
  } catch (e) {}

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

  /* ---------------------------- Deduplication & Adaptive Taste Learning ---------------------------- */

  function getTrackKey(track) {
    if (!track) return '';
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanTitle = (track.name || '')
      .toLowerCase()
      .replace(/\s*-\s*(remastered|remaster|deluxe|radio edit|bonus track|single version).*/i, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .trim();
    const primaryArtist = (track.artist || '').split(/[,&]/)[0].trim();
    return `${norm(cleanTitle)}::${norm(primaryArtist)}`;
  }

  function isDuplicateTrack(track) {
    if (!track) return true;
    if (track.id && existingTrackIds.has(track.id)) return true;
    const key = getTrackKey(track);
    if (key && (sessionSeenTrackKeys.has(key) || sessionSeenTrackKeys.has(track.id))) return true;
    return false;
  }

  function markTrackSeen(track) {
    if (!track) return;
    if (track.id) sessionSeenTrackKeys.add(track.id);
    const key = getTrackKey(track);
    if (key) sessionSeenTrackKeys.add(key);
  }

  /**
   * Adaptive Taste Learning:
   * When you swipe right on an artist (e.g. Deftones), the engine automatically
   * branches and inserts more tracks by that artist and similar artists ahead in your feed!
   */
  async function learnUserTaste(track) {
    if (!track || !track.artist) return;
    const primaryArtist = track.artist.split(/[,&]/)[0].trim();
    if (!primaryArtist || primaryArtist.toLowerCase() === 'various artists') return;

    recentLikedArtists = recentLikedArtists.filter(a => a.toLowerCase() !== primaryArtist.toLowerCase());
    recentLikedArtists.unshift(primaryArtist);
    if (recentLikedArtists.length > 8) recentLikedArtists.pop();

    try {
      localStorage.setItem('swipemobile_taste_artists', JSON.stringify(recentLikedArtists));
    } catch (e) {}

    // Auto-seed more songs from this artist into upcoming deck
    await expandDeckWithArtist(primaryArtist);
  }

  let isExpandingArtist = false;
  async function expandDeckWithArtist(artistName) {
    if (!artistName || isExpandingArtist) return;
    isExpandingArtist = true;

    try {
      const token = await getValidAccessToken();
      let candidates = [];

      // 1. Query Spotify directly for more top songs by this artist
      if (token) {
        try {
          const res = await spotifyApi(`/search?q=${encodeURIComponent('artist:"' + artistName + '"')}&type=track&limit=25`);
          if (res && res.tracks?.items) {
            res.tracks.items.forEach(trk => {
              if (!trk || !trk.id || isDuplicateTrack(trk)) return;
              candidates.push({
                id: trk.id,
                uri: trk.uri,
                name: trk.name,
                artist: trk.artists?.map(a => a.name).join(', ') || artistName,
                album: trk.album?.name || '',
                year: trk.album?.release_date ? trk.album.release_date.split('-')[0] : '',
                total_tracks: trk.album?.total_tracks || 1,
                cover_url: trk.album?.images?.[0]?.url || '',
                preview_url: trk.preview_url,
                duration_ms: trk.duration_ms,
                spotify_url: trk.external_urls?.spotify,
                plays: Math.floor(Math.random() * 45) + 15,
                bpm: Math.floor(Math.random() * 40) + 105
              });
            });
          }
        } catch (spErr) {
          console.warn('[Taste] Spotify artist search error:', spErr);
        }
      }

      // 2. Complement / fallback with Deezer search for that artist
      if (candidates.length < 8) {
        try {
          const dzList = await fetchDeezerSearchTracks(`artist:"${artistName}"`);
          const filteredDz = (dzList || []).filter(t => !isDuplicateTrack(t));
          candidates = candidates.concat(filteredDz);
        } catch (dzErr) {
          console.warn('[Taste] Deezer artist search error:', dzErr);
        }
      }

      const freshTracks = candidates.filter(t => !isDuplicateTrack(t));
      if (freshTracks.length > 0) {
        freshTracks.forEach(t => markTrackSeen(t));

        // Insert first 3 tracks just 2 cards ahead so user discovers them quickly
        const nextBatch = freshTracks.slice(0, 3);
        const tailBatch = freshTracks.slice(3);

        const insertPos = Math.min(currentIndex + 2, deck.length);
        deck.splice(insertPos, 0, ...nextBatch);
        if (tailBatch.length > 0) {
          deck.push(...tailBatch);
        }

        prefetchPreviewsForDeck();
        console.log(`[Taste] Auto-expanded feed with ${freshTracks.length} tracks for artist: "${artistName}"!`);
      }
    } catch (e) {
      console.warn('[Taste] expandDeckWithArtist error:', e);
    } finally {
      isExpandingArtist = false;
    }
  }

  /* ---------------------------- 100% Direct Spotify PKCE Authentication (No Third-Party APIs) ---------------------------- */

  function getRedirectUri() {
    const loc = window.location;
    let path = loc.pathname;
    if (path.endsWith('/index.html')) {
      path = path.slice(0, -10);
    }
    if (!path.endsWith('/')) {
      path += '/';
    }
    return loc.origin + path;
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

  function isForbiddenError(e) {
    if (!e) return false;
    const msg = (e.message || String(e)).toLowerCase();
    return msg.includes('forbidden') || msg.includes('403') || msg.includes('permission') || msg.includes('scope');
  }

  async function loginWithSpotify() {
    AudioManager.unlockMobileAudio();

    // Clear old tokens to guarantee write scopes are freshly requested
    localStorage.removeItem('swipemobile_access_token');
    localStorage.removeItem('swipemobile_refresh_token');
    localStorage.removeItem('swipemobile_expires_at');

    // 100% Direct Spotify PKCE to Jack's Spotify App
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
    authUrl.searchParams.set('show_dialog', 'true');
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', challenge);

    window.location.href = authUrl.toString();
  }

  async function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      showToast(`Login cancelled: ${error}`, '⚠️');
      window.history.replaceState({}, document.title, getRedirectUri());
      return false;
    }

    if (!code) return false;

    const verifier = localStorage.getItem('swipemobile_code_verifier');
    if (!verifier) return false;

    const redirectUri = getRedirectUri();
    showToast('Authorizing with your Spotify App...', '⏳');

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
        localStorage.setItem('swipemobile_expires_at', String(Date.now() + (data.expires_in || 3600) * 1000));
        localStorage.removeItem('swipemobile_code_verifier');
        hasWritePermissionError = false;
        showToast('Connected to Spotify App!', '💚');
        return true;
      } else {
        showToast(`Spotify Auth: ${data.error_description || data.error}`, '⚠️');
      }
    } catch (err) {
      console.error('[PKCE] Token exchange error:', err);
      showToast('Could not complete Spotify authorization.', '⚠️');
    } finally {
      window.history.replaceState({}, document.title, getRedirectUri());
    }
    return false;
  }

  async function getValidAccessToken() {
    let token = localStorage.getItem('swipemobile_access_token');
    const expiresAt = parseInt(localStorage.getItem('swipemobile_expires_at') || '0', 10);
    const refreshToken = localStorage.getItem('swipemobile_refresh_token');

    if (token && Date.now() < expiresAt - 60000) {
      return token;
    }

    if (!refreshToken) {
      return null;
    }

    // Direct PKCE refresh via Spotify accounts API
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
        localStorage.setItem('swipemobile_expires_at', String(Date.now() + (data.expires_in || 3600) * 1000));
        return token;
      }
    } catch (e) {
      console.warn('[PKCE] Token refresh failed:', e);
    }

    return null;
  }

  async function spotifyApi(endpoint, options = {}, allowAppAuth = true) {
    let token = await getValidAccessToken();
    if (!token && allowAppAuth) {
      token = await getSpotifyAppToken();
    }
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
      const errMsg = errBody.error?.message || `HTTP ${res.status}`;
      const err = new Error(errMsg);
      err.status = res.status;
      throw err;
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

  /* ---------------------------- Audio Preview & Multi-tier Resolver ---------------------------- */

  function cleanTrackTitleForSearch(name, artist) {
    const title = (name || '')
      .replace(/\(.*?(remaster|edition|version|deluxe|feat\.|ft\.).*?\)/gi, '')
      .replace(/\[.*?(remaster|edition|version|deluxe|feat\.|ft\.).*?\]/gi, '')
      .replace(/-.*?(remaster|deluxe|version|radio edit).*$/gi, '')
      .replace(/[^\w\s]/gi, ' ')
      .trim();
    const art = (artist || '')
      .split(',')[0]
      .replace(/\b(feat|ft)\b.*$/gi, '')
      .replace(/[^\w\s]/gi, ' ')
      .trim();
    return (title + ' ' + art).replace(/\s+/g, ' ').trim();
  }

  function fetchDeezerPreview(title, artist) {
    return new Promise((resolve) => {
      const cbName = 'dz_cb_' + Math.random().toString(36).substring(2, 9);
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 3500);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        script.remove();
      }

      window[cbName] = (data) => {
        cleanup();
        if (data && data.data && data.data.length > 0 && data.data[0].preview) {
          resolve(data.data[0].preview);
        } else {
          resolve(null);
        }
      };

      script.onerror = () => {
        cleanup();
        resolve(null);
      };

      const q = encodeURIComponent(`${title} ${artist}`.replace(/[^\w\s]/g, ' ').trim());
      script.src = `https://api.deezer.com/search?q=${q}&limit=1&output=jsonp&callback=${cbName}`;
      document.head.appendChild(script);
    });
  }

  function fetchDeezerSearchTracks(query) {
    return new Promise((resolve) => {
      const cbName = 'dz_search_' + Math.random().toString(36).substring(2, 9);
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 5000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        script.remove();
      }

      window[cbName] = (data) => {
        cleanup();
        if (data && data.data && Array.isArray(data.data)) {
          const list = data.data.map(t => ({
            id: `dz-${t.id}`,
            name: t.title,
            artist: t.artist?.name || 'Unknown Artist',
            album: t.album?.title || '',
            year: t.album?.release_date ? t.album.release_date.split('-')[0] : '2025',
            total_tracks: 1,
            cover_url: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || '',
            preview_url: t.preview,
            duration_ms: (t.duration || 30) * 1000,
            spotify_url: null,
            plays: Math.floor(Math.random() * 45) + 20,
            bpm: Math.floor(Math.random() * 35) + 110
          }));
          resolve(list);
        } else {
          resolve([]);
        }
      };

      script.onerror = () => {
        cleanup();
        resolve([]);
      };

      const q = encodeURIComponent(query.replace(/[^\w\s:"]/g, ' ').trim());
      script.src = `https://api.deezer.com/search?q=${q}&limit=25&output=jsonp&callback=${cbName}`;
      document.head.appendChild(script);
    });
  }

  function fetchDeezerChart() {
    return new Promise((resolve) => {
      const cbName = 'dz_chart_' + Math.random().toString(36).substring(2, 9);
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 5000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        script.remove();
      }

      window[cbName] = (data) => {
        cleanup();
        if (data && data.data && Array.isArray(data.data)) {
          const list = data.data.map(t => ({
            id: `dz-${t.id}`,
            name: t.title,
            artist: t.artist?.name || 'Unknown Artist',
            album: t.album?.title || '',
            year: t.album?.release_date ? t.album.release_date.split('-')[0] : '2025',
            total_tracks: 1,
            cover_url: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || '',
            preview_url: t.preview,
            duration_ms: (t.duration || 30) * 1000,
            spotify_url: null,
            plays: Math.floor(Math.random() * 45) + 20,
            bpm: Math.floor(Math.random() * 35) + 110
          }));
          resolve(list);
        } else {
          resolve([]);
        }
      };

      script.onerror = () => {
        cleanup();
        resolve([]);
      };

      script.src = `https://api.deezer.com/chart/0/tracks?limit=50&output=jsonp&callback=${cbName}`;
      document.head.appendChild(script);
    });
  }

  function isPreviewMatch(item, expectedTitle, expectedArtist) {
    if (!item) return false;
    const itemTitle = (item.trackName || item.title || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const itemArtist = (item.artistName || item.artist?.name || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanExpectedTitle = (expectedTitle || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanExpectedArtist = (expectedArtist || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Primary artist token match
    const firstArtist = cleanExpectedArtist.split(/[,&]/)[0].trim();
    const artistOk = itemArtist.includes(firstArtist) || firstArtist.includes(itemArtist);
    if (!artistOk) return false;

    // Both titles must have at least 70% word overlap
    const titleWords = cleanExpectedTitle.split(' ').filter(w => w.length > 2);
    if (titleWords.length === 0) return true;
    const matchedCount = titleWords.filter(w => itemTitle.includes(w)).length;
    return (matchedCount / titleWords.length) >= 0.70;
  }

  async function resolvePreviewUrl(track) {
    if (!track) return null;
    if (track.preview_url) return track.preview_url;
    if (previewCache.has(track.id)) {
      track.preview_url = previewCache.get(track.id);
      return track.preview_url;
    }

    // Tier 1: Apple Music / iTunes Search API with strict track & artist match
    const query = cleanTrackTitleForSearch(track.name, track.artist);
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const match = data.results.find(r => r.previewUrl && isPreviewMatch(r, track.name, track.artist));
          if (match && match.previewUrl) {
            previewCache.set(track.id, match.previewUrl);
            track.preview_url = match.previewUrl;
            return match.previewUrl;
          }
        }
      }
    } catch (e) {
      console.warn('[Preview] iTunes search error:', e);
    }

    // Tier 2: Deezer MP3 preview with strict validation
    try {
      const pUrl = await fetchDeezerPreview(track.name, track.artist);
      if (pUrl) {
        previewCache.set(track.id, pUrl);
        track.preview_url = pUrl;
        return pUrl;
      }
    } catch (e) {
      console.warn('[Preview] Deezer fallback error:', e);
    }

    // If no validated match, set to null so we NEVER play a random/incorrect song
    return null;
  }

  /**
   * Pre-fetches preview audio for upcoming cards so play is instantaneous on mobile
   */
  async function prefetchPreviewsForDeck() {
    const batch = deck.slice(currentIndex, currentIndex + 6);
    await Promise.all(batch.map(trk => resolvePreviewUrl(trk)));
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
        const timeEl = $('.active-card .preview-time');
        if (timeEl) timeEl.textContent = 'Finding music...';
        resolvePreviewUrl(track).then(pUrl => {
          if (pUrl && deck[currentIndex]?.id === track.id) {
            AudioManager.playTrack(track, true);
          } else {
            if (timeEl) timeEl.textContent = 'Preview unavailable';
            showToast('Preview unavailable — opening Spotify', 'ℹ️');
            playFullTrackOnSpotify(track);
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

      // If no active playlist is selected yet, choose user's owned Spotify Swipe playlist or create one
      if (!activePlaylist.id && allUserPlaylists.length > 0) {
        const ownedSwipe = allUserPlaylists.find(p => 
          p.name && p.name.toLowerCase().includes('spotify swipe') &&
          userProfile && p.owner?.id === userProfile.id
        );
        if (ownedSwipe) {
          await selectPlaylist(ownedSwipe.id, false);
        } else {
          const firstOwned = allUserPlaylists.find(p => userProfile && p.owner?.id === userProfile.id);
          if (firstOwned) {
            await selectPlaylist(firstOwned.id, false);
          }
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
    activePlaylist.owner = pl.owner;
    activePlaylist.collaborative = pl.collaborative;
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
      const data = await spotifyApi(`/playlists/${playlistId}/tracks?limit=100`, {}, false);
      const remoteTracks = [];

      (data.items || []).forEach(item => {
        if (!item || !item.track) return;
        const t = item.track;
        if (!t || !t.id) return;
        existingTrackIds.add(t.id);
        remoteTracks.push({
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

      // Combine remote tracks with any locally queued songs
      const combined = [...remoteTracks];
      const seenIds = new Set(remoteTracks.map(r => r.id));
      (activePlaylist.tracks || []).forEach(localTrack => {
        if (localTrack && localTrack.id && !seenIds.has(localTrack.id)) {
          seenIds.add(localTrack.id);
          existingTrackIds.add(localTrack.id);
          combined.push(localTrack);
        }
      });

      activePlaylist.tracks = combined;
      saveActivePlaylistMeta();
      updatePlaylistStatsUi();
      renderDrawerTracks();
      renderDesktopQueue();
      return combined;
    } catch (e) {
      console.warn('[Spotify] Load playlist tracks error:', e);
      return activePlaylist.tracks || [];
    }
  }

  async function createSpotifyPlaylist(name) {
    if (!userProfile) userProfile = await loadUserProfile();
    if (!userProfile) throw new Error('Please login with Spotify to create playlists.');

    const plName = (name || 'Spotify Swipe Jams').trim();
    const preservedTracks = Array.isArray(activePlaylist.tracks) ? [...activePlaylist.tracks] : [];

    // Check if user already owns a playlist with this name - REUSE IT to prevent mass playlist creation!
    if (!allUserPlaylists || allUserPlaylists.length === 0) {
      await loadUserPlaylists().catch(() => {});
    }

    const existingMatch = allUserPlaylists.find(p =>
      p && p.name && p.name.trim().toLowerCase() === plName.toLowerCase() &&
      p.owner && userProfile && p.owner.id === userProfile.id
    );

    if (existingMatch) {
      console.log(`[Spotify] Reusing existing playlist "${plName}" (${existingMatch.id}) instead of creating duplicate.`);
      activePlaylist.id = existingMatch.id;
      activePlaylist.name = existingMatch.name;
      activePlaylist.owner = existingMatch.owner || userProfile;
      activePlaylist.url = existingMatch.external_urls?.spotify;
      if (preservedTracks.length > 0 && (!activePlaylist.tracks || activePlaylist.tracks.length === 0)) {
        activePlaylist.tracks = preservedTracks;
      }
      saveActivePlaylistMeta();
      updatePlaylistStatsUi();
      renderPlaylistCards();
      renderDesktopQueue();
      await loadPlaylistTracks(existingMatch.id);
      return existingMatch;
    }

    let newPl = null;

    // Try 1: POST /me/playlists with public: true
    try {
      newPl = await spotifyApi('/me/playlists', {
        method: 'POST',
        body: JSON.stringify({
          name: plName,
          description: 'Curated with Spotify Swipe 💚',
          public: true
        })
      }, false);
    } catch (e1) {
      console.warn('[Create Playlist] /me/playlists public failed:', e1.message);
    }

    // Try 2: POST /me/playlists with public: false
    if (!newPl) {
      try {
        newPl = await spotifyApi('/me/playlists', {
          method: 'POST',
          body: JSON.stringify({
            name: plName,
            description: 'Curated with Spotify Swipe 💚',
            public: false
          })
        }, false);
      } catch (e2) {
        console.warn('[Create Playlist] /me/playlists private failed:', e2.message);
      }
    }

    // Try 3: POST /users/{userProfile.id}/playlists with public: true
    if (!newPl && userProfile.id) {
      try {
        newPl = await spotifyApi(`/users/${userProfile.id}/playlists`, {
          method: 'POST',
          body: JSON.stringify({
            name: plName,
            description: 'Curated with Spotify Swipe 💚',
            public: true
          })
        }, false);
      } catch (e3) {
        console.warn('[Create Playlist] /users/{id} public failed:', e3.message);
      }
    }

    // Try 4: POST /users/{userProfile.id}/playlists with public: false
    if (!newPl && userProfile.id) {
      try {
        newPl = await spotifyApi(`/users/${userProfile.id}/playlists`, {
          method: 'POST',
          body: JSON.stringify({
            name: plName,
            description: 'Curated with Spotify Swipe 💚',
            public: false
          })
        }, false);
      } catch (e4) {
        throw new Error(e4.message || 'Could not create playlist on Spotify');
      }
    }

    if (!newPl || !newPl.id) {
      throw new Error('Spotify playlist creation returned no ID');
    }

    activePlaylist.id = newPl.id;
    activePlaylist.name = newPl.name;
    activePlaylist.owner = newPl.owner || userProfile;
    activePlaylist.url = newPl.external_urls?.spotify;
    activePlaylist.tracks = preservedTracks;
    saveActivePlaylistMeta();
    updatePlaylistStatsUi();

    await loadUserPlaylists().catch(() => {});
    renderDesktopQueue();
    return newPl;
  }

  async function ensureEditablePlaylist() {
    const token = await getValidAccessToken();
    if (!token) return null;

    if (!userProfile) {
      userProfile = await loadUserProfile().catch(() => null);
    }
    if (!userProfile) {
      triggerError('ERR_AUTH_001', 'Please connect with Spotify first.', 'Connect', () => loginWithSpotify());
      return null;
    }

    // 1. Verify if current activePlaylist is owned by current user and writable
    if (activePlaylist.id) {
      try {
        const pl = await spotifyApi(`/playlists/${activePlaylist.id}?fields=id,name,owner,collaborative,external_urls`, {}, false);
        if (pl && pl.id) {
          const isOwner = pl.owner && pl.owner.id === userProfile.id;
          if (isOwner || pl.collaborative) {
            activePlaylist.id = pl.id;
            activePlaylist.name = pl.name;
            activePlaylist.owner = pl.owner;
            activePlaylist.collaborative = pl.collaborative;
            activePlaylist.url = pl.external_urls?.spotify;
            saveActivePlaylistMeta();
            return activePlaylist.id;
          }
        }
      } catch (checkErr) {
        console.warn('[Playlist check] Existing playlist invalid or inaccessible:', checkErr.message);
      }
    }

    // 2. Search for any existing user-owned playlist matching target name or "spotify swipe"
    if (!allUserPlaylists || allUserPlaylists.length === 0) {
      await loadUserPlaylists().catch(() => {});
    }

    const targetName = (activePlaylist.name || 'Spotify Swipe Jams').trim().toLowerCase();
    const existingExact = allUserPlaylists.find(p =>
      p && p.name && p.name.trim().toLowerCase() === targetName &&
      p.owner && userProfile && p.owner.id === userProfile.id
    );
    if (existingExact) {
      await selectPlaylist(existingExact.id, false);
      return existingExact.id;
    }

    const ownedSwipe = allUserPlaylists.find(p => 
      p && p.name && p.name.toLowerCase().includes('spotify swipe') &&
      p.owner && userProfile && p.owner.id === userProfile.id
    );
    if (ownedSwipe) {
      await selectPlaylist(ownedSwipe.id, false);
      return ownedSwipe.id;
    }

    // 3. Fallback to any owned playlist
    const anyOwned = allUserPlaylists.find(p => p && p.owner && userProfile && p.owner.id === userProfile.id);
    if (anyOwned) {
      await selectPlaylist(anyOwned.id, false);
      return anyOwned.id;
    }

    // 4. Create new dedicated user playlist "Spotify Swipe Jams" if none exist
    try {
      showToast('Setting up "Spotify Swipe Jams" on your Spotify...', '⏳');
      const created = await createSpotifyPlaylist('Spotify Swipe Jams');
      return created.id;
    } catch (createErr) {
      console.warn('[Playlist creation failed]', createErr.message);
      return null;
    }
  }

  async function getOrCreateDefaultSwipePlaylist() {
    return await ensureEditablePlaylist();
  }

  async function syncAllToSpotify() {
    const token = await getValidAccessToken();
    if (!token) {
      triggerError('ERR_AUTH_001', 'Please connect with Spotify first.', 'Connect', () => loginWithSpotify());
      openPlaylistSelectorSheet();
      return;
    }

    if (activePlaylist.tracks.length === 0) {
      showToast('No tracks in queue to sync!', 'ℹ️');
      return;
    }

    showToast(`Syncing ${activePlaylist.tracks.length} tracks to Spotify...`, '⏳');
    try {
      const targetPlaylistId = await ensureEditablePlaylist();
      if (!targetPlaylistId) {
        triggerError('ERR_PLAYLIST_002', 'Could not access or create target playlist on Spotify.');
        return;
      }

      // 1. Ensure any missing Spotify URIs from global charts are resolved
      for (const t of activePlaylist.tracks) {
        if (!t.uri || !t.uri.startsWith('spotify:track:')) {
          try {
            const q = cleanTrackTitleForSearch(t.name, t.artist);
            const searchRes = await spotifyApi(`/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {}, true);
            if (searchRes.tracks?.items?.[0]) {
              t.uri = searchRes.tracks.items[0].uri;
              t.id = searchRes.tracks.items[0].id;
            }
          } catch (e) {}
        }
      }

      const uris = activePlaylist.tracks
        .map(t => t.uri || (t.id && !t.id.startsWith('demo-') && !t.id.startsWith('dz-') ? `spotify:track:${t.id}` : null))
        .filter(Boolean);

      if (uris.length === 0) {
        showToast('All queued tracks are demo songs.', 'ℹ️');
        return;
      }

      // 2. Fetch existing playlist tracks to avoid duplicate additions
      let remoteTrackUris = new Set();
      try {
        const curItems = await spotifyApi(`/playlists/${targetPlaylistId}/tracks?limit=100`, {}, false);
        if (curItems && curItems.items) {
          curItems.items.forEach(it => {
            if (it && it.track && it.track.uri) remoteTrackUris.add(it.track.uri);
          });
        }
      } catch (e) {}

      const newUris = uris.filter(u => !remoteTrackUris.has(u));

      // 3. Add to target playlist in chunks of 50
      if (newUris.length > 0) {
        for (let i = 0; i < newUris.length; i += 50) {
          const chunk = newUris.slice(i, i + 50);
          await spotifyApi(`/playlists/${targetPlaylistId}/tracks`, {
            method: 'POST',
            body: JSON.stringify({ uris: chunk })
          }, false);
        }
      }

      // 4. ALSO save tracks directly to user's Liked Songs library!
      const trackIds = activePlaylist.tracks
        .map(t => t.id && !t.id.startsWith('dz-') && !t.id.startsWith('demo-') ? t.id : (t.uri && t.uri.startsWith('spotify:track:') ? t.uri.split(':')[2] : null))
        .filter(Boolean);
      if (trackIds.length > 0) {
        try {
          for (let i = 0; i < trackIds.length; i += 50) {
            const chunkIds = trackIds.slice(i, i + 50);
            await spotifyApi('/me/tracks', {
              method: 'PUT',
              body: JSON.stringify({ ids: chunkIds })
            }, false);
          }
        } catch (libErr) {
          console.warn('[Sync to Library notice]', libErr.message);
        }
      }

      hasWritePermissionError = false;
      renderDesktopQueue();
      showToast(`Synced ${uris.length} tracks to Spotify "${activePlaylist.name}"!`, '🎉');
      vibrate(50);
    } catch (e) {
      if (isForbiddenError(e)) {
        hasWritePermissionError = true;
        renderDesktopQueue();
        triggerError('ERR_SPOTIFY_403', 'Write access required. Click below to grant permissions.', 'Grant Access', () => loginWithSpotify());
      } else if (e.message && e.message.includes('404')) {
        triggerError('ERR_SPOTIFY_404', 'Playlist not found on Spotify. Switched to your own playlist.');
      } else {
        triggerError('ERR_PLAYLIST_003', `Sync notice: ${e.message}`);
      }
    }
  }

  async function addTrackToSpotifyPlaylist(track) {
    if (!track) return false;
    if (existingTrackIds.has(track.id)) {
      triggerError('ERR_TRACK_001', `"${track.name}" already in playlist.`);
      return false;
    }

    // 1. Always record locally in active playlist and display in sidebar
    existingTrackIds.add(track.id);
    activePlaylist.tracks.push(track);
    saveActivePlaylistMeta();
    updatePlaylistStatsUi();
    renderDrawerTracks();
    renderDesktopQueue();
    vibrate(30);

    // Adaptive music learning: automatically discover more of this artist (e.g. Deftones) & similar vibe
    if (track.artist) {
      learnUserTaste(track);
    }

    const token = await getValidAccessToken();
    if (!token) {
      showToast(`Saved "${track.name}" in queue!`, '💚', 'Connect', () => loginWithSpotify());
      return true;
    }

    try {
      const targetPlaylistId = await ensureEditablePlaylist();
      if (targetPlaylistId) {
        let trackUri = track.uri || (track.id && !track.id.startsWith('demo-') && !track.id.startsWith('dz-') ? `spotify:track:${track.id}` : null);
        
        // If track is from global chart, search Spotify to find its real Spotify URI!
        if (!trackUri && token) {
          try {
            const q = cleanTrackTitleForSearch(track.name, track.artist);
            const searchRes = await spotifyApi(`/search?q=${encodeURIComponent(q)}&type=track&limit=1`);
            if (searchRes.tracks?.items?.[0]) {
              trackUri = searchRes.tracks.items[0].uri;
              track.uri = trackUri;
            }
          } catch (searchErr) {
            console.warn('[Spotify Search] Could not find URI:', searchErr);
          }
        }

        if (!trackUri) {
          showToast(`Saved "${track.name}" in queue!`, '💚');
          return true;
        }

        try {
          await spotifyApi(`/playlists/${targetPlaylistId}/tracks`, {
            method: 'POST',
            body: JSON.stringify({
              uris: [trackUri]
            })
          }, false);

          // Also add to user's Liked Songs library
          const trkId = track.id && !track.id.startsWith('dz-') && !track.id.startsWith('demo-') ? track.id : trackUri.split(':')[2];
          if (trkId) {
            spotifyApi('/me/tracks', {
              method: 'PUT',
              body: JSON.stringify({ ids: [trkId] })
            }, false).catch(() => {});
          }

          hasWritePermissionError = false;
          showToast(`Added "${track.name}" to Spotify "${activePlaylist.name}"!`, '💚');
          return true;
        } catch (addErr) {
          if (isForbiddenError(addErr) || (addErr.message && addErr.message.includes('404'))) {
            try {
              const fallbackPl = await createSpotifyPlaylist('Spotify Swipe Jams');
              await spotifyApi(`/playlists/${fallbackPl.id}/tracks`, {
                method: 'POST',
                body: JSON.stringify({ uris: [trackUri] })
              });
              hasWritePermissionError = false;
              showToast(`Added "${track.name}" to your "Spotify Swipe Jams"!`, '🎉');
              renderDesktopQueue();
              return true;
            } catch (fbErr) {
              if (isForbiddenError(fbErr)) {
                hasWritePermissionError = true;
                renderDesktopQueue();
                triggerError('ERR_SPOTIFY_403', 'Write access required to auto-add to Spotify.', 'Grant Access', () => loginWithSpotify());
                return true;
              }
            }
          }
          throw addErr;
        }
      }
    } catch (e) {
      console.warn('[Spotify] Playlist sync warning:', e);
      if (isForbiddenError(e)) {
        hasWritePermissionError = true;
        renderDesktopQueue();
        triggerError('ERR_SPOTIFY_403', 'Write access required to auto-add to Spotify.', 'Grant Access', () => loginWithSpotify());
      } else {
        showToast(`Saved "${track.name}" in queue!`, '💚');
      }
      return true;
    }

    return true;
  }

  async function removeTrackFromPlaylist(trackId, trackUri, trackName = '') {
    if (!trackId) return;

    // 1. Instantly remove locally from active queue and UI so user is never blocked!
    const targetTrack = activePlaylist.tracks.find(t => t.id === trackId);
    const displayName = trackName || targetTrack?.name || 'Song';
    const effectiveUri = trackUri || targetTrack?.uri;

    existingTrackIds.delete(trackId);
    activePlaylist.tracks = activePlaylist.tracks.filter(t => t.id !== trackId);
    saveActivePlaylistMeta();
    updatePlaylistStatsUi();
    renderDrawerTracks();
    renderDesktopQueue();
    vibrate(25);
    showToast(`Removed "${displayName}" from playlist.`, '🗑️');

    // 2. Asynchronously attempt removal from Spotify in the background
    const token = await getValidAccessToken();
    if (token && activePlaylist.id && effectiveUri && effectiveUri.startsWith('spotify:track:')) {
      try {
        await spotifyApi(`/playlists/${activePlaylist.id}/tracks`, {
          method: 'DELETE',
          body: JSON.stringify({
            tracks: [{ uri: effectiveUri }]
          })
        });
      } catch (e) {
        console.warn('[Spotify] Remote track delete warning:', e.message);
      }
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

  /* ---------------------------- Multi-Source Discovery Engine ---------------------------- */

  let currentDiscoverySource = localStorage.getItem('swipemobile_discovery_source') || 'global';

  function setDiscoverySource(source) {
    if (!['global', 'spotify-featured', 'spotify-personal'].includes(source)) return;
    currentDiscoverySource = source;
    localStorage.setItem('swipemobile_discovery_source', source);
    updateDiscoverySourceUi();
    loadDiscoveryDeck();
    showToast(`Switched to ${source === 'global' ? 'Global Trending' : (source === 'spotify-featured' ? 'Spotify Hits' : 'My Favorites')}`, '✨');
  }

  function updateDiscoverySourceUi() {
    const pillIcon = $('#source-pill-icon');
    const pillLabel = $('#source-pill-label');
    const srcMap = {
      'global': { icon: '🔥', label: 'Global Hits' },
      'spotify-featured': { icon: '🟢', label: 'Spotify Hits' },
      'spotify-personal': { icon: '⭐', label: 'My Spotify' }
    };
    const cur = srcMap[currentDiscoverySource] || srcMap['global'];
    if (pillIcon) pillIcon.textContent = cur.icon;
    if (pillLabel) pillLabel.textContent = cur.label;

    document.querySelectorAll('.source-card-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.source === currentDiscoverySource);
    });
  }

  async function fetchSpotifyFeaturedDeck() {
    const pool = [];
    try {
      // 1. Featured Playlists (e.g. Today's Top Hits, Pop Rising)
      const feat = await spotifyApi('/browse/featured-playlists?limit=5');
      if (feat && feat.playlists?.items?.length > 0) {
        const topPl = feat.playlists.items[0];
        const plTracks = await spotifyApi(`/playlists/${topPl.id}/tracks?limit=50`);
        if (plTracks && plTracks.items) {
          plTracks.items.forEach(item => {
            const trk = item.track;
            if (!trk || !trk.id || existingTrackIds.has(trk.id)) return;
            pool.push({
              id: trk.id,
              uri: trk.uri,
              name: trk.name,
              artist: trk.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
              album: trk.album?.name || '',
              year: trk.album?.release_date ? trk.album.release_date.split('-')[0] : '',
              total_tracks: trk.album?.total_tracks || 1,
              cover_url: trk.album?.images?.[0]?.url || '',
              preview_url: trk.preview_url,
              duration_ms: trk.duration_ms,
              spotify_url: trk.external_urls?.spotify,
              plays: Math.floor(Math.random() * 45) + 12,
              bpm: Math.floor(Math.random() * 40) + 105
            });
          });
        }
      }
    } catch (e) {
      console.warn('[Spotify] Featured playlist fetch error:', e);
    }
    return pool;
  }

  async function fetchSpotifyPersonalDeck() {
    const pool = [];
    try {
      const [topShort, topMed, recent] = await Promise.allSettled([
        spotifyApi('/me/top/tracks?limit=50&time_range=short_term'),
        spotifyApi('/me/top/tracks?limit=50&time_range=medium_term'),
        spotifyApi('/me/player/recently-played?limit=50')
      ]);

      function ingest(trk) {
        if (!trk || !trk.id || existingTrackIds.has(trk.id)) return;
        pool.push({
          id: trk.id,
          uri: trk.uri,
          name: trk.name,
          artist: trk.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
          album: trk.album?.name || '',
          year: trk.album?.release_date ? trk.album.release_date.split('-')[0] : '',
          total_tracks: trk.album?.total_tracks || 1,
          cover_url: trk.album?.images?.[0]?.url || '',
          preview_url: trk.preview_url,
          duration_ms: trk.duration_ms,
          spotify_url: trk.external_urls?.spotify,
          plays: Math.floor(Math.random() * 45) + 12,
          bpm: Math.floor(Math.random() * 40) + 105
        });
      }

      if (topShort.status === 'fulfilled' && topShort.value?.items) topShort.value.items.forEach(ingest);
      if (topMed.status === 'fulfilled' && topMed.value?.items) topMed.value.items.forEach(ingest);
      if (recent.status === 'fulfilled' && recent.value?.items) recent.value.items.forEach(item => ingest(item.track));
    } catch (e) {
      console.warn('[Spotify] Personal deck fetch error:', e);
    }
    return pool;
  }

  async function fetchSpotifySearchTracks(query) {
    try {
      const res = await spotifyApi(`/search?q=${encodeURIComponent(query)}&type=track&limit=25`, {}, true);
      const list = [];
      if (res && res.tracks?.items) {
        res.tracks.items.forEach(trk => {
          if (!trk || !trk.id || isDuplicateTrack(trk)) return;
          list.push({
            id: trk.id,
            uri: trk.uri,
            name: trk.name,
            artist: trk.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
            album: trk.album?.name || '',
            year: trk.album?.release_date ? trk.album.release_date.split('-')[0] : '2025',
            total_tracks: trk.album?.total_tracks || 1,
            cover_url: trk.album?.images?.[0]?.url || '',
            preview_url: trk.preview_url,
            duration_ms: trk.duration_ms,
            spotify_url: trk.external_urls?.spotify,
            plays: Math.floor(Math.random() * 45) + 15,
            bpm: Math.floor(Math.random() * 40) + 105
          });
        });
      }
      return list;
    } catch (e) {
      console.warn('[Spotify Search] error:', e);
      return [];
    }
  }

  let isReplenishing = false;
  async function replenishDeckIfNeeded() {
    if (isReplenishing) return;
    const remaining = deck.length - currentIndex;
    if (remaining > 6) return;

    isReplenishing = true;
    try {
      let newTracks = [];

      // 1. If user has recently liked artists (e.g. Deftones), fetch more of their songs from Spotify!
      if (recentLikedArtists.length > 0) {
        for (const artist of recentLikedArtists.slice(0, 3)) {
          const sp = await fetchSpotifySearchTracks(`artist:"${artist}"`);
          newTracks.push(...sp);
        }
      }

      // 2. Fetch fresh tracks from Spotify
      if (newTracks.length < 15) {
        const feat = await fetchSpotifyFeaturedDeck();
        newTracks.push(...feat);
      }

      // 3. Complement with general Spotify hits search
      if (newTracks.length < 15) {
        const hits = await fetchSpotifySearchTracks('year:2024-2025');
        newTracks.push(...hits);
      }

      // 4. Fallback if offline
      if (newTracks.length < 5) {
        const chartTracks = await fetchDeezerChart();
        newTracks.push(...(chartTracks || []));
      }

      const freshTracks = (newTracks || []).filter(t => !isDuplicateTrack(t));
      freshTracks.forEach(t => {
        markTrackSeen(t);
        deck.push(t);
      });

      if (freshTracks.length > 0) {
        prefetchPreviewsForDeck();
      }
    } catch (e) {
      console.warn('[Deck] Replenish error:', e);
    } finally {
      isReplenishing = false;
    }
  }

  async function loadDiscoveryDeck() {
    if (isLoadingDeck) return;
    isLoadingDeck = true;
    showLoading(true);

    try {
      let candidateList = [];

      // 1. If user has saved taste artists (e.g. Deftones), blend them directly into starting deck!
      if (recentLikedArtists.length > 0) {
        for (const artist of recentLikedArtists.slice(0, 3)) {
          const spList = await fetchSpotifySearchTracks(`artist:"${artist}"`);
          candidateList.push(...spList);
        }
      }

      // 2. Load Spotify featured tracks directly via Spotify API
      if (candidateList.length < 20) {
        const featList = await fetchSpotifyFeaturedDeck();
        candidateList.push(...featList);
      }

      // 3. Search Spotify for top trending hits
      if (candidateList.length < 20) {
        const hitList = await fetchSpotifySearchTracks('year:2024-2025');
        candidateList.push(...hitList);
      }

      // 4. Fallback if offline
      if (candidateList.length === 0) {
        candidateList = await fetchDeezerChart();
      }

      if (candidateList.length === 0) {
        await loadDemoDeck();
        return;
      }

      // 100% Strict Deduplication
      candidateList = candidateList.filter(t => !isDuplicateTrack(t));
      candidateList.forEach(t => markTrackSeen(t));

      // Shuffle
      for (let i = candidateList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidateList[i], candidateList[j]] = [candidateList[j], candidateList[i]];
      }

      deck = candidateList;
      currentIndex = 0;
      history = [];

      // Pre-resolve the first 5 songs in parallel if any are missing preview_url
      await Promise.all(deck.slice(0, 5).map(trk => resolvePreviewUrl(trk)));

      renderCards();
      updateButtonStates();
      prefetchPreviewsForDeck();

      if (deck.length > 0 && autoPlayPreviews) {
        AudioManager.playTrack(deck[0], true);
      }
    } catch (err) {
      console.error('[Deck] Failed to load deck:', err);
      const fallbackList = await fetchDeezerChart();
      if (fallbackList && fallbackList.length > 0) {
        deck = fallbackList.filter(t => !isDuplicateTrack(t));
        deck.forEach(t => markTrackSeen(t));
        currentIndex = 0;
        history = [];
        renderCards();
        updateButtonStates();
        if (autoPlayPreviews) AudioManager.playTrack(deck[0], true);
      } else {
        await loadDemoDeck();
      }
    } finally {
      showLoading(false);
      isLoadingDeck = false;
    }
  }

  const DEMO_TRACKS = [
    {
      id: 'demo-1',
      name: 'My Own Summer (Shove It)',
      artist: 'Deftones',
      album: 'Around the Fur',
      year: '1997',
      total_tracks: 10,
      duration_ms: 215000,
      cover_url: 'https://i.scdn.co/image/ab67616d0000b273b5220c31c4f52601ba472be9',
      preview_url: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/7b/82/e2/7b82e273-7849-4387-2209-f086eef927cd/mzaf_7584156168517905468.plus.aac.p.m4a',
      uri: 'spotify:track:1158ckiBZuS42UVypt4x2i',
      plays: 48
    },
    {
      id: 'demo-2',
      name: "Scotty Doesn't Know",
      artist: 'Lustra',
      album: 'Left for Dead',
      year: '2004',
      total_tracks: 12,
      duration_ms: 176000,
      cover_url: 'https://i.scdn.co/image/ab67616d0000b273461aa3fcbe6fdb0c0f9948c2',
      preview_url: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/50/95/ca/5095ca26-eb93-ac13-c4a5-52c7835a6435/mzaf_7762622222979097808.plus.aac.p.m4a',
      uri: 'spotify:track:0Jjp44W9s8FqH7h5bL7k8t',
      plays: 42
    },
    {
      id: 'demo-3',
      name: 'Fever',
      artist: 'Buckshot, fakemink',
      album: 'Fever',
      year: '2025',
      total_tracks: 1,
      duration_ms: 144000,
      cover_url: 'https://i.scdn.co/image/ab67616d0000b273673f4fa5da8df3859665bc7b',
      preview_url: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/a6/11/7f/a6117ffa-e13b-6f3a-238d-e2044ae23ea7/mzaf_10702547909548637745.plus.aac.p.m4a',
      uri: 'spotify:track:4jX0jE78rR1wYQ2k9L2V3N',
      plays: 24
    },
    {
      id: 'demo-4',
      name: 'Smells Like Teen Spirit',
      artist: 'Nirvana',
      album: 'Nevermind',
      year: '1991',
      total_tracks: 13,
      duration_ms: 301000,
      cover_url: 'https://i.scdn.co/image/ab67616d0000b273e175a19e530c898d167d39bf',
      preview_url: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/65/49/4e/65494e02-b6d3-26d8-6b0c-9bd98dcf4d5d/mzaf_7665413316386155700.plus.aac.p.m4a',
      uri: 'spotify:track:5ghIJDhubRg0bKoAt9qiEx',
      plays: 95
    },
    {
      id: 'demo-5',
      name: 'Do I Wanna Know?',
      artist: 'Arctic Monkeys',
      album: 'AM',
      year: '2013',
      total_tracks: 12,
      duration_ms: 272000,
      cover_url: 'https://i.scdn.co/image/ab67616d0000b2734ae1c4c5c45aabe565499163',
      preview_url: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/71/cb/ba/71cbbaa1-016b-0e73-dfc2-9f4ede9ddfc0/mzaf_16266777024198047150.plus.aac.p.m4a',
      uri: 'spotify:track:5FVd6KXrgO9B3JLmRLLeo4',
      plays: 87
    }
  ];

  async function loadDemoDeck() {
    showLoading(true);
    deck = [...DEMO_TRACKS];
    currentIndex = 0;
    history = [];

    // Pre-resolve demo audio previews in parallel
    await Promise.all(deck.map(trk => resolvePreviewUrl(trk)));

    showLoading(false);
    renderCards();
    updateButtonStates();

    if (deck.length > 0 && autoPlayPreviews) {
      AudioManager.playTrack(deck[0], true);
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
    replenishDeckIfNeeded();
    setTimeout(async () => {
      if (currentIndex < deck.length && !deck[currentIndex].preview_url) {
        await resolvePreviewUrl(deck[currentIndex]);
      }
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

  function formatDuration(ms) {
    if (!ms || ms <= 0) return '3:00';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

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

      const albumMetaParts = [];
      if (track.album) albumMetaParts.push(escapeHtml(track.album));
      if (track.total_tracks && Number(track.total_tracks) > 1) {
        albumMetaParts.push(`${track.total_tracks} tracks`);
      }
      if (track.year) {
        albumMetaParts.push(escapeHtml(String(track.year)));
      }
      if (track.duration_ms) {
        albumMetaParts.push(formatDuration(track.duration_ms));
      }
      const albumMetaString = albumMetaParts.join(' • ') || 'Single';

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
            <button class="media-toggle-btn ${currentAlbumStyle === 'record' ? 'active' : ''}" data-format="record" title="Picture Disc (Design on Record)">🎵</button>
            <button class="media-toggle-btn ${currentAlbumStyle === 'vinyl' ? 'active' : ''}" data-format="vinyl" title="Vinyl LP in Jacket">🖤</button>
            <button class="media-toggle-btn ${currentAlbumStyle === 'cd' ? 'active' : ''}" data-format="cd" title="Compact Disc & Jewel Case">💿</button>
            <button class="media-toggle-btn ${currentAlbumStyle === 'cassette' ? 'active' : ''}" data-format="cassette" title="Cassette Tape">📼</button>
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
              <div class="cd-art-disc-face" style="background-image: url('${track.cover_url || ''}');"></div>
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
          <p class="track-album-meta">${albumMetaString}</p>
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

        const stage = card.querySelector('.album-stage');
        stage?.addEventListener('click', (e) => {
          if (e.target.closest('.media-toggle-btn')) return;
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

    $$('.album-stage').forEach(stage => {
      stage.dataset.media = format;
    });
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
        url: activePlaylist.url,
        owner: activePlaylist.owner,
        collaborative: activePlaylist.collaborative
      }));
      localStorage.setItem('swipemobile_queued_tracks', JSON.stringify(activePlaylist.tracks || []));
    } catch (e) {}
  }

  function loadSavedActivePlaylist() {
    try {
      const saved = localStorage.getItem('swipemobile_active_playlist');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id) {
          activePlaylist.id = parsed.id;
          activePlaylist.name = parsed.name || 'Spotify Swipe Jams';
          activePlaylist.url = parsed.url;
          activePlaylist.owner = parsed.owner || null;
          activePlaylist.collaborative = parsed.collaborative || false;
        }
      }
      const savedTracks = localStorage.getItem('swipemobile_queued_tracks');
      if (savedTracks) {
        const parsedTracks = JSON.parse(savedTracks);
        if (Array.isArray(parsedTracks) && parsedTracks.length > 0) {
          activePlaylist.tracks = parsedTracks;
          parsedTracks.forEach(t => {
            if (t && t.id) existingTrackIds.add(t.id);
          });
        }
      }
    } catch (e) {}
  }

  /* ---------------------------- Drawer & Modal Sheets ---------------------------- */

  async function openPlaylistSelectorSheet() {
    const token = await getValidAccessToken();
    renderPlaylistCards(token);
    const sheet = $('#playlist-selector-sheet');
    const overlay = $('#playlist-selector-overlay');
    if (sheet && overlay) {
      sheet.classList.add('open');
      overlay.classList.add('open');
    }
    if (token && allUserPlaylists.length === 0) {
      await loadUserPlaylists();
      renderPlaylistCards(token);
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

  function renderPlaylistCards(token) {
    const container = $('#playlist-cards-list');
    if (!container) return;

    if (!token) {
      container.innerHTML = `
        <div class="sheet-connect-box">
          <p class="sheet-connect-desc">Connect with Spotify to view, choose, or sync your playlists!</p>
          <button class="sheet-connect-btn" id="btn-sheet-spotify-login">
            <svg viewBox="0 0 24 24" class="spotify-svg-mini"><path fill="currentColor" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.72 1.115.295.18.388.563.208.855zm1.226-2.723c-.226.367-.71.482-1.077.256-2.69-1.653-6.79-2.132-9.972-1.166-.413.125-.85-.11-0.975-.523-.125-.413.11-.85.523-.975 3.633-1.103 8.15-.576 11.245 1.328.368.226.483.71.256 1.08zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.494.15-1.018-.13-1.168-.624-.15-.494.13-1.018.624-1.168 3.532-1.072 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.282.327z"/></svg>
            <span>Connect Spotify</span>
          </button>
        </div>
      `;
      $('#btn-sheet-spotify-login')?.addEventListener('click', () => loginWithSpotify());
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
        <button class="track-row-delete" data-id="${t.id}" data-uri="${t.uri || ''}" data-name="${escapeHtml(t.name)}" title="Remove track">✖</button>
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
        removeTrackFromPlaylist(btn.dataset.id, btn.dataset.uri, btn.dataset.name);
      });
    });
  }

  function renderDesktopQueue() {
    const list = $('#desktop-queue-list');
    const nameEl = $('#desktop-queue-name');
    const metaEl = $('#desktop-queue-meta');
    if (!list) return;

    if (nameEl) nameEl.textContent = activePlaylist.name || 'Swipe Playlist';
    if (metaEl) {
      let totalMs = 0;
      activePlaylist.tracks.forEach(t => totalMs += (t.duration_ms || 0));
      const mins = Math.round(totalMs / 60000);
      metaEl.textContent = `${activePlaylist.tracks.length} songs • ${mins} mins • Auto-sync`;
    }

    const permBannerHtml = hasWritePermissionError ? `
      <div class="queue-permission-alert" id="queue-perm-banner">
        <strong>🔒 Spotify Write Permission Needed</strong>
        <span>Authorize playlist write access so Spotify Swipe can add songs directly to your Spotify account.</span>
        <button class="q-perm-btn" id="btn-perm-auth-act">🔑 Authorize Full Access</button>
      </div>
    ` : '';

    if (activePlaylist.tracks.length === 0) {
      list.innerHTML = `
        ${permBannerHtml}
        <div class="queue-empty">
          <p>No songs swiped yet</p>
          <span>Press → or Swipe Right on songs you love to build this playlist.</span>
        </div>
      `;
      $('#btn-perm-auth-act')?.addEventListener('click', () => loginWithSpotify());
      return;
    }

    list.innerHTML = permBannerHtml + activePlaylist.tracks.map((t, idx) => `
      <div class="queue-row" data-id="${t.id}">
        <span class="q-num">${idx + 1}</span>
        <img src="${t.cover_url || ''}" alt="" class="q-thumb" />
        <div class="q-info">
          <span class="q-title">${escapeHtml(t.name)}</span>
          <span class="q-artist">${escapeHtml(t.artist)}</span>
        </div>
        <button class="q-spotify-btn" data-id="${t.id}" title="Play on Spotify">▶</button>
        <button class="q-remove-btn" data-id="${t.id}" data-uri="${t.uri || ''}" data-name="${escapeHtml(t.name)}" title="Remove song">✕</button>
      </div>
    `).join('');

    $('#btn-perm-auth-act')?.addEventListener('click', () => loginWithSpotify());

    list.querySelectorAll('.q-spotify-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trk = activePlaylist.tracks.find(t => t.id === btn.dataset.id);
        if (trk) playFullTrackOnSpotify(trk);
      });
    });

    list.querySelectorAll('.q-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrackFromPlaylist(btn.dataset.id, btn.dataset.uri, btn.dataset.name);
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

    AudioManager.onError((err, track) => {
      const activeCard = $('#card-deck .active-card');
      if (!activeCard) return;
      const icon = activeCard.querySelector('.preview-btn-icon');
      if (icon) icon.textContent = '▶';
      const soundWave = activeCard.querySelector('.sound-wave-bars');
      if (soundWave) soundWave.classList.remove('playing');
      const stage = activeCard.querySelector('.album-stage');
      if (stage) stage.classList.remove('is-spinning');
      const timeLbl = activeCard.querySelector('.preview-time');
      if (timeLbl) timeLbl.textContent = 'Preview unavailable';
      const dockPrevBtn = $('#btn-preview-toggle .dock-icon');
      if (dockPrevBtn) dockPrevBtn.textContent = '▶';
    });
  }

  /* ---------------------------- Helpers ---------------------------- */

  function vibrate(ms) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  }

  function showToast(msg, icon = '🎵', actionText = '', onAction = null) {
    const toast = $('#toast');
    if (!toast) return;
    const iconEl = toast.querySelector('.toast-icon');
    const textEl = toast.querySelector('.toast-text');
    if (iconEl) iconEl.textContent = icon;
    if (textEl) textEl.textContent = msg;

    const oldBtn = toast.querySelector('.toast-action-btn');
    if (oldBtn) oldBtn.remove();

    if (actionText && typeof onAction === 'function') {
      const btn = document.createElement('button');
      btn.className = 'toast-action-btn';
      btn.textContent = actionText;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toast.classList.remove('show');
        onAction();
      });
      toast.appendChild(btn);
    }

    toast.classList.add('show');
    clearTimeout(toast._timeout);
    const duration = actionText ? 5000 : 2800;
    toast._timeout = setTimeout(() => toast.classList.remove('show'), duration);
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

  /* ---------------------------- App Security & PIN 1862 Guard ---------------------------- */
  const MASTER_PIN = '1862';
  let enteredPin = '';

  function checkDeviceAuthorization() {
    const ua = (navigator.userAgent || '').toLowerCase();
    const platform = (navigator.platform || '').toLowerCase();

    // Jack's PC (Windows Desktop)
    const isWindowsPC = /windows|win32|win64|wow64|x64/.test(ua) || platform.includes('win');

    // Jack's Samsung Galaxy A55 Phone (Android / Samsung model SM-A55... or mobile Android)
    const isSamsungA55 = /sm-a55|sm-a556|samsung/.test(ua) || (/android/.test(ua) && !/windows/.test(ua));

    // Stored authorization token if previously enrolled
    const isEnrolledToken = localStorage.getItem('swipe_authorized_device_token') === 'jack_authorized_device';

    if (isWindowsPC) {
      return { authorized: true, deviceName: "Jack's PC (Windows)", isMobile: false };
    }
    if (isSamsungA55 || isEnrolledToken) {
      localStorage.setItem('swipe_authorized_device_token', 'jack_authorized_device');
      return { authorized: true, deviceName: "Samsung Galaxy A55", isMobile: true };
    }

    // Unauthorized device (e.g. unknown iOS, macOS, unknown device)
    const isGenericMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
    return { authorized: false, deviceName: "Unauthorized Device", isMobile: isGenericMobile };
  }

  function isAppUnlocked() {
    return sessionStorage.getItem('spotify_swipe_unlocked') === 'true';
  }

  function updatePinDots() {
    for (let i = 1; i <= 4; i++) {
      const dot = $(`#pin-dot-${i}`);
      if (dot) {
        if (i <= enteredPin.length) {
          dot.classList.add('filled');
        } else {
          dot.classList.remove('filled');
        }
      }
    }
  }

  function unlockApp() {
    sessionStorage.setItem('spotify_swipe_unlocked', 'true');
    const lockScreen = $('#app-lock-screen');
    if (lockScreen) {
      lockScreen.classList.add('unlocked');
    }
    enteredPin = '';
    updatePinDots();
    const errMsg = $('#pin-error-msg');
    if (errMsg) errMsg.textContent = '';
  }

  function lockApp() {
    sessionStorage.removeItem('spotify_swipe_unlocked');
    const lockScreen = $('#app-lock-screen');
    if (lockScreen) {
      lockScreen.classList.remove('unlocked');
    }
    enteredPin = '';
    updatePinDots();
    const errMsg = $('#pin-error-msg');
    if (errMsg) errMsg.textContent = '';
    showToast('App Locked 🔒', '🛡️');
  }

  function handlePinDigit(digit) {
    if (isAppUnlocked()) return;
    const devInfo = checkDeviceAuthorization();
    if (!devInfo.authorized) {
      const errMsg = $('#pin-error-msg');
      if (errMsg) {
        errMsg.style.color = '#f87171';
        errMsg.textContent = 'Restricted: Jack\'s PC & Samsung A55 only.';
      }
      return;
    }

    if (enteredPin.length < 4) {
      enteredPin += digit;
      updatePinDots();

      if (enteredPin.length === 4) {
        verifyPin();
      }
    }
  }

  function handlePinBackspace() {
    if (isAppUnlocked()) return;
    if (enteredPin.length > 0) {
      enteredPin = enteredPin.slice(0, -1);
      updatePinDots();
      const errMsg = $('#pin-error-msg');
      if (errMsg) errMsg.textContent = '';
    }
  }

  function handlePinClear() {
    if (isAppUnlocked()) return;
    enteredPin = '';
    updatePinDots();
    const errMsg = $('#pin-error-msg');
    if (errMsg) errMsg.textContent = '';
  }

  function verifyPin() {
    const errMsg = $('#pin-error-msg');
    const keypad = $('#pin-keypad');

    if (enteredPin === MASTER_PIN) {
      if (errMsg) {
        errMsg.style.color = '#1ed760';
        errMsg.textContent = 'Unlocked! Welcome back 💚';
      }
      setTimeout(() => {
        unlockApp();
        showToast('App Unlocked! 🔓', '👋');
      }, 250);
    } else {
      if (errMsg) {
        errMsg.style.color = '#f87171';
        errMsg.textContent = 'Incorrect PIN (Default: 1862)';
      }
      if (keypad) {
        keypad.style.animation = 'shake 0.4s ease';
        setTimeout(() => {
          if (keypad) keypad.style.animation = '';
        }, 400);
      }
      setTimeout(() => {
        enteredPin = '';
        updatePinDots();
      }, 500);
    }
  }

  async function registerBiometricPasskey() {
    const devInfo = checkDeviceAuthorization();
    if (!devInfo.isMobile) {
      showToast('Biometric fingerprint is only available on Samsung A55 mobile', 'ℹ️');
      return;
    }
    if (!window.PublicKeyCredential) {
      showToast('WebAuthn / Passkeys not supported on this browser', '⚠️');
      return;
    }
    try {
      showToast('Touch your fingerprint scanner to enroll...', '🖐️');
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userId = new Uint8Array([1, 8, 6, 2]);

      const rpConfig = {
        name: 'Spotify Swipe',
        ...(window.location.hostname ? { id: window.location.hostname } : {})
      };

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: rpConfig,
          user: {
            id: userId,
            name: 'jack',
            displayName: 'Jack (Samsung Galaxy A55)'
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },
            { alg: -257, type: 'public-key' }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000,
          attestation: 'none'
        }
      });

      if (credential) {
        const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        localStorage.setItem('swipe_passkey_enrolled', 'true');
        localStorage.setItem('swipe_passkey_id', credId);
        showToast('Fingerprint enrolled! Unlocking app... 🖐️', '✅');
        const bioBox = $('#mobile-biometric-box');
        if (bioBox) bioBox.style.display = 'flex';
        const enrollBtn = $('#btn-biometric-enroll');
        if (enrollBtn) enrollBtn.textContent = 'Re-enroll Fingerprint Passkey';
        setTimeout(() => {
          unlockApp();
        }, 500);
      }
    } catch (err) {
      console.warn('[Passkey registration]', err);
      showToast(`Passkey setup: ${err.message || 'Cancelled'}`, '⚠️');
    }
  }

  async function authenticateBiometricPasskey() {
    const devInfo = checkDeviceAuthorization();
    if (!devInfo.isMobile) {
      showToast('Biometric fingerprint is only available on Samsung A55 mobile', 'ℹ️');
      return;
    }
    if (!window.PublicKeyCredential) {
      showToast('WebAuthn / Passkeys not supported on this browser', '⚠️');
      return;
    }
    const hasEnrolled = localStorage.getItem('swipe_passkey_enrolled') === 'true';
    if (!hasEnrolled) {
      showToast('Please tap "Set Up Fingerprint Passkey" to register first!', 'ℹ️');
      return;
    }
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const credIdStr = localStorage.getItem('swipe_passkey_id');
      let allowCredentials = [];
      if (credIdStr) {
        const rawId = Uint8Array.from(atob(credIdStr), c => c.charCodeAt(0));
        allowCredentials.push({ id: rawId, type: 'public-key' });
      }

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          ...(window.location.hostname ? { rpId: window.location.hostname } : {}),
          userVerification: 'required',
          allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
          timeout: 60000
        }
      });

      if (assertion) {
        unlockApp();
        showToast('Unlocked with Fingerprint! 🖐️', '🎉');
      }
    } catch (err) {
      console.warn('[Passkey authentication]', err);
      if (err.name !== 'NotAllowedError') {
        showToast(`Fingerprint auth failed: ${err.message}`, '⚠️');
      }
    }
  }

  function initAppSecurity() {
    const devInfo = checkDeviceAuthorization();
    const devStatusText = $('#dev-status-text');
    const subtitle = $('#lock-screen-subtitle');
    const unauthBanner = $('#lock-unauthorized-banner');
    const bioBox = $('#mobile-biometric-box');
    const settingsPasskeyBtn = $('#btn-settings-passkey');

    if (devStatusText) {
      devStatusText.textContent = devInfo.authorized ? `Device Verified: ${devInfo.deviceName}` : 'Unauthorized Device';
    }

    if (!devInfo.authorized) {
      if (unauthBanner) unauthBanner.style.display = 'block';
      if (subtitle) subtitle.textContent = 'Access Restricted: Jack\'s PC & Samsung Galaxy A55 Only';
    } else {
      if (unauthBanner) unauthBanner.style.display = 'none';
      if (subtitle) subtitle.textContent = `Verified for ${devInfo.deviceName}`;
    }

    // Mobile-only biometric fingerprint controls
    if (devInfo.isMobile) {
      if (bioBox) bioBox.style.display = 'flex';
      if (settingsPasskeyBtn) settingsPasskeyBtn.style.display = 'inline-block';
      const hasEnrolled = localStorage.getItem('swipe_passkey_enrolled') === 'true';
      const enrollBtn = $('#btn-biometric-enroll');
      if (enrollBtn && hasEnrolled) {
        enrollBtn.textContent = 'Re-enroll Fingerprint Passkey';
      }
    } else {
      if (bioBox) bioBox.style.display = 'none';
      if (settingsPasskeyBtn) settingsPasskeyBtn.style.display = 'none';
    }

    // Check if session was already unlocked
    if (isAppUnlocked()) {
      const lockScreen = $('#app-lock-screen');
      if (lockScreen) lockScreen.classList.add('unlocked');
    }
  }

  /* ---------------------------- Initialization & Event Binding ---------------------------- */

  async function init() {
    initAppSecurity();
    document.body.dataset.albumStyle = currentAlbumStyle;

    setupAudioListeners();
    const savedVol = parseFloat(localStorage.getItem('swipemobile_volume') || '0.85');
    AudioManager.setVolume(savedVol);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js?v=2.1.3').then(reg => {
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version v2.1.3 installed! Auto-refreshing...');
                showToast('App updated to v2.1.3! Refreshing...', '🚀');
                setTimeout(() => window.location.reload(), 1000);
              }
            };
          }
        };
      }).catch(() => {});
    }

    loadSavedActivePlaylist();
    updateDiscoverySourceUi();
    bindDomEvents();

    await handleOAuthCallback();

    const token = await getValidAccessToken();
    if (token) {
      await loadUserProfile();
      await loadUserPlaylists();
      if (activePlaylist.id) {
        await loadPlaylistTracks(activePlaylist.id);
      }
    } else {
      updateAuthUi();
    }
    
    // Load discovery deck (Global trending or Spotify based on active source)
    await loadDiscoveryDeck();
    renderDesktopQueue();
  }

  function bindDomEvents() {
    // Action dock buttons
    $('#btn-pass')?.addEventListener('click', () => completeSwipe('left'));
    $('#btn-like')?.addEventListener('click', () => completeSwipe('right'));
    $('#btn-undo')?.addEventListener('click', () => undoLastSwipe());
    $('#btn-preview-toggle')?.addEventListener('click', () => handlePreviewButtonClick());
    $('#btn-dock-spotify')?.addEventListener('click', () => playFullTrackOnSpotify(deck[currentIndex]));

    // Discovery Source Toggle & Selectors
    $('#btn-source-toggle')?.addEventListener('click', () => openPlaylistSelectorSheet());
    document.querySelectorAll('.source-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const src = btn.dataset.source;
        setDiscoverySource(src);
        closePlaylistSelectorSheet();
      });
    });

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

    // Sync All Queued Songs to Spotify (Desktop & Mobile)
    $('#btn-desktop-sync')?.addEventListener('click', () => syncAllToSpotify());
    $('#btn-queue-sync-now')?.addEventListener('click', () => syncAllToSpotify());
    $('#btn-drawer-sync-now')?.addEventListener('click', () => syncAllToSpotify());

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

    // App Lock & PIN Keypad Handlers
    document.querySelectorAll('.pin-key[data-digit]').forEach(btn => {
      btn.addEventListener('click', () => {
        handlePinDigit(btn.dataset.digit);
      });
    });

    $('#btn-pin-backspace')?.addEventListener('click', () => handlePinBackspace());
    $('#btn-pin-clear')?.addEventListener('click', () => handlePinClear());

    // Lock button in Header & Settings
    $('#btn-lock-app')?.addEventListener('click', () => lockApp());
    $('#btn-settings-lock')?.addEventListener('click', () => {
      closeSettingsModal();
      lockApp();
    });

    // Mobile Biometric Fingerprint Passkey Handlers
    $('#btn-biometric-auth')?.addEventListener('click', () => authenticateBiometricPasskey());
    $('#btn-biometric-enroll')?.addEventListener('click', () => registerBiometricPasskey());
    $('#btn-settings-passkey')?.addEventListener('click', () => registerBiometricPasskey());

    // Desktop PC Easy-Access Volume Slider & Mute Toggle
    const deskVolSlider = $('#desktop-vol-slider');
    const deskVolLabel = $('#desktop-vol-label');
    const deskVolMuteBtn = $('#desktop-vol-mute-btn');
    const savedVol = parseFloat(localStorage.getItem('swipemobile_volume') || '0.85');

    if (deskVolSlider) {
      deskVolSlider.value = Math.round(savedVol * 100);
      if (deskVolLabel) deskVolLabel.textContent = `${Math.round(savedVol * 100)}%`;

      deskVolSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value) / 100;
        AudioManager.setVolume(v);
        localStorage.setItem('swipemobile_volume', String(v));
        if (deskVolLabel) deskVolLabel.textContent = `${Math.round(v * 100)}%`;
        if (deskVolMuteBtn) deskVolMuteBtn.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';

        const setSlider = $('#settings-vol-slider');
        const setLabel = $('#settings-vol-label');
        if (setSlider) setSlider.value = Math.round(v * 100);
        if (setLabel) setLabel.textContent = `${Math.round(v * 100)}%`;
      });
    }

    if (deskVolMuteBtn) {
      deskVolMuteBtn.addEventListener('click', () => {
        const isMuted = AudioManager.toggleMute();
        deskVolMuteBtn.textContent = isMuted ? '🔇' : '🔊';
        if (isMuted) {
          if (deskVolLabel) deskVolLabel.textContent = 'Muted';
        } else {
          const currentV = AudioManager.getVolume ? AudioManager.getVolume() : 0.85;
          if (deskVolLabel) deskVolLabel.textContent = `${Math.round(currentV * 100)}%`;
          if (deskVolSlider) deskVolSlider.value = Math.round(currentV * 100);
        }
      });
    }

    // Keyboard Shortcuts (Physical typing for PIN 1862 when locked; Space, Left, Right, Z, 1-5 when unlocked)
    window.addEventListener('keydown', (e) => {
      // If locked, capture physical keyboard for PIN 1862 typing
      if (!isAppUnlocked()) {
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          handlePinDigit(e.key);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          handlePinBackspace();
        } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          handlePinClear();
        }
        return;
      }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePreviewButtonClick();
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        completeSwipe('left');
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        completeSwipe('right');
      } else if (e.code === 'KeyZ') {
        e.preventDefault();
        undoLastSwipe();
      } else if (e.code === 'Digit1') {
        setAlbumFormat('record');
      } else if (e.code === 'Digit2') {
        setAlbumFormat('vinyl');
      } else if (e.code === 'Digit3') {
        setAlbumFormat('cd');
      } else if (e.code === 'Digit4') {
        setAlbumFormat('cassette');
      } else if (e.code === 'Digit5') {
        setAlbumFormat('frame');
      }
    });
  }

  return {
    init,
    lockApp,
    unlockApp,
    registerBiometricPasskey,
    authenticateBiometricPasskey,
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
    selectPlaylist,
    syncAllToSpotify,
    renderDesktopQueue,
    learnUserTaste
  };
})();

window.addEventListener('DOMContentLoaded', MobileApp.init);
