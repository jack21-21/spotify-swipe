# 🎵 Spotify Swipe — Tinder for Your Music Library

[![Spotify Swipe Live](https://img.shields.io/badge/Live%20App-jack21--21.github.io%2Fspotify--swipe-1ED760?style=for-the-badge&logo=spotify&logoColor=white)](https://jack21-21.github.io/spotify-swipe/)
[![Platform](https://img.shields.io/badge/Platform-Mobile%20%7C%20Desktop%20PC-blue?style=for-the-badge)](https://jack21-21.github.io/spotify-swipe/)
[![Version](https://img.shields.io/badge/Version-v2.0.1-brightgreen?style=for-the-badge)](https://jack21-21.github.io/spotify-swipe/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=for-the-badge)](LICENSE)

> **Curate your dream Spotify playlists by swiping.** Fast, tactile, and addictive. Swipe right to add songs directly to your Spotify playlist; swipe left to pass.

---

## 🌐 Instant Web Access (No Install Required!)

You can start discovering music and building playlists right now from any device:

👉 **[Launch Spotify Swipe Live](https://jack21-21.github.io/spotify-swipe/)**

* **📱 Mobile (Android / iPhone)**: Open in Chrome or Safari, tap **"Add to Home Screen"** to install as a fast, full-screen Progressive Web App (PWA).
* **💻 Desktop (PC / Mac)**: Opens as an expansive, full-screen workspace with dual-panel layout, live playlist sidebar, and volume slider.

---

## ✨ Features You'll Love in v2.0.0 (Final Shareable Release)

### 🎴 1. Tinder-Style Card Swiping with Adaptive Intelligence
* **Swipe Right (💚)**: Instantly adds the track to your active Spotify playlist in real time.
* **Swipe Left (❌)**: Skips to the next song in your discovery deck.
* **Undo (↩️)**: Accidentally swiped away a gem? Press Undo to bring it right back.
* **🧠 Adaptive Music Recommendation**: Learns which artists and styles you like as you swipe right, intelligently seeding more music that matches your vibe!
* **✨ 100% Zero Duplicates Guarantee**: Eliminates repeat songs across different albums, singles, or remasters during your browsing session.
* **⚡ Instant Track Removal (✕)**: Tap the `✕` on any track in your queue sidebar or drawer to instantly drop the song without blocking errors.

### 🎸 2. One-Tap Genre & Vibe Filtering
Quickly switch genres at any time from the top filter bar:
* **🌐 All Mix**: Global trending hits & mixed genres.
* **🎸 Indie / Rock**: Alternative, indie rock, post-punk & garage bands.
* **🎧 Pop Hits**: Chart toppers, viral tracks & upbeat anthems.
* **🎤 Hip-Hop**: Rap, trap, boom-bap & hip-hop classics.
* **⚡ Dance**: Electronic, house, techno & EDM club anthems.
* **🌙 Chill**: Lo-fi, ambient, acoustic & relaxing study beats.

### 🛡️ 3. Auto-Recovering Spotify Sync (Zero 403 & 404 Errors)
* **Intelligent Playlist Verification**: Detects if your selected playlist is read-only or invalid.
* **Seamless Auto-Fallback**: If a playlist cannot be edited, Spotify Swipe automatically routes tracks to your owned **"Spotify Swipe Jams"** playlist so you never lose a song.
* **1-Click Sync**: "Sync to Spotify" pushes all queued songs in batch chunks of 50.

### 💿 4. Realistic Physical Media Artwork
Flip between dynamic physical media formats with one click or tap:
* **💿 Vinyl LP**: Album jacket with real 33⅓ RPM rotating vinyl and realistic light sheen reflections.
* **💽 Holographic CD**: Clear jewel case with iridescent rainbow laser sheen compact disc sliding out.
* **📼 Retro Cassette Tape**: Vintage audio cassette with rotating tape spools and printed label.
* **🖼️ Picture Frame**: Gallery-grade border with audio-reactive edge glow.

### 🎧 5. Studio Audio Previews & Deep Linking
* **High-Fidelity Previews**: 30-second studio audio teasers powered by Apple Music and Deezer with strict title and artist verification.
* **Open in Spotify**: Instant 1-tap playback of the full song in your Spotify app.
* **Battery & Performance Optimized**: Heavy canvas visualizers are automatically disabled on phones to keep scrolling fluid and save battery.

### 💻 6. Dedicated Full-Screen PC Experience
* **Full-Width Workspace**: Expands to take advantage of widescreen monitors.
* **Live Playlist Sidebar**: Watch your playlist grow in real time with album art, track counts, and total playback duration.
* **Header Volume Slider**: Quick, zero-friction volume control (`0% - 100%`) with one-click mute (strictly hidden on phones).
* **Keyboard Hotkeys**:
  * `→` or `D`: Like & Add to Spotify
  * `←` or `A`: Pass / Skip
  * `Space`: Play / Pause Preview
  * `Z`: Undo Last Swipe
  * `1` - `5`: Switch Physical Media Format (Vinyl, CD, Cassette, Frame)

---

## 🚀 Quick Start Guide (3 Simple Steps)

1. **Open the App**: Visit [https://jack21-21.github.io/spotify-swipe/](https://jack21-21.github.io/spotify-swipe/).
2. **Connect Spotify**: Click or tap **"Connect"** at the top right to authorize read and write access to your playlists.
3. **Select or Create a Playlist**:
   * Tap the **Choose Playlist** pill at the top.
   * Pick an existing playlist you own, or type a new name and click **Create & Use**.
   * *Swipe away and watch your playlist come to life!*

---

## 🛠️ Complete Error Code Reference System

Spotify Swipe features an integrated error diagnostics engine. If something ever fails, an actionable error code is displayed so you know exactly what happened:

| Error Code | Meaning | What Happened? | How to Fix It |
| :--- | :--- | :--- | :--- |
| **`ERR_AUTH_001`** | Not Signed In | You swiped right while running in guest/demo mode without connecting Spotify. | Click **Connect** in the top bar to log into your Spotify account. |
| **`ERR_AUTH_002`** | Session Expired | Your Spotify authorization token has expired after long inactivity. | The app will auto-refresh, or you can click **Connect** to refresh your session. |
| **`ERR_AUTH_003`** | Login Cancelled | The Spotify login popup or authorization window was closed before completion. | Click **Connect** again and approve the playlist permissions. |
| **`ERR_SPOTIFY_403`** | Forbidden / Read-Only | Attempted to add a song to a playlist you do not own (e.g. Spotify editorial or someone else's playlist). | The app automatically switches to your own **"Spotify Swipe Jams"** playlist. To target another playlist, ensure you are the owner. |
| **`ERR_SPOTIFY_404`** | Resource Not Found | A specific track URI or playlist ID was removed or is unavailable in your region. | Swipe to the next track or select another active playlist. |
| **`ERR_SPOTIFY_429`** | Rate Limit Reached | Too many requests were sent to the Spotify API in a short window. | The app backs off automatically. Wait a few seconds and try again. |
| **`ERR_PLAYLIST_001`** | Permission Denied | You selected a public playlist owned by another creator. | Choose a playlist created by your user profile, or create a new one in the selector. |
| **`ERR_PLAYLIST_002`** | Playlist Creation Error | Spotify was unable to create the requested playlist. | Check your account limits and ensure you are connected with internet access. |
| **`ERR_TRACK_001`** | Duplicate Song | The song you swiped right on is already inside your active playlist. | You're already set! Swipe to discover new music. |
| **`ERR_AUDIO_001`** | Preview Unavailable | No verified 30-second audio preview exists for this specific track. | Tap the green Spotify icon on the card to listen to the full song directly in Spotify. |
| **`ERR_AUDIO_002`** | Autoplay Blocked | Your mobile browser blocked automatic audio playback without user touch. | Tap anywhere on the card or press the play button to unlock audio. |
| **`ERR_NET_001`** | Network Offline | Your device lost connection to the internet. | Check your Wi-Fi or mobile data connection and reload. |

---

## 💻 Running Locally (Optional Developer Setup)

If you'd like to develop or run Spotify Swipe on your own machine:

### Prerequisites
* [Python 3.9+](https://www.python.org/) or any static web server (e.g. Node `npx serve`, VS Code Live Server).

### 1-Click Launch (Windows)
Double-click `start.bat` in the repository root. It will install dependencies and launch the local server.

### Manual CLI
```bash
# Clone the repository
git clone https://github.com/jack21-21/spotify-swipe.git
cd spotify-swipe

# Start a local static server
python -m http.server 8888
```
Then open `http://localhost:8888/mobile/` in your browser.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
Built with ❤️ for music lovers everywhere.
