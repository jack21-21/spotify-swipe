# Spotify OAuth2 & Web API Integration Guide

This guide explains how to authenticate with Spotify using `fin21-general-api` and make Spotify Web API calls from static frontends with no backend (such as GitHub Pages: `https://jack21-21.github.io/spotify-swipe/`), mobile apps, or other websites.

---

## 📑 Table of Contents

1. [How It Works (Architecture)](#1-how-it-works-architecture)
2. [Spotify Developer Dashboard Setup](#2-spotify-developer-dashboard-setup)
3. [Client-Side Integration (for `spotify-swipe`)](#3-client-side-integration-for-spotify-swipe)
4. [Ready-to-Use JavaScript Helper (`spotify-client.js`)](#4-ready-to-use-javascript-helper-spotify-clientjs)
5. [Spotify Web API Examples for Song Swiping & Playlists](#5-spotify-web-api-examples-for-song-swiping--playlists)
6. [API Endpoints Reference (`api.fin21.uk`)](#6-api-endpoints-reference-apifin21uk)

---

## 1. How It Works (Architecture)

GitHub Pages (`jack21-21.github.io`) cannot store secret credentials safely because all HTML and JavaScript code is publicly visible in the browser. 

`fin21-general-api` acts as a secure **OAuth2 Token Bridge**:

```
[ User Browser ]                  [ Spotify ]              [ api.fin21.uk ]
       |                               |                          |
       | 1. Click "Login with Spotify" |                          |
       |--------------------------------------------------------->|
       | 2. Redirect to Spotify Auth   |                          |
       |<---------------------------------------------------------|
       | 3. Authorize Permissions      |                          |
       |------------------------------>|                          |
       |                               | 4. Redirect with code    |
       |                               |------------------------->|
       |                               |                          | 5. Exchanges code
       |                               |                          |    using CLIENT_SECRET
       | 6. Redirect back to frontend  |                          |
       |    with #access_token &       |                          |
       |    #refresh_token in fragment |                          |
       |<---------------------------------------------------------|
       |
       | 7. When access_token expires:
       |    POST /spotify/refresh { refresh_token }
       |--------------------------------------------------------->|
       | 8. Returns fresh access_token                            |
       |<---------------------------------------------------------|
```

### Why Hash Fragment (`#access_token=...`)?
Tokens are delivered to your frontend in the **URL hash fragment**. URL fragments are never sent to web servers or written to access logs, protecting tokens from leaking into server logs or analytics.

---

## 2. Spotify Developer Dashboard Setup

Before testing, register an app in Spotify's developer portal:

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app**:
   - **App name:** `Spotify Swipe` (or whatever you prefer)
   - **App description:** `Tinder-like Spotify playlist maker`
   - **Redirect URIs:** Add the following URI:
     ```
     https://api.fin21.uk/spotify/callback
     ```
     *(For local testing, also add `http://localhost:8532/spotify/callback`)*
   - **Which API/SDKs are you planning to use?** Check **Web API**.
3. Save the app, then go to **Settings**:
   - Copy **Client ID**
   - Click **View client secret** and copy **Client Secret**
4. Add them to your `fin21-general-api/.env` file:
   ```env
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   SPOTIFY_REDIRECT_URI=https://api.fin21.uk/spotify/callback
   ```

---

## 3. Client-Side Integration (for `spotify-swipe`)

### Step 1: Login Button (HTML)

On `https://jack21-21.github.io/spotify-swipe/`, add a login button that points to your API:

```html
<a href="https://api.fin21.uk/spotify/login?return_to=https://jack21-21.github.io/spotify-swipe/">
  <button id="loginBtn">Connect with Spotify</button>
</a>
```

> **Tip:** You can optionally pass `&show_dialog=true` if you want Spotify to prompt the user every time.

---

### Step 2: Handle the Callback on Page Load

When Spotify redirects back, the URL will look like:
`https://jack21-21.github.io/spotify-swipe/#access_token=BQ...&refresh_token=AQ...&expires_in=3600&token_type=Bearer`

In your JavaScript file (e.g. `app.js`):

```javascript
// On page load, check if tokens arrived in URL hash
function handleAuthCallback() {
  if (window.location.hash) {
    const hash = window.location.hash.substring(1); // remove '#'
    const params = new URLSearchParams(hash);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresIn = params.get('expires_in');

    if (accessToken) {
      // Calculate absolute expiration timestamp (milliseconds)
      const expiresAt = Date.now() + (parseInt(expiresIn, 10) * 1000);

      localStorage.setItem('spotify_access_token', accessToken);
      localStorage.setItem('spotify_expires_at', expiresAt);
      if (refreshToken) {
        localStorage.setItem('spotify_refresh_token', refreshToken);
      }

      // Clean the URL bar so the tokens are not visible
      window.history.replaceState(null, '', window.location.pathname);
      console.log('Spotify login successful!');
      return true;
    }
  }
  return false;
}
```

---

### Step 3: Refreshing Expired Tokens

Spotify access tokens last 1 hour (3600 seconds). When expired, request a fresh token through `api.fin21.uk`:

```javascript
async function getFreshAccessToken() {
  const token = localStorage.getItem('spotify_access_token');
  const expiresAt = parseInt(localStorage.getItem('spotify_expires_at') || '0', 10);
  const refreshToken = localStorage.getItem('spotify_refresh_token');

  // If token is still valid (give 60s buffer), use it
  if (token && Date.now() < expiresAt - 60000) {
    return token;
  }

  // Token expired or about to expire -> refresh it
  if (!refreshToken) {
    throw new Error('No refresh token available. User must log in again.');
  }

  const response = await fetch('https://api.fin21.uk/spotify/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  const data = await response.json();
  if (data.success && data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token);
    localStorage.setItem('spotify_expires_at', Date.now() + (data.expires_in * 1000));
    if (data.refresh_token) {
      localStorage.setItem('spotify_refresh_token', data.refresh_token);
    }
    return data.access_token;
  }

  throw new Error(data.message || 'Token refresh failed');
}
```

---

## 4. Ready-to-Use JavaScript Helper (`spotify-client.js`)

You can save this file in Jack's repository and import it into any page:

```javascript
/**
 * spotify-client.js — Drop-in Spotify API Helper for static frontends
 */
const API_BASE = 'https://api.fin21.uk';
const RETURN_URL = window.location.origin + window.location.pathname;

export const Spotify = {
  /**
   * Redirect user to Spotify login
   */
  login() {
    window.location.href = `${API_BASE}/spotify/login?return_to=${encodeURIComponent(RETURN_URL)}`;
  },

  /**
   * Log out and clear saved tokens
   */
  logout() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_expires_at');
    window.location.reload();
  },

  /**
   * Check URL hash on page load and store tokens
   */
  init() {
    if (window.location.hash.includes('access_token=')) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

      if (accessToken) {
        localStorage.setItem('spotify_access_token', accessToken);
        localStorage.setItem('spotify_expires_at', String(Date.now() + expiresIn * 1000));
        if (refreshToken) {
          localStorage.setItem('spotify_refresh_token', refreshToken);
        }
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  },

  /**
   * Returns true if user is logged in
   */
  isLoggedIn() {
    return Boolean(localStorage.getItem('spotify_access_token') || localStorage.getItem('spotify_refresh_token'));
  },

  /**
   * Gets a valid access token, auto-refreshing if expired
   */
  async getToken() {
    const token = localStorage.getItem('spotify_access_token');
    const expiresAt = parseInt(localStorage.getItem('spotify_expires_at') || '0', 10);
    const refreshToken = localStorage.getItem('spotify_refresh_token');

    // Return token if valid for at least 1 more minute
    if (token && Date.now() < expiresAt - 60000) {
      return token;
    }

    if (!refreshToken) {
      throw new Error('Authentication required');
    }

    // Refresh token via backend bridge
    const res = await fetch(`${API_BASE}/spotify/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    const data = await res.json();
    if (!data.success || !data.access_token) {
      this.logout();
      throw new Error(data.message || 'Session expired');
    }

    localStorage.setItem('spotify_access_token', data.access_token);
    localStorage.setItem('spotify_expires_at', String(Date.now() + data.expires_in * 1000));
    if (data.refresh_token) {
      localStorage.setItem('spotify_refresh_token', data.refresh_token);
    }
    return data.access_token;
  },

  /**
   * Wrapper around Spotify Web API with auto-authentication
   */
  async fetchApi(endpoint, options = {}) {
    const token = await this.getToken();
    const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      // If unauthorized, clear cached access token and try refreshing once
      localStorage.removeItem('spotify_access_token');
      const freshToken = await this.getToken();
      headers['Authorization'] = `Bearer ${freshToken}`;
      return fetch(url, { ...options, headers }).then(r => r.json());
    }

    if (res.status === 204) return null; // No content (e.g. PUT/DELETE)
    return res.json();
  }
};
```

---

## 5. Spotify Web API Examples for Song Swiping & Playlists

Once you have `Spotify.fetchApi`, here are the exact API calls needed for a Tinder-style swipe app:

### 1. Get Current User Profile
```javascript
const user = await Spotify.fetchApi('/me');
console.log('Logged in as:', user.display_name, 'ID:', user.id);
```

### 2. Get User's Top Songs to Swipe On
Fetches the user's favorite tracks based on calculated affinity:
```javascript
// time_range can be 'short_term' (4 weeks), 'medium_term' (6 months), or 'long_term' (years)
const topTracks = await Spotify.fetchApi('/me/top/tracks?limit=30&time_range=medium_term');

topTracks.items.forEach(track => {
  console.log({
    id: track.id,
    title: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    albumArt: track.album.images[0]?.url,
    previewAudio: track.preview_url // 30-second audio preview MP3!
  });
});
```

### 3. Get Tracks From Any Playlist to Swipe On
```javascript
const playlist = await Spotify.fetchApi('/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks?limit=50');
const songs = playlist.items.map(item => item.track);
```

### 4. Swipe Right Action #1: "Like" Song (Save to User Library)
```javascript
async function likeSong(trackId) {
  await Spotify.fetchApi(`/me/tracks?ids=${trackId}`, {
    method: 'PUT'
  });
  console.log('Added to your Liked Songs!');
}
```

### 5. Swipe Right Action #2: Add to a "Swiped Playlist"

First, create the playlist if it doesn't already exist:
```javascript
async function createSwipedPlaylist(userId) {
  const newPlaylist = await Spotify.fetchApi(`/users/${userId}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name: '🔥 Swiped Hits',
      description: 'Songs swiped right on Spotify Swipe',
      public: false
    })
  });
  return newPlaylist.id;
}
```

Then add songs when swiped right:
```javascript
async function addSongToPlaylist(playlistId, trackUri) {
  // trackUri is formatted like: spotify:track:4cOdK2wGLETKBW3PvgPWqT
  await Spotify.fetchApi(`/playlists/${playlistId}/tracks`, {
    method: 'POST',
    body: JSON.stringify({
      uris: [trackUri]
    })
  });
  console.log('Added track to playlist!');
}
```

### 6. Playing Audio Preview While Swiping
Spotify tracks include a 30-second audio preview snippet in `track.preview_url`:
```javascript
const audio = new Audio(track.preview_url);
audio.play();

// When swiping to next card:
audio.pause();
audio.currentTime = 0;
```

---

## 6. API Endpoints Reference (`api.fin21.uk`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/spotify` or `/spotify/status` | Service status, callback URI, and registered scopes |
| `GET` | `/spotify/login` | Redirects user to Spotify permission screen |
| `GET` | `/spotify/callback` | Callback endpoint configured in Spotify Dashboard |
| `POST` | `/spotify/refresh` | Refreshes an expired access token (`{ "refresh_token": "..." }`) |
| `POST` | `/spotify/swap` | Direct token exchange for authorization code |
| `GET` | `/spotify/me` | Fetches Spotify user profile using Bearer token |

---

### Example cURL Commands

#### Refresh Access Token
```bash
curl -X POST https://api.fin21.uk/spotify/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "AQD..."}'
```

#### Fetch User Profile via API
```bash
curl https://api.fin21.uk/spotify/me \
  -H "Authorization: Bearer BQC..."
```

---

## Default Configured Scopes

The backend automatically requests the following scopes:
- `user-read-private`, `user-read-email`
- `user-library-read`, `user-library-modify` *(saving songs)*
- `playlist-read-private`, `playlist-read-collaborative`
- `playlist-modify-public`, `playlist-modify-private` *(creating & modifying playlists)*
- `user-top-read` *(reading user's favorite tracks to populate cards)*
- `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`
- `user-read-recently-played`
