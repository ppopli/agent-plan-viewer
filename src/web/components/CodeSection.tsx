import React, { useState, useMemo } from 'react';
import { Database, Copy, Check, Code, GitBranch, ArrowRight } from 'lucide-react';
import { BlockMarkdown } from '../utils/markdown.js';
import { parseMermaid } from '../../core/mermaid-graph-bridge.js';

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
  const { lang, code, description, tables, hasFencedCode, isMermaidDiagram, parsedDiagram } = useMemo(() => {
    let rawLang = defaultLang;
    let cleanCode = '';
    let desc = '';
    let foundFence = false;

    // Check for fenced code block ```lang ... ```
    const fenceRegex = /```([a-zA-Z0-9_-]*)\s*([\s\S]*?)```/g;
    const match = fenceRegex.exec(content);

    if (match) {
      foundFence = true;
      if (match[1]) rawLang = match[1].toLowerCase();
      cleanCode = match[2].trim();

      // Extract any text/tables before or after the code block
      const before = content.substring(0, match.index).trim();
      const after = content.substring(match.index + match[0].length).trim();
      desc = [before, after].filter(Boolean).join('\n\n');
    } else {
      const stripped = content.replace(/^```[a-zA-Z0-9_-]*\n?/gm, '').replace(/```$/gm, '').trim();
      const looksLikeRawCode =
        /^(?:CREATE\s+TABLE|ALTER\s+TABLE|SELECT\s+|INSERT\s+INTO|erDiagram|flowchart\s+|graph\s+|sequenceDiagram|interface\s+|type\s+|model\s+)/im.test(
          stripped
        );
      if (looksLikeRawCode) {
        foundFence = true;
        cleanCode = stripped;
      } else {
        desc = stripped;
      }
    }

    const isMermaid =
      foundFence &&
      (rawLang === 'mermaid' ||
        /^(?:erDiagram|flowchart\s+|graph\s+|sequenceDiagram)/i.test(cleanCode));

    const diagramObj = isMermaid ? parseMermaid(cleanCode, 'schema-diag') : null;

    // Extract table/entity names from SQL or ER Diagram
    const detectedTables: string[] = [];
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi;
    let tMatch;
    while ((tMatch = tableRegex.exec(cleanCode)) !== null) {
      detectedTables.push(tMatch[1]);
    }
    if (diagramObj && diagramObj.nodes.length > 0 && detectedTables.length === 0) {
      diagramObj.nodes.forEach((n) => detectedTables.push(n.id));
    }

    return {
      lang: isMermaid ? 'mermaid' : rawLang || 'code',
      code: cleanCode,
      description: desc,
      tables: detectedTables,
      hasFencedCode: foundFence && cleanCode.length > 0,
      isMermaidDiagram: isMermaid && Boolean(diagramObj && diagramObj.nodes.length > 0),
      parsedDiagram: diagramObj,
    };
  }, [content, defaultLang]);

  const [diagramViewMode, setDiagramViewMode] = useState<'diagram' | 'code'>('diagram');
  const lines = useMemo(() => (code ? code.split('\n') : []), [code]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code || content);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code || content;
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

  // Syntax highlighter for SQL, ER diagrams, and common schemas
  const renderHighlightedLine = (line: string) => {
    if (!line.trim()) return <span>&nbsp;</span>;

    // Comments
    if (line.trim().startsWith('--') || line.trim().startsWith('//') || line.trim().startsWith('%%') || line.trim().startsWith('#')) {
      return <span className="text-slate-500 italic">{line}</span>;
    }

    // Mermaid erDiagram / flowchart line highlighting
    const erMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+)\s+([|o}{]+(?:--|\.\.)[|o}{]+)\s+([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (erMatch) {
      return (
        <>
          <span>{erMatch[1]}</span>
          <span className="text-amber-300 font-bold">{erMatch[2]}</span>{' '}
          <span className="text-purple-400 font-bold">{erMatch[3]}</span>{' '}
          <span className="text-sky-300 font-bold">{erMatch[4]}</span>
          <span className="text-slate-400"> : </span>
          <span className="text-emerald-300">{erMatch[5]}</span>
        </>
      );
    }

    // SQL Tokenizer
    const tokenRegex = /('(?:''|[^'])*')|\b(CREATE TABLE|PRIMARY KEY|DEFAULT|NOT NULL|UNIQUE|REFERENCES|ON DELETE CASCADE|ON UPDATE CASCADE|CHECK|SELECT|FROM|WHERE|INSERT INTO|VALUES|ALTER TABLE|ADD CONSTRAINT|DROP TABLE|CASCADE|erDiagram|flowchart|sequenceDiagram)\b|\b(UUID|VARCHAR|NUMERIC|INTEGER|TIMESTAMP WITH TIME ZONE|TIMESTAMP|BOOLEAN|BIGINT|TEXT|SERIAL|JSONB|DECIMAL|DATE)\b|\b(gen_random_uuid|NOW|COUNT|SUM|AVG|COALESCE)\b|(\b\d+(?:\.\d+)?\b)|([a-zA-Z_][a-zA-Z0-9_]*)|([(),;=<>+-])/gi;

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
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 shadow-2xl overflow-hidden text-xs">
      {/* 1. Formatted Markdown Description / Schema Tables before or without code block */}
      {description && (
        <div className="p-4 bg-slate-900/50 border-b border-slate-800/90 font-sans">
          {title && !hasFencedCode && (
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800/70">
              <Database className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-white">{title}</span>
            </div>
          )}
          <BlockMarkdown content={description} />
        </div>
      )}

      {/* 2. Fenced Code or Mermaid ER / Architecture Diagram Block */}
      {hasFencedCode && (
        <div className="font-mono">
          {/* Code / Diagram Section Header */}
          <div className="h-10 bg-slate-900 border-b border-slate-800 px-3.5 flex items-center justify-between select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px] font-bold uppercase tracking-wider shrink-0">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span>{isMermaidDiagram ? 'ER / SCHEMA DIAGRAM' : lang.toUpperCase()}</span>
              </div>

              {title && (
                <span className="text-xs font-semibold text-slate-200 truncate max-w-sm">
                  {title}
                </span>
              )}

              {/* Table / Entity Badges */}
              {tables.length > 0 && (
                <div className="hidden md:flex items-center gap-1.5 ml-2 overflow-x-auto scrollbar-none">
                  <span className="text-[10px] text-slate-500">Entities:</span>
                  {tables.slice(0, 8).map((t) => (
                    <span
                      key={t}
                      className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700 whitespace-nowrap"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isMermaidDiagram && (
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setDiagramViewMode('diagram')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                      diagramViewMode === 'diagram'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <GitBranch className="w-3 h-3" />
                    <span>Diagram Block</span>
                  </button>
                  <button
                    onClick={() => setDiagramViewMode('code')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                      diagramViewMode === 'code'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Code className="w-3 h-3" />
                    <span>Code Block</span>
                  </button>
                </div>
              )}

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

          {/* Visual Diagram Block View for Mermaid ER / Schema Diagrams */}
          {isMermaidDiagram && diagramViewMode === 'diagram' && parsedDiagram ? (
            <div className="p-5 bg-slate-950 space-y-5 font-sans">
              {/* Entity Cards Grid */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  Schema Entities ({parsedDiagram.nodes.length})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {parsedDiagram.nodes.map((node) => {
                    const outRels = parsedDiagram.edges.filter((e) => e.source === node.id);
                    const inRels = parsedDiagram.edges.filter((e) => e.target === node.id);
                    return (
                      <div
                        key={node.id}
                        className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 shadow-md flex flex-col justify-between gap-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-xs font-bold text-white font-mono truncate">
                            {node.label.split('\n')[0]}
                          </span>
                        </div>
                        {node.label.includes('\n') && (
                          <div className="text-[10px] text-slate-400 font-mono leading-snug">
                            {node.label.split('\n').slice(1).join(' · ')}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-500 font-mono">
                          {outRels.length} outgoing · {inRels.length} incoming
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Entity Relationships Flow List */}
              {parsedDiagram.edges.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                    Entity Relationships & Cardinality ({parsedDiagram.edges.length})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {parsedDiagram.edges.map((edge) => (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900/70 border border-slate-800/90"
                      >
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono text-xs font-bold">
                          {edge.source}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-mono min-w-0">
                          <span className="text-slate-600">──</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-700/80 text-[11px] text-emerald-300 truncate">
                            {edge.label || 'relates to'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono text-xs font-bold">
                          {edge.target}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Code Section Body with Line Numbers Gutter */
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
          )}
        </div>
      )}
    </div>
  );
};
