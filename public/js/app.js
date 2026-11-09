/**
 * app.js
 * Master Application Controller for Speech Evaluation & Acoustic Engineering Studio.
 * Connects AudioDSPEngine, WordTagger, AdaptiveTokenizer, AdminView, and CustomSelect.
 */

// Custom Polished Dropdown Component (Fish Audio Style)
class CustomSelect {
  constructor(container, options, initialValue, onSelect) {
    this.container = typeof container === "string" ? document.getElementById(container) : container;
    this.options = options || [];
    this.selectedValue = initialValue;
    this.onSelect = onSelect;
    this.isOpen = false;

    this.render();
    this.bindEvents();
  }

  setOptions(newOptions, newValue = null) {
    this.options = newOptions;
    if (newValue !== null) {
      this.selectedValue = newValue;
    } else if (!this.options.some(o => o.value === this.selectedValue)) {
      this.selectedValue = this.options.length > 0 ? this.options[0].value : null;
    }
    this.render();
  }

  setValue(val) {
    this.selectedValue = val;
    this.render();
  }

  render() {
    if (!this.container) return;

    const currentOpt = this.options.find(o => o.value === this.selectedValue) || this.options[0];
    const displayLabel = currentOpt ? currentOpt.label : "Select...";

    this.container.innerHTML = `
      <div class="custom-select-wrapper">
        <button type="button" class="custom-select-trigger w-full">
          <span class="truncate font-medium">${displayLabel}</span>
          <svg class="w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform ${this.isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <div class="custom-select-options ${this.isOpen ? 'open' : ''}">
          ${this.options.map(opt => `
            <div class="custom-select-option ${opt.value === this.selectedValue ? 'selected' : ''}" data-value="${opt.value}">
              <span class="truncate">${opt.label}</span>
              ${opt.sub ? `<span class="text-[10px] text-zinc-400 font-mono ml-2 shrink-0">${opt.sub}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    this.container.addEventListener("click", (e) => {
      const trigger = e.target.closest(".custom-select-trigger");
      const option = e.target.closest(".custom-select-option");

      if (trigger) {
        e.stopPropagation();
        this.toggle();
      } else if (option) {
        e.stopPropagation();
        const val = option.dataset.value;
        this.selectedValue = val;
        this.isOpen = false;
        this.render();
        if (this.onSelect) this.onSelect(val);
      }
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (!this.container.contains(e.target) && this.isOpen) {
        this.isOpen = false;
        this.render();
      }
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.render();
  }
}

class StudioApp {
  constructor() {
    this.projects = [];
    this.currentProject = null;
    this.campaigns = [];
    this.currentCampaign = null;
    this.testItems = [];
    this.currentIndex = 0;
    this.models = [];
    this.modelMap = {};
    this.currentRater = null;
    this.activeView = "evaluation";

    this.activeModelA = "openbmb/VoxCPM2";
    this.activeModelB = "facebook/mms-tts-khm";

    this.scores = {
      pronunciation: 5,
      intelligibility: 5,
      naturalness: 4,
      voice_quality: 5
    };

    this.pairwiseChoice = "Take 1 is better";
    this.itemStartTime = Date.now();

    // Components
    this.wordTagger = null;
    this.adminView = null;
    this.campaignSelect = null;
    this.selectA = null;
    this.selectB = null;
    this.newRunSelectA = null;
    this.newRunSelectB = null;
  }

  async init() {
    I18N.init();

    // Check if campaign is passed in URL query param (?campaign=...)
    const urlParams = new URLSearchParams(window.location.search);
    this.initialCampaignParam = urlParams.get("campaign");

    const wordPillsContainer = document.getElementById("word-pills-container");
    const defectPopover = document.getElementById("defect-popover");
    const modalBackdrop = document.getElementById("modal-backdrop");
    this.wordTagger = new WordTagger(wordPillsContainer, defectPopover, modalBackdrop);

    const adminContainer = document.getElementById("admin-view-container");
    this.adminView = new AdminView(adminContainer);

    window.dspEngine.onProgressCallback = (currentTime, duration) => {
      this.updateAudioProgressUI(currentTime, duration);
      this.wordTagger.updateKaraoke(currentTime, duration);
    };

    window.dspEngine.onEndedCallback = () => {
      this.resetPlayIcons();
    };

    this.bindEvents();
    this.initRater();
    await this.fetchInitialData();
  }

  initRater() {
    const saved = localStorage.getItem("veaja_current_rater");
    if (saved) {
      try {
        this.currentRater = JSON.parse(saved);
        this.updateRaterUI();
      } catch (e) {
        this.openRaterModal();
      }
    } else {
      this.openRaterModal();
    }
  }

  openRaterModal() {
    const modal = document.getElementById("rater-modal");
    const backdrop = document.getElementById("rater-backdrop");
    if (modal && backdrop) {
      modal.classList.remove("hidden");
      backdrop.classList.remove("hidden");
      const input = document.getElementById("rater-name-input");
      if (input) input.focus();
    }
  }

  closeRaterModal() {
    const modal = document.getElementById("rater-modal");
    const backdrop = document.getElementById("rater-backdrop");
    if (modal && backdrop) {
      modal.classList.add("hidden");
      backdrop.classList.add("hidden");
    }
  }

  async setRater(name) {
    if (!name || !name.trim()) return;
    try {
      const resp = await fetch("/api/raters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await resp.json();
      if (data.rater) {
        this.currentRater = data.rater;
        localStorage.setItem("veaja_current_rater", JSON.stringify(this.currentRater));
        this.updateRaterUI();
        this.closeRaterModal();
      }
    } catch (e) {
      console.error("Failed to register rater:", e);
    }
  }

  updateRaterUI() {
    const raterNameEl = document.getElementById("active-rater-name");
    if (raterNameEl && this.currentRater) {
      raterNameEl.textContent = this.currentRater.name;
    }
  }

  async fetchInitialData() {
    try {
      // 1. Projects
      const projResp = await fetch("/api/projects");
      const projData = await projResp.json();
      this.projects = projData.projects || [];
      if (this.projects.length > 0) {
        this.currentProject = this.projects[0];
      }

      // 2. Models
      await this.refreshModelsList();

      // 3. Taxonomies
      const taxResp = await fetch("/api/taxonomies");
      const taxData = await taxResp.json();
      this.wordTagger.setTaxonomies(taxData.taxonomies || []);
      this.renderTaxonomyView(taxData.taxonomies || []);

      // 4. Campaigns
      await this.refreshCampaignsList();

    } catch (err) {
      console.error("Studio initial data fetch failed:", err);
    }
  }

  async refreshModelsList() {
    const modelsResp = await fetch("/api/models");
    const modelsData = await modelsResp.json();
    this.models = modelsData.models || [];
    this.modelMap = {};
    this.models.forEach(m => { this.modelMap[m.repo_id] = m; });
    this.setupModelDropdowns();
  }

  setupModelDropdowns() {
    const modelOpts = this.models.map(m => ({
      value: m.repo_id,
      label: m.name,
      sub: m.candidate_code || `${m.sample_rate_hz / 1000}kHz`
    }));

    // Candidate 1 Selector
    if (!this.selectA) {
      this.selectA = new CustomSelect(
        "model-select-a-container",
        modelOpts,
        this.activeModelA,
        (val) => {
          this.activeModelA = val;
          this.loadCurrentAudio();
        }
      );
    } else {
      this.selectA.setOptions(modelOpts, this.activeModelA);
    }

    // Candidate 2 Selector
    if (!this.selectB) {
      this.selectB = new CustomSelect(
        "model-select-b-container",
        modelOpts,
        this.activeModelB,
        (val) => {
          this.activeModelB = val;
          this.loadCurrentAudio();
        }
      );
    } else {
      this.selectB.setOptions(modelOpts, this.activeModelB);
    }

    // New Run Modal Selectors
    if (!this.newRunSelectA) {
      this.newRunSelectA = new CustomSelect(
        "new-run-model-a-container",
        modelOpts,
        this.activeModelA,
        () => {}
      );
    } else {
      this.newRunSelectA.setOptions(modelOpts);
    }

    if (!this.newRunSelectB) {
      this.newRunSelectB = new CustomSelect(
        "new-run-model-b-container",
        modelOpts,
        this.activeModelB,
        () => {}
      );
    } else {
      this.newRunSelectB.setOptions(modelOpts);
    }
  }

  async refreshCampaignsList() {
    const campResp = await fetch("/api/campaigns");
    const campData = await campResp.json();
    this.campaigns = campData.campaigns || [];

    const campOpts = this.campaigns.map(c => ({
      value: c.id,
      label: c.name,
      sub: c.protocol_type
    }));

    let initialCampId = null;
    if (this.initialCampaignParam && this.campaigns.some(c => c.id === this.initialCampaignParam)) {
      initialCampId = this.initialCampaignParam;
      this.initialCampaignParam = null;
    } else if (this.currentCampaign) {
      initialCampId = this.currentCampaign.id;
    } else if (this.campaigns.length > 0) {
      initialCampId = this.campaigns[0].id;
    }

    if (!this.campaignSelect) {
      this.campaignSelect = new CustomSelect(
        "campaign-dropdown-container",
        campOpts,
        initialCampId,
        (campId) => this.selectCampaign(campId)
      );
    } else {
      this.campaignSelect.setOptions(campOpts, initialCampId);
    }

    if (initialCampId) {
      await this.selectCampaign(initialCampId);
    }
  }

  async selectCampaign(campaignId) {
    const campaign = this.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    this.currentCampaign = campaign;
    if (this.campaignSelect) {
      this.campaignSelect.setValue(campaignId);
    }

    this.renderDynamicMetrics();

    const resp = await fetch(`/api/items?suite_id=${campaign.suite_id}`);
    const data = await resp.json();
    this.testItems = data.items || [];
    this.currentIndex = 0;

    this.renderCurrentItem();
  }

  renderCurrentItem() {
    const emptyState = document.getElementById("evaluation-empty-state");
    const activeWorkspace = document.getElementById("evaluation-active-workspace");

    if (!this.testItems || this.testItems.length === 0) {
      if (emptyState) emptyState.classList.remove("hidden");
      if (activeWorkspace) activeWorkspace.classList.add("hidden");
      const progressText = document.getElementById("item-progress-text");
      const progressBar = document.getElementById("item-progress-bar");
      if (progressText) progressText.textContent = "0 / 0";
      if (progressBar) progressBar.style.width = "0%";
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");
    if (activeWorkspace) activeWorkspace.classList.remove("hidden");

    const item = this.testItems[this.currentIndex];
    if (!item) return;

    this.itemStartTime = Date.now();

    const progressText = document.getElementById("item-progress-text");
    const progressBar = document.getElementById("item-progress-bar");
    const total = this.testItems.length;
    const currentNum = this.currentIndex + 1;

    if (progressText) progressText.textContent = `${currentNum} / ${total}`;
    if (progressBar) progressBar.style.width = `${(currentNum / total) * 100}%`;

    const itemKeyEl = document.getElementById("item-key-badge");
    const itemCatEl = document.getElementById("item-category-text");
    const itemIntentEl = document.getElementById("item-intent-text");
    const itemTagsContainer = document.getElementById("item-tags-container");

    if (itemKeyEl) itemKeyEl.textContent = item.item_key;
    if (itemCatEl) itemCatEl.textContent = item.category || "General";
    if (itemIntentEl) itemIntentEl.textContent = item.intent || item.notes || "";

    if (itemTagsContainer) {
      itemTagsContainer.innerHTML = "";
      const tags = item.coverage_tags || [];
      tags.forEach(t => {
        const b = document.createElement("span");
        b.className = "text-[11px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium";
        b.textContent = t;
        itemTagsContainer.appendChild(b);
      });
    }

    const transInput = document.getElementById("blind-transcription-input");
    if (transInput) transInput.value = "";

    this.scores = { pronunciation: 5, intelligibility: 5, naturalness: 4, voice_quality: 5 };
    this.pairwiseChoice = "Take 1 is better";
    this.updateScoringPillStates();

    // Load words into Tagger
    this.wordTagger.loadSentence(item.text, []);

    // Load Real Audio
    this.loadCurrentAudio();
    this.updateTelemetryCard();
  }

  async loadCurrentAudio() {
    const item = this.testItems[this.currentIndex];
    if (!item) return;

    let urlA = null;
    let urlB = null;

    if (item.audio_files) {
      if (item.audio_files[this.activeModelA]) {
        urlA = item.audio_files[this.activeModelA].url;
      }
      if (item.audio_files[this.activeModelB]) {
        urlB = item.audio_files[this.activeModelB].url;
      }
    }

    if (!urlA) return;

    const res = await window.dspEngine.loadAudio(urlA, urlB);
    if (res.success) {
      const canvasA = document.getElementById("waveform-canvas-a");
      const canvasB = document.getElementById("waveform-canvas-b");
      window.dspEngine.renderWaveform(canvasA, "A");
      if (canvasB && urlB) {
        window.dspEngine.renderWaveform(canvasB, "B");
      }
    }
  }

  updateTelemetryCard() {
    const currentModel = this.modelMap[this.activeModelA];
    if (!currentModel) return;

    const latEl = document.getElementById("telem-latency");
    const rtfEl = document.getElementById("telem-rtf");
    const vramEl = document.getElementById("telem-vram");
    const srEl = document.getElementById("telem-sr");

    if (latEl) latEl.textContent = currentModel.latency_ms ? `${currentModel.latency_ms.toFixed(1)} ms` : "N/A";
    if (rtfEl) rtfEl.textContent = currentModel.rtf ? currentModel.rtf.toFixed(3) : "N/A";
    if (vramEl) vramEl.textContent = currentModel.vram_mb ? `${currentModel.vram_mb.toFixed(1)} MB` : "N/A";
    if (srEl) srEl.textContent = currentModel.sample_rate_hz ? `${(currentModel.sample_rate_hz / 1000).toFixed(0)} kHz` : "16 kHz";

    const spectroHeader = document.getElementById("inspector-active-model");
    if (spectroHeader) {
      spectroHeader.textContent = `${currentModel.name} (${currentModel.sample_rate_hz / 1000} kHz)`;
    }
  }

  updateAudioProgressUI(currentTime, duration) {
    const timeDisplay = document.getElementById("playback-time-display");
    if (timeDisplay) {
      const formatTime = (s) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      };
      timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }
  }

  playCandidate(candidateLetter) {
    const trackA = document.getElementById("track-candidate-a");
    const trackB = document.getElementById("track-candidate-b");
    const playA = document.querySelector(".play-icon-a");
    const pauseA = document.querySelector(".pause-icon-a");
    const playB = document.querySelector(".play-icon-b");
    const pauseB = document.querySelector(".pause-icon-b");

    if (window.dspEngine.isPlaying && window.dspEngine.activeCandidate === candidateLetter) {
      window.dspEngine.pause();
      this.resetPlayIcons();
      return;
    }

    window.dspEngine.switchCandidate(candidateLetter);
    window.dspEngine.play();

    if (candidateLetter === "A") {
      trackA.classList.add("active-track");
      trackB.classList.remove("active-track");
      if (playA) playA.classList.add("hidden");
      if (pauseA) pauseA.classList.remove("hidden");
      if (playB) playB.classList.remove("hidden");
      if (pauseB) pauseB.classList.add("hidden");
    } else {
      trackB.classList.add("active-track");
      trackA.classList.remove("active-track");
      if (playB) playB.classList.add("hidden");
      if (pauseB) pauseB.classList.remove("hidden");
      if (playA) playA.classList.remove("hidden");
      if (pauseA) pauseA.classList.add("hidden");
    }

    const spectroCanvas = document.getElementById("spectrogram-canvas");
    if (spectroCanvas) {
      window.dspEngine.renderSpectrogram(spectroCanvas);
    }
  }

  resetPlayIcons() {
    const playA = document.querySelector(".play-icon-a");
    const pauseA = document.querySelector(".pause-icon-a");
    const playB = document.querySelector(".play-icon-b");
    const pauseB = document.querySelector(".pause-icon-b");

    if (playA) playA.classList.remove("hidden");
    if (pauseA) pauseA.classList.add("hidden");
    if (playB) playB.classList.remove("hidden");
    if (pauseB) pauseB.classList.add("hidden");
  }

  togglePlayActive() {
    this.playCandidate(window.dspEngine.activeCandidate || "A");
  }

  setScore(dimension, val) {
    this.scores[dimension] = val;
    this.updateScoringPillStates();
  }

  renderDynamicMetrics() {
    const container = document.getElementById("dynamic-metrics-container");
    const pairwiseArea = document.getElementById("protocol-pairwise-area");
    const metricsArea = document.getElementById("protocol-metrics-area");
    const titleLabel = document.getElementById("rubric-title-label");
    const scaleLabel = document.getElementById("rubric-scale-label");

    if (!this.currentCampaign) return;

    const protocol = this.currentCampaign.protocol_type || "Custom";
    const metrics = this.currentCampaign.metrics || [];
    const scaleMin = this.currentCampaign.scale_min || 1;
    const scaleMax = this.currentCampaign.scale_max || 5;

    // Show/hide Pairwise preference vs Metrics
    if (pairwiseArea) {
      if (protocol === "Pairwise" || protocol === "Blind Pairwise Arena" || this.currentCampaign.rubric_id === "rubric-pairwise") {
        pairwiseArea.classList.remove("hidden");
      } else if (metrics.length > 0 && protocol !== "Hybrid") {
        pairwiseArea.classList.add("hidden");
      } else {
        pairwiseArea.classList.remove("hidden");
      }
    }

    if (metricsArea) {
      if (metrics.length === 0) {
        metricsArea.classList.add("hidden");
        return;
      }
      metricsArea.classList.remove("hidden");
    }

    if (titleLabel) titleLabel.textContent = `${this.currentCampaign.rubric_name || 'Evaluation Matrix'}`;
    if (scaleLabel) scaleLabel.textContent = `Scale ${scaleMin} to ${scaleMax}`;

    if (!container) return;
    container.innerHTML = "";

    metrics.forEach(metric => {
      const metricId = metric.id || metric.key || (metric.name || metric.label_en || "metric").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const metricName = metric.name || metric.label_en || metric.key || "Metric";
      if (this.scores[metricId] === undefined) {
        this.scores[metricId] = scaleMax;
      }

      const col = document.createElement("div");
      col.className = "space-y-1.5";

      col.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="text-xs font-semibold text-zinc-800">${metricName}</div>
          ${metric.desc ? `<span class="text-[10px] text-zinc-400 truncate max-w-[140px]" title="${metric.desc}">${metric.desc}</span>` : ''}
        </div>
        <div class="flex gap-1" id="score-pills-${metricId}">
          ${Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i).map(val => `
            <button type="button" data-metric="${metricId}" data-val="${val}" class="score-pill ${this.scores[metricId] === val ? 'active' : ''}">
              ${val}
            </button>
          `).join('')}
        </div>
      `;

      col.querySelectorAll(".score-pill").forEach(pill => {
        pill.addEventListener("click", () => {
          const val = parseInt(pill.dataset.val, 10);
          this.setScore(metricId, val);
        });
      });

      container.appendChild(col);
    });
  }

  updateScoringPillStates() {
    if (!this.currentCampaign) return;
    const metrics = this.currentCampaign.metrics || [];
    metrics.forEach(metric => {
      const metricId = metric.id || metric.key || (metric.name || metric.label_en || "metric").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const container = document.getElementById(`score-pills-${metricId}`);
      if (!container) return;
      const currentVal = this.scores[metricId];
      container.querySelectorAll(".score-pill").forEach(pill => {
        const val = parseInt(pill.dataset.val, 10);
        if (val === currentVal) {
          pill.classList.add("active");
        } else {
          pill.classList.remove("active");
        }
      });
    });
  }

  async saveAndNext() {
    if (!this.currentRater) {
      this.openRaterModal();
      return;
    }

    const item = this.testItems[this.currentIndex];
    if (!item) return;

    const transInput = document.getElementById("blind-transcription-input");
    const blindTranscript = transInput ? transInput.value.trim() : "";

    const activeModelRecord = this.modelMap[this.activeModelA];
    const modelId = activeModelRecord ? activeModelRecord.id : "model-voxcpm2";

    const durationSeconds = (Date.now() - this.itemStartTime) / 1000;
    const defectTags = this.wordTagger.getDefectsList();

    const payload = {
      campaign_id: this.currentCampaign ? this.currentCampaign.id : "camp-sprint2-dev23-acr",
      rater_id: this.currentRater.id,
      item_id: item.id,
      model_id: modelId,
      scores: {
        ...this.scores,
        pairwise_choice: this.pairwiseChoice
      },
      blind_transcript: blindTranscript,
      comments: "",
      duration_seconds: durationSeconds,
      defect_tags: defectTags
    };

    const saveBtn = document.getElementById("btn-save-next");
    if (saveBtn) saveBtn.textContent = I18N.t("saving");

    try {
      const resp = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const res = await resp.json();
      if (res.success) {
        if (saveBtn) saveBtn.textContent = I18N.t("saved");
        setTimeout(() => {
          if (saveBtn) saveBtn.innerHTML = `<span>Save & Next [Enter]</span><svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
        }, 500);

        if (this.currentIndex < this.testItems.length - 1) {
          this.currentIndex++;
          this.renderCurrentItem();
        } else {
          alert("All test items completed for this campaign! Thank you.");
          this.switchView("admin");
        }
      }
    } catch (e) {
      console.error("Save evaluation failed:", e);
      alert(`Save failed: ${e.message}`);
    }
  }

  // Dynamic Run Setup Modal Handlers
  openNewRunModal() {
    const modal = document.getElementById("new-run-modal");
    const backdrop = document.getElementById("new-run-backdrop");
    if (modal && backdrop) {
      modal.classList.remove("hidden");
      backdrop.classList.remove("hidden");
      const nameInput = document.getElementById("new-run-name");
      if (nameInput) nameInput.focus();
    }
  }

  closeNewRunModal() {
    const modal = document.getElementById("new-run-modal");
    const backdrop = document.getElementById("new-run-backdrop");
    if (modal && backdrop) {
      modal.classList.add("hidden");
      backdrop.classList.add("hidden");
    }
  }

  openShareModal(campaignId = null) {
    const modal = document.getElementById("share-modal");
    const backdrop = document.getElementById("share-backdrop");
    const urlInput = document.getElementById("share-url-input");

    const targetId = campaignId || (this.currentCampaign ? this.currentCampaign.id : "");
    const shareUrl = `${window.location.origin}/?campaign=${encodeURIComponent(targetId)}`;

    if (urlInput) urlInput.value = shareUrl;
    if (modal) modal.classList.remove("hidden");
    if (backdrop) backdrop.classList.remove("hidden");
  }

  closeShareModal() {
    const modal = document.getElementById("share-modal");
    const backdrop = document.getElementById("share-backdrop");
    if (modal) modal.classList.add("hidden");
    if (backdrop) backdrop.classList.add("hidden");
  }

  async handleNewRunSubmit(e) {
    e.preventDefault();

    const name = document.getElementById("new-run-name").value.trim();
    if (!name) return;

    const suiteChoice = document.querySelector('input[name="benchmark-suite-choice"]:checked').value;
    const rubricChoice = document.querySelector('input[name="rubric-choice"]:checked').value;

    let finalSuiteId = suiteChoice;
    let finalRubricId = rubricChoice;

    // Handle Custom Prompts if selected
    if (suiteChoice === "custom-prompts") {
      const customText = document.getElementById("custom-sentences-input").value.trim();
      if (!customText) {
        alert("Please enter at least one sentence for your custom benchmark.");
        return;
      }
      const rawLines = customText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      
      const suiteResp = await fetch("/api/suites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${name} Custom Benchmark`,
          description: `Custom prompts for ${name}`,
          items: rawLines
        })
      });
      const suiteData = await suiteResp.json();
      if (suiteData.suite_id) {
        finalSuiteId = suiteData.suite_id;
      }
    }

    // Handle Custom Evaluation Matrix if selected
    if (rubricChoice === "custom-matrix") {
      const scaleMax = parseInt(document.getElementById("custom-scale-max").value, 10) || 5;
      const rows = document.querySelectorAll("#custom-matrix-rows .matrix-row");
      const customMetrics = [];

      rows.forEach(r => {
        const nInput = r.querySelector(".metric-name-input");
        const dInput = r.querySelector(".metric-desc-input");
        const mName = nInput ? nInput.value.trim() : "";
        const mDesc = dInput ? dInput.value.trim() : "";
        if (mName) {
          const mId = mName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
          customMetrics.push({ id: mId, name: mName, desc: mDesc });
        }
      });

      if (customMetrics.length === 0) {
        customMetrics.push({ id: "quality", name: "Speech Quality", desc: "Overall quality" });
      }

      const rubResp = await fetch("/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${name} Custom Matrix`,
          protocol_type: "Custom",
          scale_min: 1,
          scale_max: scaleMax,
          metrics: customMetrics
        })
      });
      const rubData = await rubResp.json();
      if (rubData.rubric_id) {
        finalRubricId = rubData.rubric_id;
      }
    }

    // Create New Campaign
    const campResp = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        suite_id: finalSuiteId,
        rubric_id: finalRubricId
      })
    });
    const campData = await campResp.json();

    if (campData.success) {
      this.closeNewRunModal();
      await this.refreshCampaignsList();
      if (campData.campaign_id) {
        await this.selectCampaign(campData.campaign_id);
        this.openShareModal(campData.campaign_id);
      }
    }
  }

  async handleRegisterNewModel() {
    const name = document.getElementById("add-model-name").value.trim();
    const code = document.getElementById("add-model-code").value.trim() || "CUSTOM";
    const sr = parseInt(document.getElementById("add-model-sr").value, 10) || 24000;
    const dir = document.getElementById("add-model-dir").value.trim();

    if (!name) {
      alert("Model name is required.");
      return;
    }

    const resp = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        candidate_code: code,
        sample_rate_hz: sr,
        audio_base_dir: dir
      })
    });
    const data = await resp.json();
    if (data.success) {
      alert(`Model "${name}" registered successfully!`);
      document.getElementById("new-model-subform").classList.add("hidden");
      await this.refreshModelsList();
    }
  }

  bindEvents() {
    // Individual track play buttons
    const btnPlayA = document.getElementById("btn-play-a");
    if (btnPlayA) btnPlayA.addEventListener("click", () => this.playCandidate("A"));

    const btnPlayB = document.getElementById("btn-play-b");
    if (btnPlayB) btnPlayB.addEventListener("click", () => this.playCandidate("B"));

    // Replay button
    const replayBtn = document.getElementById("btn-replay");
    if (replayBtn) {
      replayBtn.addEventListener("click", () => {
        window.dspEngine.seek(0);
        window.dspEngine.play();
      });
    }

    // Save & Next button
    const saveBtn = document.getElementById("btn-save-next");
    if (saveBtn) saveBtn.addEventListener("click", () => this.saveAndNext());

    // Telephone Filter Toggle
    const phoneToggle = document.getElementById("phone-filter-toggle");
    if (phoneToggle) {
      phoneToggle.addEventListener("change", (e) => {
        window.dspEngine.setPhoneFilter(e.target.checked);
      });
    }

    // Speed Selector (0.8x / 1.0x)
    document.querySelectorAll(".speed-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        const speed = parseFloat(e.currentTarget.dataset.speed);
        window.dspEngine.setSpeed(speed);
      });
    });

    // Language Toggle
    const langBtn = document.getElementById("lang-toggle-btn");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        const next = I18N.currentLang === "en" ? "km" : "en";
        I18N.setLang(next);
      });
    }

    // Rater Switcher
    const changeRaterBtn = document.getElementById("btn-change-rater");
    if (changeRaterBtn) {
      changeRaterBtn.addEventListener("click", () => this.openRaterModal());
    }

    const saveRaterBtn = document.getElementById("save-rater-btn");
    if (saveRaterBtn) {
      saveRaterBtn.addEventListener("click", () => {
        const nameInput = document.getElementById("rater-name-input");
        if (nameInput) this.setRater(nameInput.value);
      });
    }

    // Navigation Tabs
    document.querySelectorAll("[data-nav-view]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const view = e.currentTarget.getAttribute("data-nav-view");
        this.switchView(view);
      });
    });

    // Popover Buttons
    const popoverApply = document.getElementById("popover-apply-btn");
    const popoverRemove = document.getElementById("popover-remove-btn");
    const popoverCancel = document.getElementById("popover-cancel-btn");
    const popoverBackdrop = document.getElementById("modal-backdrop");

    if (popoverApply) popoverApply.addEventListener("click", () => this.wordTagger.applyPopoverTag());
    if (popoverRemove) popoverRemove.addEventListener("click", () => this.wordTagger.removePopoverTag());
    if (popoverCancel) popoverCancel.addEventListener("click", () => this.wordTagger.closePopover());
    if (popoverBackdrop) popoverBackdrop.addEventListener("click", () => this.wordTagger.closePopover());

    // Pairwise Choice Buttons
    document.querySelectorAll(".pairwise-choice-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".pairwise-choice-btn").forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        this.pairwiseChoice = e.currentTarget.dataset.choice;
      });
    });

    // 1-5 Scoring Pills
    ["pronunciation", "intelligibility", "naturalness", "voice_quality"].forEach(dim => {
      const container = document.getElementById(`score-pills-${dim}`);
      if (container) {
        container.querySelectorAll(".score-pill").forEach(pill => {
          pill.addEventListener("click", () => {
            const val = parseInt(pill.dataset.val, 10);
            this.setScore(dim, val);
          });
        });
      }
    });

    // New Run Modal Events
    const btnOpenNewRun = document.getElementById("btn-open-new-run");
    const btnEmptyNewRun = document.getElementById("btn-empty-new-run");
    const btnLoadCapstoneDemo = document.getElementById("btn-load-capstone-demo");
    const btnCloseNewRun = document.getElementById("btn-close-new-run");
    const btnCancelNewRun = document.getElementById("btn-cancel-new-run");
    const newRunBackdrop = document.getElementById("new-run-backdrop");
    const newRunForm = document.getElementById("new-run-form");
    const toggleAddModelBtn = document.getElementById("toggle-add-model-btn");
    const saveNewModelBtn = document.getElementById("save-new-model-btn");

    if (btnOpenNewRun) btnOpenNewRun.addEventListener("click", () => this.openNewRunModal());
    if (btnEmptyNewRun) btnEmptyNewRun.addEventListener("click", () => this.openNewRunModal());
    if (btnLoadCapstoneDemo) {
      btnLoadCapstoneDemo.addEventListener("click", async () => {
        try {
          btnLoadCapstoneDemo.disabled = true;
          btnLoadCapstoneDemo.textContent = "Loading Benchmark...";
          await fetch("/api/seed/capstone", { method: "POST" });
          await this.fetchInitialData();
          btnLoadCapstoneDemo.disabled = false;
          btnLoadCapstoneDemo.textContent = "Load Capstone Benchmark (DEV-23)";
        } catch (e) {
          console.error("Failed to seed benchmark:", e);
          btnLoadCapstoneDemo.disabled = false;
          btnLoadCapstoneDemo.textContent = "Load Capstone Benchmark (DEV-23)";
        }
      });
    }
    if (btnCloseNewRun) btnCloseNewRun.addEventListener("click", () => this.closeNewRunModal());
    if (btnCancelNewRun) btnCancelNewRun.addEventListener("click", () => this.closeNewRunModal());
    if (newRunBackdrop) newRunBackdrop.addEventListener("click", () => this.closeNewRunModal());
    if (newRunForm) newRunForm.addEventListener("submit", (e) => this.handleNewRunSubmit(e));

    if (toggleAddModelBtn) {
      toggleAddModelBtn.addEventListener("click", () => {
        const sub = document.getElementById("new-model-subform");
        if (sub) sub.classList.toggle("hidden");
      });
    }

    if (saveNewModelBtn) {
      saveNewModelBtn.addEventListener("click", () => this.handleRegisterNewModel());
    }

    // Share Modal Events
    const btnShareCampaign = document.getElementById("btn-share-campaign");
    const btnCloseShare = document.getElementById("btn-close-share");
    const btnDoneShare = document.getElementById("btn-done-share");
    const shareBackdrop = document.getElementById("share-backdrop");
    const btnCopyShareUrl = document.getElementById("btn-copy-share-url");

    if (btnShareCampaign) btnShareCampaign.addEventListener("click", () => this.openShareModal());
    if (btnCloseShare) btnCloseShare.addEventListener("click", () => this.closeShareModal());
    if (btnDoneShare) btnDoneShare.addEventListener("click", () => this.closeShareModal());
    if (shareBackdrop) shareBackdrop.addEventListener("click", () => this.closeShareModal());

    if (btnCopyShareUrl) {
      btnCopyShareUrl.addEventListener("click", async () => {
        const urlInput = document.getElementById("share-url-input");
        if (!urlInput) return;
        try {
          await navigator.clipboard.writeText(urlInput.value);
          const orig = btnCopyShareUrl.textContent;
          btnCopyShareUrl.textContent = "Copied!";
          setTimeout(() => { btnCopyShareUrl.textContent = orig; }, 2000);
        } catch (e) {
          urlInput.select();
          document.execCommand("copy");
          btnCopyShareUrl.textContent = "Copied!";
          setTimeout(() => { btnCopyShareUrl.textContent = "Copy Link"; }, 2000);
        }
      });
    }

    // Benchmark Suite Radio Buttons (show custom prompt area when selected)
    document.querySelectorAll('input[name="benchmark-suite-choice"]').forEach(radio => {
      radio.addEventListener("change", (e) => {
        const customArea = document.getElementById("custom-prompts-area");
        if (customArea) {
          if (e.target.value === "custom-prompts") {
            customArea.classList.remove("hidden");
          } else {
            customArea.classList.add("hidden");
          }
        }
      });
    });

    // Custom Rubric / Matrix Radio Buttons (toggle custom matrix builder)
    document.querySelectorAll('input[name="rubric-choice"]').forEach(radio => {
      radio.addEventListener("change", (e) => {
        const matrixArea = document.getElementById("custom-matrix-area");
        if (matrixArea) {
          if (e.target.value === "custom-matrix") {
            matrixArea.classList.remove("hidden");
          } else {
            matrixArea.classList.add("hidden");
          }
        }
      });
    });

    // Dynamic Add / Remove Metric Dimension Rows in New Run Modal
    const btnAddMetricRow = document.getElementById("btn-add-metric-row");
    const matrixRowsContainer = document.getElementById("custom-matrix-rows");
    if (btnAddMetricRow && matrixRowsContainer) {
      btnAddMetricRow.addEventListener("click", () => {
        const row = document.createElement("div");
        row.className = "flex items-center gap-2 matrix-row";
        row.innerHTML = `
          <input type="text" class="metric-name-input flex-1 p-2 text-xs rounded border border-zinc-200 bg-white" placeholder="Dimension Name (e.g. Prosody)">
          <input type="text" class="metric-desc-input flex-2 p-2 text-xs rounded border border-zinc-200 bg-white" placeholder="Description / Evaluation Guide">
          <button type="button" class="btn-remove-metric text-zinc-400 hover:text-red-500 text-base font-bold px-1">&times;</button>
        `;
        matrixRowsContainer.appendChild(row);
      });

      matrixRowsContainer.addEventListener("click", (e) => {
        if (e.target.closest(".btn-remove-metric")) {
          const row = e.target.closest(".matrix-row");
          if (matrixRowsContainer.querySelectorAll(".matrix-row").length > 1) {
            row.remove();
          } else {
            alert("At least one evaluation dimension is required.");
          }
        }
      });
    }

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        if (e.key === "Enter" && e.ctrlKey) {
          this.saveAndNext();
        }
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        this.togglePlayActive();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.saveAndNext();
      } else if (e.key === "P" && e.shiftKey) {
        e.preventDefault();
        const toggle = document.getElementById("phone-filter-toggle");
        if (toggle) {
          toggle.checked = !toggle.checked;
          toggle.dispatchEvent(new Event("change"));
        }
      }
    });
  }

  switchView(viewName) {
    this.activeView = viewName;
    document.querySelectorAll("[data-nav-view]").forEach(btn => {
      if (btn.getAttribute("data-nav-view") === viewName) {
        btn.classList.add("bg-zinc-100", "font-semibold", "text-zinc-900");
      } else {
        btn.classList.remove("bg-zinc-100", "font-semibold", "text-zinc-900");
      }
    });

    const views = ["evaluation", "inspector", "admin", "taxonomy", "models"];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        if (v === viewName) {
          el.classList.remove("hidden");
        } else {
          el.classList.add("hidden");
        }
      }
    });

    if (viewName === "admin" && this.adminView) {
      const campId = this.currentCampaign ? this.currentCampaign.id : null;
      this.adminView.loadSummary(campId);
    }
  }

  renderTaxonomyView(taxonomies) {
    const listEl = document.getElementById("taxonomy-list-container");
    if (!listEl) return;

    listEl.innerHTML = "";
    taxonomies.forEach(t => {
      const card = document.createElement("div");
      card.className = "studio-card p-4";
      card.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-xs px-2 py-0.5 rounded text-white" style="background-color: ${t.badge_color || '#EF4444'}">${t.code}</span>
            <span class="font-semibold text-zinc-900">${t.name_en}</span>
          </div>
          <span class="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 uppercase font-mono">${t.category}</span>
        </div>
        <div class="text-sm font-sans text-zinc-700 mt-2 font-medium">${t.name_km}</div>
        <div class="text-xs text-zinc-500 mt-1">${t.description || ''}</div>
      `;
      listEl.appendChild(card);
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new StudioApp();
  window.app.init();
});
