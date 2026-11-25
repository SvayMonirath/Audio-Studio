/**
 * admin_app.js
 * Speech Evaluation Studio - Creator Studio & Analytics Engine.
 * Features:
 * 1. Automated multi-audio upload with 3 transcript pairing modes (inline edit, paste lines, CSV).
 * 2. 1-click question presets (Standard, Comprehensive MOS, Custom).
 * 3. 1-click demo data loader and downloadable CSV template.
 * 4. Instant shareable link generator with clipboard copy.
 * 5. Mean Opinion Score (MOS) analytics with 95% confidence intervals and defect counts.
 */

(function () {
  "use strict";

  // 19 Standardized Clinical Speech Error Taxonomies (Clear, self-explanatory English definitions)
  const CLINICAL_ERROR_CODES_19 = [
    { code: "C_DEL", label: "Consonant Deletion", desc: "A consonant sound was dropped or skipped entirely", category: "Phonetic", dot: "#EF4444" },
    { code: "C_SUB", label: "Consonant Substitution", desc: "A consonant was pronounced as a different letter", category: "Phonetic", dot: "#F97316" },
    { code: "V_DEL_INS", label: "Vowel Sound Error", desc: "A vowel was altered, substituted, or misspoken", category: "Phonetic", dot: "#DC2626" },
    { code: "CLIP_TRUNC", label: "Word Cut Off (Truncation)", desc: "The word was cut short or faded out abruptly", category: "Acoustic", dot: "#EA580C" },
    { code: "CODE", label: "Foreign Word Failure", desc: "English/foreign borrowed word failed to pronounce", category: "Language", dot: "#B91C1C" },
    { code: "GLITCH", label: "Digital Glitch / Static", desc: "Robotic buzz, clicks, pops, or digital noise burst", category: "Acoustic", dot: "#E11D48" },
    { code: "ELONG", label: "Syllable Drawn Out", desc: "A syllable is unnaturally stretched or held too long", category: "Rhythm", dot: "#F59E0B" },
    { code: "PROM", label: "Sudden Volume Spike", desc: "Volume jumps unnaturally loud or soft mid-word", category: "Acoustic", dot: "#D97706" },
    { code: "PROS", label: "Unnatural Voice Rhythm", desc: "Robotic cadence, monotone melody, or flat delivery", category: "Intonation", dot: "#84CC16" },
    { code: "SILENCE", label: "Dead Silence Gap", desc: "Unnatural empty gap of dead silence mid-sentence", category: "Acoustic", dot: "#64748B" },
    { code: "SEG", label: "Awkward Pause Gap", desc: "Hesitation or pause where speech should flow smoothly", category: "Rhythm", dot: "#06B6D4" },
    { code: "INCONSIST", label: "Voice Tone Shift", desc: "Speaker pitch or voice character changes mid-sentence", category: "Voice", dot: "#8B5CF6" },
    { code: "LEX_SUB", label: "Wrong Word Spoken", desc: "A completely different dictionary word was spoken", category: "Lexical", dot: "#A855F7" },
    { code: "REPETITION", label: "Stutter / Repetition", desc: "A syllable or word stuttered or repeated itself", category: "Fluency", dot: "#EC4899" },
    { code: "REG_FAIL", label: "Khmer Register Error", desc: "First-series (a-series) vs second-series (o-series) mistake", category: "Khmer Specific", dot: "#6366F1" },
    { code: "SUB_FAIL", label: "Subscript Consonant Error", desc: "Khmer subscript (cherng) was omitted or mispronounced", category: "Khmer Specific", dot: "#3B82F6" },
    { code: "NASAL_FAIL", label: "Nasal Sound Error", desc: "Nasal marker (nikahit / bantoc) mispronounced", category: "Khmer Specific", dot: "#0EA5E9" },
    { code: "DIALECT", label: "Unusual Accent / Dialect", desc: "Pronunciation has an unfamiliar regional accent", category: "Accent", dot: "#10B981" },
    { code: "NONE", label: "Clean Speech Sample", desc: "Zero defects detected in this audio sample", category: "Quality", dot: "#059669" }
  ];

  // State
  const state = {
    currentTab: "wizard",
    wizardStep: 1,
    maxUnlockedStep: 1,
    wizardData: {
      name: "",
      desc: "",
      instructions: "",
      modality: "TTS",
      models: [],
      items: [], // Array of { id, filename, audio_url, base64, text, model_name, model_id }
      scaleMax: 5,
      template: "standard",
      collectTranscription: true,
      defectTypes: [...CLINICAL_ERROR_CODES_19],
      criteria: [
        { id: "naturalness", name: "Naturalness", name_km: "លក្ខណៈធម្មជាតិនៃសំឡេង", desc: "Does it sound like a real human speaking?" },
        { id: "pronunciation", name: "Pronunciation Accuracy", name_km: "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង", desc: "Are vowels and consonants pronounced correctly?" }
      ],
      ui_config: {
        dsp: { phone_filter_8khz: false, speeds: [0.8, 1.0, 1.2] },
        presentation: { blind_gating: false, font_size: "32px", show_badges: true },
        tagger: { mode: "both", active_taxonomies: "all", require_note: false },
        blocks: []
      }
    },
    reconciliation: {
      matched: [],
      missingAudio: [],
      orphanAudio: [],
      pendingCsvRows: []
    },
    selectedCardId: null,
    createdCampaignId: null,
    campaignsList: []
  };

  // Module-scoped cross-closure hooks
  let updateWizardNav = () => {};
  let goToStep = () => {};
  let renderModelsChips = () => {};
  let renderItemsTable = () => {};
  let renderCanvas = () => {};
  let renderInspector = () => {};
  let updateSmartGuide = () => {};

  // LocalStorage Key for Draft Persistence
  const DRAFT_STORAGE_KEY = "audio_studio_creator_draft_v1";

  function saveWizardDraft() {
    try {
      if (state.createdCampaignId) return;
      const draft = {
        timestamp: Date.now(),
        wizardStep: state.wizardStep || 1,
        maxUnlockedStep: state.maxUnlockedStep || 1,
        wizardData: {
          name: state.wizardData.name || "",
          desc: state.wizardData.desc || "",
          instructions: state.wizardData.instructions || "",
          modality: state.wizardData.modality || "TTS",
          models: state.wizardData.models || [],
          // Strip large base64 strings so localStorage stays within browser 5MB quota
          items: (state.wizardData.items || []).map(it => ({
            id: it.id,
            filename: it.filename,
            audio_url: it.audio_url && !it.audio_url.startsWith("blob:") ? it.audio_url : "",
            model_id: it.model_id,
            model_name: it.model_name,
            text: it.text || ""
          })),
          scaleMax: state.wizardData.scaleMax || 5,
          criteria: state.wizardData.criteria || [],
          defectTypes: state.wizardData.defectTypes || [],
          ui_config: state.wizardData.ui_config || { blocks: [] }
        }
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      updateDraftIndicator();
    } catch (err) {
      console.warn("Could not save study draft to localStorage:", err);
    }
  }

  function restoreWizardDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return false;
      const draft = JSON.parse(raw);
      if (!draft || !draft.wizardData) return false;

      const currentName = (el.wizStudyName && el.wizStudyName.value.trim()) || state.wizardData.name;
      if (currentName && !draft.wizardData.name) return false;

      state.wizardStep = draft.wizardStep || 1;
      state.maxUnlockedStep = draft.maxUnlockedStep || 1;
      Object.assign(state.wizardData, draft.wizardData);

      // Populate DOM elements for Step 1
      if (el.wizStudyName && state.wizardData.name) el.wizStudyName.value = state.wizardData.name;
      if (el.wizStudyDesc && state.wizardData.desc) el.wizStudyDesc.value = state.wizardData.desc;
      if (el.wizStudyInstructions && state.wizardData.instructions) el.wizStudyInstructions.value = state.wizardData.instructions;

      // Modality selector DOM sync
      if (el.wizModalityRadios) {
        el.wizModalityRadios.forEach(radio => {
          radio.checked = radio.value === (state.wizardData.modality || "TTS");
        });
        if (state.wizardData.modality === "ASR") {
          if (el.optModalityAsr) {
            el.optModalityAsr.classList.add("border-2", "border-zinc-900", "bg-zinc-50");
            el.optModalityAsr.classList.remove("border-zinc-200", "bg-white");
          }
          if (el.optModalityTts) {
            el.optModalityTts.classList.remove("border-2", "border-zinc-900", "bg-zinc-50");
            el.optModalityTts.classList.add("border-zinc-200", "bg-white");
          }
        }
      }

      // Re-render Step 2 items table
      if (typeof renderItemsTable === "function") renderItemsTable();
      if (typeof renderModelsChips === "function") renderModelsChips();

      // Re-render Step 3 canvas
      if (typeof renderCanvas === "function") renderCanvas();
      if (typeof updateSmartGuide === "function") updateSmartGuide();

      if (typeof goToStep === "function") {
        goToStep(state.wizardStep);
      }
      updateDraftIndicator();
      return true;
    } catch (err) {
      console.warn("Failed to restore study draft:", err);
      return false;
    }
  }

  function clearWizardDraft() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      updateDraftIndicator();
    } catch (e) {}
  }

  function updateDraftIndicator() {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    const hasDraft = Boolean(raw && !state.createdCampaignId && (state.wizardData.name || (state.wizardData.items && state.wizardData.items.length > 0)));
    if (el.btnDiscardDraft) el.btnDiscardDraft.classList.toggle("hidden", !hasDraft);
    if (el.draftStatusIndicator) el.draftStatusIndicator.classList.toggle("hidden", !hasDraft);
    updateSmartTabLabel();
  }

  function updateSmartTabLabel() {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    const hasDraft = Boolean(raw && !state.createdCampaignId && (state.wizardData.name || (state.wizardData.items && state.wizardData.items.length > 0)));
    if (el.tabBtnWizardText) {
      if (hasDraft) {
        el.tabBtnWizardText.textContent = `Resume Draft (Step ${state.wizardStep || 1}/4)`;
        if (el.tabWizardIndicatorDot) el.tabWizardIndicatorDot.classList.remove("hidden");
      } else {
        el.tabBtnWizardText.textContent = "Create New Study";
        if (el.tabWizardIndicatorDot) el.tabWizardIndicatorDot.classList.add("hidden");
      }
    }
  }

  // Presets definition
  const QUESTION_PRESETS = {
    standard: [
      { id: "naturalness", name: "Naturalness", name_km: "លក្ខណៈធម្មជាតិនៃសំឡេង", desc: "Does it sound like a real human speaking?" },
      { id: "pronunciation", name: "Pronunciation Accuracy", name_km: "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង", desc: "Are vowels and consonants pronounced correctly?" }
    ],
    detailed: [
      { id: "naturalness", name: "Naturalness", name_km: "លក្ខណៈធម្មជាតិនៃសំឡេង", desc: "Human-like cadence and emotional tone without robotic buzzing" },
      { id: "pronunciation", name: "Pronunciation Accuracy", name_km: "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង", desc: "Accurate consonants, vowels, and natural word boundaries" },
      { id: "intelligibility", name: "Speech Intelligibility", name_km: "ភាពងាយស្រួលក្នុងការស្តាប់យល់", desc: "How easily words and sentences are understood without straining" },
      { id: "voice_quality", name: "Voice Quality", name_km: "គុណភាពនៃសម្លេង", desc: "Clean audio free of static, digital clicks, buzzing, or clipping" }
    ],
    custom: []
  };

  let adminPin = sessionStorage.getItem("admin_pin") || "";

  async function adminFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (adminPin) {
      options.headers["X-Admin-PIN"] = adminPin;
      options.headers["Authorization"] = `Bearer pin-${adminPin}`;
    }
    const resp = await fetch(url, options);
    if (resp.status === 401) {
      sessionStorage.removeItem("admin_pin");
      adminPin = "";
      const modal = document.getElementById("admin-pin-modal");
      const err = document.getElementById("admin-pin-error");
      if (modal) modal.classList.remove("hidden");
      if (err) {
        err.textContent = "Admin PIN required to perform this action.";
        err.classList.remove("hidden");
      }
      throw new Error("Admin authentication required.");
    }
    return resp;
  }

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

  // DOM Elements Cache
  const el = {
    // Admin PIN Elements
    adminPinModal: document.getElementById("admin-pin-modal"),
    adminPinForm: document.getElementById("admin-pin-form"),
    adminPinInput: document.getElementById("admin-pin-input"),
    adminPinError: document.getElementById("admin-pin-error"),
    btnAdminLock: document.getElementById("btn-admin-lock"),

    // Modality Selectors
    optModalityTts: document.getElementById("opt-modality-tts"),
    optModalityAsr: document.getElementById("opt-modality-asr"),
    wizModalityRadios: document.querySelectorAll('input[name="wiz-modality"]'),

    // Tabs
    tabBtnWizard: document.getElementById("tab-btn-wizard"),
    tabBtnWizardText: document.getElementById("tab-btn-wizard-text"),
    tabWizardIndicatorDot: document.getElementById("tab-wizard-indicator-dot"),
    tabBtnResults: document.getElementById("tab-btn-results"),
    tabBtnStudies: document.getElementById("tab-btn-studies"),
    viewWizard: document.getElementById("view-wizard"),
    viewResults: document.getElementById("view-results"),
    viewStudies: document.getElementById("view-studies"),

    // Wizard Nav
    wizardNavItems: document.querySelectorAll(".wizard-nav-item"),
    btnDiscardDraft: document.getElementById("btn-discard-draft"),
    draftStatusIndicator: document.getElementById("draft-status-indicator"),
    step1: document.getElementById("wizard-step-1"),
    step2: document.getElementById("wizard-step-2"),
    step3: document.getElementById("wizard-step-3"),
    step4: document.getElementById("wizard-step-4"),

    // Step 1
    wizStudyName: document.getElementById("wiz-study-name"),
    wizStudyDesc: document.getElementById("wiz-study-desc"),
    wizStudyInstructions: document.getElementById("wiz-study-instructions"),
    wizBtnStep1Next: document.getElementById("wiz-btn-step1-next"),

    // Step 2
    btnCopyAiGenPrompt: document.getElementById("btn-copy-ai-gen-prompt"),
    modalAiPromptPreview: document.getElementById("modal-ai-prompt-preview"),
    aiPromptModalTitle: document.getElementById("ai-prompt-modal-title"),
    aiPromptModalDesc: document.getElementById("ai-prompt-modal-desc"),
    aiPromptModalTextarea: document.getElementById("ai-prompt-modal-textarea"),
    aiPromptModalStatus: document.getElementById("ai-prompt-modal-status"),
    btnAiPromptModalClose: document.getElementById("btn-ai-prompt-modal-close"),
    btnAiPromptModalCloseIcon: document.getElementById("btn-ai-prompt-modal-close-icon"),
    btnAiPromptModalCopy: document.getElementById("btn-ai-prompt-modal-copy"),
    inputLocalFolderPath: document.getElementById("input-local-folder-path"),
    btnLinkLocalFolder: document.getElementById("btn-link-local-folder"),
    boxColumnFallback: document.getElementById("box-column-fallback"),
    selColText: document.getElementById("sel-col-text"),
    selColAudio: document.getElementById("sel-col-audio"),
    btnApplyCustomColumns: document.getElementById("btn-apply-custom-columns"),
    reconciliationCard: document.getElementById("reconciliation-card"),
    badgeMatchedCount: document.getElementById("badge-matched-count"),
    badgeMissingCount: document.getElementById("badge-missing-count"),
    badgeOrphanCount: document.getElementById("badge-orphan-count"),
    boxMissingDetails: document.getElementById("box-missing-details"),
    missingFilesList: document.getElementById("missing-files-list"),
    btnCopyAiFixPrompt: document.getElementById("btn-copy-ai-fix-prompt"),
    btnSkipMissingRows: document.getElementById("btn-skip-missing-rows"),
    btnDiscardOrphans: document.getElementById("btn-discard-orphans"),
    btnLoadDemoData: document.getElementById("btn-load-demo-data"),
    btnDownloadCsvTemplate: document.getElementById("btn-download-csv-template"),
    modelsChipsContainer: document.getElementById("models-chips-container"),
    btnAddModel: document.getElementById("btn-add-model"),
    boxAddModelInline: document.getElementById("box-add-model-inline"),
    inputInlineModelName: document.getElementById("input-inline-model-name"),
    btnSaveInlineModel: document.getElementById("btn-save-inline-model"),
    btnCancelInlineModel: document.getElementById("btn-cancel-inline-model"),
    selUploadTargetModel: document.getElementById("sel-upload-target-model"),
    dropzoneAudio: document.getElementById("dropzone-audio"),
    multiAudioInput: document.getElementById("multi-audio-input"),
    dropzoneUnified: document.getElementById("dropzone-unified"),
    dropzoneLoadingOverlay: document.getElementById("dropzone-loading-overlay"),
    dropzoneLoadingText: document.getElementById("dropzone-loading-text"),
    dropzoneProgressBar: document.getElementById("dropzone-progress-bar"),
    dropzoneProgressPercent: document.getElementById("dropzone-progress-percent"),
    multiFileInput: document.getElementById("multi-file-input"),
    btnToggleLocalFolder: document.getElementById("btn-toggle-local-folder"),
    boxLinkFolder: document.getElementById("box-link-folder"),
    modeBtnTable: document.getElementById("mode-btn-table"),
    modeBtnPaste: document.getElementById("mode-btn-paste"),
    modeBtnCsv: document.getElementById("mode-btn-csv"),
    boxPasteText: document.getElementById("box-paste-text"),
    pasteTextInput: document.getElementById("paste-text-input"),
    pasteLineCounter: document.getElementById("paste-line-counter"),
    btnApplyPastedText: document.getElementById("btn-apply-pasted-text"),
    boxCsvUpload: document.getElementById("box-csv-upload"),
    dropzoneCsv: document.getElementById("dropzone-csv"),
    csvFileInput: document.getElementById("csv-file-input"),
    itemsCountBadge: document.getElementById("items-count-badge"),
    itemsPreviewTbody: document.getElementById("items-preview-tbody"),
    btnClearItems: document.getElementById("btn-clear-items"),
    wizBtnStep2Prev: document.getElementById("wiz-btn-step2-prev"),
    wizBtnStep2Next: document.getElementById("wiz-btn-step2-next"),

    // Step 3 (Modular Canvas & Customize Drawer)
    btnKitMos: document.getElementById("btn-kit-mos"),
    btnKitVocab: document.getElementById("btn-kit-vocab"),
    btnKitArena: document.getElementById("btn-kit-arena"),
    btnKitBlank: document.getElementById("btn-kit-blank"),
    builderToolbox: document.getElementById("builder-toolbox"),
    builderCanvas: document.getElementById("builder-canvas"),
    drawerCustomize: document.getElementById("drawer-customize"),
    btnCloseCustomizeDrawer: document.getElementById("btn-close-customize-drawer"),
    inspectorSelectedTitle: document.getElementById("inspector-selected-title"),
    inspectorBlockBadge: document.getElementById("inspector-block-badge"),
    inspectorControlsContainer: document.getElementById("inspector-controls-container"),
    smartGuideBar: document.getElementById("smart-guide-bar"),
    guideStatusIcon: document.getElementById("guide-status-icon"),
    guideHeadline: document.getElementById("guide-headline"),
    guideTimeEstimate: document.getElementById("guide-time-estimate"),
    guideWarningText: document.getElementById("guide-warning-text"),
    wizBtnStep3Prev: document.getElementById("wiz-btn-step3-prev"),
    wizBtnStep3Next: document.getElementById("wiz-btn-step3-next"),

    // Step 4
    summaryStudyName: document.getElementById("summary-study-name"),
    summaryStudyItems: document.getElementById("summary-study-items"),
    summaryStudyCriteria: document.getElementById("summary-study-criteria"),
    summaryStudyDefects: document.getElementById("summary-study-defects"),
    summaryStudyTranscription: document.getElementById("summary-study-transcription"),
    summaryStudyScale: document.getElementById("summary-study-scale"),
    btnLaunchStudy: document.getElementById("btn-launch-study"),
    launchActionBox: document.getElementById("launch-action-box"),
    shareableLinkContainer: document.getElementById("shareable-link-container"),
    shareLinkUrl: document.getElementById("share-link-url"),
    btnCopyShareLink: document.getElementById("btn-copy-share-link"),
    btnOpenAsRater: document.getElementById("btn-open-as-rater"),
    btnCreateAnotherStudy: document.getElementById("btn-create-another-study"),
    devQuickShortcuts: document.getElementById("dev-quick-shortcuts"),
    btnViewStudyResults: document.getElementById("btn-view-study-results"),
    wizBtnStep4Prev: document.getElementById("wiz-btn-step4-prev"),

    // Results
    analyticsEmptyState: document.getElementById("analytics-empty-state"),
    analyticsDataContent: document.getElementById("analytics-data-content"),
    btnCopyEmptyResultsLink: document.getElementById("btn-copy-empty-results-link"),
    chartMosComparison: document.getElementById("chart-mos-comparison"),
    chartDefectDistribution: document.getElementById("chart-defect-distribution"),
    analyticsCampaignSelect: document.getElementById("analytics-campaign-select"),
    analyticsModelFilter: document.getElementById("analytics-model-filter"),
    analyticsRaterFilter: document.getElementById("analytics-rater-filter"),
    statPrimaryLabel: document.getElementById("stat-primary-label"),
    chartMetricSelect: document.getElementById("chart-metric-select"),
    chartMosTitle: document.getElementById("chart-mos-title"),
    chartMosSubtitle: document.getElementById("chart-mos-subtitle"),
    analyticsAsrCard: document.getElementById("analytics-asr-card"),
    analyticsAsrAcceptableCount: document.getElementById("analytics-asr-acceptable-count"),
    analyticsAsrAcceptablePct: document.getElementById("analytics-asr-acceptable-pct"),
    analyticsAsrErrorCount: document.getElementById("analytics-asr-error-count"),
    analyticsAsrErrorPct: document.getElementById("analytics-asr-error-pct"),
    analyticsAsrBar: document.getElementById("analytics-asr-bar"),
    analyticsAsrBarPct: document.getElementById("analytics-asr-bar-pct"),
    analyticsWordHeatmapTbody: document.getElementById("analytics-word-heatmap-tbody"),
    btnExportCsv: document.getElementById("btn-export-csv"),
    statTotalEvals: document.getElementById("stat-total-evals"),
    statTotalRaters: document.getElementById("stat-total-raters"),
    statMeanMos: document.getElementById("stat-mean-mos"),
    analyticsMosThead: document.getElementById("analytics-mos-thead"),
    analyticsMosTbody: document.getElementById("analytics-mos-tbody"),
    analyticsDefectsTbody: document.getElementById("analytics-defects-tbody"),
    analyticsTranscriptionsTbody: document.getElementById("analytics-transcriptions-tbody"),

    // Studies & Backup
    btnExportBackup: document.getElementById("btn-export-backup"),
    btnImportBackupTrigger: document.getElementById("btn-import-backup-trigger"),
    inputRestoreBackup: document.getElementById("input-restore-backup"),
    studiesListContainer: document.getElementById("studies-list-container"),
    btnCreateStudyShortcut: document.getElementById("btn-create-study-shortcut"),
    studiesSearchInput: document.getElementById("studies-search-input"),
    modalDeleteStudy: document.getElementById("modal-delete-study"),
    deleteStudyTitle: document.getElementById("delete-study-title"),
    deleteStudyPromptName: document.getElementById("delete-study-prompt-name"),
    deleteStudyConfirmInput: document.getElementById("delete-study-confirm-input"),
    btnCancelDelete: document.getElementById("btn-cancel-delete"),
    btnConfirmDelete: document.getElementById("btn-confirm-delete")
  };

  // Initialize
  async function init() {
    setupAdminAuth();
    setupTabSwitching();
    setupWizardFlow();
    setupAudioUploads();
    setupModularTestBuilder();
    setupLaunchAndShare();
    setupAnalytics();
    setupStudiesManagement();

    // Restore any existing unfinished study draft
    restoreWizardDraft();

    // Load active campaigns if authenticated
    if (adminPin) {
      await refreshCampaignsList();
    }
  }

  function lockAdmin() {
    sessionStorage.removeItem("admin_pin");
    adminPin = "";
    const appRoot = document.getElementById("app-root");
    const modal = document.getElementById("admin-pin-modal");
    if (appRoot) appRoot.classList.add("is-locked");
    if (modal) modal.classList.remove("hidden");
    if (el.devQuickShortcuts) el.devQuickShortcuts.classList.add("hidden");

    // Reset tabs back to login view
    const tabLogin = document.getElementById("tab-pin-login");
    const tabCreate = document.getElementById("tab-pin-create");
    const boxLogin = document.getElementById("box-pin-login");
    const boxCreate = document.getElementById("box-pin-create");
    const err = document.getElementById("admin-pin-error");
    if (err) err.classList.add("hidden");
    if (tabLogin && tabCreate) {
      tabLogin.classList.add("bg-white", "text-zinc-900", "shadow-xs");
      tabLogin.classList.remove("text-zinc-500");
      tabCreate.classList.remove("bg-white", "text-zinc-900", "shadow-xs");
      tabCreate.classList.add("text-zinc-500");
    }
    if (boxLogin) boxLogin.classList.remove("hidden");
    if (boxCreate) boxCreate.classList.add("hidden");
    
    // Clear PIN boxes and focus first
    const boxes = document.querySelectorAll(".pin-digit-box");
    boxes.forEach(b => b.value = "");
    if (boxes[0]) setTimeout(() => boxes[0].focus(), 50);
  }

  function unlockAdmin(pin) {
    adminPin = pin;
    sessionStorage.setItem("admin_pin", pin);
    const appRoot = document.getElementById("app-root");
    const modal = document.getElementById("admin-pin-modal");
    const err = document.getElementById("admin-pin-error");
    if (appRoot) appRoot.classList.remove("is-locked");
    if (modal) modal.classList.add("hidden");
    if (err) err.classList.add("hidden");

    // Developer convenience shortcuts: Only displayed for lead developer PIN 2026
    if (el.devQuickShortcuts) {
      if (pin === "2026") {
        el.devQuickShortcuts.classList.remove("hidden");
      } else {
        el.devQuickShortcuts.classList.add("hidden");
      }
    }
  }

  async function submitPin() {
    const boxes = Array.from(document.querySelectorAll(".pin-digit-box"));
    const pin = boxes.map(b => b.value.trim()).join("");
    const err = document.getElementById("admin-pin-error");
    if (pin.length < 4) {
      if (err) {
        err.textContent = "Please enter all 4 digits of your Admin PIN.";
        err.classList.remove("hidden");
      }
      return;
    }

    try {
      const resp = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const res = await resp.json();
      if (resp.ok && res.success) {
        unlockAdmin(pin);
        showToast("Admin Studio unlocked.", "success");
        await refreshCampaignsList();
        if (state.currentTab === "results") loadAnalyticsData();
        if (state.currentTab === "studies") renderStudiesView();
      } else {
        if (err) {
          err.textContent = res.error || "Invalid Admin PIN. Please try again.";
          err.classList.remove("hidden");
        }
        boxes.forEach(b => b.value = "");
        if (boxes[0]) boxes[0].focus();
      }
    } catch (e) {
      if (err) {
        err.textContent = "Unable to connect to studio server.";
        err.classList.remove("hidden");
      }
    }
  }

  function setupAdminAuth() {
    const appRoot = document.getElementById("app-root");
    const modal = document.getElementById("admin-pin-modal");

    if (!adminPin) {
      lockAdmin();
    } else {
      unlockAdmin(adminPin);
    }

    // 4-Digit Segmented PIN interaction
    const boxes = Array.from(document.querySelectorAll(".pin-digit-box"));
    boxes.forEach((box, idx) => {
      box.addEventListener("input", (e) => {
        const val = box.value.replace(/\D/g, "");
        box.value = val ? val[0] : "";
        if (box.value && idx < boxes.length - 1) {
          boxes[idx + 1].focus();
        }
        // Auto-submit when 4th digit entered
        const pin = boxes.map(b => b.value.trim()).join("");
        if (pin.length === 4) {
          submitPin();
        }
      });

      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && idx > 0) {
          boxes[idx - 1].focus();
          boxes[idx - 1].value = "";
        } else if (e.key === "ArrowLeft" && idx > 0) {
          boxes[idx - 1].focus();
        } else if (e.key === "ArrowRight" && idx < boxes.length - 1) {
          boxes[idx + 1].focus();
        }
      });

      box.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 4);
        pasted.split("").forEach((char, i) => {
          if (boxes[i]) boxes[i].value = char;
        });
        if (pasted.length === 4) {
          submitPin();
        } else if (boxes[pasted.length]) {
          boxes[pasted.length].focus();
        }
      });
    });

    if (el.adminPinForm) {
      el.adminPinForm.addEventListener("submit", (e) => {
        e.preventDefault();
        submitPin();
      });
    }

    // Modal Tabs: Unlock vs Set Admin PIN
    const tabLogin = document.getElementById("tab-pin-login");
    const tabCreate = document.getElementById("tab-pin-create");
    const boxLogin = document.getElementById("box-pin-login");
    const boxCreate = document.getElementById("box-pin-create");

    if (tabLogin && tabCreate) {
      tabLogin.addEventListener("click", () => {
        tabLogin.classList.add("bg-white", "text-zinc-900", "shadow-xs");
        tabLogin.classList.remove("text-zinc-500");
        tabCreate.classList.remove("bg-white", "text-zinc-900", "shadow-xs");
        tabCreate.classList.add("text-zinc-500");
        if (boxLogin) boxLogin.classList.remove("hidden");
        if (boxCreate) boxCreate.classList.add("hidden");
        if (boxes[0]) boxes[0].focus();
      });

      tabCreate.addEventListener("click", () => {
        tabCreate.classList.add("bg-white", "text-zinc-900", "shadow-xs");
        tabCreate.classList.remove("text-zinc-500");
        tabLogin.classList.remove("bg-white", "text-zinc-900", "shadow-xs");
        tabLogin.classList.add("text-zinc-500");
        if (boxLogin) boxLogin.classList.add("hidden");
        if (boxCreate) boxCreate.classList.remove("hidden");
      });
    }

    // Create / Update Admin PIN Form
    const regForm = document.getElementById("admin-register-form");
    if (regForm) {
      regForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("reg-admin-user")?.value.trim() || "admin";
        const currentPin = document.getElementById("reg-current-pin")?.value.trim() || "";
        const newPin = document.getElementById("reg-new-pin")?.value.trim() || "";
        const confirmPin = document.getElementById("reg-confirm-pin")?.value.trim() || "";
        const regErr = document.getElementById("reg-pin-error");
        const regSuccess = document.getElementById("reg-pin-success");

        if (regErr) regErr.classList.add("hidden");
        if (regSuccess) regSuccess.classList.add("hidden");

        if (!newPin || !newPin.match(/^\d{4}$/)) {
          if (regErr) {
            regErr.textContent = "New PIN must be exactly 4 numeric digits.";
            regErr.classList.remove("hidden");
          }
          return;
        }

        if (newPin !== confirmPin) {
          if (regErr) {
            regErr.textContent = "New PIN and confirmation PIN do not match.";
            regErr.classList.remove("hidden");
          }
          return;
        }

        try {
          const resp = await fetch("/api/admin/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Admin-PIN": currentPin || adminPin
            },
            body: JSON.stringify({
              username,
              pin: newPin,
              current_pin: currentPin || adminPin
            })
          });
          const res = await resp.json();
          if (resp.ok && res.success) {
            unlockAdmin(newPin);
            showToast("New Admin PIN successfully saved.", "success");
            await refreshCampaignsList();
          } else {
            if (regErr) {
              regErr.textContent = res.error || "Failed to set Admin PIN.";
              regErr.classList.remove("hidden");
            }
          }
        } catch (err) {
          if (regErr) {
            regErr.textContent = "Failed to connect to server.";
            regErr.classList.remove("hidden");
          }
        }
      });
    }

    if (el.btnAdminLock) {
      el.btnAdminLock.addEventListener("click", () => {
        lockAdmin();
        showToast("Admin studio locked.", "info");
      });
    }

    if (el.wizModalityRadios) {
      el.wizModalityRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
          const mod = e.target.value;
          if (mod === state.wizardData.modality) return;

          // Safety guardrail: Changing study type resets uploaded audio items
          if (state.wizardData.items && state.wizardData.items.length > 0) {
            const confirmed = window.confirm(
              "Changing the study type will clear the audio samples and pairing configured in Step 2. Do you want to proceed?"
            );
            if (!confirmed) {
              // Revert selection back to active modality
              el.wizModalityRadios.forEach(r => {
                r.checked = r.value === state.wizardData.modality;
              });
              return;
            }
            // User confirmed: clear downstream audio data
            state.wizardData.items = [];
            state.wizardData.models = [];
            state.maxUnlockedStep = 1;
            renderItemsTable();
            renderModelsChips();
            updateWizardNav();
            saveWizardDraft();
            showToast("Cleared audio samples for new study type.", "info");
          }

          state.wizardData.modality = mod;
          if (mod === "ASR") {
            if (el.optModalityAsr) {
              el.optModalityAsr.classList.add("border-2", "border-zinc-900", "bg-zinc-50");
              el.optModalityAsr.classList.remove("border-zinc-200", "bg-white");
            }
            if (el.optModalityTts) {
              el.optModalityTts.classList.remove("border-2", "border-zinc-900", "bg-zinc-50");
              el.optModalityTts.classList.add("border-zinc-200", "bg-white");
            }
          } else {
            if (el.optModalityTts) {
              el.optModalityTts.classList.add("border-2", "border-zinc-900", "bg-zinc-50");
              el.optModalityTts.classList.remove("border-zinc-200", "bg-white");
            }
            if (el.optModalityAsr) {
              el.optModalityAsr.classList.remove("border-2", "border-zinc-900", "bg-zinc-50");
              el.optModalityAsr.classList.add("border-zinc-200", "bg-white");
            }
          }
          saveWizardDraft();
        });
      });
    }
  }

  // Tab Switching
  function setupTabSwitching() {
    function switchTab(tabName) {
      state.currentTab = tabName;
      el.tabBtnWizard.classList.toggle("bg-white", tabName === "wizard");
      el.tabBtnWizard.classList.toggle("text-zinc-900", tabName === "wizard");
      el.tabBtnWizard.classList.toggle("text-zinc-600", tabName !== "wizard");

      el.tabBtnResults.classList.toggle("bg-white", tabName === "results");
      el.tabBtnResults.classList.toggle("text-zinc-900", tabName === "results");
      el.tabBtnResults.classList.toggle("text-zinc-600", tabName !== "results");

      el.tabBtnStudies.classList.toggle("bg-white", tabName === "studies");
      el.tabBtnStudies.classList.toggle("text-zinc-900", tabName === "studies");
      el.tabBtnStudies.classList.toggle("text-zinc-600", tabName !== "studies");

      el.viewWizard.classList.toggle("hidden", tabName !== "wizard");
      el.viewResults.classList.toggle("hidden", tabName !== "results");
      el.viewStudies.classList.toggle("hidden", tabName !== "studies");

      if (tabName === "results") {
        loadAnalyticsData();
      } else if (tabName === "studies") {
        renderStudiesView();
      }
    }

    el.tabBtnWizard.addEventListener("click", () => switchTab("wizard"));
    el.tabBtnResults.addEventListener("click", () => switchTab("results"));
    el.tabBtnStudies.addEventListener("click", () => switchTab("studies"));
    el.btnCreateStudyShortcut.addEventListener("click", () => switchTab("wizard"));
  }

  // Wizard Step Navigation
  function setupWizardFlow() {
    updateWizardNav = function() {
      const stepNumber = state.wizardStep || 1;
      const isStep1Done = Boolean(state.wizardData.name && state.wizardData.name.trim());
      const isStep2Done = isStep1Done && Boolean(state.wizardData.items && state.wizardData.items.length > 0);
      
      const blocks = state.wizardData.ui_config?.blocks || [];
      const activeAudio = blocks.filter(b => b.type === "audio_player");
      const activeScoring = blocks.filter(b => b.type === "scoring_questions");
      const totalQuestions = activeScoring.reduce((sum, b) => sum + (b.criteria?.length || 0), 0);
      const isStep3Done = isStep1Done && isStep2Done && activeAudio.length > 0 && totalQuestions > 0;
      const isStep4Done = Boolean(state.createdCampaignId);

      // High-water mark calculation: dynamically unlock next step when current step completes
      if (isStep3Done) {
        state.maxUnlockedStep = Math.max(state.maxUnlockedStep || 1, 4);
      } else if (isStep2Done) {
        state.maxUnlockedStep = Math.max(state.maxUnlockedStep || 1, 3);
      } else if (isStep1Done) {
        state.maxUnlockedStep = Math.max(state.maxUnlockedStep || 1, 2);
      } else {
        state.maxUnlockedStep = Math.max(state.maxUnlockedStep || 1, 1);
      }

      const completionMap = {
        1: isStep1Done,
        2: isStep2Done,
        3: isStep3Done,
        4: isStep4Done
      };

      el.wizardNavItems.forEach(item => {
        const itemStep = parseInt(item.dataset.step, 10);
        const isActive = itemStep === stepNumber;
        const isCompleted = Boolean(completionMap[itemStep]);
        const isUnlocked = itemStep <= state.maxUnlockedStep;

        item.classList.toggle("active", isActive);
        item.classList.toggle("completed", isCompleted && !isActive);
        item.classList.toggle("is-locked", !isUnlocked && !isActive);

        const subEl = item.querySelector(".wizard-step-subtitle");
        if (subEl) {
          if (itemStep === 4) {
            subEl.textContent = isStep3Done || isCompleted ? "Deploy & rater link" : "Requires Steps 1–3";
          } else if (itemStep === 3) {
            subEl.textContent = isStep2Done ? "Layout & questions" : "Requires audio in Step 2";
          } else if (itemStep === 2) {
            subEl.textContent = isStep1Done ? "Samples & models" : "Requires study name in Step 1";
          }
        }

        const badge = item.querySelector(".wizard-step-badge");
        if (badge) {
          if (isCompleted && !isActive) {
            badge.innerHTML = `<svg class="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
          } else {
            badge.textContent = itemStep;
          }
        }
      });

      updateDraftIndicator();
    };

    goToStep = function(stepNumber) {
      // Auto-save form inputs from Step 1 if filled
      if (el.wizStudyName && el.wizStudyName.value.trim()) {
        state.wizardData.name = el.wizStudyName.value.trim();
        state.wizardData.desc = el.wizStudyDesc ? el.wizStudyDesc.value.trim() : "";
        state.wizardData.instructions = el.wizStudyInstructions ? el.wizStudyInstructions.value.trim() : "";
      }

      state.wizardStep = stepNumber;
      state.maxUnlockedStep = Math.max(state.maxUnlockedStep || 1, stepNumber);
      updateWizardNav();

      el.step1.classList.toggle("hidden", stepNumber !== 1);
      el.step2.classList.toggle("hidden", stepNumber !== 2);
      el.step3.classList.toggle("hidden", stepNumber !== 3);
      el.step4.classList.toggle("hidden", stepNumber !== 4);

      if (stepNumber === 2) {
        renderItemsTable();
        renderModelsChips();
      } else if (stepNumber === 3) {
        renderCanvas();
        renderInspector();
        updateSmartGuide();
      } else if (stepNumber === 4) {
        populateSummaryStep();
      }

      saveWizardDraft();
    }

    // Live auto-save input listeners for Step 1 fields
    if (el.wizStudyName) {
      el.wizStudyName.addEventListener("input", (e) => {
        state.wizardData.name = e.target.value.trim();
        updateWizardNav();
        saveWizardDraft();
      });
    }
    if (el.wizStudyDesc) {
      el.wizStudyDesc.addEventListener("input", (e) => {
        state.wizardData.desc = e.target.value.trim();
        saveWizardDraft();
      });
    }
    if (el.wizStudyInstructions) {
      el.wizStudyInstructions.addEventListener("input", (e) => {
        state.wizardData.instructions = e.target.value.trim();
        saveWizardDraft();
      });
    }

    // Discard Draft & Start Fresh Button
    if (el.btnDiscardDraft) {
      el.btnDiscardDraft.addEventListener("click", () => {
        const confirmed = window.confirm(
          "Are you sure you want to discard your draft and start over? All entered study details, audio files, and test designs will be cleared."
        );
        if (!confirmed) return;
        resetWizardToStep1();
        showToast("Draft cleared. Starting fresh.", "info");
      });
    }

    // Step 1 -> 2
    el.wizBtnStep1Next.addEventListener("click", () => {
      const name = el.wizStudyName.value.trim();
      if (!name) {
        showToast("Please enter a study name.", "error");
        el.wizStudyName.focus();
        return;
      }
      state.wizardData.name = name;
      state.wizardData.desc = el.wizStudyDesc.value.trim();
      state.wizardData.instructions = el.wizStudyInstructions.value.trim();
      state.maxUnlockedStep = Math.max(state.maxUnlockedStep, 2);
      goToStep(2);
    });

    // Step 2 Nav
    el.wizBtnStep2Prev.addEventListener("click", () => goToStep(1));
    el.wizBtnStep2Next.addEventListener("click", () => {
      if (state.wizardData.items.length === 0) {
        showToast("Please add at least one audio file to evaluate.", "error");
        return;
      }
      state.maxUnlockedStep = Math.max(state.maxUnlockedStep, 3);
      goToStep(3);
    });

    // Step 3 Nav
    el.wizBtnStep3Prev.addEventListener("click", () => goToStep(2));
    el.wizBtnStep3Next.addEventListener("click", () => {
      const blocks = state.wizardData.ui_config.blocks || [];
      const activeAudio = blocks.filter(b => b.type === "audio_player");
      const activeScoring = blocks.filter(b => b.type === "scoring_questions");
      const totalQuestions = activeScoring.reduce((sum, b) => sum + (b.criteria?.length || 0), 0);

      if (activeAudio.length === 0) {
        showToast("Please add at least one Audio Player block to the canvas.", "error");
        return;
      }
      if (activeScoring.length === 0 || totalQuestions === 0) {
        showToast("Please add at least one Scoring Question block to the canvas.", "error");
        return;
      }

      // Sync criteria
      const allCriteria = [];
      activeScoring.forEach(b => {
        if (b.criteria) allCriteria.push(...b.criteria);
      });
      state.wizardData.criteria = allCriteria;
      state.wizardData.scaleMax = activeScoring[0]?.scale_max || 5;
      state.maxUnlockedStep = Math.max(state.maxUnlockedStep, 4);
      goToStep(4);
    });

    // Step 4 Nav
    el.wizBtnStep4Prev.addEventListener("click", () => goToStep(3));

    // Direct header step clicks: High-water mark navigation
    el.wizardNavItems.forEach(item => {
      item.addEventListener("click", () => {
        const targetStep = parseInt(item.dataset.step, 10);
        if (targetStep === state.wizardStep) return;

        // Auto-save form inputs from Step 1 if filled
        if (el.wizStudyName && el.wizStudyName.value.trim()) {
          state.wizardData.name = el.wizStudyName.value.trim();
          state.wizardData.desc = el.wizStudyDesc ? el.wizStudyDesc.value.trim() : "";
          state.wizardData.instructions = el.wizStudyInstructions ? el.wizStudyInstructions.value.trim() : "";
          saveWizardDraft();
        }

        // Strict forward progression: Cannot skip forward past highest reached & unlocked step
        if (targetStep > state.maxUnlockedStep) {
          if (targetStep === 2) {
            showToast("Please complete Step 1 (Study Name) before moving to Step 2.", "info");
            if (el.wizStudyName) el.wizStudyName.focus();
          } else if (targetStep === 3) {
            showToast("Please complete Step 2 (Upload audio samples) before designing the test stage.", "info");
          } else if (targetStep === 4) {
            showToast("Please complete Step 3 (Add Audio Player & Rating Scale) before launching.", "info");
          }
          return;
        }

        // Within high-water mark: Jump freely back or forward
        goToStep(targetStep);
      });
    });

    // Initial state calculation for wizard nav
    updateWizardNav();
    updateDraftIndicator();
  }

  function resetWizardToStep1() {
    clearWizardDraft();
    state.createdCampaignId = null;
    state.wizardStep = 1;
    state.maxUnlockedStep = 1;
    state.wizardData.name = "";
    state.wizardData.desc = "";
    state.wizardData.instructions = "";
    state.wizardData.modality = "TTS";
    state.wizardData.models = [];
    state.wizardData.items = [];
    state.wizardData.ui_config.blocks = [];
    state.selectedCardId = null;

    if (el.wizStudyName) el.wizStudyName.value = "";
    if (el.wizStudyDesc) el.wizStudyDesc.value = "";
    if (el.wizStudyInstructions) el.wizStudyInstructions.value = "";

    if (el.shareableLinkContainer) el.shareableLinkContainer.classList.add("hidden");
    if (el.launchActionBox) el.launchActionBox.classList.remove("hidden");

    if (el.wizModalityRadios) {
      el.wizModalityRadios.forEach(r => { r.checked = r.value === "TTS"; });
      if (el.optModalityTts) {
        el.optModalityTts.classList.add("border-2", "border-zinc-900", "bg-zinc-50");
        el.optModalityTts.classList.remove("border-zinc-200", "bg-white");
      }
      if (el.optModalityAsr) {
        el.optModalityAsr.classList.remove("border-2", "border-zinc-900", "bg-zinc-50");
        el.optModalityAsr.classList.add("border-zinc-200", "bg-white");
      }
    }

    if (typeof renderItemsTable === "function") renderItemsTable();
    if (typeof renderModelsChips === "function") renderModelsChips();
    if (typeof renderCanvas === "function") renderCanvas();
    if (typeof renderInspector === "function") renderInspector();
    if (typeof updateSmartGuide === "function") updateSmartGuide();
    updateDraftIndicator();
    if (typeof goToStep === "function") goToStep(1);
  }

  // Audio Uploads, Model Management & Transcript Pairing Engine
  function setupAudioUploads() {
    // Model Management
    renderModelsChips = function() {
      if (!el.modelsChipsContainer || !el.selUploadTargetModel) return;
      el.modelsChipsContainer.innerHTML = "";
      el.selUploadTargetModel.innerHTML = "";

      if (state.wizardData.models.length === 0) {
        const emptyNote = document.createElement("div");
        emptyNote.className = "inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-50 border border-zinc-200 text-xs text-zinc-500";
        emptyNote.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-zinc-300"></span>
          <span>No comparison models added (Single model evaluation)</span>
        `;
        el.modelsChipsContainer.appendChild(emptyNote);

        const defaultOpt = document.createElement("option");
        defaultOpt.value = "model-candidate";
        defaultOpt.textContent = "Candidate Voice (Default)";
        el.selUploadTargetModel.appendChild(defaultOpt);
        return;
      }

      state.wizardData.models.forEach((m, idx) => {
        // Chip
        const chip = document.createElement("div");
        chip.className = "inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-800 shadow-2xs";
        chip.innerHTML = `
          <span class="w-2 h-2 rounded-full ${idx === 0 ? "bg-emerald-500" : "bg-blue-500"}"></span>
          <span class="font-bold text-zinc-900">${escapeHtml(m.name)}</span>
          <button type="button" class="text-zinc-400 hover:text-red-600 font-bold ml-1 cursor-pointer" data-idx="${idx}">&times;</button>
        `;

        chip.querySelector("button").addEventListener("click", () => {
          state.wizardData.models.splice(idx, 1);
          renderModelsChips();
          renderItemsTable();
        });
        el.modelsChipsContainer.appendChild(chip);

        // Option
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        el.selUploadTargetModel.appendChild(opt);
      });
    }

    // Inline Add Model Flow (No raw browser prompt)
    if (el.btnAddModel && el.boxAddModelInline) {
      el.btnAddModel.addEventListener("click", () => {
        el.boxAddModelInline.classList.remove("hidden");
        el.boxAddModelInline.classList.add("flex");
        el.btnAddModel.classList.add("hidden");
        el.inputInlineModelName.value = "";
        el.inputInlineModelName.focus();
      });

      el.btnCancelInlineModel.addEventListener("click", () => {
        el.boxAddModelInline.classList.add("hidden");
        el.boxAddModelInline.classList.remove("flex");
        el.btnAddModel.classList.remove("hidden");
        el.inputInlineModelName.value = "";
      });

      const handleAddInlineModel = () => {
        const val = el.inputInlineModelName.value.trim();
        if (!val) {
          showToast("Please enter a model name.", "error");
          el.inputInlineModelName.focus();
          return;
        }
        const id = `model-${Date.now()}-${Math.floor(Math.random() * 100)}`;
        state.wizardData.models.push({ id, name: val });
        renderModelsChips();
        el.boxAddModelInline.classList.add("hidden");
        el.boxAddModelInline.classList.remove("flex");
        el.btnAddModel.classList.remove("hidden");
        el.inputInlineModelName.value = "";
        showToast(`Model "${val}" added!`, "success");
      };

      el.btnSaveInlineModel.addEventListener("click", handleAddInlineModel);
      el.inputInlineModelName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleAddInlineModel();
        if (e.key === "Escape") el.btnCancelInlineModel.click();
      });
    }

    renderModelsChips();

    // Dropzone Loading Overlay Control
    function setDropzoneLoading(loading, message = "Processing files...", percent = null) {
      if (!el.dropzoneLoadingOverlay || !el.dropzoneUnified) return;
      if (loading) {
        if (el.dropzoneLoadingText) el.dropzoneLoadingText.textContent = message;
        if (el.dropzoneProgressBar) {
          el.dropzoneProgressBar.style.width = percent !== null ? `${Math.min(100, Math.max(0, percent))}%` : "100%";
        }
        if (el.dropzoneProgressPercent) {
          el.dropzoneProgressPercent.textContent = percent !== null ? `${Math.round(percent)}%` : "Working...";
        }
        el.dropzoneLoadingOverlay.classList.remove("hidden");
        el.dropzoneUnified.classList.add("pointer-events-none");
      } else {
        if (el.dropzoneProgressBar) el.dropzoneProgressBar.style.width = "0%";
        if (el.dropzoneProgressPercent) el.dropzoneProgressPercent.textContent = "0%";
        el.dropzoneLoadingOverlay.classList.add("hidden");
        el.dropzoneUnified.classList.remove("pointer-events-none");
      }
    }

    // Process Batch Audio Files
    async function processAudioFiles(files) {
      if (!files || files.length === 0) return;

      const targetModelId = el.selUploadTargetModel ? el.selUploadTargetModel.value : null;
      const targetModelObj = (state.wizardData.models && state.wizardData.models.find(m => m.id === targetModelId)) 
        || (state.wizardData.models && state.wizardData.models[0])
        || { id: "model-candidate", name: "Candidate Voice" };

      const audioFilesToProcess = files.filter(f => f.name.match(/\.(wav|mp3|ogg|flac|m4a)$/i));
      const total = audioFilesToProcess.length;
      if (total === 0) return;

      setDropzoneLoading(true, `Reading audio samples (1 of ${total})...`, 5);

      let pairedCount = 0;
      let addedNewCount = 0;
      try {
        for (let i = 0; i < total; i++) {
          const file = audioFilesToProcess[i];
          const pct = Math.round(((i + 1) / total) * 100);
          setDropzoneLoading(true, `Reading audio samples (${i + 1} of ${total})...`, pct);

          const base64Str = await readFileAsBase64(file);
          const blobUrl = URL.createObjectURL(file);
          const fStem = normalizeStem(file.name);

          // Check if an existing item in wizardData is awaiting audio and matches this stem
          const pendingItem = state.wizardData.items.find(it => {
            if (!it.awaiting_audio) return false;
            const itStem = normalizeStem(it.filename || it.item_key);
            return itStem === fStem || itStem.startsWith(fStem + "_") || fStem.startsWith(itStem + "_");
          });

          if (pendingItem) {
            pendingItem.audio_url = blobUrl;
            pendingItem.base64 = base64Str;
            pendingItem.awaiting_audio = false;
            pairedCount++;
          } else {
            state.wizardData.items.push({
              id: `item-up-${Date.now()}-${i}`,
              filename: file.name,
              item_key: file.name.replace(/\.[^/.]+$/, ""),
              audio_url: blobUrl,
              base64: base64Str,
              model_id: targetModelObj.id || "model-candidate",
              model_name: targetModelObj.name || "Candidate Voice",
              text: "",
              awaiting_audio: false
            });
            addedNewCount++;
          }
        }

        renderItemsTable();
        if (pairedCount > 0 && addedNewCount === 0) {
          showToast(`Successfully paired all ${pairedCount} audio files with transcripts!`, "success");
        } else if (pairedCount > 0 && addedNewCount > 0) {
          showToast(`Paired ${pairedCount} audio files with transcripts and added ${addedNewCount} new samples.`, "success");
        } else {
          showToast(`Loaded ${addedNewCount} audio samples.`, "success");
        }

        // Automatically reconcile if user uploaded transcripts first
        if (state.reconciliation.pendingCsvRows && state.reconciliation.pendingCsvRows.length > 0) {
          reconcileAudioAndText(state.reconciliation.pendingCsvRows);
        }
      } finally {
        setDropzoneLoading(false);
      }
    }

    // Audio dropzone handling
    if (el.dropzoneAudio) {
      el.dropzoneAudio.addEventListener("click", () => el.multiAudioInput.click());
      el.dropzoneAudio.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.dropzoneAudio.classList.add("border-zinc-900", "bg-zinc-100/70");
      });
      el.dropzoneAudio.addEventListener("dragleave", () => {
        el.dropzoneAudio.classList.remove("border-zinc-900", "bg-zinc-100/70");
      });
      el.dropzoneAudio.addEventListener("drop", (e) => {
        e.preventDefault();
        el.dropzoneAudio.classList.remove("border-zinc-900", "bg-zinc-100/70");
        if (e.dataTransfer && e.dataTransfer.files) {
          processAudioFiles(Array.from(e.dataTransfer.files));
        }
      });
    }

    // Multi-audio file selection via input
    el.multiAudioInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      await processAudioFiles(files);
      el.multiAudioInput.value = "";
    });

    // Download Sample CSV Template
    el.btnDownloadCsvTemplate.addEventListener("click", () => {
      const sampleCsv = "audio_filename,transcript_text,model_name\nKH01_Veaja.wav,អាឡូ សួស្តីបង!,Veaja AI (Ours)\nKH01_MMS.wav,អាឡូ សួស្តីបង!,Meta MMS-TTS\nKH02_Veaja.wav,សួស្តីបង មានអីឲ្យខ្ញុំជួយបានខ្លះ?,Veaja AI (Ours)\nKH02_MMS.wav,សួស្តីបង មានអីឲ្យខ្ញុំជួយបានខ្លះ?,Meta MMS-TTS";
      const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "speech_evaluation_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    // Load Demo Data (Optional / If present)
    if (el.btnLoadDemoData) {
      el.btnLoadDemoData.addEventListener("click", () => {
        state.wizardData.models = [
          { id: "model-veaja", name: "Veaja AI (Ours)" },
          { id: "model-mms", name: "Meta MMS-TTS" }
        ];
        renderModelsChips();

        state.wizardData.items = [
          {
            id: "item-demo-1",
            filename: "KH01_Greeting_Veaja.wav",
            audio_url: "/audio/openbmb-voxcpm2/run_20261022_225128/audio/KH01.wav",
            model_id: "model-veaja",
            model_name: "Veaja AI (Ours)",
            text: "អាឡូ សួស្តីបង!"
          },
          {
            id: "item-demo-2",
            filename: "KH02_Assistance_MMS.wav",
            audio_url: "/audio/facebook-mms-tts-khm/run_20261020_165836/audio/KH02.wav",
            model_id: "model-mms",
            model_name: "Meta MMS-TTS",
            text: "សួស្តីបង មានអីឲ្យខ្ញុំជួយបានខ្លះ?"
          },
          {
            id: "item-demo-3",
            filename: "KH03_MenuOrder_Veaja.wav",
            audio_url: "/audio/openbmb-voxcpm2/run_20261022_225128/audio/KH03.wav",
            model_id: "model-veaja",
            model_name: "Veaja AI (Ours)",
            text: "ខ្ញុំចង់កុម្ម៉ង់បាយឆាសាច់មាន់មួយចាន និងតែទឹកដោះគោមួយកែវ"
          }
        ];
        renderItemsTable();
      });
    }

    // Transcript Modes Toggles
    el.modeBtnTable.addEventListener("click", () => setTranscriptMode("table"));
    el.modeBtnPaste.addEventListener("click", () => setTranscriptMode("paste"));
    el.modeBtnCsv.addEventListener("click", () => setTranscriptMode("csv"));

    function setTranscriptMode(mode) {
      el.modeBtnTable.classList.toggle("bg-zinc-900", mode === "table");
      el.modeBtnTable.classList.toggle("text-white", mode === "table");
      el.modeBtnTable.classList.toggle("bg-white", mode !== "table");
      el.modeBtnTable.classList.toggle("text-zinc-700", mode !== "table");

      el.modeBtnPaste.classList.toggle("bg-zinc-900", mode === "paste");
      el.modeBtnPaste.classList.toggle("text-white", mode === "paste");
      el.modeBtnPaste.classList.toggle("bg-white", mode !== "paste");
      el.modeBtnPaste.classList.toggle("text-zinc-700", mode !== "paste");

      el.modeBtnCsv.classList.toggle("bg-zinc-900", mode === "csv");
      el.modeBtnCsv.classList.toggle("text-white", mode === "csv");
      el.modeBtnCsv.classList.toggle("bg-white", mode !== "csv");
      el.modeBtnCsv.classList.toggle("text-zinc-700", mode !== "csv");

      el.boxPasteText.classList.toggle("hidden", mode !== "paste");
      el.boxCsvUpload.classList.toggle("hidden", mode !== "csv");
    }

    // Paste line counter
    if (el.pasteTextInput && el.pasteLineCounter) {
      el.pasteTextInput.addEventListener("input", (e) => {
        const lines = e.target.value.split("\n").map(l => l.trim()).filter(Boolean);
        el.pasteLineCounter.textContent = `${lines.length} lines (${state.wizardData.items.length} audio files)`;
      });
    }

    // Apply pasted lines to items in order
    el.btnApplyPastedText.addEventListener("click", () => {
      const text = el.pasteTextInput.value.trim();
      if (!text) {
        showToast("Please paste some text lines.", "error");
        return;
      }
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      if (state.wizardData.items.length === 0) {
        showToast("Please select your audio files first, then paste the matching lines.", "error");
        return;
      }

      const matchCount = Math.min(lines.length, state.wizardData.items.length);
      for (let i = 0; i < matchCount; i++) {
        state.wizardData.items[i].text = lines[i];
      }

      renderItemsTable();
      showToast(`Applied transcripts to ${matchCount} audio files.`, "success");
    });

    // Smart CSV parsing and line splitting
    function parseCsvLine(line) {
      const parts = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      return parts.map(p => p.replace(/^["']|["']$/g, "").trim());
    }

    function parseCsvSmart(content) {
      // 1. Strip UTF-8 BOM
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }

      // Check for UTF-8 encoding failure (replacement character U+FFFD)
      if (content.includes("\uFFFD")) {
        showToast("Warning: Non-UTF8 characters detected. Please ensure CSV is saved in UTF-8 format.", "error");
      }

      const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (rawLines.length < 2) {
        showToast("CSV file must have a header row and at least 1 data row.", "error");
        return null;
      }

      const headers = parseCsvLine(rawLines[0]);
      const headerLower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));

      // Candidates with strict priority: distinguish audio filename from item ID
      const textCandidates = ["text", "tts_input", "prompt", "sentence", "transcript", "khmer_text", "transcript_text", "expected_text"];
      const audioCandidates = ["audio_file", "audio_filename", "audio_url", "wav", "audio", "filename", "file"];
      const idCandidates = ["id", "item_id", "sentence_id", "word_id", "key", "trial_id", "prompt_id"];
      const modelCandidates = ["model", "model_name", "model_id", "system", "engine"];

      let textColIdx = headerLower.findIndex(h => textCandidates.includes(h));
      let audioColIdx = headerLower.findIndex(h => audioCandidates.includes(h));
      let idColIdx = headerLower.findIndex(h => idCandidates.includes(h));
      let modelColIdx = headerLower.findIndex(h => modelCandidates.includes(h));

      // If audio column not found by specific audio terms, check id column as audio name fallback
      if (audioColIdx === -1 && idColIdx !== -1) {
        audioColIdx = idColIdx;
      }

      const rows = [];
      for (let i = 1; i < rawLines.length; i++) {
        const parts = parseCsvLine(rawLines[i]);
        if (parts.length > 0) {
          const rowObj = {};
          headers.forEach((h, idx) => {
            rowObj[h] = parts[idx] !== undefined ? parts[idx] : "";
          });
          rows.push({ parts, rowObj });
        }
      }

      // If cannot auto-detect text or audio column, show fallback selector
      if (textColIdx === -1 || audioColIdx === -1) {
        state.reconciliation.rawParsedRows = rows;
        if (el.boxColumnFallback && el.selColText && el.selColAudio) {
          el.selColText.innerHTML = headers.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
          el.selColAudio.innerHTML = headers.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
          el.boxColumnFallback.classList.remove("hidden");
          showToast("Custom CSV headers detected. Please select matching columns below.", "info");
        }
        return null;
      }

      const textColName = headers[textColIdx];
      const audioColName = headers[audioColIdx];
      const idColName = idColIdx !== -1 ? headers[idColIdx] : null;
      const modelColName = modelColIdx !== -1 ? headers[modelColIdx] : null;

      return rows.map(r => ({
        itemId: idColName ? r.rowObj[idColName] : "",
        audioFilename: r.rowObj[audioColName] || (idColName ? r.rowObj[idColName] : ""),
        text: r.rowObj[textColName] || "",
        model: modelColName ? (r.rowObj[modelColName] || "") : ""
      }));
    }

    function applyParsedCsvRows(parsedRows, textColName, audioColName) {
      const standardized = parsedRows.map(r => ({
        itemId: r.rowObj["id"] || r.rowObj["item_id"] || "",
        audioFilename: r.rowObj[audioColName] || "",
        text: r.rowObj[textColName] || "",
        model: r.rowObj["model"] || r.rowObj["model_name"] || ""
      }));
      reconcileAudioAndText(standardized);
    }

    function normalizeStem(name) {
      if (!name) return "";
      // Strip folder path, extension, and lowercase
      const base = name.split("/").pop().split("\\").pop();
      return base.replace(/\.(wav|mp3|ogg|flac|m4a)$/i, "").toLowerCase().trim();
    }

    function reconcileAudioAndText(csvRows) {
      state.reconciliation.pendingCsvRows = csvRows;
      const matched = [];
      const missingAudio = [];
      const orphanAudio = [];

      const currentItems = state.wizardData.items;

      // If user uploaded CSV before audio files, populate items directly so table and progress give 100% feedback!
      if (!currentItems || currentItems.length === 0) {
        state.wizardData.items = csvRows.map((r, idx) => {
          let foundModel = r.model ? state.wizardData.models.find(m => m.name.toLowerCase() === r.model.toLowerCase()) : null;
          if (!foundModel && r.model) {
            foundModel = { id: `model-${Date.now()}-${state.wizardData.models.length + 1}`, name: r.model };
            state.wizardData.models.push(foundModel);
          }
          const defaultModel = state.wizardData.models[0] || { id: "model-candidate", name: "Candidate Voice" };
          return {
            id: `item-csv-${Date.now()}-${idx}`,
            item_key: r.itemId || r.audioFilename || `W${idx + 1}`,
            filename: r.audioFilename ? (r.audioFilename.endsWith(".wav") ? r.audioFilename : `${r.audioFilename}.wav`) : `${r.itemId || `sample_${idx + 1}`}.wav`,
            text: r.text || "",
            model_id: foundModel ? foundModel.id : defaultModel.id,
            model_name: foundModel ? foundModel.name : defaultModel.name,
            audio_url: "",
            awaiting_audio: true
          };
        });
        renderModelsChips();
        renderItemsTable();
        showToast(`Loaded ${csvRows.length} transcript items from CSV. Drop audio folder now to attach WAV files.`, "success");
        return;
      }

      const usedItemIndices = new Set();

      csvRows.forEach(row => {
        const rawName = row.audioFilename.trim();
        const stem = normalizeStem(rawName);

        // Find match in current items
        let matchedIdx = -1;
        for (let i = 0; i < currentItems.length; i++) {
          if (usedItemIndices.has(i)) continue;
          const itName = currentItems[i].filename;
          const itStem = normalizeStem(itName);

          // 1. Exact filename match
          if (itName.toLowerCase() === rawName.toLowerCase() || itName.toLowerCase() === `${rawName.toLowerCase()}.wav`) {
            matchedIdx = i;
            break;
          }
          // 2. Stem match
          if (itStem === stem) {
            matchedIdx = i;
            break;
          }
          // 3. Prefix match (e.g. S01 matches S01_Greeting.wav)
          if (itStem.startsWith(stem + "_") || itStem.startsWith(stem + "-")) {
            matchedIdx = i;
            break;
          }
        }

        if (matchedIdx !== -1) {
          usedItemIndices.add(matchedIdx);
          const it = currentItems[matchedIdx];
          it.text = row.text || it.text;
          if (row.model) {
            let foundModel = state.wizardData.models.find(m => m.name.toLowerCase() === row.model.toLowerCase());
            if (!foundModel) {
              foundModel = { id: `model-${Date.now()}-${Math.floor(Math.random() * 100)}`, name: row.model };
              state.wizardData.models.push(foundModel);
              renderModelsChips();
            }
            it.model_id = foundModel.id;
            it.model_name = foundModel.name;
          }
          matched.push(it);
        } else {
          missingAudio.push({
            expectedFilename: rawName,
            text: row.text,
            model: row.model
          });
        }
      });

      // Find orphans: items in wizardData that were never matched with a CSV row
      currentItems.forEach((it, idx) => {
        if (!usedItemIndices.has(idx)) {
          orphanAudio.push(it);
        }
      });

      state.reconciliation.matched = matched;
      state.reconciliation.missingAudio = missingAudio;
      state.reconciliation.orphanAudio = orphanAudio;

      updateReconciliationCard();
      renderItemsTable();
      showToast(`Reconciliation: ${matched.length} paired, ${missingAudio.length} missing audio.`, missingAudio.length > 0 ? "info" : "success");
    }

    function updateReconciliationCard() {
      if (!el.reconciliationCard) return;

      const { matched, missingAudio, orphanAudio } = state.reconciliation;
      const totalPaired = matched.length;

      el.reconciliationCard.classList.remove("hidden");
      el.badgeMatchedCount.textContent = `${totalPaired} Matched`;

      if (missingAudio.length > 0) {
        el.badgeMissingCount.textContent = `${missingAudio.length} Missing Audio`;
        el.badgeMissingCount.classList.remove("hidden");
        el.boxMissingDetails.classList.remove("hidden");
        el.missingFilesList.innerHTML = missingAudio.map(m => `<li>- Missing: <span class="text-zinc-900 font-semibold">${escapeHtml(m.expectedFilename)}</span> ("${escapeHtml(m.text || "").substring(0, 30)}...")</li>`).join("");
      } else {
        el.badgeMissingCount.classList.add("hidden");
        el.boxMissingDetails.classList.add("hidden");
      }

      if (orphanAudio.length > 0) {
        el.badgeOrphanCount.textContent = `${orphanAudio.length} Unpaired Files`;
        el.badgeOrphanCount.classList.remove("hidden");
        if (el.btnDiscardOrphans) el.btnDiscardOrphans.classList.remove("hidden");
      } else {
        el.badgeOrphanCount.classList.add("hidden");
        if (el.btnDiscardOrphans) el.btnDiscardOrphans.classList.add("hidden");
      }
    }

    // CSV File Processing Helper
    async function processCsvFile(file) {
      if (!file) return;

      setDropzoneLoading(true, "Reading and parsing CSV transcript...");
      if (el.dropzoneProgressBar) el.dropzoneProgressBar.style.width = "20%";
      if (el.dropzoneProgressPercent) el.dropzoneProgressPercent.textContent = "20%";
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            setDropzoneLoading(true, "Parsing CSV columns and rows...", 50);
            await new Promise(r => setTimeout(r, 40));
            const content = evt.target.result;
            const parsedRows = parseCsvSmart(content);
            if (parsedRows) {
              setDropzoneLoading(true, `Reconciling ${parsedRows.length} rows with audio...`, 80);
              await new Promise(r => setTimeout(r, 40));
              reconcileAudioAndText(parsedRows);
              setDropzoneLoading(true, "Pairing complete!", 100);
              await new Promise(r => setTimeout(r, 120));
            }
          } finally {
            setDropzoneLoading(false);
            resolve();
          }
        };
        reader.onerror = () => {
          setDropzoneLoading(false);
          resolve();
        };
        reader.readAsText(file);
      });
    }

    // Unified File Handler for Audio and CSV
    async function handleUnifiedFiles(files) {
      if (!files || files.length === 0) return;

      const audioFiles = [];
      const csvFiles = [];

      for (const f of files) {
        if (f.name.match(/\.(wav|mp3|ogg|flac|m4a)$/i)) {
          audioFiles.push(f);
        } else if (f.name.match(/\.(csv|txt)$/i)) {
          csvFiles.push(f);
        }
      }

      try {
        if (audioFiles.length > 0 && csvFiles.length === 0) {
          await processAudioFiles(audioFiles);
        } else if (audioFiles.length === 0 && csvFiles.length > 0) {
          setDropzoneLoading(true, "Reading transcript file...");
          await processCsvFile(csvFiles[0]);
        } else if (audioFiles.length > 0 && csvFiles.length > 0) {
          setDropzoneLoading(true, `Reading audio samples (1 of ${audioFiles.length})...`);
          await processAudioFiles(audioFiles);
          setDropzoneLoading(true, "Reconciling audio samples with transcript...");
          await processCsvFile(csvFiles[0]);
        }
      } finally {
        setDropzoneLoading(false);
      }
    }

    // Unified Dropzone and File Input Wiring
    if (el.dropzoneUnified) {
      el.dropzoneUnified.addEventListener("click", () => {
        if (el.multiFileInput) el.multiFileInput.click();
      });
      el.dropzoneUnified.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.dropzoneUnified.classList.add("border-zinc-900", "bg-zinc-100/70");
      });
      el.dropzoneUnified.addEventListener("dragleave", () => {
        el.dropzoneUnified.classList.remove("border-zinc-900", "bg-zinc-100/70");
      });
      el.dropzoneUnified.addEventListener("drop", async (e) => {
        e.preventDefault();
        el.dropzoneUnified.classList.remove("border-zinc-900", "bg-zinc-100/70");
        if (e.dataTransfer && e.dataTransfer.files) {
          await handleUnifiedFiles(Array.from(e.dataTransfer.files));
        }
      });
    }

    if (el.multiFileInput) {
      el.multiFileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files);
        await handleUnifiedFiles(files);
        el.multiFileInput.value = "";
      });
    }

    // Toggle Local Folder Linking Disclosure
    if (el.btnToggleLocalFolder && el.boxLinkFolder) {
      el.btnToggleLocalFolder.addEventListener("click", () => {
        el.boxLinkFolder.classList.toggle("hidden");
      });
    }

    // CSV Dropzone & Input wiring
    if (el.dropzoneCsv) {
      el.dropzoneCsv.addEventListener("click", () => el.csvFileInput.click());
      el.dropzoneCsv.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.dropzoneCsv.classList.add("border-zinc-900", "bg-zinc-50");
      });
      el.dropzoneCsv.addEventListener("dragleave", () => {
        el.dropzoneCsv.classList.remove("border-zinc-900", "bg-zinc-50");
      });
      el.dropzoneCsv.addEventListener("drop", (e) => {
        e.preventDefault();
        el.dropzoneCsv.classList.remove("border-zinc-900", "bg-zinc-50");
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          processCsvFile(e.dataTransfer.files[0]);
        }
      });
    }

    el.csvFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) processCsvFile(file);
      el.csvFileInput.value = "";
    });

    // Clear all items
    el.btnClearItems.addEventListener("click", () => {
      if (confirm("Remove all audio files from this study?")) {
        state.wizardData.items = [];
        state.reconciliation = { matched: [], missingAudio: [], orphanAudio: [], pendingCsvRows: [] };
        if (el.reconciliationCard) el.reconciliationCard.classList.add("hidden");
        renderItemsTable();
        showToast("Cleared all audio samples.");
      }
    });

    // Smart Local Folder Linking
    if (el.btnLinkLocalFolder && el.inputLocalFolderPath) {
      el.btnLinkLocalFolder.addEventListener("click", async () => {
        const folderPath = el.inputLocalFolderPath.value.trim();
        if (!folderPath) {
          showToast("Please enter a relative folder path on the server (e.g. audio).", "error");
          el.inputLocalFolderPath.focus();
          return;
        }

        try {
          el.btnLinkLocalFolder.disabled = true;
          el.btnLinkLocalFolder.textContent = "Scanning...";

          const resp = await adminFetch("/api/link-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder_path: folderPath })
          });
          const res = await resp.json();

          if (resp.ok && res.success) {
            const files = res.files || [];
            if (files.length === 0) {
              showToast(`No audio files found in "${folderPath}".`, "error");
              return;
            }

            const targetModelId = el.selUploadTargetModel ? el.selUploadTargetModel.value : null;
            const targetModelObj = (state.wizardData.models && state.wizardData.models.find(m => m.id === targetModelId))
              || (state.wizardData.models && state.wizardData.models[0])
              || { id: "model-candidate", name: "Candidate Voice" };

            let added = 0;
            files.forEach((f, idx) => {
              // Avoid duplicates
              const exists = state.wizardData.items.some(it => it.filename === f.filename);
              if (!exists) {
                state.wizardData.items.push({
                  id: `item-link-${Date.now()}-${idx}`,
                  filename: f.filename,
                  audio_url: f.audio_url || f.url || "",
                  model_id: targetModelObj?.id || "model-candidate",
                  model_name: targetModelObj?.name || "Candidate Voice",
                  text: ""
                });
                added++;
              }
            });

            if (state.reconciliation.pendingCsvRows.length > 0) {
              reconcileAudioAndText(state.reconciliation.pendingCsvRows);
            } else {
              renderItemsTable();
            }
            showToast(`Linked ${added} audio files from "${folderPath}".`, "success");
          } else {
            showToast(res.error || "Failed to link folder.", "error");
          }
        } catch (e) {
          showToast("Network error linking folder: " + e.message, "error");
        } finally {
          el.btnLinkLocalFolder.disabled = false;
          el.btnLinkLocalFolder.textContent = "Link Folder";
        }
      });
    }

    // Transparent AI Prompt Modal Helper
    function openAiPromptModal(title, description, text) {
      if (!el.modalAiPromptPreview) return;
      if (el.aiPromptModalTitle) el.aiPromptModalTitle.textContent = title;
      if (el.aiPromptModalDesc) el.aiPromptModalDesc.textContent = description;
      if (el.aiPromptModalTextarea) el.aiPromptModalTextarea.value = text;
      if (el.aiPromptModalStatus) el.aiPromptModalStatus.classList.add("hidden");
      el.modalAiPromptPreview.classList.remove("hidden");
    }

    function closeAiPromptModal() {
      if (!el.modalAiPromptPreview) return;
      el.modalAiPromptPreview.classList.add("hidden");
    }

    if (el.btnAiPromptModalClose) el.btnAiPromptModalClose.addEventListener("click", closeAiPromptModal);
    if (el.btnAiPromptModalCloseIcon) el.btnAiPromptModalCloseIcon.addEventListener("click", closeAiPromptModal);
    if (el.modalAiPromptPreview) {
      el.modalAiPromptPreview.addEventListener("click", (e) => {
        if (e.target === el.modalAiPromptPreview) closeAiPromptModal();
      });
    }

    if (el.btnAiPromptModalCopy) {
      el.btnAiPromptModalCopy.addEventListener("click", async () => {
        const text = el.aiPromptModalTextarea ? el.aiPromptModalTextarea.value : "";
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          if (el.aiPromptModalStatus) {
            el.aiPromptModalStatus.textContent = "Copied to clipboard!";
            el.aiPromptModalStatus.classList.remove("hidden");
          }
          showToast("Prompt copied to clipboard!", "success");
        } catch (e) {
          showToast("Copy failed. Please manually copy from preview box.", "error");
        }
      });
    }

    // AI Helper Prompt 1: Audio Dataset Preparation for AI Coding Agents
    if (el.btnCopyAiGenPrompt) {
      el.btnCopyAiGenPrompt.addEventListener("click", () => {
        const title = "AI Agent Prompt: Prepare & Align Audio Dataset";
        const desc = "Give this prompt to Claude Code, Codex, Antigravity, or your AI coding assistant. It instructs the agent to scan your existing audio files and text, standardize them to 16kHz mono WAV, and build the aligned CSV.";
        
        const existingModelNames = state.wizardData.models.map(m => m.name);
        let modelRequirementText = "";
        let sampleCsvText = "";

        if (existingModelNames.length > 0) {
          modelRequirementText = `- Compare these specific models: ${existingModelNames.map(m => `"${m}"`).join(", ")}.
   - Group or tag audio samples under these model names.`;
          sampleCsvText = existingModelNames.map((name, i) => `S01_Item${i + 1}.wav,"Sample transcript text here",${name}`).join("\n");
        } else {
          modelRequirementText = `- Auto-detect models from subfolder names (e.g. /model_a/, /model_b/) or filename prefixes/suffixes.
   - If only 1 voice or model exists, use a descriptive name like "Candidate Model".`;
          sampleCsvText = `S01_ModelA.wav,"Sample transcript text here",Model A\nS01_ModelB.wav,"Sample transcript text here",Model B`;
        }

        const promptText = `I have audio files and text transcripts on my computer that I need to prepare for Speech Evaluation Studio.
Please inspect my workspace and write/execute a Python script to organize, normalize, and align my dataset.

### MY CURRENT RAW DATA SETUP:
- My audio files are located in: [INSERT PATH TO YOUR AUDIO FOLDER OR SUBFOLDERS]
  (Common formats: /model_a/*.wav, /model_b/*.wav, OR flat files like item01_model_a.wav)
- My matching text transcripts are located in: [INSERT PATH TO TEXT FILE, CSV, JSON, OR PASTE HERE]

### TASK REQUIREMENTS:
1. Model Detection & Tagging:
   ${modelRequirementText}

2. Standardize Audio Format:
   - Convert all audio clips to standard evaluation format: WAV, 16,000 Hz sample rate, single channel (mono), 16-bit PCM.
   - Save the cleaned audio into a new directory: \`./output_clean/audio/\` (do not alter or overwrite my original files).
   - Use clean, collision-free filenames: \`[ITEM_ID]_[MODEL_NAME].wav\` (e.g. \`S01_ModelA.wav\`, \`S01_ModelB.wav\`).

3. Generate Aligned CSV Manifest:
   - Create \`./output_clean/dataset_manifest.csv\` encoded in UTF-8 without BOM.
   - Format must match exactly:
audio_filename,transcript_text,model_name
${sampleCsvText}

4. Verification:
   - Verify that every single row in the CSV has a corresponding .wav file in \`./output_clean/audio/\`.
   - Print a summary table: total items, models found, and confirming 0 missing or orphaned files.`;

        openAiPromptModal(title, desc, promptText);
      });
    }

    // AI Helper Prompt 2: Missing Audio Fix Prompt
    if (el.btnCopyAiFixPrompt) {
      el.btnCopyAiFixPrompt.addEventListener("click", () => {
        const missing = state.reconciliation.missingAudio || [];
        if (missing.length === 0) {
          showToast("No missing audio files detected.", "info");
          return;
        }

        const missingListText = missing.slice(0, 30).map(m => `- File: ${m.expectedFilename} | Prompt: "${m.text || ""}" | Model: ${m.model || "TTS"}`).join("\n");
        const title = "AI Agent Prompt: Fix Missing Audio Files";
        const desc = "Give this prompt to Claude Code, Codex, Antigravity, or your AI coding agent to resolve missing audio mismatches in your dataset.";
        const promptText = `I ran a reconciliation check on my Speech Evaluation Studio dataset, and the following ${missing.length} audio files referenced in my CSV are missing from disk:

${missingListText}
${missing.length > 30 ? `...and ${missing.length - 30} more missing items.` : ""}

Please inspect my workspace and help me resolve this mismatch using one of these two options:

Option A (Filter CSV):
If these missing files were not generated or were intentionally removed, write a script to produce a cleaned CSV excluding rows with missing audio files, so every remaining row is 100% matched with real audio.

Option B (Synthesize or Locate):
If these files exist elsewhere or need to be synthesized, locate them or run the TTS inference script to output the missing 16kHz mono WAV files into the audio folder.`;

        openAiPromptModal(title, desc, promptText);
      });
    }

    // Skip missing rows button
    if (el.btnSkipMissingRows) {
      el.btnSkipMissingRows.addEventListener("click", () => {
        // Missing rows are merely CSV rows that didn't match existing audio
        state.reconciliation.missingAudio = [];
        updateReconciliationCard();
        showToast("Missing rows skipped. Ready to proceed.", "success");
      });
    }

    // Discard orphans button
    if (el.btnDiscardOrphans) {
      el.btnDiscardOrphans.addEventListener("click", () => {
        const orphans = new Set(state.reconciliation.orphanAudio.map(o => o.filename));
        state.wizardData.items = state.wizardData.items.filter(it => !orphans.has(it.filename));
        state.reconciliation.orphanAudio = [];
        updateReconciliationCard();
        renderItemsTable();
        showToast("Unpaired audio files removed.", "success");
      });
    }

    // Manual Column Mapping Application
    if (el.btnApplyCustomColumns && el.selColText && el.selColAudio) {
      el.btnApplyCustomColumns.addEventListener("click", () => {
        const textCol = el.selColText.value;
        const audioCol = el.selColAudio.value;
        if (!textCol || !audioCol) {
          showToast("Please select both a text and audio column.", "error");
          return;
        }
        if (state.reconciliation.rawParsedRows) {
          applyParsedCsvRows(state.reconciliation.rawParsedRows, textCol, audioCol);
          if (el.boxColumnFallback) el.boxColumnFallback.classList.add("hidden");
        }
      });
    }
  }

  renderItemsTable = function() {
    if (!el.itemsCountBadge || !el.itemsPreviewTbody) return;
    el.itemsCountBadge.textContent = state.wizardData.items.length;
    el.itemsPreviewTbody.innerHTML = "";
    if (typeof updateWizardNav === "function") updateWizardNav();
    saveWizardDraft();

    if (state.wizardData.items.length === 0) {
      el.itemsPreviewTbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-8 text-center text-zinc-400 text-xs">
            No audio files added yet. Drop audio files above or click "Load Demo Samples".
          </td>
        </tr>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    state.wizardData.items.forEach((item, idx) => {
      const tr = document.createElement("tr");

      // Build model options
      let modelOptionsHtml = "";
      if (state.wizardData.models.length === 0) {
        modelOptionsHtml = `<option value="${item.model_id || 'model-candidate'}" selected>${escapeHtml(item.model_name || 'Candidate Voice')}</option>`;
      } else {
        state.wizardData.models.forEach(m => {
          const isSelected = m.id === item.model_id || m.name === item.model_name;
          modelOptionsHtml += `<option value="${m.id}" ${isSelected ? "selected" : ""}>${escapeHtml(m.name)}</option>`;
        });
      }

      tr.innerHTML = `
        <td class="p-2.5 font-mono text-zinc-400 text-xs">${idx + 1}</td>
        <td class="p-2.5">
          <select class="item-model-select w-full px-2 py-1 text-xs border border-zinc-200 rounded-lg bg-zinc-50 font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900">
            ${modelOptionsHtml}
          </select>
        </td>
        <td class="p-2.5 font-medium text-zinc-800 truncate max-w-[150px] text-xs font-mono" title="${escapeHtml(item.filename)}">
          ${escapeHtml(item.filename)}
        </td>
        <td class="p-2.5">
          <input
            type="text"
            class="item-text-input font-khmer w-full px-3 py-1.5 border border-zinc-200 rounded-lg text-sm text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 leading-relaxed"
            placeholder="បញ្ចូលអត្ថបទខ្មែរនៅទីនេះ..."
            value="${escapeHtml(item.text || "")}"
          />
        </td>
        <td class="p-2.5">
          ${item.audio_url ? `
            <audio controls class="h-7 w-36" preload="none" src="${item.audio_url}"></audio>
          ` : (item.awaiting_audio ? `
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Awaiting Audio (.wav)
            </span>
          ` : `<span class="text-zinc-400 italic text-xs">Audio ready</span>`)}
        </td>
        <td class="p-2.5 text-right">
          <button type="button" class="btn-remove-item text-zinc-400 hover:text-red-600 font-bold cursor-pointer text-sm" data-idx="${idx}">&times;</button>
        </td>
      `;

      // Live update model selection
      const modelSelect = tr.querySelector(".item-model-select");
      modelSelect.addEventListener("change", (e) => {
        item.model_id = e.target.value;
        const found = state.wizardData.models.find(m => m.id === item.model_id);
        if (found) item.model_name = found.name;
        saveWizardDraft();
      });

      // Live update text on input
      const textInput = tr.querySelector(".item-text-input");
      textInput.addEventListener("input", (e) => {
        item.text = e.target.value;
        saveWizardDraft();
      });

      // Remove item
      tr.querySelector(".btn-remove-item").addEventListener("click", () => {
        state.wizardData.items.splice(idx, 1);
        renderItemsTable();
      });

      fragment.appendChild(tr);
    });
    el.itemsPreviewTbody.appendChild(fragment);
  }

  // Step 3: Dynamic Modular Test Builder & Live Inspector
  function setupModularTestBuilder() {
    // Block factory
    function createBlock(type) {
      const ts = Date.now().toString().slice(-4);
      switch (type) {
        case "audio_player":
          return {
            id: `blk-audio-${ts}`,
            type: "audio_player",
            label: "Speech Audio",
            source_model: "candidate",
            phone_filter: false,
            speeds: true,
            auto_play: false,
            defect_tagging: true,
            allowed_defect_codes: CLINICAL_ERROR_CODES_19.map(c => c.code),
            default_defect_code: "C_DEL"
          };
        case "text_prompt":
          return {
            id: `blk-prompt-${ts}`,
            type: "text_prompt",
            mode: "open", // 'open' or 'blind_gated'
            font_size: "32px",
            show_badges: true
          };
        case "word_tagger":
          return {
            id: `blk-tagger-${ts}`,
            type: "word_tagger",
            mode: "both", // 'words', 'waveform', 'both'
            active_taxonomies: "all",
            require_note: false
          };
        case "scoring_questions":
          return {
            id: `blk-scoring-${ts}`,
            type: "scoring_questions",
            scale_max: 5,
            criteria: JSON.parse(JSON.stringify(QUESTION_PRESETS.standard))
          };
        case "transcription":
          return {
            id: `blk-trans-${ts}`,
            type: "transcription",
            enabled: true,
            show_diff: true
          };
        default:
          return null;
      }
    }

    // 1-Click Starter Kits
    function applyStarterKit(kitName) {
      if (kitName === "mos") {
        state.wizardData.ui_config.dsp.phone_filter_8khz = false;
        state.wizardData.ui_config.presentation.blind_gating = false;
        state.wizardData.ui_config.blocks = [
          { id: "blk-prompt-1", type: "text_prompt", mode: "open", font_size: "32px", show_badges: true },
          { id: "blk-audio-1", type: "audio_player", label: "Speech Audio", source_model: "candidate", phone_filter: false, speeds: true },
          { id: "blk-tagger-1", type: "word_tagger", mode: "both", active_taxonomies: "all" },
          { id: "blk-scoring-1", type: "scoring_questions", scale_max: 5, criteria: JSON.parse(JSON.stringify(QUESTION_PRESETS.standard)) },
          { id: "blk-trans-1", type: "transcription", enabled: true, show_diff: true }
        ];
        showToast("Applied Standard Voice Rating (1–5) Starter Kit.", "success");
      } else if (kitName === "vocab") {
        state.wizardData.ui_config.dsp.phone_filter_8khz = false;
        state.wizardData.ui_config.presentation.blind_gating = true;
        state.wizardData.ui_config.blocks = [
          { id: "blk-audio-1", type: "audio_player", label: "Blind Speech", source_model: "candidate", phone_filter: false, speeds: true },
          { id: "blk-prompt-1", type: "text_prompt", mode: "blind_gated", font_size: "32px", show_badges: true },
          { id: "blk-scoring-1", type: "scoring_questions", scale_max: 5, criteria: [
            { id: "pronunciation", name: "Pronunciation Accuracy", name_km: "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង", desc: "Did the voice say the prompt accurately?" },
            { id: "intelligibility", name: "Speech Intelligibility", name_km: "ភាពងាយស្រួលក្នុងការស្តាប់យល់", desc: "Clarity of spoken words" }
          ]},
          { id: "blk-tagger-1", type: "word_tagger", mode: "words", active_taxonomies: "all" }
        ];
        showToast("Applied Hidden Prompt Test Starter Kit.", "success");
      } else if (kitName === "arena") {
        state.wizardData.ui_config.dsp.phone_filter_8khz = false;
        state.wizardData.ui_config.presentation.blind_gating = false;
        state.wizardData.ui_config.blocks = [
          { id: "blk-prompt-1", type: "text_prompt", mode: "open", font_size: "28px", show_badges: true },
          { id: "blk-audio-1", type: "audio_player", label: "Model A (Candidate)", source_model: "candidate", phone_filter: false, speeds: true },
          { id: "blk-audio-2", type: "audio_player", label: "Model B (Reference / Competitor)", source_model: "reference", phone_filter: false, speeds: true },
          { id: "blk-scoring-1", type: "scoring_questions", scale_max: 5, criteria: [
            { id: "preference", name: "Overall Preference", name_km: "ចំណូលចិត្តរួម", desc: "Which model produced more natural speech?" }
          ]}
        ];
        showToast("Applied Model Comparison Starter Kit.", "success");
      } else if (kitName === "blank") {
        state.wizardData.ui_config.blocks = [];
        showToast("Cleared canvas to Blank.", "info");
      }

      state.selectedCardId = null;
      renderCanvas();
      renderInspector();
      updateSmartGuide();
    }

    if (el.btnKitMos) el.btnKitMos.addEventListener("click", () => applyStarterKit("mos"));
    if (el.btnKitVocab) el.btnKitVocab.addEventListener("click", () => applyStarterKit("vocab"));
    if (el.btnKitArena) el.btnKitArena.addEventListener("click", () => applyStarterKit("arena"));
    if (el.btnKitBlank) el.btnKitBlank.addEventListener("click", () => applyStarterKit("blank"));

    // Close Customize Drawer button
    if (el.btnCloseCustomizeDrawer) {
      el.btnCloseCustomizeDrawer.addEventListener("click", () => {
        state.selectedCardId = null;
        renderCanvas();
        renderInspector();
      });
    }

    // Toolbox drag & drop + click add
    let activeDropIndicator = null;
    let currentDraggingBlockId = null;
    let currentDraggingToolType = null;
    let draggedCardHeight = 110;

    function removeDropIndicator() {
      if (activeDropIndicator && activeDropIndicator.parentNode) {
        activeDropIndicator.parentNode.removeChild(activeDropIndicator);
      }
      activeDropIndicator = null;
    }

    function createDropIndicator(height) {
      const box = document.createElement("div");
      box.className = "drop-indicator drop-ghost-placeholder pointer-events-none select-none my-3 rounded-2xl flex items-center justify-center";
      const h = Math.max(84, height || 110);
      box.style.minHeight = `${h}px`;
      box.style.height = `${h}px`;
      box.innerHTML = `
        <div class="drop-ghost-badge pointer-events-none">
          <svg class="w-4 h-4 text-indigo-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
          <span>Insert Component Here</span>
        </div>
      `;
      return box;
    }

    function getDropInsertionIndex(canvasEl, clientY, excludeBlockId = null) {
      const cards = Array.from(canvasEl.querySelectorAll(".canvas-block-card")).filter(
        c => !excludeBlockId || c.dataset.id !== excludeBlockId
      );
      if (cards.length === 0) return 0;

      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (clientY < midY) {
          return i;
        }
      }
      return cards.length;
    }

    if (el.builderToolbox) {
      el.builderToolbox.querySelectorAll(".toolbox-item").forEach(item => {
        const toolType = item.dataset.tool;

        item.addEventListener("dragstart", (e) => {
          currentDraggingBlockId = null;
          currentDraggingToolType = toolType;
          draggedCardHeight = 110;
          e.dataTransfer.setData("tool-type", toolType);
          e.dataTransfer.setData("text/plain", toolType);
          e.dataTransfer.setData("source", "toolbox");
          item.classList.add("opacity-50");
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("opacity-50");
          currentDraggingToolType = null;
          removeDropIndicator();
        });

        const addBtn = item.querySelector(".btn-tool-add");
        if (addBtn) {
          addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const newBlock = createBlock(toolType);
            if (newBlock) {
              state.wizardData.ui_config.blocks.push(newBlock);
              state.selectedCardId = newBlock.id;
              renderCanvas();
              renderInspector();
              updateSmartGuide();
              updateWizardNav();
              saveWizardDraft();
              showToast(`Added ${toolType.replace("_", " ")} to playground.`, "success");
            }
          });
        }
      });
    }

    // Canvas Drop Zone
    if (el.builderCanvas) {
      let lastInsertionIndex = -1;

      el.builderCanvas.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = currentDraggingBlockId ? "move" : "copy";
        el.builderCanvas.classList.add("border-zinc-900", "bg-zinc-100/60");

        const cards = Array.from(el.builderCanvas.querySelectorAll(".canvas-block-card")).filter(
          c => !currentDraggingBlockId || c.dataset.id !== currentDraggingBlockId
        );
        const idx = getDropInsertionIndex(el.builderCanvas, e.clientY, currentDraggingBlockId);

        if (!activeDropIndicator) {
          activeDropIndicator = createDropIndicator(draggedCardHeight);
        }

        if (idx !== lastInsertionIndex || !activeDropIndicator.parentNode) {
          lastInsertionIndex = idx;
          if (cards.length === 0 || idx >= cards.length) {
            el.builderCanvas.appendChild(activeDropIndicator);
          } else {
            el.builderCanvas.insertBefore(activeDropIndicator, cards[idx]);
          }
        }
      });

      el.builderCanvas.addEventListener("dragleave", (e) => {
        // Only clear if leaving the canvas container itself
        if (!el.builderCanvas.contains(e.relatedTarget)) {
          el.builderCanvas.classList.remove("border-zinc-900", "bg-zinc-100/60");
          removeDropIndicator();
          lastInsertionIndex = -1;
        }
      });

      el.builderCanvas.addEventListener("drop", (e) => {
        e.preventDefault();
        el.builderCanvas.classList.remove("border-zinc-900", "bg-zinc-100/60");
        const sourceBlockId = currentDraggingBlockId || e.dataTransfer.getData("block-id");
        const toolType = currentDraggingToolType || e.dataTransfer.getData("tool-type") || e.dataTransfer.getData("text/plain");
        const idx = getDropInsertionIndex(el.builderCanvas, e.clientY, sourceBlockId);
        removeDropIndicator();
        lastInsertionIndex = -1;

        if (sourceBlockId) {
          // Reordering existing canvas block
          const blocks = state.wizardData.ui_config.blocks;
          const oldIdx = blocks.findIndex(b => b.id === sourceBlockId);
          if (oldIdx !== -1) {
            const [movedBlock] = blocks.splice(oldIdx, 1);
            const targetIdx = Math.max(0, Math.min(blocks.length, idx));
            blocks.splice(targetIdx, 0, movedBlock);
            state.selectedCardId = movedBlock.id;
            renderCanvas();
            renderInspector();
            updateSmartGuide();
            saveWizardDraft();
          }
        } else if (toolType) {
          // Inserting new block from toolbox at calculated index
          const newBlock = createBlock(toolType);
          if (newBlock) {
            const blocks = state.wizardData.ui_config.blocks;
            const targetIdx = Math.max(0, Math.min(blocks.length, idx));
            blocks.splice(targetIdx, 0, newBlock);
            state.selectedCardId = newBlock.id;
            renderCanvas();
            renderInspector();
            updateSmartGuide();
            updateWizardNav();
            saveWizardDraft();
            showToast(`Added ${toolType.replace("_", " ")} to playground.`, "success");
          }
        }
        currentDraggingBlockId = null;
        currentDraggingToolType = null;
      });
    }

    // Canvas Rendering
    renderCanvas = function() {
      if (!el.builderCanvas) return;
      el.builderCanvas.innerHTML = "";

      const blocks = state.wizardData.ui_config.blocks;
      if (blocks.length === 0) {
        el.builderCanvas.innerHTML = `
          <div class="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
            <div class="w-12 h-12 rounded-2xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 shadow-2xs mb-3">
              <svg class="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            </div>
            <div class="text-xs font-bold text-zinc-800">Evaluation Stage is Empty</div>
            <p class="text-[11px] text-zinc-500 max-w-sm mt-1 mb-4 leading-normal">
              Drag components from the left menu or click [+] to build what raters will see and hear during testing.
            </p>
            <div class="flex items-center gap-2 text-[11px] text-zinc-400">
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-zinc-200 text-zinc-700 font-medium">1. Audio Player</span>
              <span>&rarr;</span>
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-zinc-200 text-zinc-700 font-medium">2. Rating Scale</span>
            </div>
          </div>
        `;
        return;
      }

      // Sample item for real preview binding directly from Step 2
      const sampleItem = state.wizardData.items && state.wizardData.items.length > 0
        ? state.wizardData.items[0]
        : null;
      const sampleText = sampleItem && sampleItem.text
        ? sampleItem.text
        : "(No transcript text provided for this audio sample)";
      const sampleAudioName = sampleItem && sampleItem.filename
        ? sampleItem.filename
        : "Audio Sample 1";

      blocks.forEach((block, idx) => {
        const isSelected = block.id === state.selectedCardId;
        const card = document.createElement("div");
        card.className = `canvas-block-card p-3.5 bg-white border rounded-xl transition cursor-pointer relative shadow-2xs ${
          isSelected ? "border-zinc-900 ring-2 ring-zinc-900 shadow-sm" : "border-zinc-200 hover:border-zinc-300"
        }`;
        card.dataset.id = block.id;

        let title = "Component";
        let sub = "";

        if (block.type === "audio_player") {
          title = block.label || "Audio Player";
          sub = `Speeds: ${block.speeds !== false ? "Yes" : "No"} • 8kHz Filter: ${block.phone_filter ? "Enabled" : "Off"}`;
        } else if (block.type === "text_prompt") {
          title = "Prompt Text";
          sub = `Mode: ${block.mode === "blind_gated" ? "Blind-Gated (Blurred)" : "Open Verbatim"} • Size: ${block.font_size || "32px"}`;
        } else if (block.type === "word_tagger") {
          title = "Word Highlighter";
          sub = `Tagging: ${block.mode} • Taxonomies: ${block.active_taxonomies || "all"}`;
        } else if (block.type === "scoring_questions") {
          const count = block.criteria ? block.criteria.length : 0;
          title = `Rating Scale (${count} question${count === 1 ? "" : "s"})`;
          sub = `Scale: 1 to ${block.scale_max || 5} Points`;
        } else if (block.type === "transcription") {
          title = "Listener Hearing";
          sub = `Visual Diff: ${block.show_diff ? "Active" : "Off"}`;
        }

        // Generate WYSIWYG inner preview HTML based on component type
        let previewHtml = "";
        if (block.type === "audio_player") {
          const showSpeeds = block.speeds !== false;
          const showFilter = Boolean(block.phone_filter);
          previewHtml = `
            <div class="mt-3 p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-2">
              <div class="flex items-center justify-between text-xs text-zinc-600">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-zinc-900">${escapeHtml(block.label || "Audio Player")}</span>
                  <span class="text-zinc-400">•</span>
                  <span class="font-mono text-zinc-500">${escapeHtml(sampleAudioName)}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  ${showFilter ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>8 kHz Phone</span>` : ""}
                  ${showSpeeds ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-white border border-zinc-200 text-zinc-700">0.8x</span><span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-900 text-white">1.0x</span><span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-white border border-zinc-200 text-zinc-700">1.2x</span>` : ""}
                </div>
              </div>

              <!-- Authentic Client Waveform Deck from eval.html -->
              <div class="flex items-center gap-4 pt-1">
                <button
                  type="button"
                  class="w-12 h-12 flex-shrink-0 rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-sm cursor-default"
                  title="Audio Playback Preview"
                >
                  <svg class="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>

                <div class="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div class="flex items-center justify-between text-[11px] text-zinc-500">
                    <span class="font-medium text-xs font-mono">0.00s / 0.01.3</span>
                    <span class="hidden sm:inline text-zinc-400">Click & drag on waveform to tag defect region • ចុចអូសលើរលកសំឡេងដើម្បីសម្គាល់កំហុស</span>
                  </div>
                  <div class="waveform-canvas-box rounded-lg overflow-hidden h-[76px] relative bg-white border border-zinc-200">
                    <canvas class="preview-waveform-canvas w-full h-[76px] block cursor-crosshair" data-card-id="${block.id}"></canvas>
                  </div>
                </div>
              </div>
            </div>
          `;
        } else if (block.type === "text_prompt") {
          const fontSize = block.font_size || "32px";
          const isGated = block.mode === "blind_gated";
          previewHtml = `
            <div class="mt-3 p-4 bg-white border border-zinc-200 rounded-xl relative overflow-hidden">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Transcript to Evaluate • អត្ថបទសម្រាប់វាយតម្លៃ</div>
              <div class="font-khmer text-zinc-900 leading-relaxed transition-all duration-300 ${isGated ? "blur-[7px] select-none opacity-65" : ""}" style="font-size: ${fontSize};">
                ${escapeHtml(sampleText)}
              </div>
              ${isGated ? `
                <div class="absolute inset-0 bg-transparent rounded-xl flex items-center justify-center z-10 p-4 pointer-events-none">
                  <div class="px-3.5 py-1.5 text-xs bg-zinc-900/90 text-white rounded-full font-medium shadow-sm flex items-center gap-1.5 backdrop-blur-xs select-none">
                    <svg class="w-3.5 h-3.5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    <span>Click to reveal</span>
                  </div>
                </div>
              ` : ""}
            </div>
          `;
        } else if (block.type === "word_tagger") {
          const words = sampleText.split(/\s+/).filter(Boolean);
          const displayWords = words.length > 0 ? words.slice(0, 7) : ["ពាក្យទីមួយ", "ពាក្យទីពីរ", "ពាក្យទីបី"];
          previewHtml = `
            <div class="mt-3 p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-2">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Clickable Word Tokens • សម្គាល់ពាក្យខុស</div>
              <div class="flex flex-wrap gap-2 items-center">
                ${displayWords.map((w, wIdx) => {
                  if (wIdx === 1) {
                    return `
                      <span class="px-2.5 py-1 bg-amber-50 border-2 border-amber-400 rounded-lg text-sm font-khmer text-amber-900 font-semibold shadow-2xs relative">
                        ${escapeHtml(w)}
                        <span class="absolute -top-2.5 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-white font-sans uppercase shadow-xs">Glitch</span>
                      </span>
                    `;
                  }
                  return `<span class="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg text-sm font-khmer text-zinc-800 shadow-2xs">${escapeHtml(w)}</span>`;
                }).join("")}
              </div>
              <div class="flex items-center gap-1.5 pt-1 text-[10px] text-zinc-500">
                <span class="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Flagged Defect: <strong class="text-zinc-700">Awkward Pause / Pronunciation</strong></span>
              </div>
            </div>
          `;
        } else if (block.type === "scoring_questions") {
          const criteria = block.criteria || [];
          const scaleMax = block.scale_max || 5;

          if (criteria.length === 0) {
            previewHtml = `
              <div class="mt-3 p-4 bg-zinc-50 border border-dashed border-zinc-300 rounded-xl text-center">
                <div class="text-xs font-medium text-zinc-500">No rating questions added yet.</div>
                <div class="text-[11px] text-zinc-400 mt-0.5">Click to select this card and add rating questions in the right panel.</div>
              </div>
            `;
          } else {
            const criteriaColsHtml = criteria.map(c => `
              <div class="p-2.5 bg-white border border-zinc-200 rounded-lg space-y-1.5">
                <div class="flex items-baseline justify-between">
                  <div class="text-xs font-bold text-zinc-900">${escapeHtml(c.name)}</div>
                  <span class="text-[9px] text-zinc-400">1 to ${scaleMax}</span>
                </div>
                <div class="text-[10px] text-zinc-500 truncate" title="${escapeHtml(c.desc || "")}">${escapeHtml(c.desc || "")}</div>
                <div class="flex gap-1 pt-1">
                  ${Array.from({ length: scaleMax }, (_, i) => i + 1).map(num => `
                    <div class="flex-1 h-7 rounded border ${num === 4 ? "bg-zinc-900 border-zinc-900 text-white" : "bg-zinc-50 border-zinc-200 text-zinc-700"} flex items-center justify-center text-xs font-semibold">
                      ${num}
                    </div>
                  `).join("")}
                </div>
              </div>
            `).join("");

            previewHtml = `
              <div class="mt-3 p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-2">
                <div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Evaluator Rubric • លក្ខណៈវិនិច្ឆ័យ</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  ${criteriaColsHtml}
                </div>
              </div>
            `;
          }
        } else if (block.type === "transcription") {
          const showDiff = Boolean(block.show_diff);
          previewHtml = `
            <div class="mt-3 p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Listener Transcription • តើអ្នកឮអ្វី?</span>
                ${showDiff ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Visual Diff Active</span>` : `<span class="text-[10px] font-medium px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">Standard Text Input</span>`}
              </div>
              <div class="p-2 bg-white border border-zinc-300 rounded-lg text-xs font-khmer text-zinc-700">
                ${escapeHtml(sampleText)}
              </div>
              ${showDiff ? `
                <div class="p-2 bg-zinc-100 rounded-lg text-xs font-khmer leading-relaxed">
                  <span class="text-zinc-500 text-[10px] block font-sans mb-0.5">Real-time diff comparison vs prompt:</span>
                  <span>${escapeHtml(sampleText)}</span>
                </div>
              ` : ""}
            </div>
          `;
        }

        card.innerHTML = `
          <div class="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div class="flex items-center gap-2">
              <span class="card-drag-handle text-zinc-400 hover:text-zinc-800 cursor-grab text-xs font-mono select-none" title="Drag to reorder">&#x2630;</span>
              <div>
                <div class="text-xs font-bold text-zinc-900 leading-tight">${escapeHtml(title)}</div>
                <div class="text-[10px] text-zinc-500">${escapeHtml(sub)}</div>
              </div>
            </div>
            <div class="flex items-center gap-1">
              ${idx > 0 ? `<button type="button" class="btn-card-move-up p-1 text-zinc-400 hover:text-zinc-700 text-xs cursor-pointer" title="Move Up">&uarr;</button>` : ""}
              ${idx < blocks.length - 1 ? `<button type="button" class="btn-card-move-down p-1 text-zinc-400 hover:text-zinc-700 text-xs cursor-pointer" title="Move Down">&darr;</button>` : ""}
              <button type="button" class="btn-card-remove p-1 text-zinc-400 hover:text-red-600 text-xs ml-1 cursor-pointer" title="Delete Block">&times;</button>
            </div>
          </div>
          ${previewHtml}
        `;

        // Dragging whole card to reorder in playground
        card.setAttribute("draggable", "true");
        card.addEventListener("dragstart", (e) => {
          if (e.target.closest("button, input, select, textarea, canvas, .custom-dropdown-container")) {
            e.preventDefault();
            return;
          }
          currentDraggingBlockId = block.id;
          currentDraggingToolType = null;
          draggedCardHeight = card.offsetHeight || 130;
          e.dataTransfer.setData("block-id", block.id);
          e.dataTransfer.setData("text/plain", block.id);
          card.classList.add("opacity-40");
        });
        card.addEventListener("dragend", () => {
          card.classList.remove("opacity-40");
          currentDraggingBlockId = null;
          currentDraggingToolType = null;
          removeDropIndicator();
        });

        // Selection: toggle selection if clicking the already selected card
        card.addEventListener("click", (e) => {
          if (e.target.closest("button, input, select, textarea")) return;
          if (state.selectedCardId === block.id) {
            state.selectedCardId = null;
          } else {
            state.selectedCardId = block.id;
          }
          renderCanvas();
          renderInspector();
        });

        // Reordering
        const btnUp = card.querySelector(".btn-card-move-up");
        if (btnUp) {
          btnUp.addEventListener("click", (e) => {
            e.stopPropagation();
            const temp = blocks[idx];
            blocks[idx] = blocks[idx - 1];
            blocks[idx - 1] = temp;
            renderCanvas();
            updateSmartGuide();
            saveWizardDraft();
          });
        }
        const btnDown = card.querySelector(".btn-card-move-down");
        if (btnDown) {
          btnDown.addEventListener("click", (e) => {
            e.stopPropagation();
            const temp = blocks[idx];
            blocks[idx] = blocks[idx + 1];
            blocks[idx + 1] = temp;
            renderCanvas();
            updateSmartGuide();
            saveWizardDraft();
          });
        }

        // Delete
        const btnRemove = card.querySelector(".btn-card-remove");
        if (btnRemove) {
          btnRemove.addEventListener("click", (e) => {
            e.stopPropagation();
            blocks.splice(idx, 1);
            if (state.selectedCardId === block.id) {
              state.selectedCardId = blocks[0]?.id || null;
            }
            renderCanvas();
            renderInspector();
            updateSmartGuide();
            updateWizardNav();
            saveWizardDraft();
          });
        }

        el.builderCanvas.appendChild(card);
      });

      // Draw authentic waveform bars on preview canvases
      el.builderCanvas.querySelectorAll(".preview-waveform-canvas").forEach((canvas) => {
        drawPreviewWaveform(canvas);
      });
    }

    function drawPreviewWaveform(canvas) {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.parentElement?.clientWidth || 400;
      const height = 76;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const barWidth = 3;
      const barGap = 2;
      const totalBars = Math.max(10, Math.floor(width / (barWidth + barGap)));
      const midY = height / 2;
      const maxBarHeight = height - 12;

      // Unplayed gradient matching audio_dsp.js
      const unplayedGrad = ctx.createLinearGradient(0, midY - (maxBarHeight / 2), 0, midY + (maxBarHeight / 2));
      unplayedGrad.addColorStop(0, "#D4D4D8");
      unplayedGrad.addColorStop(1, "#E4E4E7");

      // Realistic speech waveform packet synthesis with 4 natural utterances separated by small pauses
      // Matching real eval.html waveform screenshot exactly
      for (let i = 0; i < totalBars; i++) {
        const x = i * (barWidth + barGap);
        const norm = i / totalBars;

        let amp = 0.08; // baseline breath floor

        // 4 speech bursts corresponding to spoken Khmer syllables/words
        // Utterance 1: 0.32 to 0.48
        if (norm >= 0.32 && norm <= 0.48) {
          const sub = (norm - 0.32) / (0.48 - 0.32);
          amp = Math.sin(sub * Math.PI) * 0.88 + 0.08;
        }
        // Utterance 2: 0.58 to 0.68
        else if (norm >= 0.58 && norm <= 0.68) {
          const sub = (norm - 0.58) / (0.68 - 0.58);
          amp = Math.sin(sub * Math.PI) * 0.72 + 0.08;
        }
        // Utterance 3: 0.72 to 0.84
        else if (norm >= 0.72 && norm <= 0.84) {
          const sub = (norm - 0.72) / (0.84 - 0.72);
          amp = Math.sin(sub * Math.PI) * 0.82 + 0.08;
        }
        // Utterance 4: 0.88 to 0.96
        else if (norm >= 0.88 && norm <= 0.96) {
          const sub = (norm - 0.88) / (0.96 - 0.88);
          amp = Math.sin(sub * Math.PI) * 0.68 + 0.08;
        }

        const barH = Math.max(4, amp * maxBarHeight);
        const y = midY - (barH / 2);

        ctx.fillStyle = unplayedGrad;
        const radius = Math.min(barWidth / 2, barH / 2);
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, barWidth, barH, radius);
        } else {
          ctx.rect(x, y, barWidth, barH);
        }
        ctx.fill();
      }

      ctx.restore();
    }

    // Reusable Custom Dropdown Component (Replaces native Apple OS select popups)
    function createCustomDropdown({ id, value, options, onChange, label, helpText }) {
      const wrapper = document.createElement("div");
      wrapper.className = "custom-dropdown-container space-y-1";

      if (label) {
        const lbl = document.createElement("label");
        lbl.className = "block text-[11px] font-semibold text-zinc-700";
        lbl.htmlFor = id;
        lbl.textContent = label;
        wrapper.appendChild(lbl);
      }

      const selectedOpt = options.find(o => String(o.value) === String(value)) || options[0] || { label: "Select...", value: "" };

      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = id;
      btn.className = "custom-dropdown-trigger";
      btn.setAttribute("aria-haspopup", "listbox");
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = `
        <span class="custom-dropdown-label truncate">${escapeHtml(selectedOpt.label || selectedOpt.text || String(selectedOpt.value))}</span>
        <svg class="custom-dropdown-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      `;

      const menu = document.createElement("div");
      menu.className = "custom-dropdown-menu hidden shadow-xl";
      menu.setAttribute("role", "listbox");

      options.forEach(opt => {
        const item = document.createElement("div");
        const isSelected = String(opt.value) === String(value);
        item.className = `custom-dropdown-item ${isSelected ? "selected" : ""}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", isSelected ? "true" : "false");
        item.dataset.value = opt.value;

        const descHtml = opt.desc ? `<div class="custom-dropdown-item-desc text-[10px] text-zinc-400 mt-0.5 leading-snug">${escapeHtml(opt.desc)}</div>` : "";

        item.innerHTML = `
          <div class="flex-1 min-w-0 pr-2">
            <div class="truncate text-xs">${escapeHtml(opt.label || opt.text || opt.value)}</div>
            ${descHtml}
          </div>
          ${isSelected ? `
            <svg class="w-3.5 h-3.5 text-current shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          ` : ""}
        `;

        item.addEventListener("click", (e) => {
          e.stopPropagation();
          menu.classList.add("hidden");
          btn.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          btn.querySelector(".custom-dropdown-label").textContent = opt.label || opt.text || opt.value;
          menu.querySelectorAll(".custom-dropdown-item").forEach(i => {
            const sel = i.dataset.value === String(opt.value);
            i.classList.toggle("selected", sel);
            i.setAttribute("aria-selected", sel ? "true" : "false");
          });
          if (typeof onChange === "function") {
            onChange(opt.value);
          }
        });

        menu.appendChild(item);
      });

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !menu.classList.contains("hidden");
        document.querySelectorAll(".custom-dropdown-menu").forEach(m => m.classList.add("hidden"));
        document.querySelectorAll(".custom-dropdown-trigger").forEach(b => {
          b.classList.remove("open");
          b.setAttribute("aria-expanded", "false");
        });
        if (!isOpen) {
          // Dynamic viewport boundary check: auto-flip upward if space below is cramped
          const rect = btn.getBoundingClientRect();
          const viewportH = window.innerHeight || document.documentElement.clientHeight;
          const spaceBelow = viewportH - rect.bottom;
          const spaceAbove = rect.top;

          if (spaceBelow < 220 && spaceAbove > spaceBelow) {
            menu.classList.add("drop-up");
            const maxH = Math.min(220, Math.max(120, spaceAbove - 24));
            menu.style.maxHeight = `${maxH}px`;
          } else {
            menu.classList.remove("drop-up");
            const maxH = Math.min(220, Math.max(120, spaceBelow - 24));
            menu.style.maxHeight = `${maxH}px`;
          }

          menu.classList.remove("hidden");
          btn.classList.add("open");
          btn.setAttribute("aria-expanded", "true");

          // Ensure selected item is scrolled into view immediately
          const selectedItem = menu.querySelector(".custom-dropdown-item.selected");
          if (selectedItem) {
            selectedItem.scrollIntoView({ block: "nearest" });
          }
        }
      });

      const outsideClickListener = (e) => {
        if (!wrapper.contains(e.target)) {
          menu.classList.add("hidden");
          btn.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
        }
      };
      document.addEventListener("click", outsideClickListener);

      wrapper.appendChild(btn);
      wrapper.appendChild(menu);

      if (helpText) {
        const hint = document.createElement("div");
        hint.className = "text-[10px] text-zinc-500 mt-1 leading-relaxed";
        hint.textContent = helpText;
        wrapper.appendChild(hint);
      }

      return wrapper;
    }

    // Reusable Modern iOS/Linear Spring Switch Toggle
    function createCustomSwitch({ id, checked, onChange, label, description }) {
      const wrap = document.createElement("div");
      wrap.className = "p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl transition hover:border-zinc-300";

      wrap.innerHTML = `
        <div class="flex items-center justify-between cursor-pointer" id="${id}-toggle-area">
          <span class="text-xs font-semibold text-zinc-900">${escapeHtml(label)}</span>
          <button type="button" id="${id}" role="switch" aria-checked="${checked ? "true" : "false"}" class="studio-switch ${checked ? "checked" : ""}">
            <span class="studio-switch-thumb"></span>
          </button>
        </div>
        ${description ? `<div class="text-[11px] text-zinc-500 leading-relaxed mt-1">${escapeHtml(description)}</div>` : ""}
      `;

      const switchBtn = wrap.querySelector(`#${id}`);
      const toggle = (e) => {
        if (e) e.preventDefault();
        const isChecked = !switchBtn.classList.contains("checked");
        switchBtn.classList.toggle("checked", isChecked);
        switchBtn.setAttribute("aria-checked", isChecked ? "true" : "false");
        if (typeof onChange === "function") onChange(isChecked);
      };

      switchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle(e);
      });
      wrap.querySelector(`#${id}-toggle-area`).addEventListener("click", toggle);

      return wrap;
    }

    // Inspector / Customize Drawer Rendering
    renderInspector = function() {
      if (!el.inspectorControlsContainer) return;
      el.inspectorControlsContainer.innerHTML = "";

      const blocks = state.wizardData.ui_config.blocks;
      const selected = blocks.find(b => b.id === state.selectedCardId);

      if (!selected) {
        if (el.drawerCustomize) el.drawerCustomize.classList.add("hidden");
        if (el.inspectorSelectedTitle) el.inspectorSelectedTitle.textContent = "-";
        if (el.inspectorBlockBadge) el.inspectorBlockBadge.textContent = "None";
        el.inspectorControlsContainer.innerHTML = `
          <div class="text-zinc-400 text-center py-10 italic">
            Click any component card in the playground to customize its settings.
          </div>
        `;
        return;
      }

      if (el.drawerCustomize) el.drawerCustomize.classList.remove("hidden");
      if (el.inspectorSelectedTitle) el.inspectorSelectedTitle.textContent = selected.label || selected.type;
      if (el.inspectorBlockBadge) el.inspectorBlockBadge.textContent = selected.type;

      // Dynamic header type icon
      const typeIconEl = document.getElementById("inspector-type-icon");
      if (typeIconEl) {
        if (selected.type === "audio_player") {
          typeIconEl.innerHTML = `<svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>`;
        } else if (selected.type === "text_prompt") {
          typeIconEl.innerHTML = `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
        } else if (selected.type === "word_tagger") {
          typeIconEl.innerHTML = `<svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>`;
        } else if (selected.type === "scoring_questions") {
          typeIconEl.innerHTML = `<svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;
        } else {
          typeIconEl.innerHTML = `<svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`;
        }
      }

      const allDefectCategories = CLINICAL_ERROR_CODES_19;

      if (selected.type === "audio_player") {
        if (selected.defect_tagging === undefined) selected.defect_tagging = true;
        if (!selected.allowed_defect_codes || selected.allowed_defect_codes.length === 0) {
          selected.allowed_defect_codes = CLINICAL_ERROR_CODES_19.map(c => c.code);
        }
        if (!selected.default_defect_code) {
          selected.default_defect_code = "C_DEL";
        }

        const container = document.createElement("div");
        container.className = "space-y-4";

        // 1. Title Input
        const titleDiv = document.createElement("div");
        titleDiv.innerHTML = `
          <label class="block text-[11px] font-semibold text-zinc-700 mb-1" for="insp-audio-label">Player Title</label>
          <input type="text" id="insp-audio-label" class="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition" value="${escapeHtml(selected.label || "")}" placeholder="e.g. Speech Audio" />
        `;
        titleDiv.querySelector("#insp-audio-label").addEventListener("input", (e) => {
          selected.label = e.target.value;
          renderCanvas();
        });
        container.appendChild(titleDiv);

        // 2. Custom Dropdown for Source
        const sourceOptions = [
          { value: "candidate", label: "Generated Voice (TTS Model being tested)", desc: "Audition the model's synthesized voice" },
          { value: "reference", label: "Human Reference (Real Speaker recording)", desc: "Benchmark against original human recording" }
        ];
        const sourceDropdown = createCustomDropdown({
          id: "insp-audio-source",
          value: selected.source_model || "candidate",
          options: sourceOptions,
          label: "Which audio should this play?",
          helpText: "Pick whether this player tests the AI model output or provides a real human recording to compare against.",
          onChange: (val) => {
            selected.source_model = val;
            renderCanvas();
          }
        });
        container.appendChild(sourceDropdown);

        // 3. Audio DSP Toggles
        const phoneSwitch = createCustomSwitch({
          id: "insp-audio-phone",
          checked: Boolean(selected.phone_filter),
          label: "Phone Call Simulation",
          description: "Simulates 8 kHz phone audio bandpass to test call center and IVR voice quality.",
          onChange: (checked) => {
            selected.phone_filter = checked;
            state.wizardData.ui_config.dsp.phone_filter_8khz = blocks.some(b => b.phone_filter);
            renderCanvas();
            updateSmartGuide();
          }
        });
        container.appendChild(phoneSwitch);

        const speedsSwitch = createCustomSwitch({
          id: "insp-audio-speeds",
          checked: Boolean(selected.speeds),
          label: "Playback Speed Buttons",
          description: "Adds 0.8x, 1.0x, and 1.2x speed buttons so raters can listen carefully.",
          onChange: (checked) => {
            selected.speeds = checked;
            renderCanvas();
          }
        });
        container.appendChild(speedsSwitch);

        // 4. Waveform Defect Tagging Toggle + Multi-Select Error Codes
        const defectSection = document.createElement("div");
        defectSection.className = "space-y-2.5 pt-1 border-t border-zinc-100";

        const defectToggle = createCustomSwitch({
          id: "insp-audio-defect-toggle",
          checked: selected.defect_tagging !== false,
          label: "Waveform Defect Tagging",
          description: "Allows listeners to drag across the waveform to highlight speech defect regions.",
          onChange: (checked) => {
            selected.defect_tagging = checked;
            const panel = defectSection.querySelector("#insp-defect-settings-panel");
            if (panel) panel.classList.toggle("hidden", !checked);
            state.wizardData.ui_config.waveform_defect_tagging = checked;
          }
        });
        defectSection.appendChild(defectToggle);

        const defectPanel = document.createElement("div");
        defectPanel.id = "insp-defect-settings-panel";
        defectPanel.className = `p-3.5 bg-zinc-50/80 border border-zinc-200/90 rounded-2xl space-y-3.5 transition-all ${selected.defect_tagging === false ? "hidden" : ""}`;

        // Top Header of Panel with Select All / Clear All
        const panelHeader = document.createElement("div");
        panelHeader.className = "flex items-center justify-between";
        panelHeader.innerHTML = `
          <div>
            <span class="text-xs font-bold text-zinc-900 block">Allowed Error Types (${allDefectCategories.length})</span>
            <span class="text-[10px] text-zinc-500">Pick which tags raters can select</span>
          </div>
          <div class="flex items-center gap-1.5 text-xs font-semibold">
            <button type="button" id="btn-defect-select-all" class="px-2 py-0.5 rounded text-[10px] text-zinc-700 hover:bg-zinc-200 transition cursor-pointer">All</button>
            <span class="text-zinc-300 text-[10px]">|</span>
            <button type="button" id="btn-defect-clear-all" class="px-2 py-0.5 rounded text-[10px] text-zinc-500 hover:bg-zinc-200 transition cursor-pointer">Clear</button>
          </div>
        `;
        defectPanel.appendChild(panelHeader);

        // Single-Column Scrollable List for 19 Defect Categories with Clear Plain-English Explanations
        const chipsGrid = document.createElement("div");
        chipsGrid.className = "flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1";

        function updateDefectChips() {
          chipsGrid.innerHTML = "";
          allDefectCategories.forEach(dt => {
            const isChecked = selected.allowed_defect_codes.includes(dt.code);
            const chip = document.createElement("div");
            chip.className = `defect-toggle-chip ${isChecked ? "active" : ""}`;
            chip.innerHTML = `
              <div class="defect-checkbox">
                ${isChecked ? `<svg class="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>` : ""}
              </div>
              <div class="flex flex-col min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${dt.dot}"></span>
                  <span class="font-bold text-xs text-zinc-900">${escapeHtml(dt.label)}</span>
                  <span class="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-1.5 py-0.2 rounded font-semibold ml-auto">${escapeHtml(dt.code)}</span>
                </div>
                <div class="text-[11px] text-zinc-500 mt-0.5 leading-snug">${escapeHtml(dt.desc || "")}</div>
              </div>
            `;
            chip.addEventListener("click", () => {
              if (isChecked) {
                if (selected.allowed_defect_codes.length <= 1) {
                  showToast("At least one defect category must be selected.", "info");
                  return;
                }
                selected.allowed_defect_codes = selected.allowed_defect_codes.filter(c => c !== dt.code);
                if (selected.default_defect_code === dt.code) {
                  selected.default_defect_code = selected.allowed_defect_codes[0] || "C_DEL";
                }
              } else {
                selected.allowed_defect_codes.push(dt.code);
              }
              // Sync campaign defectTypes
              state.wizardData.defectTypes = allDefectCategories.filter(c => selected.allowed_defect_codes.includes(c.code));
              updateDefectChips();
            });
            chipsGrid.appendChild(chip);
          });
        }
        updateDefectChips();
        defectPanel.appendChild(chipsGrid);

        // Wire Select All / Clear All
        panelHeader.querySelector("#btn-defect-select-all").addEventListener("click", () => {
          selected.allowed_defect_codes = allDefectCategories.map(c => c.code);
          state.wizardData.defectTypes = [...allDefectCategories];
          updateDefectChips();
        });
        panelHeader.querySelector("#btn-defect-clear-all").addEventListener("click", () => {
          selected.allowed_defect_codes = ["C_DEL"];
          selected.default_defect_code = "C_DEL";
          state.wizardData.defectTypes = allDefectCategories.filter(c => c.code === "C_DEL");
          updateDefectChips();
        });

        defectSection.appendChild(defectPanel);
        container.appendChild(defectSection);

        el.inspectorControlsContainer.appendChild(container);

      } else if (selected.type === "text_prompt") {
        const container = document.createElement("div");
        container.className = "space-y-4";

        const modeOptions = [
          { value: "open", label: "Always Visible (Normal Reading)", desc: "Display transcript continuously to raters" },
          { value: "blind_gated", label: "Blurred until Clicked (Blind Hearing Test)", desc: "Prevents reading bias by hiding text until listening completes" }
        ];
        const modeDropdown = createCustomDropdown({
          id: "insp-prompt-mode",
          value: selected.mode || "open",
          options: modeOptions,
          label: "Text Visibility Mode",
          helpText: "Blurred mode prevents visual reading bias by keeping the Khmer text blurred until raters click reveal.",
          onChange: (val) => {
            selected.mode = val;
            state.wizardData.ui_config.presentation.blind_gating = selected.mode === "blind_gated";
            renderCanvas();
            updateSmartGuide();
          }
        });
        container.appendChild(modeDropdown);

        const sizeOptions = [
          { value: "24px", label: "Compact (24px)", desc: "Good for long paragraphs" },
          { value: "32px", label: "Standard (32px)", desc: "Optimal for Khmer syllables" },
          { value: "40px", label: "Large (40px)", desc: "High clarity presentation" }
        ];
        const sizeDropdown = createCustomDropdown({
          id: "insp-prompt-size",
          value: selected.font_size || "32px",
          options: sizeOptions,
          label: "Text Typography Size",
          onChange: (val) => {
            selected.font_size = val;
            state.wizardData.ui_config.presentation.font_size = selected.font_size;
            renderCanvas();
          }
        });
        container.appendChild(sizeDropdown);

        el.inspectorControlsContainer.appendChild(container);

      } else if (selected.type === "word_tagger") {
        const container = document.createElement("div");
        container.className = "space-y-4";

        const taggerOptions = [
          { value: "both", label: "Both Click Words & Drag Waveform", desc: "Dual acoustic and lexical error tagging" },
          { value: "words", label: "Click Words Only", desc: "Focus strictly on word-level pronunciation" },
          { value: "waveform", label: "Drag on Waveform Only", desc: "Time-sliced acoustic defect tagging" }
        ];
        const taggerDropdown = createCustomDropdown({
          id: "insp-tagger-mode",
          value: selected.mode || "both",
          options: taggerOptions,
          label: "How Listeners Flag Errors",
          onChange: (val) => {
            selected.mode = val;
            renderCanvas();
          }
        });
        container.appendChild(taggerDropdown);

        const categoriesNote = document.createElement("div");
        categoriesNote.className = "p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1.5";
        categoriesNote.innerHTML = `
          <span class="text-xs font-semibold text-zinc-900 block">Standard Clinical Error Taxonomies (19)</span>
          <div class="text-[11px] text-zinc-600 leading-relaxed">
            Consonant Deletion, Vowel Error, Digital Glitch, Awkward Pause, Stutter, Register Error, Voice Inconsistency, Word Truncation, and 11 other clinical speech categories.
          </div>
        `;
        container.appendChild(categoriesNote);

        el.inspectorControlsContainer.appendChild(container);

      } else if (selected.type === "scoring_questions") {
        const container = document.createElement("div");
        container.className = "space-y-4";

        const scaleOptions = [
          { value: "5", label: "1 to 5 Stars (Standard MOS)", desc: "ITU-T P.800 standard speech quality scale" },
          { value: "7", label: "1 to 7 Points (High Detail)", desc: "Fine-grained comparative scoring" },
          { value: "2", label: "Pass / Fail", desc: "Binary acceptance threshold" }
        ];
        const scaleDropdown = createCustomDropdown({
          id: "insp-scoring-scale",
          value: String(selected.scale_max || 5),
          options: scaleOptions,
          label: "Score Metric Scale",
          onChange: (val) => {
            selected.scale_max = parseInt(val, 10);
            state.wizardData.scaleMax = selected.scale_max;
            renderCanvas();
          }
        });
        container.appendChild(scaleDropdown);

        const criteria = selected.criteria || [];
        const criteriaListHtml = criteria.map((c, i) => `
          <div class="flex items-center justify-between p-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl hover:border-zinc-300 transition">
            <span class="text-xs font-semibold text-zinc-800">${escapeHtml(c.name)}</span>
            <button type="button" class="btn-insp-remove-crit btn-danger-icon w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold transition cursor-pointer" data-idx="${i}" title="Remove question">&times;</button>
          </div>
        `).join("");

        const questionsBox = document.createElement("div");
        questionsBox.className = "space-y-2 pt-1 border-t border-zinc-100";
        questionsBox.innerHTML = `
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-semibold text-zinc-700">Evaluation Questions (${criteria.length})</label>
            <span class="text-[10px] text-zinc-400">Click &times; to delete</span>
          </div>
          <div class="space-y-1.5 max-h-48 overflow-y-auto">${criteriaListHtml}</div>
          <div class="pt-2 flex gap-1.5">
            <input type="text" id="insp-new-crit-name" placeholder="Add question (e.g. Naturalness)..." class="flex-1 px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition" />
            <button type="button" id="insp-btn-add-crit" class="px-3.5 py-2 text-xs bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-semibold cursor-pointer shadow-2xs transition">+</button>
          </div>
        `;

        questionsBox.querySelectorAll(".btn-insp-remove-crit").forEach(btn => {
          btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx, 10);
            selected.criteria.splice(idx, 1);
            state.wizardData.criteria = selected.criteria;
            renderInspector();
            renderCanvas();
            updateSmartGuide();
          });
        });

        questionsBox.querySelector("#insp-btn-add-crit")?.addEventListener("click", () => {
          const inp = questionsBox.querySelector("#insp-new-crit-name");
          const val = inp?.value.trim();
          if (val) {
            selected.criteria.push({
              id: val.toLowerCase().replace(/[^a-z0-9]/g, "_"),
              name: val,
              desc: "Score from 1 to " + (selected.scale_max || 5)
            });
            state.wizardData.criteria = selected.criteria;
            renderInspector();
            renderCanvas();
            updateSmartGuide();
          }
        });

        container.appendChild(questionsBox);
        el.inspectorControlsContainer.appendChild(container);

      } else if (selected.type === "transcription") {
        const container = document.createElement("div");
        container.className = "space-y-3";

        const diffSwitch = createCustomSwitch({
          id: "insp-trans-diff",
          checked: Boolean(selected.show_diff),
          label: "Highlight differences with prompt",
          description: "Colors missing, added, or changed words in green and red to quickly check accuracy.",
          onChange: (checked) => {
            selected.show_diff = checked;
            renderCanvas();
          }
        });
        container.appendChild(diffSwitch);

        el.inspectorControlsContainer.appendChild(container);
      }
    }

    // Task 6: Smart Feedback Bar & Safety Auditor
    updateSmartGuide = function() {
      if (!el.smartGuideBar) return;

      const blocks = state.wizardData.ui_config.blocks || [];
      const itemCount = state.wizardData.items.length || 50;

      const activeAudio = blocks.filter(b => b.type === "audio_player");
      const activeScoring = blocks.filter(b => b.type === "scoring_questions");
      const totalQuestions = activeScoring.reduce((sum, b) => sum + (b.criteria?.length || 0), 0);
      const hasPhoneFilter = activeAudio.some(b => b.phone_filter);
      const hasIntelligibility = activeScoring.some(b => b.criteria?.some(c => c.id.includes("intelligibility") || c.name.toLowerCase().includes("intelligib") || c.name.toLowerCase().includes("clarity")));
      const hasTranscription = blocks.some(b => b.type === "transcription");

      // Calculate time estimate: ~6s audio listen + 3s per question + 15s transcription
      const secPerItem = 6 + (totalQuestions * 3) + (hasTranscription ? 15 : 0);
      const totalMinutes = Math.max(1, Math.round((itemCount * secPerItem) / 60));

      if (el.guideTimeEstimate) {
        el.guideTimeEstimate.textContent = `(~${totalMinutes} mins per evaluator for ${itemCount} items)`;
      }

      // Requirements Checklist (Neutral & Polite)
      if (activeAudio.length === 0) {
        el.guideStatusIcon.className = "w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0";
        el.guideHeadline.textContent = "Audio Player Needed";
        el.guideHeadline.className = "font-bold text-zinc-900";
        el.guideWarningText.textContent = "Add an Audio Player from the components menu so listeners can play audio.";
        if (el.wizBtnStep3Next) el.wizBtnStep3Next.disabled = true;
        return;
      }

      if (activeScoring.length === 0 || totalQuestions === 0) {
        el.guideStatusIcon.className = "w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0";
        el.guideHeadline.textContent = "Rating Questions Needed";
        el.guideHeadline.className = "font-bold text-zinc-900";
        el.guideWarningText.textContent = "Add at least one Rating Question so listeners can submit feedback.";
        if (el.wizBtnStep3Next) el.wizBtnStep3Next.disabled = true;
        return;
      }

      // Warnings (Amber)
      if (hasPhoneFilter && !hasIntelligibility) {
        el.guideStatusIcon.className = "w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0";
        el.guideHeadline.textContent = "Recommendation: Acoustic Filter Active";
        el.guideHeadline.className = "font-bold text-amber-900";
        el.guideWarningText.textContent = "You enabled the 8 kHz Phone Filter; consider adding an Intelligibility / Clarity question.";
        if (el.wizBtnStep3Next) el.wizBtnStep3Next.disabled = false;
        return;
      }

      if (itemCount > 100 && hasTranscription) {
        el.guideStatusIcon.className = "w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0";
        el.guideHeadline.textContent = "Warning: Rater Fatigue Risk";
        el.guideHeadline.className = "font-bold text-amber-900";
        el.guideWarningText.textContent = `Typing on ${itemCount} items will cause evaluator fatigue (~${totalMinutes} mins). Consider reducing batch size.`;
        if (el.wizBtnStep3Next) el.wizBtnStep3Next.disabled = false;
        return;
      }

      // Balanced (Green)
      el.guideStatusIcon.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0";
      el.guideHeadline.textContent = "Layout Balanced & Ready";
      el.guideHeadline.className = "font-bold text-zinc-900";
      el.guideWarningText.textContent = "All components verified and acoustic balance confirmed.";
      if (el.wizBtnStep3Next) el.wizBtnStep3Next.disabled = false;
    }

    // Sync state.wizardData.criteria with active scoring blocks
    const scoringBlock = state.wizardData.ui_config.blocks.find(b => b.type === "scoring_questions");
    if (scoringBlock && scoringBlock.criteria) {
      state.wizardData.criteria = scoringBlock.criteria;
    }

    renderCanvas();
    renderInspector();
    updateSmartGuide();
  }

  // Step 4 Summary & Study Launch
  function populateSummaryStep() {
    el.summaryStudyName.textContent = state.wizardData.name;
    el.summaryStudyItems.textContent = `${state.wizardData.items.length} audio speech items`;
    el.summaryStudyCriteria.textContent = state.wizardData.criteria.map(c => c.name).join(", ");
    if (el.summaryStudyDefects) {
      el.summaryStudyDefects.textContent = `${state.wizardData.defectTypes.length} categories`;
    }
    if (el.summaryStudyTranscription) {
      el.summaryStudyTranscription.textContent = state.wizardData.collectTranscription ? "Enabled" : "Disabled";
    }
    el.summaryStudyScale.textContent = `1 to ${state.wizardData.scaleMax} Points`;

    el.shareableLinkContainer.classList.add("hidden");
    el.launchActionBox.classList.remove("hidden");
  }

  function setupLaunchAndShare() {
    el.btnLaunchStudy.addEventListener("click", async () => {
      try {
        el.btnLaunchStudy.disabled = true;
        el.btnLaunchStudy.textContent = "Launching Study...";

        // 1. Upload any pending base64 audio files in chunks of 50 to prevent timeout or payload limit
        const filesToUpload = state.wizardData.items.filter(it => it.base64);
        if (filesToUpload.length > 0) {
          const CHUNK_SIZE = 50;
          for (let c = 0; c < filesToUpload.length; c += CHUNK_SIZE) {
            const chunk = filesToUpload.slice(c, c + CHUNK_SIZE);
            el.btnLaunchStudy.textContent = `Uploading audio (${Math.min(c + CHUNK_SIZE, filesToUpload.length)}/${filesToUpload.length})...`;
            const uploadPayload = chunk.map(it => ({
              filename: it.filename,
              data_base64: it.base64,
              text: it.text
            }));

            const upResp = await adminFetch("/api/upload-batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ files: uploadPayload })
            });

            if (!upResp.ok) throw new Error(`Audio batch upload failed at item ${c + 1}`);
            const upJson = await upResp.json();
            const uploadedItems = upJson.items || [];

            // Map back URLs
            uploadedItems.forEach((uItem) => {
              const target = state.wizardData.items.find(it => it.filename === uItem.filename);
              if (target) {
                target.audio_url = uItem.url;
                delete target.base64;
              }
            });
          }
        }

        // 2. Pre-register any custom models
        for (const m of (state.wizardData.models || [])) {
          try {
            await adminFetch("/api/models", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: m.name,
                repo_id: m.id,
                candidate_code: (m.name || "MODEL").substring(0, 10).toUpperCase(),
                hardware_target: "Local / Cloud"
              })
            });
          } catch (e) {
            // Non-blocking if already exists
          }
        }

        // 3. Create Rubric
        const rubricMetrics = state.wizardData.criteria.map(c => ({
          key: c.id,
          label_en: c.name,
          label_km: c.name,
          desc: c.desc,
          type: c.type || (state.wizardData.scaleMax === 1 ? "binary_pass_fail" : "scale_1_5"),
          scale_min: c.scale_min || 1,
          scale_max: c.scale_max || state.wizardData.scaleMax || 5
        }));

        const rubricResp = await adminFetch("/api/rubrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${state.wizardData.name} Rubric`,
            protocol_type: "ACR",
            scale_min: 1,
            scale_max: state.wizardData.scaleMax,
            metrics: rubricMetrics
          })
        });

        if (!rubricResp.ok) throw new Error("Failed to create rubric.");
        const rubricJson = await rubricResp.json();
        const rubricId = rubricJson.rubric_id;

        // 3.5. Ensure all local browser audio files (blob) are saved to server disk
        const localBlobItems = state.wizardData.items.filter(it => it.base64 && (!it.audio_url || it.audio_url.startsWith("blob:")));
        if (localBlobItems.length > 0) {
          showToast(`Saving ${localBlobItems.length} audio sample(s) permanently to server...`, "info");
          for (let i = 0; i < localBlobItems.length; i++) {
            const it = localBlobItems[i];
            try {
              const upResp = await adminFetch("/api/upload-audio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  filename: it.filename || `sample_${i + 1}.wav`,
                  data_base64: it.base64
                })
              });
              if (upResp.ok) {
                const upData = await upResp.json();
                if (upData.url) {
                  it.audio_url = upData.url;
                }
              }
            } catch (err) {
              console.warn("Failed to upload audio sample to server:", it.filename, err);
            }
          }
        }

        // 4. Create Suite with per-item model mapping
        const suiteId = `suite-${Date.now()}`;
        const suiteItemsPayload = state.wizardData.items.map((it, idx) => {
          const fallbackModel = state.wizardData.models && state.wizardData.models[0];
          const mId = it.model_id || (fallbackModel ? fallbackModel.id : "model-candidate");
          const mName = it.model_name || (fallbackModel ? fallbackModel.name : "Candidate Voice");

          return {
            item_key: it.item_key || (it.filename ? it.filename.replace(/\.[^/.]+$/, "") : `ITEM-${idx + 1}`),
            source_text: it.source_text || it.text || it.filename,
            text: it.text || it.reference_transcript || it.filename,
            reference_transcript: it.reference_transcript || it.text || "",
            hypothesis_transcript: it.hypothesis_transcript || "",
            audio_url: it.audio_url,
            audio_files_json: JSON.stringify({
              [mId]: {
                model_name: mName,
                model_id: mId,
                url: it.audio_url
              }
            })
          };
        });

        const suiteResp = await adminFetch("/api/suites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: suiteId,
            name: `${state.wizardData.name} Audio Suite`,
            description: state.wizardData.desc || "Evaluation Audio Suite",
            items: suiteItemsPayload
          })
        });

        if (!suiteResp.ok) throw new Error("Failed to register test suite.");
        const suiteJson = await suiteResp.json();
        const actualSuiteId = suiteJson.suite_id || suiteId;

        // 5. Create Campaign with Modality & UI Config
        const campaignResp = await adminFetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: state.wizardData.name,
            suite_id: actualSuiteId,
            rubric_id: rubricId,
            instructions: state.wizardData.instructions,
            defect_types: state.wizardData.defectTypes,
            collect_transcription: state.wizardData.collectTranscription ? 1 : 0,
            modality: state.wizardData.modality || "TTS",
            ui_config_json: JSON.stringify(state.wizardData.ui_config)
          })
        });

        if (!campaignResp.ok) throw new Error("Failed to create study campaign.");
        const campaignJson = await campaignResp.json();
        state.createdCampaignId = campaignJson.campaign_id;
        clearWizardDraft();

        // 5. Reveal Shareable Link Box
        const fullShareUrl = `${window.location.origin}/eval?id=${state.createdCampaignId}`;
        el.shareLinkUrl.textContent = fullShareUrl;
        el.btnOpenAsRater.href = fullShareUrl;
        el.shareableLinkContainer.classList.remove("hidden");
        el.launchActionBox.classList.add("hidden");

        await refreshCampaignsList();
        showToast("Study launched successfully!", "success");
      } catch (err) {
        showToast("Failed to launch study: " + err.message, "error");
      } finally {
        el.btnLaunchStudy.disabled = false;
        el.btnLaunchStudy.textContent = "Launch Study & Generate Shareable Link";
      }
    });

    // Copy Link
    el.btnCopyShareLink.addEventListener("click", async () => {
      const url = el.shareLinkUrl.textContent;
      try {
        await navigator.clipboard.writeText(url);
        el.btnCopyShareLink.textContent = "Copied!";
        showToast("Shareable study link copied to clipboard!", "success");
        setTimeout(() => {
          el.btnCopyShareLink.textContent = "Copy Link";
        }, 2000);
      } catch (e) {
        showToast(`Study URL: ${url}`, "info");
      }
    });

    // View Live Results
    el.btnViewStudyResults.addEventListener("click", () => {
      el.tabBtnResults.click();
      if (state.createdCampaignId) {
        el.analyticsCampaignSelect.value = state.createdCampaignId;
        loadAnalyticsData();
      }
    });

    // Create Another Study button in Step 4
    if (el.btnCreateAnotherStudy) {
      el.btnCreateAnotherStudy.addEventListener("click", () => {
        resetWizardToStep1();
        showToast("Starting a new study.", "info");
      });
    }
  }

  // Analytics & MOS Engine
  function setupAnalytics() {
    if (el.btnCopyEmptyResultsLink) {
      el.btnCopyEmptyResultsLink.addEventListener("click", async () => {
        const campId = el.analyticsCampaignSelect.value;
        if (!campId) return;
        const url = `${window.location.origin}/eval.html?campaign_id=${encodeURIComponent(campId)}`;
        try {
          await navigator.clipboard.writeText(url);
          el.btnCopyEmptyResultsLink.textContent = "Copied!";
          showToast("Evaluation study link copied!", "success");
          setTimeout(() => { el.btnCopyEmptyResultsLink.textContent = "Copy Study Link"; }, 2000);
        } catch (e) {
          showToast(`Study URL: ${url}`, "info");
        }
      });
    }

    el.analyticsCampaignSelect.addEventListener("change", () => {
      if (el.analyticsModelFilter) el.analyticsModelFilter.value = "";
      if (el.analyticsRaterFilter) el.analyticsRaterFilter.value = "";
      loadAnalyticsData();
    });

    if (el.analyticsModelFilter) {
      el.analyticsModelFilter.addEventListener("change", () => {
        loadAnalyticsData();
      });
    }

    if (el.analyticsRaterFilter) {
      el.analyticsRaterFilter.addEventListener("change", () => {
        loadAnalyticsData();
      });
    }

    if (el.chartMetricSelect) {
      el.chartMetricSelect.addEventListener("change", () => {
        if (state.lastModelsList) {
          renderMosComparisonChart(state.lastModelsList, el.chartMetricSelect.value, state.lastStudyMeta);
        }
      });
    }

    el.btnExportCsv.addEventListener("click", async () => {
      const campId = el.analyticsCampaignSelect.value;
      if (campId) {
        try {
          const modelId = el.analyticsModelFilter?.value || "";
          const raterId = el.analyticsRaterFilter?.value || "";
          let exportUrl = `/api/admin/export.csv?campaign_id=${encodeURIComponent(campId)}`;
          if (modelId) exportUrl += `&model_id=${encodeURIComponent(modelId)}`;
          if (raterId) exportUrl += `&rater_id=${encodeURIComponent(raterId)}`;

          const resp = await adminFetch(exportUrl);
          if (!resp.ok) throw new Error("Failed to export CSV");
          const blob = await resp.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = `scoring_sheet_v2_${campId}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(downloadUrl);
          showToast("Scoring sheet CSV downloaded successfully!", "success");
        } catch (err) {
          showToast("Export error: " + err.message, "error");
        }
      }
    });
  }

  async function refreshCampaignsList() {
    try {
      const resp = await fetch("/api/campaigns");
      const data = await resp.json();
      state.campaignsList = data.campaigns || [];

      el.analyticsCampaignSelect.innerHTML = "";
      state.campaignsList.forEach(camp => {
        const opt = document.createElement("option");
        opt.value = camp.id;
        opt.textContent = camp.name;
        el.analyticsCampaignSelect.appendChild(opt);
      });

      if (state.campaignsList.length > 0) {
        const defaultCampId = state.campaignsList[0].id;
        el.analyticsCampaignSelect.value = defaultCampId;
      }
    } catch (e) {
      console.warn("Could not refresh campaigns:", e);
    }
  }

  async function loadAnalyticsData() {
    const campaignId = el.analyticsCampaignSelect.value;
    if (!campaignId) return;

    try {
      el.analyticsMosTbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-zinc-400">Loading results...</td></tr>`;
      el.analyticsDefectsTbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-zinc-400">Loading defect frequencies...</td></tr>`;
      if (el.analyticsTranscriptionsTbody) {
        el.analyticsTranscriptionsTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-zinc-400">Loading transcriptions...</td></tr>`;
      }
      if (el.analyticsWordHeatmapTbody) {
        el.analyticsWordHeatmapTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-zinc-400">Loading word defect heatmap...</td></tr>`;
      }

      const modelId = el.analyticsModelFilter?.value || "";
      const raterId = el.analyticsRaterFilter?.value || "";
      let summaryUrl = `/api/admin/summary?campaign_id=${encodeURIComponent(campaignId)}`;
      if (modelId) summaryUrl += `&model_id=${encodeURIComponent(modelId)}`;
      if (raterId) summaryUrl += `&rater_id=${encodeURIComponent(raterId)}`;

      const resp = await adminFetch(summaryUrl);
      if (!resp.ok) throw new Error("Failed to load analytics.");
      const data = await resp.json();

      el.statTotalEvals.textContent = data.total_evaluations || 0;
      el.statTotalRaters.textContent = data.total_raters || 0;

      const totalEvals = data.total_evaluations || 0;
      if (totalEvals === 0) {
        if (el.analyticsEmptyState) el.analyticsEmptyState.classList.remove("hidden");
        if (el.analyticsDataContent) el.analyticsDataContent.classList.add("hidden");
        return;
      } else {
        if (el.analyticsEmptyState) el.analyticsEmptyState.classList.add("hidden");
        if (el.analyticsDataContent) el.analyticsDataContent.classList.remove("hidden");
      }

      // Populate el.analyticsModelFilter (preserving current value)
      if (el.analyticsModelFilter && data.model_statistics) {
        const currentModelVal = el.analyticsModelFilter.value;
        const existingOptions = Array.from(el.analyticsModelFilter.options).map(o => o.value);
        let hasNew = false;
        data.model_statistics.forEach(m => {
          const mid = m.model_id || m.id;
          const mname = m.name || m.model_name || mid;
          if (mid && !existingOptions.includes(mid)) {
            const opt = document.createElement("option");
            opt.value = mid;
            opt.textContent = mname;
            el.analyticsModelFilter.appendChild(opt);
            hasNew = true;
          }
        });
        if (currentModelVal) el.analyticsModelFilter.value = currentModelVal;
      }

      // Populate el.analyticsRaterFilter (preserving current value)
      if (el.analyticsRaterFilter && data.rater_statistics) {
        const currentRaterVal = el.analyticsRaterFilter.value;
        const existingRaterOpts = Array.from(el.analyticsRaterFilter.options).map(o => o.value);
        data.rater_statistics.forEach(r => {
          const rid = r.rater_id || r.id;
          const rname = r.rater_name || r.name || rid;
          if (rid && !existingRaterOpts.includes(rid)) {
            const opt = document.createElement("option");
            opt.value = rid;
            opt.textContent = rname;
            el.analyticsRaterFilter.appendChild(opt);
          }
        });
        if (currentRaterVal) el.analyticsRaterFilter.value = currentRaterVal;
      }

      // Extract model statistics (supports both array and keyed object formats)
      const modelsList = data.model_statistics || (Array.isArray(data.model_performance) ? data.model_performance : Object.values(data.model_performance || {}));
      const studyMeta = data.study_meta || {};
      state.lastModelsList = modelsList;
      state.lastStudyMeta = studyMeta;

      // Determine active metric keys across all returned models or campaign config
      const activeCampaign = state.campaignsList.find(c => c.id === campaignId);
      const campaignMetrics = (studyMeta.metrics && studyMeta.metrics.length > 0)
        ? studyMeta.metrics
        : ((activeCampaign && activeCampaign.metrics) || []);
      
      let metricKeys = [];
      let metricLabels = {};

      if (campaignMetrics.length > 0) {
        campaignMetrics.forEach(m => {
          const mKey = m.key || m.id || m.name;
          const mLabel = m.label_en || m.label || m.name || mKey;
          if (mKey) {
            metricKeys.push(mKey);
            metricLabels[mKey] = mLabel;
          }
        });
      } else {
        const foundKeys = new Set();
        modelsList.forEach(m => {
          if (m.summary) {
            Object.keys(m.summary).forEach(k => foundKeys.add(k));
          }
        });
        if (foundKeys.size > 0) {
          metricKeys = Array.from(foundKeys);
        } else {
          metricKeys = ["naturalness", "pronunciation", "intelligibility"];
        }
        metricKeys.forEach(k => {
          metricLabels[k] = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");
        });
      }

      // Populate el.chartMetricSelect
      if (el.chartMetricSelect) {
        const curMetric = el.chartMetricSelect.value;
        el.chartMetricSelect.innerHTML = "";
        metricKeys.forEach(k => {
          const opt = document.createElement("option");
          opt.value = k;
          opt.textContent = metricLabels[k] || k;
          el.chartMetricSelect.appendChild(opt);
        });
        if (curMetric && metricKeys.includes(curMetric)) {
          el.chartMetricSelect.value = curMetric;
        } else if (metricKeys.length > 0) {
          el.chartMetricSelect.value = metricKeys[0];
        }
      }

      // Render Dynamic Dynamic Table Headers
      if (el.analyticsMosThead) {
        let theadHtml = `
          <tr>
            <th class="p-3 text-left">Model Name</th>
            <th class="p-3 text-left">Evals (N)</th>
        `;
        metricKeys.forEach(k => {
          const lbl = metricLabels[k] || k;
          theadHtml += `<th class="p-3 text-left">${escapeHtml(lbl)} (95% CI)</th>`;
        });
        theadHtml += `</tr>`;
        el.analyticsMosThead.innerHTML = theadHtml;
      }

      el.analyticsMosTbody.innerHTML = "";
      let allMeans = [];
      let allPassRates = [];

      if (!modelsList || modelsList.length === 0) {
        const colSpan = 2 + metricKeys.length;
        el.analyticsMosTbody.innerHTML = `<tr><td colspan="${colSpan}" class="p-4 text-center text-zinc-400">No evaluations recorded yet for this study.</td></tr>`;
        el.statMeanMos.textContent = "0.00";
      } else {
        modelsList.forEach(mInfo => {
          const summary = mInfo.summary || {};
          const tr = document.createElement("tr");
          const modelDisplayName = mInfo.name || mInfo.model_name || "Audio Sample";

          let trHtml = `
            <td class="p-3 font-semibold text-zinc-900">${escapeHtml(modelDisplayName)}</td>
            <td class="p-3 text-zinc-600 font-mono">${mInfo.eval_count || 0}</td>
          `;

          metricKeys.forEach(k => {
            const mSummary = summary[k] || {};
            if (mSummary.mean !== undefined && mSummary.mean !== null) {
              if (mSummary.is_binary) {
                allPassRates.push(mSummary.pass_rate);
                trHtml += `
                  <td class="p-3 font-mono">
                    <span class="inline-flex items-center gap-1.5 font-bold ${mSummary.pass_rate >= 80 ? 'text-emerald-700' : 'text-amber-700'}">
                      ${mSummary.pass_rate}%
                    </span>
                    <span class="text-zinc-400 text-[11px] ml-1">(${mSummary.pass_count}/${mSummary.n} Pass)</span>
                  </td>
                `;
              } else {
                allMeans.push(mSummary.mean);
                trHtml += `
                  <td class="p-3 font-mono">
                    <span class="font-bold text-zinc-900">${mSummary.mean.toFixed(2)}</span>
                    <span class="text-zinc-400 text-[11px] ml-1">CI [${mSummary.ci_lower}, ${mSummary.ci_upper}]</span>
                  </td>
                `;
              }
            } else {
              trHtml += `<td class="p-3 text-zinc-400 font-mono">-</td>`;
            }
          });

          tr.innerHTML = trHtml;
          el.analyticsMosTbody.appendChild(tr);
        });

        // Update KPI Card 3:
        // - If binary metric: label "Overall Pass Rate", value `${primaryStat.pass_rate}%`.
        // - If ASR: label "Acceptable Speech Rate", value `${data.asr_summary?.acceptable_rate || 0}%`.
        // - If standard scale: label `Average Score (1 to ${study_meta.scale_max || 5})`, value formatted MOS.
        const isAsr = studyMeta.modality === "ASR" || (data.asr_summary && data.asr_summary.total_judgments > 0);
        const hasBinary = allPassRates.length > 0 && allMeans.length === 0;

        if (isAsr) {
          if (el.statPrimaryLabel) el.statPrimaryLabel.textContent = "Acceptable Speech Rate";
          el.statMeanMos.textContent = `${data.asr_summary?.acceptable_rate || 0}%`;
        } else if (hasBinary) {
          const avgPass = (allPassRates.reduce((a, b) => a + b, 0) / allPassRates.length).toFixed(1);
          if (el.statPrimaryLabel) el.statPrimaryLabel.textContent = "Overall Pass Rate";
          el.statMeanMos.textContent = `${avgPass}%`;
        } else {
          const scaleMax = studyMeta.scale_max || 5;
          const scaleMin = studyMeta.scale_min || 1;
          if (el.statPrimaryLabel) el.statPrimaryLabel.textContent = `Average Score (${scaleMin} to ${scaleMax})`;
          const avgMos = allMeans.length > 0 ? (allMeans.reduce((a, b) => a + b, 0) / allMeans.length).toFixed(2) : "0.00";
          el.statMeanMos.textContent = avgMos;
        }
      }

      // Render Visual SVG Charts
      const activeMetricKey = el.chartMetricSelect?.value || metricKeys[0];
      renderMosComparisonChart(modelsList, activeMetricKey, studyMeta);

      // Defect Breakdown Table
      const defects = data.defects_summary || data.defects_breakdown || [];
      renderDefectDistributionChart(defects);

      el.analyticsDefectsTbody.innerHTML = "";
      if (defects.length === 0) {
        el.analyticsDefectsTbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-xs text-zinc-400 font-medium">No acoustic defect regions tagged yet.</td></tr>`;
      } else {
        defects.forEach(df => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td class="p-3 font-semibold text-red-800">${escapeHtml(df.name_en || df.error_code)}</td>
            <td class="p-3 text-zinc-600">${escapeHtml(df.model_name || "Audio Sample")}</td>
            <td class="p-3 text-right font-mono font-bold text-zinc-900">${df.count}</td>
          `;
          el.analyticsDefectsTbody.appendChild(tr);
        });
      }

      // Render ASR Adjudication Summary Card
      const asr = data.asr_summary;
      const isAsrMode = studyMeta.modality === "ASR" || (asr && asr.total_judgments > 0);
      if (el.analyticsAsrCard) {
        if (isAsrMode && asr && asr.total_judgments > 0) {
          el.analyticsAsrCard.classList.remove("hidden");
          const totalJudgments = asr.total_judgments || 1;
          const accCount = asr.acceptable_variations || 0;
          const errCount = asr.critical_errors || 0;
          const accPct = Math.round((accCount / totalJudgments) * 100);
          const errPct = Math.round((errCount / totalJudgments) * 100);

          if (el.analyticsAsrAcceptableCount) el.analyticsAsrAcceptableCount.textContent = accCount;
          if (el.analyticsAsrAcceptablePct) el.analyticsAsrAcceptablePct.textContent = `(${accPct}%)`;
          if (el.analyticsAsrErrorCount) el.analyticsAsrErrorCount.textContent = errCount;
          if (el.analyticsAsrErrorPct) el.analyticsAsrErrorPct.textContent = `(${errPct}%)`;
          if (el.analyticsAsrBar) el.analyticsAsrBar.style.width = `${accPct}%`;
          if (el.analyticsAsrBarPct) el.analyticsAsrBarPct.textContent = `${accPct}%`;
        } else {
          el.analyticsAsrCard.classList.add("hidden");
        }
      }

      // Render Word-Level Defect Heatmap Table
      if (el.analyticsWordHeatmapTbody) {
        el.analyticsWordHeatmapTbody.innerHTML = "";
        const wordDefects = data.word_defect_heatmap || [];
        if (wordDefects.length === 0) {
          el.analyticsWordHeatmapTbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-xs text-zinc-400 font-medium">No word-level defects recorded yet.</td></tr>`;
        } else {
          wordDefects.forEach(w => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td class="p-3 font-khmer font-semibold text-zinc-900">${escapeHtml(w.word_text || "—")}</td>
              <td class="p-3">
                <span class="inline-block px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-red-50 text-red-700 border border-red-200">
                  ${escapeHtml(w.error_code || "DEFECT")}
                </span>
              </td>
              <td class="p-3 text-zinc-600">${escapeHtml(w.model_name || "Audio Sample")}</td>
              <td class="p-3 text-right font-mono font-bold text-zinc-900">${w.count}</td>
            `;
            el.analyticsWordHeatmapTbody.appendChild(tr);
          });
        }
      }

      // Perceived Speech Transcriptions Table ("What raters heard")
      if (el.analyticsTranscriptionsTbody) {
        el.analyticsTranscriptionsTbody.innerHTML = "";
        const transcripts = data.transcriptions_summary || [];
        if (transcripts.length === 0) {
          el.analyticsTranscriptionsTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-zinc-400">No transcription discrepancies recorded yet.</td></tr>`;
        } else {
          transcripts.forEach(trItem => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td class="p-3">
                <div class="font-bold text-zinc-900">${escapeHtml(trItem.item_key || "")}</div>
                <div class="text-[11px] text-zinc-500">${escapeHtml(trItem.model_name || "")}</div>
              </td>
              <td class="p-3 text-zinc-700 font-khmer text-xs max-w-xs truncate" title="${escapeHtml(trItem.expected_text || "")}">
                ${escapeHtml(trItem.expected_text || "")}
              </td>
              <td class="p-3 font-khmer font-bold text-zinc-900 bg-amber-50/50 rounded text-xs">
                ${escapeHtml(trItem.blind_transcript || "")}
              </td>
              <td class="p-3 text-zinc-600 text-xs">
                <div>${escapeHtml(trItem.rater_name || "")}</div>
                <div class="text-[10px] text-zinc-400 font-mono">${(trItem.created_at || "").slice(0, 16)}</div>
              </td>
            `;
            el.analyticsTranscriptionsTbody.appendChild(tr);
          });
        }
      }

    } catch (err) {
      console.warn("Analytics load error:", err);
    }
  }

  function renderMosComparisonChart(modelsList, selectedMetricKey, studyMeta) {
    if (!el.chartMosComparison) return;
    if (!modelsList || modelsList.length === 0) {
      el.chartMosComparison.innerHTML = `<div class="text-xs text-zinc-400 py-10">No model comparison data available</div>`;
      return;
    }

    const chartWidth = 480;
    const chartHeight = 200;
    const padding = { top: 25, right: 30, bottom: 45, left: 45 };
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    const count = modelsList.length;
    const barWidth = Math.min(50, Math.floor(innerWidth / (count * 1.6)));
    const step = innerWidth / count;

    // Detect metric to plot
    const activeKey = selectedMetricKey || Object.keys(modelsList[0]?.summary || {})[0] || "naturalness";
    const isBinaryChart = modelsList.some(m => m.summary?.[activeKey]?.is_binary);

    const scaleMin = (studyMeta && studyMeta.scale_min !== undefined) ? studyMeta.scale_min : 1;
    const scaleMax = (studyMeta && studyMeta.scale_max !== undefined) ? studyMeta.scale_max : 5;

    // Update Chart subtitle and title if available
    if (el.chartMosTitle) {
      el.chartMosTitle.textContent = isBinaryChart ? "Model Pass Rate Comparison" : "Model Comparison";
    }
    if (el.chartMosSubtitle) {
      el.chartMosSubtitle.textContent = isBinaryChart
        ? "Percentage of successful completions"
        : `Scores (${scaleMin}–${scaleMax}) with 95% confidence intervals`;
    }

    // Y-scale: 0..100% or scaleMin..scaleMax
    const yScale = isBinaryChart
      ? (val) => {
          const clamped = Math.max(0, Math.min(100, val));
          return padding.top + innerHeight - (clamped / 100) * innerHeight;
        }
      : (val) => {
          const range = Math.max(1, scaleMax - scaleMin);
          const clamped = Math.max(scaleMin, Math.min(scaleMax, val));
          return padding.top + innerHeight - ((clamped - scaleMin) / range) * innerHeight;
        };

    let svg = `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="w-full h-auto max-h-[220px]" style="font-family: inherit;">`;

    if (isBinaryChart) {
      // Horizontal grid lines (0% to 100%)
      for (const pct of [0, 25, 50, 75, 100]) {
        const y = yScale(pct);
        svg += `
          <line x1="${padding.left}" y1="${y}" x2="${chartWidth - padding.right}" y2="${y}" stroke="#E4E4E7" stroke-width="1" stroke-dasharray="${pct === 0 ? 'none' : '3,3'}" />
          <text x="${padding.left - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="#71717A" font-family="monospace">${pct}%</text>
        `;
      }
    } else {
      // Horizontal grid lines across scaleMin to scaleMax
      const stepVal = Math.max(1, Math.round((scaleMax - scaleMin) / 4));
      const gridVals = new Set([scaleMin, scaleMax]);
      for (let s = scaleMin; s <= scaleMax; s += stepVal) {
        gridVals.add(s);
      }
      Array.from(gridVals).sort((a, b) => a - b).forEach(s => {
        const y = yScale(s);
        svg += `
          <line x1="${padding.left}" y1="${y}" x2="${chartWidth - padding.right}" y2="${y}" stroke="#E4E4E7" stroke-width="1" stroke-dasharray="${s === scaleMin ? 'none' : '3,3'}" />
          <text x="${padding.left - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="#71717A" font-family="monospace">${s}.0</text>
        `;
      });
    }

    // Bars and CI ticks
    modelsList.forEach((m, idx) => {
      const name = m.name || m.model_name || "Sample";
      const summary = m.summary || {};
      const primaryStat = summary[activeKey] || summary[Object.keys(summary)[0]] || {};

      const x = padding.left + (idx * step) + (step / 2) - (barWidth / 2);
      const centerX = x + (barWidth / 2);

      if (isBinaryChart) {
        const passRate = primaryStat.pass_rate !== undefined ? primaryStat.pass_rate : 0;
        const barY = yScale(passRate);
        const barH = yScale(0) - barY;
        const fillColor = passRate >= 80 ? "#059669" : (passRate >= 50 ? "#D97706" : "#E11D48");

        svg += `
          <rect x="${x}" y="${barY}" width="${barWidth}" height="${barH}" rx="4" fill="${fillColor}" opacity="0.9">
            <title>${escapeHtml(name)}: Pass Rate ${passRate}% (${primaryStat.pass_count || 0}/${primaryStat.n || 0} Correct)</title>
          </rect>
          <text x="${centerX}" y="${Math.max(16, barY - 6)}" text-anchor="middle" font-size="11" font-weight="bold" fill="#18181B" font-family="monospace">${passRate}%</text>
        `;
      } else {
        const mean = primaryStat.mean !== undefined && primaryStat.mean !== null ? primaryStat.mean : 0;
        const ciLower = primaryStat.ci_lower !== undefined ? primaryStat.ci_lower : mean;
        const ciUpper = primaryStat.ci_upper !== undefined ? primaryStat.ci_upper : mean;
        const barY = yScale(mean);
        const barH = Math.max(0, yScale(scaleMin) - barY);

        svg += `
          <rect x="${x}" y="${barY}" width="${barWidth}" height="${barH}" rx="4" fill="#18181B" opacity="0.9">
            <title>${escapeHtml(name)}: MOS ${mean.toFixed(2)} (CI [${ciLower}, ${ciUpper}])</title>
          </rect>
        `;

        if (ciUpper > ciLower && ciUpper > scaleMin) {
          const topY = yScale(ciUpper);
          const botY = yScale(ciLower);
          const tickWidth = 8;
          svg += `
            <line x1="${centerX}" y1="${botY}" x2="${centerX}" y2="${topY}" stroke="#059669" stroke-width="2" />
            <line x1="${centerX - tickWidth / 2}" y1="${topY}" x2="${centerX + tickWidth / 2}" y2="${topY}" stroke="#059669" stroke-width="2" />
            <line x1="${centerX - tickWidth / 2}" y1="${botY}" x2="${centerX + tickWidth / 2}" y2="${botY}" stroke="#059669" stroke-width="2" />
          `;
        }

        svg += `
          <text x="${centerX}" y="${Math.max(16, barY - 6)}" text-anchor="middle" font-size="11" font-weight="bold" fill="#18181B" font-family="monospace">${mean.toFixed(2)}</text>
        `;
      }

      // Model label on bottom
      const truncName = name.length > 12 ? name.slice(0, 10) + "…" : name;
      svg += `
        <text x="${centerX}" y="${chartHeight - 12}" text-anchor="middle" font-size="10" font-weight="500" fill="#3F3F46">${escapeHtml(truncName)}</text>
      `;
    });

    svg += `</svg>`;
    el.chartMosComparison.innerHTML = svg;
  }

  function renderDefectDistributionChart(defects) {
    if (!el.chartDefectDistribution) return;
    if (!defects || defects.length === 0) {
      el.chartDefectDistribution.innerHTML = `<div class="text-xs text-zinc-400 py-10">No speech defects flagged</div>`;
      return;
    }

    // Top defects up to 6 for clean visual hierarchy
    const sorted = [...defects].sort((a, b) => b.count - a.count).slice(0, 6);
    const maxCount = Math.max(1, ...sorted.map(d => d.count));

    let html = `<div class="w-full space-y-2.5 py-2">`;
    sorted.forEach(d => {
      const label = d.name_en || d.error_code || "Defect";
      const count = d.count || 0;
      const pct = Math.round((count / maxCount) * 100);
      html += `
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-zinc-800 truncate max-w-[240px]">${escapeHtml(label)}</span>
            <span class="font-mono font-bold text-zinc-900">${count} (${pct}%)</span>
          </div>
          <div class="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden">
            <div class="bg-red-500 h-full rounded-full transition-all duration-300" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    el.chartDefectDistribution.innerHTML = html;
  }

  // Active Studies Management View & Delete Flow
  let studyToDelete = null;

  function setupStudiesManagement() {
    // 1-Click Backup Export
    if (el.btnExportBackup) {
      el.btnExportBackup.addEventListener("click", async () => {
        try {
          el.btnExportBackup.disabled = true;
          el.btnExportBackup.classList.add("opacity-60");
          showToast("Packaging database and audio files into backup zip...", "info");

          const resp = await adminFetch("/api/admin/export-backup");
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || "Failed to download backup.");
          }

          const blob = await resp.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = downloadUrl;
          const dStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          a.download = `audio_studio_backup_${dStr}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(downloadUrl);

          showToast("Complete backup (.zip) downloaded successfully!", "success");
        } catch (err) {
          showToast("Export backup failed: " + err.message, "error");
        } finally {
          el.btnExportBackup.disabled = false;
          el.btnExportBackup.classList.remove("opacity-60");
        }
      });
    }

    // 1-Click Backup Restore
    if (el.btnImportBackupTrigger && el.inputRestoreBackup) {
      el.btnImportBackupTrigger.addEventListener("click", () => {
        el.inputRestoreBackup.click();
      });

      el.inputRestoreBackup.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!confirm(`Restore Audio Studio from "${file.name}"? This will restore your database and all audio files.`)) {
          el.inputRestoreBackup.value = "";
          return;
        }

        try {
          showToast("Restoring database and audio from backup...", "info");
          const base64Str = await readFileAsBase64(file);

          const resp = await adminFetch("/api/admin/import-backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              zip_base64: base64Str
            })
          });

          const res = await resp.json();
          if (resp.ok && res.success) {
            showToast(`Restore complete! Found ${res.studies_count || 0} studies.`, "success");
            await refreshCampaignsList();
          } else {
            throw new Error(res.error || "Restore failed.");
          }
        } catch (err) {
          showToast("Restore failed: " + err.message, "error");
        } finally {
          el.inputRestoreBackup.value = "";
        }
      });
    }

    if (el.studiesSearchInput) {
      el.studiesSearchInput.addEventListener("input", () => {
        renderStudiesView();
      });
    }

    if (el.btnCancelDelete) {
      el.btnCancelDelete.addEventListener("click", () => {
        el.modalDeleteStudy.classList.add("hidden");
        if (el.deleteStudyConfirmInput) el.deleteStudyConfirmInput.value = "";
        studyToDelete = null;
      });
    }

    if (el.deleteStudyConfirmInput) {
      el.deleteStudyConfirmInput.addEventListener("input", (e) => {
        if (!studyToDelete) return;
        const matches = e.target.value.trim() === studyToDelete.name.trim();
        el.btnConfirmDelete.disabled = !matches;
        el.btnConfirmDelete.classList.toggle("opacity-40", !matches);
        el.btnConfirmDelete.classList.toggle("cursor-not-allowed", !matches);
      });
    }

    if (el.btnConfirmDelete) {
      el.btnConfirmDelete.addEventListener("click", async () => {
        if (!studyToDelete) return;
        try {
          el.btnConfirmDelete.disabled = true;
          el.btnConfirmDelete.textContent = "Deleting...";

          const resp = await adminFetch(`/api/campaigns?id=${encodeURIComponent(studyToDelete.id)}`, {
            method: "DELETE"
          });

          if (!resp.ok) throw new Error("Delete failed.");

          // Remove from local list
          state.campaignsList = state.campaignsList.filter(c => c.id !== studyToDelete.id);
          el.modalDeleteStudy.classList.add("hidden");
          studyToDelete = null;

          renderStudiesView();
          await refreshCampaignsList();
          showToast("Study permanently deleted.", "info");
        } catch (err) {
          showToast("Failed to delete study: " + err.message, "error");
        } finally {
          el.btnConfirmDelete.disabled = false;
          el.btnConfirmDelete.textContent = "Delete Permanently";
        }
      });
    }
  }

  function renderStudiesView() {
    el.studiesListContainer.innerHTML = "";

    const searchQuery = (el.studiesSearchInput?.value || "").toLowerCase().trim();
    const filtered = state.campaignsList.filter(c => {
      if (!searchQuery) return true;
      return (c.name || "").toLowerCase().includes(searchQuery) ||
             (c.project_name || "").toLowerCase().includes(searchQuery) ||
             (c.instructions || "").toLowerCase().includes(searchQuery);
    });

    if (filtered.length === 0) {
      el.studiesListContainer.innerHTML = `
        <div class="p-12 text-center bg-white border border-zinc-200 rounded-2xl space-y-3">
          <div class="w-10 h-10 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center mx-auto text-sm font-bold">
            0
          </div>
          <div class="text-xs font-semibold text-zinc-800">No studies match your filter</div>
          <p class="text-[11px] text-zinc-500 max-w-sm mx-auto">
            ${searchQuery ? "Try searching for a different keyword or clear your search query." : "You have not created any speech evaluation studies yet. Click Create New Study above to get started."}
          </p>
        </div>
      `;
      return;
    }

    filtered.forEach(camp => {
      const card = document.createElement("div");
      card.className = "studio-card p-5 space-y-4 hover:border-zinc-300 transition";
      const shareUrl = `${window.location.origin}/eval.html?campaign_id=${encodeURIComponent(camp.id)}`;
      const itemsCount = camp.items_count || 0;
      const evalsCount = camp.evaluations_count || 0;
      const ratersCount = camp.raters_count || 0;

      card.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div class="text-[11px] uppercase font-semibold text-zinc-500 tracking-wider font-mono">${escapeHtml(camp.project_name || "Khmer Speech Study")}</div>
            <h3 class="text-sm font-bold text-zinc-900 mt-0.5">${escapeHtml(camp.name)}</h3>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${camp.is_active ? "status-badge-active" : "status-badge-concluded"}">
              ${camp.is_active ? "Active" : "Concluded"}
            </span>
            <button
              type="button"
              class="btn-toggle-status text-[11px] px-2.5 py-1 border border-zinc-200 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 cursor-pointer font-medium transition"
              data-id="${camp.id}"
              data-active="${camp.is_active ? "1" : "0"}"
            >
              ${camp.is_active ? "Close Study" : "Reopen Study"}
            </button>
          </div>
        </div>

        <!-- Telemetry Metrics Bar -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2 px-3 bg-zinc-50/70 border border-zinc-100 rounded-xl text-xs">
          <div>
            <div class="text-[10px] text-zinc-500 font-medium">Test Samples</div>
            <div class="font-bold text-zinc-900 font-mono">${itemsCount} audio items</div>
          </div>
          <div>
            <div class="text-[10px] text-zinc-500 font-medium">Total Evaluations</div>
            <div class="font-bold text-zinc-900 font-mono">${evalsCount} submitted</div>
          </div>
          <div>
            <div class="text-[10px] text-zinc-500 font-medium">Unique Listeners</div>
            <div class="font-bold text-zinc-900 font-mono">${ratersCount} raters</div>
          </div>
          <div>
            <div class="text-[10px] text-zinc-500 font-medium">Rubric Scale</div>
            <div class="font-bold text-zinc-900">1 - ${camp.scale_max || 5} ${escapeHtml(camp.protocol_type || "ACR")}</div>
          </div>
        </div>

        ${camp.instructions ? `<div class="text-xs text-zinc-700 bg-zinc-50 p-2.5 rounded-lg border border-zinc-100 leading-relaxed"><span class="font-medium text-zinc-900">Instructions:</span> ${escapeHtml(camp.instructions)}</div>` : ""}

        <!-- Actions Dock -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-100">
          <div class="text-xs text-zinc-500 font-mono truncate max-w-sm bg-zinc-50 px-2 py-1 rounded-md border border-zinc-100" title="${shareUrl}">
            ${shareUrl}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn-ghost text-xs btn-copy-card-link" data-url="${shareUrl}">Copy Link</button>
            <a href="${shareUrl}" target="_blank" class="btn-ghost text-xs">Evaluate</a>
            <button type="button" class="btn-carbon text-xs btn-view-card-results" data-id="${camp.id}">Results & MOS</button>
            <button type="button" class="px-2.5 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium cursor-pointer transition btn-delete-card" data-id="${camp.id}" data-name="${escapeHtml(camp.name)}">
              Delete
            </button>
          </div>
        </div>
      `;

      // Copy Link
      card.querySelector(".btn-copy-card-link").addEventListener("click", async (e) => {
        try {
          await navigator.clipboard.writeText(shareUrl);
          e.target.textContent = "Copied!";
          showToast("Study link copied to clipboard!", "success");
          setTimeout(() => { e.target.textContent = "Copy Link"; }, 2000);
        } catch (err) {
          showToast(`Study URL: ${shareUrl}`, "info");
        }
      });

      // View Results
      card.querySelector(".btn-view-card-results").addEventListener("click", () => {
        el.tabBtnResults.click();
        el.analyticsCampaignSelect.value = camp.id;
        loadAnalyticsData();
      });

      // Toggle Status
      card.querySelector(".btn-toggle-status").addEventListener("click", async (e) => {
        const currentActive = e.target.dataset.active === "1";
        const newStatus = !currentActive;
        try {
          e.target.disabled = true;
          const resp = await adminFetch("/api/campaigns/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaign_id: camp.id,
              is_active: newStatus ? 1 : 0
            })
          });
          if (!resp.ok) throw new Error("Failed to update status.");
          camp.is_active = newStatus ? 1 : 0;
          renderStudiesView();
          showToast(`Study marked as ${newStatus ? "Active" : "Concluded"}.`, "success");
        } catch (err) {
          showToast("Error updating status: " + err.message, "error");
        }
      });

      // Delete Study
      card.querySelector(".btn-delete-card").addEventListener("click", () => {
        studyToDelete = camp;
        el.deleteStudyTitle.textContent = `"${camp.name}"`;
        if (el.deleteStudyPromptName) el.deleteStudyPromptName.textContent = camp.name;
        if (el.deleteStudyConfirmInput) el.deleteStudyConfirmInput.value = "";
        if (el.btnConfirmDelete) {
          el.btnConfirmDelete.disabled = true;
          el.btnConfirmDelete.classList.add("opacity-40", "cursor-not-allowed");
        }
        el.modalDeleteStudy.classList.remove("hidden");
        if (el.deleteStudyConfirmInput) el.deleteStudyConfirmInput.focus();
      });

      el.studiesListContainer.appendChild(card);
    });
  }

  // File helper to read base64
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Str = reader.result.split(",")[1];
        resolve(base64Str);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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