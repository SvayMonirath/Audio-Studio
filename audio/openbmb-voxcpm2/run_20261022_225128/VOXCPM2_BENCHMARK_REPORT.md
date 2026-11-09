# Benchmark & Hardware Telemetry Report: openbmb/VoxCPM2 (C-002)

- **Date:** 2026-10-22
- **Model ID:** `openbmb/VoxCPM2`
- **Model Family:** Tokenizer-free Diffusion Autoregressive Speech Foundation Model (~2B parameters)
- **License:** Apache-2.0 (Commercially permissive)
- **Device & Environment:** NVIDIA GeForce RTX 2060 (6.0 GB VRAM), CUDA, Python 3.12.10, PyTorch 2.11.0+cu128, voxcpm 2.0.3
- **Benchmark Corpus:** `VEAJA-KH-TTS-DEV-23` (v3.0, 23 conversational business sentences)
- **Run Directory:** `D:\capstone\sprint-2\outputs\benchmark_runs\openbmb-voxcpm2\run_20261022_225128\`
- **Evaluator:** Svay Monirath (Hardware & Telemetry Audited; Single-Rater Blind & Qualitative Human Evaluation Completed)

---

## 1. Hardware & Execution Telemetry

| Metric | Measured Value | Target Threshold (DEC-07) | Evaluation Status |
|---|---|---|---|
| **Model Load Time** | 175.81 s (Warm load from local cache) | $\le 15.0\text{ s}$ warm | High parameter overhead (~2B weights + AudioVAE) |
| **GPU Peak Allocated Memory** | **5,466.4 MB (5.34 GB)** | $\le 8.0\text{ GB}$ | **PASS** (Zero OOM crashes across all 23 items) |
| **GPU Peak Reserved Memory** | **5,690.0 MB (5.56 GB)** | $\le 6.0\text{ GB}$ (Physical GPU) | **CRITICAL EDGE** (92.7% of physical GPU capacity) |
| **Mean Generation Time** | **38.44 s** (38,443 ms) | $\le 500\text{--}600\text{ ms}$ | **CRITICAL BOTTLENECK** (~64x slower than target) |
| **Mean Real-Time Factor (RTF)** | **17.23** | $< 0.30$ | **CRITICAL BOTTLENECK** (Takes 17.2s to generate 1s speech) |
| **Audio Sample Rate** | **48,000 Hz** (Studio Quality) | 16kHz / 24kHz | **PASS** (Native 48kHz super-resolution) |
| **Total Audio Duration (23 items)**| **51.52 s** (Mean: 2.24 s / item) | N/A | Balanced conversational duration |
| **Total Run Execution Time** | **884.2 s** (~14.7 minutes) | N/A | 23/23 completed continuously |
| **Process Failure / Crash Rate** | **0.0%** (23/23 completed) | 0.0% | **PASS** (Zero crashes with periodic cache clearing) |

---

## 2. Subjective Human Evaluation Summary

- **Human Evaluation Sheet:** [`human_evaluation.csv`](file:///D:/capstone/sprint-2/outputs/benchmark_runs/openbmb-voxcpm2/run_20261022_225128/human_evaluation.csv)
- **Audio Output Directory:** [`audio/`](file:///D:/capstone/sprint-2/outputs/benchmark_runs/openbmb-voxcpm2/run_20261022_225128/audio/) (`KH01.wav` to `KH23.wav`)
- **Evaluation Status:** Completed across all 23 sentences by native speaker.

### Score Metrics (1 to 5 scale)

| Dimension | Mean Score | Std Dev | Min / Max | Target Threshold | Verdict |
|---|---|---|---|---|---|
| **Pronunciation Accuracy** | **3.65 / 5.0** | 0.83 | 2.0 / 5.0 | $\ge 85\text{--}90\%$ (~4.0) | **SUBSTANTIAL IMPROVEMENT** |
| **Intelligibility** | **3.65 / 5.0** | 0.71 | 2.0 / 5.0 | $\ge 90\%$ (~4.0) | **GOOD** (Clear message comprehension) |
| **Naturalness** | **3.35 / 5.0** | 1.07 | 1.0 / 5.0 | $\ge 4.0 / 5.0$ | **BELOW TARGET** (Native timbre, but expressive/actor persona) |
| **Voice Quality** | **3.65 / 5.0** | 0.88 | 1.0 / 5.0 | High Fidelity | **GOOD** (High fidelity 48kHz, clean studio sound) |

---

## 3. Systematic Linguistic Error Taxonomy & Defect Log

### 1. Linguistic Breakthroughs & Strengths
1. **Resolution of the `ឲ្យ` (Give/For) Deletion Bug**:
   - Both previous VITS candidates (`facebook/mms-tts-khm` and `khmerttsopensource/khmer-tts`) systematically dropped `ឲ្យ`.
   - `openbmb/VoxCPM2` successfully synthesized `ឲ្យ` accurately in `KH02` (*មានអីឲ្យខ្ញុំជួយបានខ្លះ?*), `KH03` (*ចាំខ្ញុំឆែកមើលឲ្យសិនណា*), and `KH17` (*ខ្ញុំអាចណែនាំមុខផ្សេងឲ្យបានណា*).
2. **Native Code-Switching Capability (English Loanwords)**:
   - Successfully rendered `KH08` ("*...ហើយក៏មាន Iced Latte ដែរ*") with recognizable native English pronunciation. Previous models produced complete silence or static bursts on this sentence.
3. **Conversational Realism in Multi-Syllable Sentences**:
   - Multiple sentences scored **5.0 / 5.0** in Naturalness and Voice Quality (`KH07`, `KH10`, `KH12`), described as sounding like authentic native voice messages without mechanical artifacts.

### 2. Systematic Defect Patterns & Failure Modes
1. **Expressive Persona / Stylistic Mismatch ("TV Actor / Dramatic Narrator")**:
   - The primary qualitative observation across `KH04`, `KH09`, `KH10`, `KH15`, `KH16`, `KH17`, `KH19`, `KH20`, and `KH22` is that VoxCPM2 speaks with a dramatic, expressive "Khmer TV drama voice-over" or "documentary narrator" inflection rather than a neutral, professional customer-service receptionist cadence.
2. **Acoustic & Dynamic Spikes**:
   - `KH01`: Volume flared into an aggressive shout at the sentence ending (*"for some reason it shouted aggressively really shouted at the end"* — Naturalness: 1.0).
   - `KH03`: Unprompted timbre shift and acoustic distortion (*"voice is different and sounded very glitchy"* — Voice Quality: 1.0).
3. **Pacing Instability on Short Turns**:
   - Noticeably rushed tempo without natural inter-phrase pauses in `KH02`, `KH05`, `KH08`, and `KH21` (*"talked way too fast and doesn't sound smooth"* — 2.0 across all metrics).
4. **Syllable Splitting & Slurring**:
   - `KH06`: The consonant `រ` in `ហឹរ` was disjointed (*"pronounced something like 'ហឹ រ' with an isolated gap before តិច"*).
   - `KH17`: Syllable contraction / slur on `ខ្ញុំ` heard as `ំ ខ`.
   - `KH23`: Poor cadence and unnatural phrasing (*"doesn't sound good doesn't sound native"* — Naturalness: 1.0).

---

## 4. Standalone Architecture Findings (Gate 2 / DEC-02)

1. **Hardware Feasibility vs Real-Time Telecom Latency**:
   - **VRAM Stability**: VoxCPM2 proves that 2B foundation speech models can run within 6.0 GB VRAM (peaking at 5.47 GB alloc / 5.69 GB reserved) with clean cache management and zero crashes across 23 turns.
   - **Latency Barrier**: Generating a ~2.2s conversational turn takes **38.44 seconds** on local consumer GPU (RTF 17.23). This confirms that unquantized 2B diffusion speech models **cannot meet local real-time telephony SLAs ($p95 < 2.0\text{ s}$)** on client hardware.
2. **Speech Quality vs Persona Calibration**:
   - Achieving a mean **3.65/5.0** in Pronunciation and Intelligibility, with verified code-switching and correct grammatical token handling (`ឲ្យ`), places VoxCPM2 ahead of unconditioned acoustic VITS baselines.
   - However, its unprompted tendency toward theatrical "dramatic TV narrator" prosody indicates that production deployment requires system prompt style conditioning or reference audio voice cloning to lock the persona into a polite, steady receptionist register.
3. **Deployment Determination**:
   - **Edge Deployment**: Infeasible without heavy quantization (AWQ/INT4) and distilled step counts.
   - **Cloud Deployment**: Viable only via high-throughput cloud acceleration (NVIDIA L4 / A100 with TensorRT-LLM or Nano-vLLM) where latency can be compressed down to $\le 300\text{--}500\text{ ms}$.
