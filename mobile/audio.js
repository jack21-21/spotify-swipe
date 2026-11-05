/**
 * Spotify Swipe Mobile — High-Fidelity Audio Preview Engine
 * Real Music Audio Player optimized for mobile browsers (Android / iOS / Samsung).
 * Zero synthetic beeps — only authentic studio music previews & Spotify playback.
 */

'use strict';

const AudioManager = (() => {
  // Mobile-compatible HTML5 Audio Element
  const audio = new Audio();
  audio.preload = 'auto';
  // Note: Do not set crossOrigin = 'anonymous' unless using Web Audio AnalyserNode,
  // as Apple and CDN audio servers may reject or fail on CORS media headers.

  // 44-byte valid silent WAV data URI to unlock mobile audio pipeline without errors
  const SILENT_BUFFER_DATA_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  let currentTrack = null;
  let isPlaying = false;
  let isMuted = false;
  let volume = 0.85;
  let isUnlocked = false;

  const onTimeUpdateCallbacks = [];
  const onStateChangeCallbacks = [];
  const onErrorCallbacks = [];

  /**
   * Prime & unlock the mobile HTML5 audio engine on user touch.
   * Mobile browsers (Android Chrome, iOS Safari) require an initial user gesture.
   */
  function unlockMobileAudio() {
    if (isUnlocked) return;
    try {
      audio.src = SILENT_BUFFER_DATA_URI;
      const p = audio.play();
      if (p !== undefined) {
        p.then(() => {
          audio.pause();
          isUnlocked = true;
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // Bind to any first user touch on the screen
  window.addEventListener('touchstart', unlockMobileAudio, { once: true, passive: true });
  window.addEventListener('pointerdown', unlockMobileAudio, { once: true, passive: true });
  window.addEventListener('click', unlockMobileAudio, { once: true, passive: true });

  /* ---------------------------- Audio Event Handlers ---------------------------- */

  audio.addEventListener('play', () => {
    // Ignore play events from silent buffer priming
    if (audio.src.startsWith('data:audio/wav')) return;
    isPlaying = true;
    notifyStateChange();
  });

  audio.addEventListener('playing', () => {
    if (audio.src.startsWith('data:audio/wav')) return;
    isPlaying = true;
    notifyStateChange();
  });

  audio.addEventListener('pause', () => {
    if (audio.src.startsWith('data:audio/wav')) return;
    isPlaying = false;
    notifyStateChange();
  });

  audio.addEventListener('ended', () => {
    // Loop the 30-second preview smoothly while on the card
    audio.currentTime = 0;
    audio.play().catch(() => {});
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.src.startsWith('data:audio/wav')) return;
    const cur = audio.currentTime || 0;
    const dur = audio.duration || 30;
    const progress = dur > 0 ? Math.min(1, cur / dur) : 0;
    onTimeUpdateCallbacks.forEach(cb => cb(cur, dur, progress));
  });

  audio.addEventListener('error', (e) => {
    if (audio.src.startsWith('data:audio/wav')) return;
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
   * Plays a track's audio preview immediately with real audio.
   */
  function playTrack(track, autoPlay = true) {
    unlockMobileAudio();
    currentTrack = track;

    if (!track || !track.preview_url) {
      isPlaying = false;
      notifyStateChange();
      return;
    }

    // If already playing this exact track, resume if paused
    if (audio.src === track.preview_url && !audio.paused) {
      isPlaying = true;
      notifyStateChange();
      return;
    }

    try {
      audio.src = track.preview_url;
      audio.currentTime = 0;
      audio.volume = isMuted ? 0 : volume;

      if (autoPlay) {
        const p = audio.play();
        if (p !== undefined) {
          p.then(() => {
            isPlaying = true;
            notifyStateChange();
          }).catch(err => {
            console.warn('[Audio] Autoplay paused by mobile browser policy:', err.message);
            isPlaying = false;
            notifyStateChange();
          });
        }
      }
    } catch (err) {
      console.warn('[Audio] Error setting audio source:', err);
      isPlaying = false;
      notifyStateChange();
    }
  }

  function togglePlayPause() {
    unlockMobileAudio();
    if (isPlaying && !audio.paused) {
      pause();
    } else {
      resume();
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
      if (audio.src !== currentTrack.preview_url) {
        audio.src = currentTrack.preview_url;
      }
      audio.volume = isMuted ? 0 : volume;
      const p = audio.play();
      if (p !== undefined) {
        p.then(() => {
          isPlaying = true;
          notifyStateChange();
        }).catch(err => {
          console.warn('[Audio] Resume blocked:', err);
        });
      }
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
    isPlaying: () => isPlaying && !audio.paused,
    getCurrentTrack: () => currentTrack,
    onTimeUpdate: (cb) => onTimeUpdateCallbacks.push(cb),
    onStateChange: (cb) => onStateChangeCallbacks.push(cb),
    onError: (cb) => onErrorCallbacks.push(cb),
    unlockMobileAudio
  };
})();
