/**
 * Spotify Swipe Mobile — Audio Preview Engine & Frequency Analyser
 * Robust mobile audio player with Web Audio API fallback for mobile Safari/Chrome.
 */

'use strict';

const AudioManager = (() => {
  const audio = new Audio();
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

  // Mobile audio unlocking
  let isUnlocked = false;
  function unlockMobileAudio() {
    if (isUnlocked) return;
    initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    // Play a tiny silent buffer
    if (audioCtx) {
      try {
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
      } catch (e) {}
    }
    isUnlocked = true;
  }

  window.addEventListener('touchstart', unlockMobileAudio, { once: true, passive: true });
  window.addEventListener('click', unlockMobileAudio, { once: true, passive: true });

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
          console.warn('[Audio] MediaElementSource direct connection skipped (using synthetic fallback if needed):', e);
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
    console.warn('[Audio] Playback error on source:', audio.src, e);
  });

  function notifyStateChange() {
    onStateChangeCallbacks.forEach(cb => cb(isPlaying, currentTrack));
  }

  function playTrack(track, autoPlay = true) {
    unlockMobileAudio();
    currentTrack = track;

    if (!track.preview_url) {
      console.warn('[Audio] No preview URL for track:', track.name);
      audio.pause();
      audio.src = '';
      isPlaying = false;
      notifyStateChange();
      return;
    }

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
        let v = 0;
        fadeInterval = setInterval(() => {
          v += 0.12;
          if (v >= volume) {
            audio.volume = isMuted ? 0 : volume;
            clearInterval(fadeInterval);
          } else {
            audio.volume = isMuted ? 0 : v;
          }
        }, 30);
      }).catch(err => {
        console.log('[Audio] Auto-play was restricted on mobile:', err);
        isPlaying = false;
        notifyStateChange();
      });
    }
  }

  function togglePlayPause() {
    unlockMobileAudio();
    if (!audio.src || !currentTrack) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().then(() => {
        isPlaying = true;
        notifyStateChange();
      }).catch(() => {});
    }
  }

  function pause() {
    audio.pause();
    isPlaying = false;
    notifyStateChange();
  }

  function resume() {
    unlockMobileAudio();
    if (audio.src) {
      audio.play().catch(() => {});
    }
  }

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, val));
    audio.volume = isMuted ? 0 : volume;
    if (gainNode) {
      try {
        gainNode.gain.value = isMuted ? 0 : volume;
      } catch (e) {}
    }
  }

  function seek(progress) {
    const dur = audio.duration || 30;
    audio.currentTime = Math.max(0, Math.min(dur, progress * dur));
  }

  function getAudioData() {
    if (isConnected && analyser && isPlaying) {
      analyser.getByteFrequencyData(freqData);
    } else if (isPlaying) {
      // Synthetic reactive wave generation for mobile when analyserNode is blocked by CORS or quiet
      const now = performance.now() * 0.003;
      const bpm = currentTrack ? (currentTrack.bpm || 120) : 120;
      const beatFreq = (bpm / 60) * Math.PI * 2;
      const beat = (Math.sin(performance.now() * 0.001 * beatFreq) + 1) * 0.5;

      for (let i = 0; i < 128; i++) {
        const wave = Math.sin(now * 1.5 + i * 0.12) * 45;
        const sub = Math.cos(now * 0.8 + i * 0.05) * 35;
        const dynamicVal = 60 + wave + sub + (i < 20 ? beat * 110 : beat * 40);
        freqData[i] = Math.max(0, Math.min(255, dynamicVal));
      }
    } else {
      // Idle gentle float
      const now = performance.now() * 0.001;
      for (let i = 0; i < 128; i++) {
        const idle = Math.sin(now * 0.8 + i * 0.08) * 16 + 22;
        freqData[i] = Math.max(0, Math.min(255, idle));
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

    if (bass > 0.65 && (bass - lastBass) > 0.1) {
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
    togglePlay: togglePlayPause,
    togglePlayPause,
    pause,
    resume,
    setVolume,
    seek,
    getAudioData,
    isPlaying: () => isPlaying,
    getCurrentTrack: () => currentTrack,
    onTimeUpdate: (cb) => onTimeUpdateCallbacks.push(cb),
    onStateChange: (cb) => onStateChangeCallbacks.push(cb),
    unlockMobileAudio
  };
})();
