/**
 * Spotify Swipe — High-Fidelity Audio Preview Engine (PC & Mobile)
 * Real Music Audio Player supporting 100% of modern browsers (Chrome, Edge, Firefox, Safari, Android).
 * Zero synthetic beeps — only authentic studio music previews & Spotify playback.
 */

'use strict';

const AudioManager = (() => {
  // Mobile & Desktop compatible HTML5 Audio Element
  const audio = new Audio();
  audio.preload = 'auto';

  let currentTrack = null;
  let isPlaying = false;
  let isMuted = false;
  let volume = 0.85;
  let isUnlocked = false;

  const onTimeUpdateCallbacks = [];
  const onStateChangeCallbacks = [];
  const onErrorCallbacks = [];

  /**
   * Prime & unlock mobile/browser audio policy on user interaction.
   * Uses an isolated throwaway Audio element so it NEVER pauses or resets the main player!
   */
  function unlockMobileAudio() {
    if (isUnlocked) return;
    isUnlocked = true;
    try {
      const prime = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      prime.play().then(() => prime.remove()).catch(() => {});
    } catch (e) {}
  }

  // Bind to any initial user gesture
  window.addEventListener('touchstart', unlockMobileAudio, { once: true, passive: true });
  window.addEventListener('pointerdown', unlockMobileAudio, { once: true, passive: true });
  window.addEventListener('click', unlockMobileAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockMobileAudio, { once: true, passive: true });

  /* ---------------------------- Audio Event Handlers ---------------------------- */

  audio.addEventListener('play', () => {
    isPlaying = true;
    notifyStateChange();
  });

  audio.addEventListener('playing', () => {
    isPlaying = true;
    notifyStateChange();
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    notifyStateChange();
  });

  audio.addEventListener('ended', () => {
    // Loop the 30-second preview smoothly while on the card
    audio.currentTime = 0;
    audio.play().catch(() => {});
  });

  audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime || 0;
    const dur = audio.duration || 30;
    const progress = dur > 0 ? Math.min(1, cur / dur) : 0;
    onTimeUpdateCallbacks.forEach(cb => cb(cur, dur, progress));
  });

  audio.addEventListener('error', (e) => {
    console.warn('[Audio] Playback error on source:', audio.src, e);
    isPlaying = false;
    notifyStateChange();
    onErrorCallbacks.forEach(cb => cb(e, currentTrack));
  });

  function notifyStateChange() {
    onStateChangeCallbacks.forEach(cb => cb(isPlaying, currentTrack));
  }

  /* ---------------------------- Public Playback Methods ---------------------------- */

  /**
   * Plays a track's audio preview immediately with real studio audio.
   */
  function playTrack(track, autoPlay = true) {
    if (!track) return;
    currentTrack = track;

    if (!track.preview_url) {
      isPlaying = false;
      notifyStateChange();
      return;
    }

    // Only change audio.src if it's actually a different URL
    if (audio.src !== track.preview_url) {
      audio.src = track.preview_url;
      audio.currentTime = 0;
    }

    audio.volume = isMuted ? 0 : volume;

    if (autoPlay) {
      const p = audio.play();
      if (p !== undefined) {
        p.then(() => {
          isPlaying = true;
          notifyStateChange();
          updateMediaSession(track);
        }).catch(err => {
          console.warn('[Audio] Autoplay blocked or interrupted:', err.message);
          isPlaying = false;
          notifyStateChange();
        });
      }
    } else {
      updateMediaSession(track);
    }
  }

  /**
   * Sets up Android / Chrome / Mobile lock screen media notification with high-res artwork.
   */
  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    try {
      const artwork = [];
      if (track.cover_url) {
        artwork.push(
          { src: track.cover_url, sizes: '96x96', type: 'image/jpeg' },
          { src: track.cover_url, sizes: '128x128', type: 'image/jpeg' },
          { src: track.cover_url, sizes: '192x192', type: 'image/jpeg' },
          { src: track.cover_url, sizes: '256x256', type: 'image/jpeg' },
          { src: track.cover_url, sizes: '384x384', type: 'image/jpeg' },
          { src: track.cover_url, sizes: '512x512', type: 'image/jpeg' }
        );
      } else {
        artwork.push(
          { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png' }
        );
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name || 'Spotify Track',
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Spotify Swipe',
        artwork: artwork
      });

      navigator.mediaSession.setActionHandler('play', () => { resume(); });
      navigator.mediaSession.setActionHandler('pause', () => { pause(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (typeof window.triggerSwipeRight === 'function') window.triggerSwipeRight();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (typeof window.triggerSwipeUndo === 'function') window.triggerSwipeUndo();
      });
    } catch (e) {
      console.warn('[MediaSession] Metadata update warning:', e);
    }
  }

  function togglePlayPause() {
    unlockMobileAudio();
    if (!audio.paused && isPlaying) {
      pause();
    } else {
      if (currentTrack && currentTrack.preview_url) {
        playTrack(currentTrack, true);
      }
    }
  }

  function pause() {
    try {
      audio.pause();
    } catch (e) {}
    isPlaying = false;
    notifyStateChange();
  }

  function resume() {
    unlockMobileAudio();
    if (currentTrack && currentTrack.preview_url) {
      playTrack(currentTrack, true);
    }
  }

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, val));
    isMuted = false;
    audio.volume = volume;
  }

  function toggleMute() {
    isMuted = !isMuted;
    audio.volume = isMuted ? 0 : volume;
    return isMuted;
  }

  function seek(progress) {
    const dur = audio.duration || 30;
    try {
      audio.currentTime = Math.max(0, Math.min(dur, progress * dur));
    } catch (e) {}
  }

  return {
    init: unlockMobileAudio,
    playTrack,
    togglePlay: togglePlayPause,
    togglePlayPause,
    pause,
    resume,
    setVolume,
    toggleMute,
    getVolume: () => volume,
    isMuted: () => isMuted,
    seek,
    isPlaying: () => !audio.paused && isPlaying,
    getCurrentTrack: () => currentTrack,
    onTimeUpdate: (cb) => onTimeUpdateCallbacks.push(cb),
    onStateChange: (cb) => onStateChangeCallbacks.push(cb),
    onError: (cb) => onErrorCallbacks.push(cb),
    updateMediaSession,
    unlockMobileAudio
  };
})();
