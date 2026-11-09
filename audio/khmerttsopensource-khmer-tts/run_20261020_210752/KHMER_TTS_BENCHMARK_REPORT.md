# Benchmark & Evaluation Report: khmerttsopensource/khmer-tts (C-003)

- **Date:** 2026-10-20
- **Model ID:** `khmerttsopensource/khmer-tts`
- **Model Family:** VITS / Monotonic Alignment Search (Khmer Fine-Tuned Checkpoint)
- **License:** CC-BY-NC 4.0 (Non-commercial research only)
- **Device & Environment:** NVIDIA GeForce RTX 2060 (6.0 GB VRAM), CUDA, Python 3.12.10, PyTorch 2.11.0+cu128, transformers 5.19.0
- **Benchmark Corpus:** `VEAJA-KH-TTS-DEV-23` (v3.0, 23 conversational business sentences)
- **Run Directory:** `D:\capstone\sprint-2\outputs\benchmark_runs\khmerttsopensource-khmer-tts\run_20261020_210752\`
- **Evaluator:** Svay Monirath (Native Khmer Speaker, Single-Rater Blind & Qualitative Evaluation)

---

## 1. Hardware & Execution Telemetry

| Metric | Measured Value | Target Threshold (DEC-07) | Evaluation Status |
|---|---|---|---|
| **Model Load Time** | 444.65 s (includes initial HF download) | $\le 15.0\text{ s}$ warm | Weights downloaded & verified |
| **GPU Peak Allocated Memory** | **224.2 MB** | $\le 8.0\text{ GB}$ | **PASS** (Extremely lightweight) |
| **GPU Peak Reserved Memory** | **248.0 MB** | $\le 8.0\text{ GB}$ | **PASS** |
| **Cold-Start Generation (KH01)** | 4.42 s (RTF 3.29) | $\le 3.0\text{ s}$ | Cold kernel compilation penalty |
| **Warm Mean Generation Time** | **139.6 ms** | $\le 500\text{--}600\text{ ms}$ | **PASS** (Low latency) |
| **Warm Mean Real-Time Factor (RTF)** | **0.0672** (~0.07) | $< 0.30$ | **PASS** (~15x real-time speed) |
| **Total Audio Synthesized (23 items)**| **50.2 s** (Mean: 2.18 s / item) | N/A | Full synthesis completed |
| **Process Failure / Crash Rate** | **0.0%** (23/23 completed) | 0.0% | **PASS** |

---

## 2. Subjective Human Evaluation Summary (Native Rater)

Scoring Scale: 1 (Very Poor / Unusable) to 5 (Excellent / Native). Evaluated blindly and recorded in `human_evaluation.csv`.

| Evaluation Dimension | Mean Score (1–5) | Min / Max | Observations & Target Alignment |
|---|---|---|---|
| **Naturalness** | **2.17 / 5.0** | 1.0 / 3.0 | Target: $\ge 4.0$. Speech is smooth and lacks mechanical drone, but pacing is severely rushed. |
| **Voice Quality** | **2.35 / 5.0** | 2.0 / 3.0 | Moderate acoustic quality; slight static artifacts, but relatively clean vocal timbre. |
| **Pronunciation Accuracy** | **2.35 / 5.0** | 1.0 / 3.0 | Target: $\ge 85\text{--}90\%$. Basic restaurant terms pronounced adequately, but drops tokens and clips word endings. |
| **Intelligibility / Comprehension** | **2.57 / 5.0** | 2.0 / 3.0 | Target: $\ge 90\%$. Message generally understandable, but fast delivery requires listener strain. |

---

## 3. Systematic Error Taxonomy & Defect Breakdown

### A. Speaking Rate & Pacing Defects (Primary Failure Mode)
- **Excessive Speaking Speed**: The model synthesizes at an unnaturally rapid pace across almost all 23 sentences.
- **Word-Final Truncation / Clipping**:
  - `KH01`: Final consonant in `បង` was cut short, sounding like *ប*.
  - `KH21`: Sentence-ending polite particle `ដែរ` was clipped off.
- **Non-Native Cadence Artifacts**: Rapid pacing creates an accent reminiscent of a non-native foreigner speaking Khmer quickly (`KH16`, `KH19`, `KH20`).

### B. Token Omission & Alignment Defects
- **Omission of Indirect Object Marker `ឲ្យ` (to give / for)**:
  - `KH02`: Input `មានអីឲ្យខ្ញុំជួយបានខ្លះ?` $\rightarrow$ Synthesized without `ឲ្យ` (*"មានអីខ្ញុំជួយបានខ្លះ?"*).
  - `KH03`: Input `ចាំខ្ញុំឆែកមើលឲ្យសិនណា` $\rightarrow$ Synthesized without `ឲ្យ` (*"ចាំខ្ញុំឆែកមើលសិនណា"*).
  - Acoustic alignment fails to realize the token `ឲ្យ` in conversational contexts.

### C. Pitch, Tone & Prosody Irregularities
- `KH22`: In `ម៉ោងប្រាំមួយកន្លះល្ងាច`, the model experienced an unnatural acceleration between `កន្លះ` and `ល្ងាច` accompanied by an inappropriate pitch rise.
- `KH23`: In `ម៉ោងប្រាំមួយអត់មានតុទេ...`, the word `តុ` was unclear and emotional intonation was flat.

### D. Code-Switching & Foreign Loanwords
- `KH08`: English loanword `Iced Latte` failed completely; the model output static and silence. Model vocabulary lacks English phonetic representations.

---

## 4. Screening Decision & Gate 2 Verdict (DEC-02)

- **Verdict:** **STANDALONE SCREENING COMPLETED — BELOW PRODUCTION NATURALNESS THRESHOLD**.
- **Assessment Against Project Criteria**:
  - **Hardware / Latency**: **PASS** (139.6 ms warm delay, RTF 0.067, 224 MB VRAM).
  - **Voice Quality & Naturalness**: **FAIL** (Naturalness 2.17 / 5.0 vs Target $\ge 4.0$).
  - **Linguistic Reliability**: **FAIL** (Drops `ឲ្យ`, clips word endings due to rushed pacing, fails English loanwords).
- **Status in Candidate Queue**: Admitted to Candidate Register as an evaluated checkpoint. Final multi-model comparison matrix will be synthesized after all priority candidates are benchmarked.
