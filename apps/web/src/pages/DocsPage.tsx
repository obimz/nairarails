/**
 * DocsPage.tsx — NairaRails developer documentation
 *
 * Sidebar nav driven by DOCS_NAV manifest. Content rendered from .md files
 * via react-markdown + remark-gfm + rehype-highlight.
 *
 * Adding a new doc page: add an entry to src/lib/docsNav.ts and a
 * corresponding .md file in src/docs/. No changes needed here.
 */

import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { Menu, X, ChevronRight, ExternalLink, Copy, Check } from "lucide-react";
import { DOCS_NAV, type DocSection } from "../lib/docsNav.js";
import { LogoLockup } from "../components/Logo.js";

// ─── Copy button used inside code blocks ─────────────────────────────────────

function CodeCopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer"
      style={{
        background: copied ? "rgba(22,169,123,0.20)" : "var(--bg-elevated)",
        border:     `1px solid ${copied ? "rgba(22,169,123,0.40)" : "var(--border-hover)"}`,
        color:      copied ? "var(--text-brand)" : "var(--text-muted)",
      }}
      aria-label="Copy code"
    >
      {copied
        ? <><Check className="w-3 h-3" /> Copied</>
        : <><Copy className="w-3 h-3" /> Copy</>}
    </button>
  );
}

// ─── Lazy-load markdown files via Vite's ?raw import ─────────────────────────

const DOC_MODULES: Record<string, () => Promise<{ default: string }>> = {
  "01-quickstart.md":    () => import("../docs/01-quickstart.md?raw"),
  "02-authentication.md": () => import("../docs/02-authentication.md?raw"),
  "03-orders.md":        () => import("../docs/03-orders.md?raw"),
  "04-webhooks.md":      () => import("../docs/04-webhooks.md?raw"),
  "05-exceptions.md":    () => import("../docs/05-exceptions.md?raw"),
  "06-amounts.md":       () => import("../docs/06-amounts.md?raw"),
  "07-errors.md":        () => import("../docs/07-errors.md?raw"),
};

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

function NavItem({
  section,
  active,
  onClick,
}: {
  section: DocSection;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer"
      style={{
        background: active ? "rgba(22,169,123,0.12)" : "transparent",
        color: active ? "var(--text-brand)" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400,
        border: active ? "1px solid rgba(22,169,123,0.20)" : "1px solid transparent",
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = "var(--bg-elevated)";
          e.currentTarget.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
    >
      {section.label}
    </button>
  );
}

// ─── Markdown component overrides ────────────────────────────────────────────
// These map standard MD elements to styled versions that match the design system.

const mdComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold font-display mt-0 mb-6 pb-4"
        style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}>
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-semibold font-display mt-10 mb-3"
        style={{ color: "var(--text-primary)" }}>
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-semibold mt-6 mb-2"
        style={{ color: "var(--text-primary)" }}>
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
      {children}
    </p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      className="text-[#16A97B] hover:underline inline-flex items-center gap-0.5"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {children}
      {href?.startsWith("http") && <ExternalLink className="w-3 h-3 opacity-70" />}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside space-y-1.5 mb-4 text-sm"
        style={{ color: "var(--text-secondary)" }}>
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-1.5 mb-4 text-sm"
        style={{ color: "var(--text-secondary)" }}>
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote
      className="border-l-4 pl-4 py-1 my-4 text-sm italic"
      style={{ borderColor: "var(--text-brand)", color: "var(--text-muted)", background: "rgba(22,169,123,0.05)" }}
    >
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-8" style={{ borderColor: "var(--border)" }} />
  ),
  // Tables
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-6 rounded-xl" style={{ border: "1px solid var(--border)" }}>
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
      {children}
    </thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}>
      {children}
    </th>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody style={{ background: "var(--bg-surface)" }}>{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr style={{ borderTop: "1px solid var(--border)" }}>{children}</tr>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>
      {children}
    </td>
  ),
  // Inline code
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code
        className="font-mono text-xs px-1.5 py-0.5 rounded"
        style={{ background: "rgba(22,169,123,0.10)", color: "var(--text-brand)" }}
      >
        {children}
      </code>
    );
  },
  // Fenced code blocks
  pre: ({ children }: { children?: React.ReactNode }) => {
    // Extract the raw text from the code element inside <pre> so the copy button
    // can grab it without touching the DOM.
    const textRef = React.useRef<HTMLPreElement>(null);
    const getText = () => textRef.current?.innerText ?? textRef.current?.textContent ?? "";

    return (
      <div className="relative my-4 rounded-xl overflow-hidden"
           style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
        <CodeCopyButton getText={getText} />
        <pre ref={textRef} className="p-4 pt-10 text-xs font-mono leading-relaxed overflow-x-auto">
          {children}
        </pre>
      </div>
    );
  },
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{children}</strong>
  ),
};

