/**
 * audio_dsp.js
 * Web Audio API Digital Signal Processing Engine.
 * Features:
 * 1. Synchronized dual-model A/B playback without losing millisecond position.
 * 2. Real-time 8 kHz telephone bandpass filter (300 Hz to 3,400 Hz) with bypass switch.
 * 3. Playback speed scaling (0.8x clinical listening, 1.0x normal).
 * 4. Interactive waveform rendering with playback head.
 * 5. Real-time frequency spectrogram showing bandwidth (16 kHz vs 48 kHz).
 */

class AudioDSPEngine {
  constructor() {
    this.audioCtx = null;
    this.sourceNodeA = null;
    this.sourceNodeB = null;
    this.gainNode = null;
    this.highpassFilter = null;
    this.lowpassFilter = null;
    this.analyserNode = null;

    this.audioBufferA = null;
    this.audioBufferB = null;

    this.activeCandidate = "A"; // 'A' or 'B'
    this.isPlaying = false;
    this.playbackRate = 1.0;
    this.isPhoneFilterEnabled = false;

    this.startTime = 0;
    this.pausedAt = 0;
    this.duration = 0;

    this.waveformMode = "scrub"; // 'scrub' (smooth seek) or 'tag' (defect selection)
    this.onProgressCallback = null;
    this.onEndedCallback = null;
    this.animationFrameId = null;

    // Region Defect Tagging
    this.regions = []; // Array of { id, startSec, endSec, errorCode, errorLabel, note, color }
    this.activeSelection = null; // { startSec, endSec }
    this.onRegionSelected = null; // Callback when user finishes dragging a selection
    this.onRegionClick = null; // Callback when user clicks an existing defect region
    this.sliceSourceNode = null;
  }

  ensureContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      // Master Gain
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;

      // Telephone Bandpass Simulation: 300 Hz Highpass + 3,400 Hz Lowpass
      this.highpassFilter = this.audioCtx.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.value = 300;
      this.highpassFilter.Q.value = 0.707;

      this.lowpassFilter = this.audioCtx.createBiquadFilter();
      this.lowpassFilter.type = "lowpass";
      this.lowpassFilter.frequency.value = 3400;
      this.lowpassFilter.Q.value = 0.707;

      // Real-time Analyser for Spectrogram
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;

