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

  // State
  const state = {
    currentTab: "wizard",
    wizardStep: 1,
    wizardData: {
      name: "",
      desc: "",
      instructions: "",
      models: [
        { id: "model-veaja", name: "Veaja AI (Ours)" },
        { id: "model-mms", name: "Meta MMS-TTS" }
      ],
      items: [], // Array of { id, filename, audio_url, base64, text, model_name, model_id }
      scaleMax: 5,
      template: "standard",
      collectTranscription: true,
      defectTypes: [
        { code: "MISPRON", label: "Mispronunciation", label_km: "បញ្ចេញសំឡេងខុស" },
        { code: "NOISE", label: "Noise / Click", label_km: "សំឡេងរំខាន" },
        { code: "UNNAT_PAUSE", label: "Awkward Pause", label_km: "ផ្អាកខុសប្រក្រតី" },
        { code: "ROBOTIC", label: "Robotic Buzz", label_km: "សំឡេងរ៉ូបូត" },
        { code: "PITCH", label: "Unnatural Pitch", label_km: "កម្ពស់សំឡេងខុស" },
        { code: "OTHER", label: "Other Defect", label_km: "បញ្ហាផ្សេងទៀត" }
      ],
      criteria: [
        { id: "naturalness", name: "Naturalness", name_km: "លក្ខណៈធម្មជាតិនៃសំឡេង", desc: "Does it sound like a real human speaking?" },
        { id: "pronunciation", name: "Pronunciation Accuracy", name_km: "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង", desc: "Are vowels and consonants pronounced correctly?" }
      ]
    },
    createdCampaignId: null,
    campaignsList: []
  };

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
    tabBtnResults: document.getElementById("tab-btn-results"),
    tabBtnStudies: document.getElementById("tab-btn-studies"),
    viewWizard: document.getElementById("view-wizard"),
    viewResults: document.getElementById("view-results"),
    viewStudies: document.getElementById("view-studies"),

    // Wizard Nav
    wizardNavItems: document.querySelectorAll(".wizard-nav-item"),
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

    // Step 3
    tplBtnStandard: document.getElementById("tpl-btn-standard"),
    tplBtnDetailed: document.getElementById("tpl-btn-detailed"),
    tplBtnCustom: document.getElementById("tpl-btn-custom"),
    wizScaleMax: document.getElementById("wiz-scale-max"),
    btnAddCriterion: document.getElementById("btn-add-criterion"),
    boxAddCriterionForm: document.getElementById("box-add-criterion-form"),
    inputNewCriterionName: document.getElementById("input-new-criterion-name"),
    inputNewCriterionDesc: document.getElementById("input-new-criterion-desc"),
    btnSaveNewCriterion: document.getElementById("btn-save-new-criterion"),
    btnCancelNewCriterion: document.getElementById("btn-cancel-new-criterion"),
    criteriaListContainer: document.getElementById("criteria-list-container"),
    wizCollectTranscription: document.getElementById("wiz-collect-transcription"),
    btnAddDefectType: document.getElementById("btn-add-defect-type"),
    boxAddDefectForm: document.getElementById("box-add-defect-form"),
    inputNewDefectLabel: document.getElementById("input-new-defect-label"),
    inputNewDefectCode: document.getElementById("input-new-defect-code"),
    btnCancelNewDefect: document.getElementById("btn-cancel-new-defect"),
    btnSaveNewDefect: document.getElementById("btn-save-new-defect"),
    defectTypesContainer: document.getElementById("defect-types-container"),
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
    devQuickShortcuts: document.getElementById("dev-quick-shortcuts"),
    btnViewStudyResults: document.getElementById("btn-view-study-results"),
    wizBtnStep4Prev: document.getElementById("wiz-btn-step4-prev"),

    // Results
    analyticsCampaignSelect: document.getElementById("analytics-campaign-select"),
    btnExportCsv: document.getElementById("btn-export-csv"),
    statTotalEvals: document.getElementById("stat-total-evals"),
    statTotalRaters: document.getElementById("stat-total-raters"),
    statMeanMos: document.getElementById("stat-mean-mos"),
    analyticsMosThead: document.getElementById("analytics-mos-thead"),
    analyticsMosTbody: document.getElementById("analytics-mos-tbody"),
    analyticsDefectsTbody: document.getElementById("analytics-defects-tbody"),
    analyticsTranscriptionsTbody: document.getElementById("analytics-transcriptions-tbody"),

    // Studies
    studiesListContainer: document.getElementById("studies-list-container"),
    btnCreateStudyShortcut: document.getElementById("btn-create-study-shortcut"),
    studiesSearchInput: document.getElementById("studies-search-input"),
    modalDeleteStudy: document.getElementById("modal-delete-study"),
    deleteStudyTitle: document.getElementById("delete-study-title"),
    btnCancelDelete: document.getElementById("btn-cancel-delete"),
    btnConfirmDelete: document.getElementById("btn-confirm-delete")
  };

  // Initialize
  async function init() {
    setupAdminAuth();
    setupTabSwitching();
    setupWizardFlow();
    setupAudioUploads();
    setupTemplatesAndCriteria();
    setupLaunchAndShare();
    setupAnalytics();
    setupStudiesManagement();

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

        if (!newPin || !newPin.match(/^\d{4,6}$/)) {
          if (regErr) {
            regErr.textContent = "New PIN must be exactly 4 or 6 numeric digits.";
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
    function goToStep(stepNumber) {
      state.wizardStep = stepNumber;

      el.wizardNavItems.forEach(item => {
        const itemStep = parseInt(item.dataset.step, 10);
        item.classList.toggle("active", itemStep === stepNumber);
        item.classList.toggle("completed", itemStep < stepNumber);
      });

      el.step1.classList.toggle("hidden", stepNumber !== 1);
      el.step2.classList.toggle("hidden", stepNumber !== 2);
      el.step3.classList.toggle("hidden", stepNumber !== 3);
      el.step4.classList.toggle("hidden", stepNumber !== 4);

      if (stepNumber === 4) {
        populateSummaryStep();
      }
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
      goToStep(2);
    });

    // Step 2 Nav
    el.wizBtnStep2Prev.addEventListener("click", () => goToStep(1));
    el.wizBtnStep2Next.addEventListener("click", () => {
      if (state.wizardData.items.length === 0) {
        showToast("Please add at least one audio file to evaluate.", "error");
        return;
      }
      goToStep(3);
    });

    // Step 3 Nav
    el.wizBtnStep3Prev.addEventListener("click", () => goToStep(2));
    el.wizBtnStep3Next.addEventListener("click", () => {
      if (state.wizardData.criteria.length === 0) {
        showToast("Please select or add at least one rating question.", "error");
        return;
      }
      state.wizardData.scaleMax = parseInt(el.wizScaleMax.value, 10) || 5;
      goToStep(4);
    });

    // Step 4 Nav
    el.wizBtnStep4Prev.addEventListener("click", () => goToStep(3));

    // Direct header step clicks
    el.wizardNavItems.forEach(item => {
      item.addEventListener("click", () => {
        const targetStep = parseInt(item.dataset.step, 10);
        if (targetStep < state.wizardStep) {
          goToStep(targetStep);
        }
      });
    });
  }

  // Audio Uploads, Model Management & Transcript Pairing Engine
  function setupAudioUploads() {
    // Model Management
    function renderModelsChips() {
      if (!el.modelsChipsContainer || !el.selUploadTargetModel) return;
      el.modelsChipsContainer.innerHTML = "";
      el.selUploadTargetModel.innerHTML = "";

      state.wizardData.models.forEach((m, idx) => {
        // Chip
        const chip = document.createElement("div");
        chip.className = "inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-800 shadow-2xs";
        chip.innerHTML = `
          <span class="w-2 h-2 rounded-full ${idx === 0 ? "bg-emerald-500" : "bg-blue-500"}"></span>
          <span class="font-bold text-zinc-900">${escapeHtml(m.name)}</span>
          ${state.wizardData.models.length > 1 ? `<button type="button" class="text-zinc-400 hover:text-red-600 font-bold ml-1 cursor-pointer" data-idx="${idx}">&times;</button>` : ""}
        `;

        if (state.wizardData.models.length > 1) {
          chip.querySelector("button").addEventListener("click", () => {
            state.wizardData.models.splice(idx, 1);
            renderModelsChips();
            renderItemsTable();
          });
        }
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

    // Process Batch Audio Files
    async function processAudioFiles(files) {
      if (!files || files.length === 0) return;

      const targetModelId = el.selUploadTargetModel.value;
      const targetModelObj = state.wizardData.models.find(m => m.id === targetModelId) || state.wizardData.models[0];

      let added = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.match(/\.(wav|mp3|ogg|flac|m4a)$/i)) continue;

        const base64Str = await readFileAsBase64(file);
        const blobUrl = URL.createObjectURL(file);

        state.wizardData.items.push({
          id: `item-up-${Date.now()}-${i}`,
          filename: file.name,
          audio_url: blobUrl,
          base64: base64Str,
          model_id: targetModelObj.id,
          model_name: targetModelObj.name,
          text: ""
        });
        added++;
      }

      renderItemsTable();
      showToast(`Loaded ${added} audio samples.`, "success");
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

    // CSV File Processing Helper
    function processCsvFile(file) {
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target.result;
        const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          showToast("CSV file must have a header row and at least 1 data row.", "error");
          return;
        }

        const map = {};
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i];
          const parts = row.split(",");
          if (parts.length >= 2) {
            const fName = parts[0].trim();
            const fText = parts[1].replace(/^["']|["']$/g, "").trim();
            const fModel = parts[2] ? parts[2].replace(/^["']|["']$/g, "").trim() : "";
            map[fName] = { text: fText, model: fModel };
          }
        }

        let applied = 0;
        state.wizardData.items.forEach(item => {
          if (map[item.filename]) {
            item.text = map[item.filename].text;
            if (map[item.filename].model) {
              const mName = map[item.filename].model;
              let foundModel = state.wizardData.models.find(m => m.name.toLowerCase() === mName.toLowerCase());
              if (!foundModel) {
                foundModel = { id: `model-${Date.now()}-${Math.floor(Math.random() * 100)}`, name: mName };
                state.wizardData.models.push(foundModel);
                renderModelsChips();
              }
              item.model_id = foundModel.id;
              item.model_name = foundModel.name;
            }
            applied++;
          }
        });

        renderItemsTable();
        showToast(`Matched transcripts for ${applied} audio files using CSV.`, "success");
      };
      reader.readAsText(file);
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
        renderItemsTable();
        showToast("Cleared all audio samples.");
      }
    });
  }

  function renderItemsTable() {
    el.itemsCountBadge.textContent = state.wizardData.items.length;
    el.itemsPreviewTbody.innerHTML = "";

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

    state.wizardData.items.forEach((item, idx) => {
      const tr = document.createElement("tr");

      // Build model options
      let modelOptionsHtml = "";
      state.wizardData.models.forEach(m => {
        const isSelected = m.id === item.model_id || m.name === item.model_name;
        modelOptionsHtml += `<option value="${m.id}" ${isSelected ? "selected" : ""}>${escapeHtml(m.name)}</option>`;
      });

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
          ` : `<span class="text-zinc-400 italic text-xs">Audio ready</span>`}
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
      });

      // Live update text on input
      const textInput = tr.querySelector(".item-text-input");
      textInput.addEventListener("input", (e) => {
        item.text = e.target.value;
      });

      // Remove item
      tr.querySelector(".btn-remove-item").addEventListener("click", () => {
        state.wizardData.items.splice(idx, 1);
        renderItemsTable();
      });

      el.itemsPreviewTbody.appendChild(tr);
    });
  }

  // Question Templates and Custom Criteria Builder
  function setupTemplatesAndCriteria() {
    function selectTemplate(tplKey) {
      state.wizardData.template = tplKey;
      el.tplBtnStandard.classList.toggle("border-2", tplKey === "standard");
      el.tplBtnStandard.classList.toggle("border-zinc-900", tplKey === "standard");
      el.tplBtnStandard.classList.toggle("bg-zinc-50", tplKey === "standard");

      el.tplBtnDetailed.classList.toggle("border-2", tplKey === "detailed");
      el.tplBtnDetailed.classList.toggle("border-zinc-900", tplKey === "detailed");
      el.tplBtnDetailed.classList.toggle("bg-zinc-50", tplKey === "detailed");

      el.tplBtnCustom.classList.toggle("border-2", tplKey === "custom");
      el.tplBtnCustom.classList.toggle("border-zinc-900", tplKey === "custom");
      el.tplBtnCustom.classList.toggle("bg-zinc-50", tplKey === "custom");

      if (tplKey !== "custom") {
        state.wizardData.criteria = JSON.parse(JSON.stringify(QUESTION_PRESETS[tplKey]));
      }
      renderCriteriaList();
    }

    el.tplBtnStandard.addEventListener("click", () => selectTemplate("standard"));
    el.tplBtnDetailed.addEventListener("click", () => selectTemplate("detailed"));
    el.tplBtnCustom.addEventListener("click", () => selectTemplate("custom"));

    // Add Custom Criterion (Inline Form)
    if (el.btnAddCriterion && el.boxAddCriterionForm) {
      el.btnAddCriterion.addEventListener("click", () => {
        selectTemplate("custom");
        el.boxAddCriterionForm.classList.remove("hidden");
        el.inputNewCriterionName.value = "";
        el.inputNewCriterionDesc.value = "";
        el.inputNewCriterionName.focus();
      });

      el.btnCancelNewCriterion.addEventListener("click", () => {
        el.boxAddCriterionForm.classList.add("hidden");
        el.inputNewCriterionName.value = "";
        el.inputNewCriterionDesc.value = "";
      });

      const handleSaveCriterion = () => {
        const name = el.inputNewCriterionName.value.trim();
        if (!name) {
          showToast("Please enter a question name.", "error");
          el.inputNewCriterionName.focus();
          return;
        }
        const desc = el.inputNewCriterionDesc.value.trim();
        state.wizardData.criteria.push({
          id: name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          name: name,
          desc: desc
        });
        renderCriteriaList();
        el.boxAddCriterionForm.classList.add("hidden");
        el.inputNewCriterionName.value = "";
        el.inputNewCriterionDesc.value = "";
        showToast(`Question "${name}" added!`, "success");
      };

      el.btnSaveNewCriterion.addEventListener("click", handleSaveCriterion);
      el.inputNewCriterionName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSaveCriterion();
        if (e.key === "Escape") el.btnCancelNewCriterion.click();
      });
    }

    // Transcription Toggle
    if (el.wizCollectTranscription) {
      el.wizCollectTranscription.checked = state.wizardData.collectTranscription;
      el.wizCollectTranscription.addEventListener("change", (e) => {
        state.wizardData.collectTranscription = e.target.checked;
      });
    }

    // Defect Types Manager
    if (el.btnAddDefectType && el.boxAddDefectForm) {
      el.btnAddDefectType.addEventListener("click", () => {
        el.boxAddDefectForm.classList.remove("hidden");
        el.inputNewDefectLabel.value = "";
        el.inputNewDefectCode.value = "";
        el.inputNewDefectLabel.focus();
      });

      el.btnCancelNewDefect.addEventListener("click", () => {
        el.boxAddDefectForm.classList.add("hidden");
        el.inputNewDefectLabel.value = "";
        el.inputNewDefectCode.value = "";
      });

      const handleSaveDefect = () => {
        const label = el.inputNewDefectLabel.value.trim();
        if (!label) {
          showToast("Please enter a category label.", "error");
          el.inputNewDefectLabel.focus();
          return;
        }
        let code = el.inputNewDefectCode.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        if (!code) {
          code = label.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        }
        state.wizardData.defectTypes.push({ code, label });
        renderDefectTypesList();
        el.boxAddDefectForm.classList.add("hidden");
        el.inputNewDefectLabel.value = "";
        el.inputNewDefectCode.value = "";
        showToast(`Defect category "${label}" added!`, "success");
      };

      el.btnSaveNewDefect.addEventListener("click", handleSaveDefect);
      el.inputNewDefectCode.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSaveDefect();
        if (e.key === "Escape") el.btnCancelNewDefect.click();
      });
    }

    renderCriteriaList();
    renderDefectTypesList();
  }

  function renderDefectTypesList() {
    if (!el.defectTypesContainer) return;
    el.defectTypesContainer.innerHTML = "";

    if (state.wizardData.defectTypes.length === 0) {
      el.defectTypesContainer.innerHTML = `
        <span class="text-zinc-400 text-xs italic">No defect categories configured. Click "+ Add Defect Category" above.</span>
      `;
      return;
    }

    state.wizardData.defectTypes.forEach((dt, idx) => {
      const chip = document.createElement("div");
      chip.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 border border-zinc-200 text-xs font-medium text-zinc-800";
      const lblKm = dt.label_km ? `<span class="font-khmer font-medium">${escapeHtml(dt.label_km)}</span> <span class="text-zinc-500 text-[11px]">(${escapeHtml(dt.label)})</span>` : `<span>${escapeHtml(dt.label)}</span>`;
      chip.innerHTML = `
        ${lblKm}
        <span class="text-[10px] font-mono text-zinc-400 uppercase">(${escapeHtml(dt.code)})</span>
        <button type="button" class="text-zinc-400 hover:text-red-600 font-bold ml-1 cursor-pointer" data-idx="${idx}">&times;</button>
      `;

      chip.querySelector("button").addEventListener("click", () => {
        state.wizardData.defectTypes.splice(idx, 1);
        renderDefectTypesList();
      });

      el.defectTypesContainer.appendChild(chip);
    });
  }

  function renderCriteriaList() {
    el.criteriaListContainer.innerHTML = "";

    if (state.wizardData.criteria.length === 0) {
      el.criteriaListContainer.innerHTML = `
        <div class="p-4 text-center text-zinc-400 text-xs border border-dashed border-zinc-200 rounded-xl">
          No questions added yet. Click "+ Add Custom Question" or select a template above.
        </div>
      `;
      return;
    }

    state.wizardData.criteria.forEach((crit, idx) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs";
      const nameKm = crit.name_km ? `<span class="font-khmer font-bold text-zinc-900">${escapeHtml(crit.name_km)}</span> <span class="font-semibold text-zinc-500 font-sans text-[11px]">(${escapeHtml(crit.name)})</span>` : `<span class="font-bold text-zinc-900">${escapeHtml(crit.name)}</span>`;
      row.innerHTML = `
        <div>
          <div class="leading-tight">${nameKm}</div>
          <div class="text-zinc-500 text-[11px] mt-0.5">${escapeHtml(crit.desc || "Score from 1 to 5")}</div>
        </div>
        <button type="button" class="text-red-500 hover:text-red-700 font-semibold cursor-pointer text-xs" data-idx="${idx}">
          Remove
        </button>
      `;

      row.querySelector("button").addEventListener("click", () => {
        state.wizardData.criteria.splice(idx, 1);
        state.wizardData.template = "custom";
        el.tplBtnStandard.classList.remove("border-2", "border-zinc-900");
        el.tplBtnDetailed.classList.remove("border-2", "border-zinc-900");
        el.tplBtnCustom.classList.add("border-2", "border-zinc-900");
        renderCriteriaList();
      });

      el.criteriaListContainer.appendChild(row);
    });
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

        // 1. Upload any pending base64 audio files in batch
        const filesToUpload = state.wizardData.items.filter(it => it.base64);
        if (filesToUpload.length > 0) {
          const uploadPayload = filesToUpload.map(it => ({
            filename: it.filename,
            data_base64: it.base64,
            text: it.text
          }));

          const upResp = await adminFetch("/api/upload-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: uploadPayload })
          });

          if (!upResp.ok) throw new Error("Audio batch upload failed.");
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
          desc: c.desc
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

        // 4. Create Suite with per-item model mapping
        const suiteId = `suite-${Date.now()}`;
        const suiteItemsPayload = state.wizardData.items.map((it, idx) => {
          const fallbackModel = state.wizardData.models && state.wizardData.models[0];
          const mId = it.model_id || (fallbackModel ? fallbackModel.id : "model-veaja");
          const mName = it.model_name || (fallbackModel ? fallbackModel.name : "Veaja AI (Ours)");

          return {
            item_key: it.item_key || `ITEM-${idx + 1}`,
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

        // 5. Create Campaign with Modality
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
            modality: state.wizardData.modality || "TTS"
          })
        });

        if (!campaignResp.ok) throw new Error("Failed to create study campaign.");
        const campaignJson = await campaignResp.json();
        state.createdCampaignId = campaignJson.campaign_id;

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
  }

  // Analytics & MOS Engine
  function setupAnalytics() {
    el.analyticsCampaignSelect.addEventListener("change", () => {
      loadAnalyticsData();
    });

    el.btnExportCsv.addEventListener("click", async () => {
      const campId = el.analyticsCampaignSelect.value;
      if (campId) {
        try {
          const resp = await adminFetch(`/api/admin/export.csv?campaign_id=${campId}`);
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

      const resp = await adminFetch(`/api/admin/summary?campaign_id=${campaignId}`);
      if (!resp.ok) throw new Error("Failed to load analytics.");
      const data = await resp.json();

      el.statTotalEvals.textContent = data.total_evaluations || 0;
      el.statTotalRaters.textContent = data.total_raters || 0;

      // Extract model statistics (supports both array and keyed object formats)
      const modelsList = data.model_statistics || (Array.isArray(data.model_performance) ? data.model_performance : Object.values(data.model_performance || {}));
      
      // Determine active metric keys across all returned models or campaign config
      const activeCampaign = state.campaignsList.find(c => c.id === campaignId);
      const campaignMetrics = (activeCampaign && activeCampaign.metrics) || [];
      
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

      if (!modelsList || modelsList.length === 0) {
        const colSpan = 2 + metricKeys.length;
        el.analyticsMosTbody.innerHTML = `<tr><td colspan="${colSpan}" class="p-4 text-center text-zinc-400">No evaluations recorded yet for this study.</td></tr>`;
        el.statMeanMos.textContent = "0.00";
      } else {
        modelsList.forEach(mInfo => {
          const summary = mInfo.summary || {};
          const tr = document.createElement("tr");

          let trHtml = `
            <td class="p-3 font-semibold text-zinc-900">${escapeHtml(mInfo.model_name || "Audio Sample")}</td>
            <td class="p-3 text-zinc-600 font-mono">${mInfo.eval_count || 0}</td>
          `;

          metricKeys.forEach(k => {
            const mSummary = summary[k] || {};
            if (mSummary.mean !== undefined && mSummary.mean !== null) {
              allMeans.push(mSummary.mean);
              trHtml += `
                <td class="p-3 font-mono">
                  <span class="font-bold text-zinc-900">${mSummary.mean.toFixed(2)}</span>
                  <span class="text-zinc-400 text-[11px] ml-1">CI [${mSummary.ci_lower}, ${mSummary.ci_upper}]</span>
                </td>
              `;
            } else {
              trHtml += `<td class="p-3 text-zinc-400 font-mono">-</td>`;
            }
          });

          tr.innerHTML = trHtml;
          el.analyticsMosTbody.appendChild(tr);
        });

        const avgMos = allMeans.length > 0 ? (allMeans.reduce((a, b) => a + b, 0) / allMeans.length).toFixed(2) : "0.00";
        el.statMeanMos.textContent = avgMos;
      }

      // Defect Breakdown Table
      const defects = data.defects_summary || data.defects_breakdown || [];
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

  // Active Studies Management View & Delete Flow
  let studyToDelete = null;

  function setupStudiesManagement() {
    if (el.studiesSearchInput) {
      el.studiesSearchInput.addEventListener("input", () => {
        renderStudiesView();
      });
    }

    if (el.btnCancelDelete) {
      el.btnCancelDelete.addEventListener("click", () => {
        el.modalDeleteStudy.classList.add("hidden");
        studyToDelete = null;
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
          populateCampaignsDropdown();
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
            <div class="text-[11px] uppercase font-semibold text-zinc-400 tracking-wider font-mono">${escapeHtml(camp.project_name || "Khmer Speech Study")}</div>
            <h3 class="text-sm font-bold text-zinc-900 mt-0.5">${escapeHtml(camp.name)}</h3>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${camp.is_active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-zinc-100 text-zinc-600 border border-zinc-200"}">
              ${camp.is_active ? "Active" : "Archived"}
            </span>
            <button
              type="button"
              class="btn-toggle-status text-[11px] px-2 py-0.5 border border-zinc-200 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 cursor-pointer"
              data-id="${camp.id}"
              data-active="${camp.is_active ? "1" : "0"}"
            >
              ${camp.is_active ? "Archive" : "Activate"}
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
          showToast(`Study marked as ${newStatus ? "Active" : "Archived"}.`, "success");
        } catch (err) {
          showToast("Error updating status: " + err.message, "error");
        }
      });

      // Delete Study
      card.querySelector(".btn-delete-card").addEventListener("click", () => {
        studyToDelete = camp;
        el.deleteStudyTitle.textContent = `"${camp.name}"`;
        el.modalDeleteStudy.classList.remove("hidden");
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