import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

function inline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\{\{\s*[\w.-]+\s*\}\}|`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('{{')) parts.push(<span key={k} className="var-chip">{tok.replace(/\s/g, '')}</span>);
    else if (tok.startsWith('`')) parts.push(<code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**')) parts.push(<strong key={k} className="font-semibold text-foreground">{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      parts.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{mm[1]}</a>);
    } else parts.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Lightweight markdown renderer with {{variable}} highlighting. */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key++} className="my-3 overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-[12.5px] leading-relaxed">
          {inline(buf.join('\n'), `c${key}`)}
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl === 1 ? 'text-xl mt-4' : lvl === 2 ? 'text-lg mt-4' : 'text-base mt-3';
      blocks.push(<div key={key++} className={cn('font-display font-semibold mb-1.5', cls)}>{inline(h[2], `h${key}`)}</div>);
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={key++} className={cn('my-2 space-y-1 pl-5', ordered ? 'list-decimal' : 'list-disc marker:text-primary')}>
          {items.map((it, j) => <li key={j}>{inline(it, `l${key}-${j}`)}</li>)}
        </Tag>,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push(<blockquote key={key++} className="my-2 border-l-2 border-primary/60 pl-3 italic text-muted-foreground">{inline(line.replace(/^>\s?/, ''), `q${key}`)}</blockquote>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-4 border-border" />);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*+]|\d+\.)\s+|>)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={key++} className="my-2 leading-relaxed">
        {para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, `p${key}-${j}`)}</Fragment>)}
      </p>,
    );
  }
  return <div className={cn('text-sm text-foreground/90 [&>*:first-child]:mt-0', className)}>{blocks}</div>;
}
