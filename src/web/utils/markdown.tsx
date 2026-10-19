import React from 'react';
import { marked } from 'marked';

// Configure marked for GitHub Flavored Markdown
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Renders inline markdown (**bold**, `code`, *italic*, [links](url)) as HTML string
 */
export function parseInlineMarkdown(text: string): string {
  if (!text) return '';
  try {
    return marked.parseInline(text) as string;
  } catch {
    return text;
  }
}

/**
 * Renders block markdown (paragraphs, lists, tables, code blocks, bold, inline code) as HTML string
 */
export function parseBlockMarkdown(text: string): string {
  if (!text) return '';
  try {
    // Normalize collapsed single-line markdown tables (`| Col1 | Col2 | |---|---| | val1 | val2 |`) into multi-line GFM tables
    let normalized = text;
    if (/\|\s*\|\s*:?---/.test(normalized)) {
      normalized = normalized.replace(/\|\s+\|(?=\s*(?::?---+|[a-zA-Z0-9_`*]))/g, '|\n|');
    }
    return marked.parse(normalized) as string;
  } catch {
    return text;
  }
}

/**
 * React component for rendering inline markdown (`**bold**`, `` `code` ``, etc.)
 */
export const InlineMarkdown: React.FC<{
  content: string;
  className?: string;
}> = ({ content, className = '' }) => {
  const html = parseInlineMarkdown(content);
  return (
    <span
      className={`inline-markdown [&_strong]:font-semibold [&_strong]:text-white [&_em]:italic [&_em]:text-slate-300 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:mx-0.5 [&_code]:rounded-md [&_code]:bg-slate-950/90 [&_code]:text-emerald-300 [&_code]:border [&_code]:border-slate-700/80 [&_code]:font-mono [&_code]:text-[12px] [&_a]:text-emerald-400 [&_a]:underline ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/**
 * React component for rendering full block markdown (paragraphs, tables, lists, code blocks, headers)
 */
export const BlockMarkdown: React.FC<{
  content: string;
  className?: string;
}> = ({ content, className = '' }) => {
  const html = parseBlockMarkdown(content);
  return (
    <div
      className={`block-markdown text-sm text-slate-300 leading-relaxed space-y-3
        [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-4 [&_h2]:mb-2
        [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-emerald-300 [&_h3]:mt-3 [&_h3]:mb-1.5
        [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:text-slate-200 [&_h4]:mt-2.5 [&_h4]:mb-1
        [&_p]:text-slate-300 [&_p]:leading-relaxed
        [&_strong]:font-semibold [&_strong]:text-white
        [&_em]:italic [&_em]:text-slate-200
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-slate-300
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_ol]:text-slate-300
        [&_li]:leading-relaxed
        [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:bg-slate-900 [&_code]:text-emerald-300 [&_code]:border [&_code]:border-slate-700/80 [&_code]:font-mono [&_code]:text-xs
        [&_pre]:bg-slate-950 [&_pre]:border [&_pre]:border-slate-800 [&_pre]:rounded-xl [&_pre]:p-3.5 [&_pre]:overflow-x-auto [&_pre]:my-2.5
        [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0 [&_pre_code]:text-slate-200 [&_pre_code]:text-xs
        [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_table]:text-xs [&_table]:rounded-xl [&_table]:overflow-hidden [&_table]:border [&_table]:border-slate-800
        [&_thead]:bg-slate-950/90 [&_thead]:text-slate-200 [&_thead]:border-b [&_thead]:border-slate-800
        [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-emerald-300
        [&_td]:px-3.5 [&_td]:py-2.5 [&_td]:border-t [&_td]:border-slate-800/70 [&_td]:text-slate-300
        [&_tr:hover]:bg-slate-800/30
        [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-500/50 [&_blockquote]:pl-3.5 [&_blockquote]:italic [&_blockquote]:text-slate-400
        [&_hr]:border-slate-800 [&_hr]:my-4
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
