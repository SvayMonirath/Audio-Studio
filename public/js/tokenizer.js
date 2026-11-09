/**
 * tokenizer.js
 * Adaptive Multilingual Script Tokenizer.
 * Accurately segments Khmer and Latin text without breaking vowel clusters or loanwords,
 * and strips punctuation marks so they do not form defect pills.
 */

class AdaptiveTokenizer {
  constructor() {
    this.hasIntlSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter !== "undefined";
    this.khmerSegmenter = this.hasIntlSegmenter ? new Intl.Segmenter("km", { granularity: "word" }) : null;
    this.generalSegmenter = this.hasIntlSegmenter ? new Intl.Segmenter("en", { granularity: "word" }) : null;

    // Foundational Khmer compound lexicon (sorted longest first)
    this.lexicon = [
      "អាឡូ", "អូខេ", "សួស្តី", "ជម្រាបសួរ", "សុំទោស", "អរគុណ", "កាហ្វេ", 
      "ទឹកដោះគោ", "ទឹកសុទ្ធ", "ទឹកកក", "បាយសាច់មាន់", "បាយសាច់គោ", "មីឆា",
      "បញ្ចុះតម្លៃ", "កុម្ម៉ង់", "កក់តុ", "ល្ងាច", "ទំនេរ", "រៀល", "ម្ហូប", "ពិសេស", "សាច់មាន់", "សាច់គោ",
      "ថ្ងៃនេះ", "ឥឡូវនេះ", "ឆែកមើល", "កាហ្វេទឹកកក", "មួយចាន", "មួយកែវ", "មួយដប", "ប៉ុន្មាន", "ចូលចិត្ត",
      "អាយឡាតេ", "ហ្វ្រេបប៉េ", "ខារ៉ាមែល", "អេសប្រេសសូ", "ម៉ូកា", "កាពូឈីណូ"
    ];
    this.lexicon.sort((a, b) => b.length - a.length);

    // Polite / grammatical particles that often attach without spaces
    this.politeParticles = ["បង", "អូន", "ណា", "ទេ", "ខ្លះ", "ដែរ"];
  }

  tokenize(text, lang = "km") {
    if (!text || typeof text !== "string") return [];

    const isKhmer = /[\u1780-\u17FF]/.test(text);

    if (isKhmer) {
      return this.tokenizeKhmer(text);
    } else {
      return this.tokenizeSpaced(text);
    }
  }

  tokenizeKhmer(text) {
    const rawChunks = text.trim().split(/\s+/);
    const tokens = [];
    let idx = 0;

    for (const chunk of rawChunks) {
      // Strip leading and trailing punctuation while preserving letters, marks, and numbers
      const stripped = chunk.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
      if (!stripped) continue;

      if (this.lexicon.includes(stripped)) {
        tokens.push({ index: idx++, text: stripped, isWord: true });
        continue;
      }

      let rawSegments = [];
      if (this.khmerSegmenter) {
        for (const s of this.khmerSegmenter.segment(stripped)) {
          if (s.isWordLike && s.segment.trim()) {
            rawSegments.push(s.segment.trim());
          }
        }
      } else {
        rawSegments.push(stripped);
      }

      let i = 0;
      while (i < rawSegments.length) {
        // 1. Check 3-token lexicon match
        if (i <= rawSegments.length - 3) {
          const tri = rawSegments[i] + rawSegments[i+1] + rawSegments[i+2];
          if (this.lexicon.includes(tri)) {
            tokens.push({ index: idx++, text: tri, isWord: true });
            i += 3;
            continue;
          }
        }

        // 2. Check 2-token lexicon match (e.g. សួ + ស្តី = សួស្តី, កា + ហ្វេ = កាហ្វេ, សុំ + ទោស = សុំទោស)
        if (i <= rawSegments.length - 2) {
          const bi = rawSegments[i] + rawSegments[i+1];
          if (this.lexicon.includes(bi)) {
            tokens.push({ index: idx++, text: bi, isWord: true });
            i += 2;
            continue;
          }
        }

        // 3. Catch accidental split of អា + ឡូ
        if (i <= rawSegments.length - 2 && rawSegments[i] === "អា" && rawSegments[i+1] === "ឡូ") {
          tokens.push({ index: idx++, text: "អាឡូ", isWord: true });
          i += 2;
          continue;
        }

        // 4. Detach polite particles attached without spaces (e.g. ស្តីបង -> ស្តី + បង, រៀលបង -> រៀល + បង)
        let cur = rawSegments[i];
        let splitParticle = null;
        for (const p of this.politeParticles) {
          if (cur.endsWith(p) && cur.length > p.length) {
            const stem = cur.slice(0, -p.length);
            // If stem + previous forms a lexicon word (e.g. សួ + ស្តី = សួស្តី)
            if (tokens.length > 0 && this.lexicon.includes(tokens[tokens.length - 1].text + stem)) {
              tokens[tokens.length - 1].text = tokens[tokens.length - 1].text + stem;
              splitParticle = p;
              cur = null;
              break;
            } else if (stem.length >= 2) {
              splitParticle = p;
              cur = stem;
              break;
            }
          }
        }

        if (cur) {
          tokens.push({ index: idx++, text: cur, isWord: true });
        }
        if (splitParticle) {
          tokens.push({ index: idx++, text: splitParticle, isWord: true });
        }
        i++;
      }
    }

    return tokens;
  }

  tokenizeSpaced(text) {
    const rawWords = text.trim().split(/\s+/);
    const tokens = [];
    let idx = 0;
    for (const w of rawWords) {
      const stripped = w.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
      if (stripped) {
        tokens.push({ index: idx++, text: stripped, isWord: true });
      }
    }
    return tokens;
  }
}

// Global Tokenizer Singleton
window.tokenizer = new AdaptiveTokenizer();
