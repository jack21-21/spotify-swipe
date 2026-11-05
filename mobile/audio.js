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
        }).catch(err => {
          console.warn('[Audio] Autoplay blocked or interrupted:', err.message);
          isPlaying = false;
          notifyStateChange();
        });
      }
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
    audio.volume = isMuted ? 0 : volume;
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
    seek,
    isPlaying: () => !audio.paused && isPlaying,
    getCurrentTrack: () => currentTrack,
    onTimeUpdate: (cb) => onTimeUpdateCallbacks.push(cb),
    onStateChange: (cb) => onStateChangeCallbacks.push(cb),
    onError: (cb) => onErrorCallbacks.push(cb),
    unlockMobileAudio
  };
})();
