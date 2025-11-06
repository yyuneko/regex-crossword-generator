'use strict';

const { init } = require('z3-solver');

const SIZE = 13;
const DEFAULT_DIFFICULTY = 'expert';
const SIDE = Math.floor((SIZE + 1) / 2);
if (SIZE !== SIDE * 2 - 1) {
  throw new Error('SIZE must be odd so that SIZE = 2 * side - 1 for a hex grid.');
}

const THEMES = [
  { name: 'dna', alphabet: 'ATCG', words: ['ATG', 'TAA', 'CGT'] },
  { name: 'rna', alphabet: 'AUCG', words: ['AUG', 'UAA', 'GCU'] },
  { name: 'binary', alphabet: '01', words: ['101', '010', '110'] },
  { name: 'amino', alphabet: 'ACDEFGHIKLMNPQRSTVWY', words: ['GLY', 'ALA', 'LYS'] },
  { name: 'weather', alphabet: 'CLOUDSRNY', words: ['SUN', 'DRY', 'CLOUD'] },
];

function rowSize(index, size = SIZE) {
  const mid = (size - 1) / 2;
  const extra = index <= mid ? index : size - 1 - index;
  return mid + 1 + extra;
}

function axialFromRowCol(rowIndex, colIndex, radius = SIDE - 1) {
  const r = rowIndex - radius;
  const qStart = Math.max(-radius, -r - radius);
  const q = qStart + colIndex;
  return [q, r];
}

function buildOfficialCoordinateLists(size = SIZE) {
  const mid = (size - 1) / 2;
  const radius = mid;
  const coords = { x: [], y: [], z: [] };

  for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
    const length = rowSize(rowIndex, size);
    const lineCoords = [];
    for (let colIndex = 0; colIndex < length; colIndex += 1) {
      lineCoords.push(axialFromRowCol(rowIndex, colIndex, radius));
    }
    coords.y.push(lineCoords);
  }

  for (let ii = 0; ii < size; ii += 1) {
    const lineCoords = [];
    for (let jj = 0; jj < size; jj += 1) {
      let i = jj;
      let j = ii;
      if (jj > mid) {
        j -= jj - mid;
      }
      const length = rowSize(i, size);
      if (j >= 0 && j < length) {
        lineCoords.push(axialFromRowCol(i, j, radius));
      }
    }
    lineCoords.reverse();
    coords.x.push(lineCoords);
  }

  for (let ii = 0; ii < size; ii += 1) {
    const lineCoords = [];
    for (let jj = 0; jj < size; jj += 1) {
      let i = jj;
      let j = ii;
      if (jj < mid) {
        j -= mid - jj;
      }
      const length = rowSize(i, size);
      if (j >= 0 && j < length) {
        lineCoords.push(axialFromRowCol(i, j, radius));
      }
    }
    coords.z.push(lineCoords);
  }

  return coords;
}

function readLineFromCoords(board, coordList) {
  return coordList.map(([q, r]) => board.cells.get(`${q},${r}`)).join('');
}

function createSeededRng(seed) {
  let state = Number.isFinite(seed) ? Math.floor(seed) % 2147483647 : NaN;
  if (!Number.isFinite(state)) {
    return () => Math.random();
  }
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function parseDifficulty(raw) {
  const value = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  if (value === 'expert') {
    return 'expert';
  }
  if (value === 'normal') {
    return 'normal';
  }
  return DEFAULT_DIFFICULTY;
  return DEFAULT_DIFFICULTY;
}

function chooseTheme(rng = Math.random) {
  const random = typeof rng === 'function' ? rng : Math.random;
  return THEMES[Math.floor(random() * THEMES.length)];
}

function getLineCoordinates(radius, axis, value) {
  const coords = [];
  if (axis === 'r') {
    const qStart = Math.max(-radius, -value - radius);
    const qEnd = Math.min(radius, -value + radius);
    for (let q = qStart; q <= qEnd; q += 1) {
      coords.push([q, value]);
    }
  } else if (axis === 'q') {
    const rStart = Math.max(-radius, -value - radius);
    const rEnd = Math.min(radius, -value + radius);
    for (let r = rStart; r <= rEnd; r += 1) {
      coords.push([value, r]);
    }
  } else if (axis === 's') {
    const qStart = Math.max(-radius, -value - radius);
    const qEnd = Math.min(radius, -value + radius);
    for (let q = qStart; q <= qEnd; q += 1) {
      const r = -value - q;
      if (r < -radius || r > radius) {
        continue;
      }
      coords.push([q, r]);
    }
  } else {
    throw new Error(`Unknown axis ${axis}`);
  }
  return coords;
}

function tryPlaceWord(board, theme, word, rng) {
  const { radius, cells } = board;
  const letters = new Set(theme.alphabet.split(''));
  const normalized = word.toUpperCase();
  if (![...normalized].every((ch) => letters.has(ch))) {
    throw new Error(`Word ${word} contains characters outside alphabet ${theme.alphabet}`);
  }

  const axes = ['r', 'q', 's'];
  const maxAttempts = 40;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const axis = axes[Math.floor(rng() * axes.length)];
    const value = Math.floor(rng() * (radius * 2 + 1)) - radius;
    const coords = getLineCoordinates(radius, axis, value);
    if (coords.length < normalized.length) {
      continue;
    }
    const startMax = coords.length - normalized.length;
    const start = Math.floor(rng() * (startMax + 1));
    for (let index = 0; index < normalized.length; index += 1) {
      const [q, r] = coords[start + index];
      cells.set(`${q},${r}`, normalized[index]);
    }
    return true;
  }
  return false;
}

