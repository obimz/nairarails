/**
 * SupportChat — floating AI support chat widget for the merchant dashboard.
 *
 * Features:
 *  - Animated slide-up entrance when opening
 *  - Two tabs: Chat and My Tickets
 *  - Chat: Gemini-powered Q&A with human escalation
 *  - Tickets: list of the merchant's escalated support tickets
 */

import React from "react";
import {
  MessageCircle, X, Send, Bot, User,
  AlertTriangle, CheckCircle2, Loader2, ChevronDown,
  Ticket, Clock, RefreshCw, Wrench, ChevronRight,
  BarChart2, List, Search, FileText, Activity, Info, Reply,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch.js";

// ─── Lightweight markdown renderer ───────────────────────────────────────────
// Handles the subset Gemini actually returns: bold, numbered lists,
// bullet lists, inline code, and line breaks. No external dependency.

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  function inlineFormat(line: string): React.ReactNode {
    // Split on **bold** and `code` patterns
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="px-1 py-0.5 rounded text-[10px] font-mono"
                style={{ background: "rgba(255,255,255,0.08)", color: "#16A97B" }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Skip empty lines but add spacing between blocks
    if (!trimmed) {
      nodes.push(<div key={key++} className="h-1.5" />);
      i++;
      continue;
    }

    // Numbered list — collect consecutive numbered items
    if (/^\d+\.\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test((lines[i] ?? "").trim())) {
        const content = (lines[i] ?? "").trim().replace(/^\d+\.\s/, "");
        items.push(
          <li key={i} className="flex gap-2">
            <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5"
                  style={{ background: "rgba(22,169,123,0.2)", color: "#16A97B" }}>
              {items.length + 1}
            </span>
            <span>{inlineFormat(content)}</span>
          </li>
        );
        i++;
      }
      nodes.push(<ol key={key++} className="space-y-1.5 my-1">{items}</ol>);
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test((lines[i] ?? "").trim())) {
        const content = (lines[i] ?? "").trim().replace(/^[-*]\s/, "");
        items.push(
          <li key={i} className="flex gap-2">
            <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: "rgba(22,169,123,0.6)" }} />
            <span>{inlineFormat(content)}</span>
          </li>
        );
        i++;
      }
      nodes.push(<ul key={key++} className="space-y-1.5 my-1 list-none">{items}</ul>);
      continue;
    }

    // Regular paragraph
    nodes.push(<p key={key++}>{inlineFormat(trimmed)}</p>);
    i++;
  }

  return <div className="space-y-0.5">{nodes}</div>;
}

// ─── Tool call badge ──────────────────────────────────────────────────────────
// Shows which tools the AI invoked, collapsible.

const TOOL_LABELS: Record<string, { label: string; icon: React.ElementType<{ className?: string }> }> = {
  get_dashboard_overview:      { label: "Dashboard overview",     icon: BarChart2  },
  list_orders:                 { label: "Listed orders",          icon: List       },
  get_order_detail:            { label: "Order detail",           icon: Search     },
  get_exceptions:              { label: "Exceptions queue",       icon: AlertTriangle },
  generate_collection_report:  { label: "Collection report",      icon: FileText   },
  get_recent_transactions:     { label: "Recent transactions",    icon: Activity   },
  get_merchant_info:           { label: "Account info",           icon: Info       },
};

