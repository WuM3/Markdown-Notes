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
        /\b(?:npm|pnpm|yarn|git|cd|mkdir|rm|cp|mv|uname|cat|grep|awk|sed|ls|ps|ip|ifconfig|systemctl|journalctl|dmesg)\s+[\w./-]/,
        /\$\{?\w+\}?/,
        /^\S+\s+\/[^\n]*\s[#$]\s+\S+/m,
        /^(?:ID|NAME|VERSION|VERSION_ID|PRETTY_NAME|DISTRO_CODENAME)=/m,
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

export function normalizePastedCodeBlock(text: string, html = ''): {
  language: string;
  text: string;
} {
  const htmlCodeBlock = extractHtmlCodeBlock(html);
  if (htmlCodeBlock) return htmlCodeBlock;

  const normalized = text.replace(/\r\n?/g, '\n').trim();
  const fenced = normalized.match(/^```([^\n`]*)\n([\s\S]*?)\n?```$/);
  if (fenced) {
    const language = normalizeLanguageName(fenced[1]?.trim() ?? '');
    const code = trimOuterBlankLines(fenced[2]?.split('\n') ?? []).join('\n');
    return {
      language: language || inferCodeBlockLanguage(code),
      text: code,
    };
  }

  const code = trimOuterBlankLines(text.replace(/\r\n?/g, '\n').split('\n')).join('\n');
  return {
    language: '',
    text: code,
  };
}

export function markdownForPlainTextPaste(text: string): string {
  return trimOuterBlankLines(text.replace(/\r\n?/g, '\n').split('\n')).join('  \n');
}

export function markdownForRichClipboard(html: string): string | undefined {
  if (!hasRichCodeBlock(html)) return undefined;

  const parser = globalThis.DOMParser
    ? new DOMParser()
    : undefined;
  if (!parser) return undefined;

  const document = parser.parseFromString(html, 'text/html');
  const blocks = collectMarkdownBlocks(document.body);
  const markdown = trimOuterBlankLines(
    blocks
      .map((block) => block.trim())
      .filter(Boolean)
      .join('\n\n')
      .split('\n'),
  ).join('\n');

  return markdown || undefined;
}

export function hasRichCodeBlock(html: string): boolean {
  return extractHtmlCodeBlock(html) !== undefined;
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

    const codeLines = trimOuterBlankLines(lines.slice(codeStart, codeEnd));
    if (!language) {
      const inferred = inferCodeBlockLanguage(codeLines.join('\n'));
      if (inferred) lines[index] = `\`\`\`${inferred}`;
    }
    lines.splice(codeStart, codeEnd - codeStart, ...codeLines);
    codeEnd = codeStart + codeLines.length;
    index = codeEnd;
  }
  return lines.join('\n');
}

function normalizeLanguageName(language: string): string {
  if (!language) return '';
  const lower = language.toLowerCase();
  if (lower === 'ts' || lower === 'typescript') return 'TypeScript';
  if (lower === 'js' || lower === 'javascript') return 'JavaScript';
  if (lower === 'py' || lower === 'python') return 'Python';
  if (lower === 'sh' || lower === 'bash' || lower === 'shell') return 'Shell';
  if (lower === 'json') return 'JSON';
  if (lower === 'sql') return 'SQL';
  if (lower === 'c') return 'C';
  if (lower === 'dockerfile' || lower === 'docker') return 'Dockerfile';
  return language;
}

