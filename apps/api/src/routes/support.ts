// apps/api/src/routes/support.ts
//
// Merchant support chat powered by Gemini 2.5 Flash with function calling.
//
// POST /api/v1/support/chat
//   Authenticated (x-api-key or Bearer JWT). Sends message + history to Gemini.
//   Gemini may call tools (get_dashboard_overview, list_orders, etc.) to fetch
//   live data before composing a final reply. The tool loop runs server-side —
//   the frontend receives the final answer plus any tool calls that were made.
//
// GET  /api/v1/support/tickets
//   Authenticated. Lists the merchant's own escalated support tickets.

import { Router, type Router as ExpressRouter } from "express";
import { z }         from "zod";
import { prisma }    from "../db/client.js";
import { logger }    from "../lib/logger.js";
import { authAny }   from "../middleware/authAny.js";
import { AppError }  from "../middleware/errorHandler.js";
import { SUPPORT_SYSTEM_PROMPT, shouldAutoEscalate } from "../lib/support-context.js";
import { TOOL_DECLARATIONS, runTool } from "../lib/ai-tools.js";

const router: ExpressRouter = Router();
router.use(authAny);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ChatBodySchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .default([]),
});

// ─── Gemini REST types ────────────────────────────────────────────────────────

interface GeminiPart {
  text?:             string;
  functionCall?:     { name: string; args: Record<string, string> };
  functionResponse?: { name: string; response: { content: unknown } };
}

interface GeminiContent {
  role:  string;
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content?:      GeminiContent;
  finishReason?: string;
}

