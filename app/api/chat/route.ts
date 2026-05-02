import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { z } from "zod";
import { classifyIntent, runAssistantTurn } from "@/lib/chat-engine";

export const runtime = "nodejs";

function extractErrorMessage(e: unknown): string {
  if (e instanceof ZodError) {
    return e.errors.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ");
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(12000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY_MISSING",
          message:
            "Chat is not configured: add OPENAI_API_KEY to .env.local in the project root, then stop and restart `npm run dev`.",
          intent: "SUPPORT" as const,
          products: [],
          quotation: null,
        },
        { status: 503 },
      );
    }

    const json = await req.json();
    const { messages } = bodySchema.parse(json);

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return NextResponse.json({ error: "Missing user message." }, { status: 400 });
    }

    const snippet = messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const { intent, searchQuery } = await classifyIntent({
      lastUserMessage: lastUser.content,
      conversationSnippet: snippet,
    });

    const result = await runAssistantTurn({
      intent,
      messages,
      searchQuery,
      lastUserMessage: lastUser.content,
    });

    return NextResponse.json({
      message: result.text,
      intent,
      products: result.products ?? [],
      quotation: result.quotation ?? null,
    });
  } catch (e) {
    const msg = extractErrorMessage(e);
    if (process.env.NODE_ENV === "development") {
      console.error("[api/chat]", e);
    }
    const badRequest =
      msg.includes("parse") ||
      msg.includes("Invalid") ||
      msg.includes("Expected") ||
      msg.includes("required") ||
      e instanceof ZodError;
    const status = badRequest ? 400 : 500;
    const friendly =
      status === 400
        ? "Your message could not be processed. Try a shorter message or start a new chat."
        : "The assistant hit a server error. Check API keys and WooCommerce settings, then retry.";
    return NextResponse.json(
      {
        error: msg,
        message: `${friendly}${process.env.NODE_ENV === "development" ? `\n\nDebug: ${msg}` : ""}`,
        intent: "SUPPORT" as const,
        products: [],
        quotation: null,
      },
      { status },
    );
  }
}
