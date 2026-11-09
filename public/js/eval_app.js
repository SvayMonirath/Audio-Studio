/**
 * eval_app.js
 * Distraction-Free Rater Portal Controller.
 * Features:
 * 1. Left Sidebar Navigator showing all audio items with live Completed / Unrated status.
 * 2. Jump to any item at any time with automatic state saving.
 * 3. Verbatim raw continuous Khmer script.
 * 4. Interactive waveform drag defect tagging with slice auditioning.
 * 5. Clear score anchors (1 = Poor / Robotic, 5 = Excellent / Natural).
 * 6. Keyboard navigation (Space: Play/Pause, Enter: Next, Arrows: Navigate).
 */

(function () {
  "use strict";

  // Toast notification helper
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast-item ${type === "error" ? "toast-error" : type === "success" ? "toast-success" : ""}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // State
  const state = {
    campaignId: null,
    campaign: null,
    items: [],
    currentIndex: 0,
    rater: {
      id: localStorage.getItem("tts_rater_id") || "",
      name: localStorage.getItem("tts_rater_name") || ""
    },
    currentAudioUrl: null,
    currentScores: {}, // { [metricKey]: score }
    currentDefects: [], // [ { id, startSec, endSec, startMs, endMs, errorCode, errorLabel, note } ]
    activeSelection: null,
    existingEvaluations: {}, // { [itemId]: evalObject }
    itemStartTime: Date.now(),
    sidebarFilter: "all", // 'all', 'unrated', 'completed'
    selectedModelFilter: "all", // 'all' or modelId
    sidebarViewMode: "matrix", // 'matrix' or 'list'
    currentAsrAdjudication: null, // 'ACCEPTABLE_VARIATION' or 'TRUE_ERROR'
    tryout: {
      submode: "tts", // 'tts' or 'asr'
      modelId: null,
      sentenceKey: "KH01",
      isPlaying: false,
      speed: 1.0
    }
  };

  // DOM Elements Cache
  const el = {
    onboardingScreen: document.getElementById("onboarding-screen"),
    onboardCampaignTitle: document.getElementById("onboard-campaign-title"),
    onboardCampaignDesc: document.getElementById("onboard-campaign-desc"),
    onboardForm: document.getElementById("onboard-form"),
    raterNameInput: document.getElementById("rater-name-input"),
    onboardErrorMsg: document.getElementById("onboard-error-msg"),
    btnOnboardSubmit: document.getElementById("btn-onboard-submit"),

    // Mode Navigation Tabs
    tabEvalMode: document.getElementById("tab-eval-mode"),
    tabTryoutMode: document.getElementById("tab-tryout-mode"),

    studyNameTag: document.getElementById("study-name-tag"),
    studyHeadline: document.getElementById("study-headline"),
    raterDisplayName: document.getElementById("rater-display-name"),
    btnChangeRater: document.getElementById("btn-change-rater"),
    btnToggleSidebar: document.getElementById("btn-toggle-sidebar"),
    sidebarBackdrop: document.getElementById("sidebar-backdrop"),
    modeBtnScrub: document.getElementById("mode-btn-scrub"),
    modeBtnTag: document.getElementById("mode-btn-tag"),

    // Sidebar
    audioSidebar: document.getElementById("audio-sidebar"),
    sidebarProgressText: document.getElementById("sidebar-progress-text"),
    sidebarProgressBar: document.getElementById("sidebar-progress-bar"),
    modelTabsContainer: document.getElementById("model-tabs-container"),
    viewModeMatrix: document.getElementById("view-mode-matrix"),
    viewModeList: document.getElementById("view-mode-list"),
    sidebarMatrixView: document.getElementById("sidebar-matrix-view"),
    sidebarMatrixGrid: document.getElementById("sidebar-matrix-grid"),
    matrixActiveModelLabel: document.getElementById("matrix-active-model-label"),
    sidebarModelSummaryList: document.getElementById("sidebar-model-summary-list"),
    filterAll: document.getElementById("filter-all"),
    filterUnrated: document.getElementById("filter-unrated"),
    filterCompleted: document.getElementById("filter-completed"),
    countAll: document.getElementById("count-all"),
    countUnrated: document.getElementById("count-unrated"),
    countCompleted: document.getElementById("count-completed"),
    sidebarItemsList: document.getElementById("sidebar-items-list"),

    // Stage
    evalStage: document.getElementById("eval-stage"),
    ttsTranscriptContainer: document.getElementById("tts-transcript-container"),
    rawKhmerContent: document.getElementById("raw-khmer-content"),
    asrDiffContainer: document.getElementById("asr-diff-container"),
    asrReferenceText: document.getElementById("asr-reference-text"),
    asrHypothesisText: document.getElementById("asr-hypothesis-text"),
    btnAsrAcceptable: document.getElementById("btn-asr-acceptable"),
    btnAsrError: document.getElementById("btn-asr-error"),
    audioModelBadge: document.getElementById("audio-model-badge"),
    heardTranscriptionWrapper: document.getElementById("heard-transcription-wrapper"),
    btnToggleHeard: document.getElementById("btn-toggle-heard"),
    btnHideHeard: document.getElementById("btn-hide-heard"),
    heardIndicatorBadge: document.getElementById("heard-indicator-badge"),
    heardTranscriptionContainer: document.getElementById("heard-transcription-container"),
    heardTranscriptInput: document.getElementById("heard-transcript-input"),
    btnCopyExpectedTranscript: document.getElementById("btn-copy-expected-transcript"),
    btnClearHeardTranscript: document.getElementById("btn-clear-heard-transcript"),
    heardDiffPreview: document.getElementById("heard-diff-preview"),
    heardDiffContent: document.getElementById("heard-diff-content"),
    diffStatusBadge: document.getElementById("diff-status-badge"),

    // Try Out Playground Stage
    tryoutStage: document.getElementById("tryout-stage"),
    tryoutTabTts: document.getElementById("tryout-tab-tts"),
    tryoutTabAsr: document.getElementById("tryout-tab-asr"),
    tryoutTtsView: document.getElementById("tryout-tts-view"),
    tryoutAsrView: document.getElementById("tryout-asr-view"),
    tryoutModelPills: document.getElementById("tryout-model-pills"),
    tryoutSentenceSelect: document.getElementById("tryout-sentence-select"),
    tryoutTranscriptText: document.getElementById("tryout-transcript-text"),
    tryoutActiveModelName: document.getElementById("tryout-active-model-name"),
    tryoutTimeLabel: document.getElementById("tryout-time-label"),
    tryoutToggleSpeed: document.getElementById("tryout-toggle-speed"),
    tryoutWaveformBox: document.getElementById("tryout-waveform-box"),
    tryoutWaveformCanvas: document.getElementById("tryout-waveform-canvas"),
    tryoutBtnPlay: document.getElementById("tryout-btn-play"),
    tryoutIconPlay: document.getElementById("tryout-icon-play"),
    tryoutIconPause: document.getElementById("tryout-icon-pause"),
    tryoutPlayBtnText: document.getElementById("tryout-play-btn-text"),
    tryoutAsrSentenceSelect: document.getElementById("tryout-asr-sentence-select"),
    tryoutAsrRefText: document.getElementById("tryout-asr-ref-text"),
    tryoutAsrHypText: document.getElementById("tryout-asr-hyp-text"),
    tryoutAsrDiffContent: document.getElementById("tryout-asr-diff-content"),

    // Instructions Modal
    btnShowInstructions: document.getElementById("btn-show-instructions"),
    modalInstructions: document.getElementById("modal-instructions"),
    btnCloseInstructions: document.getElementById("btn-close-instructions"),
    btnDismissInstructions: document.getElementById("btn-dismiss-instructions"),
    modalStudyInstructionsText: document.getElementById("modal-study-instructions-text"),
    modalStudyInstructionsBox: document.getElementById("modal-study-instructions-box"),

    // Audio & Waveform
    btnPlayToggle: document.getElementById("btn-play-toggle"),
    iconPlay: document.getElementById("icon-play"),
    iconPause: document.getElementById("icon-pause"),
    audioTitleLabel: document.getElementById("audio-title-label"),
    audioTimeLabel: document.getElementById("audio-time-label"),
    toggleSpeed: document.getElementById("toggle-speed"),
    waveformBox: document.getElementById("waveform-box"),
    waveformCanvas: document.getElementById("waveform-canvas"),
    defectTagsList: document.getElementById("defect-tags-list"),

    // Popover
    regionTagPopover: document.getElementById("region-tag-popover"),
    popoverTimeRange: document.getElementById("popover-time-range"),
    btnPopoverClose: document.getElementById("btn-popover-close"),
    btnPlaySlice: document.getElementById("btn-play-slice"),
    popoverChipGroup: document.getElementById("popover-chip-group"),
    popoverDefectNote: document.getElementById("popover-defect-note"),
    btnPopoverCancel: document.getElementById("btn-popover-cancel"),
    btnPopoverSave: document.getElementById("btn-popover-save"),

    // Rating
    ratingFormContainer: document.getElementById("rating-form-container"),
    evalNotesInput: document.getElementById("eval-notes-input"),

    // Navigation
    btnPrevItem: document.getElementById("btn-prev-item"),
    btnNextItem: document.getElementById("btn-next-item"),
    evalStatusIndicator: document.getElementById("eval-status-indicator"),

    // Completion
    completionScreen: document.getElementById("completion-screen"),
    summaryRaterName: document.getElementById("summary-rater-name"),
    summaryItemsCount: document.getElementById("summary-items-count"),
    summaryDefectsCount: document.getElementById("summary-defects-count"),
    btnReviewEvaluations: document.getElementById("btn-review-evaluations")
  };

  // Helper: Format seconds
  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return "0:00.0";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m}:${s < 10 ? "0" : ""}${s}.${ms}`;
  }

  // Resolve Campaign ID
  function resolveCampaignId() {
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get("id") || urlParams.get("campaign_id");
    if (idParam) return idParam;

    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2 && pathParts[0] === "eval") {
      return pathParts[1];
    }
    return null;
  }

  // Initialize
  async function init() {
    state.campaignId = resolveCampaignId();

    const storedName = localStorage.getItem("tts_rater_name");
    const storedId = localStorage.getItem("tts_rater_id");

    if (!storedName || !storedId) {
      showOnboarding();
    } else {
      state.rater = { id: storedId, name: storedName };
      el.raterDisplayName.textContent = storedName;
      el.onboardingScreen.classList.add("hidden");
    }

    setupEventListeners();
    await loadCampaignData();
  }

  function showOnboarding() {
    el.onboardingScreen.classList.remove("hidden");
    if (el.onboardErrorMsg) el.onboardErrorMsg.classList.add("hidden");
    el.raterNameInput.value = state.rater.name || localStorage.getItem("tts_rater_name") || "";
    el.raterNameInput.focus();
  }

  function setupEventListeners() {
    // Mode Navigation: Evaluation Studio vs Try Out (TTS & ASR)
    if (el.tabEvalMode && el.tabTryoutMode) {
      el.tabEvalMode.addEventListener("click", () => switchMainMode("eval"));
      el.tabTryoutMode.addEventListener("click", () => switchMainMode("tryout"));
    }

    // Onboarding form submit (Zero PIN required - simply enter name/nickname)
    el.onboardForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = el.raterNameInput.value.trim();
      if (!name) return;

      if (el.onboardErrorMsg) el.onboardErrorMsg.classList.add("hidden");
      if (el.btnOnboardSubmit) {
        el.btnOnboardSubmit.disabled = true;
        el.btnOnboardSubmit.textContent = "Entering Studio...";
      }

      try {
        const resp = await fetch("/api/raters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, language_proficiency: "Native Khmer" })
        });
        const data = await resp.json();

        if (!resp.ok) {
          if (el.onboardErrorMsg) {
            el.onboardErrorMsg.textContent = data.error || "Failed to register rater.";
            el.onboardErrorMsg.classList.remove("hidden");
          } else {
            showToast(data.error || "Access denied.", "error");
          }
          if (el.raterNameInput) el.raterNameInput.focus();
          return;
        }

        const rater = data.rater;
        state.rater = { id: rater.id, name: rater.name };
        localStorage.setItem("tts_rater_id", rater.id);
        localStorage.setItem("tts_rater_name", rater.name);

        el.raterDisplayName.textContent = rater.name;
        el.onboardingScreen.classList.add("hidden");

        if (state.items.length === 0) {
          await loadCampaignData();
        } else {
          await fetchPriorEvaluations();
          renderSidebar();
          renderCurrentItem();
        }
      } catch (err) {
        if (el.onboardErrorMsg) {
          el.onboardErrorMsg.textContent = "Connection error: " + err.message;
          el.onboardErrorMsg.classList.remove("hidden");
        }
      } finally {
        if (el.btnOnboardSubmit) {
          el.btnOnboardSubmit.disabled = false;
          el.btnOnboardSubmit.textContent = "Enter Evaluation Studio";
        }
      }
    });

    // Collapsible "What did you hear" difference drawer
    if (el.btnToggleHeard) {
      el.btnToggleHeard.addEventListener("click", () => {
        const isHidden = el.heardTranscriptionContainer.classList.contains("hidden");
        if (isHidden) {
          el.heardTranscriptionContainer.classList.remove("hidden");
          el.heardTranscriptInput.focus();
        } else {
          el.heardTranscriptionContainer.classList.add("hidden");
        }
      });
    }

    if (el.btnHideHeard) {
      el.btnHideHeard.addEventListener("click", () => {
        el.heardTranscriptionContainer.classList.add("hidden");
      });
    }

    // Change rater
    el.btnChangeRater.addEventListener("click", () => {
      showOnboarding();
    });

    // Mobile sidebar slide-over drawer toggle & backdrop
    el.btnToggleSidebar.addEventListener("click", () => {
      toggleMobileSidebar();
    });

    if (el.sidebarBackdrop) {
      el.sidebarBackdrop.addEventListener("click", () => {
        closeMobileSidebar();
      });
    }

    // Waveform Mode Toggle (Fish Audio Scrub vs Defect Tagging)
    if (el.modeBtnScrub) {
      el.modeBtnScrub.addEventListener("click", () => {
        setWaveformMode("scrub");
      });
    }
    if (el.modeBtnTag) {
      el.modeBtnTag.addEventListener("click", () => {
        setWaveformMode("tag");
      });
    }

    // Instructions Modal
    if (el.btnShowInstructions) {
      el.btnShowInstructions.addEventListener("click", () => {
        if (el.modalInstructions) el.modalInstructions.classList.remove("hidden");
      });
    }
    if (el.btnCloseInstructions) {
      el.btnCloseInstructions.addEventListener("click", () => {
        if (el.modalInstructions) el.modalInstructions.classList.add("hidden");
      });
    }
    if (el.btnDismissInstructions) {
      el.btnDismissInstructions.addEventListener("click", () => {
        if (el.modalInstructions) el.modalInstructions.classList.add("hidden");
      });
    }

    // View Mode Switcher (Matrix vs List)
    if (el.viewModeMatrix) {
      el.viewModeMatrix.addEventListener("click", () => {
        state.sidebarViewMode = "matrix";
        el.viewModeMatrix.className = "px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-white cursor-pointer";
        el.viewModeList.className = "px-1.5 py-0.5 rounded text-[10px] font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 cursor-pointer";
        if (el.sidebarMatrixView) el.sidebarMatrixView.classList.remove("hidden");
        if (el.sidebarItemsList) el.sidebarItemsList.classList.add("hidden");
        renderSidebar();
      });
    }
    if (el.viewModeList) {
      el.viewModeList.addEventListener("click", () => {
        state.sidebarViewMode = "list";
        el.viewModeList.className = "px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-white cursor-pointer";
        el.viewModeMatrix.className = "px-1.5 py-0.5 rounded text-[10px] font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 cursor-pointer";
        if (el.sidebarItemsList) el.sidebarItemsList.classList.remove("hidden");
        if (el.sidebarMatrixView) el.sidebarMatrixView.classList.add("hidden");
        renderSidebar();
      });
    }

    // Sidebar Filters
    el.filterAll.addEventListener("click", () => setSidebarFilter("all"));
    el.filterUnrated.addEventListener("click", () => setSidebarFilter("unrated"));
    el.filterCompleted.addEventListener("click", () => setSidebarFilter("completed"));

    // Audio Play / Pause
    el.btnPlayToggle.addEventListener("click", togglePlay);

    // Speed toggle
    el.toggleSpeed.addEventListener("click", () => {
      const cur = window.dspEngine.playbackRate;
      const next = cur === 1.0 ? 0.8 : (cur === 0.8 ? 1.2 : 1.0);
      window.dspEngine.setSpeed(next);
      el.toggleSpeed.textContent = `${next}x`;
    });

    // Audio DSP progress updates
    window.dspEngine.onProgressCallback = (currentTime, duration) => {
      el.audioTimeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
      window.dspEngine.renderWaveform(el.waveformCanvas, "A");
    };

    window.dspEngine.onEndedCallback = () => {
      updatePlayIcons(false);
    };

    // Region Selection Hook
    window.dspEngine.onRegionSelected = (selection) => {
      state.activeSelection = selection;
      showRegionPopover(selection);
    };

    // Click on existing region hook
    window.dspEngine.onRegionClick = (region) => {
      editExistingRegion(region);
    };

    // Popover Close & Cancel
    el.btnPopoverClose.addEventListener("click", hideRegionPopover);
    el.btnPopoverCancel.addEventListener("click", hideRegionPopover);

    // Audition Region Slice
    el.btnPlaySlice.addEventListener("click", () => {
      if (state.activeSelection) {
        window.dspEngine.playSlice(state.activeSelection.startSec, state.activeSelection.endSec);
      }
    });

    // Defect Chip Selection in Popover
    el.popoverChipGroup.addEventListener("click", (e) => {
      const chip = e.target.closest(".defect-chip");
      if (!chip) return;
      el.popoverChipGroup.querySelectorAll(".defect-chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
    });

    // Save Defect Region
    el.btnPopoverSave.addEventListener("click", saveActiveDefectRegion);

    // Next & Previous buttons
    el.btnNextItem.addEventListener("click", submitAndNext);
    el.btnPrevItem.addEventListener("click", () => navigateItem(-1));
    setupAsrControls();

    // Rater Heard Transcription Quick-Copy & Live Diff Listeners
    if (el.btnCopyExpectedTranscript) {
      el.btnCopyExpectedTranscript.addEventListener("click", () => {
        const item = state.items[state.currentIndex];
        if (!item) return;
        const expected = item.text || item.source_text || item.reference_transcript || "";
        if (el.heardTranscriptInput) {
          el.heardTranscriptInput.value = expected;
          updateHeardDiff();
          el.heardTranscriptInput.focus();
        }
      });
    }

    if (el.btnClearHeardTranscript) {
      el.btnClearHeardTranscript.addEventListener("click", () => {
        if (el.heardTranscriptInput) {
          el.heardTranscriptInput.value = "";
          updateHeardDiff();
        }
      });
    }

    if (el.heardTranscriptInput) {
      el.heardTranscriptInput.addEventListener("input", () => {
        updateHeardDiff();
      });
    }

    // Review submissions button
    el.btnReviewEvaluations.addEventListener("click", () => {
      el.completionScreen.classList.add("hidden");
      el.evalStage.classList.remove("hidden");
      state.currentIndex = 0;
      renderCurrentItem();
      renderSidebar();
    });

    // Global Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        if (e.key === "Escape") hideRegionPopover();
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "Enter") {
        e.preventDefault();
        submitAndNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        navigateItem(-1);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        navigateItem(1);
      } else if (["1", "2", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        const score = parseInt(e.key, 10);
        const metrics = state.campaign?.metrics || [];
        // Target first unanswered metric, or first metric if all filled
        let targetMetric = metrics.find(m => {
          const k = m.key || m.id || m.name;
          return state.currentScores[k] === undefined;
        });
        if (!targetMetric && metrics.length > 0) {
          targetMetric = metrics[0];
        }
        if (targetMetric) {
          const k = targetMetric.key || targetMetric.id || targetMetric.name;
          state.currentScores[k] = score;
          if (navigator.vibrate) navigator.vibrate(10);
          updateRubricPillSelection();
        }
      } else if (e.key === "Escape") {
        hideRegionPopover();
      }
    });

    // Window resize waveform redraw
    window.addEventListener("resize", () => {
      window.dspEngine.renderWaveform(el.waveformCanvas, "A");
    });
  }

  // Mobile Drawer Navigation Helpers
  function openMobileSidebar() {
    if (!el.audioSidebar) return;
    el.audioSidebar.classList.remove("hidden");
    el.audioSidebar.classList.add("drawer-open");
    if (el.sidebarBackdrop) {
      el.sidebarBackdrop.classList.remove("hidden");
    }
  }

  function closeMobileSidebar() {
    if (!el.audioSidebar) return;
    el.audioSidebar.classList.remove("drawer-open");
    if (el.sidebarBackdrop) {
      el.sidebarBackdrop.classList.add("hidden");
    }
  }

  function toggleMobileSidebar() {
    if (el.audioSidebar?.classList.contains("drawer-open")) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  }

  // Waveform Mode Switcher (Fish Audio Fluid Scrub vs Precision Defect Tagging)
  function setWaveformMode(mode) {
    window.dspEngine.setWaveformMode(mode);
    const isScrub = mode === "scrub";
    if (el.modeBtnScrub && el.modeBtnTag) {
      el.modeBtnScrub.className = isScrub
        ? "px-2.5 py-0.5 rounded-md bg-white text-zinc-900 shadow-2xs font-semibold cursor-pointer"
        : "px-2.5 py-0.5 rounded-md text-zinc-500 hover:text-zinc-900 cursor-pointer";
      el.modeBtnTag.className = !isScrub
        ? "px-2.5 py-0.5 rounded-md bg-white text-zinc-900 shadow-2xs font-semibold cursor-pointer"
        : "px-2.5 py-0.5 rounded-md text-zinc-500 hover:text-zinc-900 cursor-pointer";
    }
  }

  // Sidebar Filter Switch
  function setSidebarFilter(filter) {
    state.sidebarFilter = filter;
    el.filterAll.classList.toggle("bg-zinc-900", filter === "all");
    el.filterAll.classList.toggle("text-white", filter === "all");
    el.filterAll.classList.toggle("bg-zinc-50", filter !== "all");
    el.filterAll.classList.toggle("text-zinc-600", filter !== "all");

    el.filterUnrated.classList.toggle("bg-zinc-900", filter === "unrated");
    el.filterUnrated.classList.toggle("text-white", filter === "unrated");
    el.filterUnrated.classList.toggle("bg-zinc-50", filter !== "unrated");
    el.filterUnrated.classList.toggle("text-zinc-600", filter !== "unrated");

    el.filterCompleted.classList.toggle("bg-zinc-900", filter === "completed");
    el.filterCompleted.classList.toggle("text-white", filter === "completed");
    el.filterCompleted.classList.toggle("bg-zinc-50", filter !== "completed");
    el.filterCompleted.classList.toggle("text-zinc-600", filter !== "completed");

    renderSidebar();
  }

  // Fetch prior evaluations for this rater
  async function fetchPriorEvaluations() {
    if (!state.rater.id || !state.campaignId) return;
    try {
      const evalResp = await fetch(`/api/evaluations?campaign_id=${state.campaignId}&rater_id=${state.rater.id}`);
      const evalData = await evalResp.json();
      const list = evalData.evaluations || [];
      state.existingEvaluations = {};
      for (const ev of list) {
        state.existingEvaluations[ev.item_id] = ev;
      }
    } catch (e) {
      console.warn("Could not fetch prior evaluations:", e);
    }
  }

  // Load Campaign and Items from API
  let isLoadingCampaign = false;
  async function loadCampaignData() {
    if (isLoadingCampaign) return;
    isLoadingCampaign = true;

    try {
      const campResp = await fetch("/api/campaigns");
      const campData = await campResp.json();
      const campaigns = campData.campaigns || [];

      if (campaigns.length === 0) {
        showToast("No evaluation studies found on the server. Please create one in the Creator Studio (/admin).", "error");
        return;
      }

      if (state.campaignId) {
        state.campaign = campaigns.find(c => c.id === state.campaignId) || campaigns[0];
      } else {
        state.campaign = campaigns[0];
        state.campaignId = state.campaign.id;
      }

      // Update study title & header (with safe null-guards)
      if (el.studyNameTag) el.studyNameTag.textContent = state.campaign.project_name || "Speech Evaluation Study";
      if (el.studyHeadline) el.studyHeadline.textContent = state.campaign.name || "Khmer Speech Evaluation";
      if (el.onboardCampaignTitle) el.onboardCampaignTitle.textContent = state.campaign.name || "Khmer Speech Evaluation";

      if (state.campaign.instructions) {
        if (el.modalStudyInstructionsBox) el.modalStudyInstructionsBox.classList.remove("hidden");
        if (el.modalStudyInstructionsText) el.modalStudyInstructionsText.textContent = state.campaign.instructions;
        if (el.onboardCampaignDesc) el.onboardCampaignDesc.textContent = state.campaign.instructions;
      } else {
        if (el.modalStudyInstructionsBox) el.modalStudyInstructionsBox.classList.add("hidden");
      }

      // Fetch Items
      const itemsResp = await fetch(`/api/items?campaign_id=${state.campaignId}`);
      const itemsData = await itemsResp.json();
      state.items = itemsData.items || [];

      if (state.items.length === 0) {
        showToast("No test audio items found in this study.", "error");
        return;
      }

      await fetchPriorEvaluations();

      // Find first uncompleted item
      const firstUnrated = state.items.findIndex(it => !state.existingEvaluations[it.id]);
      if (firstUnrated !== -1) {
        state.currentIndex = firstUnrated;
      } else if (state.items.length > 0 && Object.keys(state.existingEvaluations).length >= state.items.length) {
        showCompletionScreen();
        return;
      }

      renderSidebar();
      renderCurrentItem();

    } catch (err) {
      console.error("Failed to load study data:", err);
      showToast("Failed to load study data: " + err.message, "error");
    } finally {
      isLoadingCampaign = false;
    }
  }

  // Render Sidebar Model Tabs, Zero-Scroll Matrix Grid, and Progress
  function renderSidebar() {
    const total = state.items.length;
    let completedCount = 0;

    // Calculate model-level statistics
    const modelsMap = {};
    state.items.forEach((it, idx) => {
      const isCompleted = !!state.existingEvaluations[it.id];
      if (isCompleted) completedCount++;

      const mName = resolveItemModelName(it) || "Model";
      const mId = resolveItemModelId(it);
      if (!modelsMap[mId]) {
        modelsMap[mId] = { id: mId, name: mName, total: 0, completed: 0, items: [] };
      }
      modelsMap[mId].total++;
      if (isCompleted) modelsMap[mId].completed++;
      modelsMap[mId].items.push({ item: it, globalIndex: idx });
    });

    const unratedCount = total - completedCount;
    const progressPercent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    // Overall Progress Header
    if (el.sidebarProgressText) el.sidebarProgressText.textContent = `${completedCount} of ${total} (${progressPercent}%)`;
    if (el.sidebarProgressBar) el.sidebarProgressBar.style.width = `${progressPercent}%`;

    if (el.countAll) el.countAll.textContent = total;
    if (el.countUnrated) el.countUnrated.textContent = unratedCount;
    if (el.countCompleted) el.countCompleted.textContent = completedCount;

    // 1. Render Model Selector Tabs
    if (el.modelTabsContainer) {
      el.modelTabsContainer.innerHTML = "";

      // "All Models" Pill Button
      const allSelected = state.selectedModelFilter === "all";
      const allBtn = document.createElement("button");
      allBtn.className = `w-full py-1.5 px-2.5 rounded-lg text-left text-xs font-semibold border transition cursor-pointer ${
        allSelected
          ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs"
          : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
      }`;
      allBtn.innerHTML = `
        <div class="flex items-center justify-between text-xs">
          <span>All Models</span>
          <span class="font-mono text-[11px] font-bold ${allSelected ? "text-zinc-300" : "text-zinc-500"}">${completedCount}/${total}</span>
        </div>
      `;
      allBtn.addEventListener("click", () => {
        state.selectedModelFilter = "all";
        renderSidebar();
      });
      el.modelTabsContainer.appendChild(allBtn);

      // Model Buttons (Khmer-TTS, Meta MMS, Sengtha, VoxCPM2)
      Object.values(modelsMap).forEach(m => {
        const isSelected = state.selectedModelFilter === m.id;
        const mBtn = document.createElement("button");
        mBtn.className = `w-full py-1.5 px-2.5 rounded-lg text-left text-xs font-medium border transition cursor-pointer ${
          isSelected
            ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs font-semibold"
            : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
        }`;
        mBtn.innerHTML = `
          <div class="flex items-center justify-between text-xs">
            <span class="truncate">${escapeHtml(m.name)}</span>
            <span class="font-mono text-[11px] ml-1 font-bold ${isSelected ? "text-zinc-300" : "text-zinc-500"}">${m.completed}/${m.total}</span>
          </div>
        `;
        mBtn.addEventListener("click", () => {
          state.selectedModelFilter = m.id;
          renderSidebar();
        });
        el.modelTabsContainer.appendChild(mBtn);
      });
    }

    // 2. Render Zero-Scroll Matrix Grid View
    if (el.sidebarMatrixGrid) {
      el.sidebarMatrixGrid.innerHTML = "";

      // Helper function to create interactive matrix cell
      const createCell = (it, globalIndex, mName) => {
        const isCompleted = !!state.existingEvaluations[it.id];
        const isActive = globalIndex === state.currentIndex;
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `matrix-cell ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`;

        // Extract clean sentence number: KH01 -> "01"
        let cellText = `${globalIndex + 1}`;
        if (it.item_key && it.item_key.includes("KH")) {
          const match = it.item_key.match(/KH(\d+)/i);
          if (match) cellText = match[1];
        }

        cell.innerHTML = `<span>${cellText}</span>`;
        cell.title = `${mName || "Model"} • ${it.item_key || `Sample ${globalIndex + 1}`}\n${it.source_text || it.text || ""}\nStatus: ${isCompleted ? "Completed" : "Unrated"}`;

        cell.addEventListener("click", async () => {
          if (globalIndex !== state.currentIndex) {
            await autoSaveCurrentItem();
            state.currentIndex = globalIndex;
            renderCurrentItem();
            renderSidebar();
          }
          closeMobileSidebar();
          el.evalStage?.scrollTo({ top: 0, behavior: "smooth" });
        });
        return cell;
      };

      if (state.selectedModelFilter === "all") {
        if (el.matrixActiveModelLabel) {
          el.matrixActiveModelLabel.textContent = `All Models (${Object.keys(modelsMap).length} Groups • ${total} Items)`;
        }

        // Render each model as a distinct section with clear header and 23 items
        Object.values(modelsMap).forEach(m => {
          const groupDiv = document.createElement("div");
          groupDiv.className = "model-grid-section space-y-1.5";

          const headerDiv = document.createElement("div");
          headerDiv.className = "flex items-center justify-between text-[11px] font-semibold text-zinc-800 px-0.5";
          headerDiv.innerHTML = `
            <span class="truncate">${escapeHtml(m.name)}</span>
            <span class="font-mono text-[10px] text-zinc-500 font-bold">${m.completed}/${m.total}</span>
          `;
          groupDiv.appendChild(headerDiv);

          const gridDiv = document.createElement("div");
          gridDiv.className = "matrix-grid";

          let renderedCount = 0;
          m.items.forEach(({ item, globalIndex }) => {
            const isCompleted = !!state.existingEvaluations[item.id];
            if (state.sidebarFilter === "unrated" && isCompleted) return;
            if (state.sidebarFilter === "completed" && !isCompleted) return;

            gridDiv.appendChild(createCell(item, globalIndex, m.name));
            renderedCount++;
          });

          if (renderedCount > 0) {
            groupDiv.appendChild(gridDiv);
            el.sidebarMatrixGrid.appendChild(groupDiv);
          }
        });
      } else {
        // Render single selected model 23-cell grid
        const selectedModel = modelsMap[state.selectedModelFilter];
        if (el.matrixActiveModelLabel) {
          el.matrixActiveModelLabel.textContent = selectedModel ? `${selectedModel.name} (${selectedModel.total} Sentences)` : "Model Samples";
        }

        const gridDiv = document.createElement("div");
        gridDiv.className = "matrix-grid";

        const mItems = selectedModel ? selectedModel.items : [];
        mItems.forEach(({ item, globalIndex }) => {
          const isCompleted = !!state.existingEvaluations[item.id];
          if (state.sidebarFilter === "unrated" && isCompleted) return;
          if (state.sidebarFilter === "completed" && !isCompleted) return;

          gridDiv.appendChild(createCell(item, globalIndex, selectedModel ? selectedModel.name : "Model"));
        });

        el.sidebarMatrixGrid.appendChild(gridDiv);
      }
    }

    // 3. Render Per-Model Progress Summary Checklist
    if (el.sidebarModelSummaryList) {
      el.sidebarModelSummaryList.innerHTML = "";
      Object.values(modelsMap).forEach(m => {
        const pct = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
        const row = document.createElement("div");
        row.className = "flex flex-col gap-1 py-1";
        row.innerHTML = `
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-medium text-zinc-700 truncate">${escapeHtml(m.name)}</span>
            <span class="font-mono text-zinc-500 font-semibold">${m.completed}/${m.total} (${pct}%)</span>
          </div>
          <div class="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
            <div class="bg-zinc-800 h-full rounded-full transition-all duration-200" style="width: ${pct}%;"></div>
          </div>
        `;
        el.sidebarModelSummaryList.appendChild(row);
      });
    }

    // 4. Render Traditional List View (If toggled)
    if (el.sidebarItemsList && state.sidebarViewMode === "list") {
      el.sidebarItemsList.innerHTML = "";

      state.items.forEach((item, idx) => {
        const itModelId = resolveItemModelId(item);
        if (state.selectedModelFilter !== "all" && itModelId !== state.selectedModelFilter) {
          return;
        }

        const isCompleted = !!state.existingEvaluations[item.id];
        const isActive = idx === state.currentIndex;

        if (state.sidebarFilter === "unrated" && isCompleted) return;
        if (state.sidebarFilter === "completed" && !isCompleted) return;

        const itemCard = document.createElement("div");
        itemCard.className = `p-2.5 rounded-xl border text-xs cursor-pointer transition flex items-start justify-between gap-2 ${
          isActive
            ? "border-zinc-900 bg-zinc-50 shadow-sm"
            : "border-zinc-100 bg-white hover:border-zinc-300"
        }`;

        const modelName = resolveItemModelName(item);
        const codeSnippet = item.item_key ? item.item_key.split("•")[0].trim() : `Sample ${idx + 1}`;
        const textSnippet = (item.source_text || item.text || item.prompt_text || "Audio Item").slice(0, 30);

        itemCard.innerHTML = `
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-bold ${isActive ? "text-zinc-900" : "text-zinc-700"}">
                ${idx + 1}. ${escapeHtml(codeSnippet)}
              </span>
              ${modelName ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700">${escapeHtml(modelName)}</span>` : ""}
            </div>
            <div class="text-[11px] text-zinc-500 font-sans truncate mt-0.5" title="${escapeHtml(item.source_text || item.text || "")}">
              ${escapeHtml(textSnippet)}${(item.source_text || item.text || "").length > 30 ? "..." : ""}
            </div>
          </div>
          <span class="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            isCompleted
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-zinc-100 text-zinc-700"
          }">
            ${isCompleted ? "Completed" : "Unrated"}
          </span>
        `;

        itemCard.addEventListener("click", async () => {
          if (idx !== state.currentIndex) {
            await autoSaveCurrentItem();
            state.currentIndex = idx;
            renderCurrentItem();
            renderSidebar();
          }
          closeMobileSidebar();
          el.evalStage?.scrollTo({ top: 0, behavior: "smooth" });
        });

        el.sidebarItemsList.appendChild(itemCard);
      });
    }
  }

  function updateAsrButtonStyles() {
    if (!el.btnAsrAcceptable || !el.btnAsrError) return;
    if (state.currentAsrAdjudication === "ACCEPTABLE_VARIATION") {
      el.btnAsrAcceptable.classList.add("ring-2", "ring-emerald-600", "font-bold", "bg-emerald-100");
      el.btnAsrError.classList.remove("ring-2", "ring-red-600", "font-bold", "bg-red-100");
    } else if (state.currentAsrAdjudication === "TRUE_ERROR") {
      el.btnAsrError.classList.add("ring-2", "ring-red-600", "font-bold", "bg-red-100");
      el.btnAsrAcceptable.classList.remove("ring-2", "ring-emerald-600", "font-bold", "bg-emerald-100");
    } else {
      el.btnAsrAcceptable.classList.remove("ring-2", "ring-emerald-600", "font-bold", "bg-emerald-100");
      el.btnAsrError.classList.remove("ring-2", "ring-red-600", "font-bold", "bg-red-100");
    }
  }

  function setupAsrControls() {
    if (el.btnAsrAcceptable) {
      el.btnAsrAcceptable.addEventListener("click", () => {
        state.currentAsrAdjudication = "ACCEPTABLE_VARIATION";
        state.currentScores = state.currentScores || {};
        state.currentScores["accuracy"] = 5;
        updateAsrButtonStyles();
      });
    }
    if (el.btnAsrError) {
      el.btnAsrError.addEventListener("click", () => {
        state.currentAsrAdjudication = "TRUE_ERROR";
        state.currentScores = state.currentScores || {};
        state.currentScores["accuracy"] = 1;
        updateAsrButtonStyles();
      });
    }
  }

  // Dependency-Free Khmer Grapheme Cluster Diffing Engine
  function computeKhmerDiff(expectedText, actualText) {
    const cleanA = (expectedText || "").replace(/[\u200B\uFEFF]/g, "").trim();
    const cleanB = (actualText || "").replace(/[\u200B\uFEFF]/g, "").trim();

    if (!cleanA && !cleanB) return { isExactMatch: true, html: "", merged: [] };
    if (cleanA === cleanB) {
      return {
        isExactMatch: true,
        html: `<span class="diff-token-match">${escapeHtml(cleanB)}</span>`,
        merged: [{ type: "equal", text: cleanB }]
      };
    }

    const segmenter = (typeof Intl !== "undefined" && Intl.Segmenter)
      ? new Intl.Segmenter("km", { granularity: "grapheme" })
      : null;

    const tokensA = segmenter ? Array.from(segmenter.segment(cleanA)).map(s => s.segment) : Array.from(cleanA);
    const tokensB = segmenter ? Array.from(segmenter.segment(cleanB)).map(s => s.segment) : Array.from(cleanB);

    const m = tokensA.length;
    const n = tokensB.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (tokensA[i - 1] === tokensB[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = m, j = n;
    const rawDiff = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && tokensA[i - 1] === tokensB[j - 1]) {
        rawDiff.unshift({ type: "equal", text: tokensA[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        rawDiff.unshift({ type: "insert", text: tokensB[j - 1] });
        j--;
      } else {
        rawDiff.unshift({ type: "delete", text: tokensA[i - 1] });
        i--;
      }
    }

    // Merge contiguous tokens of identical operation
    const merged = [];
    for (const item of rawDiff) {
      if (merged.length > 0 && merged[merged.length - 1].type === item.type) {
        merged[merged.length - 1].text += item.text;
      } else {
        merged.push({ ...item });
      }
    }

    let html = "";
    for (const part of merged) {
      const safe = escapeHtml(part.text);
      if (part.type === "equal") {
        html += `<span class="diff-token-match">${safe}</span>`;
      } else if (part.type === "delete") {
        html += `<mark class="diff-token-delete" title="Omitted / Mispronounced">${safe}</mark>`;
      } else if (part.type === "insert") {
        html += `<mark class="diff-token-insert" title="Inserted / Substituted">${safe}</mark>`;
      }
    }

    return { isExactMatch: false, html, merged };
  }

  function updateHeardDiff() {
    if (!el.heardTranscriptInput || !el.heardDiffPreview || !el.heardDiffContent) return;
    const heardText = el.heardTranscriptInput.value.trim();
    const item = state.items[state.currentIndex];
    if (!item) return;
    const expectedText = (item.text || item.source_text || item.reference_transcript || "").trim();

    if (!heardText) {
      el.heardDiffPreview.classList.add("hidden");
      if (el.heardIndicatorBadge) el.heardIndicatorBadge.classList.add("hidden");
      return;
    }
    if (el.heardIndicatorBadge) el.heardIndicatorBadge.classList.remove("hidden");

    const diff = computeKhmerDiff(expectedText, heardText);
    el.heardDiffContent.innerHTML = diff.html;
    el.heardDiffPreview.classList.remove("hidden");

    if (diff.isExactMatch) {
      if (el.diffStatusBadge) {
        el.diffStatusBadge.textContent = "Matches prompt (គ្មានភាពខុសគ្នា)";
        el.diffStatusBadge.className = "font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200";
      }
    } else {
      if (el.diffStatusBadge) {
        el.diffStatusBadge.textContent = "Differences detected (មានភាពខុសគ្នា)";
        el.diffStatusBadge.className = "font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200";
      }
    }
  }

  // Render the current test item
  async function renderCurrentItem() {
    if (state.items.length === 0) return;

    hideRegionPopover();
    state.itemStartTime = Date.now();
    const item = state.items[state.currentIndex];
    const total = state.items.length;

    // Previous button state
    el.btnPrevItem.disabled = state.currentIndex === 0;
    el.btnPrevItem.classList.toggle("opacity-50", state.currentIndex === 0);

    // Next button label
    const isLast = state.currentIndex === total - 1;
    el.btnNextItem.querySelector("span").textContent = isLast ? "Submit & Finish" : "Submit & Next";

    // Header label & Model Badge
    const modelName = resolveItemModelName(item);
    const codeSnippet = item.item_key ? item.item_key.split("•")[0].trim() : `Sample ${state.currentIndex + 1}`;
    el.audioTitleLabel.textContent = `Sample ${state.currentIndex + 1} of ${total} • ${codeSnippet}`;
    if (el.audioModelBadge) {
      el.audioModelBadge.textContent = modelName || "Model";
    }

    // 1. Verbatim Raw Continuous Khmer Script or ASR Diff
    const isAsr = (state.campaign && state.campaign.modality === "ASR");
    if (isAsr) {
      if (el.ttsTranscriptContainer) el.ttsTranscriptContainer.classList.add("hidden");
      if (el.asrDiffContainer) el.asrDiffContainer.classList.remove("hidden");

      const ref = item.reference_transcript || item.source_text || item.text || "-";
      const hyp = item.hypothesis_transcript || item.blind_transcript || item.text || "-";
      if (el.asrReferenceText) el.asrReferenceText.textContent = ref;
      if (el.asrHypothesisText) el.asrHypothesisText.textContent = hyp;

      const existing = state.existingEvaluations[item.id];
      state.currentAsrAdjudication = (existing && existing.asr_adjudication) || null;
      updateAsrButtonStyles();
    } else {
      if (el.ttsTranscriptContainer) el.ttsTranscriptContainer.classList.remove("hidden");
      if (el.asrDiffContainer) el.asrDiffContainer.classList.add("hidden");
      state.currentAsrAdjudication = null;

      const rawText = item.source_text || item.text || item.prompt_text || "No transcript available.";
      el.rawKhmerContent.textContent = rawText;
    }

    // 2. Resolve Audio URL
    state.currentAudioUrl = resolveAudioUrl(item);
    updatePlayIcons(false);
    el.audioTimeLabel.textContent = "Loading audio...";

    // Reset tags and selection
    state.currentDefects = [];
    state.activeSelection = null;
    window.dspEngine.clearRegions();
    renderDefectTagsList();

    // Load Audio into DSP
    if (state.currentAudioUrl) {
      const res = await window.dspEngine.loadAudio(state.currentAudioUrl);
      if (res.success) {
        el.audioTimeLabel.textContent = `0.00s / ${formatTime(res.duration)}`;
        window.dspEngine.renderWaveform(el.waveformCanvas, "A");
      } else {
        el.audioTimeLabel.textContent = "Audio unavailable";
      }
    } else {
      el.audioTimeLabel.textContent = "No audio file linked";
    }

    // 3. Render Dynamic Rubric Criteria Form (2x2 Compact Zero-Scroll Grid)
    renderRubricForm();

    // 4. Restore existing evaluation if already evaluated
    const existing = state.existingEvaluations[item.id];
    if (existing) {
      if (existing.scores_json) {
        try {
          const sc = typeof existing.scores_json === "string" ? JSON.parse(existing.scores_json) : existing.scores_json;
          state.currentScores = { ...sc };
          updateRubricPillSelection();
        } catch (e) {}
      }
      if (existing.comments) {
        el.evalNotesInput.value = existing.comments;
      } else {
        el.evalNotesInput.value = "";
      }
      if (el.heardTranscriptInput) {
        el.heardTranscriptInput.value = existing.blind_transcript || "";
      }
    } else {
      state.currentScores = {};
      el.evalNotesInput.value = "";
      if (el.heardTranscriptInput) {
        el.heardTranscriptInput.value = "";
      }
    }

    // Toggle Perceived Speech Transcription field (collapsed by default to eliminate vertical screen overflow)
    if (state.campaign?.collect_transcription) {
      if (el.heardTranscriptionWrapper) el.heardTranscriptionWrapper.classList.remove("hidden");
      const hasEditedText = !!(el.heardTranscriptInput && el.heardTranscriptInput.value.trim());
      if (hasEditedText) {
        if (el.heardTranscriptionContainer) el.heardTranscriptionContainer.classList.remove("hidden");
        if (el.heardIndicatorBadge) el.heardIndicatorBadge.classList.remove("hidden");
      } else {
        if (el.heardTranscriptionContainer) el.heardTranscriptionContainer.classList.add("hidden");
        if (el.heardIndicatorBadge) el.heardIndicatorBadge.classList.add("hidden");
      }
    } else {
      if (el.heardTranscriptionWrapper) el.heardTranscriptionWrapper.classList.add("hidden");
      if (el.heardTranscriptionContainer) el.heardTranscriptionContainer.classList.add("hidden");
    }
    updateHeardDiff();
  }

  // Resolve audio file URL
  function resolveAudioUrl(item) {
    if (item.audio_url) return item.audio_url;

    if (item.audio_files_json) {
      try {
        const filesObj = typeof item.audio_files_json === "string" ? JSON.parse(item.audio_files_json) : item.audio_files_json;
        if (filesObj.url) return filesObj.url;
        const keys = Object.keys(filesObj);
        if (keys.length > 0) {
          const targetKey = keys[0];
          return filesObj[targetKey]?.url || filesObj[targetKey];
        }
      } catch (e) {}
    }
    return null;
  }

  // Render dynamic rubric criteria (2x2 Compact Zero-Scroll Grid with Bilingual Khmer-English Labels)
  function renderRubricForm() {
    el.ratingFormContainer.innerHTML = "";
    const metrics = state.campaign.metrics || [
      { key: "naturalness", label_en: "Naturalness", label_km: "លក្ខណៈធម្មជាតិនៃសំឡេង", desc: "Does it sound like a real human speaking?" },
      { key: "pronunciation", label_en: "Pronunciation Accuracy", label_km: "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង", desc: "Are vowels and consonants pronounced correctly?" }
    ];

    const minScale = state.campaign.scale_min || 1;
    const maxScale = state.campaign.scale_max || 5;

    const khmerMetricNames = {
      pronunciation: "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង",
      intelligibility: "ភាពងាយស្រួលក្នុងការស្តាប់យល់",
      naturalness: "លក្ខណៈធម្មជាតិនៃសំឡេង",
      voice_quality: "គុណភាពនៃសម្លេង"
    };

    const khmerMetricDescs = {
      pronunciation: "តើពាក្យត្រូវបានបញ្ចេញសំឡេងត្រឹមត្រូវ ដោយមិនបាត់ស្រៈ ឬព្យញ្ជនៈដែរឬទេ?",
      intelligibility: "តើពាក្យ និងឃ្លាអាចស្តាប់យល់បានច្បាស់លាស់កម្រិតណា?",
      naturalness: "ចង្វាក់និយាយរលូនដូចមនុស្សពិត ដោយគ្មានសំឡេងរ៉ូបូត។",
      voice_quality: "កម្រិតច្បាស់នៃសំឡេង ដោយគ្មានសំឡេងរំខាន ឬខ្សឹបខ្សៀវ។"
    };

    for (const metric of metrics) {
      const metricKey = metric.key || metric.id || metric.name;
      const titleEn = metric.label_en || metric.label || metric.name || metricKey;
      const titleKm = metric.label_km || khmerMetricNames[metricKey] || "";
      const descEn = metric.desc_en || metric.desc || "";
      const descKm = metric.desc_km || khmerMetricDescs[metricKey] || "";

      const row = document.createElement("div");
      row.className = "rating-criterion-row p-3 bg-white border border-zinc-200 rounded-xl flex flex-col justify-between gap-2 shadow-2xs";
      row.dataset.metricKey = metricKey;

      const headerDiv = document.createElement("div");
      headerDiv.className = "flex items-start justify-between gap-1.5";

      let titleHtml = "";
      if (titleKm) {
        titleHtml = `<span class="font-khmer font-bold text-zinc-900">${escapeHtml(titleKm)}</span> <span class="text-[11px] font-semibold text-zinc-500 font-sans">(${escapeHtml(titleEn)})</span>`;
      } else {
        titleHtml = `<span class="font-bold text-zinc-900">${escapeHtml(titleEn)}</span>`;
      }

      let descHtml = "";
      if (descKm) {
        descHtml = `<span class="font-khmer text-zinc-500">${escapeHtml(descKm)}</span>`;
      } else if (descEn) {
        descHtml = `<span class="text-zinc-500">${escapeHtml(descEn)}</span>`;
      }

      headerDiv.innerHTML = `
        <div class="min-w-0">
          <div class="criterion-title text-xs leading-snug">${titleHtml}</div>
          ${descHtml ? `<div class="criterion-desc text-[11px] truncate mt-0.5" title="${escapeHtml(descEn || descKm)}">${descHtml}</div>` : ""}
        </div>
      `;

      const controlsDiv = document.createElement("div");
      controlsDiv.className = "flex flex-col gap-1";

      const anchorsDiv = document.createElement("div");
      anchorsDiv.className = "flex justify-between w-full text-[10px] text-zinc-500 font-medium px-1";
      anchorsDiv.innerHTML = `
        <span><strong class="font-mono text-zinc-700">1:</strong> ខ្សោយ (Poor)</span>
        <span><strong class="font-mono text-zinc-700">${maxScale}:</strong> ល្អឥតខ្ចោះ (Excellent)</span>
      `;

      const scaleDiv = document.createElement("div");
      scaleDiv.className = "scale-selector flex gap-1.5";

      for (let s = minScale; s <= maxScale; s++) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "score-pill flex-1 min-h-[44px] h-11 text-sm font-bold rounded-xl border border-zinc-200 bg-white hover:border-zinc-900 hover:bg-zinc-50 text-zinc-800 transition cursor-pointer flex items-center justify-center";
        pill.textContent = s;
        pill.dataset.score = s;
        pill.dataset.metricKey = metricKey;

        pill.addEventListener("click", () => {
          state.currentScores[metricKey] = s;
          if (navigator.vibrate) navigator.vibrate(10);
          updateRubricPillSelection();
        });

        scaleDiv.appendChild(pill);
      }

      controlsDiv.appendChild(anchorsDiv);
      controlsDiv.appendChild(scaleDiv);
      row.appendChild(headerDiv);
      row.appendChild(controlsDiv);
      el.ratingFormContainer.appendChild(row);
    }

    updateRubricPillSelection();
  }

  function updateRubricPillSelection() {
    el.ratingFormContainer.querySelectorAll(".score-pill").forEach(pill => {
      const mKey = pill.dataset.metricKey;
      const score = parseInt(pill.dataset.score, 10);
      const isSelected = state.currentScores[mKey] === score;
      pill.classList.toggle("active", isSelected);
    });

    // Update Live Completion Status Pill
    if (el.evalStatusIndicator) {
      const metrics = state.campaign?.metrics || [];
      const totalMetrics = metrics.length;
      let answeredCount = 0;
      for (const m of metrics) {
        const mKey = m.key || m.id || m.name;
        if (state.currentScores[mKey] !== undefined) {
          answeredCount++;
        }
      }

      if (totalMetrics > 0 && answeredCount === totalMetrics) {
        el.evalStatusIndicator.textContent = "All answered - Ready to Submit";
        el.evalStatusIndicator.className = "text-xs font-semibold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 transition";
      } else {
        el.evalStatusIndicator.textContent = `Incomplete: ${answeredCount} of ${totalMetrics} answered`;
        el.evalStatusIndicator.className = "text-xs font-semibold px-3 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 transition";
      }
    }
  }

  // Audio Playback Toggle
  function togglePlay() {
    if (window.dspEngine.isPlaying) {
      window.dspEngine.pause();
      updatePlayIcons(false);
    } else {
      window.dspEngine.play();
      updatePlayIcons(true);
    }
  }

  function updatePlayIcons(isPlaying) {
    if (isPlaying) {
      el.iconPlay.classList.add("hidden");
      el.iconPause.classList.remove("hidden");
    } else {
      el.iconPlay.classList.remove("hidden");
      el.iconPause.classList.add("hidden");
    }
  }

  // Render Dynamic Defect Chips based on Campaign Configuration with Bilingual Khmer-English Labels
  function renderDefectChips() {
    if (!el.popoverChipGroup) return;
    const defectTypes = state.campaign?.defect_types || [
      { code: "MISPRON", label: "Mispronunciation", label_km: "បញ្ចេញសំឡេងខុស" },
      { code: "NOISE", label: "Noise / Click", label_km: "សំឡេងរំខាន" },
      { code: "UNNAT_PAUSE", label: "Awkward Pause", label_km: "ផ្អាកខុសប្រក្រតី" },
      { code: "ROBOTIC", label: "Robotic Buzz", label_km: "សំឡេងរ៉ូបូត" },
      { code: "PITCH", label: "Unnatural Pitch", label_km: "កម្ពស់សំឡេងខុស" },
      { code: "OTHER", label: "Other Defect", label_km: "បញ្ហាផ្សេងទៀត" }
    ];

    const khmerDefectMap = {
      MISPRON: "បញ្ចេញសំឡេងខុស",
      NOISE: "សំឡេងរំខាន",
      UNNAT_PAUSE: "ផ្អាកខុសប្រក្រតី",
      ROBOTIC: "សំឡេងរ៉ូបូត",
      PITCH: "កម្ពស់សំឡេងខុស",
      OTHER: "បញ្ហាផ្សេងទៀត"
    };

    el.popoverChipGroup.innerHTML = "";
    defectTypes.forEach((dt, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `defect-chip ${idx === 0 ? "selected" : ""}`;
      chip.dataset.code = dt.code;

      const labelKm = dt.label_km || khmerDefectMap[dt.code] || "";
      const labelEn = dt.label || dt.name || dt.code;

      if (labelKm) {
        chip.innerHTML = `<span class="font-khmer font-medium">${escapeHtml(labelKm)}</span> <span class="text-[10px] text-zinc-500 font-sans">(${escapeHtml(labelEn)})</span>`;
      } else {
        chip.textContent = labelEn;
      }

      el.popoverChipGroup.appendChild(chip);
    });
  }

  // Popover Position & Display
  function showRegionPopover(selection) {
    renderDefectChips();
    el.popoverTimeRange.textContent = `${selection.startSec.toFixed(2)}s - ${selection.endSec.toFixed(2)}s`;
    el.popoverDefectNote.value = "";

    el.popoverChipGroup.querySelectorAll(".defect-chip").forEach(c => c.classList.remove("selected"));
    const firstChip = el.popoverChipGroup.querySelector(".defect-chip");
    if (firstChip) firstChip.classList.add("selected");

    el.regionTagPopover.classList.remove("hidden");
    const popoverWidth = 320;
    const canvasRect = el.waveformBox.getBoundingClientRect();

    const left = Math.max(10, Math.min(canvasRect.width - popoverWidth - 10, (selection.clientX || 100) - canvasRect.left - (popoverWidth / 2)));
    el.regionTagPopover.style.left = `${left}px`;
    el.regionTagPopover.style.top = "60px";
  }

  function hideRegionPopover() {
    el.regionTagPopover.classList.add("hidden");
    state.activeSelection = null;
    window.dspEngine.activeSelection = null;
    window.dspEngine.renderWaveform(el.waveformCanvas, "A");
  }

  // Save tagged defect region
  function saveActiveDefectRegion() {
    if (!state.activeSelection) return;

    const selectedChip = el.popoverChipGroup.querySelector(".defect-chip.selected");
    const errorCode = selectedChip ? selectedChip.dataset.code : "MISPRON";
    const errorLabel = selectedChip ? selectedChip.textContent.trim() : "Defect";
    const note = el.popoverDefectNote.value.trim();

    const defect = {
      id: `def-${Date.now()}`,
      startSec: state.activeSelection.startSec,
      endSec: state.activeSelection.endSec,
      startMs: Math.round(state.activeSelection.startSec * 1000),
      endMs: Math.round(state.activeSelection.endSec * 1000),
      errorCode,
      errorLabel,
      note
    };

    state.currentDefects.push(defect);
    window.dspEngine.addRegion(defect);
    renderDefectTagsList();
    hideRegionPopover();
  }

  // Remove existing tagged region
  function editExistingRegion(region) {
    if (confirm(`Remove defect tag "${region.errorLabel || region.errorCode}" (${region.startSec.toFixed(2)}s - ${region.endSec.toFixed(2)}s)?`)) {
      state.currentDefects = state.currentDefects.filter(d => d.id !== region.id);
      window.dspEngine.removeRegion(region.id);
      renderDefectTagsList();
    }
  }

  function renderDefectTagsList() {
    el.defectTagsList.innerHTML = "";

    if (state.currentDefects.length === 0) {
      el.defectTagsList.innerHTML = `<span class="text-xs text-zinc-400 italic">No defects flagged for this sample</span>`;
      return;
    }

    for (const def of state.currentDefects) {
      const badge = document.createElement("div");
      badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800";
      badge.innerHTML = `
        <span class="font-semibold">${escapeHtml(def.errorLabel || def.errorCode)}</span>
        <span class="font-mono text-red-600 text-[11px]">${def.startSec.toFixed(2)}s - ${def.endSec.toFixed(2)}s</span>
        ${def.note ? `<span class="text-red-700 italic">"${escapeHtml(def.note)}"</span>` : ""}
        <button type="button" class="ml-1 text-red-400 hover:text-red-700 font-bold cursor-pointer" title="Remove">&times;</button>
      `;

      badge.querySelector("button").addEventListener("click", () => {
        state.currentDefects = state.currentDefects.filter(d => d.id !== def.id);
        window.dspEngine.removeRegion(def.id);
        renderDefectTagsList();
      });

      el.defectTagsList.appendChild(badge);
    }
  }

  // Resolve item model ID
  function resolveItemModelId(item) {
    if (item.model_id) return item.model_id;
    if (item.audio_files_json) {
      try {
        const filesObj = typeof item.audio_files_json === "string" ? JSON.parse(item.audio_files_json) : item.audio_files_json;
        if (filesObj.model_id) return filesObj.model_id;
        const firstKey = Object.keys(filesObj)[0];
        if (filesObj[firstKey]?.model_id) {
          return filesObj[firstKey].model_id;
        }
      } catch (e) {}
    }
    return "model-voxcpm2";
  }

  // Resolve item model display name
  function resolveItemModelName(item) {
    if (item.model_name) return item.model_name;
    if (item.audio_files_json) {
      try {
        const filesObj = typeof item.audio_files_json === "string" ? JSON.parse(item.audio_files_json) : item.audio_files_json;
        if (filesObj.model_name) return filesObj.model_name;
        const firstKey = Object.keys(filesObj)[0];
        if (filesObj[firstKey]?.model_name) {
          return filesObj[firstKey].model_name;
        }
      } catch (e) {}
    }
    return "";
  }

  // Auto-save current ratings if user is jumping to another item
  async function autoSaveCurrentItem() {
    const metrics = state.campaign.metrics || [];
    const scoredKeys = Object.keys(state.currentScores);
    if (scoredKeys.length === 0 && !el.evalNotesInput.value.trim() && state.currentDefects.length === 0) {
      return; // Nothing to save
    }

    const item = state.items[state.currentIndex];
    const durationSeconds = (Date.now() - state.itemStartTime) / 1000;

    const defectTagsPayload = state.currentDefects.map(d => ({
      word_index: 0,
      word_text: "",
      error_code: d.errorCode,
      note: d.note,
      time_start_ms: d.startMs,
      time_end_ms: d.endMs
    }));

    const modelId = resolveItemModelId(item);

    const payload = {
      campaign_id: state.campaignId,
      rater_id: state.rater.id,
      item_id: item.id,
      model_id: modelId,
      scores: state.currentScores,
      blind_transcript: el.heardTranscriptInput ? el.heardTranscriptInput.value.trim() : "",
      comments: el.evalNotesInput.value.trim(),
      duration_seconds: durationSeconds,
      defect_tags: defectTagsPayload,
      asr_adjudication: state.currentAsrAdjudication || null
    };

    try {
      await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      state.existingEvaluations[item.id] = payload;
    } catch (e) {
      console.warn("Auto-save error:", e);
    }
  }

  // Submit Evaluation and Advance
  async function submitAndNext() {
    if (state.items.length === 0) return;

    if (state.campaign && state.campaign.modality === "ASR") {
      if (!state.currentAsrAdjudication) {
        showToast("Please choose whether the transcript is an Acceptable Variation or True Error.", "warning");
        return;
      }
      state.currentScores = state.currentScores || {};
      if (state.currentScores["accuracy"] === undefined) {
        state.currentScores["accuracy"] = state.currentAsrAdjudication === "ACCEPTABLE_VARIATION" ? 5 : 1;
      }
    } else {
      // Validate required questions for TTS
      const metrics = state.campaign.metrics || [];
      for (const m of metrics) {
        const mKey = m.key || m.id || m.name;
        if (state.currentScores[mKey] === undefined) {
          showToast(`Please choose a score for: ${m.label_en || m.name || mKey}`, "warning");
          return;
        }
      }
    }

    const item = state.items[state.currentIndex];
    const durationSeconds = (Date.now() - state.itemStartTime) / 1000;

    const defectTagsPayload = state.currentDefects.map(d => ({
      word_index: 0,
      word_text: "",
      error_code: d.errorCode,
      note: d.note,
      time_start_ms: d.startMs,
      time_end_ms: d.endMs
    }));

    const modelId = resolveItemModelId(item);

    const payload = {
      campaign_id: state.campaignId,
      rater_id: state.rater.id,
      item_id: item.id,
      model_id: modelId,
      scores: state.currentScores,
      blind_transcript: el.heardTranscriptInput ? el.heardTranscriptInput.value.trim() : "",
      comments: el.evalNotesInput.value.trim(),
      duration_seconds: durationSeconds,
      defect_tags: defectTagsPayload,
      asr_adjudication: state.currentAsrAdjudication || null
    };

    try {
      el.btnNextItem.disabled = true;
      const resp = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || "Failed to save evaluation");
      }

      state.existingEvaluations[item.id] = payload;

      // Check if there are other unrated items
      const nextUnrated = state.items.findIndex((it, idx) => idx > state.currentIndex && !state.existingEvaluations[it.id]);

      if (nextUnrated !== -1) {
        state.currentIndex = nextUnrated;
        renderCurrentItem();
        renderSidebar();
      } else if (state.currentIndex < state.items.length - 1) {
        state.currentIndex++;
        renderCurrentItem();
        renderSidebar();
      } else {
        // If all items are completed, finish!
        const anyUnrated = state.items.findIndex(it => !state.existingEvaluations[it.id]);
        if (anyUnrated === -1) {
          showCompletionScreen();
        } else {
          state.currentIndex = anyUnrated;
          renderCurrentItem();
          renderSidebar();
        }
      }
    } catch (err) {
      showToast("Error saving evaluation: " + err.message, "error");
    } finally {
      el.btnNextItem.disabled = false;
    }
  }

  // Navigate to previous or next item
  async function navigateItem(direction) {
    const nextIdx = state.currentIndex + direction;
    if (nextIdx >= 0 && nextIdx < state.items.length) {
      await autoSaveCurrentItem();
      state.currentIndex = nextIdx;
      renderCurrentItem();
      renderSidebar();
    }
  }

  // Show study completion screen
  function showCompletionScreen() {
    window.dspEngine.pause();
    el.evalStage.classList.add("hidden");
    el.audioSidebar.classList.add("hidden");
    el.completionScreen.classList.remove("hidden");

    el.summaryRaterName.textContent = state.rater.name || state.rater.id;
    el.summaryItemsCount.textContent = `${state.items.length} items`;

    let totalDefects = 0;
    for (const itId in state.existingEvaluations) {
      const ev = state.existingEvaluations[itId];
      if (ev.defect_tags) {
        totalDefects += ev.defect_tags.length;
      }
    }
    el.summaryDefectsCount.textContent = `${totalDefects} defects tagged`;
  }

  // Mode Navigation: Evaluation Studio vs Try Out Playground
  function switchMainMode(mode) {
    if (mode === "tryout") {
      el.evalStage.classList.add("hidden");
      el.audioSidebar.classList.add("hidden");
      el.tryoutStage.classList.remove("hidden");
      el.tabEvalMode.className = "px-3 py-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 cursor-pointer transition";
      el.tabTryoutMode.className = "px-3 py-1.5 rounded-lg bg-white text-zinc-900 shadow-2xs font-semibold cursor-pointer transition flex items-center gap-1.5";
      window.dspEngine.pause();
      initTryoutView();
    } else {
      el.tryoutStage.classList.add("hidden");
      el.evalStage.classList.remove("hidden");
      el.audioSidebar.classList.remove("hidden");
      el.tabTryoutMode.className = "px-3 py-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 cursor-pointer transition flex items-center gap-1.5";
      el.tabEvalMode.className = "px-3 py-1.5 rounded-lg bg-white text-zinc-900 shadow-2xs font-semibold cursor-pointer transition";
      window.dspEngine.pause();
      renderCurrentItem();
      renderSidebar();
    }
  }

  let tryoutInitialized = false;

  function initTryoutView() {
    if (!tryoutInitialized) {
      setupTryoutEventListeners();
      tryoutInitialized = true;
    }

    renderTryoutModelsAndSentences();
    loadTryoutAudio();
  }

  function setupTryoutEventListeners() {
    if (el.tryoutTabTts) {
      el.tryoutTabTts.addEventListener("click", () => setTryoutSubmode("tts"));
    }
    if (el.tryoutTabAsr) {
      el.tryoutTabAsr.addEventListener("click", () => setTryoutSubmode("asr"));
    }

    if (el.tryoutSentenceSelect) {
      el.tryoutSentenceSelect.addEventListener("change", (e) => {
        state.tryout.sentenceKey = e.target.value;
        loadTryoutAudio();
      });
    }

    if (el.tryoutAsrSentenceSelect) {
      el.tryoutAsrSentenceSelect.addEventListener("change", (e) => {
        renderTryoutAsrItem(e.target.value);
      });
    }

    if (el.tryoutBtnPlay) {
      el.tryoutBtnPlay.addEventListener("click", toggleTryoutPlay);
    }

    if (el.tryoutToggleSpeed) {
      el.tryoutToggleSpeed.addEventListener("click", () => {
        state.tryout.speed = state.tryout.speed === 1.0 ? 0.8 : 1.0;
        el.tryoutToggleSpeed.textContent = `${state.tryout.speed.toFixed(1)}x`;
        window.dspEngine.setSpeed(state.tryout.speed);
      });
    }
  }

  function setTryoutSubmode(submode) {
    state.tryout.submode = submode;
    window.dspEngine.pause();

    if (submode === "tts") {
      el.tryoutTtsView.classList.remove("hidden");
      el.tryoutAsrView.classList.add("hidden");
      el.tryoutTabTts.className = "px-3 py-1.5 rounded-lg bg-white text-zinc-900 shadow-2xs cursor-pointer transition font-semibold";
      el.tryoutTabAsr.className = "px-3 py-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 cursor-pointer transition";
      loadTryoutAudio();
    } else {
      el.tryoutTtsView.classList.add("hidden");
      el.tryoutAsrView.classList.remove("hidden");
      el.tryoutTabAsr.className = "px-3 py-1.5 rounded-lg bg-white text-zinc-900 shadow-2xs cursor-pointer transition font-semibold";
      el.tryoutTabTts.className = "px-3 py-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 cursor-pointer transition";
      renderTryoutAsrSentences();
    }
  }

  function renderTryoutModelsAndSentences() {
    if (!el.tryoutModelPills || !el.tryoutSentenceSelect) return;

    // Collect unique models
    const modelsMap = {};
    const sentenceKeys = new Set();
    const sentenceList = [];

    state.items.forEach(it => {
      const mId = resolveItemModelId(it);
      const mName = resolveItemModelName(it);
      if (!modelsMap[mId]) {
        modelsMap[mId] = { id: mId, name: mName };
      }

      const sKey = it.item_key || `Sample`;
      if (!sentenceKeys.has(sKey)) {
        sentenceKeys.add(sKey);
        sentenceList.push({
          key: sKey,
          text: it.text || it.source_text || it.reference_transcript || ""
        });
      }
    });

    const modelIds = Object.keys(modelsMap);
    if (!state.tryout.modelId && modelIds.length > 0) {
      state.tryout.modelId = modelIds[0];
    }

    // Render model pills
    el.tryoutModelPills.innerHTML = "";
    modelIds.forEach(mId => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isSelected = state.tryout.modelId === mId;
      btn.className = `px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition ${
        isSelected
          ? "bg-zinc-900 text-white shadow-2xs"
          : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
      }`;
      btn.textContent = modelsMap[mId].name || mId;
      btn.addEventListener("click", () => {
        state.tryout.modelId = mId;
        renderTryoutModelsAndSentences();
        loadTryoutAudio();
      });
      el.tryoutModelPills.appendChild(btn);
    });

    // Render sentence options
    el.tryoutSentenceSelect.innerHTML = "";
    sentenceList.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.key;
      opt.textContent = `${s.key}: ${(s.text || "").slice(0, 40)}...`;
      if (s.key === state.tryout.sentenceKey) {
        opt.selected = true;
      }
      el.tryoutSentenceSelect.appendChild(opt);
    });
  }

  async function loadTryoutAudio() {
    window.dspEngine.pause();
    updateTryoutPlayIcons(false);

    // Find the item matching selected model and sentence
    const matchingItem = state.items.find(it => {
      const mId = resolveItemModelId(it);
      return mId === state.tryout.modelId && it.item_key === state.tryout.sentenceKey;
    }) || state.items[0];

    if (!matchingItem) return;

    const promptText = matchingItem.text || matchingItem.source_text || matchingItem.reference_transcript || "";
    if (el.tryoutTranscriptText) {
      el.tryoutTranscriptText.textContent = promptText;
    }

    const mName = resolveItemModelName(matchingItem);
    if (el.tryoutActiveModelName) {
      el.tryoutActiveModelName.textContent = mName;
    }

    const audioUrl = resolveAudioUrl(matchingItem);
    if (!audioUrl) {
      if (el.tryoutTimeLabel) el.tryoutTimeLabel.textContent = "Audio unavailable";
      return;
    }

    const res = await window.dspEngine.loadAudio(audioUrl);
    if (res.success && el.tryoutWaveformCanvas) {
      el.tryoutTimeLabel.textContent = `0.00s / ${formatTime(res.duration)}`;
      window.dspEngine.renderWaveform(el.tryoutWaveformCanvas, "A");
      window.dspEngine.onProgressCallback = (currentTime, duration) => {
        if (el.tryoutTimeLabel) {
          el.tryoutTimeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
        }
      };
      window.dspEngine.onEndedCallback = () => {
        updateTryoutPlayIcons(false);
      };
    }
  }

  function toggleTryoutPlay() {
    if (window.dspEngine.isPlaying) {
      window.dspEngine.pause();
      updateTryoutPlayIcons(false);
    } else {
      window.dspEngine.play();
      updateTryoutPlayIcons(true);
    }
  }

  function updateTryoutPlayIcons(isPlaying) {
    if (el.tryoutIconPlay && el.tryoutIconPause) {
      el.tryoutIconPlay.classList.toggle("hidden", isPlaying);
      el.tryoutIconPause.classList.toggle("hidden", !isPlaying);
    }
    if (el.tryoutPlayBtnText) {
      el.tryoutPlayBtnText.textContent = isPlaying ? "Pause" : "Play Audio";
    }
  }

  function renderTryoutAsrSentences() {
    if (!el.tryoutAsrSentenceSelect) return;
    el.tryoutAsrSentenceSelect.innerHTML = "";

    const asrItems = state.items.filter(it => it.hypothesis_transcript || it.recognized_text || it.asr_hypothesis);
    const targetItems = asrItems.length > 0 ? asrItems : state.items.slice(0, 10);

    targetItems.forEach((it, idx) => {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = `${it.item_key || `Item ${idx + 1}`}: ${(it.reference_transcript || it.text || "").slice(0, 35)}...`;
      el.tryoutAsrSentenceSelect.appendChild(opt);
    });

    if (targetItems.length > 0) {
      renderTryoutAsrItem(targetItems[0].id);
    }
  }

  function renderTryoutAsrItem(itemId) {
    const item = state.items.find(it => it.id === itemId);
    if (!item) return;

    const ref = (item.reference_transcript || item.text || item.source_text || "").trim();
    const hyp = (item.hypothesis_transcript || item.recognized_text || item.asr_hypothesis || ref).trim();

    if (el.tryoutAsrRefText) el.tryoutAsrRefText.textContent = ref;
    if (el.tryoutAsrHypText) el.tryoutAsrHypText.textContent = hyp;

    if (el.tryoutAsrDiffContent) {
      const diff = computeKhmerDiff(ref, hyp);
      el.tryoutAsrDiffContent.innerHTML = diff.html;
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Boot on DOM ready
  document.addEventListener("DOMContentLoaded", init);

})();