interface GeminiApiResponse {
  candidates?: GeminiCandidate[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env["GEMINI_API_KEY"] ?? "";
const GEMINI_MODEL   = "gemini-2.5-flash";
const MAX_TOOL_TURNS = 5; // safety cap on the agentic loop

// ─── Gemini function-calling loop ─────────────────────────────────────────────

interface GeminiResult {
  escalate:   boolean;
  reply:      string;
  reason?:    string;
  toolCalls?: Array<{ tool: string; result: unknown }>;
}

async function askGeminiWithTools(
  history:     Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string,
  merchantId:  string
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) {
    throw new AppError(503, "SERVICE_UNAVAILABLE", "AI support is not configured on this server");
  }

  // Build initial contents array.
  // System prompt is injected as the first user/model exchange (Gemini REST
  // doesn't have a dedicated system role in v1beta).
  const contents: GeminiContent[] = [
    { role: "user",  parts: [{ text: SUPPORT_SYSTEM_PROMPT }] },
    { role: "model", parts: [{ text: "Understood. I am ready to assist NairaRails merchants with live data access." }] },
    ...history.map((m) => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const toolCalls: Array<{ tool: string; result: unknown }> = [];

  // ── Agentic loop ────────────────────────────────────────────────────────────
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const body = {
      contents,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: {
        temperature:     0.2,
        maxOutputTokens: 2048,
      },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      logger.error({ status: res.status, body: errBody }, "[support] Gemini API error");
      throw new AppError(502, "AI_ERROR", `Gemini returned ${res.status}`);
    }

    const data = await res.json() as GeminiApiResponse;
    const candidate = data.candidates?.[0];
    if (!candidate?.content) {
      throw new AppError(502, "AI_ERROR", "Gemini returned an empty response");
    }

    const parts    = candidate.content.parts;
    const fnCalls  = parts.filter((p) => p.functionCall);
    const textPart = parts.find((p) => p.text);

    // ── No tool calls → final text reply ────────────────────────────────────
    if (fnCalls.length === 0) {
      const text = textPart?.text ?? "";

      // Check if Gemini returned the escalation JSON
      try {
        const trimmed  = text.trim();
        const jsonText = trimmed.startsWith("```")
          ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
          : trimmed;
        if (jsonText.startsWith("{") && jsonText.includes('"escalate"')) {
          const parsed = JSON.parse(jsonText) as { escalate?: boolean; reason?: string };
          if (parsed.escalate === true) {
            return { escalate: true, reply: "", reason: parsed.reason ?? "Outside AI knowledge", toolCalls };
          }
        }
      } catch {
        // Not JSON — plain text reply
      }

      return { escalate: false, reply: text, toolCalls };
    }

    // ── Tool calls → execute all, feed results back ──────────────────────────
    // Add the model's response (with function calls) to the conversation
    contents.push({ role: "model", parts });

    // Execute each tool call and collect results
    const responseParts: GeminiPart[] = [];

    for (const part of fnCalls) {
      const fn = part.functionCall!;
      logger.info({ tool: fn.name, merchantId }, "[support] Tool call");

      const result = await runTool(fn.name, fn.args ?? {}, merchantId);
      toolCalls.push({ tool: fn.name, result: result.ok ? result.data : { error: result.error } });

      responseParts.push({
        functionResponse: {
          name:     fn.name,
          response: { content: result.ok ? result.data : { error: result.error } },
        },
      });
    }

    // Feed all tool results back in one user turn
    contents.push({ role: "user", parts: responseParts });
    // Loop continues → Gemini sees the results and generates its next response
  }

  // Fell out of loop — return whatever text we have or a fallback
  logger.warn({ merchantId }, "[support] Tool loop exhausted max turns");
  return {
    escalate: false,
    reply:    "I was able to retrieve your data but ran into a processing limit composing the response. Please try a more specific question.",
    toolCalls,
  };
}

// ─── POST /api/v1/support/chat ────────────────────────────────────────────────

router.post("/support/chat", async (req, res, next) => {
  try {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid request body");
    }

    const { message, history } = parsed.data;
    const merchant = res.locals.merchant as { id: string };

    // ── Pre-flight: keyword-based auto-escalation ──────────────────────────
    if (shouldAutoEscalate(message)) {
      logger.info({ merchantId: merchant.id, message: message.slice(0, 80) }, "[support] Auto-escalated via keyword");

      const allMessages = [
        ...history,
        { role: "user" as const,      content: message },
        { role: "assistant" as const, content: "Escalated to human support." },
      ];

      await prisma.supportTicket.create({
        data: {
          merchantId: merchant.id,
          summary:    message.slice(0, 120),
          messages:   JSON.stringify(allMessages),
          status:     "open",
        },
      });

      return res.status(200).json({
        reply:     "This looks like it needs immediate attention from our team. I've created a support ticket and someone will get back to you as soon as possible — usually within a few hours.",
        escalated: true,
        toolCalls: [],
      });
    }

    // ── Call Gemini with tool access ───────────────────────────────────────
    const result = await askGeminiWithTools(history, message, merchant.id);

    if (result.escalate) {
      logger.info({ merchantId: merchant.id, reason: result.reason }, "[support] Gemini escalated to human");

      const allMessages = [
        ...history,
        { role: "user" as const,      content: message },
        { role: "assistant" as const, content: "Escalated to human support." },
      ];

      await prisma.supportTicket.create({
        data: {
          merchantId: merchant.id,
          summary:    message.slice(0, 120),
          messages:   JSON.stringify(allMessages),
          status:     "open",
        },
      });

      return res.status(200).json({
        reply:     "I'm not able to resolve this one on my own — I've opened a support ticket for our team. We'll get back to you as soon as possible.",
        escalated: true,
        reason:    result.reason,
        toolCalls: result.toolCalls ?? [],
      });
    }

    logger.info({ merchantId: merchant.id, toolsUsed: result.toolCalls?.length ?? 0 }, "[support] AI replied");

    return res.status(200).json({
      reply:     result.reply,
      escalated: false,
      toolCalls: result.toolCalls ?? [],
    });
  } catch (err) {
    return next(err);
  }
});

// ─── GET /api/v1/support/tickets ──────────────────────────────────────────────

router.get("/support/tickets", async (req, res, next) => {
  try {
    const merchant = res.locals.merchant as { id: string };

    const tickets = await prisma.supportTicket.findMany({
      where:   { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
      take:    20,
      select: {
        id:         true,
        summary:    true,
        status:     true,
        resolution: true,
        createdAt:  true,
        updatedAt:  true,
      },
    });

    return res.status(200).json({
      tickets: tickets.map((t) => ({
        id:         t.id,
        summary:    t.summary,
        status:     t.status,
        resolution: t.resolution ?? null,
        created_at: t.createdAt.toISOString(),
        updated_at: t.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /api/v1/support/tickets/:id/reply ───────────────────────────────────
// Merchant adds a follow-up message to their own open ticket.
// The message is appended to the ticket's messages JSON array so the ops team
// sees it in the admin panel alongside the original conversation.

const ReplyBodySchema = z.object({
  message: z.string().min(1).max(2000),
});

router.post("/support/tickets/:id/reply", async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params["id"] ?? "0", 10);
    if (!ticketId) throw new AppError(400, "INVALID_ID", "Ticket ID must be a number");

    const parsed = ReplyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid body");
    }

    const merchant = res.locals.merchant as { id: string };

    // Verify ticket belongs to this merchant and is still open
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.merchantId !== merchant.id) {
      throw new AppError(404, "NOT_FOUND", `Ticket ${ticketId} not found`);
    }
    if (ticket.status === "resolved") {
      throw new AppError(422, "TICKET_CLOSED", "This ticket has already been resolved");
    }

    // Append the merchant's message to the conversation array
    type ConvMessage = { role: string; content: string };
    const conversation = JSON.parse(ticket.messages) as ConvMessage[];
    conversation.push({ role: "user", content: parsed.data.message });

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data:  { messages: JSON.stringify(conversation) },
    });

    logger.info({ ticketId, merchantId: merchant.id }, "[support] Merchant replied to ticket");

    return res.status(200).json({
      id:         updated.id,
      status:     updated.status,
      updated_at: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

export { router as supportRouter };
