import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { Source } from '../components/MessageBubble';

/**
 * Markdown -> sanitized HTML, with the model's inline [1] / [2] markers
 * promoted to real anchors that jump to the matching source card.
 *
 * The rewrite walks text nodes rather than regexing the HTML string, so a
 * "[1]" inside a code block or an href is left alone. Every element here is
 * built programmatically on top of already-sanitized markup.
 */
export function renderAnswer(
  markdown: string,
  sources: Source[] | undefined,
  domPrefix: string
): string {
  const html = marked.parse(markdown || '', { async: false, breaks: true }) as string;
  const clean = DOMPurify.sanitize(html);

  if (typeof window === 'undefined' || !window.DOMParser) return clean;

  const doc = new DOMParser().parseFromString(`<div id="a">${clean}</div>`, 'text/html');
  const root = doc.getElementById('a');
  if (!root) return clean;

  // Any link the model produced leaves the app, so it opens in a new tab.
  root.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  const count = sources?.length ?? 0;
  if (count > 0) linkCitations(doc, root, sources!, domPrefix);

  return root.innerHTML;
}

function linkCitations(
  doc: Document,
  root: HTMLElement,
  sources: Source[],
  domPrefix: string
) {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    // Don't touch citations inside links, code, or headings.
    if (node.parentElement?.closest('a, code, pre')) continue;
    if (/\[\d+\]/.test(node.data)) targets.push(node);
  }

  for (const node of targets) {
    const fragment = doc.createDocumentFragment();
    const pattern = /\[(\d+)\]/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(node.data)) !== null) {
      const index = Number(match[1]);
      const source = sources[index - 1];

      // A marker pointing past the end of the source list stays plain text —
      // a dead link is worse than an unstyled bracket.
      if (!source) continue;

      if (match.index > cursor) {
        fragment.appendChild(doc.createTextNode(node.data.slice(cursor, match.index)));
      }

      const anchor = doc.createElement('a');
      anchor.className = 'citation';
      anchor.href = `#${domPrefix}-src-${index}`;
      anchor.textContent = String(index);
      anchor.setAttribute('title', source.title || source.url);
      anchor.setAttribute('aria-label', `Source ${index}: ${source.title || source.url}`);
      fragment.appendChild(anchor);

      cursor = match.index + match[0].length;
    }

    if (!fragment.childNodes.length) continue;

    if (cursor < node.data.length) {
      fragment.appendChild(doc.createTextNode(node.data.slice(cursor)));
    }
    node.parentNode?.replaceChild(fragment, node);
  }
}
