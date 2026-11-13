(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LyricMatcher = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOP_WORDS = new Set([
    'a', 'o', 'e', 'as', 'os', 'de', 'da', 'do', 'das', 'dos',
    'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'que', 'se',
    'por', 'com', 'pra', 'para', 'ao', 'ou', 'eh', 'ah', 'oh'
  ]);

  function normalizePortuguese(input) {
    return (input || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function phoneticPortuguese(token) {
    if (!token) return '';
    let s = token
      .replace(/qu/g, 'k')
      .replace(/gu/g, 'g')
      .replace(/ch/g, 'x')
      .replace(/lh/g, 'li')
      .replace(/nh/g, 'ni')
      .replace(/ss/g, 's')
      .replace(/sc/g, 's')
      .replace(/xc/g, 's')
      .replace(/ce/g, 'se')
      .replace(/ci/g, 'si')
      .replace(/ge/g, 'je')
      .replace(/gi/g, 'ji')
      .replace(/ou/g, 'o')
      .replace(/ei/g, 'e')
      .replace(/z/g, 's');

    if (s.endsWith('am') && s.length > 3) {
      s = s.slice(0, -2) + 'ao';
    }
    if (s.endsWith('l') && s.length > 2) {
      s = s.slice(0, -1) + 'u';
    }
    return s.replace(/(.)\1+/g, '$1');
  }

  function tokenizeMeaningful(input) {
    const tokens = normalizePortuguese(input).split(' ').filter(Boolean);
    const filtered = tokens.filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
    return filtered.length > 0 ? filtered : tokens;
  }

  function levenshteinSimilarity(a, b) {
    if (a === b) return 1;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    if (Math.abs(a.length - b.length) > Math.floor(maxLen / 2) + 1) return 0;

    let prev = Array.from({ length: b.length + 1 }, (_, idx) => idx);
    let curr = new Array(b.length + 1).fill(0);

    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return 1 - prev[b.length] / maxLen;
  }

  function tokenSimilarity(a, b) {
    if (a === b) return 1;
    const direct = levenshteinSimilarity(a, b);
    const phonetic = levenshteinSimilarity(phoneticPortuguese(a), phoneticPortuguese(b)) * 0.94;
    return Math.max(direct, phonetic);
  }

  function sequenceAlignmentMetrics(spokenTokens, lineTokens) {
    if (!spokenTokens.length || !lineTokens.length) return { score: 0, hits: 0 };

    const n = spokenTokens.length;
    const m = lineTokens.length;
    const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
    const hits = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const sim = tokenSimilarity(spokenTokens[i - 1], lineTokens[j - 1]);
        const diagScore = sim >= 0.68 ? dp[i - 1][j - 1] + sim : -1;
        const diagHits = sim >= 0.68 ? hits[i - 1][j - 1] + 1 : 0;

        let bestScore = dp[i - 1][j];
        let bestHits = hits[i - 1][j];

        if (dp[i][j - 1] > bestScore) {
          bestScore = dp[i][j - 1];
          bestHits = hits[i][j - 1];
        }
        if (diagScore > bestScore) {
          bestScore = diagScore;
          bestHits = diagHits;
        }
        dp[i][j] = bestScore;
        hits[i][j] = bestHits;
      }
    }

    let consecutivePairs = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < m - 1; j++) {
        if (
          tokenSimilarity(spokenTokens[i], lineTokens[j]) >= 0.72 &&
          tokenSimilarity(spokenTokens[i + 1], lineTokens[j + 1]) >= 0.72
        ) {
          consecutivePairs++;
          break;
        }
      }
    }
    const bigramBonus = m > 1 ? (consecutivePairs / (m - 1)) * 0.16 : 0;
    const matchedSum = dp[n][m];
    const matchedCount = hits[n][m];
    const coverage = matchedSum / m;
    const precision = matchedSum / n;
    return {
      score: coverage * 0.6 + precision * 0.4 + bigramBonus,
      hits: matchedCount
    };
  }

  function matchSingleCandidate(spokenText, lines, currentLineIndex, isFinalResult, sensitivity) {
    const rawTokens = tokenizeMeaningful(spokenText);
    if (rawTokens.length === 0) return null;

    const spokenTokens = [];
    for (const tok of rawTokens) {
      if (spokenTokens[spokenTokens.length - 1] !== tok) {
        spokenTokens.push(tok);
      }
    }

    const clampedSens = Math.min(1, Math.max(0.2, sensitivity));
    if (spokenTokens.length === 1 && (spokenTokens[0].length < 4 || clampedSens < 0.45)) {
      return null;
    }

    const recentSpoken = spokenTokens.length > 8 ? spokenTokens.slice(-8) : spokenTokens;
    const lyricIndices = [];
    for (let idx = 0; idx < lines.length; idx++) {
      if (lines[idx].type === 'pair' || lines[idx].type === 'lyrics') {
        lyricIndices.push(idx);
      }
    }
    if (lyricIndices.length === 0) return null;

    let bestIndex = -1;
    let bestScore = 0;
    let bestMatchedWords = 0;

    for (let pos = 0; pos < lyricIndices.length; pos++) {
      const idx = lyricIndices[pos];
      const lineTokens = tokenizeMeaningful(lines[idx].lyricsLine);
      if (lineTokens.length === 0) continue;

      const single = sequenceAlignmentMetrics(recentSpoken, lineTokens);
      let bridgeScore = 0;
      let bridgeHits = 0;

      if (pos > 0 && recentSpoken.length >= 3) {
        const prevIdx = lyricIndices[pos - 1];
        const prevTail = tokenizeMeaningful(lines[prevIdx].lyricsLine).slice(-3);
        const currHead = lineTokens.slice(0, 4);
        if (prevTail.length > 0 && currHead.length > 0) {
          const lastSpoken = recentSpoken[recentSpoken.length - 1];
          const tailMatchesEnd =
            tokenSimilarity(lastSpoken, currHead[currHead.length - 1]) >= 0.72 ||
            currHead.some((w) => tokenSimilarity(lastSpoken, w) >= 0.75);
          if (tailMatchesEnd) {
            const bridged = sequenceAlignmentMetrics(recentSpoken, prevTail.concat(currHead));
            bridgeScore = bridged.score * 0.96;
            bridgeHits = bridged.hits;
          }
        }
      }

      let rawScore = Math.max(single.score, bridgeScore);
      const matchedCount = bridgeScore > single.score ? bridgeHits : single.hits;
      if (matchedCount === 0) continue;

      const delta = idx - currentLineIndex;
      if (clampedSens < 0.4 && matchedCount < 2 && lineTokens.length >= 3) continue;
      if ((delta < -1 || delta > 6) && matchedCount < 2 && lineTokens.length >= 2) continue;

      let proximityBonus = -0.1;
      if (delta === 0) proximityBonus = 0.1;
      else if (delta >= 1 && delta <= 3) proximityBonus = 0.16;
      else if (delta >= 4 && delta <= 7) proximityBonus = 0.08;
      else if (delta >= -2 && delta <= -1) proximityBonus = 0.01;

      rawScore += proximityBonus;

      if (rawScore > bestScore) {
        bestScore = rawScore;
        bestIndex = idx;
        bestMatchedWords = matchedCount;
      }
    }

    const baseThreshold = 0.6 - clampedSens * 0.26;
    const finalThreshold = isFinalResult ? baseThreshold - 0.03 : baseThreshold + 0.03;
    const isLargeOrBackward = bestIndex >= 0 && (bestIndex < currentLineIndex - 1 || bestIndex - currentLineIndex > 5);
    const requiredThreshold = isLargeOrBackward ? finalThreshold + 0.14 : finalThreshold;

    if (bestIndex >= 0 && bestScore >= requiredThreshold) {
      return {
        lineIndex: bestIndex,
        score: Math.min(1, Math.max(0, bestScore)),
        matchedWordCount: bestMatchedWords
      };
    }
    return null;
  }

  function findBestMatchingLine({
    spokenText,
    lines,
    currentLineIndex,
    isFinalResult = false,
    sensitivity = 0.6,
    alternativeTranscripts = []
  }) {
    const candidates = [...new Set([spokenText, ...alternativeTranscripts].map((s) => (s || '').trim()).filter(Boolean))];
    let bestOverall = null;
    for (const candidate of candidates) {
      const result = matchSingleCandidate(candidate, lines, currentLineIndex, isFinalResult, sensitivity);
      if (result && (!bestOverall || result.score > bestOverall.score)) {
        bestOverall = result;
      }
    }
    return bestOverall;
  }

  return {
    normalizePortuguese,
    phoneticPortuguese,
    tokenizeMeaningful,
    tokenSimilarity,
    findBestMatchingLine
  };
});
