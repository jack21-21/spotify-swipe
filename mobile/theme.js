/**
 * Spotify Swipe Mobile — Dynamic Theme Chameleon Engine
 * Real-time cover art palette extraction with silky smooth 1.2s CSS variable interpolation.
 */

'use strict';

const ThemeManager = (() => {
  let currentCssPri = [30, 215, 96];   // Spotify green
  let currentCssSec = [56, 189, 248];  // Sky blue
  let themeAnimFrame = null;

  const paletteCache = new Map();

  function smoothTransitionCssColors(targetPri, targetSec, duration = 1200) {
    if (themeAnimFrame) cancelAnimationFrame(themeAnimFrame);
    const startPri = [...currentCssPri];
    const startSec = [...currentCssSec];
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out

      currentCssPri = startPri.map((s, i) => Math.round(s + (targetPri[i] - s) * ease));
      currentCssSec = startSec.map((s, i) => Math.round(s + (targetSec[i] - s) * ease));

      document.documentElement.style.setProperty('--accent', currentCssPri.join(', '));
      document.documentElement.style.setProperty('--accent-sec', currentCssSec.join(', '));
      document.documentElement.style.setProperty('--accent-hex', rgbToHex(currentCssPri));
      document.documentElement.style.setProperty('--accent-sec-hex', rgbToHex(currentCssSec));

      if (progress < 1) {
        themeAnimFrame = requestAnimationFrame(step);
      }
    }

    themeAnimFrame = requestAnimationFrame(step);
  }

  function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function extractPalette(imageUrl, callback) {
    if (!imageUrl) {
      const fallback = { pri: [30, 215, 96], sec: [56, 189, 248] };
      smoothTransitionCssColors(fallback.pri, fallback.sec);
      if (callback) callback(fallback);
      return;
    }

    if (paletteCache.has(imageUrl)) {
      const cached = paletteCache.get(imageUrl);
      smoothTransitionCssColors(cached.pri, cached.sec);
      if (callback) callback(cached);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 36;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 36, 36);
        const data = ctx.getImageData(0, 0, 36, 36).data;

        const buckets = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          const sat = max === min ? 0 : (lum > 127 ? (max - min) / (510 - max - min) : (max - min) / (max + min));

          if (lum > 26 && lum < 235 && sat > 0.16) {
            buckets.push({ r, g, b, sat, lum, score: sat * 3.5 + lum / 255 });
          }
        }

        let pri = [30, 215, 96];
        let sec = [56, 189, 248];

        if (buckets.length > 0) {
          buckets.sort((a, b) => b.score - a.score);
          const top = buckets[0];
          const m = Math.max(top.r, top.g, top.b) || 1;
          const k = Math.min(2.4, 230 / m);
          pri = [
            Math.min(255, (top.r * k) | 0),
            Math.min(255, (top.g * k) | 0),
            Math.min(255, (top.b * k) | 0),
          ];

          const diff = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
          const candidateSec = buckets.find((item) => diff(item, top) > 75) || buckets[buckets.length - 1];
          const m2 = Math.max(candidateSec.r, candidateSec.g, candidateSec.b) || 1;
          const k2 = Math.min(2.4, 220 / m2);
          sec = [
            Math.min(255, (candidateSec.r * k2) | 0),
            Math.min(255, (candidateSec.g * k2) | 0),
            Math.min(255, (candidateSec.b * k2) | 0),
          ];
        }

        const result = { pri, sec };
        paletteCache.set(imageUrl, result);
        smoothTransitionCssColors(pri, sec);
        if (callback) callback(result);
      } catch (err) {
        console.warn('[Theme] Palette extraction fallback:', err);
        const fallback = { pri: [30, 215, 96], sec: [56, 189, 248] };
        smoothTransitionCssColors(fallback.pri, fallback.sec);
        if (callback) callback(fallback);
      }
    };

    img.onerror = () => {
      const fallback = { pri: [30, 215, 96], sec: [56, 189, 248] };
      smoothTransitionCssColors(fallback.pri, fallback.sec);
      if (callback) callback(fallback);
    };

    img.src = imageUrl;
  }

  return {
    extractPalette,
    smoothTransitionCssColors,
    getCurrentColors: () => ({ pri: currentCssPri, sec: currentCssSec })
  };
})();
