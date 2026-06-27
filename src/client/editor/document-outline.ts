export interface OutlineHeading {
  id: string;
  index: number;
  level: number;
  title: string;
}

export interface OutlineNode extends OutlineHeading {
  children: OutlineNode[];
}

export function parseMarkdownHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,5})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const title = match[2].trim();
    if (!title) continue;

    const index = headings.length;
    headings.push({
      id: `heading-${index}`,
      index,
      level: match[1].length,
      title,
    });
  }

  return headings;
}

export function buildOutlineTree(headings: OutlineHeading[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  for (const heading of headings) {
    const node: OutlineNode = { ...heading, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }

  return roots;
}
