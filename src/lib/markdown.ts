import { marked, type Token, type Tokens } from 'marked';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

type RichTextItemRequest = {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: 'default';
  };
};

export function inlineTokensToRichText(tokens: Token[]): RichTextItemRequest[] {
  const result: RichTextItemRequest[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens) {
          result.push(...inlineTokensToRichText(t.tokens));
        } else {
          result.push(richText(t.text));
        }
        break;
      }

      case 'strong': {
        const t = token as Tokens.Strong;
        const children = t.tokens ? inlineTokensToRichText(t.tokens) : [richText(t.text)];
        for (const child of children) {
          child.annotations = { ...child.annotations, bold: true };
        }
        result.push(...children);
        break;
      }

      case 'em': {
        const t = token as Tokens.Em;
        const children = t.tokens ? inlineTokensToRichText(t.tokens) : [richText(t.text)];
        for (const child of children) {
          child.annotations = { ...child.annotations, italic: true };
        }
        result.push(...children);
        break;
      }

      case 'del': {
        const t = token as Tokens.Del;
        const children = t.tokens ? inlineTokensToRichText(t.tokens) : [richText(t.text)];
        for (const child of children) {
          child.annotations = { ...child.annotations, strikethrough: true };
        }
        result.push(...children);
        break;
      }

      case 'codespan': {
        const t = token as Tokens.Codespan;
        result.push({
          type: 'text',
          text: { content: t.text },
          annotations: { code: true },
        });
        break;
      }

      case 'link': {
        const t = token as Tokens.Link;
        const linkText = t.tokens
          ? t.tokens.map(tok => ('text' in tok ? (tok as Tokens.Text).text : (tok as any).raw || '')).join('')
          : t.text;
        result.push({
          type: 'text',
          text: { content: linkText, link: { url: t.href } },
        });
        break;
      }

      case 'br': {
        result.push(richText('\n'));
        break;
      }

      case 'escape': {
        const t = token as Tokens.Escape;
        result.push(richText(t.text));
        break;
      }

      default: {
        const raw = (token as any).text ?? (token as any).raw ?? '';
        if (raw) result.push(richText(raw));
        break;
      }
    }
  }

  return result;
}

export function markdownToBlocks(text: string): BlockObjectRequest[] {
  const tokens = marked.lexer(text);
  const blocks: BlockObjectRequest[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const t = token as Tokens.Heading;
        const depth = Math.min(t.depth, 3) as 1 | 2 | 3;
        const rt = t.tokens ? inlineTokensToRichText(t.tokens) : [richText(t.text)];
        const key = `heading_${depth}` as 'heading_1' | 'heading_2' | 'heading_3';
        blocks.push({
          object: 'block',
          type: key,
          [key]: { rich_text: rt },
        } as BlockObjectRequest);
        break;
      }

      case 'paragraph': {
        const t = token as Tokens.Paragraph;
        const rt = t.tokens ? inlineTokensToRichText(t.tokens) : [richText(t.text)];
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: rt },
        } as BlockObjectRequest);
        break;
      }

      case 'list': {
        const t = token as Tokens.List;
        for (const item of t.items) {
          const rt = item.tokens
            ? inlineTokensToRichText(flattenListItemTokens(item.tokens))
            : [richText(item.text)];

          if (item.task) {
            blocks.push({
              object: 'block',
              type: 'to_do',
              to_do: { rich_text: rt, checked: item.checked ?? false },
            } as BlockObjectRequest);
          } else if (t.ordered) {
            blocks.push({
              object: 'block',
              type: 'numbered_list_item',
              numbered_list_item: { rich_text: rt },
            } as BlockObjectRequest);
          } else {
            blocks.push({
              object: 'block',
              type: 'bulleted_list_item',
              bulleted_list_item: { rich_text: rt },
            } as BlockObjectRequest);
          }
        }
        break;
      }

      case 'code': {
        const t = token as Tokens.Code;
        const lang = mapCodeLanguage(t.lang || '');
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [richText(t.text)],
            language: lang,
          },
        } as BlockObjectRequest);
        break;
      }

      case 'blockquote': {
        const t = token as Tokens.Blockquote;
        const rt = t.tokens ? inlineTokensToRichText(flattenBlockquoteTokens(t.tokens)) : [richText(t.text)];
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: { rich_text: rt },
        } as BlockObjectRequest);
        break;
      }

      case 'hr': {
        blocks.push({
          object: 'block',
          type: 'divider',
          divider: {},
        } as BlockObjectRequest);
        break;
      }

      case 'space': {
        break;
      }

      default: {
        const raw = (token as any).text ?? (token as any).raw ?? '';
        if (raw.trim()) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [richText(raw)] },
          } as BlockObjectRequest);
        }
        break;
      }
    }
  }

  return blocks;
}

function richText(content: string): RichTextItemRequest {
  return { type: 'text', text: { content } };
}

function flattenListItemTokens(tokens: Token[]): Token[] {
  const result: Token[] = [];

  for (const tok of tokens) {
    if (tok.type === 'text' && (tok as Tokens.Text).tokens) {
      result.push(...((tok as Tokens.Text).tokens as Token[]));
    } else if (tok.type === 'text') {
      result.push(tok);
    }
  }

  return result;
}

function flattenBlockquoteTokens(tokens: Token[]): Token[] {
  const result: Token[] = [];

  for (const tok of tokens) {
    if (tok.type === 'paragraph' && (tok as Tokens.Paragraph).tokens) {
      result.push(...((tok as Tokens.Paragraph).tokens as Token[]));
    } else if (tok.type === 'text') {
      result.push(tok);
    }
  }

  return result;
}

const NOTION_LANGUAGES = new Set([
  'abap', 'arduino', 'bash', 'basic', 'c', 'clojure', 'coffeescript', 'c++',
  'c#', 'css', 'dart', 'diff', 'docker', 'elixir', 'elm', 'erlang', 'flow',
  'fortran', 'f#', 'gherkin', 'glsl', 'go', 'graphql', 'groovy', 'haskell',
  'html', 'java', 'javascript', 'json', 'julia', 'kotlin', 'latex', 'less',
  'lisp', 'livescript', 'lua', 'makefile', 'markdown', 'markup', 'matlab',
  'mermaid', 'nix', 'objective-c', 'ocaml', 'pascal', 'perl', 'php',
  'plain text', 'powershell', 'prolog', 'protobuf', 'python', 'r', 'reason',
  'ruby', 'rust', 'sass', 'scala', 'scheme', 'scss', 'shell', 'sql', 'swift',
  'typescript', 'vb.net', 'verilog', 'vhdl', 'visual basic', 'webassembly',
  'xml', 'yaml', 'java/c/c++/c#',
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'shell',
  yml: 'yaml',
  cs: 'c#',
  cpp: 'c++',
  objc: 'objective-c',
  dockerfile: 'docker',
  tex: 'latex',
  rs: 'rust',
  hs: 'haskell',
  kt: 'kotlin',
  vb: 'visual basic',
  wasm: 'webassembly',
};

function mapCodeLanguage(lang: string): string {
  const lower = lang.toLowerCase().trim();
  if (!lower) return 'plain text';
  if (NOTION_LANGUAGES.has(lower)) return lower;
  if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
  return 'plain text';
}
