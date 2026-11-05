# 📱 Spotify Swipe — Standalone Mobile App (Zero PC Dependency)

A fully standalone mobile web application and PWA (Progressive Web App) that runs **directly on your phone 24/7 with your computer completely turned off**.

---

## ✨ Features on Mobile

- 🔋 **Zero PC Required**: Uses Spotify's official **OAuth 2.0 PKCE** flow directly from your mobile browser — no server, backend, or desktop machine needed.
- 📱 **Native Home Screen App**: Installable directly on iOS (Safari) and Android (Chrome) as a full-screen app with custom icon and launch screen.
- 🖐️ **Fluid Mobile Touch Physics**: Natural swipe right (Like & Add to Spotify) and swipe left (Pass) with haptic feedback (`navigator.vibrate`) and color-coded overlay badges.
- 🎨 **5 Physical Media Formats**:
  - 🎵 **Picture Disc**: Centered vinyl picture disc with full-bleed album art and rotating spindle.
  - 💿 **Vinyl LP**: Classic vinyl record sliding out from the sleeve with interactive spinning.
  - 💽 **CD Jewel Case**: Translucent jewel case with iridescent holographic disc.
  - 📼 **Cassette Tape**: Retro compact cassette with dual tape spools.
  - 🖼️ **Picture Frame**: Modern glass art frame.
- 🌈 **10 Audio-Reactive Visualizers**: Halo, Cyber EQ, Wave, Starfield, Plasma Orb, Matrix Rain, Galaxy, Ribbon, Prism, and Retro Grid.
- 🦎 **Dynamic Chameleon Palette**: Real-time album cover color extraction that automatically themes the ambient background glow to match the playing song.
- 🎶 **30s Audio Teaser Bar**: Instant preview audio playback with interactive waveform progress seeking.
- 📋 **Playlist Management Drawer**:
  - View all tracks currently in the active playlist.
  - **1-Tap Duplicate Cleaner**: Detects and removes duplicate songs instantly.
  - Delete individual songs on the go.
  - **Open in Spotify App**: Deep links directly to the Spotify mobile app (`spotify:playlist:<id>`).

---

## 🚀 1-Minute Free Setup (Deploy to Phone)

Because the mobile app is 100% static (HTML, CSS, JS, and client-side PKCE), you can host it for free on any platform so it stays online permanently.

### Option 1: GitHub Pages (Recommended — Free & Easiest)
1. Create a repository on GitHub (e.g. `spotify-swipe`).
2. Upload the files inside this `mobile/` folder (`index.html`, `style.css`, `app.js`, `theme.js`, `audio.js`, `visualizer.js`, `manifest.json`, `icon-192.png`, `icon-512.png`).
3. Go to **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main` → `/ (root)` → **Save**.
4. GitHub will give you a live HTTPS link:
   ```
   https://<your-username>.github.io/spotify-swipe/
   ```

### Option 2: Vercel / Netlify (Drag & Drop)
1. Go to [vercel.com](https://vercel.com) or [netlify.com](https://netlify.com).
2. Drag and drop the `mobile` folder.
3. You will immediately get a live HTTPS URL like `https://spotify-swipe.vercel.app`.

---

## 🔑 Add Redirect URI to Spotify Developer Dashboard

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Click on your application (**Client ID: `2e9d00e15cc44cffaaba76a52f88e10a`**).
3. Click **Settings** (or Edit Settings).
4. Under **Redirect URIs**, add your live mobile URL:
   - For GitHub Pages: `https://<your-username>.github.io/spotify-swipe/`
   - For Vercel: `https://spotify-swipe.vercel.app/`
5. Click **Save** at the bottom.

*(Note: If you ever change your Client ID, you can also update it anytime directly inside the mobile app's ⚙️ Settings modal).*

---

## 📲 Install on Your Phone (Full-Screen App)

Open your live URL on your phone's browser:

### iPhone / iPad (Safari)
1. Open the URL in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up at the bottom of the screen).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top right.
5. Tap the new **SpotifySwipe** app icon on your home screen — it will open full-screen like a native app!

### Android (Chrome)
1. Open the URL in **Chrome**.
2. Tap the **Three Dots (⋮)** menu in the top right.
3. Tap **Add to Home screen** (or **Install app**).
4. Tap **Install**.
5. Launch from your home screen or app drawer!