      // Initial direct wiring (bypass filter by default)
      this.reconnectNodes();
    }

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  reconnectNodes() {
    if (!this.audioCtx) return;

    try {
      this.gainNode.disconnect();
      this.analyserNode.disconnect();
    } catch (e) {}

    // Pure, unaltered audio playback: Gain -> Analyser -> Destination
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioCtx.destination);
  }

  setPhoneFilter(enabled) {
    // Unaltered audio policy: Filters disabled to preserve genuine acoustic signal
    this.isPhoneFilterEnabled = false;
  }

  setVolume(vol) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  setSpeed(rate) {
    this.playbackRate = rate;
    if (this.sourceNodeA) this.sourceNodeA.playbackRate.value = rate;
    if (this.sourceNodeB) this.sourceNodeB.playbackRate.value = rate;
  }

  async loadAudio(urlA, urlB = null) {
    this.ensureContext();
    this.pause();
    this.pausedAt = 0;
    this.audioBufferA = null;
    this.audioBufferB = null;
    this.duration = 0;

    const fetchAndDecode = async (url) => {
      const resp = await fetch(url);
      const arrayBuffer = await resp.arrayBuffer();
      return await this.audioCtx.decodeAudioData(arrayBuffer);
    };

    try {
      this.audioBufferA = await fetchAndDecode(urlA);
      this.duration = this.audioBufferA.duration;

      if (urlB) {
        this.audioBufferB = await fetchAndDecode(urlB);
        // Use max duration
        this.duration = Math.max(this.duration, this.audioBufferB.duration);
      }
      return { success: true, duration: this.duration };
    } catch (err) {
      console.error("DSP Audio load error:", err);
      return { success: false, error: err.message };
    }
  }

  play() {
    this.ensureContext();
    if (this.isPlaying) return;

    const buffer = this.activeCandidate === "A" ? this.audioBufferA : (this.audioBufferB || this.audioBufferA);
    if (!buffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;

    // Pure Unaltered Audio Wiring (Direct gain -> analyser -> destination)
    source.connect(this.gainNode);

    const offset = Math.min(this.pausedAt, buffer.duration - 0.05);
    source.start(0, Math.max(0, offset));

    source.onended = () => {
      if (this.isPlaying && this.getCurrentTime() >= buffer.duration - 0.05) {
        this.isPlaying = false;
        this.pausedAt = 0;
        cancelAnimationFrame(this.animationFrameId);
        this.updateAllWaveforms();
        if (this.onEndedCallback) this.onEndedCallback();
      }
    };

    if (this.activeCandidate === "A") {
      this.sourceNodeA = source;
    } else {
      this.sourceNodeB = source;
    }

    this.startTime = this.audioCtx.currentTime - (offset / this.playbackRate);
    this.isPlaying = true;
    this.startProgressTracker();
  }

  pause() {
    if (!this.isPlaying) return;
    this.pausedAt = this.getCurrentTime();
    this.isPlaying = false;
    cancelAnimationFrame(this.animationFrameId);
    this.updateAllWaveforms();

    try {
      if (this.sourceNodeA) {
        this.sourceNodeA.stop();
        this.sourceNodeA.disconnect();
        this.sourceNodeA = null;
      }
      if (this.sourceNodeB) {
        this.sourceNodeB.stop();
        this.sourceNodeB.disconnect();
        this.sourceNodeB = null;
      }
    } catch (e) {}
  }

  seek(seconds) {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.pausedAt = Math.max(0, Math.min(seconds, this.duration));
    this.updateAllWaveforms();
    if (wasPlaying) {
      this.play();
    }
  }

  switchCandidate(candidateLetter) {
    if (candidateLetter !== "A" && candidateLetter !== "B") return;
    if (this.activeCandidate === candidateLetter) return;

    const currentPos = this.getCurrentTime();
    const wasPlaying = this.isPlaying;

    this.pause();
    this.activeCandidate = candidateLetter;
    this.pausedAt = currentPos;
    this.updateAllWaveforms();

    if (wasPlaying) {
      this.play();
    }
  }

  getCurrentTime() {
    if (!this.isPlaying) {
      return this.pausedAt;
    }
    const elapsed = (this.audioCtx.currentTime - this.startTime) * this.playbackRate;
    return Math.min(elapsed, this.duration);
  }

  startProgressTracker() {
    const track = () => {
      if (this.isPlaying) {
        const cur = this.getCurrentTime();
        if (this.onProgressCallback) {
          this.onProgressCallback(cur, this.duration);
        }
        this.updateAllWaveforms();
        this.animationFrameId = requestAnimationFrame(track);
      }
    };
    this.animationFrameId = requestAnimationFrame(track);
  }

  setWaveformMode(mode) {
    this.waveformMode = mode === "tag" ? "tag" : "scrub";
    const canvas = document.getElementById("waveform-canvas") || document.getElementById("waveform-canvas-a");
    if (canvas) {
      canvas.style.cursor = this.waveformMode === "tag" ? "crosshair" : "pointer";
    }
    this.updateAllWaveforms();
  }

  updateAllWaveforms() {
    const canvas = document.getElementById("waveform-canvas");
    const tryoutCanvas = document.getElementById("tryout-waveform-canvas");
    const canvasA = document.getElementById("waveform-canvas-a");
    const canvasB = document.getElementById("waveform-canvas-b");
    if (canvas && (this.audioBufferA || this.audioBufferB)) this.renderWaveform(canvas, "A");
    if (tryoutCanvas && (this.audioBufferA || this.audioBufferB)) this.renderWaveform(tryoutCanvas, "A");
    if (canvasA && this.audioBufferA) this.renderWaveform(canvasA, "A");
    if (canvasB && (this.audioBufferB || this.audioBufferA)) this.renderWaveform(canvasB, "B");
  }

  // Pre-calculate normalized RMS peaks from real PCM samples
  getPeaks(buffer, numBars) {
    if (buffer._cachedPeaks && buffer._cachedPeaks.length === numBars) {
      return buffer._cachedPeaks;
    }
    const rawData = buffer.getChannelData(0);
    const step = Math.floor(rawData.length / numBars);
    const peaks = new Float32Array(numBars);

    for (let i = 0; i < numBars; i++) {
      let sum = 0;
      const start = i * step;
      const end = Math.min(start + step, rawData.length);
      for (let j = start; j < end; j++) {
        sum += rawData[j] * rawData[j];
      }
      peaks[i] = Math.sqrt(sum / (end - start || 1));
    }

    // Normalize to [0.05, 1.0] for visible aesthetics
    let maxPeak = 0;
    for (let i = 0; i < numBars; i++) {
      if (peaks[i] > maxPeak) maxPeak = peaks[i];
    }
    if (maxPeak > 0) {
      for (let i = 0; i < numBars; i++) {
        peaks[i] = Math.max(0.08, Math.min(1.0, peaks[i] / maxPeak));
      }
    }
    buffer._cachedPeaks = peaks;
    return peaks;
  }

  // Region Defect Tagging Management
  setRegions(regions) {
    this.regions = Array.isArray(regions) ? [...regions] : [];
    this.updateAllWaveforms();
  }

  addRegion(region) {
    if (!region.id) {
      region.id = `reg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    this.regions.push(region);
    this.updateAllWaveforms();
    return region;
  }

  removeRegion(id) {
    this.regions = this.regions.filter(r => r.id !== id);
    this.updateAllWaveforms();
  }

  clearRegions() {
    this.regions = [];
    this.activeSelection = null;
    this.updateAllWaveforms();
  }

  playSlice(startSec, endSec) {
    this.ensureContext();
    this.stopSlice();
    this.pause();

    const buffer = this.activeCandidate === "A" ? this.audioBufferA : (this.audioBufferB || this.audioBufferA);
    if (!buffer) return;

    const clampedStart = Math.max(0, Math.min(startSec, buffer.duration));
    const clampedEnd = Math.max(clampedStart + 0.05, Math.min(endSec, buffer.duration));
    const sliceDuration = clampedEnd - clampedStart;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;

    // Pure Unaltered Audio (No filters)
    source.connect(this.gainNode);

    this.sliceSourceNode = source;
    source.start(0, clampedStart, sliceDuration);

    source.onended = () => {
      if (this.sliceSourceNode === source) {
        this.sliceSourceNode = null;
      }
    };
  }

  stopSlice() {
    if (this.sliceSourceNode) {
      try {
        this.sliceSourceNode.stop();
        this.sliceSourceNode.disconnect();
      } catch (e) {}
      this.sliceSourceNode = null;
    }
  }

  // Bind interactive mouse click, drag-seek, and region selection on waveform
  attachWaveformEvents(canvas, bufferLetter) {
    if (!canvas || canvas.dataset.eventsBound) return;
    canvas.dataset.eventsBound = "true";
    canvas.style.cursor = this.waveformMode === "tag" ? "crosshair" : "pointer";
    canvas.style.touchAction = "none";

    let isMouseDown = false;
    let startX = 0;
    let currentX = 0;
    let hasDragged = false;

    const getTimeFromX = (x) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      const buffer = bufferLetter === "A" ? this.audioBufferA : (this.audioBufferB || this.audioBufferA);
      return buffer ? ratio * buffer.duration : 0;
    };

    // --- Mouse & Touch Event Handlers ---
    const handleStart = (clientX) => {
      isMouseDown = true;
      hasDragged = false;
      const rect = canvas.getBoundingClientRect();
      startX = clientX - rect.left;
      currentX = startX;

      if (this.waveformMode === "scrub") {
        const time = getTimeFromX(startX);
        this.seek(time);
      }
    };

    const handleMove = (clientX) => {
      if (!isMouseDown) return;
      const rect = canvas.getBoundingClientRect();
      currentX = Math.max(0, Math.min(rect.width, clientX - rect.left));

      if (this.waveformMode === "scrub") {
        hasDragged = true;
        const time = getTimeFromX(currentX);
        this.seek(time);
        return;
      }

      if (Math.abs(currentX - startX) > 6) {
        hasDragged = true;
        const time1 = getTimeFromX(startX);
        const time2 = getTimeFromX(currentX);
        this.activeSelection = {
          startSec: Math.min(time1, time2),
          endSec: Math.max(time1, time2)
        };
        this.renderWaveform(canvas, bufferLetter);
      }
    };

    const handleEnd = (clientX, clientY) => {
      if (!isMouseDown) return;
      isMouseDown = false;

      if (this.waveformMode === "scrub") {
        if (hasDragged) {
          const time = getTimeFromX(currentX);
          this.seek(time);
        }
        this.renderWaveform(canvas, bufferLetter);
        return;
      }

      if (hasDragged && this.activeSelection) {
        // Selection finished
        if (typeof this.onRegionSelected === "function") {
          const rect = canvas.getBoundingClientRect();
          this.onRegionSelected({
            startSec: this.activeSelection.startSec,
            endSec: this.activeSelection.endSec,
            startMs: Math.round(this.activeSelection.startSec * 1000),
            endMs: Math.round(this.activeSelection.endSec * 1000),
            clientX: clientX,
            clientY: clientY !== undefined ? clientY : rect.bottom + 8
          });
        }
      } else {
        // Simple click / tap -> Seek or select existing region
        const clickTime = getTimeFromX(startX);
        
        // Check if clicked inside an existing defect region
        const hitRegion = this.regions.find(r => clickTime >= r.startSec && clickTime <= r.endSec);
        if (hitRegion && typeof this.onRegionClick === "function") {
          this.onRegionClick(hitRegion);
        } else {
          // Clear active selection on click outside
          this.activeSelection = null;
          this.seek(clickTime);
        }
      }
      this.renderWaveform(canvas, bufferLetter);
    };

    // Mouse listeners (prevent native text selection on drag)
    canvas.addEventListener("mousedown", (e) => {
      e.preventDefault();
      handleStart(e.clientX);
    });

    window.addEventListener("mousemove", (e) => {
      if (isMouseDown) {
        e.preventDefault();
      }
      handleMove(e.clientX);
    });

    window.addEventListener("mouseup", (e) => {
      if (isMouseDown) {
        const rect = canvas.getBoundingClientRect();
        handleEnd(e.clientX, rect.bottom + 8);
      }
    });

    // Touch listeners (mobile support without scroll conflicts or text selection)
    canvas.addEventListener("touchstart", (e) => {
      if (!e.touches || e.touches.length === 0) return;
      e.preventDefault();
      handleStart(e.touches[0].clientX);
    }, { passive: false });

    window.addEventListener("touchmove", (e) => {
      if (!isMouseDown || !e.touches || e.touches.length === 0) return;
      e.preventDefault();
      handleMove(e.touches[0].clientX);
    }, { passive: false });

    window.addEventListener("touchend", (e) => {
      if (!isMouseDown) return;
      e.preventDefault();
      const touch = (e.changedTouches && e.changedTouches[0]) || null;
      const rect = canvas.getBoundingClientRect();
      const endX = touch ? touch.clientX : (rect.left + currentX);
      const endY = rect.bottom + 8;
      handleEnd(endX, endY);
    }, { passive: false });

    canvas.addEventListener("mousemove", (e) => {
      if (isMouseDown) return;
      const rect = canvas.getBoundingClientRect();
      const hoverX = e.clientX - rect.left;
      canvas.dataset.hoverX = hoverX;
      this.renderWaveform(canvas, bufferLetter);
    });

    canvas.addEventListener("mouseleave", () => {
      if (isMouseDown) return;
      delete canvas.dataset.hoverX;
      this.renderWaveform(canvas, bufferLetter);
    });
  }

  // Draw real interactive waveform with High-DPI support, playhead progress, defect regions, and active selection
  renderWaveform(canvas, bufferLetter = "A") {
    const buffer = bufferLetter === "A" ? this.audioBufferA : (this.audioBufferB || this.audioBufferA);
    if (!canvas || !buffer) return;

    this.attachWaveformEvents(canvas, bufferLetter);

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width || 400;
    const displayHeight = rect.height || 48;

    if (canvas.width !== Math.round(displayWidth * dpr) || canvas.height !== Math.round(displayHeight * dpr)) {
      canvas.width = Math.round(displayWidth * dpr);
      canvas.height = Math.round(displayHeight * dpr);
    }

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const barWidth = 3;
    const barGap = 2;
    const numBars = Math.max(10, Math.floor(displayWidth / (barWidth + barGap)));
    const peaks = this.getPeaks(buffer, numBars);

    const currentTime = this.getCurrentTime();
    const duration = buffer.duration || 1.0;
    const progressRatio = Math.min(1.0, currentTime / duration);
    const playheadX = progressRatio * displayWidth;
    const hoverX = canvas.dataset.hoverX !== undefined ? parseFloat(canvas.dataset.hoverX) : null;

    const midY = displayHeight / 2;
    const maxBarHeight = displayHeight - 12;

    // Draw waveform bars with Fish Audio gradient depth and rounded pill capsules
    const playedGrad = ctx.createLinearGradient(0, midY - (maxBarHeight / 2), 0, midY + (maxBarHeight / 2));
    playedGrad.addColorStop(0, "#09090B");
    playedGrad.addColorStop(1, "#27272A");

    const unplayedGrad = ctx.createLinearGradient(0, midY - (maxBarHeight / 2), 0, midY + (maxBarHeight / 2));
    unplayedGrad.addColorStop(0, "#D4D4D8");
    unplayedGrad.addColorStop(1, "#E4E4E7");

    for (let i = 0; i < numBars; i++) {
      const x = i * (barWidth + barGap);
      const barHeight = Math.max(4, peaks[i] * maxBarHeight);
      const y = midY - (barHeight / 2);

      const isPlayed = (x + barWidth) <= playheadX;
      ctx.fillStyle = isPlayed ? playedGrad : unplayedGrad;

      // Draw rounded pill capsule
      const radius = Math.min(barWidth / 2, barHeight / 2);
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, barWidth, barHeight, radius);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    }

    // 1. Draw Tagged Defect Regions
    for (const reg of this.regions) {
      const regStartX = (reg.startSec / duration) * displayWidth;
      const regEndX = (reg.endSec / duration) * displayWidth;
      const regWidth = Math.max(4, regEndX - regStartX);

      // Defect highlight fill
      ctx.fillStyle = reg.color || "rgba(239, 68, 68, 0.22)";
      ctx.fillRect(regStartX, 0, regWidth, displayHeight);

      // Top indicator border
      ctx.fillStyle = "#EF4444";
      ctx.fillRect(regStartX, 0, regWidth, 3);

      // Left and right boundary lines
      ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(regStartX, 0);
      ctx.lineTo(regStartX, displayHeight);
      ctx.moveTo(regEndX, 0);
      ctx.lineTo(regEndX, displayHeight);
      ctx.stroke();

      // Small label tag if space allows
      if (regWidth > 28 && reg.errorLabel) {
        ctx.font = "9px -apple-system, sans-serif";
        ctx.fillStyle = "#991B1B";
        ctx.fillText(reg.errorLabel.slice(0, 10), regStartX + 3, displayHeight - 4);
      }
    }

    // 2. Draw Active Drag Selection
    if (this.activeSelection) {
      const selStartX = (this.activeSelection.startSec / duration) * displayWidth;
      const selEndX = (this.activeSelection.endSec / duration) * displayWidth;
      const selWidth = Math.max(2, selEndX - selStartX);

      ctx.fillStyle = "rgba(37, 99, 235, 0.18)";
      ctx.fillRect(selStartX, 0, selWidth, displayHeight);

      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(selStartX, 0.5, selWidth, displayHeight - 1);
      ctx.setLineDash([]);

      // Time range tag
      const rangeStr = `${this.activeSelection.startSec.toFixed(2)}s - ${this.activeSelection.endSec.toFixed(2)}s`;
      ctx.font = "10px -apple-system, sans-serif";
      ctx.fillStyle = "#1E40AF";
      const textWidth = ctx.measureText(rangeStr).width;
      const textX = Math.min(displayWidth - textWidth - 6, Math.max(4, selStartX));
      ctx.fillText(rangeStr, textX, 11);
    }

    // 3. Draw active playhead line with Fish Audio glow
    if (playheadX > 0 && playheadX < displayWidth) {
      ctx.save();
      ctx.shadowColor = "rgba(9, 9, 11, 0.45)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "#09090B";
      ctx.fillRect(Math.max(0, playheadX - 1), 2, 2, displayHeight - 4);

      // Playhead pill handle at top
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(playheadX - 3, 1, 6, 8, 3);
      } else {
        ctx.arc(playheadX, 4, 3, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }

    // 4. Hover timestamp guide
    if (hoverX !== null && !this.activeSelection) {
      ctx.strokeStyle = "#71717A";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, displayHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      const hoverTime = ((hoverX / displayWidth) * duration).toFixed(2);
      ctx.font = "9px -apple-system, sans-serif";
      ctx.fillStyle = "#71717A";
      ctx.fillText(`${hoverTime}s`, Math.min(displayWidth - 28, hoverX + 4), displayHeight - 4);
    }

    ctx.restore();
  }

  // Draw real-time FFT frequency spectrogram
  renderSpectrogram(canvas) {
    if (!canvas || !this.analyserNode) return;
    const ctx = canvas.getContext("2d");
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.isPlaying) return;
      requestAnimationFrame(draw);
      this.analyserNode.getByteFrequencyData(dataArray);

      ctx.fillStyle = "#18181B";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.2;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        // Elegant minimal monochrome gradient with green accents
        ctx.fillStyle = `rgb(${dataArray[i] / 2}, ${Math.min(255, dataArray[i] + 40)}, ${Math.min(255, dataArray[i] + 80)})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

        x += barWidth;
      }
    };
    draw();
  }
}

// Global DSP Singleton
window.dspEngine = new AudioDSPEngine();
