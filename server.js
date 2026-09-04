// Mi Zi Grid local tablet-to-screen server.
// Run:
//   npm install
//   node server.js
//
// Open on the big screen:
//   http://localhost:<PORT>/screen.html
//
// Open on the tablet/phone using the computer's LAN IP:
//   http://YOUR_COMPUTER_IP:<PORT>/tablet.html
//
// If the tablet cannot connect, check that both devices are on the same Wi-Fi,
// that the IP address is correct, and that the computer firewall allows the selected port.
//
// Open-source libraries used:
// - Express: lightweight local static server for screen.html and tablet.html.
// - Socket.IO: real-time tablet-to-screen event relay.
// - qrcode: QR matrix generation for the tablet input URL.
// - dotenv: loads local Gemini credential variables from .env.
// - Gemini API via @google/genai: recognition.js reads complete handwritten words from images.
// No API key is sent to the browser. No React/Vue or heavy UI framework is used.

const express = require("express");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
require("dotenv").config();
const {
  recognizeFullWord,
  recogniseFullHandwrittenWord,
  recognitionModeLabel,
  getRecognitionStatus,
  isGeminiEnabled,
  emptyRecognition,
} = require("./recognition");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const LOCAL_IP = process.env.LOCAL_IP || "";
const PROJECT_VERSION = "Mi_Zi_Grid_v1.2_Exhibition_Integrated";
const publicDir = path.join(__dirname, "outputs");
// 这里记录本次本地服务已经调用 Gemini 的次数。
let geminiCallCount = 0;
const recognitionCache = new Map();
const recognitionImageCache = new Map();
const processingSubmissions = new Set();
const debugSubmissionDir = path.join(os.tmpdir(), "mizi-grid-recognition-debug");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024,
  cors: {
    origin: "*",
  },
});

// 这里把 outputs 里的展览页面提供给浏览器。
app.use(express.static(publicDir));
app.use(express.json({ limit: "20mb" }));

app.get("/", (_req, res) => {
  res.redirect("/exhibition.html");
});

app.get("/api/project-version", (_req, res) => {
  res.json({
    version: PROJECT_VERSION,
    projectDir: __dirname,
  });
});

app.get("/connection-info", async (req, res) => {
  const ip = LOCAL_IP || getPreferredLanAddress(req) || "YOUR_COMPUTER_IP";
  const tabletUrl = `http://${ip}:${PORT}/tablet.html`;
  const qr = QRCode.create(tabletUrl, { errorCorrectionLevel: "M" });
  res.json({
    tabletUrl,
    qrSize: qr.modules.size,
    qrData: Array.from(qr.modules.data, (value) => (value ? 1 : 0)),
  });
});

app.get("/api/recognition-status", (_req, res) => {
  // 这里给调试页面查看 Gemini 是否可用，不输出 API key。
  const status = getRecognitionStatus();
  res.json({
    configured: status.configured,
    enabled: status.enabled,
    model: status.model,
    mode: status.mode,
    callsThisSession: geminiCallCount,
    maxCallsThisSession: maxGeminiCalls(),
  });
});

app.post("/api/test-recognition", async (req, res) => {
  const imageBase64 = req.body?.imageBase64 || "";
  const submissionId = req.body?.submissionId || `TEST-${Date.now()}`;
  const recognition = await getRecognitionOnce(submissionId, imageBase64);
  res.json(publicRecognitionPayload(recognition || emptyRecognition("DUPLICATE_REQUEST_PROCESSING")));
});

app.post("/api/test-gemini-recognition", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({
        ok: false,
        stage: "NO_IMAGE",
      });
    }

    console.log("[SMOKE TEST] starting real Gemini request");
    const status = getRecognitionStatus();
    if (!isGeminiEnabled()) {
      const disabled = emptyRecognition("GEMINI_DISABLED");
      return res.json({ ok: false, ...publicRecognitionPayload(disabled) });
    }
    if (!status.configured) {
      const unconfigured = emptyRecognition("GEMINI_UNCONFIGURED");
      return res.json({ ok: false, ...publicRecognitionPayload(unconfigured) });
    }
    if (isGeminiCallLimitReached()) {
      const limited = emptyRecognition("GEMINI_SESSION_LIMIT");
      return res.json({ ok: false, ...publicRecognitionPayload(limited) });
    }

    geminiCallCount += 1;
    console.log("[Gemini recognition API call]", {
      call: geminiCallCount,
      maxCalls: maxGeminiCalls(),
      submissionId: "SMOKE_TEST",
      imageHash: hashImageBase64(imageBase64).slice(0, 10),
    });
    const result = await recogniseFullHandwrittenWord(imageBase64, { bypassCache: true });

    console.log("[SMOKE TEST] finished", {
      mode: result.mode,
      rawText: result.rawText,
      fullText: result.fullText,
      confidence: result.confidence,
    });

    return res.json({
      ok: Boolean(result.fullText),
      mode: result.mode,
      ocrStatus: result.ocrStatus,
      rawText: result.rawText,
      fullText: result.fullText,
      confidence: result.confidence,
      candidates: result.candidates,
      apiCall: "SMOKE_TEST",
      callsThisSession: geminiCallCount,
      maxCallsThisSession: maxGeminiCalls(),
      rawError: result.raw?.error || result.raw || null,
    });
  } catch (error) {
    console.error("[SMOKE TEST] fatal error", error);

    return res.status(500).json({
      ok: false,
      stage: "EXCEPTION",
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details,
    });
  }
});