function generateHexBoard(side, theme, rng = Math.random) {
  const letters = theme.alphabet.split('');
  const radius = side - 1;
  const cells = new Map();

  for (let axialR = -radius; axialR <= radius; axialR += 1) {
    const qStart = Math.max(-radius, -axialR - radius);
    const qEnd = Math.min(radius, -axialR + radius);
    for (let axialQ = qStart; axialQ <= qEnd; axialQ += 1) {
      const choice = letters[Math.floor(rng() * letters.length)];
      cells.set(`${axialQ},${axialR}`, choice);
    }
  }

  const words = Array.isArray(theme.words) ? theme.words : [];
  let placed = 0;
  for (const word of words) {
    if (!tryPlaceWord({ radius, cells }, theme, word, rng)) {
      throw new Error(`Failed to place word ${word}`);
    }
    placed += 1;
  }

  if (placed < words.length) {
    throw new Error('Not all words could be placed');
  }

  return { side, radius, cells };
}

function extractAxisLines(board, axis) {
  const { radius, cells } = board;
  const lines = [];

  for (let value = -radius; value <= radius; value += 1) {
    const characters = [];
    if (axis === 'r') {
      const qStart = Math.max(-radius, -value - radius);
      const qEnd = Math.min(radius, -value + radius);
      for (let q = qStart; q <= qEnd; q += 1) {
        characters.push(cells.get(`${q},${value}`));
      }
    } else if (axis === 'q') {
      const rStart = Math.max(-radius, -value - radius);
      const rEnd = Math.min(radius, -value + radius);
      for (let r = rStart; r <= rEnd; r += 1) {
        characters.push(cells.get(`${value},${r}`));
      }
    } else if (axis === 's') {
      const qStart = Math.max(-radius, -value - radius);
      const qEnd = Math.min(radius, -value + radius);
      for (let q = qStart; q <= qEnd; q += 1) {
        const r = -value - q;
        if (r < -radius || r > radius) {
          continue;
        }
        characters.push(cells.get(`${q},${r}`));
      }
    } else {
      throw new Error(`Unknown axis ${axis}`);
    }
    lines.push(characters.join(''));
  }

  return lines;
}

function runLengthEncode(text) {
  const runs = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    let end = index + 1;
    while (end < text.length && text[end] === char) {
      end += 1;
    }
    runs.push({ char, count: end - index });
    index = end;
  }
  return runs;
}

function findMotifSegments(text) {
  const segments = [];
  let index = 0;
  while (index < text.length) {
    let matched = false;
    for (let motifLength = Math.min(3, text.length - index); motifLength >= 2; motifLength -= 1) {
      const motif = text.slice(index, index + motifLength);
      if (motif.length < 2) {
        continue;
      }
      let count = 1;
      while (index + motifLength * (count + 1) <= text.length) {
        const next = text.slice(index + motifLength * count, index + motifLength * (count + 1));
        if (next !== motif) {
          break;
        }
        count += 1;
      }
      if (count >= 2) {
        segments.push({ type: 'motif', motif, count });
        index += motifLength * count;
        matched = true;
        break;
      }
    }
    if (!matched) {
      segments.push({ type: 'literal', text: text[index] });
      index += 1;
    }
  }
  return segments;
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function escapeRegexLiteral(text) {
  return text.replace(REGEX_SPECIAL, '\\$&');
}

function escapeForCharClassChar(char) {
  if (char === '-' || char === ']' || char === '\\' || char === '^') {
    return `\\${char}`;
  }
  return char;
}

function uniqueArray(items) {
  return Array.from(new Set(items));
}

function patternSignature(pattern) {
  let signature = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const ch = pattern[index];
    if (ch === '\\') {
      const next = pattern[index + 1] ?? '';
      if (/[1-9]/.test(next)) {
        signature += 'B';
      } else {
        signature += 'L';
      }
      index += 1;
      continue;
    }
    if (ch === '[') {
      let close = index + 1;
      while (close < pattern.length && pattern[close] !== ']') {
        if (pattern[close] === '\\') {
          close += 1;
        }
        close += 1;
      }
      signature += 'C';
      index = close;
      continue;
    }
    if (ch === '(') {
      signature += 'G';
      continue;
    }
    if (ch === ')') {
      continue;
    }
    if (ch === '{') {
      while (index < pattern.length && pattern[index] !== '}') {
        index += 1;
      }
      signature += 'Q';
      continue;
    }
    if (ch === '|') {
      signature += 'A';
      continue;
    }
    if (ch === '.') {
      signature += 'D';
      continue;
    }
    if (ch === '*' || ch === '+' || ch === '?') {
      signature += 'Q';
      continue;
    }
    if (ch === '^' || ch === '$') {
      continue;
    }
    signature += 'L';
  }
  return signature.replace(/(.)\1+/g, '$1$1');
}

function computeAllowedMasksForLine(line, pattern, alphabet, letterToIndex) {
  const regex = new RegExp(pattern);
  const result = new Array(line.length);
  const letters = Array.isArray(alphabet) ? alphabet : Array.from(new Set(alphabet));

  for (let pos = 0; pos < line.length; pos += 1) {
    const original = line[pos];
    const originalIndex = letterToIndex.get(original);
    if (originalIndex === undefined) {
      throw new Error(`字母 ${original} 不在主题字母表内`);
    }

    let mask = 1 << originalIndex;
    for (let index = 0; index < letters.length; index += 1) {
      const letter = letters[index];
      if (letter === original) {
        continue;
      }
      const mutated = `${line.slice(0, pos)}${letter}${line.slice(pos + 1)}`;
      if (regex.test(mutated)) {
        const bitIndex = letterToIndex.get(letter);
        if (bitIndex === undefined) {
          throw new Error(`字母 ${letter} 不在主题字母表内`);
        }
        mask |= 1 << bitIndex;
      }
    }
    result[pos] = mask;
  }

  return result;
}