function extractHtmlCodeBlock(html: string):
  | {
      language: string;
      text: string;
    }
  | undefined {
  if (!html || !/<pre[\s>]/i.test(html)) return undefined;
  const preMatch = html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i);
  if (!preMatch) return undefined;
  const preHtml = preMatch[1] ?? '';
  const codeMatch = preHtml.match(/<code\b([^>]*)>([\s\S]*?)<\/code>/i);
  const attrs = codeMatch?.[1] ?? '';
  const body = codeMatch?.[2] ?? preHtml;
  const classLanguage = attrs.match(/language-([a-z0-9_+#.-]+)/i)?.[1] ?? '';
  const text = htmlToPlainText(body);
  const code = trimOuterBlankLines(text.replace(/\r\n?/g, '\n').split('\n')).join('\n');
  return {
    language: normalizeLanguageName(classLanguage) || inferCodeBlockLanguage(code),
    text: code,
  };
}

function collectMarkdownBlocks(node: Node): string[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizeInlineWhitespace(node.textContent ?? '').trim();
    return text ? [text] : [];
  }

  if (!(node instanceof HTMLElement)) return [];
  if (shouldIgnoreElement(node)) return [];

  const tag = node.tagName.toLowerCase();
  if (tag === 'pre') {
    const block = markdownCodeBlockFromPre(node);
    return block ? [block] : [];
  }

  if (tag === 'p' || /^h[1-6]$/.test(tag)) {
    const inline = inlineMarkdownFromNode(node).trim();
    return inline ? [inline] : [];
  }

  if (tag === 'li') {
    const inline = inlineMarkdownFromNode(node).trim();
    return inline ? [`- ${inline}`] : [];
  }

  if (tag === 'blockquote') {
    return collectMarkdownBlocksFromChildren(node)
      .map((block) =>
        block
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n'),
      );
  }

  if (hasBlockChild(node) || tag === 'body') {
    return collectMarkdownBlocksFromChildren(node);
  }

  const inline = inlineMarkdownFromNode(node).trim();
  return inline ? [inline] : [];
}

function collectMarkdownBlocksFromChildren(element: HTMLElement): string[] {
  const blocks: string[] = [];
  const children = Array.from(element.childNodes);
  children.forEach((child, index) => {
    if (
      child instanceof HTMLElement &&
      isCodeBlockHeader(child, nextElement(children, index))
    ) {
      return;
    }
    blocks.push(...collectMarkdownBlocks(child));
  });
  return blocks;
}

function nextElement(children: Node[], index: number): HTMLElement | undefined {
  for (let cursor = index + 1; cursor < children.length; cursor += 1) {
    const child = children[cursor];
    if (child instanceof HTMLElement) return child;
  }
  return undefined;
}

function isCodeBlockHeader(
  element: HTMLElement,
  next: HTMLElement | undefined,
): boolean {
  if (!next || next.tagName.toLowerCase() !== 'pre') return false;
  const text = normalizeInlineWhitespace(element.textContent ?? '').trim();
  return (
    text.length > 0 &&
    text.length <= 32 &&
    /^(bash|shell|sh|text|javascript|typescript|python|dockerfile|json|sql|c|c\+\+|java|go|rust)$/i.test(text)
  );
}

function hasBlockChild(element: HTMLElement): boolean {
  return Array.from(element.children).some((child) =>
    /^(address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|ul)$/i.test(
      child.tagName,
    ),
  );
}

function inlineMarkdownFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeInlineWhitespace(node.textContent ?? '');
  }
  if (!(node instanceof HTMLElement)) return '';
  if (shouldIgnoreElement(node) || node.tagName.toLowerCase() === 'pre') return '';

  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '  \n';
  if (tag === 'code') {
    return inlineCodeMarkdown(node.textContent ?? '');
  }

  return Array.from(node.childNodes).map(inlineMarkdownFromNode).join('');
}

function markdownCodeBlockFromPre(pre: HTMLElement): string | undefined {
  const code = pre.querySelector('code');
  const text = code?.textContent ?? pre.textContent ?? '';
  const lines = trimOuterBlankLines(text.replace(/\r\n?/g, '\n').split('\n'));
  if (!lines.length) return undefined;

  const className = code?.getAttribute('class') ?? pre.getAttribute('class') ?? '';
  const classLanguage = className.match(/language-([a-z0-9_+#.-]+)/i)?.[1] ?? '';
  const body = lines.join('\n');
  const language = normalizeLanguageName(classLanguage) || inferCodeBlockLanguage(body);
  return `\`\`\`${language}\n${body}\n\`\`\``;
}

function inlineCodeMarkdown(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const fence = normalized.includes('`') ? '``' : '`';
  return `${fence}${normalized}${fence}`;
}

function normalizeInlineWhitespace(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
}

function shouldIgnoreElement(element: HTMLElement): boolean {
  return /^(script|style|button|svg|textarea|select|input)$/i.test(element.tagName);
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>|<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === '') start += 1;
  while (end > start && lines[end - 1]?.trim() === '') end -= 1;
  return lines.slice(start, end);
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0),
    0,
  );
}