io.on("connection", (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  socket.on("screen-ready", (data) => {
    console.log(`[screen] ready ${JSON.stringify(data || {})}`);
  });

  socket.on("tablet-ready", (data) => {
    console.log(`[tablet] ready ${JSON.stringify(data || {})}`);
  });

  socket.on("camera-ready", (data) => {
    console.log(`[camera] ready ${JSON.stringify(data || {})}`);
  });

  socket.on("handwriting-submit", async (data) => {
    // 这里接收展览页面提交的书写截图。
    const strokeCount = Array.isArray(data?.strokes) ? data.strokes.length : 0;
    const submissionId = data?.submissionId || `NO_ID-${Date.now()}`;
    console.log("[server] handwriting-submit received", {
      submissionId,
      strokeCount,
      hasImage: Boolean(data?.imageBase64),
      imageLength: typeof data?.imageBase64 === "string" ? data.imageBase64.length : 0,
    });

    io.emit("handwriting-status", {
      submissionId,
      status: "HANDWRITING_RECEIVED",
    });

    if (!data?.imageBase64) {
      io.emit("handwriting-result", {
        ...data,
        submissionId,
        recognition: publicRecognitionPayload(emptyRecognition("NO_IMAGE")),
      });
      return;
    }

    // 保存一份临时识别图，失败时方便检查裁切是否正确。
    saveDebugSubmissionImages(data, submissionId);

    io.emit("handwriting-status", {
      submissionId,
      status: "RECOGNISING",
    });

    // 这里真正调用 Gemini，并把结果广播回展览页面。
    const recognition = await getRecognitionOnce(submissionId, data.imageBase64);
    if (!recognition) return;
    console.log("[server] Gemini recognition complete", {
      submissionId,
      fullText: recognition.fullText || "",
      confidence: recognition.confidence,
      mode: recognition.mode,
    });
    io.emit("handwriting-result", {
      ...data,
      submissionId,
      recognition: publicRecognitionPayload(recognition),
    });
  });

  socket.on("disconnect", () => {
    console.log(`[socket] disconnected ${socket.id}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const addresses = getLanAddresses();
  const preferred = LOCAL_IP || addresses[0] || "YOUR_COMPUTER_IP";
  console.log("");
  console.log(`Server running on port ${PORT}`);
  console.log("Mi Zi Grid tablet-to-screen server is running.");
  console.log(`Recognition mode: ${recognitionModeLabel()}`);
  logGeminiConfig();
  console.log(`Exhibition mode: http://localhost:${PORT}/exhibition.html`);
  console.log(`Legacy big screen: http://localhost:${PORT}/screen.html`);
  console.log(`Overhead camera: http://localhost:${PORT}/camera.html`);
  console.log(`Screen QR target: http://${preferred}:${PORT}/tablet.html`);
  if (addresses.length) {
    console.log("Tablet / phone on same Wi-Fi:");
    for (const ip of addresses) {
      console.log(`  http://${ip}:${PORT}/tablet.html`);
    }
  } else {
    console.log(`Tablet / phone: http://YOUR_COMPUTER_IP:${PORT}/tablet.html`);
  }
  console.log("");
});

async function getRecognitionOnce(submissionId, imageBase64) {
  const stableSubmissionId = String(submissionId || "").trim() || `NO_ID-${Date.now()}`;
  const imageHash = hashImageBase64(imageBase64);
  const cacheDisabled = process.env.DISABLE_RECOGNITION_CACHE === "true";

  if (!cacheDisabled && recognitionCache.has(stableSubmissionId)) {
    console.log("[recognition] cache hit", stableSubmissionId);
    return {
      ...recognitionCache.get(stableSubmissionId),
      submissionId: stableSubmissionId,
      imageHash,
      apiCall: "CACHE_HIT_SUBMISSION",
    };
  }

  if (!cacheDisabled && imageHash && recognitionImageCache.has(imageHash)) {
    console.log("[recognition] reused cached image result", imageHash.slice(0, 10));
    const cached = {
      ...recognitionImageCache.get(imageHash),
      submissionId: stableSubmissionId,
      imageHash,
      apiCall: "CACHE_HIT_IMAGE",
    };
    recognitionCache.set(stableSubmissionId, cached);
    trimCache(recognitionCache);
    return cached;
  }

  if (processingSubmissions.has(stableSubmissionId)) {
    console.log("[recognition] duplicate request ignored", stableSubmissionId);
    return null;
  }

  const status = getRecognitionStatus();
  if (!isGeminiEnabled()) {
    return decorateRecognition(emptyRecognition("GEMINI_DISABLED"), stableSubmissionId, imageHash, "DISABLED");
  }
  if (!status.configured) {
    return decorateRecognition(emptyRecognition("GEMINI_UNCONFIGURED"), stableSubmissionId, imageHash, "UNCONFIGURED");
  }
  if (isGeminiCallLimitReached()) {
    console.warn("[recognition] session API limit reached");
    return decorateRecognition(emptyRecognition("GEMINI_SESSION_LIMIT"), stableSubmissionId, imageHash, "SESSION_LIMIT");
  }

  processingSubmissions.add(stableSubmissionId);

  try {
    geminiCallCount += 1;
    console.log("[Gemini recognition API call]", {
      call: geminiCallCount,
      maxCalls: maxGeminiCalls(),
      submissionId: stableSubmissionId,
      imageHash: imageHash.slice(0, 10),
    });
    const result = decorateRecognition(await recognizeFullWord(imageBase64), stableSubmissionId, imageHash, "NEW_REQUEST");
    recognitionCache.set(stableSubmissionId, result);
    if (imageHash) recognitionImageCache.set(imageHash, result);
    trimCache(recognitionCache);
    trimCache(recognitionImageCache);
    return result;
  } finally {
    processingSubmissions.delete(stableSubmissionId);
  }
}

function decorateRecognition(result, submissionId, imageHash, apiCall) {
  return {
    ...result,
    submissionId,
    imageHash,
    apiCall,
    geminiCallCount,
    maxCalls: maxGeminiCalls(),
  };
}

function publicRecognitionPayload(recognition) {
  if (!recognition) return null;
  const { raw, ...rest } = recognition;
  return rest;
}

function hashImageBase64(imageBase64) {
  if (!imageBase64) return "";
  return crypto.createHash("sha256").update(String(imageBase64)).digest("hex");
}

function saveDebugSubmissionImages(data, submissionId) {
  try {
    fs.mkdirSync(debugSubmissionDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeId = String(submissionId || "submission").replace(/[^a-zA-Z0-9_-]/g, "_");
    const recognitionPath = path.join(debugSubmissionDir, `${stamp}_${safeId}_gemini-input.png`);
    writeDataUrlImage(recognitionPath, data.imageBase64);
    if (data.traceImageBase64) {
      writeDataUrlImage(path.join(debugSubmissionDir, `${stamp}_${safeId}_trace.png`), data.traceImageBase64);
    }
    trimDebugSubmissionImages();
    console.log("[debug] saved recognition input", {
      submissionId,
      recognitionPath,
      traceSaved: Boolean(data.traceImageBase64),
    });
  } catch (error) {
    console.warn("[debug] failed to save recognition input", {
      submissionId,
      message: error.message,
    });
  }
}

function writeDataUrlImage(filePath, imageBase64) {
  const value = String(imageBase64 || "");
  const match = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  const encoded = match ? match[1] : value;
  fs.writeFileSync(filePath, Buffer.from(encoded, "base64"));
}

function trimDebugSubmissionImages() {
  const files = fs.readdirSync(debugSubmissionDir)
    .filter((name) => name.endsWith(".png"))
    .map((name) => {
      const fullPath = path.join(debugSubmissionDir, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const file of files.slice(40)) fs.unlinkSync(file.fullPath);
}

function trimCache(cache) {
  while (cache.size > 100) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function maxGeminiCalls() {
  const limit = geminiCallLimit();
  return limit > 0 ? limit : "UNLIMITED";
}

function geminiCallLimit() {
  const raw = process.env.MAX_GEMINI_CALLS_PER_SESSION;
  if (String(raw).trim() === "0") return 0;
  const parsed = Number(raw || 30);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function isGeminiCallLimitReached() {
  const limit = geminiCallLimit();
  return limit > 0 && geminiCallCount >= limit;
}

function logGeminiConfig() {
  const status = getRecognitionStatus();
  console.log("[gemini config]", {
    configured: status.configured,
    enabled: status.enabled,
    model: status.model,
    mode: status.mode,
  });
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function getLanAddresses() {
  let interfaces = {};
  try {
    interfaces = os.networkInterfaces();
  } catch (error) {
    console.warn("[network] Could not inspect LAN addresses; localhost still works.");
  }
  const addresses = [];
  for (const entries of Object.values(interfaces)) {
    for (const item of entries || []) {
      if (item.family === "IPv4" && !item.internal) addresses.push(item.address);
    }
  }
  return addresses;
}

function getPreferredLanAddress(req) {
  if (LOCAL_IP) return LOCAL_IP;
  const addresses = getLanAddresses();
  const host = req.headers.host || "";
  const hostIp = host.split(":")[0];
  if (addresses.includes(hostIp)) return hostIp;
  return addresses[0] || "";
}
