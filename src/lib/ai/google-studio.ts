const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

type OptimizeTask = "rewrite" | "translate";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function buildPrompt(text: string, task: OptimizeTask) {
  if (task === "rewrite") {
    return [
      "You are an e-commerce copywriter.",
      "Rewrite this product title in Korean for better CTR and SEO.",
      "Keep meaning, avoid symbols, and output only one line.",
      `Input: ${text}`
    ].join("\n");
  }

  return [
    "Translate this product text into natural Korean for a shopping listing.",
    "Output only translated text.",
    `Input: ${text}`
  ].join("\n");
}

export async function optimizeProductInfo(text: string, task: OptimizeTask): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey || !text.trim()) {
    return text;
  }

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(text, task) }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 256
        }
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      return text;
    }

    const result = (await response.json()) as GeminiResponse;
    const optimized = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join(" ")
      .trim();

    return optimized || text;
  } catch {
    return text;
  }
}
