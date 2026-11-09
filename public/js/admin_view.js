/**
 * admin_view.js
 * Executive Admin Dashboard & Defense Slide Export Component.
 * Computes live rater consensus, Mean Opinion Score (MOS) with 95% confidence intervals,
 * and word-level defect frequency heatmaps.
 */

class AdminView {
  constructor(containerEl) {
    this.container = containerEl;
  }

  async loadSummary(campaignId = null) {
    let url = "/api/admin/summary";
    if (campaignId) url += `?campaign_id=${encodeURIComponent(campaignId)}`;

    try {
      const resp = await fetch(url);
      const data = await resp.json();
      this.render(data);
    } catch (err) {
      console.error("Error loading admin summary:", err);
      if (this.container) {
        this.container.innerHTML = `<div class="p-8 text-center text-red-500">Failed to load admin summary: ${err.message}</div>`;
      }
    }
  }

  render(data) {
    if (!this.container) return;

    const { total_evaluations, total_raters, model_statistics, defects_summary, word_defect_heatmap } = data;

    let html = `
      <div class="space-y-6">
        <!-- Top Metrics Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="studio-card p-5">
            <div class="text-xs font-medium text-zinc-500 uppercase tracking-wider" data-i18n="totalEvals">Total Submissions</div>
            <div class="text-3xl font-bold text-zinc-900 mt-2">${total_evaluations}</div>
            <div class="text-xs text-zinc-400 mt-1">Across all registered raters</div>
          </div>
          <div class="studio-card p-5">
            <div class="text-xs font-medium text-zinc-500 uppercase tracking-wider" data-i18n="totalRaters">Active Evaluators</div>
            <div class="text-3xl font-bold text-zinc-900 mt-2">${total_raters}</div>
            <div class="text-xs text-zinc-400 mt-1">Verified native listeners</div>
          </div>
          <div class="studio-card p-5 flex flex-col justify-between">
            <div>
              <div class="text-xs font-medium text-zinc-500 uppercase tracking-wider">Formal Data Export</div>
              <div class="text-xs text-zinc-400 mt-1">Export complete trial ledger for thesis records</div>
            </div>
            <a href="/api/admin/export.csv" download="veaja_tts_evaluations.csv" class="btn-carbon mt-3 text-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              <span data-i18n="exportCsvBtn">Export scoring_sheet_v2.csv</span>
            </a>
          </div>
        </div>

        <!-- Candidate MOS Scorecard -->
        <div class="studio-card p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-base font-semibold text-zinc-900" data-i18n="mosScorecard">Candidate Mean Opinion Score (MOS) Summary (95% CI)</h3>
              <p class="text-xs text-zinc-500 mt-0.5">Calculated using ITU-T P.85 statistical methodology with Student's t margin of error.</p>
            </div>
          </div>

          ${model_statistics.length === 0 ? `
            <div class="py-8 text-center text-sm text-zinc-400 italic" data-i18n="noEvalsYet">No evaluations submitted yet. Begin testing to populate consensus analytics.</div>
          ` : `
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm border-collapse">
                <thead>
                  <tr class="border-b border-zinc-200 text-xs text-zinc-500 uppercase">
                    <th class="py-3 px-3">Candidate Model</th>
                    <th class="py-3 px-3">Code</th>
                    <th class="py-3 px-3">Trials (N)</th>
                    <th class="py-3 px-3">Pronunciation (MOS)</th>
                    <th class="py-3 px-3">Intelligibility (MOS)</th>
                    <th class="py-3 px-3">Naturalness (MOS)</th>
                    <th class="py-3 px-3">Voice Quality (MOS)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  ${model_statistics.map(m => {
                    const s = m.summary || {};
                    const formatMOS = (metricKey) => {
                      const item = s[metricKey];
                      if (!item) return `<span class="text-zinc-300">-</span>`;
                      return `<span class="font-semibold text-zinc-900">${item.mean.toFixed(2)}</span> <span class="text-[11px] text-zinc-400">[${item.ci_lower} - ${item.ci_upper}]</span>`;
                    };

                    return `
                      <tr class="hover:bg-zinc-50/50">
                        <td class="py-3 px-3 font-medium text-zinc-900">${m.name}</td>
                        <td class="py-3 px-3 font-mono text-xs text-zinc-500">${m.code}</td>
                        <td class="py-3 px-3 text-zinc-700">${m.eval_count}</td>
                        <td class="py-3 px-3">${formatMOS("pronunciation")}</td>
                        <td class="py-3 px-3">${formatMOS("intelligibility")}</td>
                        <td class="py-3 px-3">${formatMOS("naturalness")}</td>
                        <td class="py-3 px-3">${formatMOS("voice_quality")}</td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- Defect Analysis Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Top Clinical Error Codes -->
          <div class="studio-card p-6">
            <h3 class="text-base font-semibold text-zinc-900 mb-2">Clinical Defect Breakdown by Candidate</h3>
            <p class="text-xs text-zinc-500 mb-4">Frequency of the 19 standardized clinical errors tagged across models.</p>

            ${defects_summary.length === 0 ? `
              <div class="py-8 text-center text-sm text-zinc-400 italic">No defects tagged yet.</div>
            ` : `
              <div class="space-y-3">
                ${defects_summary.slice(0, 10).map(d => `
                  <div class="flex items-center justify-between text-xs p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                    <div class="flex items-center gap-2">
                      <span class="font-mono font-semibold px-2 py-0.5 rounded text-white text-[10px]" style="background-color: ${d.badge_color || '#EF4444'}">${d.error_code}</span>
                      <span class="font-medium text-zinc-800">${d.name_en || d.error_code}</span>
                      <span class="text-zinc-400">(${d.model_name})</span>
                    </div>
                    <span class="font-semibold text-zinc-900">${d.count} occurrence${d.count > 1 ? 's' : ''}</span>
                  </div>
                `).join("")}
              </div>
            `}
          </div>

          <!-- Word-Level Defect Heatmap -->
          <div class="studio-card p-6">
            <h3 class="text-base font-semibold text-zinc-900 mb-2" data-i18n="defectHeatmapTitle">Word-Level Defect Frequency Matrix</h3>
            <p class="text-xs text-zinc-500 mb-4">Specific Khmer prompt words that consistently trigger acoustic failures.</p>

            ${word_defect_heatmap.length === 0 ? `
              <div class="py-8 text-center text-sm text-zinc-400 italic">No word-level failures recorded yet.</div>
            ` : `
              <div class="space-y-2">
                ${word_defect_heatmap.slice(0, 8).map(w => `
                  <div class="flex items-center justify-between text-xs p-2.5 rounded-lg border border-red-100 bg-red-50/50">
                    <div class="flex items-center gap-3">
                      <span class="text-sm font-semibold text-red-950 font-sans">${w.word_text}</span>
                      <span class="font-mono text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded">${w.error_code}</span>
                      <span class="text-zinc-500 text-[11px]">${w.model_name}</span>
                    </div>
                    <span class="font-semibold text-red-700">${w.count} fail${w.count > 1 ? 's' : ''}</span>
                  </div>
                `).join("")}
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    I18N.applyToDOM();
  }
}

// Global Admin View instance
window.AdminView = AdminView;
