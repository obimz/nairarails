// apps/api/src/routes/support.ts
//
// Merchant support chat powered by Gemini.
//
// POST /api/v1/support/chat
//   Authenticated (x-api-key). Sends a message + history to Gemini with the
//   NairaRails context prepended. Returns AI reply or escalates to human.
//
// GET  /api/v1/support/tickets
//   Authenticated (x-api-key). Lists the merchant's own escalated tickets.
//
// GET  /api/v1/admin/support-tickets  (mounted in admin.ts separately)
//   Admin-only. Lists all tickets across all merchants.

import { Router, type Router as ExpressRouter } from "express";
import { z }      from "zod";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { authAny }    from "../middleware/authAny.js";
import { AppError }   from "../middleware/errorHandler.js";
import { SUPPORT_SYSTEM_PROMPT, shouldAutoEscalate } from "../lib/support-context.js";

const router: ExpressRouter = Router();

// All support routes accept either x-api-key or Authorization: Bearer <jwt>
router.use(authAny);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ChatBodySchema = z.object({
  message:  z.string().min(1).max(2000),
  history:  z.array(
    z.object({
      role:    z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ).max(20).default([]),
});

// ─── Gemini helper ────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env["GEMINI_API_KEY"] ?? "";
const GEMINI_MODEL   = "gemini-2.5-flash";

interface GeminiResponse {
  escalate: boolean;
  reply:    string;
  reason?:  string;
}

async function askGemini(
  history: ChatMessage[],
  userMessage: string
): Promise<GeminiResponse> {
  if (!GEMINI_API_KEY) {
    throw new AppError(503, "SERVICE_UNAVAILABLE", "AI support is not configured on this server");
  }

  // Build the contents array for the Gemini API.
  // System prompt goes as the first user turn, model ack as first model turn —
  // Gemini 2.0 Flash doesn't support a separate system role in the REST API.
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
    { role: "user",  parts: [{ text: SUPPORT_SYSTEM_PROMPT }] },
    { role: "model", parts: [{ text: "Understood. I am ready to assist NairaRails merchants." }] },
    // Prior conversation turns
    ...history.map((m) => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    // Current message
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        contents,
        generationConfig: {
          temperature:     0.3,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "[support] Gemini API error");
    throw new AppError(502, "AI_ERROR", `Gemini returned ${res.status}`);
  }

  type GeminiApiResponse = {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const data = await res.json() as GeminiApiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Check if Gemini returned an escalation JSON object.
  // Gemini is instructed to return ONLY { "escalate": true, "reason": "..." }
  // when it cannot answer — try to parse it.
  try {
    const trimmed = text.trim();
    // Strip markdown code fences if Gemini wrapped the JSON
    const jsonText = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
      : trimmed;

    if (jsonText.startsWith("{") && jsonText.includes('"escalate"')) {
      const parsed = JSON.parse(jsonText) as { escalate?: boolean; reason?: string };
      if (parsed.escalate === true) {
        return { escalate: true, reply: "", reason: parsed.reason ?? "Question outside AI knowledge" };
      }
    }
  } catch {
    // Not JSON — treat as a plain text reply
  }

  return { escalate: false, reply: text };
}

// ─── POST /api/v1/support/chat ────────────────────────────────────────────────

router.post("/support/chat", async (req, res, next) => {
  try {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid request body");
    }

    const { message, history } = parsed.data;
    const merchant = res.locals.merchant;

    // ── Pre-flight: keyword-based auto-escalation ──────────────────────────
    if (shouldAutoEscalate(message)) {
      logger.info(
        { merchantId: merchant.id, message: message.slice(0, 80) },
        "[support] Auto-escalated via keyword match"
      );

      const allMessages: ChatMessage[] = [
        ...history,
        { role: "user",      content: message },
        { role: "assistant", content: "I'm connecting you with our support team now." },
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
      });
    }

    // ── Call Gemini ────────────────────────────────────────────────────────
    const geminiResult = await askGemini(history, message);

    if (geminiResult.escalate) {
      logger.info(
        { merchantId: merchant.id, reason: geminiResult.reason },
        "[support] Gemini escalated to human"
      );

      const allMessages: ChatMessage[] = [
        ...history,
        { role: "user",      content: message },
        { role: "assistant", content: "Escalated to human support." },
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
        reason:    geminiResult.reason,
      });
    }

    logger.info(
      { merchantId: merchant.id },
      "[support] AI replied successfully"
    );

    return res.status(200).json({
      reply:     geminiResult.reply,
      escalated: false,
    });
  } catch (err) {
    return next(err);
  }
});

// ─── GET /api/v1/support/tickets ──────────────────────────────────────────────
// Merchant's own escalated tickets — so they can see if their ticket is open.

router.get("/support/tickets", async (req, res, next) => {
  try {
    const merchant = res.locals.merchant;

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

export { router as supportRouter };
