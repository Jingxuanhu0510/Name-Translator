const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const sketchPath = path.join(root, "outputs", "mi_zi_grid_sketch.js");
const outDir = path.join(root, "docs", "images");

const sketchSource = fs.readFileSync(sketchPath, "utf8");

const fixedWritingZones = extractConst("fixedWritingZones");
const glyphColors = extractConst("GLYPH_TEST_COLORS");
const markerGlyphs = extractConst("MARKER_GLYPH_PATHS_V2");

// Documentation-only renderer: uses current project data and mirrors the live
// grouping/layout logic without importing the exhibition runtime.
const paper = "#f5efe4";
const ink = "#1f1f1c";
const muted = "#706a60";
const grid = "#ddd6c9";
const gridSoft = "#ebe5da";
const accent = "#a95442";

fs.mkdirSync(outDir, { recursive: true });

const azSvg = buildAZMappingSvg();
const groupingSvg = buildGroupingSvg("FUNDAMENTAL");
const pipelineSvg = buildPipelineSvg();

writeSvgAndPng("a-z-glyph-mapping", azSvg, 2400, 820);
writeSvgAndPng("grouping-example-fundamental", groupingSvg, 2400, 850);
writeSvgAndPng("interaction-pipeline", pipelineSvg, 2400, 900);

function extractConst(name) {
  const marker = `const ${name} =`;
  const start = sketchSource.indexOf(marker);
  if (start < 0) throw new Error(`Cannot find ${name}`);
  const valueStart = sketchSource.indexOf("=", start) + 1;
  let i = valueStart;
  while (/\s/.test(sketchSource[i])) i++;
  const opener = sketchSource[i];
  const closer = opener === "{" ? "}" : opener === "[" ? "]" : null;
  if (!closer) throw new Error(`Unsupported const shape for ${name}`);

  let depth = 0;
  let quote = "";
  let escaped = false;
  for (; i < sketchSource.length; i++) {
    const ch = sketchSource[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === opener) depth++;
    if (ch === closer) depth--;
    if (depth === 0) {
      const literal = sketchSource.slice(valueStart, i + 1);
      return Function(`"use strict"; return (${literal});`)();
    }
  }
  throw new Error(`Unclosed const ${name}`);
}

function buildAZMappingSvg() {
  const w = 2400;
  const h = 820;
  const marginX = 130;
  const top = 170;
  const cols = 13;
  const tile = 132;
  const gapX = 40;
  const rowGap = 250;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  let body = baseDefs(w, h);
  body += text(130, 92, "Name Translator", 50, "serif", ink);
  body += text(130, 136, "A-Z Glyph Reference", 24, "mono", muted);

  letters.forEach((letter, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = marginX + col * (tile + gapX);
    const y = top + row * rowGap;
    body += drawGrid(x, y, tile, 0.82);
    body += drawGlyph(letter, "zone4Core", x, y, tile, 0.032, "zone4Core", "left", 1);
    body += text(x + tile / 2, y + tile + 54, letter, 32, "mono", accent, "middle");
  });
  return svg(w, h, body);
}

function buildGroupingSvg(word) {
  const w = 2400;
  const h = 850;
  const groups = splitWord(word);
  let body = baseDefs(w, h);
  body += text(120, 95, "FUNDAMENTAL", 50, "serif", ink);
  body += text(120, 142, "Letter cleaning, grouping, and square composition", 24, "mono", muted);
  body += text(120, 245, "original word", 24, "mono", muted);
  body += text(120, 306, word, 64, "serif", ink);
  body += arrow(520, 286, 650, 286);
  body += text(720, 245, "groups", 24, "mono", muted);
  body += text(720, 306, groups.map((g) => g.join("")).join(" / "), 50, "mono", accent);
  body += arrow(1190, 286, 1320, 286);
  body += text(1390, 245, "generated square characters", 24, "mono", muted);

  const tile = 250;
  const gap = 80;
  const startX = 1305;
  const y = 390;
  groups.forEach((group, index) => {
    const x = startX + index * (tile + gap);
    body += drawGroup(group, x, y, tile);
    body += text(x + tile / 2, y + tile + 55, group.join(""), 28, "mono", accent, "middle");
  });
  return svg(w, h, body);
}