function maskAllowsLetter(mask, letterIndex) {
  return (mask & (1 << letterIndex)) !== 0;
}

function maskToLetters(mask, indexToLetter) {
  const letters = [];
  for (let bit = 0; bit < indexToLetter.length; bit += 1) {
    if ((mask & (1 << bit)) !== 0) {
      letters.push(indexToLetter[bit]);
    }
  }
  return letters;
}

function buildAlternationPattern(line, chunkSize) {
  if (line.length < chunkSize * 2 || line.length % chunkSize !== 0) {
    return null;
  }
  const segments = [];
  for (let index = 0; index < line.length; index += chunkSize) {
    segments.push(line.slice(index, index + chunkSize));
  }
  const uniqueSegments = uniqueArray(segments);
  if (uniqueSegments.length < 2 || uniqueSegments.length > 4) {
    return null;
  }
  const alternation = uniqueSegments.map(escapeRegexLiteral).join('|');
  return `^(${alternation})+$`;
}

function findRepeatedFragment(line) {
  const maxLen = Math.min(3, Math.floor(line.length / 2));
  for (let length = maxLen; length >= 3; length -= 1) {
    for (let start = 0; start <= line.length - length; start += 1) {
      const fragment = line.slice(start, start + length);
      if (line.indexOf(fragment, start + length) !== -1) {
        return fragment;
      }
    }
  }
  return null;
}

function findRepeatedFragmentInfo(text) {
  const maxLen = Math.min(4, Math.floor(text.length / 2));
  for (let length = maxLen; length >= 2; length -= 1) {
    for (let start = 0; start <= text.length - length * 2; start += 1) {
      const fragment = text.slice(start, start + length);
      const second = text.indexOf(fragment, start + length);
      if (second !== -1) {
        return { fragment, firstIndex: start, secondIndex: second, length };
      }
    }
  }
  return null;
}

function measureFixedPrefix(pattern) {
  if (!pattern.startsWith('^')) {
    return 0;
  }
  let index = 1;
  let count = 0;
  while (index < pattern.length) {
    const ch = pattern[index];
    if (ch === '\\' && index + 1 < pattern.length && /[A-Za-z0-9]/.test(pattern[index + 1])) {
      count += 1;
      index += 2;
      continue;
    }
    if (/[A-Za-z0-9]/.test(ch)) {
      count += 1;
      index += 1;
      continue;
    }
    break;
  }
  return count;
}

function measureFixedSuffix(pattern) {
  if (!pattern.endsWith('$')) {
    return 0;
  }
  let index = pattern.length - 2;
  let count = 0;
  while (index >= 0) {
    const ch = pattern[index];
    if (ch === '\\' && index - 1 >= 0 && /[A-Za-z0-9]/.test(pattern[index - 1])) {
      count += 1;
      index -= 2;
      continue;
    }
    if (/[A-Za-z0-9]/.test(ch)) {
      count += 1;
      index -= 1;
      continue;
    }
    break;
  }
  return count;
}

function hasMirrorBlock(line) {
  for (let start = 0; start <= line.length - 8; start += 1) {
    const first = line.slice(start, start + 4);
    const second = line.slice(start + 4, start + 8);
    if (second === first.split('').reverse().join('')) {
      return true;
    }
  }
  return false;
}

