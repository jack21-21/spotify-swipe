/**
 * Spotify Swipe — Reactive Audio Visualizer Engine
 * 10 Audio-Reactive Visualizer Modes inspired by Spotify Visualizers (volt-viz) & EDM stages.
 * Supports: Halo, Cyber EQ, Wave, Starfield, Plasma Orb, Matrix Rain, Galaxy, Chroma Ribbon, Prism, Retro Grid.
 */

'use strict';

class AudioVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.w = 0;
    this.h = 0;
    this.mode = 'halo'; // default mode
    this.animId = null;

    // Ambient floating particles
    this.particles = [];
    this.initParticles(45);

    // Starfield pool for warp mode
    this.stars = [];
    this.initStars(120);

    // Matrix Rain streams
    this.rainDrops = [];
    this.initRain(36);

    // Continuous motion variables
    this.galaxyAngle = 0;
    this.gridOffset = 0;
    this.prismAngle = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.start();
  }

  initParticles(count) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 2.5 + 1,
        speedX: (Math.random() - 0.5) * 0.0008,
        speedY: (Math.random() - 0.5) * 0.0008,
        alpha: Math.random() * 0.7 + 0.2,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  initStars(count) {
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: Math.random() * 1.5 + 0.1,
        size: Math.random() * 2 + 1
      });
    }
  }

  initRain(columns) {
    this.rainDrops = [];
    for (let i = 0; i < columns; i++) {
      this.rainDrops.push({
        x: i / columns,
        y: Math.random(),
        speed: Math.random() * 0.006 + 0.004,
        length: Math.floor(Math.random() * 12 + 8),
        chars: '0123456789ABCDEF!@#$%&*'.split('')
      });
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  setMode(newMode) {
    this.mode = newMode;
  }

  getMode() {
    return this.mode;
  }

  start() {
    if (this.animId) cancelAnimationFrame(this.animId);
    const loop = () => {
      this.render();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  render() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    if (w <= 0 || h <= 0) return;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Get current theme colors
    const colors = ThemeManager.getCurrentColors();
    const priRgb = colors.pri;
    const secRgb = colors.sec;

    // Live audio metrics
    const audioData = AudioManager.getAudioData();
    const { frequencies, bass, mid, treb, energy, beatPulse } = audioData;

    // 1. Render Floating ambient particles
    this.renderParticles(ctx, w, h, priRgb, energy);

    // 2. Render chosen mode
    switch (this.mode) {
      case 'halo':
        this.renderSpotlightHalo(ctx, w, h, frequencies, bass, mid, treb, energy, beatPulse, priRgb, secRgb);
        break;
      case 'bars':
        this.renderCyberBars(ctx, w, h, frequencies, priRgb, secRgb);
        break;
      case 'wave':
        this.renderLiquidWave(ctx, w, h, frequencies, energy, priRgb, secRgb);
        break;
      case 'starfield':
        this.renderStarfield(ctx, w, h, bass, energy, beatPulse, priRgb, secRgb);
        break;
      case 'plasma':
        this.renderPlasmaOrb(ctx, w, h, frequencies, bass, mid, energy, priRgb, secRgb);
        break;
      case 'matrix':
        this.renderCyberRain(ctx, w, h, frequencies, energy, priRgb, secRgb);
        break;
      case 'galaxy':
        this.renderGalaxyVortex(ctx, w, h, frequencies, bass, energy, priRgb, secRgb);
        break;
      case 'ribbon':
        this.renderChromaRibbon(ctx, w, h, frequencies, mid, treb, energy, priRgb, secRgb);
        break;
      case 'prism':
        this.renderAudioPrism(ctx, w, h, frequencies, bass, energy, beatPulse, priRgb, secRgb);
        break;
      case 'retrogrid':
        this.renderRetroGrid(ctx, w, h, bass, energy, beatPulse, priRgb, secRgb);
        break;
      default:
        this.renderSpotlightHalo(ctx, w, h, frequencies, bass, mid, treb, energy, beatPulse, priRgb, secRgb);
        break;
    }
  }

  renderParticles(ctx, w, h, priRgb, energy) {
    const now = performance.now() * 0.002;
    ctx.save();
    for (let p of this.particles) {
      p.x += p.speedX * (1 + energy * 2.2);
      p.y += p.speedY * (1 + energy * 2.2);
      if (p.x < 0) p.x = 1;
      if (p.x > 1) p.x = 0;
      if (p.y < 0) p.y = 1;
      if (p.y > 1) p.y = 0;

      const px = p.x * w;
      const py = p.y * h;
      const pulseAlpha = Math.sin(now + p.phase) * 0.3 + p.alpha;
      const finalAlpha = Math.max(0.08, Math.min(0.85, pulseAlpha * (0.5 + energy * 0.7)));

      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 + energy * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${priRgb.join(',')}, ${finalAlpha})`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `rgba(${priRgb.join(',')}, ${finalAlpha})`;
      ctx.fill();
    }
    ctx.restore();
  }

  /* 1. Spotlight Halo */
  renderSpotlightHalo(ctx, w, h, freq, bass, mid, treb, energy, beatPulse, priRgb, secRgb) {
    const cardArt = document.querySelector('.card.active .card-art-stage');
    let cx = w / 2;
    let cy = h / 2;
    if (cardArt) {
      const rect = cardArt.getBoundingClientRect();
      cx = rect.left + (rect.width / 2);
      cy = rect.top + (rect.height / 2);
    }

    const baseRadius = 135;
    const pulseRadius = baseRadius + (bass * 28) + (beatPulse * 16);

    ctx.save();
    const glowGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.6, cx, cy, baseRadius * 1.6);
    glowGrad.addColorStop(0, `rgba(${priRgb.join(',')}, ${0.15 + bass * 0.25})`);
    glowGrad.addColorStop(0.6, `rgba(${secRgb.join(',')}, ${0.08 + energy * 0.18})`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    const numPoints = 84;
    const step = (Math.PI * 2) / numPoints;
    const freqSlice = Math.floor(freq.length / numPoints);

    ctx.beginPath();
    for (let i = 0; i <= numPoints; i++) {
      const idx = (i % numPoints) * freqSlice;
      const val = (freq[idx] || 0) / 255;
      const r = pulseRadius + (val * 48 * (1 + energy));
      const angle = i * step - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.strokeStyle = `rgba(${priRgb.join(',')}, 0.75)`;
    ctx.lineWidth = 3.5 + bass * 3;
    ctx.shadowBlur = 18 + beatPulse * 16;
    ctx.shadowColor = `rgb(${priRgb.join(',')})`;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, pulseRadius - 10, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${secRgb.join(',')}, ${0.5 + energy * 0.4})`;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = `rgb(${secRgb.join(',')})`;
    ctx.stroke();
    ctx.restore();
  }

  /* 2. Cyber EQ Bars */
  renderCyberBars(ctx, w, h, freq, priRgb, secRgb) {
    const numBars = 48;
    const barSpacing = 4;
    const totalBarWidth = w * 0.85;
    const barWidth = Math.max(3, (totalBarWidth / numBars) - barSpacing);
    const startX = (w - totalBarWidth) / 2;
    const maxBarHeight = h * 0.38;
    const baseY = h * 0.88;

    ctx.save();
    for (let i = 0; i < numBars; i++) {
      const freqIdx = Math.floor((i / numBars) * (freq.length * 0.75));
      const val = (freq[freqIdx] || 0) / 255;
      const barHeight = Math.max(4, val * maxBarHeight);
      const x = startX + i * (barWidth + barSpacing);
      const y = baseY - barHeight;

      const grad = ctx.createLinearGradient(x, baseY, x, y);
      grad.addColorStop(0, `rgba(${secRgb.join(',')}, 0.25)`);
      grad.addColorStop(0.6, `rgba(${priRgb.join(',')}, 0.85)`);
      grad.addColorStop(1, `rgba(255, 255, 255, 0.95)`);

      ctx.fillStyle = grad;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `rgba(${priRgb.join(',')}, 0.65)`;

      this.drawRoundedRect(ctx, x, y, barWidth, barHeight, 3);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y - 5, barWidth, 2);
    }
    ctx.restore();
  }

  /* 3. Liquid Neon Wave */
  renderLiquidWave(ctx, w, h, freq, energy, priRgb, secRgb) {
    const centerY = h * 0.78;
    const waveWidth = w * 0.9;
    const startX = (w - waveWidth) / 2;
    const numPoints = 64;
    const step = waveWidth / numPoints;
    const time = performance.now() * 0.003;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, centerY);

    for (let i = 0; i <= numPoints; i++) {
      const freqIdx = Math.floor((i / numPoints) * 80);
      const val = (freq[freqIdx] || 0) / 255;
      const sine = Math.sin(time + (i * 0.15)) * 14;
      const y = centerY - (val * 64 * (1 + energy)) + sine;
      const x = startX + (i * step);
      ctx.lineTo(x, y);
    }

    ctx.lineTo(startX + waveWidth, centerY + 60);
    ctx.lineTo(startX, centerY + 60);
    ctx.closePath();

    const waveGrad = ctx.createLinearGradient(startX, centerY - 60, startX, centerY + 60);
    waveGrad.addColorStop(0, `rgba(${priRgb.join(',')}, 0.7)`);
    waveGrad.addColorStop(0.5, `rgba(${secRgb.join(',')}, 0.3)`);
    waveGrad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = waveGrad;
    ctx.shadowBlur = 16;
    ctx.shadowColor = `rgb(${priRgb.join(',')})`;
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 255, 255, 0.9)`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  /* 4. Cosmic Starfield / Warp */
  renderStarfield(ctx, w, h, bass, energy, beatPulse, priRgb, secRgb) {
    const cx = w / 2;
    const cy = h / 2;
    const speed = 0.015 + (bass * 0.05) + (beatPulse * 0.03);

    ctx.save();
    for (let star of this.stars) {
      star.z -= speed;
      if (star.z <= 0) {
        star.z = 1.5;
        star.x = (Math.random() - 0.5) * 2;
        star.y = (Math.random() - 0.5) * 2;
      }

      const k = 1 / star.z;
      const px = star.x * k * cx + cx;
      const py = star.y * k * cy + cy;

      if (px >= 0 && px <= w && py >= 0 && py <= h) {
        const size = Math.max(1, (1 - star.z / 1.5) * 5 * (1 + bass * 0.8));
        const alpha = Math.min(1, Math.max(0.1, (1 - star.z / 1.5) * 1.2));

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = star.z < 0.6 ? `rgba(${priRgb.join(',')}, ${alpha})` : `rgba(${secRgb.join(',')}, ${alpha})`;
        ctx.shadowBlur = star.z < 0.5 ? 12 : 4;
        ctx.shadowColor = `rgb(${priRgb.join(',')})`;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* 5. Plasma Orb with Coronal Flares */
  renderPlasmaOrb(ctx, w, h, freq, bass, mid, energy, priRgb, secRgb) {
    const cx = w / 2;
    const cy = h / 2;
    const baseR = 100 + (bass * 30);
    const time = performance.now() * 0.002;

    ctx.save();
    // Inner plasma glow
    const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, baseR * 1.5);
    grad.addColorStop(0, `rgba(255, 255, 255, ${0.4 + bass * 0.4})`);
    grad.addColorStop(0.4, `rgba(${priRgb.join(',')}, ${0.35 + energy * 0.3})`);
    grad.addColorStop(0.8, `rgba(${secRgb.join(',')}, ${0.15 + energy * 0.2})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Coronal solar flares
    const flares = 48;
    ctx.beginPath();
    for (let i = 0; i <= flares; i++) {
      const angle = (i / flares) * Math.PI * 2;
      const fIdx = Math.floor((i / flares) * (freq.length * 0.5));
      const val = (freq[fIdx] || 0) / 255;
      const noise = Math.sin(angle * 6 + time * 3) * 12;
      const r = baseR + (val * 60) + noise;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(${priRgb.join(',')}, 0.8)`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 18;
    ctx.shadowColor = `rgb(${priRgb.join(',')})`;
    ctx.stroke();
    ctx.restore();
  }

  /* 6. Cyber Rain (Matrix) */
  renderCyberRain(ctx, w, h, freq, energy, priRgb, secRgb) {
    ctx.save();
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';

    for (let drop of this.rainDrops) {
      drop.y += drop.speed * (1 + energy * 2.5);
      if (drop.y > 1) {
        drop.y = 0;
        drop.x = Math.random();
      }

      const x = drop.x * w;
      const freqIdx = Math.floor(drop.x * 60);
      const val = (freq[freqIdx] || 0) / 255;

      for (let j = 0; j < drop.length; j++) {
        const charY = (drop.y * h) - (j * 15);
        if (charY > 0 && charY < h) {
          const char = drop.chars[(Math.floor(performance.now() * 0.01) + j) % drop.chars.length];
          const alpha = Math.max(0.05, 1 - (j / drop.length));
          if (j === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 8;
            ctx.shadowColor = `rgb(${priRgb.join(',')})`;
          } else {
            ctx.fillStyle = `rgba(${priRgb.join(',')}, ${alpha * (0.6 + val * 0.4)})`;
            ctx.shadowBlur = 0;
          }
          ctx.fillText(char, x, charY);
        }
      }
    }
    ctx.restore();
  }

  /* 7. Cosmic Galaxy Vortex */
  renderGalaxyVortex(ctx, w, h, freq, bass, energy, priRgb, secRgb) {
    const cx = w / 2;
    const cy = h / 2;
    this.galaxyAngle += 0.008 + (bass * 0.02);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.galaxyAngle);

    const arms = 3;
    const particlesPerArm = 55;

    for (let a = 0; a < arms; a++) {
      const armOffset = (a * Math.PI * 2) / arms;
      for (let i = 0; i < particlesPerArm; i++) {
        const progress = i / particlesPerArm;
        const dist = progress * (Math.min(w, h) * 0.42);
        const spiralAngle = armOffset + (progress * Math.PI * 2.4);

        const freqVal = ((freq[i * 2] || 0) / 255) * (1 + energy * 1.2);
        const r = dist + (freqVal * 25);
        const px = Math.cos(spiralAngle) * r;
        const py = Math.sin(spiralAngle) * r;

        const size = Math.max(1, (1 - progress * 0.5) * 4 * (1 + bass * 0.6));
        const alpha = Math.max(0.1, (1 - progress * 0.7) * (0.6 + energy * 0.4));

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? `rgba(${priRgb.join(',')}, ${alpha})` : `rgba(${secRgb.join(',')}, ${alpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgb(${priRgb.join(',')})`;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* 8. Chroma Silk Ribbon */
  renderChromaRibbon(ctx, w, h, freq, mid, treb, energy, priRgb, secRgb) {
    const time = performance.now() * 0.002;
    const ribbons = 3;
    const centerY = h * 0.5;

    ctx.save();
    for (let r = 0; r < ribbons; r++) {
      ctx.beginPath();
      const points = 50;
      const step = w / points;

      for (let i = 0; i <= points; i++) {
        const x = i * step;
        const fIdx = Math.floor((i / points) * 50);
        const val = (freq[fIdx] || 0) / 255;
        const offset = Math.sin(time + (i * 0.12) + (r * 1.4)) * (40 + mid * 45);
        const y = centerY + offset + ((val - 0.5) * 70 * (1 + energy));

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = r === 0 
        ? `rgba(${priRgb.join(',')}, 0.8)` 
        : (r === 1 ? `rgba(${secRgb.join(',')}, 0.7)` : `rgba(255, 255, 255, 0.6)`);
      ctx.lineWidth = 3 + (treb * 2);
      ctx.shadowBlur = 14;
      ctx.shadowColor = `rgb(${priRgb.join(',')})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 9. Audio Prism / Kaleidoscope */
  renderAudioPrism(ctx, w, h, freq, bass, energy, beatPulse, priRgb, secRgb) {
    const cx = w / 2;
    const cy = h / 2;
    this.prismAngle += 0.005 + (energy * 0.015);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.prismAngle);

    const layers = 6;
    for (let l = 0; l < layers; l++) {
      const sides = 3 + (l % 4);
      const rad = (30 * (l + 1)) + (bass * 40) + (beatPulse * 20);
      const fVal = ((freq[l * 12] || 0) / 255);

      ctx.beginPath();
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2 + (l * 0.4);
        const px = Math.cos(a) * (rad + fVal * 30);
        const py = Math.sin(a) * (rad + fVal * 30);
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.strokeStyle = l % 2 === 0 ? `rgba(${priRgb.join(',')}, ${0.8 - l * 0.1})` : `rgba(${secRgb.join(',')}, ${0.8 - l * 0.1})`;
      ctx.lineWidth = 2 + (fVal * 2.5);
      ctx.shadowBlur = 12;
      ctx.shadowColor = `rgb(${priRgb.join(',')})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 10. Synthwave Retro Grid */
  renderRetroGrid(ctx, w, h, bass, energy, beatPulse, priRgb, secRgb) {
    const horizonY = h * 0.58;
    this.gridOffset = (this.gridOffset + 1.2 + (bass * 3.5)) % 32;

    ctx.save();
    // Glowing horizon line
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.strokeStyle = `rgba(${priRgb.join(',')}, 0.8)`;
    ctx.lineWidth = 2.5 + (bass * 2);
    ctx.shadowBlur = 18;
    ctx.shadowColor = `rgb(${priRgb.join(',')})`;
    ctx.stroke();

    // Perspective vertical grid lines radiating towards bottom
    const numLines = 24;
    const vpX = w / 2;
    for (let i = 0; i <= numLines; i++) {
      const bottomX = (i / numLines) * (w * 1.6) - (w * 0.3);
      ctx.beginPath();
      ctx.moveTo(vpX, horizonY);
      ctx.lineTo(bottomX, h);
      ctx.strokeStyle = `rgba(${secRgb.join(',')}, 0.35)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Horizontal rolling lines with exponential perspective
    for (let y = horizonY + this.gridOffset; y < h; y += 22) {
      const progress = (y - horizonY) / (h - horizonY);
      const alpha = Math.min(0.9, Math.pow(progress, 1.4) * (0.4 + energy * 0.6));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.strokeStyle = `rgba(${priRgb.join(',')}, ${alpha})`;
      ctx.lineWidth = 1 + progress * 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

window.AudioVisualizer = AudioVisualizer;
