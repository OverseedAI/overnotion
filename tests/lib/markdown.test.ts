import { describe, it, expect } from 'vitest';
import { markdownToBlocks, inlineTokensToRichText } from '../../src/lib/markdown.js';
import { marked } from 'marked';

function getBlock(blocks: any[], index: number) {
  return blocks[index];
}

function getRichText(block: any): any[] {
  const key = block.type;
  return block[key]?.rich_text ?? [];
}

function plainText(rt: any[]): string {
  return rt.map((r: any) => r.text.content).join('');
}

describe('markdownToBlocks', () => {
  describe('headings', () => {
    it('should parse h1', () => {
      const blocks = markdownToBlocks('# Hello');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading_1');
      expect(plainText(getRichText(blocks[0]))).toBe('Hello');
    });

    it('should parse h2', () => {
      const blocks = markdownToBlocks('## Hello');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading_2');
    });

    it('should parse h3', () => {
      const blocks = markdownToBlocks('### Hello');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading_3');
    });

    it('should clamp h4+ to heading_3', () => {
      const blocks = markdownToBlocks('#### Deep heading');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('heading_3');
      expect(plainText(getRichText(blocks[0]))).toBe('Deep heading');
    });
  });

  describe('paragraphs', () => {
    it('should parse plain text as paragraph', () => {
      const blocks = markdownToBlocks('Just some text');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(plainText(getRichText(blocks[0]))).toBe('Just some text');
    });

    it('should handle multiple paragraphs', () => {
      const blocks = markdownToBlocks('First paragraph\n\nSecond paragraph');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[1].type).toBe('paragraph');
    });
  });

  describe('bullet lists', () => {
    it('should parse unordered list items', () => {
      const blocks = markdownToBlocks('- item one\n- item two\n- item three');
      expect(blocks).toHaveLength(3);
      for (const block of blocks) {
        expect(block.type).toBe('bulleted_list_item');
      }
      expect(plainText(getRichText(blocks[0]))).toBe('item one');
      expect(plainText(getRichText(blocks[1]))).toBe('item two');
      expect(plainText(getRichText(blocks[2]))).toBe('item three');
    });
  });

  describe('numbered lists', () => {
    it('should parse ordered list items', () => {
      const blocks = markdownToBlocks('1. first\n2. second\n3. third');
      expect(blocks).toHaveLength(3);
      for (const block of blocks) {
        expect(block.type).toBe('numbered_list_item');
      }
      expect(plainText(getRichText(blocks[0]))).toBe('first');
    });
  });

  describe('to-do items', () => {
    it('should parse unchecked todo', () => {
      const blocks = markdownToBlocks('- [ ] unchecked task');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('to_do');
      expect((blocks[0] as any).to_do.checked).toBe(false);
      expect(plainText(getRichText(blocks[0]))).toBe('unchecked task');
    });

    it('should parse checked todo', () => {
      const blocks = markdownToBlocks('- [x] checked task');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('to_do');
      expect((blocks[0] as any).to_do.checked).toBe(true);
      expect(plainText(getRichText(blocks[0]))).toBe('checked task');
    });
  });

  describe('code blocks', () => {
    it('should parse fenced code block', () => {
      const blocks = markdownToBlocks('```\nhello world\n```');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('code');
      expect((blocks[0] as any).code.language).toBe('plain text');
      expect(plainText(getRichText(blocks[0]))).toBe('hello world');
    });

    it('should parse code block with language', () => {
      const blocks = markdownToBlocks('```typescript\nconst x = 1;\n```');
      expect(blocks).toHaveLength(1);
      expect((blocks[0] as any).code.language).toBe('typescript');
    });

    it('should map language aliases', () => {
      const blocks = markdownToBlocks('```js\nvar x;\n```');
      expect((blocks[0] as any).code.language).toBe('javascript');
    });

    it('should fallback to plain text for unknown languages', () => {
      const blocks = markdownToBlocks('```brainfuck\n+++\n```');
      expect((blocks[0] as any).code.language).toBe('plain text');
    });
  });

  describe('blockquotes', () => {
    it('should parse blockquote', () => {
      const blocks = markdownToBlocks('> This is a quote');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('quote');
      expect(plainText(getRichText(blocks[0]))).toBe('This is a quote');
    });
  });

  describe('dividers', () => {
    it('should parse horizontal rule', () => {
      const blocks = markdownToBlocks('---');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('divider');
    });

    it('should parse alternative hr syntax', () => {
      const blocks = markdownToBlocks('***');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('divider');
    });
  });

  describe('inline formatting', () => {
    it('should parse bold text', () => {
      const blocks = markdownToBlocks('**bold text**');
      const rt = getRichText(blocks[0]);
      expect(rt).toHaveLength(1);
      expect(rt[0].text.content).toBe('bold text');
      expect(rt[0].annotations?.bold).toBe(true);
    });

    it('should parse italic text', () => {
      const blocks = markdownToBlocks('*italic text*');
      const rt = getRichText(blocks[0]);
      expect(rt).toHaveLength(1);
      expect(rt[0].text.content).toBe('italic text');
      expect(rt[0].annotations?.italic).toBe(true);
    });

    it('should parse strikethrough', () => {
      const blocks = markdownToBlocks('~~struck~~');
      const rt = getRichText(blocks[0]);
      expect(rt).toHaveLength(1);
      expect(rt[0].text.content).toBe('struck');
      expect(rt[0].annotations?.strikethrough).toBe(true);
    });

    it('should parse inline code', () => {
      const blocks = markdownToBlocks('use `code` here');
      const rt = getRichText(blocks[0]);
      const codePart = rt.find((r: any) => r.annotations?.code);
      expect(codePart).toBeDefined();
      expect(codePart.text.content).toBe('code');
    });

    it('should parse links', () => {
      const blocks = markdownToBlocks('[click here](https://example.com)');
      const rt = getRichText(blocks[0]);
      const linkPart = rt.find((r: any) => r.text.link);
      expect(linkPart).toBeDefined();
      expect(linkPart.text.content).toBe('click here');
      expect(linkPart.text.link.url).toBe('https://example.com');
    });

    it('should handle bold + italic combined', () => {
      const blocks = markdownToBlocks('***bold and italic***');
      const rt = getRichText(blocks[0]);
      expect(rt).toHaveLength(1);
      expect(rt[0].annotations?.bold).toBe(true);
      expect(rt[0].annotations?.italic).toBe(true);
    });
  });

  describe('mixed content', () => {
    it('should parse multiple block types', () => {
      const md = `# Title

Some paragraph text.

- bullet one
- bullet two

> a quote

---

\`\`\`python
print("hello")
\`\`\``;

      const blocks = markdownToBlocks(md);
      const types = blocks.map(b => b.type);

      expect(types).toContain('heading_1');
      expect(types).toContain('paragraph');
      expect(types).toContain('bulleted_list_item');
      expect(types).toContain('quote');
      expect(types).toContain('divider');
      expect(types).toContain('code');
    });
  });

  describe('backward compatibility', () => {
    it('should treat plain text as a single paragraph', () => {
      const blocks = markdownToBlocks('Hello world');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(plainText(getRichText(blocks[0]))).toBe('Hello world');
    });

    it('should handle empty string', () => {
      const blocks = markdownToBlocks('');
      expect(blocks).toHaveLength(0);
    });
  });
});

describe('inlineTokensToRichText', () => {
  it('should convert plain text tokens', () => {
    const tokens = marked.lexer('plain text');
    const paragraph = tokens.find(t => t.type === 'paragraph') as any;
    const rt = inlineTokensToRichText(paragraph.tokens);
    expect(rt).toHaveLength(1);
    expect(rt[0].text.content).toBe('plain text');
  });

  it('should convert nested bold+italic', () => {
    const tokens = marked.lexer('***nested***');
    const paragraph = tokens.find(t => t.type === 'paragraph') as any;
    const rt = inlineTokensToRichText(paragraph.tokens);
    expect(rt).toHaveLength(1);
    expect(rt[0].annotations?.bold).toBe(true);
    expect(rt[0].annotations?.italic).toBe(true);
  });
});