// ─── Main component ───────────────────────────────────────────────────────────

export function DocsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get("section") ?? DOCS_NAV[0]?.id ?? "quickstart";

  const [content, setContent] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // Load the markdown file whenever activeId changes
  React.useEffect(() => {
    const section = DOCS_NAV.find(s => s.id === activeId);
    if (!section) return;

    const loader = DOC_MODULES[section.file];
    if (!loader) return;

    setLoading(true);
    loader()
      .then(mod => {
        setContent(mod.default);
        setLoading(false);
        window.scrollTo({ top: 0, behavior: "instant" });
      })
      .catch(() => {
        setContent("# Error\n\nThis page could not be loaded.");
        setLoading(false);
      });
  }, [activeId]);

  function navigate(id: string) {
    setSearchParams({ section: id });
    setSidebarOpen(false);
  }

  const activeIndex = DOCS_NAV.findIndex(s => s.id === activeId);
  const prevSection = activeIndex > 0 ? DOCS_NAV[activeIndex - 1] : null;
  const nextSection = activeIndex < DOCS_NAV.length - 1 ? DOCS_NAV[activeIndex + 1] : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 h-14 backdrop-blur-sm"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-glass)" }}
      >
        <div className="flex items-center gap-3">
          {/* Mobile sidebar toggle */}
          <button
            type="button"
            className="lg:hidden p-1.5 rounded-lg cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link to="/" className="flex items-center gap-2 group">
            <LogoLockup size={24} textSize="text-sm" />
          </Link>

          <span className="hidden sm:block text-xs px-2 py-0.5 rounded"
                style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            Docs
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
          <Link to="/dashboard/overview"
                className="hover:text-[#16A97B] transition-colors cursor-pointer">
            Dashboard
          </Link>
          <Link to="/signup"
                className="px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--text-brand)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
          >
            Get API key
          </Link>
        </div>
      </header>

      <div className="flex">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`
            fixed top-14 left-0 z-30 h-[calc(100vh-56px)] w-56 overflow-y-auto
            transition-transform duration-200 lg:sticky lg:translate-x-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
          style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border)" }}
        >
          <nav className="p-3 space-y-0.5">
            {DOCS_NAV.map(section => (
              <NavItem
                key={section.id}
                section={section}
                active={section.id === activeId}
                onClick={() => navigate(section.id)}
              />
            ))}
          </nav>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 px-6 sm:px-10 py-10 max-w-3xl">

          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-7 rounded w-1/3" style={{ background: "var(--bg-elevated)" }} />
              <div className="h-4 rounded w-full" style={{ background: "var(--bg-elevated)" }} />
              <div className="h-4 rounded w-5/6" style={{ background: "var(--bg-elevated)" }} />
              <div className="h-4 rounded w-4/6" style={{ background: "var(--bg-elevated)" }} />
            </div>
          ) : (
            <article className="docs-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={mdComponents as never}
              >
                {content}
              </ReactMarkdown>
            </article>
          )}

          {/* ── Prev / Next navigation ───────────────────────────────────── */}
          {!loading && (
            <div className="mt-12 pt-6 flex items-center justify-between"
                 style={{ borderTop: "1px solid var(--border)" }}>
              {prevSection ? (
                <button
                  type="button"
                  onClick={() => navigate(prevSection.id)}
                  className="flex items-center gap-2 text-sm cursor-pointer transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--text-brand)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                >
                  ← {prevSection.label}
                </button>
              ) : <div />}

              {nextSection ? (
                <button
                  type="button"
                  onClick={() => navigate(nextSection.id)}
                  className="flex items-center gap-2 text-sm cursor-pointer transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--text-brand)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                >
                  {nextSection.label} <ChevronRight className="w-4 h-4" />
                </button>
              ) : <div />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
