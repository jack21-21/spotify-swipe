# 🎵 Spotify Swipe — Tinder for Your Music Library

[![Spotify Swipe Live](https://img.shields.io/badge/Live%20App-jack21--21.github.io%2Fspotify--swipe-1ED760?style=for-the-badge&logo=spotify&logoColor=white)](https://jack21-21.github.io/spotify-swipe/)
[![Platform](https://img.shields.io/badge/Platform-Mobile%20PWA%20%7C%20Fullscreen%20Desktop%20PC-blue?style=for-the-badge)](https://jack21-21.github.io/spotify-swipe/)
[![Version](https://img.shields.io/badge/Version-v2.1.3%20Live-brightgreen?style=for-the-badge)](https://jack21-21.github.io/spotify-swipe/)
[![Security](https://img.shields.io/badge/Security-PIN%201862%20%7C%20Passkey-7c3aed?style=for-the-badge)](https://jack21-21.github.io/spotify-swipe/)
[![Direct Spotify](https://img.shields.io/badge/Spotify%20API-Direct%20Connect-1DB954?style=for-the-badge&logo=spotify)](https://jack21-21.github.io/spotify-swipe/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=for-the-badge)](LICENSE)

> **Curate your ultimate Spotify playlists by swiping.** Fast, tactile, and addictive. Swipe right to add songs directly to your Spotify library in real time; swipe left to pass. Built with interactive 3D vinyl, CD, and cassette physics, authentic audio previews, and dynamic music taste adaptation.

---

## 🌐 Instant Web Access (Zero Install Required!)

Anyone can start discovering music and building playlists in seconds on any device:

👉 **[Launch Spotify Swipe Live](https://jack21-21.github.io/spotify-swipe/)**

* **📱 Mobile (Android & iPhone)**: Open in Chrome or Safari, tap **"Add to Home Screen"** to install as a full-screen Progressive Web App (PWA). No slider clutter; perfectly scaled for one-handed thumb swiping.
* **💻 Desktop (PC & Mac)**: Expands automatically to a widescreen workspace with a live playlist sidebar, easy-access header volume slider, mute toggle, and keyboard shortcuts.

---

## ✨ Key Features in v2.1.3

### 🔒 1. App Security, PIN 1862 & Device Guard
* **Master PIN Protection (`1862`)**: All sessions are protected by a secure 4-digit PIN lock. Input via the sleek glass numeric keypad on mobile or direct physical keyboard entry on desktop PC.
* **Authorized Devices Only**: Strictly restricted to **Jack's PC (Windows Desktop)** and **Samsung Galaxy A55 Mobile (`SM-A55...`)**. Unauthorized external devices are flagged with an immediate device barrier.
* **🖐️ Mobile Biometric Fingerprint Passkey**: On the Samsung Galaxy A55, hardware fingerprint authentication is integrated via WebAuthn platform passkeys (`navigator.credentials`). Unlock in a fraction of a second with your fingerprint, or tap "Enroll Fingerprint Passkey" in Settings.
* **Instant Lock (🔒)**: Lock the app with 1 tap from the top bar icon or Settings modal whenever leaving your device unattended.

### 🎴 2. Smart Playlist Reuse & Zero-Duplicate Engine
* **Mass Playlist Creation Prevention**: Never creates accidental duplicate playlists! If a playlist named `Spotify Swipe Jams` (or your custom chosen playlist) already exists in your library, the engine automatically detects and reuses it, appending new songs directly.
* **Swipe Right (💚)**: Instantly adds the track directly to your active Spotify playlist in real time.
* **Swipe Left (❌)**: Passes and advances to your next song recommendation.
* **Undo (↩️)**: Accidentally swiped away a masterpiece? Tap Undo or hit `Z` to bring it right back.
* **🧠 Adaptive Music Taste Learning**: Say goodbye to clunky genre filters! When you swipe right on an artist (e.g., **Deftones**, Radiohead, The Cure), the algorithm automatically detects your taste and dynamically branches more songs by that artist and related styles directly into your upcoming deck.
* **✨ 100% Zero-Duplicate Track Engine**: Smart session deduplication prevents the same track from appearing multiple times across different albums, singles, or remasters.
* **⚡ 1-Tap Track Removal (✕)**: Hit the `✕` on any track in your live playlist sidebar or drawer to instantly drop the song without blocking prompts.

### 🔐 3. 100% Direct Spotify Integration (Zero Third-Party APIs)
* **Direct Spotify Web API**: Sourced directly from Spotify's official servers with verified metadata, genuine album covers from Spotify's CDN (`i.scdn.co`), and direct Spotify track URIs.
* **Client Credentials & PKCE Auth**: The app starts discovering music immediately on page load, and connects seamlessly to your personal account with one click to manage playlists.
* **Auto-Protected Playlist Routing**: If you select a playlist you don't own (such as an editorial playlist), the engine automatically safeguards your songs by routing them into your own **"Spotify Swipe Jams"** playlist so you never lose a track.

### 🛡️ 4. Fullscreen Desktop PC Player
* **Expansive Dual-Panel Layout**: Beautifully proportioned across 1080p, 1440p, and 4K displays with responsive card scaling and live ambient glow.
* **Live Playlist Sidebar**: Watch your playlist grow in real time with album art, track numbers, durations, and quick removal.
* **Easy-Access Volume Slider**: Quick header volume control (`0% - 100%`) with one-click mute button on desktop (strictly hidden on mobile).
* **Keyboard Shortcuts**:
  * `0` - `9`, `Backspace`, `Escape`: Type PIN (1862) to unlock
  * `→` or `D`: Like & Add to Spotify
  * `←` or `A`: Pass / Skip
  * `Space`: Play / Pause Preview
  * `Z`: Undo Last Swipe
  * `1` - `5`: Switch Physical Media Format (Vinyl, CD, Cassette, Frame)

### 💿 5. Realistic Physical Media Audio Formats
Switch between authentic physical music formats in real time:
* **💿 Vinyl LP**: Classic record jacket with a 33⅓ RPM rotating vinyl disc and light sheen.
* **💽 Holographic CD**: Clear jewel case with an iridescent laser compact disc sliding out.
* **📼 Retro Cassette Tape**: Vintage audio cassette with spinning reels and printed track label.
* **🖼️ Picture Frame**: Clean gallery border with responsive ambient edge lighting.

---

## 🚀 Quick Start Guide (3 Simple Steps)

1. **Open the App**: Visit [https://jack21-21.github.io/spotify-swipe/](https://jack21-21.github.io/spotify-swipe/).
2. **Tap "Connect"**: Click or tap **"Connect"** at the top right to link your Spotify account.
3. **Swipe Away**:
   * Swipe right on songs you love — they're auto-added to your **Spotify Swipe Jams** playlist!
   * Like a few songs by an artist (e.g. Deftones) and watch the feed adapt to bring you more!
   * Hit **"Sync to Spotify"** anytime to push batch updates.

---

## 🛠️ Complete Diagnostics & Error Code Reference

Spotify Swipe includes a comprehensive error diagnostics engine. Every notice is paired with an actionable code and a 1-tap resolution button:

| Error Code | Title | What Happened? | Solution / Fix |
| :--- | :--- | :--- | :--- |
| **`ERR_AUTH_001`** | Not Signed In | You swiped right while in demo/guest mode without connecting Spotify. | Click **Connect** in the top bar to sign in. Tracks remain safely stored in your local queue. |
| **`ERR_AUTH_002`** | Session Expired | Your Spotify authorization token expired after a period of inactivity. | The app auto-refreshes tokens, or tap **Connect** to refresh your session. |
| **`ERR_AUTH_003`** | Login Cancelled | The Spotify authorization dialog was closed or cancelled before completion. | Click **Connect** again and approve the requested playlist permissions. |
| **`ERR_AUTH_004`** | PKCE Exchange Failed | The browser was unable to complete the OAuth code exchange. | Tap **Connect** to restart the authorization handshake. |
| **`ERR_SPOTIFY_401`** | Unauthorized Session | Spotify reported that the current access token is invalid or revoked. | Tap **Connect** to re-authorize. |
| **`ERR_SPOTIFY_403`** | Write Permission Required | Attempted to add or modify a playlist without write scope, or targeted a playlist owned by someone else. | The app automatically routes tracks to your owned **Spotify Swipe Jams** playlist. Click **Connect** if write permissions need approval. |
| **`ERR_SPOTIFY_404`** | Playlist / Track Not Found | The targeted playlist or track URI could not be found on Spotify. | The app automatically creates a fresh **Spotify Swipe Jams** playlist on your account. |
| **`ERR_SPOTIFY_429`** | Rate Limit Backoff | Spotify API request threshold reached. | The app automatically backs off and retries in a few seconds. No user action needed. |
| **`ERR_PLAYLIST_001`** | Read-Only Playlist | Selected playlist is followed or owned by another user. | Songs are automatically saved to your own **Spotify Swipe Jams** playlist. |
| **`ERR_PLAYLIST_002`** | Playlist Creation Failed | Spotify could not create the playlist due to network or account restrictions. | Check your internet connection or verify account status in the Spotify app. |
| **`ERR_PLAYLIST_003`** | Sync Incomplete | One or more tracks could not be pushed during batch sync. | Click **"Sync to Spotify"** to re-sync queued tracks. |
| **`ERR_TRACK_001`** | Duplicate Prevented | The song you liked is already in your active playlist. | Track is safely in your playlist — swipe forward to find new music! |
| **`ERR_TRACK_002`** | Track Lookup Notice | Track URI resolution required lookup. | The engine resolves the canonical Spotify track URI automatically. |
| **`ERR_AUDIO_001`** | Preview Unavailable | No 30s studio snippet is published for this track due to label rights. | Tap the green Spotify icon on the card to stream the full song directly in Spotify. |
| **`ERR_AUDIO_002`** | Autoplay Blocked | Your mobile browser paused audio before a user touch interaction. | Tap anywhere on the card or press Play to unlock audio previews. |
| **`ERR_AUDIO_003`** | Audio Decode Notice | Browser encountered an error decoding audio snippet. | Engine automatically advances to the next track preview. |
| **`ERR_DECK_EMPTY`** | Deck Replenishing | You swiped through all loaded cards. | Engine automatically fetches fresh recommendations based on your liked artists. |
| **`ERR_NET_001`** | Offline Mode | Your device lost internet connection. | Reconnect to Wi-Fi or cellular data; offline cache will keep your queue safe. |

---

## 💻 Running Locally (Optional Developer Setup)

If you'd like to develop or run Spotify Swipe on your own machine:

### Prerequisites
* [Python 3.9+](https://www.python.org/) or any static web server (e.g. Node `npx serve`, VS Code Live Server).

### 1-Click Launch (Windows)
Double-click `start.bat` in the repository root.

### Manual Local Server
```bash
# Clone the repository
git clone https://github.com/jack21-21/spotify-swipe.git
cd spotify-swipe

# Start a local server
python -m http.server 8888
```
Open `http://localhost:8888/` in your browser.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
Built with ❤️ for music lovers everywhere.
