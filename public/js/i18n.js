/**
 * i18n.js
 * Bilingual translation dictionaries (English and ភាសាខ្មែរ)
 * for the Speech Evaluation & Acoustic Engineering Studio.
 */

const I18N = {
  currentLang: "en",

  dict: {
    en: {
      brand: "Veaja Studio",
      brandSub: "Speech Evaluation & Acoustic Engineering",
      langToggle: "ភាសាខ្មែរ",
      raterLabel: "Rater:",
      changeRater: "Change",
      selectRaterModalTitle: "Select or Enter Evaluator Name",
      raterNamePlaceholder: "Your full name (e.g. Bora, Monirath)",
      startTestingBtn: "Start Testing",
      projectLabel: "Project:",
      campaignLabel: "Campaign:",
      
      // Nav
      navEvaluation: "Evaluation",
      navInspector: "Acoustic Inspector",
      navSuites: "Test Suites",
      navModels: "Candidate Models",
      navTaxonomy: "Clinical Taxonomy",
      navAdmin: "Admin Consensus",

      // Item Header
      itemPrefix: "Item",
      categoryPrefix: "Category:",
      intentPrefix: "Intent:",
      coveragePrefix: "Tags:",
      targetIpa: "Target IPA:",
      challenge: "Linguistic Challenge:",

      // Word Tagger
      clickWordTip: "Click any word pill to tag defects or leave clinical error notes.",
      tagDefectTitle: "Tag Speech Defect on",
      errorCodeLabel: "Clinical Error Code:",
      noteLabel: "Evaluator Note (Optional):",
      applyTagBtn: "Apply Tag",
      removeTagBtn: "Remove Tag",
      cancelBtn: "Cancel",
      noDefectsTagged: "No defects tagged yet. Audio is clean.",

      // Transcription
      transcriptionTitle: "Objective Listener Transcription (Blind Test)",
      transcriptionPlaceholder: "Type exactly what you heard without guessing...",
      transcriptionNote: "Record omissions, replaced words, or mispronounced numbers.",

      // Inspector & Controls
      audioControlsTitle: "Audio Controls",
      volumeLabel: "Volume",
      speedLabel: "Playback Speed",
      phoneFilterLabel: "8 kHz Telephone Line Simulation",
      phoneFilterDesc: "Biquad bandpass filter (300 Hz – 3,400 Hz) simulating Cambodian mobile cellular audio.",
      phoneFilterActive: "ACTIVE (300 - 3,400 Hz)",
      phoneFilterOff: "OFF (Full Bandwidth)",
      hardwareTelemetryTitle: "Acoustic & Hardware Telemetry",
      latencyLabel: "Latency:",
      rtfLabel: "Real-Time Factor (RTF):",
      vramLabel: "Peak VRAM:",
      sampleRateLabel: "Sample Rate:",
      spectrogramTitle: "Real-Time Frequency Spectrogram",

      // Dock & Scoring
      take1: "Candidate A",
      take2: "Candidate B",
      take1Better: "Take 1 is better",
      take2Better: "Take 2 is better",
      bothGood: "Both are good",
      bothBad: "Both are bad",
      scoringTitle: "ITU-T P.85 Category Rating (1–5)",
      btnPronunciation: "Pronunciation",
      btnIntelligibility: "Intelligibility",
      btnNaturalness: "Naturalness",
      btnVoiceQuality: "Voice Quality",
      btnReplay: "Replay [Space]",
      btnSaveNext: "Save & Next [Enter]",
      saving: "Saving...",
      saved: "Saved!",

      // Admin
      adminDashboardTitle: "Evaluation Consensus & Defect Analytics",
      totalEvals: "Total Submissions",
      totalRaters: "Active Evaluators",
      mosScorecard: "Candidate Mean Opinion Score (MOS) Summary (95% CI)",
      defectHeatmapTitle: "Word-Level Defect Frequency Matrix",
      recentSubmissions: "Recent Evaluations Ledger",
      exportCsvBtn: "Export scoring_sheet_v2.csv",
      noEvalsYet: "No evaluations submitted yet. Begin testing to populate consensus analytics."
    },

    km: {
      brand: "វីចា ស្ទូឌីយោ",
      brandSub: "ប្រព័ន្ធវាយតម្លៃសំឡេង និងវិស្វកម្មសូរសព្ទ",
      langToggle: "English",
      raterLabel: "អ្នកវាយតម្លៃ៖",
      changeRater: "ប្តូរ",
      selectRaterModalTitle: "ជ្រើសរើស ឬបញ្ចូលឈ្មោះអ្នកវាយតម្លៃ",
      raterNamePlaceholder: "ឈ្មោះរបស់អ្នក (ឧទាហរណ៍៖ បូរ៉ា, មុនីរ័ត្ន)",
      startTestingBtn: "ចាប់ផ្តើមការវាយតម្លៃ",
      projectLabel: "គម្រោង៖",
      campaignLabel: "យុទ្ធនាការ៖",

      // Nav
      navEvaluation: "ការវាយតម្លៃ",
      navInspector: "វិភាគសូរសព្ទ",
      navSuites: "កម្រងប្រយោគតេស្ត",
      navModels: "ម៉ូឌែលបេក្ខភាព",
      navTaxonomy: "ចំណាត់ថ្នាក់កំហុស (Taxonomy)",
      navAdmin: "ផ្ទាំងគ្រប់គ្រងទិន្នន័យ (Admin)",

      // Item Header
      itemPrefix: "លំហាត់តេស្ត",
      categoryPrefix: "ប្រភេទ៖",
      intentPrefix: "គោលបំណង៖",
      coveragePrefix: "ស្លាកសម្គាល់៖",
      targetIpa: "សូរសព្ទ IPA គោលដៅ៖",
      challenge: "ឧបសគ្គភាសាវិទ្យា៖",

      // Word Tagger
      clickWordTip: "ចុចលើពាក្យនីមួយៗដើម្បីសម្គាល់កំហុស ឬសរសេរកំណត់ចំណាំបច្ចេកទេស។",
      tagDefectTitle: "កំណត់កំហុសលើពាក្យ",
      errorCodeLabel: "កូដកំហុសគ្លីនិក៖",
      noteLabel: "កំណត់ចំណាំរបស់អ្នកវាយតម្លៃ (ស្រេចចិត្ត)៖",
      applyTagBtn: "រក្សាទុកកំហុស",
      removeTagBtn: "លុបកំហុសចេញ",
      cancelBtn: "បោះបង់",
      noDefectsTagged: "មិនទាន់មានការសម្គាល់កំហុសទេ។ សំឡេងនេះច្បាស់ល្អ។",

      // Transcription
      transcriptionTitle: "ការកត់ត្រាពាក្យដែលបានឮជាក់ស្តែង (Blind Test)",
      transcriptionPlaceholder: "វាយបញ្ចូលពាក្យដែលអ្នកបានឮជាក់ស្តែងដោយមិនទស្សន៍ទាយ...",
      transcriptionNote: "កត់ត្រាពាក្យដែលបាត់ ពាក្យអានច្រឡំ ឬលេខដែលបញ្ចេញសំឡេងមិនត្រឹមត្រូវ។",

      // Inspector & Controls
      audioControlsTitle: "ការគ្រប់គ្រងសំឡេង",
      volumeLabel: "កម្រិតសំឡេង",
      speedLabel: "ល្បឿននៃការចាក់",
      phoneFilterLabel: "តេស្តខ្សែទូរស័ព្ទចល័ត 8 kHz",
      phoneFilterDesc: "តម្រងប្រេកង់កាត់កម្រិត (300 Hz – 3,400 Hz) ដើម្បីពិសោធន៍លើប្រព័ន្ធទូរស័ព្ទកម្ពុជាជាក់ស្តែង។",
      phoneFilterActive: "កំពុងដំណើរការ (300 - 3,400 Hz)",
      phoneFilterOff: "បិទ (កម្រិតពេញលេញ)",
      hardwareTelemetryTitle: "ទិន្នន័យបច្ចេកវិទ្យា និងគ្រឿងម៉ាស៊ីន (Hardware)",
      latencyLabel: "រយៈពេលរង់ចាំ (Latency)៖",
      rtfLabel: "កត្តាពេលវេលាជាក់ស្តែង (RTF)៖",
      vramLabel: "ទំហំ VRAM អតិបរមា៖",
      sampleRateLabel: "កម្រិតដង់ស៊ីតេសំឡេង (Sample Rate)៖",
      spectrogramTitle: "ក្រាហ្វិកប្រេកង់សំឡេងផ្ទាល់ (Spectrogram)",

      // Dock & Scoring
      take1: "បេក្ខភាព ទី១",
      take2: "បេក្ខភាព ទី២",
      take1Better: "ទី១ ល្អជាង",
      take2Better: "ទី២ ល្អជាង",
      bothGood: "ល្អទាំងពីរ",
      bothBad: "មិនល្អទាំងពីរ",
      scoringTitle: "ការវាយតម្លៃកម្រិតគុណភាព ITU-T P.85 (១ ដល់ ៥)",
      btnPronunciation: "ការបញ្ចេញសំឡេង",
      btnIntelligibility: "ភាពងាយយល់",
      btnNaturalness: "ភាពធម្មជាតិ",
      btnVoiceQuality: "គុណភាពសម្លេង",
      btnReplay: "ចាក់ឡើងវិញ [Space]",
      btnSaveNext: "រក្សាទុក & បន្ត [Enter]",
      saving: "កំពុងរក្សាទុក...",
      saved: "បានរក្សាទុក!",

      // Admin
      adminDashboardTitle: "ផ្ទាំងវិភាគ និងការស្រុះស្រួលនៃពិន្ទុ (Consensus Analytics)",
      totalEvals: "ចំនួនការវាយតម្លៃសរុប",
      totalRaters: "ចំនួនអ្នកវាយតម្លៃសកម្ម",
      mosScorecard: "តារាងពិន្ទុមធ្យម MOS របស់ម៉ូឌែលនីមួយៗ (95% CI)",
      defectHeatmapTitle: "ម៉ាទ្រីសកំហុសតាមពាក្យនីមួយៗ (Defect Heatmap)",
      recentSubmissions: "បញ្ជីការវាយតម្លៃចុងក្រោយ",
      exportCsvBtn: "ទាញយកឯកសារ scoring_sheet_v2.csv",
      noEvalsYet: "មិនទាន់មានការវាយតម្លៃណាមួយត្រូវបានបញ្ចូលទេ។ សូមចាប់ផ្តើមវាយតម្លៃដើម្បីមើលលទ្ធផល។"
    }
  },

  t(key) {
    const lang = this.currentLang;
    if (this.dict[lang] && this.dict[lang][key]) {
      return this.dict[lang][key];
    }
    return this.dict["en"][key] || key;
  },

  setLang(lang) {
    if (lang === "km" || lang === "en") {
      this.currentLang = lang;
      localStorage.setItem("veaja_studio_lang", lang);
      this.applyToDOM();
    }
  },

  init() {
    const saved = localStorage.getItem("veaja_studio_lang");
    if (saved) {
      this.currentLang = saved;
    }
    this.applyToDOM();
  },

  applyToDOM() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      el.textContent = this.t(key);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", this.t(key));
    });

    const toggleBtn = document.getElementById("lang-toggle-btn");
    if (toggleBtn) {
      toggleBtn.textContent = this.currentLang === "en" ? "ភាសាខ្មែរ" : "English";
    }
  }
};