function buildPipelineSvg() {
  const w = 2400;
  const h = 900;
  const actions = ["Visitor", "Take Trace Card", "Press Button", "Write Name", "Place Under Camera", "Press Again"];
  const machine = ["Camera Capture", "Gemini Recognition", "Recognised Text", "A-Z Mapping", "Letter Grouping", "Square Composition", "Generated Character", "Residue Archive"];
  let body = baseDefs(w, h);
  body += text(120, 92, "Interaction pipeline", 50, "serif", ink);
  body += text(120, 137, "Visitor action passes into machine reading, then returns as a rule-based visual residue.", 24, "mono", muted);
  body += text(120, 225, "visitor actions", 22, "mono", accent);
  body += text(120, 505, "computational process", 22, "mono", accent);
  body += drawPipelineRow(actions, 120, 265, 2160, "#fbf8f0", "#d8cabc");
  body += drawPipelineRow(machine, 120, 545, 2160, "#f3eee4", "#cbbfae");
  body += arrow(1200, 432, 1200, 520);
  return svg(w, h, body);
}

function drawPipelineRow(items, x, y, width, fill, stroke) {
  const gap = 18;
  const boxW = (width - gap * (items.length - 1)) / items.length;
  let out = "";
  items.forEach((item, index) => {
    const bx = x + index * (boxW + gap);
    out += `<rect x="${bx}" y="${y}" width="${boxW}" height="92" rx="0" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    out += text(bx + boxW / 2, y + 57, item, 21, "mono", ink, "middle");
    if (index < items.length - 1) out += arrow(bx + boxW + 4, y + 46, bx + boxW + gap - 4, y + 46);
  });
  return out;
}

function drawGroup(group, x, y, side) {
  let out = drawGrid(x, y, side, 0.9);
  group.forEach((letter, index) => {
    const slot = slotForIndex(index, group.length);
    out += drawGlyph(letter, slot.profile, x, y, side, 0.032, slot.colorKey, slot.half, 1);
  });
  return out;
}

function splitWord(input) {
  const clean = String(input || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (clean.length === 5) return [clean.split("")];
  const groups = [];
  for (let i = 0; i < clean.length; i += 4) groups.push(clean.slice(i, i + 4).split(""));
  return groups;
}

function slotForIndex(index, groupLength) {
  if (groupLength === 5 && index === 3) return { profile: "zone4Half", colorKey: "zone4HalfLeft", half: "left" };
  if (groupLength === 5 && index === 4) return { profile: "zone4Half", colorKey: "zone4HalfRight", half: "right" };
  return [
    { profile: "zone1Tall", colorKey: "zone1Tall", half: "left" },
    { profile: "zone2Wide", colorKey: "zone2Wide", half: "left" },
    { profile: "zone3CompoundU", colorKey: "zone3CompoundU", half: "left" },
    { profile: "zone4Core", colorKey: "zone4Core", half: "left" },
  ][index];
}

function drawGrid(x, y, side, alpha = 1) {
  const soft = alphaToHex(0.42 * alpha);
  const hard = alphaToHex(0.68 * alpha);
  let out = `<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="none" stroke="${grid}${hard}" stroke-width="1.2"/>`;
  for (let i = 1; i < 4; i++) {
    const p = i / 4;
    out += line(x + side * p, y, x + side * p, y + side, gridSoft + soft, 0.9);
    out += line(x, y + side * p, x + side, y + side * p, gridSoft + soft, 0.9);
  }
  out += line(x + side / 2, y, x + side / 2, y + side, grid + hard, 1);
  out += line(x, y + side / 2, x + side, y + side / 2, grid + hard, 1);
  out += line(x, y, x + side, y + side, grid + hard, 1);
  out += line(x + side, y, x, y + side, grid + hard, 1);
  const step = side / 4;
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      out += line(x + gx * step, y + gy * step, x + (gx + 1) * step, y + (gy + 1) * step, gridSoft + alphaToHex(0.32 * alpha), 0.65);
      out += line(x + (gx + 1) * step, y + gy * step, x + gx * step, y + (gy + 1) * step, gridSoft + alphaToHex(0.32 * alpha), 0.65);
    }
  }
  return out;
}

function drawGlyph(letter, profile, gx, gy, side, ratio, colorKey, half, progress = 1) {
  const glyph = markerGlyphs[letter];
  if (!glyph) return "";
  const rawStrokes = glyph.strokes.map(strokeToPoints);
  const bounds = glyphBounds(rawStrokes);
  const strokeW = Math.max(1, side * ratio);
  const col = glyphColors[colorKey] || glyphColors[profile] || [31, 31, 28];
  const rgb = `rgb(${col[0]},${col[1]},${col[2]})`;
  let out = "";
  rawStrokes.forEach((stroke, strokeIndex) => {
    const pts = stroke.map((pt, pointIndex) => mapPoint(pt, bounds, profile, gx, gy, side, strokeW, half, letter, strokeIndex, pointIndex));
    out += polyline(pts, rgb, strokeW, 0.72);
  });
  return out;
}

function strokeToPoints(strokeDef) {
  const pts = strokeDef.points || [];
  if (strokeDef.kind !== "curve" || pts.length < 4) return pts.map(([x, y]) => ({ x, y }));
  const [p0, p1, p2, p3] = pts;
  const sampled = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    sampled.push({
      x: bezierPoint(p0[0], p1[0], p2[0], p3[0], t),
      y: bezierPoint(p0[1], p1[1], p2[1], p3[1], t),
    });
  }
  return sampled;
}

function glyphBounds(strokes) {
  const all = strokes.flat();
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    w: Math.max(0.001, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(0.001, Math.max(...ys) - Math.min(...ys)),
  };
}

function mapPoint(pt, bounds, profile, gx, gy, side, strokeW, half, letter, strokeIndex, pointIndex) {
  const nx = clamp((pt.x - bounds.minX) / bounds.w, 0, 1);
  const ny = clamp((pt.y - bounds.minY) / bounds.h, 0, 1);
  const jitter = stableJitter(letter, profile, strokeIndex, pointIndex, side);
  if (profile === "zone3CompoundU") return mapCompoundU(nx, ny, gx, gy, side, strokeW, jitter);
  const rect = rectForProfile(profile, gx, gy, side, strokeW, half);
  return { x: rect.x + nx * rect.w + jitter.x, y: rect.y + ny * rect.h + jitter.y };
}

function rectForProfile(profile, gx, gy, side, strokeW, half = "left") {
  if (profile === "zone4Half") {
    const z4 = fixedWritingZones.zone4;
    const gap = z4.w * side * 0.025;
    const halfW = (z4.w * side - gap) * 0.5;
    const hx = half === "right" ? gx + z4.x * side + halfW + gap : gx + z4.x * side;
    return safeRect(hx, gy + z4.y * side, halfW, z4.h * side, strokeW, 0.036);
  }
  if (profile === "zone1Tall") {
    const zone = fixedWritingZones.zone1;
    return safeRect(gx + zone.x * side, gy + zone.y * side, zone.w * side * 1.22, zone.h * side, strokeW, 0.052);
  }
  const zone = profile === "zone2Wide" ? fixedWritingZones.zone2 : fixedWritingZones.zone4;
  return safeRect(gx + zone.x * side, gy + zone.y * side, zone.w * side, zone.h * side, strokeW);
}

function safeRect(x, y, w, h, strokeW, padRatio = 0.06) {
  const pad = Math.max(strokeW * 0.58, Math.min(w, h) * padRatio);
  return { x: x + pad, y: y + pad, w: Math.max(1, w - pad * 2), h: Math.max(1, h - pad * 2) };
}

function mapCompoundU(nx, ny, gx, gy, side, strokeW, jitter) {
  const z = fixedWritingZones.zone3;
  const outer = { x: gx + z.outer.x * side, y: gy + z.outer.y * side, w: z.outer.w * side, h: z.outer.h * side };
  const inner = { x: gx + z.innerCutout.x * side, y: gy + z.innerCutout.y * side, w: z.innerCutout.w * side, h: z.innerCutout.h * side };
  const safeOuter = safeRect(outer.x, outer.y, outer.w, outer.h, strokeW, 0.045);
  const cutPad = Math.max(strokeW * 1.15, side * 0.015);
  const cut = { x: inner.x - cutPad, y: inner.y - cutPad, w: inner.w + cutPad * 2, h: inner.h + cutPad * 2 };
  let mappedX = safeOuter.x + nx * safeOuter.w;
  let mappedY = safeOuter.y + ny * safeOuter.h;
  const inCutout = mappedX > cut.x && mappedX < cut.x + cut.w && mappedY > cut.y && mappedY < cut.y + cut.h;
  if (inCutout) {
    const leftTarget = cut.x - strokeW * 0.45;
    const rightTarget = cut.x + cut.w + strokeW * 0.45;
    mappedX = smoothstep(0.36, 0.64, nx) < 0.5 ? leftTarget : rightTarget;
  }
  return { x: clamp(mappedX, safeOuter.x, safeOuter.x + safeOuter.w) + jitter.x, y: clamp(mappedY, safeOuter.y, safeOuter.y + safeOuter.h) + jitter.y };
}

function stableJitter(letter, profile, strokeIndex, pointIndex, side) {
  const seed = hashString([letter, profile, strokeIndex, pointIndex].join(":"));
  const amp = side * 0.0028;
  return { x: (((seed & 255) / 255) - 0.5) * amp, y: ((((seed >>> 8) & 255) / 255) - 0.5) * amp };
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function bezierPoint(a, b, c, d, t) {
  const mt = 1 - t;
  return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function text(x, y, content, size, family = "sans", fill = ink, anchor = "start") {
  const fonts = {
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'Courier New', monospace",
    sans: "Arial, sans-serif",
  };
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${fonts[family]}" font-size="${size}" fill="${fill}">${escapeXml(content)}</text>`;
}

function line(x1, y1, x2, y2, stroke, width) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function polyline(points, stroke, width, opacity) {
  const d = points.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
  return `<polyline points="${d}" fill="none" stroke="${stroke}" stroke-width="${round(width)}" stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:multiply"/>`;
}

function arrow(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${accent}" stroke-width="1.4" marker-end="url(#arrow)"/>`;
}

function baseDefs(w, h) {
  return `<rect width="${w}" height="${h}" fill="${paper}"/>
<defs>
  <pattern id="paperDots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d8cfc1" opacity="0.18"/></pattern>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${accent}"/></marker>
</defs>
<rect width="${w}" height="${h}" fill="url(#paperDots)" opacity="0.45"/>
<rect x="48" y="48" width="${w - 96}" height="${h - 96}" fill="none" stroke="#e1dacd" stroke-width="1.2"/>`;
}

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

function writeSvgAndPng(name, svgContent, width, height) {
  const svgPath = path.join(outDir, `${name}.svg`);
  const htmlPath = path.join(outDir, `${name}.html`);
  const pngPath = path.join(outDir, `${name}.png`);
  fs.writeFileSync(svgPath, svgContent);
  fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;background:${paper};overflow:hidden}svg{display:block}</style></head><body>${svgContent}</body></html>`);
  const chrome = findChrome();
  if (!chrome) throw new Error("Chrome or Edge is required to render documentation PNGs.");
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    `--screenshot=${pngPath}`,
    `--window-size=${width},${height}`,
    pathToFileUrl(htmlPath),
  ], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Failed to render ${name}.png`);
  fs.unlinkSync(htmlPath);
  fs.unlinkSync(svgPath);
}

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/").replace(/ /g, "%20")}`;
}

function alphaToHex(alpha) {
  const n = clamp(Math.round(alpha * 255), 0, 255);
  return n.toString(16).padStart(2, "0");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
}
