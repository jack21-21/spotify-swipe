/**
 * Spotify Swipe — Audio Preview Engine & Frequency Analyser
 * Connects HTML5 Audio to Web Audio API AnalyserNode.
 * Provides real-time frequency analysis, beat detection, and volume fading.
 */

'use strict';

const AudioManager = (() => {
  let audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';

  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let gainNode = null;
  let isConnected = false;

  const freqData = new Uint8Array(128);
  let currentTrack = null;
  let isPlaying = false;
  let isMuted = false;
  let volume = 0.85;

  let fadeInterval = null;
  let beatPulse = 0;
  let lastBass = 0;

  // Listeners
  const onTimeUpdateCallbacks = [];
  const onStateChangeCallbacks = [];

  function initAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;

        gainNode = audioCtx.createGain();
        gainNode.gain.value = volume;

        try {
          sourceNode = audioCtx.createMediaElementSource(audio);
          sourceNode.connect(analyser);
          analyser.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          isConnected = true;
        } catch (e) {
          console.warn('[Audio] Direct media element source failed, will use proxy fallback:', e);
        }
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Audio element events
  audio.addEventListener('play', () => {
    isPlaying = true;
    notifyStateChange();
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    notifyStateChange();
  });

  audio.addEventListener('ended', () => {
    // Loop the 30s preview seamlessly
    audio.currentTime = 0;
    audio.play().catch(() => {});
  });

  audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime || 0;
    const dur = audio.duration || 30;
    const progress = dur > 0 ? (cur / dur) : 0;
    onTimeUpdateCallbacks.forEach(cb => cb(cur, dur, progress));
  });

  audio.addEventListener('error', (e) => {
    console.warn('[Audio] Playback error on source, trying proxy:', audio.src);
    // If not already using proxy, try proxying
    if (audio.src && !audio.src.includes('/api/proxy-audio')) {
      const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(audio.src)}`;
      audio.src = proxyUrl;
      audio.play().catch(() => {});
    }
  });

  function notifyStateChange() {
    onStateChangeCallbacks.forEach(cb => cb(isPlaying, currentTrack));
  }

  function playTrack(track, autoPlay = true) {
    initAudioContext();
    currentTrack = track;

    if (!track.preview_url) {
      console.warn('[Audio] No preview URL for track:', track.name);
      audio.pause();
      audio.src = '';
      isPlaying = false;
      notifyStateChange();
      return;
    }

    // Smooth volume fade-out previous before loading
    audio.src = track.preview_url;
    audio.currentTime = 0;

    if (autoPlay) {
      fadeInAndPlay();
    }
  }

  function fadeInAndPlay() {
    if (fadeInterval) clearInterval(fadeInterval);
    audio.volume = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        isPlaying = true;
        notifyStateChange();
        // Fade in volume over 250ms
        let v = 0;
        fadeInterval = setInterval(() => {
          v += 0.1;
          if (v >= volume) {
            audio.volume = isMuted ? 0 : volume;
            clearInterval(fadeInterval);
          } else {
            audio.volume = isMuted ? 0 : v;
          }
        }, 25);
      }).catch(err => {
        console.log('[Audio] Auto-play was prevented by browser policy until user gesture:', err);
        isPlaying = false;
        notifyStateChange();
      });
    }
  }

  function togglePlay() {
    initAudioContext();
    if (audio.paused) {
      audio.play().then(() => {
        isPlaying = true;
        notifyStateChange();
      }).catch(() => {});
    } else {
      audio.pause();
      isPlaying = false;
      notifyStateChange();
    }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (!isMuted) {
      audio.volume = volume;
      if (gainNode) gainNode.gain.value = volume;
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    audio.volume = isMuted ? 0 : volume;
    if (gainNode) {
      gainNode.gain.value = isMuted ? 0 : volume;
    }
    return isMuted;
  }

  function seek(time) {
    if (audio.duration) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, time));
    }
  }

  /**
   * Returns live frequency spectrum and calculated bass, mid, treble, and beatPulse.
   */
  function getAudioData() {
    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(freqData);
    } else {
      // Simulate subtle ambient motion when idle/paused
      for (let i = 0; i < freqData.length; i++) {
        freqData[i] = Math.max(0, freqData[i] * 0.92);
      }
    }

    // Frequency band averages
    let bSum = 0, mSum = 0, tSum = 0;
    const bEnd = 16;
    const mEnd = 64;
    const tEnd = 120;

    for (let i = 0; i < bEnd; i++) bSum += freqData[i];
    for (let i = bEnd; i < mEnd; i++) mSum += freqData[i];
    for (let i = mEnd; i < tEnd; i++) tSum += freqData[i];

    const bass = (bSum / bEnd) / 255;
    const mid = (mSum / (mEnd - bEnd)) / 255;
    const treb = (tSum / (tEnd - mEnd)) / 255;
    const energy = (bass * 0.5) + (mid * 0.35) + (treb * 0.15);

    // Simple peak beat detection
    if (bass > 0.65 && (bass - lastBass) > 0.12) {
      beatPulse = 1.0;
    } else {
      beatPulse *= 0.88;
    }
    lastBass = bass;

    return {
      frequencies: freqData,
      bass,
      mid,
      treb,
      energy,
      beatPulse
    };
  }

  return {
    init: initAudioContext,
    playTrack,
    togglePlay,
    setVolume,
    toggleMute,
    seek,
    isPlaying: () => isPlaying,
    isMuted: () => isMuted,
    getVolume: () => volume,
    getAudioData,
    onTimeUpdate: (cb) => onTimeUpdateCallbacks.push(cb),
    onStateChange: (cb) => onStateChangeCallbacks.push(cb)
  };
})();
