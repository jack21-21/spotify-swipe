# 🎵 Spotify Swipe — Tinder for Your Music Library

[![Spotify Swipe Live](https://img.shields.io/badge/Live%20App-jack21--21.github.io%2Fspotify--swipe-1ED760?style=for-the-badge&logo=spotify&logoColor=white)](https://jack21-21.github.io/spotify-swipe/)
[![Platform](https://img.shields.io/badge/Platform-Mobile%20PWA%20%7C%20Fullscreen%20Desktop%20PC-blue?style=for-the-badge)](https://jack21-21.github.io/spotify-swipe/)
[![Version](https://img.shields.io/badge/Version-v2.1.9%20Live-brightgreen?style=for-the-badge)](https://jack21-21.github.io/spotify-swipe/)
[![Direct Spotify](https://img.shields.io/badge/Spotify%20API-Direct%20Connect-1DB954?style=for-the-badge&logo=spotify)](https://jack21-21.github.io/spotify-swipe/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=for-the-badge)](LICENSE)

> **Curate your ultimate Spotify playlists by swiping.** Fast, tactile, and addictive. Swipe right to add songs directly to your Spotify library in real time; swipe left to pass. Built with interactive 3D vinyl, CD, and cassette physics, authentic studio audio previews, and dynamic music taste adaptation.

---

## 🌐 Instant Web Access (Zero Install Required)

Launch the web app in seconds on any device:

👉 **[Launch Spotify Swipe Live](https://jack21-21.github.io/spotify-swipe/)**

* **📱 Mobile (Android & iPhone)**: Open in Chrome or Safari, tap **"Add to Home Screen"** to install as a full-screen Progressive Web App (PWA). Native vertical scrolling, one-handed card gestures, and lock screen media playback notifications.
* **💻 Desktop (PC & Mac)**: Expands automatically to a widescreen workspace with a live playlist sidebar, keyboard shortcuts, and responsive deck controls.

---

## ✨ Key Features

### 🎴 1. Multi-Source Discovery Engine & Deep Music Pool
* **Repeat Jams Mode**: Aggregates your most repeated recent tracks (3+ plays) and confirmed library favorites.
* **Playlist Radar Mode**: Analyzes artists in your active playlist, acoustic similarity graphs, and pulls matching songs with zero pop-chart contamination.
* **15+ Hour Discovery Pool**: Automatically synchronizes a deep, multi-hour discovery pool with your Spotify account, spanning your top artists and repeat listening history.
* **Instant Stack Refresh**: Switching modes instantly clears and re-renders the stack with fresh tracks.

### 🚫 2. Zero-Duplicate Engine & Permanent Memory
* **Permanent Exclusion for Liked Songs**: Once you like and add a song to your playlist, it is permanently remembered and will never clutter your feed again.
* **200-Song Buffer for Passed Tracks**: Songs you pass are kept out of rotation for at least 200 cards before reappearing.
* **Smart Playlist Reuse**: Never creates accidental duplicate playlists. Detects your existing playlist and appends new tracks seamlessly in real time.
* **1-Tap Track Removal (✕)**: Remove tracks directly from your live sidebar or bottom drawer.

### 💿 3. Realistic Physical Media Formats
Switch between authentic physical music formats with dynamic chameleon ambient lighting:
* **💿 Vinyl LP**: Classic record jacket with a 33⅓ RPM rotating vinyl disc and light sheen.
* **💽 Holographic CD**: Clear jewel case with an iridescent laser compact disc sliding out.
* **📼 Retro Cassette Tape**: Vintage audio cassette with spinning reels and printed track label.
* **🖼️ Picture Frame**: Clean gallery border with responsive ambient edge lighting.

### 🎧 4. Android Lock Screen & Audio Previews
* **MediaSession Integration**: Lock screen and notification shade display high-resolution Spotify album artwork, track title, artist name, and full playback controls (Play, Pause, Next Track to Like & Add, Previous Track to Undo).
* **Authentic Studio Previews**: Real 30-second studio audio previews with smooth looping and zero synthetic beeps.

### ⌨️ 5. Keyboard Shortcuts (Desktop)
* `→` or `D`: Like & Add to Spotify
* `←` or `A`: Pass / Skip
* `Space`: Play / Pause Preview
* `Z`: Undo Last Swipe
* `1` - `5`: Switch Physical Media Format (Vinyl, CD, Cassette, Frame)

---

## 🚀 Quick Start Guide

1. **Open the App**: Visit [https://jack21-21.github.io/spotify-swipe/](https://jack21-21.github.io/spotify-swipe/).
2. **Connect**: Tap **"Connect"** at the top right to link your Spotify account.
3. **Swipe Away**:
   * Swipe right (or press `→`) to add songs to your playlist.
   * Swipe left (or press `←`) to pass.
   * Tap the physical format pills (💿, 💽, 📼) to switch vinyl styles.

---

## 🛠️ Complete Diagnostics & Error Code Reference

| Error Code | Title | What Happened? | Solution / Fix |
| :--- | :--- | :--- | :--- |
| **`ERR_AUTH_001`** | Not Signed In | You swiped right while in demo mode without connecting Spotify. | Click **Connect** in the top bar to sign in. Tracks remain saved in your local queue. |
| **`ERR_AUTH_002`** | Session Expired | Spotify authorization token expired. | The app auto-refreshes tokens, or tap **Connect** to refresh your session. |
| **`ERR_SPOTIFY_403`** | Write Permission Required | Missing playlist modify scope or targeting an unowned playlist. | Re-connect to approve write permissions. |
| **`ERR_SPOTIFY_404`** | Playlist / Track Not Found | Targeted playlist could not be found on Spotify. | The app automatically recreates a fresh playlist on your account. |
| **`ERR_SPOTIFY_429`** | Rate Limit Backoff | Spotify API request limit reached. | The app automatically backs off and retries in a few seconds. |
| **`ERR_TRACK_001`** | Duplicate Prevented | The song you liked is already in your active playlist. | Track is safely in your playlist — swipe forward to find new music! |
| **`ERR_AUDIO_001`** | Preview Unavailable | No 30s studio preview published for this track due to label rights. | Tap the Spotify button to stream full song in Spotify. |
| **`ERR_AUDIO_002`** | Autoplay Blocked | Browser paused audio before a user touch interaction. | Tap anywhere on the card or press Play to unlock audio previews. |

---

## 💻 Running Locally (Optional)

### Prerequisites
* [Python 3.9+](https://www.python.org/) or any static web server (Node `npx serve`, VS Code Live Server).

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

This project is licensed under the [MIT License](LICENSE).
Built with ❤️ for music lovers everywhere.
