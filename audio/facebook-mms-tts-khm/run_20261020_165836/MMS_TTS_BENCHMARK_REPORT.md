# Benchmark & Evaluation Report: facebook/mms-tts-khm (C-001)

- **Date:** 2026-10-20
- **Model ID:** `facebook/mms-tts-khm` (Meta MMS-TTS Khmer VITS Checkpoint)
- **Model Family:** VITS / Monotonic Alignment Search
- **License:** CC-BY-NC 4.0 (Non-commercial research only)
- **Device & Environment:** CUDA GPU, Python 3.12.10, PyTorch 2.11.0+cu128, transformers 5.19.0
- **Benchmark Corpus:** `VEAJA-KH-TTS-DEV-23` (v3.0, 23 conversational business sentences)
- **Run Directory:** `D:\capstone\sprint-2\outputs\benchmark_runs\facebook-mms-tts-khm\run_20261020_165836\`
- **Evaluator:** Svay Monirath (Native Khmer Speaker, Single-Rater Screening)

---

## 1. Hardware & Execution Telemetry

| Metric | Measured Value | Target Threshold (DEC-07) | Evaluation Status |
|---|---|---|---|
| **Model Load Time** | 2.90 s | $\le 15.0\text{ s}$ | **PASS** (Fast cold load) |
| **GPU Peak Allocated Memory** | 250.4 MB | $\le 8.0\text{ GB}$ | **PASS** (Extremely lightweight) |
| **GPU Peak Reserved Memory** | 422.0 MB | $\le 8.0\text{ GB}$ | **PASS** |
| **Cold-Start Generation (KH01)** | 4.04 s (RTF 2.21) | $\le 3.0\text{ s}$ | Marginal (Kernel init penalty) |
| **Warm Mean Generation Time** | **153.4 ms** | $\le 500\text{--}600\text{ ms}$ | **EXCELLENT** |
| **Warm Mean Real-Time Factor (RTF)** | **0.0498** (~0.05) | $< 0.30$ | **EXCELLENT** (20x real-time) |
| **Total Audio Synthesized (23 items)**| 76.3 s (Mean: 3.32 s / item) | N/A | Full synthesis completed |
| **Process Crash / Failure Rate** | 0.0% (23/23 completed) | 0.0% | **PASS** (Zero crashes) |

---

## 2. Subjective Human Evaluation Summary (Native Rater)

Scoring Scale: 1 (Very Poor / Unusable) to 5 (Excellent / Native). Evaluated blindly and qualitatively on audio files `KH01.wav` to `KH23.wav`.

| Evaluation Dimension | Mean Score (1–5) | Min / Max | Observations & Quality Bar |
|---|---|---|---|
| **Naturalness** | **1.00 / 5.0** | 1.0 / 1.0 | Uniformly rated 1/5. Pacing is unnatural, robotic, flat cadence resembling theatrical recitation rather than conversational Khmer. |
| **Voice Quality** | **1.57 / 5.0** | 1.0 / 3.0 | Unnatural acoustic artifacts, glitched pauses between syllables, harsh synthetic texture. |
| **Pronunciation Accuracy** | **1.87 / 5.0** | 1.0 / 4.0 | Frequent phonetic distortions; cannot adapt written graphemes to spoken realities. |
| **Intelligibility / Comprehension** | **2.09 / 5.0** | 1.0 / 3.0 | Listeners struggle to comprehend without reading the text prompt in advance. |

---

## 3. Systematic Error Taxonomy & Defect Breakdown

### A. Literal Orthography vs. Spoken Realization (Grapheme-to-Phoneme Defect)
Raw MMS-TTS attempts to pronounce the literal written characters rather than standard Cambodian spoken phonetics:
- **`KH11` & `KH14` (`តម្លៃ` - Price)**: Pronounced strictly as written (*ta-mlai*) instead of natural spoken **ដម្លៃ** (*dam-lai*).
- **`KH13` (`ដុល្លារ` - Dollar)**: Pronounced literally character-by-character instead of standard spoken **ដុឡា** (*do-la*).

### B. Phoneme & Token Omission / Hallucination
- **Omission of Indirect Object Marker `ឲ្យ` (to give / for)**:
  - `KH02`: Input `មានអីឲ្យខ្ញុំជួយបានខ្លះ?` $\rightarrow$ Synthesized without `ឲ្យ` (*"មានអីខ្ញុំជួយបានខ្លះ?"*).
  - `KH03`: Input `ចាំខ្ញុំឆែកមើលឲ្យសិនណា` $\rightarrow$ Synthesized without `ឲ្យ` (*"ចាំខ្ញុំឆែកមើលសិនណា"*).
  - `KH17`: Input `ខ្ញុំអាចណែនាំមុខផ្សេងឲ្យបានណា` $\rightarrow$ Completely dropped `ឲ្យ` and hallucinated `ផ្សេង` twice (*"មុខផ្សេងផ្សេងបានណា"*).
- **Phonetic Distortion / Word Substitution**:
  - `KH04`: `បង` heard distinctly as `គោ` (*cow*).
  - `KH05`: `ថ្ងៃនេះ` mispronounced as `ត្រែងនេះ`, and `អីខ្លះ` completely mangled into `ពេកផ្លា`.
  - `KH18`: In `បងចង់កក់តុមែនទេ?`, the key verb phrase `កក់តុ` (*book table*) was unrecognizable noise.

### C. Acoustic Glitching & Sub-syllable Disjointing
- `KH06`: In `បងចូលចិត្តហឹរតិច ឬហឹរខ្លាំង?`, the consonant `រ` in `ហឹរ` was split out as an isolated sound, followed by a glitched pause before `តិច`.
- `KH16`: In `ចង់កុម្ម៉ង់ប៉ុន្មានចាន?`, the word `កុម្ម៉ង់` split into two distinct unnatural words `កំុ ម្ម៉ង់`.

### D. Code-Switching & Foreign Loanwords
- `KH08`: Input containing English code-switching `Iced Latte` failed completely; the model dropped/garbled the words into silence/unintelligible noise.

---

## 4. Screening Decision & Gate 2 Verdict (DEC-02)

- **Verdict:** **UNVIABLE AS DIRECT PRODUCTION PRIMARY VOICE**.
- **Role in Project:** Retained strictly as an **Empirical Baseline Floor & Academic Reference**.
- **Key Takeaway for Sprint 2:** 
  MMS-TTS provides great throughput (RTF ~0.05, 250MB VRAM), proving that lightweight VITS architectures run fast on GPU. However, raw acoustic quality is unacceptable. 
  Next step must test:
  1. Whether a Khmer-specific community fine-tune (`khmerttsopensource/khmer-tts`) resolves these VITS pronunciation/robotic errors.
  2. Or whether modern autoregressive architectures (`openbmb/VoxCPM2`) achieve naturalness $\ge 4.0$.
