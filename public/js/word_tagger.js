/**
 * word_tagger.js
 * Interactive Word Pill & Clinical Defect Tagging Component.
 * Supports:
 * 1. Tokenized word rendering with karaoke highlight synchronization.
 * 2. Instant popover dialog to tag clinical speech errors.
 * 3. Dynamic loading of 19 clinical error taxonomies.
 */

class WordTagger {
  constructor(containerEl, popoverEl, backdropEl) {
    this.container = containerEl;
    this.popover = popoverEl;
    this.backdrop = backdropEl;

    this.tokens = [];
    this.taxonomies = [];
    this.activeDefects = new Map(); // wordIndex -> { word_index, word_text, error_code, note }
    this.selectedWordIndex = null;
    this.onChangeCallback = null;
  }

  setTaxonomies(taxList) {
    this.taxonomies = taxList;
    this.populateTaxonomySelect();
  }

  populateTaxonomySelect() {
    const select = document.getElementById("popover-error-select");
    if (!select) return;

    select.innerHTML = "";
    // Group by category
    const categories = {};
    for (const tax of this.taxonomies) {
      const cat = tax.category || "General";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(tax);
    }

    for (const [cat, items] of Object.entries(categories)) {
      const group = document.createElement("optgroup");
      group.label = cat.toUpperCase();
      for (const item of items) {
        const opt = document.createElement("option");
        opt.value = item.code;
        opt.textContent = `${item.code} — ${item.name_en} (${item.name_km})`;
        opt.dataset.color = item.badge_color || "#EF4444";
        group.appendChild(opt);
      }
      select.appendChild(group);
    }
  }

  loadSentence(text, existingDefects = []) {
    this.tokens = window.tokenizer.tokenize(text);
    this.activeDefects.clear();

    if (existingDefects && Array.isArray(existingDefects)) {
      for (const d of existingDefects) {
        this.activeDefects.set(d.word_index, d);
      }
    }

    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = "";

    if (this.tokens.length === 0) {
      this.container.innerHTML = "<p class='text-sm text-zinc-400 italic'>No words in this prompt.</p>";
      return;
    }

    this.tokens.forEach((token, idx) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "word-pill";
      pill.dataset.index = idx;

      const defect = this.activeDefects.get(idx);
      if (defect && defect.error_code !== "NONE") {
        pill.classList.add("has-defect");
      }

      const wordSpan = document.createElement("span");
      wordSpan.textContent = token.text;
      pill.appendChild(wordSpan);

      if (defect && defect.error_code !== "NONE") {
        const dot = document.createElement("span");
        dot.className = "defect-dot";
        pill.appendChild(dot);

        const badge = document.createElement("span");
        badge.className = "text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold";
        badge.textContent = defect.error_code;
        pill.appendChild(badge);
      }

      pill.addEventListener("click", () => this.openPopover(idx));
      this.container.appendChild(pill);
    });

    this.renderDefectRibbon();
  }

  renderDefectRibbon() {
    const ribbon = document.getElementById("defect-tag-ribbon");
    if (!ribbon) return;

    ribbon.innerHTML = "";
    const defects = Array.from(this.activeDefects.values()).filter(d => d.error_code !== "NONE");

    if (defects.length === 0) {
      ribbon.innerHTML = `
        <div class="flex items-center gap-2 text-xs text-zinc-400 italic">
          <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <span data-i18n="noDefectsTagged">No defects tagged yet. Audio is clean.</span>
        </div>
      `;
      I18N.applyToDOM();
      return;
    }

    defects.forEach(defect => {
      const item = document.createElement("div");
      item.className = "inline-flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 text-xs px-2.5 py-1 rounded-lg";
      item.innerHTML = `
        <span class="font-semibold">${defect.word_text}</span>
        <span class="font-mono bg-red-200 text-red-900 px-1 rounded text-[10px]">${defect.error_code}</span>
        ${defect.note ? `<span class="text-zinc-600 truncate max-w-[150px]">"${defect.note}"</span>` : ""}
        <button type="button" class="text-red-400 hover:text-red-700 text-sm ml-1">&times;</button>
      `;

      item.querySelector("button").addEventListener("click", (e) => {
        e.stopPropagation();
        this.activeDefects.delete(defect.word_index);
        this.render();
        if (this.onChangeCallback) this.onChangeCallback(this.getDefectsList());
      });

      ribbon.appendChild(item);
    });
  }

  openPopover(wordIndex) {
    this.selectedWordIndex = wordIndex;
    const token = this.tokens[wordIndex];
    if (!token) return;

    const wordEl = document.getElementById("popover-word-title");
    const noteEl = document.getElementById("popover-note-input");
    const selectEl = document.getElementById("popover-error-select");
    const removeBtn = document.getElementById("popover-remove-btn");

    if (wordEl) wordEl.textContent = `"${token.text}"`;

    const existing = this.activeDefects.get(wordIndex);
    if (existing) {
      if (selectEl) selectEl.value = existing.error_code;
      if (noteEl) noteEl.value = existing.note || "";
      if (removeBtn) removeBtn.style.display = "inline-flex";
    } else {
      if (selectEl) selectEl.value = "V_DEL_INS"; // sensible clinical default
      if (noteEl) noteEl.value = "";
      if (removeBtn) removeBtn.style.display = "none";
    }

    this.popover.style.display = "block";
    this.backdrop.style.display = "block";
    if (noteEl) noteEl.focus();
  }

  closePopover() {
    this.popover.style.display = "none";
    this.backdrop.style.display = "none";
    this.selectedWordIndex = null;
  }

  applyPopoverTag() {
    if (this.selectedWordIndex === null) return;
    const token = this.tokens[this.selectedWordIndex];
    if (!token) return;

    const selectEl = document.getElementById("popover-error-select");
    const noteEl = document.getElementById("popover-note-input");

    const code = selectEl ? selectEl.value : "NONE";
    const note = noteEl ? noteEl.value.trim() : "";

    this.activeDefects.set(this.selectedWordIndex, {
      word_index: this.selectedWordIndex,
      word_text: token.text,
      error_code: code,
      note: note
    });

    this.closePopover();
    this.render();
    if (this.onChangeCallback) {
      this.onChangeCallback(this.getDefectsList());
    }
  }

  removePopoverTag() {
    if (this.selectedWordIndex === null) return;
    this.activeDefects.delete(this.selectedWordIndex);
    this.closePopover();
    this.render();
    if (this.onChangeCallback) {
      this.onChangeCallback(this.getDefectsList());
    }
  }

  getDefectsList() {
    return Array.from(this.activeDefects.values());
  }

  updateKaraoke(currentTime, totalDuration) {
    if (!totalDuration || totalDuration <= 0) return;
    const progress = Math.max(0, Math.min(1, currentTime / totalDuration));
    const tokenCount = this.tokens.length;
    if (tokenCount === 0) return;

    const activeIndex = Math.min(tokenCount - 1, Math.floor(progress * tokenCount));

    const pills = this.container.querySelectorAll(".word-pill");
    pills.forEach((p, idx) => {
      if (idx === activeIndex) {
        p.classList.add("active-karaoke");
      } else {
        p.classList.remove("active-karaoke");
      }
    });
  }
}

// Global Word Tagger instance
window.WordTagger = WordTagger;
