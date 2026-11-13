(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChordEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  const FLAT_KEY_INDICES = new Set([1, 3, 5, 8, 10]); // Db, Eb, F, Ab, Bb
  const FLAT_MINOR_KEY_INDICES = new Set([0, 2, 3, 5, 7, 10]); // Cm, Dm, Ebm, Fm, Gm, Bbm

  const ALL_KEYS = [
    'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
    'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'
  ];

  const NOTE_TO_INDEX = {
    'C': 0, 'B#': 0,
    'C#': 1, 'Db': 1,
    'D': 2,
    'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4,
    'F': 5, 'E#': 5,
    'F#': 6, 'Gb': 6,
    'G': 7,
    'G#': 8, 'Ab': 8,
    'A': 9,
    'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11
  };

  const QUALITY_REGEX = /^((?:maj|min|dim|aug|sus|add|no|alt|m|M)(?=[0-9+#b°º/()\-]|$)|[0-9]+|[+#b°º\-]|\/(?=[0-9])|\((?:(?:maj|min|dim|aug|sus|add|no|alt|m|M|[0-9+#b°º/\-])+\)))*$/;
  const INLINE_BRACKET_REGEX = /\[([^\[\]]+)\]/g;
  const SECTION_BRACKET_REGEX = /^\[([^\[\]]+)\]\s*$/;
  const SECTION_PLAIN_REGEX = /^(intro|introdu[çc][aã]o|verso(?:\s*\d+)?|estrofe(?:\s*\d+)?|pr[eé]-?refr[aã]o|refr[aã]o|coro|ponte|bridge|solo|interl[uú]dio|instrumental|final|outro|coda|tag|refr[aã]o\s+final)\s*:?\s*$/i;
  const INSTRUMENTAL_KEYWORDS = ['intro', 'solo', 'instrumental', 'interl', 'outro'];
  const REPEAT_OR_BAR_REGEX = /^(?:\|+|:|\/|~|-|x\d+|\d+x|\(\d+x\)|\(x\d+\)|bis|\(bis\))$/i;

  function shouldPreferFlats(key) {
    const trimmed = (key || '').trim();
    if (trimmed.includes('b')) return true;
    if (trimmed.includes('#')) return false;
    const isMinor = trimmed.endsWith('m') && !trimmed.endsWith('dim') && !trimmed.endsWith('maj');
    const root = isMinor ? trimmed.slice(0, -1) : trimmed;
    const idx = NOTE_TO_INDEX[root];
    if (idx === undefined) return false;
    return isMinor ? FLAT_MINOR_KEY_INDICES.has(idx) : FLAT_KEY_INDICES.has(idx);
  }

  function transposeNote(note, semitones, preferFlats) {
    const idx = NOTE_TO_INDEX[note];
    if (idx === undefined) return note;
    const target = ((idx + semitones) % 12 + 12) % 12;
    return preferFlats ? FLAT_NOTES[target] : SHARP_NOTES[target];
  }

  function parseChordParts(rawToken) {
    const token = (rawToken || '').trim();
    if (!token) return null;
    const first = token[0];
    if (first < 'A' || first > 'G') return null;

    let cursor = 1;
    let root = first;
    if (cursor < token.length && (token[cursor] === '#' || token[cursor] === 'b')) {
      root += token[cursor];
      cursor++;
    }
    if (NOTE_TO_INDEX[root] === undefined) return null;

    let body = token.slice(cursor);
    let bass = null;

    const lastSlash = body.lastIndexOf('/');
    if (lastSlash >= 0) {
      const afterSlash = body.slice(lastSlash + 1);
      if (afterSlash.length > 0 && afterSlash[0] >= 'A' && afterSlash[0] <= 'G') {
        if (NOTE_TO_INDEX[afterSlash] !== undefined) {
          bass = afterSlash;
          body = body.slice(0, lastSlash);
        } else {
          return null;
        }
      }
    }

    if (body.length > 0 && !QUALITY_REGEX.test(body)) {
      return null;
    }

    return { root, quality: body, bass };
  }

  function unwrapChordDecorations(token) {
    let start = 0;
    let end = token.length;
    while (start < end && (token[start] === '(' || token[start] === '|' || token[start] === '[')) {
      start++;
    }
    while (end > start && [')', ',', '.', ';', '|', ']'].includes(token[end - 1])) {
      if (token[end - 1] === ')') {
        const inner = token.slice(start, end);
        const opens = (inner.match(/\(/g) || []).length;
        const closes = (inner.match(/\)/g) || []).length;
        if (opens >= closes) break;
      }
      end--;
    }
    return {
      prefix: token.slice(0, start),
      core: token.slice(start, end),
      suffix: token.slice(end)
    };
  }

  function isValidChordToken(token) {
    return parseChordParts(unwrapChordDecorations(token).core) !== null;
  }

  function transposeKey(originalKey, semitones) {
    const trimmed = (originalKey || '').trim();
    if (!trimmed || semitones === 0) return trimmed;
    const parts = parseChordParts(trimmed);
    if (!parts) return trimmed;
    const origIdx = NOTE_TO_INDEX[parts.root];
    if (origIdx === undefined) return trimmed;
    const targetIdx = ((origIdx + semitones) % 12 + 12) % 12;
    const isMinor = parts.quality === 'm' || parts.quality === 'min';
    const preferFlats = isMinor ? FLAT_MINOR_KEY_INDICES.has(targetIdx) : FLAT_KEY_INDICES.has(targetIdx);
    return transposeNote(parts.root, semitones, preferFlats) + parts.quality;
  }

  function transposeChord(token, semitones, preferFlats = null) {
    if (semitones === 0) return token;
    const unwrapped = unwrapChordDecorations(token);
    const parts = parseChordParts(unwrapped.core);
    if (!parts) return token;

    let useFlats = preferFlats;
    if (useFlats === null) {
      if (parts.root.includes('#')) useFlats = false;
      else if (parts.root.includes('b')) useFlats = true;
      else {
        const targetIdx = (((NOTE_TO_INDEX[parts.root] || 0) + semitones) % 12 + 12) % 12;
        useFlats = FLAT_KEY_INDICES.has(targetIdx);
      }
    }

    const newRoot = transposeNote(parts.root, semitones, useFlats);
    const newBass = parts.bass ? transposeNote(parts.bass, semitones, useFlats) : null;
    const core = newRoot + parts.quality + (newBass ? '/' + newBass : '');
    return unwrapped.prefix + core + unwrapped.suffix;
  }

  function isSectionHeader(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const bracketMatch = trimmed.match(SECTION_BRACKET_REGEX);
    if (bracketMatch) {
      const inside = bracketMatch[1].trim();
      return parseChordParts(inside) === null ? inside : null;
    }
    const plainMatch = trimmed.match(SECTION_PLAIN_REGEX);
    if (plainMatch) {
      const s = plainMatch[1].trim();
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    return null;
  }

  function hasInlineBrackets(line) {
    return /\[([^\[\]]+)\]/.test(line);
  }

  function isChordLine(line, inInstrumentalSection = false, songHasOtherChords = true) {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (hasInlineBrackets(trimmed)) return false;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;

    let chordCount = 0;
    for (const tok of tokens) {
      if (REPEAT_OR_BAR_REGEX.test(tok)) continue;
      const core = unwrapChordDecorations(tok).core;
      if (parseChordParts(core) !== null) {
        chordCount++;
      } else {
        return false;
      }
    }
    if (chordCount === 0) return false;

    if (tokens.length === 1 && chordCount === 1) {
      const single = unwrapChordDecorations(tokens[0]).core;
      if ((single === 'A' || single === 'E') && !inInstrumentalSection && !songHasOtherChords) {
        return false;
      }
    }
    return true;
  }

  function transposeChordLinePreservingColumns(line, semitones, preferFlats) {
    if (semitones === 0) return line.replace(/\s+$/, '');
    let result = '';
    let index = 0;
    const n = line.length;
    while (index < n) {
      if (/\s/.test(line[index])) {
        index++;
        continue;
      }
      const startCol = index;
      while (index < n && !/\s/.test(line[index])) {
        index++;
      }
      const token = line.slice(startCol, index);
      const transposed = REPEAT_OR_BAR_REGEX.test(token)
        ? token
        : transposeChord(token, semitones, preferFlats);

      const targetStart = result.length === 0 ? startCol : Math.max(startCol, result.length + 1);
      while (result.length < targetStart) result += ' ';
      result += transposed;
    }
    return result;
  }

  function parseInlineBracketLine(line, semitones, preferFlats, lineId) {
    let chords = '';
    let lyrics = '';
    let cursor = 0;
    let hasValidChord = false;

    INLINE_BRACKET_REGEX.lastIndex = 0;
    let match;
    while ((match = INLINE_BRACKET_REGEX.exec(line)) !== null) {
      const textBefore = line.slice(cursor, match.index);
      lyrics += textBefore;

      const rawInside = match[1].trim();
      if (isValidChordToken(rawInside)) {
        hasValidChord = true;
        const transposed = transposeChord(rawInside, semitones, preferFlats);
        if (chords.length > 0 && lyrics.length <= chords.length) {
          const needed = chords.length + 1 - lyrics.length;
          if (lyrics.length === 0 || /\s/.test(lyrics[lyrics.length - 1])) {
            lyrics += ' '.repeat(needed);
          }
        }
        const desiredCol = lyrics.length;
        const placeCol = chords.length === 0 ? desiredCol : Math.max(desiredCol, chords.length + 1);
        while (chords.length < placeCol) chords += ' ';
        chords += transposed;
      } else {
        lyrics += match[0];
      }
      cursor = match.index + match[0].length;
    }

    if (cursor < line.length) {
      lyrics += line.slice(cursor);
    }

    if (!hasValidChord) {
      return { id: lineId, type: 'lyrics', lyricsLine: line };
    }

    const chordsStr = chords.replace(/\s+$/, '');
    const lyricsStr = lyrics.replace(/\s+$/, '');

    if (!lyricsStr.trim()) {
      return { id: lineId, type: 'chords', chordsLine: chordsStr };
    }
    return { id: lineId, type: 'pair', chordsLine: chordsStr, lyricsLine: lyricsStr };
  }

  function parseAndTransposeSong(rawContent, semitones = 0, originalKey = 'C') {
    const normalized = (rawContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawLines = normalized.split('\n');
    const targetKey = transposeKey(originalKey, semitones);
    const preferFlats = originalKey && originalKey.trim() ? shouldPreferFlats(targetKey) : null;

    const songHasOtherChords = rawLines.some((line) => {
      const matches = [...line.matchAll(/\[([^\[\]]+)\]/g)];
      if (matches.some((m) => isValidChordToken(m[1]))) return true;
      return line.trim().split(/\s+/).filter(Boolean).length > 1 && isChordLine(line, true, true);
    });

    const output = [];
    let i = 0;
    let nextId = 0;
    let inInstrumental = false;

    while (i < rawLines.length) {
      const line = rawLines[i];
      if (!line.trim()) {
        if (output.length > 0 && output[output.length - 1].type !== 'blank') {
          output.push({ id: nextId++, type: 'blank' });
        }
        i++;
        continue;
      }

      const sectionTitle = isSectionHeader(line);
      if (sectionTitle !== null) {
        const lower = sectionTitle.toLowerCase();
        inInstrumental = INSTRUMENTAL_KEYWORDS.some((k) => lower.includes(k));
        output.push({ id: nextId++, type: 'section', title: sectionTitle });
        i++;
        continue;
      }

      if (hasInlineBrackets(line)) {
        output.push(parseInlineBracketLine(line, semitones, preferFlats, nextId++));
        i++;
        continue;
      }

      if (isChordLine(line, inInstrumental, songHasOtherChords)) {
        const transposedChordLine = transposeChordLinePreservingColumns(line, semitones, preferFlats);
        const nextLine = i + 1 < rawLines.length ? rawLines[i + 1] : null;
        const nextIsLyric =
          nextLine !== null &&
          nextLine.trim().length > 0 &&
          isSectionHeader(nextLine) === null &&
          !hasInlineBrackets(nextLine) &&
          !isChordLine(nextLine, inInstrumental, songHasOtherChords);

        if (nextIsLyric) {
          output.push({
            id: nextId++,
            type: 'pair',
            chordsLine: transposedChordLine,
            lyricsLine: nextLine.replace(/\s+$/, '')
          });
          i += 2;
        } else {
          output.push({ id: nextId++, type: 'chords', chordsLine: transposedChordLine });
          i++;
        }
        continue;
      }

      output.push({ id: nextId++, type: 'lyrics', lyricsLine: line.replace(/\s+$/, '') });
      i++;
    }

    while (output.length > 0 && output[output.length - 1].type === 'blank') {
      output.pop();
    }
    return output;
  }

  function exportAsPlainText(title, artist, originalKey, currentKey, lines) {
    const out = [title];
    if (artist && artist.trim()) out.push(artist.trim());
    out.push(
      originalKey !== currentKey
        ? `Tom: ${currentKey} (Original: ${originalKey})`
        : `Tom: ${currentKey}`
    );
    out.push('');
    for (const line of lines) {
      if (line.type === 'section') out.push(`[${line.title}]`);
      else if (line.type === 'pair') {
        out.push(line.chordsLine);
        out.push(line.lyricsLine);
      } else if (line.type === 'chords') out.push(line.chordsLine);
      else if (line.type === 'lyrics') out.push(line.lyricsLine);
      else if (line.type === 'blank') out.push('');
    }
    return out.join('\n').replace(/\s+$/, '');
  }

  function splitAlignedSegments(chordsLine, lyricsLine) {
    const maxLen = Math.max(chordsLine.length, lyricsLine.length);
    if (maxLen === 0) return [];
    const paddedChords = chordsLine.padEnd(maxLen, ' ');
    const paddedLyrics = lyricsLine.padEnd(maxLen, ' ');
    const segments = [];
    let start = 0;
    for (let i = 1; i < maxLen; i++) {
      const isBoundary =
        paddedLyrics[i - 1] === ' ' &&
        paddedLyrics[i] !== ' ' &&
        paddedChords[i - 1] === ' ' &&
        paddedChords[i] === ' ';
      const isChordWordBoundary =
        paddedLyrics[i - 1] === ' ' &&
        paddedChords[i - 1] === ' ' &&
        paddedChords[i] !== ' ';

      if (isBoundary || isChordWordBoundary) {
        segments.push({
          chords: paddedChords.slice(start, i),
          lyrics: paddedLyrics.slice(start, i)
        });
        start = i;
      }
    }
    segments.push({
      chords: paddedChords.slice(start, maxLen).replace(/\s+$/, ''),
      lyrics: paddedLyrics.slice(start, maxLen).replace(/\s+$/, '')
    });
    return segments;
  }

  return {
    ALL_KEYS,
    parseChordParts,
    isValidChordToken,
    isChordLine,
    transposeChord,
    transposeKey,
    parseAndTransposeSong,
    exportAsPlainText,
    splitAlignedSegments
  };
});