function analyzePattern(pattern) {
  const hasPositiveLookahead = /\(\?=/.test(pattern);
  const hasNegativeLookahead = /\(\?!/.test(pattern);
  const hasPositiveLookbehind = /\(\?<=/.test(pattern);
  const hasNegativeLookbehind = /\(\?<!/.test(pattern);
  const lookaround = hasPositiveLookahead || hasNegativeLookahead || hasPositiveLookbehind || hasNegativeLookbehind;
  const quantifier = /{[0-9,]+}|\*|\+|\?/.test(pattern);
  const alternation = /\|/.test(pattern);
  const group = /\(/.test(pattern);
  const hasCharClass = /\[/.test(pattern);
  const hasNegatedClass = /\[\^/.test(pattern);
  const hasBackreference = /\\[1-9]/.test(pattern);
  const dotStarMatches = pattern.match(/\.\*/g);
  const dotStarCount = dotStarMatches ? dotStarMatches.length : 0;
  return {
    hasPositiveLookahead,
    hasNegativeLookahead,
    hasPositiveLookbehind,
    hasNegativeLookbehind,
    lookaround,
    quantifier,
    alternation,
    group,
    hasCharClass,
    hasNegatedClass,
    hasBackreference,
    dotStarCount,
    hasStructure: lookaround || quantifier || alternation || group,
  };
}

function complexityScore(features) {
  let score = 0;
  if (features.hasPositiveLookahead) {
    score += 3;
  }
  if (features.hasNegativeLookahead) {
    score += 6;
  }
  if (features.hasPositiveLookbehind) {
    score += 5;
  }
  if (features.hasNegativeLookbehind) {
    score += 7;
  }
  if (features.quantifier) {
    score += 2;
  }
  if (features.alternation) {
    score += 6;
  }
  if (features.group) {
    score += 1;
  }
  if (features.hasBackreference) {
    score += 4;
  }
  if (features.hasCharClass) {
    score += 6;
  }
  if (features.hasNegatedClass) {
    score += 5;
  }
  if (features.dotStarCount > 1) {
    score += features.dotStarCount - 1;
  }
  return score;
}


function generateCandidates(line, difficulty, theme) {
  const candidates = [];
  const seen = new Set();

  const maxLengthExpert = Math.max(24, Math.ceil(line.length * 1.6));
  const maxLengthNormal = Math.max(20, Math.ceil(line.length * 1.5));

  function addPattern(pattern, { allowEdgeLock = false, forceExpert = false } = {}) {
    const maxLength = difficulty === 'expert' ? maxLengthExpert : maxLengthNormal;
    if (!pattern || seen.has(pattern) || (!forceExpert && pattern.length > maxLength)) {
      return;
    }
    if (!allowEdgeLock && !forceExpert) {
      const edgeCap = difficulty === 'expert' ? 2 : 1;
      if (measureFixedPrefix(pattern) > edgeCap || measureFixedSuffix(pattern) > edgeCap) {
        return;
      }
    }
    let regex;
    try {
      regex = new RegExp(pattern);
    } catch (error) {
      return;
    }
    if (!regex.test(line)) {
      return;
    }

    const features = analyzePattern(pattern);
    if (!features.hasStructure) {
      return;
    }
    const complexity = complexityScore(features);
    const threshold = difficulty === 'expert' ? 9 : 3;
    if (!forceExpert && complexity < threshold) {
      return;
    }
    const advancedCount = [
      features.alternation,
      features.hasBackreference,
      features.hasNegatedClass,
      features.hasCharClass,
      features.quantifier,
    ].filter(Boolean).length;
    if (!forceExpert && difficulty === 'expert' && advancedCount < 2) {
      return;
    }
    candidates.push({ pattern, features, forceExpert, complexity });
    seen.add(pattern);
  }

  const words = Array.isArray(theme?.words) ? theme.words.map((word) => word.toUpperCase()) : [];

  const runs = runLengthEncode(line);
  const longestRun = runs.reduce(
    (best, run, index) => (run.count > best.count ? { ...run, index } : best),
    { count: 0, char: '', index: -1 }
  );
  const uniqueChars = Array.from(new Set(line.split('')));
  const themeAlphabet = Array.isArray(theme?.alphabet)
    ? theme.alphabet.map((char) => String(char).toUpperCase())
    : typeof theme?.alphabet === 'string'
    ? theme.alphabet.toUpperCase().split('')
    : uniqueChars;
  const alphabetSet = new Set(themeAlphabet);

  const charCounts = new Map();
  for (const ch of line) {
    charCounts.set(ch, (charCounts.get(ch) || 0) + 1);
  }
  const sortedByCount = Array.from(charCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topChars = sortedByCount.slice(0, Math.min(4, sortedByCount.length)).map(([ch]) => ch);
  const leastChar = sortedByCount.length > 0 ? sortedByCount[sortedByCount.length - 1][0] : null;

  const matchingWords = words.filter((word) => line.includes(word));

  function collectSegments(size) {
    const counts = new Map();
    for (let index = 0; index <= line.length - size; index += 1) {
      const segment = line.slice(index, index + size);
      counts.set(segment, (counts.get(segment) || 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .map(([segment]) => segment);
  }

  const repeatedBigrams = collectSegments(2);
  const repeatedTrigrams = collectSegments(3);
  const fragmentsForBackref = [...repeatedTrigrams, ...repeatedBigrams].slice(0, 4);

  const escapedUnique = uniqueChars.map((ch) => escapeForCharClassChar(ch)).join('');
  const escapedSubset = escapedUnique || 'A';

  const classSubset = `[${escapedSubset}]`;
  const spanSubset = `${classSubset}*`;

  let negClass = null;
  if (uniqueChars.length >= 2) {
    const excludedForNeg = uniqueChars.slice(0, Math.min(2, uniqueChars.length - 1));
    const allowedAfterExclude = themeAlphabet.filter((ch) => !excludedForNeg.includes(ch));
    if (excludedForNeg.length > 0 && allowedAfterExclude.length > 0) {
      const escapedExcluded = excludedForNeg.map((ch) => escapeForCharClassChar(ch)).join('');
      negClass = `[^${escapedExcluded}]`;
    }
  }
  const negSpan = negClass ? `${negClass}*` : null;

  const headPair = line.slice(0, 2);
  const tailPair = line.slice(-2);
  const headTrip = line.slice(0, 3);
  const tailTrip = line.slice(-3);
  const midIndex = Math.max(0, Math.floor(line.length / 2) - 1);
  const midPair = line.slice(midIndex, midIndex + 2);
  const midTrip = line.slice(midIndex, midIndex + 3);

  const segmentSeeds = [
    headPair,
    tailPair,
    headTrip,
    tailTrip,
    midPair,
    midTrip,
    ...matchingWords,
    ...repeatedBigrams,
    ...repeatedTrigrams,
  ]
    .map((segment) => segment && segment.length >= 2 ? segment : null)
    .filter(Boolean);

  const tokenPool = uniqueArray(segmentSeeds).map((segment) => escapeRegexLiteral(segment));
  const shortTokens = tokenPool.filter((token) => token.length <= 4);
  const lineHash = line.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const variantMod = difficulty === 'expert' ? 8 : 6;
  const patternVariant = lineHash % variantMod;

  if (shortTokens.length >= 2) {
    const [firstToken, secondToken] = shortTokens;
    if (firstToken !== secondToken) {
      if (variantMod === 3) {
        if (patternVariant === 0) {
          addPattern(`^.*(${firstToken})${spanSubset}(${secondToken})$`);
        } else if (patternVariant === 1) {
          addPattern(`^${spanSubset}(${firstToken}).*(${secondToken})$`);
        } else {
          addPattern(`^(.*(${firstToken})).*(${secondToken})$`);
        }
        if (negSpan && patternVariant === 0) {
          addPattern(`^(${negSpan}${firstToken})${negSpan}(${secondToken})$`);
        }
      } else {
        switch (patternVariant) {
          case 0:
            addPattern(`^.*(${firstToken})${spanSubset}(${secondToken})$`);
            break;
          case 1:
            addPattern(`^${spanSubset}(${firstToken}).*(${secondToken})$`);
            break;
          case 2:
            addPattern(`^(.*(${firstToken})).*(${secondToken})$`);
            break;
          case 3:
            addPattern(`^(${spanSubset}${firstToken})${spanSubset}$`);
            break;
          case 4:
            addPattern(`^${spanSubset}(${secondToken})${spanSubset}$`);
            break;
          default:
            if (negSpan) {
              addPattern(`^(${negSpan}${firstToken})${negSpan}(${secondToken})$`);
            } else {
              addPattern(`^.*(${firstToken})${spanSubset}(${secondToken})$`);
            }
            break;
        }
      }
    }
  }

  if (shortTokens.length >= 3) {
    const [a, b, c] = shortTokens;
    if (negSpan) {
      addPattern(`^${negSpan}(${a}|${b})${negSpan}(${c})$`);
    }
    addPattern(`^.*(${a}|${b}|${c})${spanSubset}(${a}|${c})$`);
  }

  fragmentsForBackref.forEach((fragment) => {
    const escaped = escapeRegexLiteral(fragment);
    addPattern(`^.*(${escaped})${spanSubset}\\1$`);
    addPattern(`^${spanSubset}(${escaped}).*\\1$`);
    if (negSpan) {
      addPattern(`^${negSpan}(${escaped})${negSpan}\\1$`);
    }
  });

  if (fragmentsForBackref.length >= 2) {
    const first = escapeRegexLiteral(fragmentsForBackref[0]);
    const second = escapeRegexLiteral(fragmentsForBackref[1]);
    if (first !== second) {
      addPattern(`^.*(${first}|${second})${spanSubset}\\1$`);
    }
  }

  if (longestRun.count >= 2) {
    const runRepeat = longestRun.count >= 3 ? `{2,${Math.min(longestRun.count, 4)}}` : '{2}';
    const runChar = escapeRegexLiteral(longestRun.char);
    addPattern(`^.*(${runChar}${runRepeat})${spanSubset}$`);
  }

  if (matchingWords.length && leastChar) {
    const anchorWord = escapeRegexLiteral(matchingWords[0]);
    const rareChar = escapeRegexLiteral(leastChar);
    addPattern(`^.*(${anchorWord})${spanSubset}${rareChar}{2}${spanSubset}$`);
  }

  if (headPair && tailPair && headPair !== tailPair) {
    const escapedHead = escapeRegexLiteral(headPair);
    const escapedTail = escapeRegexLiteral(tailPair);
    addPattern(`^.*(${escapedHead})${spanSubset}(${escapedTail})$`);
  }

  if (topChars.length >= 2) {
    const classPair = topChars.slice(0, 2).map((ch) => escapeForCharClassChar(ch)).join('');
    addPattern(`^.*([${classPair}]{2})${spanSubset}\\1$`);
  }

  if (matchingWords.length >= 2) {
    const [wordA, wordB] = matchingWords.slice(0, 2).map((word) => escapeRegexLiteral(word));
    if (wordA !== wordB) {
      addPattern(`^.*(${wordA}|${wordB})${spanSubset}(${wordA})$`);
    }
  }

  const singleCharTokens = uniqueChars.map((char) => escapeRegexLiteral(char));
  if (singleCharTokens.length >= 3) {
    const [a, b, c] = singleCharTokens;
    addPattern(`^.*(${a}${b})${spanSubset}${c}{2}$`);
  }

  addPattern(`^(${escapeRegexLiteral(line)})$`, { allowEdgeLock: true, forceExpert: true });

  if (candidates.length === 0) {
    addPattern(`^${escapeRegexLiteral(line)}$`, { allowEdgeLock: true, forceExpert: true });
  }

  if (process.env.DEBUG_LINE === line) {
    // 调试用：查看指定行的候选规则
    console.error(`调试行: ${line}`);
    console.error('shortTokens:', shortTokens);
    console.error('fragmentsForBackref:', fragmentsForBackref);
    console.error('matchingWords:', matchingWords);
    console.error('uniqueChars:', uniqueChars);
    console.error('negSpan:', negSpan);
    console.error('候选规则:', candidates.map((item) => item.pattern));
  }

  return candidates;
}


function orExpressions(ctx, exprs) {
  if (exprs.length === 0) {
    return ctx.Bool.val(false);
  }
  if (exprs.length === 1) {
    return exprs[0];
  }
  return ctx.Or(...exprs);
}

async function buildAllRules(allLines, coords, difficulty, ctx, theme, signatureCap, board) {
  const alphabetLetters = Array.from(new Set(theme.alphabet.toUpperCase().split('')));
  if (alphabetLetters.length === 0) {
    throw new Error('主题字母表为空');
  }
  if (alphabetLetters.length > 30) {
    throw new Error('字母表长度过大，无法使用位掩码建模');
  }

  const letterToIndex = new Map();
  alphabetLetters.forEach((letter, index) => {
    letterToIndex.set(letter, index);
  });
  const indexToLetter = alphabetLetters.slice();

  const axisNames = ['x', 'y', 'z'];
  const axisData = {};

  axisNames.forEach((axis) => {
    axisData[axis] = allLines[axis].map((line, lineIndex) => {
      const candidates = generateCandidates(line, difficulty, theme);
      if (candidates.length === 0) {
        throw new Error(`No regex candidates available for ${axis}_${lineIndex}`);
      }
      const rawInfos = candidates.map((candidate, candidateIndex) => {
        const boolVar = ctx.Bool.const(`${axis}_${lineIndex}_cand_${candidateIndex}`);
        const allowedMasks = computeAllowedMasksForLine(
          line,
          candidate.pattern,
          alphabetLetters,
          letterToIndex
        );
        if (
          !allowedMasks.every((mask, pos) =>
            maskAllowsLetter(mask, letterToIndex.get(line[pos]))
          )
        ) {
          throw new Error(`Candidate ${candidate.pattern} 排除了原始字符 (axis=${axis}, index=${lineIndex})`);
        }
        return {
          pattern: candidate.pattern,
          features: candidate.features,
          forceExpert: candidate.forceExpert,
          complexity: typeof candidate.complexity === 'number'
            ? candidate.complexity
            : complexityScore(candidate.features),
          signature: patternSignature(stripAnchors(candidate.pattern)),
          boolVar,
          allowedMasks,
        };
      });

      const fallbackSet = new Set(
        rawInfos.filter((info) => info.forceExpert).map((info) => info.pattern)
      );
      const limit = difficulty === 'expert' ? 6 : 5;
      const sorted = rawInfos
        .filter((info) => !info.forceExpert)
        .sort((a, b) => {
          if (b.complexity !== a.complexity) {
            return b.complexity - a.complexity;
          }
          if (a.pattern.length !== b.pattern.length) {
            return a.pattern.length - b.pattern.length;
          }
          return a.pattern.localeCompare(b.pattern);
        })
        .slice(0, limit);

      const candidateInfos = [...sorted];
      rawInfos.forEach((info) => {
        if (fallbackSet.has(info.pattern) && !candidateInfos.some((item) => item.pattern === info.pattern)) {
          candidateInfos.push(info);
        }
      });

      return {
        line,
        coords: coords[axis][lineIndex],
        candidates: candidateInfos,
      };
    });
  });

  const coordinateEntries = new Map();

  axisNames.forEach((axis) => {
    axisData[axis].forEach((lineData) => {
      lineData.coords.forEach(([q, r], position) => {
        const key = `${q},${r}`;
        let entry = coordinateEntries.get(key);
        if (!entry) {
          const actual = board.cells.get(key);
          if (!actual) {
            throw new Error(`Board missing character at ${key}`);
          }
          entry = {
            actual,
            axes: {
              x: new Map(),
              y: new Map(),
              z: new Map(),
            },
          };
          coordinateEntries.set(key, entry);
        }

        const axisMap = entry.axes[axis];
        lineData.candidates.forEach((candidate) => {
          const allowedMask = candidate.allowedMasks[position];
          const lettersForMask = maskToLetters(allowedMask, indexToLetter);
          lettersForMask.forEach((letter) => {
            let bucket = axisMap.get(letter);
            if (!bucket) {
              bucket = [];
              axisMap.set(letter, bucket);
            }
            bucket.push(candidate.boolVar);
          });
        });
      });
    });
  });

  let minTotalLength = 0;
  let maxTotalLength = 0;
  let maxTotalComplexity = 0;

  axisNames.forEach((axis) => {
    axisData[axis].forEach((lineData) => {
      let lineMinLength = Infinity;
      let lineMaxLength = 0;
      let lineMaxComplexity = 0;
      lineData.candidates.forEach((candidate) => {
        lineMinLength = Math.min(lineMinLength, candidate.pattern.length);
        lineMaxLength = Math.max(lineMaxLength, candidate.pattern.length);
        lineMaxComplexity = Math.max(lineMaxComplexity, candidate.complexity);
      });
      minTotalLength += lineMinLength;
      maxTotalLength += lineMaxLength;
      maxTotalComplexity += lineMaxComplexity;
    });
  });

  const solver = new ctx.Solver();
  const zero = ctx.Int.val(0);
  const one = ctx.Int.val(1);
  let totalLength = ctx.Int.val(0);
  let totalComplexity = ctx.Int.val(0);

  const signatureCounts = { x: new Map(), y: new Map(), z: new Map() };

  axisNames.forEach((axis) => {
    axisData[axis].forEach((lineData, lineIndex) => {
      const selectVars = lineData.candidates.map((candidate) => candidate.boolVar);
      let sumSelected = ctx.Int.val(0);
      selectVars.forEach((boolVar) => {
        sumSelected = sumSelected.add(ctx.If(boolVar, one, zero));
      });
      solver.add(sumSelected.eq(one));

      lineData.candidates.forEach((candidate) => {
        const { features, forceExpert } = candidate;
        const featureCount =
          (features.hasBackreference ? 1 : 0) +
          (features.alternation ? 1 : 0) +
          (features.quantifier ? 1 : 0) +
          (features.hasCharClass ? 1 : 0) +
          (features.hasNegatedClass ? 1 : 0) +
          (features.group ? 1 : 0);
        if (!features.hasStructure) {
          solver.add(candidate.boolVar.not());
          return;
        }
        if (difficulty === 'normal') {
          if (features.hasNegativeLookahead || features.hasNegativeLookbehind) {
            solver.add(candidate.boolVar.not());
            return;
          }
        }
        if (difficulty === 'expert' && !forceExpert) {
          const qualifies =
            featureCount >= 2 &&
            (features.hasCharClass || features.alternation || features.hasNegatedClass || features.hasBackreference);
          if (!qualifies) {
            solver.add(candidate.boolVar.not());
            return;
          }
        }
        const signatureCount = signatureCounts[axis].get(candidate.signature) ?? 0;
        if (signatureCount >= signatureCap && !candidate.forceExpert) {
          solver.add(candidate.boolVar.not());
        }
      });

      lineData.candidates.forEach((candidate) => {
        const lengthConst = ctx.Int.val(candidate.pattern.length);
        const complexityConst = ctx.Int.val(candidate.complexity);
        totalLength = totalLength.add(ctx.If(candidate.boolVar, lengthConst, zero));
        totalComplexity = totalComplexity.add(ctx.If(candidate.boolVar, complexityConst, zero));
      });
    });
  });

  coordinateEntries.forEach((entry, key) => {
    ['x', 'y', 'z'].forEach((axis) => {
      const actualBuckets = entry.axes[axis].get(entry.actual) ?? [];
      if (actualBuckets.length === 0) {
        throw new Error(`坐标 ${key} 在轴 ${axis} 上不允许原始字符 ${entry.actual}`);
      }
      solver.add(orExpressions(ctx, actualBuckets));
    });

    const lettersToCheck = new Set();
    entry.axes.x.forEach((_, letter) => lettersToCheck.add(letter));
    entry.axes.y.forEach((_, letter) => lettersToCheck.add(letter));
    entry.axes.z.forEach((_, letter) => lettersToCheck.add(letter));
    lettersToCheck.delete(entry.actual);

    lettersToCheck.forEach((letter) => {
      const allowX = orExpressions(ctx, entry.axes.x.get(letter) ?? []);
      const allowY = orExpressions(ctx, entry.axes.y.get(letter) ?? []);
      const allowZ = orExpressions(ctx, entry.axes.z.get(letter) ?? []);
      solver.add(ctx.Or(allowX.not(), allowY.not(), allowZ.not()));
    });
  });

  const checkResult = await solver.check();
  if (checkResult !== 'sat') {
    throw new Error('Z3 无法找到满足唯一性约束的规则组合');
  }

  const model = solver.model();
  const bestAssignment = new Map();
  axisNames.forEach((axis) => {
    axisData[axis].forEach((lineData) => {
      lineData.candidates.forEach((candidate) => {
        const evaluation = model.eval(candidate.boolVar, true);
        const isSelected =
          typeof evaluation.isTrue === 'function'
            ? evaluation.isTrue()
            : evaluation.toString() === 'true';
        bestAssignment.set(candidate.boolVar.toString(), isSelected);
      });
    });
  });

  const rulesByAxis = { x: [], y: [], z: [] };

  axisNames.forEach((axis) => {
    axisData[axis].forEach((lineData, lineIndex) => {
      let selectedPattern = null;
      lineData.candidates.forEach((candidate) => {
        const key = candidate.boolVar.toString();
        const isSelected = bestAssignment.get(key) === true;
        if (isSelected) {
          selectedPattern = candidate.pattern;
          const current = signatureCounts[axis].get(candidate.signature) ?? 0;
          signatureCounts[axis].set(candidate.signature, current + 1);
        }
      });
      if (!selectedPattern) {
        throw new Error(`未能确定轴 ${axis} 第 ${lineIndex} 条规则`);
      }
      rulesByAxis[axis].push(selectedPattern);
    });
  });

  return rulesByAxis;
}

function assertMatches(axis, rules, lines) {
  rules.forEach((pattern, index) => {
    const regex = new RegExp(pattern);
    const line = lines[index];
    if (!regex.test(line)) {
      throw new Error(
        `Generated rule for axis ${axis} index ${index} pattern ${pattern} does not match line ${line}`
      );
    }
  });
}

function stripAnchors(pattern) {
  let result = pattern;
  if (result.startsWith('^')) {
    result = result.slice(1);
  }
  if (result.endsWith('$')) {
    result = result.slice(0, -1);
  }
  return result;
}

function ensureAnchored(pattern) {
  let result = pattern;
  if (!result.startsWith('^')) {
    result = `^${result}`;
  }
  if (!result.endsWith('$')) {
    result = `${result}$`;
  }
  return result;
}

function assertStrippedMatches(axis, strippedRules, lines) {
  strippedRules.forEach((rule, index) => {
    const anchored = ensureAnchored(rule);
    const regex = new RegExp(anchored);
    const line = lines[index];
    if (!regex.test(line)) {
      throw new Error(
        `Output rule for axis ${axis} index ${index} does not match original line ${lines[index]}`
      );
    }
  });
}

function assertUniqueRules(label, rules) {
  const seen = new Set();
  rules.forEach((rule, index) => {
    if (seen.has(rule)) {
      throw new Error(`Duplicate rule detected for ${label} at index ${index}: ${rule}`);
    }
    seen.add(rule);
  });
}

function assertGlobalUniqueness(rulesX, rulesY, rulesZ) {
  const all = [...rulesX, ...rulesY, ...rulesZ];
  const seen = new Set();
  all.forEach((rule) => {
    if (seen.has(rule)) {
      throw new Error(`Duplicate rule detected across axes: ${rule}`);
    }
    seen.add(rule);
  });
}

function assertDistinctSignatures(label, rules, maxPerSignature = 2) {
  const seen = new Map();
  rules.forEach((rule, index) => {
    const signature = patternSignature(rule);
    const count = seen.get(signature) ?? 0;
    if (count + 1 > maxPerSignature) {
      throw new Error(
        `${label} 中结构过于重复 (signature: ${signature}, index: ${index}, rule: ${rule})`
      );
    }
    seen.set(signature, count + 1);
  });
}

async function main() {
  const difficulty = parseDifficulty(process.argv[2]);
  const z3 = await init();
  const ctx = new z3.Context('regex-crossword');
  const seedRaw = process.env.SEED;
  const numericSeed = seedRaw !== undefined ? Number(seedRaw) : NaN;
  const rngFn = Number.isFinite(numericSeed) ? createSeededRng(numericSeed) : Math.random;

  const maxAttempts = difficulty === 'expert' ? 25 : 12;
  let attempt = 0;
  let payload = null;
  const axisSignatureCap = 8;

  while (attempt < maxAttempts) {
    attempt += 1;
    const theme = chooseTheme(rngFn);
    const board = generateHexBoard(SIDE, theme, rngFn);
    const coords = buildOfficialCoordinateLists(SIZE);
    const linesX = coords.x.map((coordList) => readLineFromCoords(board, coordList));
    const linesY = coords.y.map((coordList) => readLineFromCoords(board, coordList));
    const linesZ = coords.z.map((coordList) => readLineFromCoords(board, coordList));

    try {
      const rulesByAxis = await buildAllRules(
        { x: linesX, y: linesY, z: linesZ },
        coords,
        difficulty,
        ctx,
        theme,
        axisSignatureCap,
        board
      );
      const rulesX = rulesByAxis.x;
      const rulesY = rulesByAxis.y;
      const rulesZ = rulesByAxis.z;

      assertMatches('x', rulesX, linesX);
      assertMatches('y', rulesY, linesY);
      assertMatches('z', rulesZ, linesZ);

      const strippedX = rulesX.map(stripAnchors);
      const strippedY = rulesY.map(stripAnchors);
      const strippedZ = rulesZ.map(stripAnchors);

      assertStrippedMatches('x', strippedX, linesX);
      assertStrippedMatches('y', strippedY, linesY);
      assertStrippedMatches('z', strippedZ, linesZ);
      assertUniqueRules('rulesX', strippedX);
      assertUniqueRules('rulesY', strippedY);
      assertUniqueRules('rulesZ', strippedZ);
      assertGlobalUniqueness(strippedX, strippedY, strippedZ);
      assertDistinctSignatures('rulesX', strippedX, axisSignatureCap);
      assertDistinctSignatures('rulesY', strippedY, axisSignatureCap);
      assertDistinctSignatures('rulesZ', strippedZ, axisSignatureCap);

      const alphabetLetters = Array.from(new Set(theme.alphabet.toUpperCase().split('')));
      if (alphabetLetters.length > 30) {
        throw new Error('字母表长度过大，无法使用位掩码建模');
      }
      const letterToIndex = new Map();
      alphabetLetters.forEach((letter, index) => {
        letterToIndex.set(letter, index);
      });
      const allowedX = rulesX.map((pattern, index) =>
        computeAllowedMasksForLine(
          linesX[index],
          pattern,
          alphabetLetters,
          letterToIndex
        )
      );
      const allowedY = rulesY.map((pattern, index) =>
        computeAllowedMasksForLine(
          linesY[index],
          pattern,
          alphabetLetters,
          letterToIndex
        )
      );
      const allowedZ = rulesZ.map((pattern, index) =>
        computeAllowedMasksForLine(
          linesZ[index],
          pattern,
          alphabetLetters,
          letterToIndex
        )
      );

      const allowedMap = new Map();

      function intersectCoordSets(coordList, allowedArray) {
        coordList.forEach(([q, r], position) => {
          const key = `${q},${r}`;
          const allowedMask = allowedArray[position];
          if (!allowedMap.has(key)) {
            allowedMap.set(key, allowedMask);
          } else {
            const existing = allowedMap.get(key);
            allowedMap.set(key, existing & allowedMask);
          }
        });
      }

      coords.x.forEach((coordList, index) => intersectCoordSets(coordList, allowedX[index]));
      coords.y.forEach((coordList, index) => intersectCoordSets(coordList, allowedY[index]));
      coords.z.forEach((coordList, index) => intersectCoordSets(coordList, allowedZ[index]));

      allowedMap.forEach((mask, key) => {
        const actual = board.cells.get(key);
        const actualIndex = letterToIndex.get(actual);
        if (actualIndex === undefined || !maskAllowsLetter(mask, actualIndex)) {
          throw new Error(`规则在坐标 ${key} 上排除了原网格字符 ${actual}`);
        }
        if (mask !== (1 << actualIndex)) {
          const extras = maskToLetters(mask, alphabetLetters).filter((letter) => letter !== actual);
          throw new Error(`规则在坐标 ${key} 仍允许额外字符: ${extras.join(',')}`);
        }
      });

      payload = {
        size: String(SIZE),
        author: theme.name ?? '',
        name: difficulty,
        x: strippedX,
        y: strippedY,
        z: strippedZ,
      };

      if (process.env.DEBUG_SOLUTION === '1') {
        console.error('Solution x (diagonal reversed):', linesX.join(' / '));
        console.error('Solution y (rows):', linesY.join(' / '));
        console.error('Solution z (diagonal):', linesZ.join(' / '));
      }

      break;
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
    }
  }

  if (typeof ctx.close === 'function') {
    ctx.close();
  }

  if (!payload) {
    throw new Error('Failed to generate a valid puzzle payload');
  }

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  console.log(`https://jimbly.github.io/regex-crossword?puzzle=${encoded}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
