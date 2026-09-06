// Handwriting OCR wrapper for Name Translator.
//
// Open-source / cloud libraries used:
// - @google/genai: official Gemini API SDK, used server-side only for image recognition.
// - dotenv: local .env loading is handled by server.js before this module is used.
//
// Google Cloud Vision was tested but not used in the final prototype because
// local service-account key creation was restricted by the project security policy.
//
// Recognition rule:
// Read the full canvas image as one complete English word/name. Do not infer words
// from local stroke features, and do not take only the first symbol or first letter.

let geminiClient = null;

async function recognizeFullWord(imageBase64, options = {}) {
  return recogniseFullHandwrittenWord(imageBase64, options);
}

async function recognizeHandwritingImage(imageBase64, options = {}) {
  return recogniseFullHandwrittenWord(imageBase64, options);
}

async function recogniseFullHandwrittenWord(imageBase64, options = {}) {
  // 这里是最终手写识别入口，只读取完整姓名。
  const bypassCache = options.bypassCache === true;
  console.log("[recognition] request started", {
    hasImage: Boolean(imageBase64),
    imageBase64Length: typeof imageBase64 === "string" ? imageBase64.length : 0,
    configured: isGeminiConfigured(),
    model: geminiModel(),
    bypassCache,
  });

  if (!imageBase64) return emptyRecognition("NO_IMAGE");
  if (!isGeminiEnabled() || !process.env.GEMINI_API_KEY) {
    return emptyRecognition("GEMINI_UNCONFIGURED");
  }

  const parsedImage = parseDataUrl(imageBase64);
  if (!parsedImage.data) return emptyRecognition("INVALID_IMAGE");

  try {
    const ai = await getGeminiClient();
    const prompt = [
      "You are reading one handwritten English personal name from an image.",
      "",
      "Rules:",
      "1. Read the COMPLETE name or word, including cursive handwriting.",
      "2. Do not return only the first letter.",
      "3. Ignore guide lines, canvas borders, UI text and decorative marks.",
      "4. Return uppercase Latin letters A-Z only.",
      "5. Do not translate the name.",
      "6. Do not explain your reasoning.",
      "7. If uncertain, provide up to three complete-name candidates.",
      "8. Never invent a name from a single isolated stroke.",
      "",
      "Return strict JSON only in this form:",
      "{",
      "  \"fullText\": \"JANE\",",
      "  \"confidence\": 0.92,",
      "  \"candidates\": [\"JANE\"]",
      "}",
      "",
      "If no complete name can be read, return:",
      "{",
      "  \"fullText\": \"\",",
      "  \"confidence\": 0,",
      "  \"candidates\": []",
      "}",
    ].join("\n");

    console.log("[Gemini REAL CALL]", {
      model: geminiModel(),
      mimeType: parsedImage.mimeType,
      dataLength: parsedImage.data.length,
      approximateBytes: Math.round(parsedImage.data.length * 0.75),
      apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    });

    // Gemini only reads the photographed handwriting. It does not generate the final glyph image.
    const response = await ai.models.generateContent({
      model: geminiModel(),
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: parsedImage.mimeType,
                data: parsedImage.data,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    const responseText = String(response.text || "").trim();
    console.log("[Gemini REAL RESPONSE]", {
      rawText: responseText,
      hasText: Boolean(responseText),
    });

    const parsed = parseGeminiRecognitionJson(responseText);
    // 这里只保留 A-Z，空格和符号会被过滤掉。
    const fullText = cleanFullWord(parsed.fullText);
    const candidates = Array.isArray(parsed.candidates)
      ? parsed.candidates.map(cleanFullWord).filter(Boolean).slice(0, 3)
      : [];
    if (fullText && !candidates.includes(fullText)) candidates.unshift(fullText);
    const confidence = clampNumber(parsed.confidence, 0, 1);

    console.log("[recognition] cleaned result", {
      rawText: responseText,
      fullText,
      length: fullText.length,
      letters: [...fullText],
      confidence,
      candidates,
    });

    return {
      fullText,
      likelyText: fullText,
      confidence,
      candidates,
      mode: fullText ? "GEMINI_SUCCESS" : "GEMINI_EMPTY_RESULT",
      apiMode: "GEMINI",
      model: geminiModel(),
      ocrStatus: fullText ? "SUCCESS" : "EMPTY",
      rawText: responseText,
      raw: null,
    };
  } catch (error) {
    console.error("[recognition] Gemini failed", {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
    });

    return {
      ...emptyRecognition("GEMINI_ERROR"),
      raw: {
        name: error.name,
        message: error.message,
        status: error.status,
        code: error.code,
      },
    };
  }
}

async function getGeminiClient() {
  if (!geminiClient) {
    const { GoogleGenAI } = await import("@google/genai");
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return geminiClient;
}

function parseDataUrl(imageBase64) {
  // 这里拆出图片格式和 base64 内容。
  const value = String(imageBase64 || "");
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      data: match[2],
    };
  }
  return {
    mimeType: "image/png",
    data: value,
  };
}

function parseGeminiRecognitionJson(text) {
  // Gemini 必须返回 JSON；如果不是 JSON，就当作识别失败。
  const cleaned = String(text || "")
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn("[recognition] Gemini returned invalid JSON", cleaned);
    return {
      fullText: "",
      confidence: 0,
      candidates: [],
    };
  }
}

function cleanFullWord(value) {
  // 这里过滤识别结果，只留下英文大写字母。
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function emptyRecognition(mode) {
  return {
    fullText: "",
    likelyText: "",
    confidence: 0,
    candidates: [],
    mode,
    apiMode: "GEMINI",
    model: geminiModel(),
    ocrStatus: mode.replace(/^GEMINI_/, ""),
    rawText: "",
    raw: null,
  };
}

function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function isGeminiEnabled() {
  return process.env.ENABLE_GEMINI_RECOGNITION !== "false";
}

function geminiModel() {
  return process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
}

function recognitionModeLabel() {
  if (!isGeminiEnabled()) return "GEMINI_DISABLED";
  return isGeminiConfigured() ? "GEMINI_READY" : "GEMINI_UNCONFIGURED";
}

function getRecognitionStatus() {
  const enabled = isGeminiEnabled();
  return {
    configured: isGeminiConfigured(),
    enabled,
    model: geminiModel(),
    mode: isGeminiConfigured() ? (enabled ? "GEMINI_READY" : "GEMINI_DISABLED") : "GEMINI_UNCONFIGURED",
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

module.exports = {
  recogniseFullHandwrittenWord,
  recognizeFullWord: recogniseFullHandwrittenWord,
  recognizeHandwritingImage: recogniseFullHandwrittenWord,
  recognitionModeLabel,
  getRecognitionStatus,
  isGeminiEnabled,
  emptyRecognition,
};
