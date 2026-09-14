import { Children, isValidElement, type ReactNode, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function nodeToText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeToText(node.props.children);
  return '';
}

function PreBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = nodeToText(children).replace(/\n$/, '');

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="code-block">
      <button className="code-copy" type="button" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>{Children.toArray(children)}</pre>
    </div>
  );
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }: { children?: ReactNode }) => <PreBlock>{children}</PreBlock>,
        a: ({ children, href }: { children?: ReactNode; href?: string }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      }}
    >
      {content}
    </Markdown>
  );
}
