import React, { useState, useMemo } from 'react';
import { Database, Copy, Check, Terminal, FileCode, Layers } from 'lucide-react';

interface CodeSectionProps {
  content: string;
  title?: string;
  defaultLang?: string;
}

export const CodeSection: React.FC<CodeSectionProps> = ({
  content,
  title,
  defaultLang = 'sql',
}) => {
  const [copied, setCopied] = useState(false);

  // Parse out code block and language, stripping raw markdown fences
  const { lang, code, description, tables } = useMemo(() => {
    let rawLang = defaultLang;
    let cleanCode = content.trim();
    let desc = '';

    // Check for fenced code block ```lang ... ```
    const fenceRegex = /```([a-zA-Z0-9_-]*)\s*([\s\S]*?)```/g;
    const match = fenceRegex.exec(content);

    if (match) {
      if (match[1]) rawLang = match[1].toLowerCase();
      cleanCode = match[2].trim();

      // Extract any text before or after the code block
      const before = content.substring(0, match.index).trim();
      const after = content.substring(match.index + match[0].length).trim();
      desc = [before, after].filter(Boolean).join('\n\n');
    } else {
      // If code fences weren't closed or just raw code
      cleanCode = content.replace(/^```[a-zA-Z0-9_-]*\n?/gm, '').replace(/```$/gm, '').trim();
    }

    // Extract table names if SQL
    const detectedTables: string[] = [];
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi;
    let tMatch;
    while ((tMatch = tableRegex.exec(cleanCode)) !== null) {
      detectedTables.push(tMatch[1]);
    }

    return {
      lang: rawLang || 'code',
      code: cleanCode,
      description: desc,
      tables: detectedTables,
    };
  }, [content, defaultLang]);

  const lines = useMemo(() => code.split('\n'), [code]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  // Syntax highlighter for SQL and common schemas
  const renderHighlightedLine = (line: string) => {
    if (!line.trim()) return <span>&nbsp;</span>;

    // Comments
    if (line.trim().startsWith('--') || line.trim().startsWith('//') || line.trim().startsWith('#')) {
      return <span className="text-slate-500 italic">{line}</span>;
    }

    // SQL Tokenizer
    const tokenRegex = /('(?:''|[^'])*')|\b(CREATE TABLE|PRIMARY KEY|DEFAULT|NOT NULL|UNIQUE|REFERENCES|ON DELETE CASCADE|ON UPDATE CASCADE|CHECK|SELECT|FROM|WHERE|INSERT INTO|VALUES|ALTER TABLE|ADD CONSTRAINT|DROP TABLE|CASCADE)\b|\b(UUID|VARCHAR|NUMERIC|INTEGER|TIMESTAMP WITH TIME ZONE|TIMESTAMP|BOOLEAN|BIGINT|TEXT|SERIAL|JSONB|DECIMAL|DATE)\b|\b(gen_random_uuid|NOW|COUNT|SUM|AVG|COALESCE)\b|(\b\d+(?:\.\d+)?\b)|([a-zA-Z_][a-zA-Z0-9_]*)|([(),;=<>+-])/gi;

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        elements.push(line.substring(lastIndex, match.index));
      }

      const [full, str, kw, type, fn, num, ident, punct] = match;

      if (str) {
        elements.push(
          <span key={match.index} className="text-emerald-300 font-mono">
            {str}
          </span>
        );
      } else if (kw) {
        elements.push(
          <span key={match.index} className="text-purple-400 font-semibold">
            {kw}
          </span>
        );
      } else if (type) {
        elements.push(
          <span key={match.index} className="text-sky-400 font-medium">
            {type}
          </span>
        );
      } else if (fn) {
        elements.push(
          <span key={match.index} className="text-amber-400 font-semibold">
            {fn}
          </span>
        );
      } else if (num) {
        elements.push(
          <span key={match.index} className="text-orange-300 font-mono">
            {num}
          </span>
        );
      } else if (ident) {
        // If preceding word was CREATE TABLE, highlight as table name
        const prefix = line.substring(0, match.index).trim();
        if (/CREATE\s+TABLE$/i.test(prefix)) {
          elements.push(
            <span
              key={match.index}
              className="text-amber-300 font-bold underline decoration-amber-500/40"
            >
              {ident}
            </span>
          );
        } else {
          elements.push(
            <span key={match.index} className="text-slate-100">
              {ident}
            </span>
          );
        }
      } else {
        elements.push(
          <span key={match.index} className="text-slate-400">
            {punct || full}
          </span>
        );
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      elements.push(line.substring(lastIndex));
    }

    return elements.length > 0 ? elements : line;
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 shadow-2xl overflow-hidden font-mono text-xs">
      {/* Optional explanatory description before code */}
      {description && (
        <div className="p-3 bg-slate-900/60 border-b border-slate-800 text-xs text-slate-300 font-sans leading-relaxed">
          {description}
        </div>
      )}

      {/* Code Section Header */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 px-3.5 flex items-center justify-between select-none">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px] font-bold uppercase tracking-wider">
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span>{lang.toUpperCase()}</span>
          </div>

          {title && (
            <span className="text-xs font-semibold text-slate-200 truncate max-w-sm">
              {title}
            </span>
          )}

          {/* Table Entity Badges */}
          {tables.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 ml-2">
              <span className="text-[10px] text-slate-500">Tables:</span>
              {tables.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">{lines.length} lines</span>

          <button
            onClick={handleCopy}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${
              copied
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
            }`}
            title="Copy code to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Section Body with Line Numbers Gutter */}
      <div className="flex overflow-x-auto p-0 bg-slate-950 max-h-[500px] overflow-y-auto">
        {/* Line Numbers Gutter */}
        <div className="py-3 px-3 text-right text-slate-600 bg-slate-900/40 border-r border-slate-800/80 select-none text-[11px] font-mono shrink-0">
          {lines.map((_, i) => (
            <div key={i} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Syntax-Highlighted Code Lines */}
        <pre className="py-3 px-4 flex-1 text-slate-200 text-xs font-mono leading-5 overflow-visible m-0">
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre hover:bg-slate-900/40 px-1 -mx-1 rounded">
              {renderHighlightedLine(line)}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
};
