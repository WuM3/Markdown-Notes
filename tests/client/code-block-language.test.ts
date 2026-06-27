import { describe, expect, it } from 'vitest';
import {
  inferCodeBlockLanguage,
  withInferredCodeBlockLanguages,
} from '../../src/client/editor/code-block-language.js';

describe('code block language inference', () => {
  it('detects common pasted snippets without overriding explicit languages', () => {
    expect(inferCodeBlockLanguage('const value: string = props.title;')).toBe(
      'TypeScript',
    );
    expect(inferCodeBlockLanguage('def train(model):\n    return model.fit()')).toBe(
      'Python',
    );
    expect(
      inferCodeBlockLanguage(
        'C.remove_gtpu(\n  teid = 0x00000002, // PDR.PDI.Local_FTEID.TEID\n)',
      ),
    ).toBe('C');

    expect(
      withInferredCodeBlockLanguages(
        '```python\nprint("keep")\n```\n\n```\nconst answer: number = 42;\n```',
      ),
    ).toBe(
      '```python\nprint("keep")\n```\n\n```TypeScript\nconst answer: number = 42;\n```',
    );
  });
});
