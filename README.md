# Spotify Swipe — Playlist Maker & Physical Media Visualizer

A luxury, high-energy **Spotify Swipe** desktop & web application for curating Spotify playlists through card swiping. Built with Apple Liquid Glass and Obsidian aesthetics, dynamic chameleon cover-art color extraction, 10 reactive audio visualizers, realistic physical media formats (Vinyl LP, Holographic CD, Retro Cassette, Picture Frame), full volume controls, and real-time Spotify Web API synchronization.

---

## ⚡ Highlights & Features

- **Interactive Swiping Deck**:
  - Physics-based card drag with tilt rotation, rubber-banding, and dynamic `LIKE` / `NOPE` / `SUPER LIKE` stamps.
  - **Swipe Right (Like)**: Immediately adds the song to your Spotify playlist in real time.
  - **Swipe Left (Pass)**: Skips to the next track.
  - **Undo**: Instantly restores your last swiped track (`Z`).
  - **Duplicate Prevention**: Automatically scans your selected playlist and your listening library upfront to ensure you never get duplicates.

- **Realistic Physical Media & Artwork Engine**:
  - Switch anytime via the quick in-card format pill `[ 💿 | 💽 | 📼 | 🖼️ ]` or the Settings menu:
    1. **💿 Vinyl Record**: Album jacket with matte sleeve spine, inner mouth shadow, and a 12" vinyl LP that slides out and spins at 33⅓ RPM with concentric grooves and realistic light sheens when playing.
    2. **💽 Holographic CD**: Clear acrylic jewel case with hinge and sliding compact disc featuring iridescent rainbow diffraction sheen (`conic-gradient`), data tracks, and laser spin reflections.
    3. **📼 Retro Cassette Tape**: Vintage cassette shell with perimeter corner screws, printed Side-A label customized to the album art, and rotating dual tape spools.
    4. **🖼️ Picture Frame**: Gallery-grade glass frame with specular bevel and audio-reactive edge glow.

- **Full Audio & Volume Controls**:
  - **Master Volume Slider**: Located in the top header with live percentage readout (`0% - 100%`) and one-click mute/unmute toggle (`M`).
  - **In-Card Volume Slider**: Adjust preview volume directly inside the track preview bar.
  - **30-Second Audio Teaser**: Smooth fading, animated waveform visualizer, scrubber, and timer readout.
  - **Stream to Spotify Desktop**: 1-click button (`S`) to send the full-length song directly to your running Spotify desktop app (`PUT /me/player/play`).

- **10 Dynamic Reactive Audio Visualizers**:
  - Real-time Web Audio API frequency analysis powering 10 custom visualizer engines:
    1. **Spotlight Halo**: Radial sound ring with particle halo.
    2. **Cyber EQ**: Equalizer bars with glowing peak indicators.
    3. **Liquid Wave**: Flowing dual sine audio wave.
    4. **Cosmic Starfield**: 3D hyperspace warp reacting to bass hits.
    5. **Plasma Orb**: Solar coronal energy sphere.
    6. **Cyber Rain**: Matrix code stream responding to mid/treble frequencies.
    7. **Cosmic Galaxy**: Dual-arm rotating particle vortex.
    8. **Chroma Ribbon**: 3D silk wavebands undulating with sound.
    9. **Audio Prism**: Kaleidoscopic geometric prism.
    10. **Synthwave Grid**: 80s outrun perspective neon grid.

- **Slide-Over Live Playlist Drawer & Management**:
  - Real-time list of all tracks added to the active playlist with individual track durations.
  - **1-Click Delete Duplicates**: Instantly scans the active playlist on Spotify and eliminates duplicate songs in one click.
  - **Single Track Removal**: Click the `✕` button on any track in the drawer to remove it from your Spotify playlist.
  - **Playlist Swapping Modal**: Switch between existing playlists in your library on the fly without restarting.

- **Dynamic Chameleon Theme Palette**:
  - Extracts color palettes from album covers on the fly (`ThemeManager`).
  - Silky-smooth 1.4-second cubic transitions between song themes.
  - Synchronizes ambient background orbs, visualizer colors, buttons, and glow effects.

- **Windows Desktop Integration**:
  - Frameless liquid glass window via `pywebview` (with automatic fallback to default browser).
  - Custom title bar with drag region, minimize, maximize, and close buttons.
  - Custom Windows taskbar and application icon grouping.

---

## 🎮 Controls & Shortcuts

| Action | Mouse / Gesture | Keyboard |
| :--- | :--- | :--- |
| **Pass / Skip** | Drag card left / Click ❌ | `←` or `A` |
| **Like & Add to Spotify** | Drag card right / Click 💚 | `→` or `D` |
| **Play / Pause Preview** | Click Teaser Play button / Action circle | `Space` |
| **Play Full on Spotify App**| Click Spotify Stream button (🎵) | `S` |
| **Undo Last Swipe** | Click ⏪ button | `Z` |
| **Mute / Unmute** | Click Volume speaker icon | `M` |
| **Switch Media Format** | Click `[ 💿 \| 💽 \| 📼 \| 🖼️ ]` on card | — |
| **Adjust Volume** | Drag Header or Card slider | — |
| **Open Playlist Drawer** | Click Playlist pill at top-left | — |

---

## 🚀 Quick Start (Sharing & Running)

### Requirements
- **Python 3.9+** ([python.org](https://www.python.org/downloads/)) - *Check "Add Python to PATH" during installation*.
- Spotify Free or Premium account.

### 1-Click Launch (Windows)
Double-click `start.bat`. It will automatically verify Python, install dependencies if needed, and start the app on `http://127.0.0.1:8888`.

### Manual CLI Launch
```powershell
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run application
python main.py
```
Open [http://127.0.0.1:8888](http://127.0.0.1:8888) in any browser, or enjoy the native frameless window.