function ToolCallBadges({ toolCalls }: { toolCalls: Array<{ tool: string; result: unknown }> }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!toolCalls.length) return null;

  return (
    <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex items-center gap-1.5 text-[10px] cursor-pointer transition-opacity hover:opacity-70"
        style={{ color: "rgba(100,116,139,0.7)" }}
      >
        <Wrench className="w-2.5 h-2.5" />
        {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""} used
        <ChevronRight
          className="w-2.5 h-2.5 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </button>
      {expanded && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {toolCalls.map((tc, i) => {
            const meta = TOOL_LABELS[tc.tool] ?? { label: tc.tool, icon: Wrench };
            const Icon = meta.icon;
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium"
                style={{
                  background: "rgba(22,169,123,0.08)",
                  border:     "1px solid rgba(22,169,123,0.15)",
                  color:      "rgba(22,169,123,0.8)",
                }}
              >
                <Icon className="w-2 h-2" />
                {meta.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolCall {
  tool:   string;
  result: unknown;
}

interface Message {
  role:       "user" | "assistant" | "system";
  content:    string;
  escalated?: boolean;
  toolCalls?: ToolCall[];
}

interface ChatResponse {
  reply:     string;
  escalated: boolean;
  reason?:   string;
  toolCalls?: ToolCall[];
}

interface SupportTicket {
  id:         number;
  summary:    string;
  status:     "open" | "resolved";
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

interface ReplyTicketResponse {
  ok: boolean;
}

type Tab = "chat" | "tickets";

// ─── Ticket list ──────────────────────────────────────────────────────────────

function TicketList() {
  const [tickets, setTickets]         = React.useState<SupportTicket[] | null>(null);
  const [loading, setLoading]         = React.useState(false);
  const [error, setError]             = React.useState("");
  const [expandedId, setExpandedId]   = React.useState<number | null>(null);
  const [replyText, setReplyText]     = React.useState<Record<number, string>>({});
  const [replying, setReplying]       = React.useState<number | null>(null);
  const [replyError, setReplyError]   = React.useState<Record<number, string>>({});

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiFetch<{ tickets: SupportTicket[] }>("/api/v1/support/tickets");
      setTickets(res.tickets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }

  async function sendReply(ticketId: number) {
    const text = (replyText[ticketId] ?? "").trim();
    if (!text) return;
    setReplying(ticketId);
    setReplyError((prev) => ({ ...prev, [ticketId]: "" }));
    try {
      await apiFetch<ReplyTicketResponse>(`/api/v1/support/tickets/${ticketId}/reply`, {
        method: "POST",
        body:   JSON.stringify({ message: text }),
      });
      setReplyText((prev) => ({ ...prev, [ticketId]: "" }));
      await load(); // refresh to show updated ticket
    } catch (e) {
      setReplyError((prev) => ({
        ...prev,
        [ticketId]: e instanceof Error ? e.message : "Failed to send reply",
      }));
    } finally {
      setReplying(null);
    }
  }

  React.useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-xs text-red-400">{error}</p>
        <button type="button" onClick={() => void load()}
          className="text-xs cursor-pointer flex items-center gap-1"
          style={{ color: "#16A97B" }}>
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: "rgba(22,169,123,0.08)", border: "1px solid rgba(22,169,123,0.15)" }}>
          <CheckCircle2 className="w-5 h-5" style={{ color: "#16A97B" }} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>No tickets</p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          When an issue gets escalated to our team, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
      {/* Refresh button */}
      <div className="flex justify-end mb-1">
        <button type="button" onClick={() => void load()}
          className="text-[10px] flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-70"
          style={{ color: "var(--text-muted)" }}>
          <RefreshCw className="w-2.5 h-2.5" /> Refresh
        </button>
      </div>

      {tickets.map((t) => {
        const isExpanded = expandedId === t.id;
        return (
          <div
            key={t.id}
            className="rounded-xl overflow-hidden"
            style={{
              background: t.status === "open"
                ? "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.03) 100%)"
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${t.status === "open" ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.07)"}`,
            }}
          >
            {/* Header row — click to expand */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : t.id)}
              className="w-full text-left px-3 pt-3 pb-2 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: t.status === "open" ? "rgba(245,158,11,0.15)" : "rgba(22,169,123,0.12)",
                    color: t.status === "open" ? "#f59e0b" : "#16A97B",
                  }}
                >
                  {t.status === "open" ? "Open" : "Resolved"}
                </span>
                <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(t.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short" })}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {t.summary}
              </p>
            </button>

            {/* Resolution note */}
            {t.resolution && (
              <div className="mx-3 mb-2 px-2.5 py-2 rounded-lg text-xs"
                   style={{ background: "rgba(22,169,123,0.08)", border: "1px solid rgba(22,169,123,0.15)", color: "rgba(22,169,123,0.9)" }}>
                <span className="font-semibold">Team reply: </span>{t.resolution}
              </div>
            )}

            {/* Reply area — open tickets only */}
            {t.status === "open" && (
              <div className="px-3 pb-3">
                {/* Toggle reply box */}
                {!isExpanded ? (
                  <button
                    type="button"
                    onClick={() => setExpandedId(t.id)}
                    className="flex items-center gap-1 text-[10px] cursor-pointer transition-opacity hover:opacity-70"
                    style={{ color: "#16A97B" }}
                  >
                    <Reply className="w-2.5 h-2.5" /> Add reply
                  </button>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    <textarea
                      value={replyText[t.id] ?? ""}
                      onChange={(e) => setReplyText((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      placeholder="Add a message to your ticket…"
                      rows={2}
                      className="w-full rounded-lg px-2.5 py-2 text-xs resize-none outline-none"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border:     "1px solid rgba(255,255,255,0.12)",
                        color:      "var(--text-primary)",
                      }}
                      disabled={replying === t.id}
                    />
                    {replyError[t.id] && (
                      <p className="text-[10px] text-red-400">{replyError[t.id]}</p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(null)}
                        className="text-[10px] cursor-pointer transition-opacity hover:opacity-70"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void sendReply(t.id)}
                        disabled={!(replyText[t.id] ?? "").trim() || replying === t.id}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
                        style={{ background: "rgba(22,169,123,0.15)", border: "1px solid rgba(22,169,123,0.3)", color: "#16A97B" }}
                      >
                        {replying === t.id
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <Send className="w-2.5 h-2.5" />}
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SupportChat() {
  const [open, setOpen]           = React.useState(false);
  const [visible, setVisible]     = React.useState(false); // drives CSS animation
  const [tab, setTab]             = React.useState<Tab>("chat");
  const [messages, setMessages]   = React.useState<Message[]>([
    {
      role:    "assistant",
      content: "Hi! I'm the NairaRails support assistant. Ask me anything about your orders, splits, API keys, or reconciliation — or describe any issue you're running into.",
    },
  ]);
  const [input, setInput]         = React.useState("");
  const [loading, setLoading]     = React.useState(false);
  const [escalated, setEscalated] = React.useState(false);
  const [unread, setUnread]       = React.useState(0);

  const bottomRef = React.useRef<HTMLDivElement>(null);
  const inputRef  = React.useRef<HTMLTextAreaElement>(null);

  // Animate open: mount first, then trigger visible on next frame
  function openChat() {
    setOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    setUnread(0);
    setTimeout(() => inputRef.current?.focus(), 200);
  }

  // Animate close: remove visible, then unmount after transition
  function closeChat() {
    setVisible(false);
    setTimeout(() => setOpen(false), 220);
  }

  function toggleChat() {
    if (open) closeChat(); else openChat();
  }

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading || escalated) return;

    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const res = await apiFetch<ChatResponse>("/api/v1/support/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history }),
      });

      setMessages((prev) => [...prev, {
        role:      "assistant",
        content:   res.reply,
        escalated: res.escalated,
        toolCalls: res.toolCalls ?? [],
      }]);

      if (res.escalated) {
        setEscalated(true);
      }

      if (!open) setUnread((n) => n + 1);
    } catch {
      setMessages((prev) => [...prev, {
        role:    "assistant",
        content: "Something went wrong reaching the support service. Please try again in a moment.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function reset() {
    setMessages([{
      role:    "assistant",
      content: "Hi! I'm the NairaRails support assistant. Ask me anything about your orders, splits, API keys, or reconciliation — or describe any issue you're running into.",
    }]);
    setEscalated(false);
    setInput("");
  }

  return (
    <>
      {/* ── Floating bubble ── */}
      <button
        type="button"
        aria-label={open ? "Close support chat" : "Open support chat"}
        onClick={toggleChat}
        className="fixed bottom-6 right-6 z-50 rounded-full flex items-center justify-center cursor-pointer"
        style={{
          width: "52px",
          height: "52px",
          background: open
            ? "rgba(255,255,255,0.08)"
            : "linear-gradient(135deg, #16A97B 0%, #0d8f67 100%)",
          border: open
            ? "1px solid rgba(255,255,255,0.15)"
            : "1px solid rgba(22,169,123,0.4)",
          boxShadow: open
            ? "0 4px 24px rgba(0,0,0,0.4)"
            : "0 4px 24px rgba(22,169,123,0.35)",
          transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.15s",
          transform: open ? "scale(0.92)" : "scale(1)",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.transform = "scale(1.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = open ? "scale(0.92)" : "scale(1)"; }}
      >
        {/* Icon cross-fade */}
        <MessageCircle
          className="absolute w-5 h-5 text-black transition-all duration-200"
          style={{ opacity: open ? 0 : 1, transform: open ? "rotate(90deg) scale(0.6)" : "rotate(0deg) scale(1)" }}
        />
        <ChevronDown
          className="absolute w-5 h-5 transition-all duration-200"
          style={{
            color: "var(--text-secondary)",
            opacity: open ? 1 : 0,
            transform: open ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.6)",
          }}
        />

        {/* Unread badge */}
        {!open && unread > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: "#ef4444", border: "2px solid var(--bg-base)" }}
          >
            {unread}
          </span>
        )}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="fixed right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            bottom: "76px",
            width: "360px",
            height: "520px",
            background: "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(10,14,20,0.98) 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            // Animation: slide up + fade in
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
            transformOrigin: "bottom right",
            transition: "opacity 0.22s cubic-bezier(0.4,0,0.2,1), transform 0.22s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* Top accent bar */}
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: "linear-gradient(90deg, transparent, #16A97B, transparent)" }}
          />

          {/* ── Header ── */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(22,169,123,0.12)", border: "1px solid rgba(22,169,123,0.25)" }}
              >
                <Bot className="w-4 h-4" style={{ color: "#16A97B" }} />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
                  NairaRails Support
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {escalated ? "Ticket created — team notified" : "AI-powered · escalates when needed"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {tab === "chat" && messages.length > 1 && (
                <button
                  type="button"
                  onClick={reset}
                  className="px-2 py-1 rounded-lg text-[10px] font-medium transition-colors cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-muted)" }}
                >
                  New chat
                </button>
              )}
              <button
                type="button"
                onClick={closeChat}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-70 cursor-pointer"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-muted)" }}
                aria-label="Close chat"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div
            className="flex shrink-0 px-3 pt-2 pb-0 gap-1"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            {([
              { id: "chat"    as const, label: "Chat",       icon: MessageCircle },
              { id: "tickets" as const, label: "My Tickets", icon: Ticket },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all cursor-pointer relative"
                style={{
                  color: tab === id ? "#16A97B" : "var(--text-muted)",
                  background: tab === id ? "rgba(22,169,123,0.08)" : "transparent",
                }}
              >
                <Icon className="w-3 h-3" />
                {label}
                {/* Active underline */}
                {tab === id && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: "#16A97B" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          {tab === "tickets" ? (
            <TicketList />
          ) : (
            <>
              {/* ── Messages ── */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                    style={{
                      animation: i === messages.length - 1 ? "chatMsgIn 0.18s ease-out" : "none",
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        background: msg.role === "user"
                          ? "rgba(22,169,123,0.15)"
                          : msg.escalated ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.06)",
                        border: `1px solid ${
                          msg.role === "user"
                            ? "rgba(22,169,123,0.3)"
                            : msg.escalated ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.10)"
                        }`,
                      }}
                    >
                      {msg.role === "user"
                        ? <User className="w-3 h-3" style={{ color: "#16A97B" }} />
                        : msg.escalated
                          ? <AlertTriangle className="w-3 h-3 text-yellow-400" />
                          : <Bot className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                    </div>

                    {/* Bubble */}
                    <div
                      className="max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
                      style={{
                        background: msg.role === "user"
                          ? "linear-gradient(135deg, rgba(22,169,123,0.20) 0%, rgba(22,169,123,0.12) 100%)"
                          : msg.escalated
                            ? "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.06) 100%)"
                            : "rgba(255,255,255,0.05)",
                        border: `1px solid ${
                          msg.role === "user"
                            ? "rgba(22,169,123,0.25)"
                            : msg.escalated ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.08)"
                        }`,
                        color: "var(--text-primary)",
                        borderTopRightRadius: msg.role === "user" ? "4px" : undefined,
                        borderTopLeftRadius:  msg.role === "assistant" ? "4px" : undefined,
                      }}
                    >
                      {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                      {msg.escalated && (
                        <div
                          className="flex items-center gap-1.5 mt-2 pt-2 text-[10px] font-semibold"
                          style={{ borderTop: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b" }}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Ticket created — check the Tickets tab
                        </div>
                      )}
                      {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                        <ToolCallBadges toolCalls={msg.toolCalls} />
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading dots */}
                {loading && (
                  <div className="flex gap-2.5">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                    >
                      <Bot className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                    </div>
                    <div
                      className="rounded-2xl rounded-tl-[4px] px-4 py-3 flex items-center gap-1"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background: "rgba(100,116,139,0.6)",
                            animation: `typingDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* ── Escalated footer ── */}
              {escalated && (
                <div
                  className="shrink-0 px-4 py-3 text-center"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Our team has been notified and will follow up via email.
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={reset}
                      className="text-xs font-semibold transition-opacity hover:opacity-70 cursor-pointer"
                      style={{ color: "#16A97B" }}
                    >
                      New conversation
                    </button>
                    <span style={{ color: "rgba(100,116,139,0.4)" }}>·</span>
                    <button
                      type="button"
                      onClick={() => setTab("tickets")}
                      className="text-xs font-semibold transition-opacity hover:opacity-70 cursor-pointer flex items-center gap-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Ticket className="w-3 h-3" /> View ticket
                    </button>
                  </div>
                </div>
              )}

              {/* ── Input ── */}
              {!escalated && (
                <div
                  className="shrink-0 px-3 py-3"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="flex items-end gap-2 rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
                  >
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask a question…"
                      rows={1}
                      className="flex-1 bg-transparent outline-none resize-none text-xs leading-relaxed"
                      style={{ color: "var(--text-primary)", maxHeight: "96px", overflowY: "auto" }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={!input.trim() || loading}
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      style={{ background: "rgba(22,169,123,0.15)", border: "1px solid rgba(22,169,123,0.3)", color: "#16A97B" }}
                      aria-label="Send message"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] mt-1.5 text-center" style={{ color: "rgba(100,116,139,0.5)" }}>
                    Enter to send · Shift+Enter for new line
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Keyframe animations injected once */}
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes chatMsgIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
