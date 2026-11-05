/**
 * Spotify Swipe Mobile — Audio Preview Engine & Frequency Analyser
 * Robust mobile audio player with pre-buffering, user gesture unlocking,
 * and built-in synthesizer fallback for mobile browsers (Android / iOS).
 */

'use strict';

const AudioManager = (() => {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';

  let audioCtx = null;
  let synthOsc = null;
  let synthGain = null;
  let synthInterval = null;

  let currentTrack = null;
  let isPlaying = false;
  let isMuted = false;
  let volume = 0.85;

  const onTimeUpdateCallbacks = [];
  const onStateChangeCallbacks = [];

  // Mobile audio unlocking
  let isUnlocked = false;
  function unlockMobileAudio() {
    if (isUnlocked) return;
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass && !audioCtx) {
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    // Prime HTML5 Audio element with an empty silent buffer
    try {
      audio.play().catch(() => {});
      audio.pause();
    } catch (e) {}

    isUnlocked = true;
  }

  // Bind to any user touch
  window.addEventListener('touchstart', unlockMobileAudio, { once: true, passive: true });
  window.addEventListener('click', unlockMobileAudio, { once: true, passive: true });
  window.addEventListener('pointerdown', unlockMobileAudio, { once: true, passive: true });

  audio.addEventListener('play', () => {
    isPlaying = true;
    notifyStateChange();
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    stopSynthFallback();
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
    console.warn('[Audio] Source playback failed, using synth preview fallback:', e);
    startSynthFallback();
  });

  function notifyStateChange() {
    onStateChangeCallbacks.forEach(cb => cb(isPlaying, currentTrack));
  }

  /**
   * Plays track audio preview immediately.
   */
  function playTrack(track, autoPlay = true) {
    unlockMobileAudio();
    currentTrack = track;
    stopSynthFallback();

    if (!track.preview_url) {
      if (autoPlay) {
        startSynthFallback();
      }
      return;
    }

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
          console.warn('[Audio] Browser restricted autoplay, falling back to synth preview:', err);
          startSynthFallback();
        });
      }
    }
  }

  function togglePlayPause() {
    unlockMobileAudio();
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }

  function pause() {
    audio.pause();
    stopSynthFallback();
    isPlaying = false;
    notifyStateChange();
  }

  function resume() {
    unlockMobileAudio();
    if (currentTrack && currentTrack.preview_url) {
      audio.src = currentTrack.preview_url;
      audio.play().then(() => {
        isPlaying = true;
        notifyStateChange();
      }).catch(err => {
        console.warn('[Audio] Resume blocked:', err);
        startSynthFallback();
      });
    } else {
      startSynthFallback();
    }
  }

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, val));
    audio.volume = isMuted ? 0 : volume;
    if (synthGain) {
      synthGain.gain.value = volume * 0.15;
    }
  }

  function seek(progress) {
    const dur = audio.duration || 30;
    audio.currentTime = Math.max(0, Math.min(dur, progress * dur));
  }

  /**
   * Melodic synth preview fallback using Web Audio API when streaming audio is blocked
   */
  function startSynthFallback() {
    unlockMobileAudio();
    stopSynthFallback();
    if (!audioCtx) return;

    isPlaying = true;
    notifyStateChange();

    try {
      synthGain = audioCtx.createGain();
      synthGain.gain.value = volume * 0.14;
      synthGain.connect(audioCtx.destination);

      const notes = [220, 261.63, 293.66, 329.63, 392, 440];
      let step = 0;
      let startTime = audioCtx.currentTime;

      synthInterval = setInterval(() => {
        if (!isPlaying) {
          stopSynthFallback();
          return;
        }

        const osc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();
        const freq = notes[step % notes.length];
        step++;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        noteGain.gain.setValueAtTime(synthGain.gain.value, audioCtx.currentTime);
        noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

        osc.connect(noteGain);
        noteGain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.38);

        // Update progress callback
        const elapsed = (audioCtx.currentTime - startTime) % 30;
        onTimeUpdateCallbacks.forEach(cb => cb(elapsed, 30, elapsed / 30));
      }, 400);
    } catch (e) {
      console.warn('[Audio] Synth fallback error:', e);
    }
  }

  function stopSynthFallback() {
    if (synthInterval) {
      clearInterval(synthInterval);
      synthInterval = null;
    }
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
    isPlaying: () => isPlaying,
    getCurrentTrack: () => currentTrack,
    onTimeUpdate: (cb) => onTimeUpdateCallbacks.push(cb),
    onStateChange: (cb) => onStateChangeCallbacks.push(cb),
    unlockMobileAudio
  };
})();
