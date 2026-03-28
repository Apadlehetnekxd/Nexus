import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const DEFAULT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache",
};

const systemPrompt = {
  role: "system",
  content: `
RULES:
- Same language as user
- Be direct and fast
- No unnecessary text

LENGTH:
- Simple → 1 sentence
- Medium → 2–4 sentences
- Complex → structured but concise
`,
};

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const messages = body?.messages ?? [];

    if (!Array.isArray(messages)) {
      return jsonError("Invalid messages format", 400);
    }

    const completion = await openai.chat.completions.create({
      model: "z-ai/glm4.7",
      messages: [systemPrompt, ...messages],

      temperature: 0.2,
      top_p: 0.5,
      max_tokens: 500,

      frequency_penalty: 0,
      presence_penalty: 0,


      chat_template_kwargs: { enable_thinking: false },

      stream: true,
    });

    return new Response(createStream(completion), {
      headers: DEFAULT_HEADERS,
    });

  } catch (error: any) {
    console.error("Chat API error:", error?.response?.data || error);

    return jsonError(
      error?.message || "Failed to get response",
      500
    );
  }
}

/* ---------------- STREAM HANDLER ---------------- */

function createStream(completion: AsyncIterable<any>): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let closed = false;

      try {
        for await (const chunk of completion) {
          const content = chunk?.choices?.[0]?.delta?.content;

          if (content && !closed) {
            controller.enqueue(encoder.encode(content));
          }
        }
      } catch (err) {
        console.error("Stream error:", err);

        if (!closed) {
          controller.error(err);
        }
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });
}

/* ---------------- ERROR HELPER ---------------- */

function jsonError(message: string, status = 500): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}