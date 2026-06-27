const LANGUAGE_PATTERNS: Array<{
  language: string;
  score: (text: string) => number;
}> = [
  {
    language: 'JSON',
    score: (text) => {
      const trimmed = text.trim();
      if (!/^[{[][\s\S]*[\]}]$/.test(trimmed)) return 0;
      try {
        JSON.parse(trimmed);
        return 8;
      } catch {
        return 0;
      }
    },
  },
  {
    language: 'TypeScript',
    score: (text) =>
      countMatches(text, [
        /\b(interface|type|enum|implements|readonly|namespace)\b/,
        /:\s*(string|number|boolean|unknown|Record<|Array<|\w+\[\])/,
        /\b(import|export)\s+type\b/,
      ]) + (/\b(const|let)\s+\w+\s*:/.test(text) ? 3 : 0),
  },
  {
    language: 'JavaScript',
    score: (text) =>
      countMatches(text, [
        /\b(function|const|let|var|=>|async|await)\b/,
        /\b(import|export)\s+/,
        /\bconsole\.(log|error|warn)\b/,
        /\bdocument\.querySelector\b/,
      ]),
  },
  {
    language: 'Python',
    score: (text) =>
      countMatches(text, [
        /^\s*def\s+\w+\s*\(/m,
        /^\s*class\s+\w+[:(]/m,
        /^\s*(from|import)\s+\w+/m,
        /^\s*return\b/m,
        /\bself\b|:\s*(#.*)?$/m,
      ]),
  },
  {
    language: 'SQL',
    score: (text) =>
      countMatches(text, [
        /\bSELECT\b[\s\S]+\bFROM\b/i,
        /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE)\b/i,
        /\bWHERE\b|\bJOIN\b|\bGROUP\s+BY\b/i,
      ]),
  },
  {
    language: 'Shell',
    score: (text) =>
      countMatches(text, [
        /^#!\/(?:usr\/bin\/env\s+)?(?:ba|z|fi)?sh/m,
        /\b(?:npm|pnpm|yarn|git|cd|mkdir|rm|cp|mv)\s+[\w./-]/,
        /\$\{?\w+\}?/,
      ]),
  },
  {
    language: 'C',
    score: (text) =>
      countMatches(text, [
        /#include\s+[<"]/,
        /\b(?:uint\d+_t|int|char|struct|typedef|sizeof)\b/,
        /\b\w+\s*\([^)]*\)\s*\{/,
        /;\s*(?:\/\/|$)/m,
        /0x[0-9a-f]+/i,
      ]) + (/^[A-Z]\.\w+\s*\(/m.test(text) ? 4 : 0),
  },
];

export function inferCodeBlockLanguage(text: string): string {
  const normalized = text.trim();
  if (!normalized || normalized.split(/\s+/).length < 3) return '';

  let best = { language: '', score: 0 };
  for (const candidate of LANGUAGE_PATTERNS) {
    const score = candidate.score(normalized);
    if (score > best.score) {
      best = { language: candidate.language, score };
    }
  }

  return best.score >= 3 ? best.language : '';
}

export function withInferredCodeBlockLanguages(markdown: string): string {
  const lines = markdown.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index]?.match(/^```(\S*)\s*$/);
    if (!opening) continue;

    const language = opening[1];
    const codeStart = index + 1;
    let codeEnd = codeStart;
    while (codeEnd < lines.length && lines[codeEnd] !== '```') {
      codeEnd += 1;
    }
    if (codeEnd >= lines.length) break;

    if (!language) {
      const inferred = inferCodeBlockLanguage(lines.slice(codeStart, codeEnd).join('\n'));
      if (inferred) lines[index] = `\`\`\`${inferred}`;
    }
    index = codeEnd;
  }
  return lines.join('\n');
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0),
    0,
  );
}
