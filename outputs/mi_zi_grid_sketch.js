// Mi Zi Grid / p5.js modular block prototype
// GridType-inspired method: fixed grid, repeated geometric modules, visible construction.
// Web Serial input remains compatible with:
//   CONFIRMED: 1-4-6    Letter: A
//   ZONES:1-4-6,LETTER:A
//
// Open-source libraries used by this screen sketch:
// - p5.js: all creative drawing, Mi Zi Grid construction, handwriting trace display, and generative residue output.
// - Socket.IO client: receives full handwriting strokes from the tablet page in real time.
// QR code generation happens server-side with the lightweight qrcode package and is rendered here as a matrix.
// Optional server-side handwriting recognition can provide a text hint; local trace fallback always works.
// References: ChenYuHo/handwriting.js for trace capture patterns; perfect-freehand for future natural stroke outlines.
// No OCR/API key is exposed to the browser. No React/Vue or heavy UI framework is used.

const PALETTE = {
  paper: "#F3EEE2",
  paperDeep: "#E7DDCC",
  ink: "#1B1A17",
  inkSoft: "#2B2925",
  red: "#A33A2B",
  cinnabar: "#A33A2B",
  grey: "#7E786F",
  greyText: "#7E786F",
  grid: "#CFC6B8",
  gridSoft: "#DDD6CA",
};

// 渲染层实验：clean 为当前几何线条，rough 为可选手绘线条，svgPreview 为独立小预览。
// optional visual reference library:
// Rough.js, MIT License, optional later reference only; not loaded in the current prototype.
// possible future reference:
// Vivus.js, MIT License, for SVG stroke drawing animation.
// Not integrated into the main logic yet.
const renderModes = ["clean", "rough", "svgPreview"];
let renderMode = "clean";
let mainCanvas;
let roughCanvas = null;
const FIT_OVERSHOOT = 0.015;
const STABLE_CHECKPOINT = "stable_framework_strokefit_v1";
const EXHIBITION_MODE_DEFAULT = true;
let inputMode = "nameHandwriting"; // "nameHandwriting" / "tabletWriting" / "bodyGrid" / "demo"
const GLYPH_TEST_PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const GLYPH_TEST_MODE = GLYPH_TEST_PARAMS.get("glyphTest") === "1";
const MARKER_FORMAL_STROKE_RATIO = 0.032;

// 区域贴边策略：zone1/zone4 严格在框内，zone2/zone3 允许轻微外扩来形成顶格感。
const ZONE_FIT_POLICY = {
  zone1: {
    allowOvershoot: false,
    paddingX: 0.00,
    paddingY: 0.00,
    useStrictClipping: true,
  },
  zone2: {
    allowOvershoot: true,
    overshootRatio: 0.01,
  },
  zone3: {
    allowOvershoot: true,
    overshootRatio: 0.01,
  },
  zone4: {
    allowOvershoot: false,
    paddingX: 0.00,
    paddingY: 0.00,
    useStrictClipping: true,
  },
};

const DEBUG_COLORS = {
  zone1: [80, 135, 220],
  zone2: [70, 170, 100],
  zone3: [190, 145, 30],
  zone4: [210, 80, 70],
};

const SEAL_STYLE = {
  strokeColor: "#1b1a17",
  strokeWeight: 4,
  endCap: "round",
  joint: "round",
  wobble: 0.8,
  taper: 0.15,
  inkAlpha: 0.92,
};

// Latin letters are used as structural tendencies, not as literal glyphs.
// 英文字母不直接生成最终笔画，而是作为结构倾向，用来影响小篆化伪字的构成。
const sealComponentMap = {
  axis: ["I", "T", "F", "L", "H"],
  enclosure: ["O", "Q", "D", "C", "U", "P", "B"],
  fork: ["A", "V", "Y", "K", "X"],
  layer: ["E", "Z", "H", "M", "W"],
  curve: ["S", "G", "J"],
  attachment: ["B", "R", "N"],
};

const nameFamilyByLetter = {};
for (const [family, letters] of Object.entries(sealComponentMap)) {
  for (const letter of letters) {
    if (!nameFamilyByLetter[letter]) nameFamilyByLetter[letter] = family;
  }
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const ASCENDERS = new Set(["B", "D", "F", "H", "K", "L", "T"]);
const DESCENDERS = new Set(["G", "J", "P", "Q", "Y"]);

const ZONE_COMPONENTS = {
  zone1: ["straight_axis", "curved_axis", "forked_axis", "double_axis", "hooked_axis", "segmented_axis"],
  zone2: ["single_crown", "double_crown", "triple_layer", "human_crown", "fork_crown", "curved_crown"],
  zone3: ["plain_u_frame", "double_pillar_u", "open_u_frame", "curved_u_frame", "side_attachment_u", "layered_u_frame"],
  zone4: ["inner_cross", "inner_enclosure", "inner_fork", "inner_layers", "inner_curve", "inner_double_pillar"],
};

const LETTER_FAMILIES = {
  axis: new Set(["I", "T", "F", "L", "H"]),
  enclosure: new Set(["O", "Q", "D", "C", "U", "P", "B"]),
  fork: new Set(["A", "V", "Y", "K", "X"]),
  layer: new Set(["E", "Z", "M", "W"]),
  curve: new Set(["S", "G", "J"]),
  attachment: new Set(["R", "N"]),
};

const keyMap = {
  A: "1-4-6",
  B: "2-4-7",
  C: "6-7-8",
  D: "3-5-7",
  E: "1-5-7",
  F: "1-7",
  G: "3-7-8",
  H: "3-7",
  I: "1-5",
  J: "1-4-5",
  K: "1-4-7",
  L: "5-7",
  M: "1-2-8",
  N: "4-7",
  O: "2-4-6-8",
  P: "1-3-7",
  Q: "2-4-8",
  R: "2-5-7",
  S: "2-6-7",
  T: "1-2-5-8",
  U: "3-4-5",
  V: "2-5-8",
  W: "4-5-6",
  X: "4-8",
  Y: "1-4",
  Z: "1-3-6",
};

const letterByZones = {};
for (const [letter, zones] of Object.entries(keyMap)) {
  letterByZones[zones] = letter;
}

// Canonical source: 以用户提供的 "Table of Square Word Elements" 为当前阶段视觉来源。
// 这里记录文化/书法参考，不参与 Arduino zone、slot 或位置判断。
const canonicalLetterSource = {
  A: { source: "A element", family: "open_person", note: "斜撇捺开张，像人/八的起势" },
  B: { source: "B element", family: "left_stem_double_attach", note: "左侧主竖，右侧带附体" },
  C: { source: "C element", family: "open_corner", note: "匚形开口，保留方块边角" },
  D: { source: "D element", family: "vertical_hook", note: "竖势下落后收钩" },
  E: { source: "E element", family: "layered_three_bars", note: "多层横势，底部承接" },
  F: { source: "F element", family: "top_bar_with_stem", note: "顶横强，竖画撑下" },
  G: { source: "G element", family: "open_enclosure_hook", note: "开口围合并有钩势" },
  H: { source: "H element", family: "double_vertical_bridge", note: "双竖与中横连接" },
  I: { source: "I element", family: "horizontal_bar", note: "横向平台，短竖辅助" },
  J: { source: "J element", family: "vertical_hook", note: "竖钩，下部收笔明显" },
  K: { source: "K element", family: "branching_stem", note: "主竖加斜向分叉" },
  L: { source: "L element", family: "vertical_foot", note: "竖落到底后横脚收住" },
  M: { source: "M element", family: "half_enclosure", note: "门形上包围，内侧留空" },
  N: { source: "N element", family: "half_enclosure", note: "门形但更窄，强调右侧框架" },
  O: { source: "O element", family: "square_enclosure", note: "口形稳定围合" },
  P: { source: "P element", family: "upper_bowl", note: "上部附体，不拖到底" },
  Q: { source: "Q element", family: "enclosure_tail", note: "口形加下部尾笔" },
  R: { source: "R element", family: "bowl_with_leg", note: "附体后伸出斜腿" },
  S: { source: "S element", family: "turning_curve", note: "乙/之式回转" },
  T: { source: "T element", family: "top_cross", note: "强顶横加中竖" },
  U: { source: "U element", family: "lower_container", note: "凵形承托" },
  V: { source: "V element", family: "downward_open", note: "两斜向下聚合" },
  W: { source: "W element", family: "mountain_peaks", note: "山形三峰" },
  X: { source: "X element", family: "central_cross", note: "乂形交叉" },
  Y: { source: "Y element", family: "fork_down", note: "上分叉，下接竖" },
  Z: { source: "Z element", family: "turning_zhi", note: "之字折转" },
};

// Component family: 字母只决定构件家族，不决定写入 zone。
// 后续若替换真实 SVG/PNG 书法素材，可保持这些 component key 不变。
const componentTypeMap = Object.fromEntries(
  Object.entries(canonicalLetterSource).map(([letter, info]) => [letter, info.family])
);

// 现有调用入口：component = 实际绘制函数使用的构件名；ref/note 只用于人工检查。
const componentMap = Object.fromEntries(
  Object.entries(canonicalLetterSource).map(([letter, info]) => [
    letter,
    {
      component: componentTypeMap[letter],
      ref: info.source,
      note: info.note,
    },
  ])
);

const FINAL_OUTPUT_GLYPH_PATHS = {
  A: [
    [[0.28, 0.88], [0.48, 0.16], [0.46, 0.08]],
    [[0.34, 0.42], [0.72, 0.42]],
    [[0.70, 0.18], [0.70, 0.82], [0.60, 0.90]],
  ],
  B: [
    [[0.28, 0.10], [0.28, 0.90]],
    [[0.62, 0.12], [0.62, 0.78], [0.54, 0.88]],
    [[0.28, 0.45], [0.74, 0.45]],
  ],
  C: [
    [[0.72, 0.14], [0.30, 0.14], [0.30, 0.86], [0.70, 0.86]],
  ],
  D: [
    [[0.30, 0.10], [0.30, 0.88]],
    [[0.30, 0.12], [0.70, 0.12]],
    [[0.70, 0.12], [0.70, 0.76], [0.62, 0.86]],
  ],
  E: [
    [[0.30, 0.10], [0.30, 0.88]],
    [[0.30, 0.20], [0.76, 0.20]],
    [[0.30, 0.48], [0.70, 0.48]],
    [[0.30, 0.78], [0.72, 0.78]],
  ],
  F: [
    [[0.46, 0.08], [0.46, 0.88]],
    [[0.24, 0.22], [0.78, 0.22]],
    [[0.32, 0.50], [0.72, 0.50]],
  ],
  G: [
    [[0.72, 0.18], [0.42, 0.14], [0.32, 0.34], [0.30, 0.82]],
    [[0.52, 0.18], [0.74, 0.18], [0.74, 0.76]],
  ],
  H: [
    [[0.28, 0.10], [0.28, 0.90]],
    [[0.70, 0.12], [0.70, 0.84]],
    [[0.28, 0.50], [0.70, 0.50]],
  ],
  I: [
    [[0.48, 0.10], [0.48, 0.90]],
    [[0.25, 0.24], [0.73, 0.24]],
    [[0.31, 0.50], [0.68, 0.50]],
    [[0.28, 0.76], [0.72, 0.76]],
  ],
  J: [
    [[0.24, 0.22], [0.72, 0.22]],
    [[0.66, 0.10], [0.66, 0.75], [0.56, 0.86], [0.34, 0.86]],
  ],
  K: [
    [[0.30, 0.10], [0.30, 0.90]],
    [[0.30, 0.48], [0.76, 0.14]],
    [[0.30, 0.50], [0.78, 0.86]],
  ],
  L: [
    [[0.30, 0.10], [0.30, 0.88]],
    [[0.30, 0.88], [0.74, 0.88]],
  ],
  M: [
    [[0.22, 0.44], [0.78, 0.44]],
    [[0.32, 0.18], [0.24, 0.78]],
    [[0.62, 0.18], [0.54, 0.78]],
  ],
  N: [
    [[0.25, 0.12], [0.25, 0.88]],
    [[0.25, 0.14], [0.74, 0.86]],
    [[0.74, 0.18], [0.74, 0.88]],
  ],
  O: [
    [[0.24, 0.12], [0.76, 0.12], [0.76, 0.88], [0.24, 0.88], [0.24, 0.12]],
  ],
  P: [
    [[0.28, 0.10], [0.28, 0.90]],
    [[0.28, 0.14], [0.72, 0.14], [0.72, 0.54], [0.28, 0.54]],
  ],
  Q: [
    [[0.26, 0.12], [0.76, 0.12], [0.76, 0.82], [0.26, 0.82], [0.26, 0.12]],
    [[0.54, 0.74], [0.72, 0.92]],
  ],
  R: [
    [[0.28, 0.10], [0.28, 0.90]],
    [[0.28, 0.14], [0.70, 0.14], [0.72, 0.46], [0.34, 0.46]],
    [[0.42, 0.48], [0.74, 0.88]],
  ],
  S: [
    [[0.72, 0.20], [0.34, 0.20], [0.28, 0.44], [0.64, 0.48], [0.70, 0.76], [0.32, 0.80]],
  ],
  T: [
    [[0.18, 0.24], [0.82, 0.24]],
    [[0.50, 0.10], [0.50, 0.90]],
  ],
  U: [
    [[0.24, 0.10], [0.24, 0.84], [0.50, 0.90], [0.76, 0.84], [0.76, 0.18]],
  ],
  V: [
    [[0.24, 0.18], [0.48, 0.88]],
    [[0.72, 0.18], [0.48, 0.88]],
  ],
  W: [
    [[0.20, 0.18], [0.36, 0.84]],
    [[0.42, 0.20], [0.50, 0.82], [0.64, 0.62], [0.74, 0.20]],
  ],
  X: [
    [[0.22, 0.16], [0.76, 0.88]],
    [[0.74, 0.18], [0.48, 0.56]],
  ],
  Y: [
    [[0.24, 0.36], [0.62, 0.34]],
    [[0.54, 0.34], [0.54, 0.90]],
    [[0.54, 0.56], [0.72, 0.84]],
  ],
  Z: [
    [[0.22, 0.22], [0.80, 0.22]],
    [[0.78, 0.24], [0.34, 0.82]],
    [[0.32, 0.82], [0.54, 0.82]],
  ],
};

const frameworkAnchors = {
  top: { x: 0.5, y: 0.12 },
  topRight: { x: 0.82, y: 0.18 },
  right: { x: 0.88, y: 0.5 },
  bottomRight: { x: 0.78, y: 0.82 },
  bottom: { x: 0.5, y: 0.88 },
  bottomLeft: { x: 0.22, y: 0.82 },
  left: { x: 0.12, y: 0.5 },
  topLeft: { x: 0.18, y: 0.18 },
  center: { x: 0.5, y: 0.5 },
};

const fixedWritingZones = {
  zone1: {
    step: 1,
    name: "left_main_vertical",
    type: "rect",
    x: 0.00,
    y: 0.00,
    w: 0.20,
    h: 1.00,
  },
  zone2: {
    step: 2,
    name: "top_horizontal_band",
    type: "rect",
    x: 0.20,
    y: 0.00,
    w: 0.80,
    h: 0.22,
  },
  zone3: {
    step: 3,
    name: "continuous_outer_u_frame",
    type: "compoundU",
    outer: {
      x: 0.20,
      y: 0.22,
      w: 0.80,
      h: 0.78,
    },
    innerCutout: {
      x: 0.40,
      y: 0.45,
      w: 0.40,
      h: 0.55,
    },
  },
  zone4: {
    step: 4,
    name: "inner_door_closing_area",
    type: "rect",
    x: 0.40,
    y: 0.45,
    w: 0.40,
    h: 0.55,
  },
};

const GLYPH_TEST_PROFILES = ["zone1Tall", "zone2Wide", "zone3CompoundU", "zone4Core", "zone4Half"];
let glyphTestProfileIndex = Math.max(0, GLYPH_TEST_PROFILES.indexOf(GLYPH_TEST_PARAMS.get("profile"))) || 0;
let glyphTestReplayStartedAt = 0;
const GLYPH_TEST_NAME_SAMPLES = ["BECKY", "MANHE", "JINGXUAN"];
const GLYPH_TEST_STROKE_RATIOS = [0.028, 0.032, 0.036];
const GLYPH_TEST_PROFILE_LABELS = {
  zone1Tall: "zone1Tall",
  zone2Wide: "zone2Wide",
  zone3CompoundU: "zone3CompoundU",
  zone4Core: "zone4Core",
  zone4Half: "zone4Half",
};
const GLYPH_TEST_COLORS = {
  zone1Tall: [62, 62, 58],
  zone2Wide: [156, 78, 58],
  zone3CompoundU: [94, 111, 72],
  zone4Core: [176, 128, 55],
  zone4HalfLeft: [176, 128, 55],
  zone4HalfRight: [82, 103, 126],
};
const GLYPH_TEST_ALPHA_BY_RATIO = {
  "0.028": 150,
  "0.032": 166,
  "0.036": 188,
};

// Source of truth for the A-Z visual alphabet used by the generated square characters.
// Documentation figures read this object directly instead of redrawing the symbols by hand.
const MARKER_GLYPH_PATHS_V2 = {
  A: { strokes: [
    { kind: "polyline", points: [[0.38, 0.86], [0.52, 0.16]] },
    { kind: "line", points: [[0.30, 0.46], [0.76, 0.46]] },
    { kind: "polyline", points: [[0.72, 0.20], [0.70, 0.72], [0.58, 0.84]] },
  ] },
  B: { strokes: [
    { kind: "line", points: [[0.28, 0.14], [0.28, 0.88]] },
    { kind: "polyline", points: [[0.58, 0.18], [0.58, 0.78], [0.48, 0.88]] },
    { kind: "line", points: [[0.28, 0.48], [0.70, 0.48]] },
  ] },
  C: { strokes: [
    { kind: "polyline", points: [[0.72, 0.18], [0.30, 0.18], [0.30, 0.82], [0.70, 0.82]] },
  ] },
  D: { strokes: [
    { kind: "line", points: [[0.32, 0.14], [0.32, 0.86]] },
    { kind: "line", points: [[0.32, 0.16], [0.68, 0.16]] },
    { kind: "polyline", points: [[0.68, 0.16], [0.68, 0.76], [0.60, 0.84]] },
  ] },
  E: { strokes: [
    { kind: "line", points: [[0.30, 0.14], [0.30, 0.86]] },
    { kind: "line", points: [[0.30, 0.22], [0.74, 0.22]] },
    { kind: "line", points: [[0.30, 0.50], [0.66, 0.50]] },
    { kind: "line", points: [[0.30, 0.78], [0.70, 0.78]] },
  ] },
  F: { strokes: [
    { kind: "line", points: [[0.46, 0.12], [0.46, 0.88]] },
    { kind: "line", points: [[0.24, 0.24], [0.78, 0.24]] },
    { kind: "line", points: [[0.32, 0.50], [0.68, 0.50]] },
  ] },
  G: { strokes: [
    { kind: "curve", points: [[0.72, 0.18], [0.42, 0.12], [0.30, 0.34], [0.32, 0.82]] },
    { kind: "polyline", points: [[0.50, 0.18], [0.74, 0.18], [0.74, 0.74]] },
  ] },
  H: { strokes: [
    { kind: "line", points: [[0.28, 0.14], [0.28, 0.86]] },
    { kind: "line", points: [[0.70, 0.16], [0.70, 0.82]] },
    { kind: "line", points: [[0.28, 0.50], [0.70, 0.50]] },
  ] },
  I: { strokes: [
    { kind: "line", points: [[0.50, 0.12], [0.50, 0.88]] },
    { kind: "line", points: [[0.28, 0.26], [0.72, 0.26]] },
    { kind: "line", points: [[0.34, 0.50], [0.68, 0.50]] },
    { kind: "line", points: [[0.30, 0.76], [0.72, 0.76]] },
  ] },
  J: { strokes: [
    { kind: "line", points: [[0.24, 0.24], [0.72, 0.24]] },
    { kind: "curve", points: [[0.66, 0.12], [0.66, 0.62], [0.58, 0.86], [0.34, 0.82]] },
  ] },
  K: { strokes: [
    { kind: "line", points: [[0.30, 0.12], [0.30, 0.88]] },
    { kind: "line", points: [[0.30, 0.48], [0.76, 0.18]] },
    { kind: "line", points: [[0.34, 0.50], [0.78, 0.84]] },
  ] },
  L: { strokes: [
    { kind: "line", points: [[0.30, 0.12], [0.30, 0.88]] },
    { kind: "line", points: [[0.30, 0.88], [0.72, 0.88]] },
  ] },
  M: { strokes: [
    { kind: "line", points: [[0.26, 0.42], [0.78, 0.42]] },
    { kind: "line", points: [[0.34, 0.20], [0.28, 0.78]] },
    { kind: "line", points: [[0.62, 0.20], [0.56, 0.78]] },
  ] },
  N: { strokes: [
    { kind: "line", points: [[0.26, 0.14], [0.26, 0.86]] },
    { kind: "line", points: [[0.26, 0.14], [0.74, 0.84]] },
    { kind: "line", points: [[0.74, 0.18], [0.74, 0.86]] },
  ] },
  O: { strokes: [
    { kind: "polyline", points: [[0.24, 0.14], [0.76, 0.14], [0.76, 0.86], [0.24, 0.86], [0.24, 0.14]] },
  ] },
  P: { strokes: [
    { kind: "line", points: [[0.28, 0.12], [0.28, 0.88]] },
    { kind: "polyline", points: [[0.28, 0.16], [0.72, 0.16], [0.72, 0.54], [0.28, 0.54]] },
  ] },
  Q: { strokes: [
    { kind: "polyline", points: [[0.26, 0.14], [0.74, 0.14], [0.74, 0.78], [0.28, 0.78], [0.28, 0.14]] },
    { kind: "line", points: [[0.54, 0.68], [0.72, 0.90]] },
  ] },
  R: { strokes: [
    { kind: "line", points: [[0.28, 0.12], [0.28, 0.88]] },
    { kind: "polyline", points: [[0.28, 0.16], [0.70, 0.16], [0.70, 0.46], [0.34, 0.46]] },
    { kind: "line", points: [[0.42, 0.48], [0.74, 0.86]] },
  ] },
  S: { strokes: [
    { kind: "curve", points: [[0.72, 0.22], [0.34, 0.18], [0.28, 0.44], [0.62, 0.48]] },
    { kind: "curve", points: [[0.62, 0.48], [0.78, 0.70], [0.54, 0.84], [0.32, 0.80]] },
  ] },
  T: { strokes: [
    { kind: "line", points: [[0.18, 0.26], [0.82, 0.26]] },
    { kind: "line", points: [[0.50, 0.12], [0.50, 0.88]] },
  ] },
  U: { strokes: [
    { kind: "polyline", points: [[0.24, 0.14], [0.24, 0.84], [0.50, 0.90], [0.76, 0.84], [0.76, 0.20]] },
  ] },
  V: { strokes: [
    { kind: "line", points: [[0.24, 0.20], [0.48, 0.86]] },
    { kind: "line", points: [[0.72, 0.20], [0.48, 0.86]] },
  ] },
  W: { strokes: [
    { kind: "line", points: [[0.20, 0.20], [0.36, 0.84]] },
    { kind: "polyline", points: [[0.42, 0.22], [0.50, 0.82], [0.64, 0.62], [0.74, 0.22]] },
  ] },
  X: { strokes: [
    { kind: "line", points: [[0.22, 0.18], [0.76, 0.86]] },
    { kind: "line", points: [[0.74, 0.20], [0.48, 0.56]] },
  ] },
  Y: { strokes: [
    { kind: "line", points: [[0.24, 0.34], [0.62, 0.34]] },
    { kind: "line", points: [[0.54, 0.34], [0.54, 0.88]] },
    { kind: "line", points: [[0.54, 0.56], [0.72, 0.84]] },
  ] },
  Z: { strokes: [
    { kind: "line", points: [[0.22, 0.24], [0.80, 0.24]] },
    { kind: "line", points: [[0.78, 0.24], [0.34, 0.82]] },
    { kind: "line", points: [[0.32, 0.82], [0.54, 0.82]] },
  ] },
};

// Placement rules: 位置仍由 stepIndex 决定，这里只说明各 zone 的铺开意图。
// 真实 SVG/PNG 书法素材以后可按这些 role 替换，不需要改串口或 block 状态。
const zonePlacementRules = {
  zone1: { role: "left main bone", intent: "竖类构件顶天立地，形成左侧骨架" },
  zone2: { role: "top support", intent: "横类构件尽量铺满上部横带" },
  zone3: { role: "middle U structure", intent: "包围、转折、连接沿连续 U 形区展开，避开内核" },
  zone4: { role: "inner closing core", intent: "内核/收口构件吃满红色区域" },
};

const demoSequence = "BODYGRID".split("");

let serialPort;
let serialReader;
let serialConnected = false;
let serialKeepReading = false;
let serialPipeClosed = null;
let lineBuffer = "";
let serialErrorHint = "not connected";
let lastSerialAt = 0;

let connectButton;
let clearButton;
let demoButton;
let debugToggle;
let renderButton;
let menuButton;
let exhibitionMode = EXHIBITION_MODE_DEFAULT;
let controlsExpanded = false;
let debugVisible = false;

let paperLayer;
let currentLetters = [];
let currentComponents = [];
let archiveBlocks = [];
let residueCounter = 0;
let activeComponent = null;
let misreadMark = null;
let demoIndex = 0;

let lastSerialLine = "no serial data";
let lastZones = "none";
let lastLetter = "none";
let statusText = "waiting";
let tabletSocket = null;
let tabletConnectionStatus = "offline";
let lastTabletResultKey = "";
let lastTabletResultAt = 0;
let connectionInfo = {
  tabletUrl: "",
  qrSize: 0,
  qrData: [],
};
let tabletExperience = {
  state: "IDLE",
  data: null,
  features: null,
  glyphDNA: null,
  glyphGroup: null,
  fourZoneDNA: null,
  letters: [],
  receivedAt: 0,
  generatedAt: 0,
  archivedAt: 0,
  resetAt: 0,
  notifiedArchive: false,
};
let glyphExitTransition = {
  active: false,
  startedAt: 0,
  duration: 1760,
  pieces: [],
  stagger: 55,
};

function setup() {
  mainCanvas = createCanvas(windowWidth, windowHeight);
  if (typeof window !== "undefined" && window.MI_ZI_EXHIBITION_PAGE && mainCanvas?.parent) {
    mainCanvas.parent(document.body);
  }
  setupRoughRenderer();
  pixelDensity(1);
  frameRate(60);
  textFont("Georgia");
  makePaperLayer();
  if (GLYPH_TEST_MODE) {
    glyphTestReplayStartedAt = millis();
  } else {
    createControls();
    fetchConnectionInfo();
    setupTabletSocket();
  }
}

function draw() {
  if (GLYPH_TEST_MODE) {
    drawGlyphTestMode();
    return;
  }
  updateTabletExperience();
  background(PALETTE.paper);
  image(paperLayer, 0, 0);
  if (exhibitionMode) {
    drawExhibitionLayout();
  } else {
    drawDevelopmentLayout();
  }
  if (renderMode === "svgPreview") drawSvgStrokePreview();
}

function drawExhibitionLayout() {
  drawPageFrame();
  drawRegistrationMarks();
  // exhibition.html has its own HTML status layer; keep p5 focused on glyph + archive.
  if (!window.MI_ZI_EXHIBITION_PAGE) drawTitle();
  drawGlyphEditor();
  drawArchive();
  if (!window.MI_ZI_EXHIBITION_PAGE) drawExhibitionStatus();
  if (debugVisible) {
    drawSystemLabels();
    drawDebugOverlay();
  }
}

function drawDevelopmentLayout() {
  drawPageFrame();
  drawTitle();
  drawGlyphEditor();
  drawArchive();
  drawSystemLabels();
  drawDebugOverlay();
}

function setupRoughRenderer() {
  if (window.rough && mainCanvas && mainCanvas.elt) {
    roughCanvas = window.rough.canvas(mainCanvas.elt);
  } else {
    roughCanvas = null;
  }
}

function setupTabletSocket() {
  if (!window.io) {
    tabletConnectionStatus = "socket unavailable";
    return;
  }
  tabletSocket = window.io();
  tabletSocket.on("connect", () => {
    tabletConnectionStatus = "connected";
    tabletSocket.emit("screen-ready", { page: window.MI_ZI_EXHIBITION_PAGE ? "exhibition" : "screen", timestamp: Date.now() });
  });
  tabletSocket.on("disconnect", () => {
    tabletConnectionStatus = "offline";
  });
  tabletSocket.on("handwriting-status", (payload) => {
    if (!window.MI_ZI_EXHIBITION_PAGE) handleTabletStatus(payload);
  });
  tabletSocket.on("handwriting-result", (payload) => {
    if (window.MI_ZI_EXHIBITION_PAGE) return;
    handleTabletResult(payload);
  });
  tabletSocket.on("handwriting-received", (data) => {
    console.log("[screen] legacy handwriting-received ignored", {
      submissionId: data?.submissionId || "none",
    });
  });
}

function fetchConnectionInfo() {
  if (!window.fetch) return;
  fetch("/connection-info")
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data) return;
      connectionInfo = {
        tabletUrl: data.tabletUrl || "",
        qrSize: data.qrSize || 0,
        qrData: Array.isArray(data.qrData) ? data.qrData : [],
      };
    })
    .catch(() => {
      connectionInfo = { tabletUrl: "", qrSize: 0, qrData: [] };
    });
}

function cycleRenderMode() {
  const nextIndex = (renderModes.indexOf(renderMode) + 1) % renderModes.length;
  renderMode = renderModes[nextIndex];
  if (renderMode === "rough" && !roughCanvas) {
    statusText = "rough unavailable, clean fallback";
  }
  renderButton.html(renderModeLabel());
}

function renderModeLabel() {
  const effective = renderMode === "rough" && !roughCanvas ? "Clean fallback" : titleCase(renderMode);
  return "Render: " + effective;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupRoughRenderer();
  makePaperLayer();
  if (!GLYPH_TEST_MODE) layoutControls();
}

function createControls() {
  menuButton = createButton("SYSTEM");
  connectButton = createButton("Connect Arduino");
  demoButton = createButton("Demo Input");
  clearButton = createButton("Clear");
  debugToggle = createButton(debugVisible ? "Hide Debug" : "Show Debug");
  renderButton = createButton(renderModeLabel());

  [menuButton, connectButton, demoButton, clearButton, debugToggle, renderButton].forEach((button) => {
    button.style("font-family", "'Courier New', monospace");
    button.style("font-size", "10px");
    button.style("letter-spacing", "0");
    button.style("padding", "6px 10px");
    button.style("height", "28px");
    button.style("background", "rgba(243, 238, 226, 0.46)");
    button.style("border", "1px solid rgba(126, 120, 111, 0.22)");
    button.style("border-radius", "0");
    button.style("color", PALETTE.inkSoft);
    button.style("cursor", "pointer");
    button.style("box-shadow", "none");
    button.style("opacity", "0.42");
  });

  menuButton.style("opacity", "0.62");
  menuButton.mousePressed(() => {
    if (!exhibitionMode) {
      exhibitionMode = true;
      debugVisible = false;
      debugToggle.html("Show Debug");
      controlsExpanded = false;
    } else {
      controlsExpanded = !controlsExpanded;
    }
    layoutControls();
  });
  connectButton.mousePressed(() => (serialConnected ? disconnectSerial() : connectSerial()));
  demoButton.mousePressed(demoInput);
  clearButton.mousePressed(clearWork);
  debugToggle.mousePressed(() => {
    debugVisible = !debugVisible;
    debugToggle.html(debugVisible ? "Hide Debug" : "Show Debug");
  });
  renderButton.mousePressed(cycleRenderMode);

  layoutControls();
}

function layoutControls() {
  const margin = min(width, height) * 0.035;
  const y = margin * 0.62;
  const right = width - margin - 64;
  const showFullControls = !exhibitionMode || controlsExpanded;
  menuButton.position(right, y);

  const buttons = [connectButton, demoButton, clearButton, debugToggle, renderButton];
  const labels = [126, 104, 64, 104, 112];
  let x = right - labels.reduce((sum, item) => sum + item, 0) - 56;
  buttons.forEach((button, index) => {
    button.position(x, y);
    x += labels[index] + 10;
    if (showFullControls) {
      button.show();
      button.style("opacity", exhibitionMode ? "0.36" : "0.82");
    } else {
      button.hide();
    }
  });

  if (exhibitionMode) {
    menuButton.html("SYSTEM");
    menuButton.show();
  } else {
    menuButton.html("EXHIBIT");
    menuButton.show();
  }
}

function makePaperLayer() {
  paperLayer = createGraphics(width, height);
  paperLayer.background(PALETTE.paper);
  paperLayer.noStroke();
  for (let i = 0; i < width * height * 0.00042; i++) {
    const n1 = seededUnit(i, 11);
    const n2 = seededUnit(i, 23);
    const n3 = seededUnit(i, 37);
    const n4 = seededUnit(i, 53);
    paperLayer.fill(86, 70, 48, 3 + n1 * 5);
    paperLayer.rect(n2 * width, n3 * height, 0.35 + n4 * 0.7, 0.35 + n1 * 0.7);
  }
}

function drawPageFrame() {
  const margin = min(width, height) * 0.035;
  noFill();
  stroke(rgba(PALETTE.grid, 72));
  strokeWeight(1);
  rect(margin, margin, width - margin * 2, height - margin * 2);
}

function exhibitionLayoutMetrics() {
  const margin = clamp(min(width, height) * 0.052, 42, 68);
  const top = margin + 74;
  const bottom = height - margin;
  const usableW = width - margin * 2;
  const leftW = usableW * 0.22;
  const centerW = usableW * 0.56;
  const rightW = usableW * 0.22;
  const gutter = clamp(usableW * 0.024, 24, 38);
  const leftX = margin + 18;
  const centerX = margin + leftW + gutter * 0.5;
  const rightX = margin + leftW + centerW + gutter;
  return {
    margin,
    top,
    bottom,
    leftX,
    leftY: top,
    leftW: leftW - gutter * 0.5,
    centerX,
    centerY: top,
    centerW: centerW - gutter,
    stageH: bottom - top,
    rightX,
    rightY: top + 14,
    rightW: rightW - gutter * 0.5,
    rightH: bottom - top - 20,
  };
}

function drawRegistrationMarks() {
  const m = min(width, height) * 0.035;
  const len = 18;
  stroke(rgba(PALETTE.grid, 58));
  strokeWeight(1);
  noFill();
  line(m, m + len, m, m);
  line(m, m, m + len, m);
  line(width - m - len, m, width - m, m);
  line(width - m, m, width - m, m + len);
  line(m, height - m - len, m, height - m);
  line(m, height - m, m + len, height - m);
  line(width - m - len, height - m, width - m, height - m);
  line(width - m, height - m - len, width - m, height - m);
}

function drawTitle() {
  const layout = exhibitionLayoutMetrics();
  const x = exhibitionMode ? layout.leftX : min(width, height) * 0.035 + 22;
  const y = exhibitionMode ? layout.leftY : min(width, height) * 0.035 + 86;
  noStroke();
  fill(PALETTE.ink);
  textFont("Georgia");
  textSize(exhibitionMode ? clamp(width * 0.033, 40, 52) : clamp(width * 0.028, 28, 44));
  text("Name Translator", x, y);
  textSize(clamp(width * 0.011, 13, 17));
  fill(rgba(PALETTE.greyText, 220));
  text("modular body-input pseudo-character tool", x + 2, y + 30);

  textFont("Courier New");
  textSize(exhibitionMode ? 12 : 11);
  fill(rgba(PALETTE.cinnabar, 210));
  text("SCAN STATUS: " + scanStatusLabel(), x + 2, y + 58);
  textFont("Georgia");
}

function editorMetrics() {
  if (exhibitionMode) {
    const layout = exhibitionLayoutMetrics();
    const side = min(layout.centerW * 0.94, layout.stageH * 0.82, 760);
    return {
      side,
      x: layout.centerX + layout.centerW * 0.48 - side / 2,
      y: layout.centerY + layout.stageH * 0.49 - side / 2,
    };
  }
  const side = min(width * 0.49, height * 0.72, 620);
  return {
    side,
    x: width * 0.5 - side * 0.54,
    y: height * 0.5 - side * 0.47,
  };
}

function scanStatusLabel() {
  if (tabletExperience.state === "WRITING_RECEIVED") return "HANDWRITING RECEIVED";
  if (tabletExperience.state === "RECOGNISING") return "RECOGNISING";
  if (tabletExperience.state === "TRACE_HOLD") return "TRACE HOLD";
  if (tabletExperience.state === "TRACE_FADE") return "TRACE FADE";
  if (tabletExperience.state === "GENERATING") return "GENERATING";
  if (tabletExperience.state === "ARCHIVED") return "ARCHIVED";
  if (tabletExperience.state === "UNREADABLE") return "MISREAD";
  if (tabletExperience.state === "RESET") return "RESET";
  const s = statusText.toLowerCase();
  if (s.includes("misread") || s.includes("invalid")) return "MISREAD";
  if (s.includes("archived")) return "ARCHIVED";
  if (activeComponent || currentLetters.length > 0) return "COLLECTING";
  if (serialConnected) return "WAITING";
  return "WAITING";
}

function exhibitionInstructionLines() {
  if (tabletExperience.state === "WRITING_RECEIVED") return ["HANDWRITING RECEIVED", "PREPARING TRACE SCAN"];
  if (tabletExperience.state === "RECOGNISING") return ["RECOGNISING...", "WAITING FOR GEMINI RESULT"];
  if (tabletExperience.state === "TRACE_HOLD") return ["TRANSLATING NAME RESIDUE", "TRACE HELD AS TEMPORARY LAYER"];
  if (tabletExperience.state === "TRACE_FADE") return ["TRANSLATING NAME RESIDUE", "RAW TRACE FADING OUT"];
  if (tabletExperience.state === "GENERATING") return ["GENERATING MI ZI RESIDUE", "WRITING MACHINE ACTIVE"];
  if (tabletExperience.state === "ARCHIVED") return ["RESIDUE ARCHIVED", "STORED AS TRACE"];
  if (tabletExperience.state === "UNREADABLE") return ["UNREADABLE TRACE", "WRITE THE COMPLETE WORD AGAIN"];
  if (tabletExperience.state === "RESET") return ["READY FOR NEXT VISITOR", "ARCHIVE REMAINS"];
  const s = scanStatusLabel();
  if (s === "MISREAD") return ["MISREAD / TRY AGAIN", "RECALIBRATE BODY INPUT"];
  if (s === "ARCHIVED") return ["RESIDUE ARCHIVED", "STORED AS TRACE"];
  const step = currentLetters.length + (activeComponent ? 1 : 0);
  if (step <= 0) return ["PLACE YOUR FEET ON THE GRID", "BEGIN TRANSLATION"];
  const names = ["LEFT STRUCTURE", "UPPER STROKE", "OUTER FRAME", "INNER RESIDUE"];
  return ["INPUT " + constrain(step, 1, 4) + " / 4", names[constrain(step - 1, 0, 3)]];
}

function drawExhibitionStatus() {
  const layout = exhibitionLayoutMetrics();
  const lines = exhibitionInstructionLines();
  const x = layout.leftX + 2;
  const y = layout.leftY + 128;

  noStroke();
  textFont("Courier New");
  textSize(14);
  fill(rgba(PALETTE.ink, 205));
  text(lines[0], x, y);
  textSize(12);
  fill(rgba(PALETTE.greyText, 180));
  text(lines[1], x, y + 27);

  textSize(10);
  fill(rgba(PALETTE.greyText, 132));
  const activeGroup = tabletExperience.glyphGroup;
  if (activeGroup?.glyphs?.length) {
    text("WORD: " + activeGroup.recognisedWord, x, y + 74);
    text("GROUPS: " + activeGroup.groups.map((letters) => letters.join("")).join(" / "), x, y + 94);
  } else {
    text("BLOCK " + (archiveBlocks.length + 1) + " / " + currentLetters.length + "-4", x, y + 74);
  }
  if (lastLetter !== "none" && !activeGroup?.glyphs?.length) text("RECEIVED: " + lastLetter, x, y + 94);
  if (inputMode === "nameHandwriting" || inputMode === "tabletWriting") text("TABLET: " + tabletConnectionStatus.toUpperCase(), x, y + 114);
  if (statusText.toLowerCase().includes("archived")) text("ARCHIVED: " + archiveBlocks[0]?.name, x, y + 134);
  drawRecognitionStatus(x, y + 154);
  drawGlyphGroupStatus(x, y + 236);
  drawIdleQRCode(layout, y + 292);
  textFont("Georgia");
}

function drawRecognitionStatus(x, y) {
  const info = recognitionDisplayInfo();
  noStroke();
  textFont("Courier New");
  textSize(10);
  fill(rgba(PALETTE.greyText, 146));
  text(info.label, x, y);

  textFont(info.value === "RECOGNISING..." ? "Courier New" : "Georgia");
  textSize(info.value.length > 14 ? 18 : 23);
  fill(rgba(info.isFallback ? PALETTE.greyText : PALETTE.ink, info.isFallback ? 150 : 212));
  text(info.value, x, y + 29);

  if (info.confidenceLabel) {
    textFont("Courier New");
    textSize(10);
    fill(rgba(PALETTE.cinnabar, 166));
    text("CONFIDENCE", x, y + 55);
    fill(rgba(PALETTE.greyText, 164));
    text(info.confidenceLabel, x, y + 72);
  }
}

function recognitionDisplayInfo() {
  if (tabletExperience.state === "WRITING_RECEIVED" || tabletExperience.state === "RECOGNISING") {
    return { label: "RECOGNISED WORD", value: "RECOGNISING...", confidenceLabel: "", isFallback: false };
  }
  const group = tabletExperience.glyphGroup || archiveBlocks[0]?.glyphGroup || null;
  const recognition = tabletExperience.features?.recognition || group || tabletExperience.glyphDNA || archiveBlocks[0]?.glyphDNA || null;
  const fullText = group?.recognisedWord || recognition?.fullText || recognition?.recognitionFullText || recognition?.nameText || "";
  const confidence = recognition?.confidence ?? recognition?.recognitionConfidence ?? 0;
  const candidates = recognition?.candidates || recognition?.recognitionCandidates || [];
  if (cleanRecognisedWord(fullText).length >= 2 && confidence >= 0.55) {
    return { label: "RECOGNISED WORD", value: cleanRecognisedWord(fullText), confidenceLabel: floor(confidence * 100) + "%", isFallback: false };
  }
  if (cleanRecognisedWord(fullText).length >= 2 && candidates.length) {
    return { label: "UNCERTAIN READING", value: candidates.map(cleanRecognisedWord).filter((w) => w.length >= 2).slice(0, 2).join(" / "), confidenceLabel: floor(confidence * 100) + "%", isFallback: false };
  }
  if (tabletExperience.features || tabletExperience.glyphDNA) {
    return { label: "UNREADABLE TRACE", value: "PLEASE WRITE AGAIN", confidenceLabel: "", isFallback: true };
  }
  return { label: "UNREADABLE TRACE", value: "PLEASE WRITE AGAIN", confidenceLabel: "", isFallback: true };
}

function drawGlyphGroupStatus(x, y) {
  const group = tabletExperience.glyphGroup || archiveBlocks[0]?.glyphGroup || null;
  if (!group || !group.glyphs?.length) return;
  noStroke();
  textFont("Courier New");
  textSize(10);
  fill(rgba(PALETTE.greyText, 146));
  text("GLYPH GROUPS", x, y);
  fill(rgba(PALETTE.ink, 190));
  text((group.groups || []).map((letters) => letters.join("")).join(" / "), x, y + 18);
  fill(rgba(PALETTE.greyText, 146));
  text("GROUP COUNT  " + group.glyphs.length, x, y + 36);
}

function drawIdleQRCode(layout, y) {
  if (!isIdleForQRCode()) return;
  const size = min(layout.leftW * 0.58, 138);
  const x = layout.leftX + 2;
  noStroke();
  fill(rgba(PALETTE.ink, 210));
  textFont("Courier New");
  textSize(11);
  text("SCAN TO WRITE YOUR NAME", x, y);
  fill(rgba(PALETTE.greyText, 150));
  textSize(9);
  text("Your handwriting will be translated", x, y + size + 34);
  text("into a name residue.", x, y + size + 48);

  const qx = x;
  const qy = y + 18;
  fill(rgba(PALETTE.paperDeep, 130));
  rect(qx - 8, qy - 8, size + 16, size + 16);
  drawQRCodeMatrix(qx, qy, size);

  if (connectionInfo.tabletUrl) {
    fill(rgba(PALETTE.greyText, 142));
    textSize(8);
    text(connectionInfo.tabletUrl, x, y + size + 66);
  }
}

function isIdleForQRCode() {
  return tabletExperience.state === "IDLE" && currentLetters.length === 0 && !activeComponent;
}

function drawQRCodeMatrix(x, y, size) {
  if (!connectionInfo.qrSize || !connectionInfo.qrData.length) {
    noFill();
    stroke(rgba(PALETTE.grid, 125));
    rect(x, y, size, size);
    noStroke();
    fill(rgba(PALETTE.greyText, 150));
    textFont("Courier New");
    textSize(9);
    text("QR pending", x + 12, y + size / 2);
    return;
  }

  const modules = connectionInfo.qrSize;
  const cell = size / modules;
  noStroke();
  fill(PALETTE.paper);
  rect(x, y, size, size);
  fill(PALETTE.ink);
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (connectionInfo.qrData[row * modules + col]) {
        rect(x + col * cell, y + row * cell, ceil(cell), ceil(cell));
      }
    }
  }
}

function drawGlyphEditor() {
  const g = editorMetrics();
  const group = tabletExperience.glyphGroup;
  if (group && glyphExitTransition.active) {
    drawGlyphExitTransition();
    return;
  }
  if (group && ["GENERATING", "ARCHIVED", "RESET"].includes(tabletExperience.state)) {
    drawGlyphGroup(group, { x: g.x, y: g.y, w: g.side, h: g.side }, glyphGroupRevealProgress(group), { showDebug: debugVisible });
    return;
  }
  drawFrameworkGrid(g.x, g.y, g.side, 1);
  drawTabletHandwritingOverlay(g.x, g.y, g.side);
  drawCurrentBlockGlyph(g.x, g.y, g.side);

  if (misreadMark) {
    drawMisreadFeedback(g.x, g.y, g.side);
  }

  if (!exhibitionMode || debugVisible) {
    noStroke();
    fill(rgba(PALETTE.greyText, 185));
    textFont("Courier New");
    textSize(11);
    textAlign(CENTER);
    text(
      "BLOCK " + (archiveBlocks.length + 1) + " / " + blockNamePreview() + " / " + currentLetters.length + "-4",
      g.x + g.side / 2,
      g.y + g.side + 34
    );
    textAlign(LEFT);
    textFont("Georgia");
  }
}

function drawTabletHandwritingOverlay(x, y, side) {
  const data = tabletExperience.data;
  if (!data) return;
  const hasStrokes = Array.isArray(data.strokes) && data.strokes.some((stroke) => stroke?.length);
  const traceImage = tabletExperience.traceImage;
  if (!hasStrokes && !traceImage) return;
  const age = millis() - tabletExperience.receivedAt;
  const reveal = constrain(age / 700, 0, 1);
  if (!["WRITING_RECEIVED", "RECOGNISING", "TRACE_HOLD", "TRACE_FADE"].includes(tabletExperience.state)) return;
  const fade = tabletExperience.state === "TRACE_FADE"
    ? constrain(1 - (age - 700) / 1900, 0, 1)
    : 1;
  const alpha = 118 * reveal * fade;
  if (alpha <= 1) return;

  const sourceW = max(1, data.width || 1);
  const sourceH = max(1, data.height || 1);
  const scale = min(side * 0.68 / sourceW, side * 0.68 / sourceH);
  const ox = x + side / 2 - (sourceW * scale) / 2;
  const oy = y + side / 2 - (sourceH * scale) / 2;

  push();
  if (hasStrokes) {
    noFill();
    stroke(rgba(PALETTE.inkSoft, alpha));
    strokeWeight(max(1.2, side * 0.006));
    strokeCap(ROUND);
    strokeJoin(ROUND);
    for (const strokeData of data.strokes) {
      const visibleCount = max(2, floor(strokeData.length * reveal));
      beginShape();
      for (let i = 0; i < visibleCount; i++) {
        const pt = strokeData[i];
        vertex(ox + pt.x * scale, oy + pt.y * scale);
      }
      endShape();
    }
  } else if (traceImage?.width && traceImage?.height) {
    imageMode(CORNER);
    tint(255, alpha);
    image(traceImage, ox, oy, sourceW * scale, sourceH * scale);
    noTint();
  }

  if (tabletExperience.state === "TRACE_HOLD" || tabletExperience.state === "TRACE_FADE") {
    const scanY = y + side * constrain((age - 160) / 2500, 0, 1);
    stroke(rgba(PALETTE.cinnabar, 92 * fade));
    strokeWeight(1);
    line(x + side * 0.12, scanY, x + side * 0.88, scanY);
  }
  pop();
}

function drawFrameworkGrid(x, y, side, alphaScale = 1, options = {}) {
  const showDebugZones = options.showDebugZones ?? debugVisible;
  const showArrows = options.showArrows ?? debugVisible;
  const showAnchors = options.showAnchors ?? false;
  const quietScale = showDebugZones ? 1 : 0.72;

  push();
  translate(x, y);
  noFill();
  stroke(rgba(PALETTE.grid, 150 * alphaScale * quietScale));
  strokeWeight(1.2);
  rect(0, 0, side, side);

  const cells = 4;
  stroke(rgba(PALETTE.gridSoft, 62 * alphaScale * quietScale));
  strokeWeight(0.8);
  for (let i = 1; i < cells; i++) {
    const p = (side * i) / cells;
    line(p, 0, p, side);
    line(0, p, side, p);
  }

  stroke(rgba(PALETTE.grid, 118 * alphaScale * quietScale));
  strokeWeight(1);
  line(side / 2, 0, side / 2, side);
  line(0, side / 2, side, side / 2);
  line(0, 0, side, side);
  line(side, 0, 0, side);

  // Triangular subdivision. This is the main GridType-like construction layer.
  stroke(rgba(PALETTE.gridSoft, 54 * alphaScale * quietScale));
  strokeWeight(0.75);
  const step = side / cells;
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const cx = gx * step;
      const cy = gy * step;
      line(cx, cy, cx + step, cy + step);
      line(cx + step, cy, cx, cy + step);
    }
  }

  if (showDebugZones) {
    stroke(rgba(PALETTE.cinnabar, 48 * alphaScale));
    drawingContext.setLineDash([6, 7]);
    rect(side * 0.16, side * 0.16, side * 0.68, side * 0.68);
    drawingContext.setLineDash([]);
  }

  if (showDebugZones) drawFixedZoneDebug(0, 0, side, showArrows);
  if (showAnchors) drawAnchorDebug(side);
  pop();
}

function drawFixedZoneDebug(squareX, squareY, squareSize, showArrows = true) {
  drawRectZone(fixedWritingZones.zone1, squareX, squareY, squareSize, DEBUG_COLORS.zone1);
  drawRectZone(fixedWritingZones.zone2, squareX, squareY, squareSize, DEBUG_COLORS.zone2);
  drawCompoundUZone(fixedWritingZones.zone3, squareX, squareY, squareSize, DEBUG_COLORS.zone3);
  drawRectZone(fixedWritingZones.zone4, squareX, squareY, squareSize, DEBUG_COLORS.zone4);

  if (showArrows) drawWritingOrderArrows(squareX, squareY, squareSize);
}

function drawRectZone(zone, squareX, squareY, squareSize, col, alpha = 150) {
  const x = squareX + zone.x * squareSize;
  const y = squareY + zone.y * squareSize;
  const w = zone.w * squareSize;
  const h = zone.h * squareSize;

  push();
  noFill();
  stroke(col[0], col[1], col[2], alpha);
  strokeWeight(1.25);
  rect(x, y, w, h);
  pop();
}

function drawCompoundUZone(zone, squareX, squareY, squareSize, col, alpha = 150) {
  const o = zone.outer;
  const c = zone.innerCutout;

  const ox = squareX + o.x * squareSize;
  const oy = squareY + o.y * squareSize;
  const ow = o.w * squareSize;
  const oh = o.h * squareSize;

  const cx = squareX + c.x * squareSize;
  const cy = squareY + c.y * squareSize;
  const cw = c.w * squareSize;

  push();
  noFill();
  stroke(col[0], col[1], col[2], alpha);
  strokeWeight(1.25);
  strokeJoin(MITER);

  beginShape();
  vertex(ox, oy);
  vertex(ox + ow, oy);
  vertex(ox + ow, oy + oh);
  vertex(cx + cw, oy + oh);
  vertex(cx + cw, cy);
  vertex(cx, cy);
  vertex(cx, oy + oh);
  vertex(ox, oy + oh);
  vertex(ox, oy);
  endShape();

  pop();
}

function getCompoundUParts(zone) {
  const outer = zone.outer;
  const inner = zone.innerCutout;
  return [
    { name: "left_leg", x: outer.x, y: outer.y, w: inner.x - outer.x, h: outer.h },
    { name: "top_bar", x: outer.x, y: outer.y, w: outer.w, h: inner.y - outer.y },
    { name: "right_leg", x: inner.x + inner.w, y: outer.y, w: outer.x + outer.w - (inner.x + inner.w), h: outer.h },
  ];
}

function drawWritingOrderArrows(squareX, squareY, squareSize) {
  push();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  noFill();

  const z1 = fixedWritingZones.zone1;
  const z2 = fixedWritingZones.zone2;
  const z3 = fixedWritingZones.zone3;
  const z4 = fixedWritingZones.zone4;

  // Guidance arrows only: low alpha, thin, and subordinate to the glyph.
  drawSoftArrow(
    squareX + (z1.x + z1.w * 0.52) * squareSize,
    squareY + (z1.y + z1.h * 0.18) * squareSize,
    squareX + (z1.x + z1.w * 0.52) * squareSize,
    squareY + (z1.y + z1.h * 0.78) * squareSize,
    [...DEBUG_COLORS.zone1, 92],
    squareSize
  );

  drawSoftArrow(
    squareX + (z2.x + z2.w * 0.12) * squareSize,
    squareY + (z2.y + z2.h * 0.52) * squareSize,
    squareX + (z2.x + z2.w * 0.88) * squareSize,
    squareY + (z2.y + z2.h * 0.52) * squareSize,
    [...DEBUG_COLORS.zone2, 86],
    squareSize
  );

  const [left, top, right] = getCompoundUParts(z3);
  if (left && top && right) {
    drawSoftArrow(
      squareX + (top.x + top.w * 0.13) * squareSize,
      squareY + (top.y + top.h * 0.5) * squareSize,
      squareX + (top.x + top.w * 0.86) * squareSize,
      squareY + (top.y + top.h * 0.5) * squareSize,
      [...DEBUG_COLORS.zone3, 76],
      squareSize
    );
    drawSoftArrow(
      squareX + (left.x + left.w * 0.48) * squareSize,
      squareY + (left.y + left.h * 0.16) * squareSize,
      squareX + (left.x + left.w * 0.48) * squareSize,
      squareY + (left.y + left.h * 0.78) * squareSize,
      [...DEBUG_COLORS.zone3, 72],
      squareSize
    );
    drawSoftArrow(
      squareX + (right.x + right.w * 0.52) * squareSize,
      squareY + (right.y + right.h * 0.16) * squareSize,
      squareX + (right.x + right.w * 0.52) * squareSize,
      squareY + (right.y + right.h * 0.78) * squareSize,
      [...DEBUG_COLORS.zone3, 72],
      squareSize
    );
  }

  const cy = squareY + (z4.y + z4.h * 0.35) * squareSize;
  drawSoftArrow(
    squareX + (z4.x + z4.w * 0.08) * squareSize,
    cy,
    squareX + (z4.x + z4.w * 0.22) * squareSize,
    cy,
    [...DEBUG_COLORS.zone4, 88],
    squareSize
  );
  drawSoftArrow(
    squareX + (z4.x + z4.w * 0.92) * squareSize,
    cy,
    squareX + (z4.x + z4.w * 0.78) * squareSize,
    cy,
    [...DEBUG_COLORS.zone4, 88],
    squareSize
  );

  pop();
}

function drawSoftArrow(x1, y1, x2, y2, col, side) {
  if (Array.isArray(col)) stroke(col[0], col[1], col[2], col[3] ?? 95);
  else stroke(col);
  strokeWeight(max(1, side * 0.0022));
  line(x1, y1, x2, y2);

  const angle = atan2(y2 - y1, x2 - x1);
  const len = max(5, side * 0.018);
  const spread = PI / 7;
  line(x2, y2, x2 - cos(angle - spread) * len, y2 - sin(angle - spread) * len);
  line(x2, y2, x2 - cos(angle + spread) * len, y2 - sin(angle + spread) * len);
}

function drawAnchorDebug(side) {
  noStroke();
  fill(rgba(PALETTE.red, 145));
  for (const anchor of Object.values(frameworkAnchors)) {
    circle(anchor.x * side, anchor.y * side, side * 0.012);
  }
}

// 绘制当前正在生成的方块字
function drawCurrentBlockGlyph(x, y, side) {
  for (const component of buildCurrentBlockVisual()) {
    drawComponent(component, x, y, side, 1, false);
  }

  if (activeComponent) {
    const p = constrain((millis() - activeComponent.started) / activeComponent.duration, 0, 1);
    drawComponent(activeComponent.component, x, y, side, easeInOutCubic(p), false);
    if (p >= 1) {
      currentComponents.push(activeComponent.component);
      currentLetters.push(activeComponent.component.letter);
      activeComponent = null;
      if (currentLetters.length >= 4) archiveCurrentBlock();
      else statusText = "waiting for component " + (currentLetters.length + 1) + "/4";
    }
  }
}

function glyphGroupRevealProgress(group) {
  if (!group || tabletExperience.state !== "GENERATING") return 1;
  const elapsed = millis() - tabletExperience.generatedAt;
  return constrain(elapsed / glyphGroupRevealDuration(group), 0, 1);
}

function glyphGroupRevealDuration(group) {
  const glyphs = group?.glyphs || [];
  const stepCount = glyphs.reduce((sum, glyph) => sum + glyphStepCount(glyph), 0) || 1;
  return stepCount * 360 + max(0, glyphs.length - 1) * 500;
}

function glyphStepCount(glyph) {
  return glyph?.items?.length || glyph?.letters?.length || [glyph?.zone1, glyph?.zone2, glyph?.zone3, glyph?.zone4].filter(Boolean).length || 1;
}

function drawGlyphGroup(glyphGroup, bounds, reveal = 1, options = {}) {
  const glyphs = glyphGroup?.glyphs || [];
  if (!glyphs.length) return;
  const count = glyphs.length;
  const gap = bounds.w * 0.065;
  const itemSize = min(bounds.h, (bounds.w - gap * (count - 1)) / count) * 0.9;
  const totalWidth = itemSize * count + gap * (count - 1);
  const startX = bounds.x + (bounds.w - totalWidth) / 2;
  const startY = bounds.y + (bounds.h - itemSize) / 2;
  const stepCounts = glyphs.map(glyphStepCount);
  const totalSteps = stepCounts.reduce((sum, steps) => sum + steps, 0) || 1;
  let stepOffset = 0;

  for (let i = 0; i < count; i++) {
    const x = startX + i * (itemSize + gap);
    drawFrameworkGrid(x, startY, itemSize, 1, {
      showDebugZones: !!options.showDebug,
      showArrows: !!options.showDebug,
      showAnchors: !!options.showDebug,
    });
    drawGlyphGroupItem(glyphs[i], x, startY, itemSize, reveal, stepOffset, totalSteps);
    stepOffset += stepCounts[i];
  }
}

function drawGlyphGroupItem(fourZoneDNA, x, y, size, reveal = 1, stepOffset = 0, totalSteps = 4) {
  const items = fourZoneDNA.items || [fourZoneDNA.zone1, fourZoneDNA.zone2, fourZoneDNA.zone3, fourZoneDNA.zone4].filter(Boolean);
  const groupLength = items.length || 4;

  for (let i = 0; i < items.length; i++) {
    const zoneReveal = zoneRevealProgress(reveal, stepOffset + i, totalSteps);
    if (items[i] && zoneReveal > 0) {
      drawMarkerGlyphComponentInGroup(items[i], i, groupLength, x, y, size, easeInOutCubic(zoneReveal));
    }
  }
}

function markerSlotForGlyphItem(index, groupLength) {
  return glyphTestSlotForIndex(index, groupLength);
}

function drawMarkerGlyphComponentInGroup(componentDNA, itemIndex, groupLength, x, y, size, reveal = 1) {
  if (!componentDNA?.letter) return;
  const slot = markerSlotForGlyphItem(itemIndex, groupLength);
  drawMarkerGlyphInTile(
    componentDNA.letter,
    slot.profile,
    x,
    y,
    size,
    MARKER_FORMAL_STROKE_RATIO,
    reveal,
    slot.colorKey,
    slot.half
  );
}

function markerSlotCenterInTile(slot, gx, gy, side) {
  const strokeW = max(1, side * MARKER_FORMAL_STROKE_RATIO);
  if (slot.profile === "zone3CompoundU") {
    const z = fixedWritingZones.zone3.outer;
    return {
      x: gx + (z.x + z.w * 0.5) * side,
      y: gy + (z.y + z.h * 0.5) * side,
    };
  }
  const rect = glyphTestRectForProfile(slot.profile, gx, gy, side, strokeW, slot.half);
  return {
    x: rect.x + rect.w * 0.5,
    y: rect.y + rect.h * 0.5,
  };
}

function createGlyphExitPieces(glyphGroup, bounds) {
  const glyphs = glyphGroup?.glyphs || [];
  if (!glyphs.length) return [];
  const count = glyphs.length;
  const gap = bounds.w * 0.065;
  const itemSize = min(bounds.h, (bounds.w - gap * (count - 1)) / count) * 0.9;
  const totalWidth = itemSize * count + gap * (count - 1);
  const startX = bounds.x + (bounds.w - totalWidth) / 2;
  const startY = bounds.y + (bounds.h - itemSize) / 2;
  const pieces = [];

  for (let glyphIndex = 0; glyphIndex < count; glyphIndex++) {
    const glyph = glyphs[glyphIndex];
    const items = glyph.items || [glyph.zone1, glyph.zone2, glyph.zone3, glyph.zone4].filter(Boolean);
    const groupLength = items.length || 4;
    const x = startX + glyphIndex * (itemSize + gap);
    for (let zoneIndex = 0; zoneIndex < items.length; zoneIndex++) {
      const item = items[zoneIndex];
      if (!item) continue;
      const slot = markerSlotForGlyphItem(zoneIndex, groupLength);
      const center = markerSlotCenterInTile(slot, x, startY, itemSize);
      const index = pieces.length;
      pieces.push({
        item,
        slotIndex: zoneIndex,
        groupLength,
        x,
        y: startY,
        size: itemSize,
        centerX: center.x,
        centerY: center.y,
        drift: stableSignedNoise(index, 0.20),
        rotation: stableSignedNoise(index + 17, radians(8)),
        index,
      });
    }
  }
  return pieces;
}

function startGlyphExitTransition(options = {}) {
  const group = tabletExperience.glyphGroup;
  if (!group?.glyphs?.length) return false;
  const g = editorMetrics();
  const pieces = createGlyphExitPieces(group, { x: g.x, y: g.y, w: g.side, h: g.side });
  if (!pieces.length) return false;
  const duration = max(900, Number(options.duration) || 1760);
  glyphExitTransition = {
    active: true,
    startedAt: millis(),
    duration,
    pieces,
    stagger: pieces.length > 1 ? min(70, 820 / (pieces.length - 1)) : 0,
  };
  return true;
}

function drawGlyphExitTransition() {
  const transition = glyphExitTransition;
  const elapsed = millis() - transition.startedAt;
  const releaseHold = 150;
  const baseFallSpan = max(620, transition.duration - releaseHold - transition.stagger * max(0, transition.pieces.length - 1));

  for (const piece of transition.pieces) {
    const delay = releaseHold + piece.index * transition.stagger;
    const localT = constrain((elapsed - delay) / baseFallSpan, 0, 1);
    const settled = elapsed < delay;
    const eased = easeInOutCubic(localT);
    const fall = piece.size * (0.04 * eased + 1.78 * localT * localT);
    const drift = piece.drift * piece.size * localT;
    const rot = piece.rotation * eased;
    const opacity = settled || localT < 0.74 ? 1 : constrain(1 - (localT - 0.74) / 0.26, 0, 1);
    if (opacity <= 0.01) continue;

    push();
    drawingContext.save();
    drawingContext.globalAlpha = opacity;
    translate(piece.centerX + drift, piece.centerY + fall);
    rotate(rot);
    translate(-piece.centerX, -piece.centerY);
    drawMarkerGlyphComponentInGroup(piece.item, piece.slotIndex, piece.groupLength, piece.x, piece.y, piece.size, 1);
    drawingContext.restore();
    pop();
  }

  if (elapsed > transition.duration + 260) {
    glyphExitTransition.active = false;
  }
}

function stableSignedNoise(index, amplitude) {
  const n = sin((index + 1) * 12.9898 + 78.233) * 43758.5453;
  return (n - floor(n) - 0.5) * 2 * amplitude;
}

window.MiZiGlyphExit = {
  start: startGlyphExitTransition,
  cancel() {
    glyphExitTransition.active = false;
    glyphExitTransition.pieces = [];
  },
  isActive() {
    return glyphExitTransition.active;
  },
};

function zoneRevealProgress(reveal, stepIndex, totalSteps) {
  const step = 1 / max(1, totalSteps);
  return constrain((reveal - step * stepIndex) / (step * 0.88), 0, 1);
}

function drawLetterComponentInZone(componentDNA, zone, x, y, size, reveal = 1) {
  const component = {
    letter: componentDNA.letter,
    zones: "word-group",
    type: componentDNA.componentType,
    stepIndex: zone.step - 1,
    zoneKey: "zone" + zone.step,
    zone,
    role: zone.name,
    fitted: fitComponentToZone(componentDNA.componentType, zone),
    weight: componentDNA.weight || (zone.type === "compoundU" ? 0.9 : 1),
  };
  drawComponent(component, x, y, size, reveal, false);
}

function buildCurrentBlockVisual() {
  return currentComponents.slice();
}

function drawComponent(component, gx, gy, side, progress, ghost) {
  if (component.zone && component.zone.type === "compoundU") {
    drawComponentInCompoundZone(component.type, component.zone, progress, component.weight, gx, gy, side, ghost);
    return;
  }

  drawComponentInRectZone(component.type, component.zone, progress, component.weight, gx, gy, side, ghost, component.fitted);
}

function drawFinalOutputLetterComponent(component, gx, gy, side, progress, ghost) {
  const paths = FINAL_OUTPUT_GLYPH_PATHS[component?.letter];
  if (!paths || !component?.zone) return false;

  const b = getFinalOutputGlyphBounds(component.zone, component.type, gx, gy, side);
  if (!b) return false;
  const strokeW = constrain(side * 0.018, 3, 5);

  push();
  stroke(ghost ? rgba(PALETTE.ink, 95) : PALETTE.ink);
  strokeWeight(strokeW);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  noFill();
  drawFinalOutputGlyphPaths({ ...b, p: progress, weight: strokeW, letter: component.letter }, paths);
  pop();
  return true;
}

function getFinalOutputGlyphBounds(zone, componentType, gx, gy, side) {
  if (zone.type === "compoundU") {
    const geom = getCompoundUSafeBounds(zone, gx, gy, side);
    const pad = min(geom.ow, geom.oh) * 0.14;
    return {
      x: geom.ox + pad,
      y: geom.oy + pad,
      w: max(1, geom.ow - pad * 2),
      h: max(1, geom.oh - pad * 2),
      left: geom.ox + pad,
      right: geom.ox + geom.ow - pad,
      top: geom.oy + pad,
      bottom: geom.oy + geom.oh - pad,
      cx: geom.ox + geom.ow / 2,
      cy: geom.oy + geom.oh / 2,
    };
  }

  const rawBounds = getZoneSafeBounds(zone, gx, gy, side, 0);
  const pad = min(rawBounds.w, rawBounds.h) * 0.14;
  return {
    x: rawBounds.x + pad,
    y: rawBounds.y + pad,
    w: max(1, rawBounds.w - pad * 2),
    h: max(1, rawBounds.h - pad * 2),
    left: rawBounds.x + pad,
    right: rawBounds.x + rawBounds.w - pad,
    top: rawBounds.y + pad,
    bottom: rawBounds.y + rawBounds.h - pad,
    cx: rawBounds.x + rawBounds.w / 2,
    cy: rawBounds.y + rawBounds.h / 2,
  };
}

function drawFinalOutputGlyphPaths(ctx, paths) {
  const raw = getFinalOutputRawBounds(paths);
  if (!raw) return;

  const scale = min(ctx.w / raw.w, ctx.h / raw.h);
  const drawW = raw.w * scale;
  const drawH = raw.h * scale;
  const ox = ctx.x + (ctx.w - drawW) / 2 - raw.minX * scale;
  const oy = ctx.y + (ctx.h - drawH) / 2 - raw.minY * scale;
  const jitterAmp = min(ctx.w, ctx.h) * 0.004;
  const per = 1 / paths.length;

  for (let i = 0; i < paths.length; i++) {
    const local = constrain((ctx.p - i * per) / per, 0, 1);
    if (local <= 0) continue;
    const fitted = paths[i].map(([x, y], pointIndex) => {
      const jitter = finalOutputPointJitter(ctx.letter, i, pointIndex, jitterAmp);
      return {
        x: ox + x * scale + jitter.x,
        y: oy + y * scale + jitter.y,
      };
    });
    drawFinalOutputSingleStroke(fitted, easeInOutCubic(local));
  }
}

function getFinalOutputRawBounds(paths) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const [x, y] of path) {
      minX = min(minX, x);
      minY = min(minY, y);
      maxX = max(maxX, x);
      maxY = max(maxY, y);
    }
  }
  if (!isFinite(minX) || !isFinite(minY) || maxX <= minX || maxY <= minY) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function finalOutputPointJitter(letter, pathIndex, pointIndex, amp) {
  const code = (letter || "A").charCodeAt(0);
  const sx = sin((code * 17 + pathIndex * 37 + pointIndex * 11) * 12.9898);
  const sy = cos((code * 19 + pathIndex * 29 + pointIndex * 13) * 78.233);
  return { x: sx * amp, y: sy * amp };
}

function drawFinalOutputSingleStroke(points, progress) {
  if (!points || points.length < 2) return;
  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const steps = max(2, ceil(dist(a.x, a.y, b.x, b.y) / 8));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      sampled.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  }
  sampled.push(points[points.length - 1]);

  const visible = constrain(progress, 0, 1) * (sampled.length - 1);
  const whole = floor(visible);
  const frac = visible - whole;
  const end = sampled.slice(0, whole + 1);
  if (whole < sampled.length - 1) {
    const a = sampled[whole];
    const b = sampled[whole + 1];
    end.push({ x: lerp(a.x, b.x, frac), y: lerp(a.y, b.y, frac) });
  }

  for (let i = 0; i < end.length - 1; i++) {
    line(end[i].x, end[i].y, end[i + 1].x, end[i + 1].y);
  }
}

function drawGlyphDNAOverlay(dna, gx, gy, side, alphaScale = 1) {
  push();
  translate(gx, gy);
  const tilt = dna.openingDirection === "left" ? -0.08 : dna.openingDirection === "right" ? 0.08 : 0;
  const density = floor(lerp(1, 5, dna.innerDensity));
  const strokeW = max(1, side * lerp(0.006, 0.012, 1 - dna.averageSpeed));
  stroke(rgba(PALETTE.ink, 185 * alphaScale));
  strokeWeight(strokeW);
  strokeCap(PROJECT);
  strokeJoin(MITER);
  noFill();

  for (let i = 0; i < density; i++) {
    const t = density === 1 ? 0.5 : i / (density - 1);
    const y = side * lerp(0.30, 0.74, t);
    const left = side * lerp(0.34, 0.44, dna.verticality);
    const right = side * lerp(0.78, 0.62, dna.verticality);
    const wobble = sin((dna.sealVariantSeed + i * 19) * 0.13) * side * 0.025 * dna.curveLevel;
    if (dna.curveLevel > 0.48) {
      beginShape();
      vertex(left, y);
      quadraticVertex(side * (0.55 + tilt) + wobble, y - side * 0.07, right, y + side * 0.03);
      endShape();
    } else {
      line(left, y, right + tilt * side, y + wobble);
    }
  }

  const nodeCount = floor(lerp(0, 4, dna.pauseMarkLevel));
  noStroke();
  fill(rgba(PALETTE.cinnabar, 120 * alphaScale));
  for (let i = 0; i < nodeCount; i++) {
    const t = (i + 1) / (nodeCount + 1);
    circle(side * lerp(0.42, 0.74, t), side * lerp(0.34, 0.70, 1 - t), max(2, side * 0.012));
  }
  pop();
}

// Seal-style stroke system. These functions replace hard line-based glyph output for name residues.
function drawSealResidue(glyphDNA, bounds, progress = 1, alphaScale = 1) {
  const template = glyphDNA.structureTemplate || legacyDisabledStructureTemplate(glyphDNA);
  const b = insetBounds(bounds, min(bounds.w, bounds.h) * 0.09);
  push();
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(bounds.x, bounds.y, bounds.w, bounds.h);
  drawingContext.clip();
  const groups = sealTemplateGroups(template, glyphDNA, b);
  const total = groups.length || 1;
  for (let i = 0; i < groups.length; i++) {
    const local = constrain((progress - i / total) * total, 0, 1);
    if (local <= 0) continue;
    groups[i](local, alphaScale);
  }
  drawingContext.restore();
  pop();
}

function legacyDisabledStructureTemplate(traceFeatures, traceHash) {
  const f = traceFeatures || {};
  const hash = traceHash ?? f.traceHash ?? 0;
  const hashPick = [
    "left_right_structure",
    "top_bottom_structure",
    "full_enclosure_structure",
    "half_enclosure_structure",
    "central_axis_structure",
    "layered_structure",
    "hybrid_structure",
  ][abs(floor(hash)) % 7];

  const bboxRatio = f.bboxRatio || 1;
  const strokeCount = f.strokeCount || 0;
  const curvature = f.curvature / max(1, (f.pointCount || 1) * 0.42);
  const directionChanges = f.directionChanges || 0;
  const density = f.density || 0;
  const verticalExtent = f.verticalExtent || 0;
  const horizontalExtent = f.horizontalExtent || 0;

  if (directionChanges >= 13 || (strokeCount >= 7 && density > 0.34)) return "hybrid_structure";
  if (density > 0.62 || (strokeCount >= 6 && horizontalExtent > 0.56)) return hash % 2 ? "layered_structure" : "hybrid_structure";
  if (curvature > 0.64) return "full_enclosure_structure";
  if (bboxRatio > 1.6) return hash % 2 ? "left_right_structure" : "half_enclosure_structure";
  if (bboxRatio < 0.75) return verticalExtent > 0.62 || hash % 2 ? "central_axis_structure" : "top_bottom_structure";
  if (horizontalExtent > 0.66) return "left_right_structure";
  if (verticalExtent > 0.66) return "top_bottom_structure";
  if (directionChanges > 7) return "half_enclosure_structure";
  return hashPick;
}

function sealTemplateGroups(template, dna, b) {
  const seed = dna.sealVariantSeed || 1;
  const weight = sealWeight(b, dna);
  const common = { seed, weight, alpha: 235, wobble: SEAL_STYLE.wobble * (0.55 + dna.curveLevel * 0.7) };
  const groups = [];
  const add = (fn) => groups.push((p, a) => fn(p, { ...common, alpha: common.alpha * a }));

  if (template === "central_axis_structure" || template === "central_axis_template") {
    add((p, o) => drawSealHookTail(b.x + b.w * 0.48, b.y + b.h * 0.06, b.y + b.h * 0.94, dna.openingDirection === "left" ? "left" : "right", { ...o, progress: p }));
    add((p, o) => drawSealFork(b.x + b.w * 0.24, b.y + b.h * 0.05, b.w * 0.52, b.h * 0.36, { ...o, progress: p, seed: seed + 8 }));
    add((p, o) => drawSealLayeredBars(b.x + b.w * 0.26, b.y + b.h * 0.38, b.w * 0.48, b.h * 0.26, floor(lerp(2, 4, dna.innerDensity)), { ...o, progress: p, seed: seed + 21 }));
    add((p, o) => drawSealBottomContainer(b, dna, { ...o, progress: p, seed: seed + 34 }));
    return groups;
  }

  if (template === "left_right_structure") {
    add((p, o) => drawSealDoublePillar(b.x + b.w * 0.07, b.y + b.h * 0.08, b.w * 0.28, b.h * 0.84, { ...o, progress: p, seed: seed + 2 }));
    add((p, o) => drawSealTurn(b.x + b.w * 0.24, b.y + b.h * 0.18, b.x + b.w * 0.36, b.y + b.h * 0.46, b.x + b.w * 0.22, b.y + b.h * 0.80, { ...o, progress: p, seed: seed + 7 }));
    add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.42, b.y + b.h * 0.12, b.w * 0.48, b.h * 0.74, "left", { ...o, progress: p, seed: seed + 14 }));
    add((p, o) => drawSealLayeredBars(b.x + b.w * 0.50, b.y + b.h * 0.24, b.w * 0.32, b.h * 0.42, floor(lerp(2, 4, dna.innerDensity)), { ...o, progress: p, seed: seed + 24 }));
    return groups;
  }

  if (template === "top_bottom_structure") {
    add((p, o) => drawSealFork(b.x + b.w * 0.18, b.y + b.h * 0.04, b.w * 0.64, b.h * 0.36, { ...o, progress: p, seed: seed + 3 }));
    add((p, o) => drawSealHorizontal(b.x + b.w * 0.10, b.x + b.w * 0.90, b.y + b.h * 0.42, { ...o, progress: p, seed: seed + 9 }));
    add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.20, b.y + b.h * 0.48, b.w * 0.60, b.h * 0.38, "top", { ...o, progress: p, seed: seed + 16 }));
    add((p, o) => drawSealLayeredBars(b.x + b.w * 0.30, b.y + b.h * 0.56, b.w * 0.40, b.h * 0.22, 2, { ...o, progress: p, seed: seed + 27 }));
    return groups;
  }

  if (template === "full_enclosure_structure" || template === "enclosure_template") {
    add((p, o) => drawSealEnclosure(b.x + b.w * 0.10, b.y + b.h * 0.08, b.w * 0.80, b.h * 0.80, { ...o, progress: p }));
    add((p, o) => drawSealLayeredBars(b.x + b.w * 0.24, b.y + b.h * 0.20, b.w * 0.52, b.h * 0.36, floor(lerp(2, 4, dna.innerDensity)), { ...o, progress: p, seed: seed + 5 }));
    add((p, o) => drawSealVertical(b.x + b.w * 0.50, b.y + b.h * 0.28, b.y + b.h * 0.72, { ...o, progress: p, seed: seed + 9 }));
    add((p, o) => drawSealCurve([sealPoint(b, 0.28, 0.70), sealPoint(b, 0.50, 0.84), sealPoint(b, 0.72, 0.70)], { ...o, progress: p, seed: seed + 13 }));
    return groups;
  }

  if (template === "half_enclosure_structure") {
    const variant = seed % 3;
    const openSide = variant === 0 ? "left" : variant === 1 ? "top" : "right";
    add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.10, b.y + b.h * 0.10, b.w * 0.78, b.h * 0.76, openSide, { ...o, progress: p, seed: seed + 4 }));
    add((p, o) => drawSealHookTail(b.x + b.w * (openSide === "left" ? 0.76 : 0.28), b.y + b.h * 0.18, b.y + b.h * 0.86, openSide === "left" ? "left" : "right", { ...o, progress: p, seed: seed + 15 }));
    add((p, o) => drawSealTurn(b.x + b.w * 0.28, b.y + b.h * 0.34, b.x + b.w * 0.52, b.y + b.h * 0.48, b.x + b.w * 0.72, b.y + b.h * 0.34, { ...o, progress: p, seed: seed + 28 }));
    return groups;
  }

  if (template === "layered_structure" || template === "layered_template") {
    add((p, o) => drawSealLayeredBars(b.x + b.w * 0.08, b.y + b.h * 0.10, b.w * 0.84, b.h * 0.46, floor(lerp(3, 6, dna.innerDensity)), { ...o, progress: p }));
    add((p, o) => drawSealDoublePillar(b.x + b.w * 0.18, b.y + b.h * 0.18, b.w * 0.64, b.h * 0.68, { ...o, progress: p, seed: seed + 21 }));
    add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.18, b.y + b.h * 0.48, b.w * 0.64, b.h * 0.38, "top", { ...o, progress: p, seed: seed + 31 }));
    add((p, o) => drawSealHorizontal(b.x + b.w * 0.14, b.x + b.w * 0.86, b.y + b.h * 0.90, { ...o, progress: p, seed: seed + 42 }));
    return groups;
  }

  if (template === "fork_template") {
    add((p, o) => drawSealFork(b.x + b.w * 0.14, b.y + b.h * 0.08, b.w * 0.72, b.h * 0.68, { ...o, progress: p }));
    add((p, o) => drawSealHorizontal(b.x + b.w * 0.14, b.x + b.w * 0.86, b.y + b.h * 0.86, { ...o, progress: p, seed: seed + 9 }));
    add((p, o) => drawSealCurve([sealPoint(b, 0.28, 0.58), sealPoint(b, 0.50 + (dna.openingDirection === "right" ? 0.08 : -0.08), 0.70), sealPoint(b, 0.72, 0.58)], { ...o, progress: p, seed: seed + 16 }));
    add((p, o) => drawSealPauseMarks(b, dna, { ...o, progress: p, seed: seed + 55 }));
    return groups;
  }

  if (template === "curve_template") {
    add((p, o) => drawSealCurve([
      sealPoint(b, 0.68, 0.08),
      sealPoint(b, 0.30, 0.18),
      sealPoint(b, 0.62, 0.38),
      sealPoint(b, 0.28, 0.58),
      sealPoint(b, 0.58, 0.82),
    ], { ...o, progress: p, seed: seed + 3 }));
    add((p, o) => drawSealHookTail(b.x + b.w * 0.64, b.y + b.h * 0.16, b.y + b.h * 0.90, "right", { ...o, progress: p, seed: seed + 14 }));
    add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.20, b.y + b.h * 0.54, b.w * 0.50, b.h * 0.28, "top", { ...o, progress: p, seed: seed + 28 }));
    add((p, o) => drawSealPauseMarks(b, dna, { ...o, progress: p, seed: seed + 55 }));
    return groups;
  }

  if (template === "side_attachment_template") {
    add((p, o) => drawSealHookTail(b.x + b.w * 0.36, b.y + b.h * 0.08, b.y + b.h * 0.92, dna.openingDirection === "left" ? "left" : "right", { ...o, progress: p, seed: seed + 4 }));
    add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.46, b.y + b.h * 0.16, b.w * 0.38, b.h * 0.30, "left", { ...o, progress: p, seed: seed + 16 }));
    add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.46, b.y + b.h * 0.54, b.w * 0.38, b.h * 0.30, "left", { ...o, progress: p, seed: seed + 27 }));
    add((p, o) => drawSealCurve([sealPoint(b, 0.18, 0.42), sealPoint(b, 0.30, 0.56), sealPoint(b, 0.18, 0.76)], { ...o, progress: p, seed: seed + 39 }));
    add((p, o) => drawSealPauseMarks(b, dna, { ...o, progress: p, seed: seed + 55 }));
    return groups;
  }

  if (template === "hybrid_structure" || template === "hybrid_template") {
    add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.10, b.y + b.h * 0.08, b.w * 0.80, b.h * 0.78, dna.openingDirection === "left" ? "left" : "right", { ...o, progress: p, seed }));
    add((p, o) => drawSealHookTail(b.x + b.w * lerp(0.38, 0.54, dna.verticality), b.y + b.h * 0.10, b.y + b.h * 0.92, dna.openingDirection === "left" ? "left" : "right", { ...o, progress: p, seed: seed + 7 }));
    add((p, o) => drawSealDoublePillar(b.x + b.w * 0.16, b.y + b.h * 0.24, b.w * 0.68, b.h * 0.58, { ...o, progress: p, seed: seed + 13 }));
    add((p, o) => drawSealLayeredBars(b.x + b.w * 0.24, b.y + b.h * 0.20, b.w * 0.50, b.h * 0.42, floor(lerp(2, 5, dna.innerDensity)), { ...o, progress: p, seed: seed + 17 }));
    add((p, o) => drawSealCurve([sealPoint(b, 0.18, 0.76), sealPoint(b, 0.50, 0.92), sealPoint(b, 0.82, 0.76)], { ...o, progress: p, seed: seed + 43 }));
    return groups;
  }

  add((p, o) => drawSealOpenEnclosure(b.x + b.w * 0.12, b.y + b.h * 0.10, b.w * 0.76, b.h * 0.76, dna.openingDirection === "left" ? "left" : "right", { ...o, progress: p }));
  add((p, o) => drawSealHookTail(b.x + b.w * lerp(0.38, 0.54, dna.verticality), b.y + b.h * 0.14, b.y + b.h * 0.88, dna.openingDirection === "left" ? "left" : "right", { ...o, progress: p, seed: seed + 7 }));
  add((p, o) => drawSealLayeredBars(b.x + b.w * 0.24, b.y + b.h * 0.22, b.w * 0.50, b.h * 0.36, floor(lerp(2, 5, dna.innerDensity)), { ...o, progress: p, seed: seed + 17 }));
  add((p, o) => drawSealCurve([sealPoint(b, 0.24, 0.78), sealPoint(b, 0.50, 0.92), sealPoint(b, 0.76, 0.78)], { ...o, progress: p, seed: seed + 43 }));
  add((p, o) => drawSealPauseMarks(b, dna, { ...o, progress: p, seed: seed + 55 }));
  return groups;
}

function drawSealStroke(points, options = {}) {
  if (!points || points.length < 2) return;
  const opts = { ...SEAL_STYLE, ...options };
  const progress = constrain(opts.progress ?? 1, 0, 1);
  const pts = partialSealPoints(applySealWobble(points, opts.seed || 1, opts.wobble || 0), progress);
  if (pts.length < 2) return;
  push();
  noFill();
  stroke(rgba(opts.strokeColor || SEAL_STYLE.strokeColor, (opts.alpha ?? 255) * (opts.inkAlpha ?? SEAL_STYLE.inkAlpha)));
  strokeWeight(opts.weight || opts.strokeWeight || SEAL_STYLE.strokeWeight);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  beginShape();
  curveVertex(pts[0].x, pts[0].y);
  for (const pt of pts) curveVertex(pt.x, pt.y);
  const last = pts[pts.length - 1];
  curveVertex(last.x, last.y);
  endShape();
  pop();
}

function drawSealVertical(x, y1, y2, options = {}) {
  const bend = (seededUnit(options.seed || 1, 3) - 0.5) * abs(y2 - y1) * 0.035;
  drawSealStroke([{ x, y: y1 }, { x: x + bend, y: (y1 + y2) / 2 }, { x, y: y2 }], options);
}

function drawSealHorizontal(x1, x2, y, options = {}) {
  const bend = (seededUnit(options.seed || 1, 5) - 0.5) * abs(x2 - x1) * 0.025;
  drawSealStroke([{ x: x1, y }, { x: (x1 + x2) / 2, y: y + bend }, { x: x2, y }], options);
}

function drawSealCurve(points, options = {}) {
  drawSealStroke(points, options);
}

function drawSealTurn(x1, y1, x2, y2, x3, y3, options = {}) {
  drawSealStroke([{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }], options);
}

function drawSealHookTail(x, y1, y2, direction, options = {}) {
  const dir = direction === "left" ? -1 : 1;
  const hook = max(12, abs(y2 - y1) * 0.12);
  drawSealStroke([{ x, y: y1 }, { x: x + dir * hook * 0.18, y: y2 - hook * 0.42 }, { x: x + dir * hook, y: y2 }], options);
}

function drawSealEnclosure(x, y, w, h, options = {}) {
  drawSealStroke([
    { x: x + w * 0.12, y: y + h * 0.04 },
    { x: x + w * 0.88, y: y + h * 0.04 },
    { x: x + w * 0.94, y: y + h * 0.18 },
    { x: x + w * 0.94, y: y + h * 0.82 },
    { x: x + w * 0.82, y: y + h * 0.94 },
    { x: x + w * 0.18, y: y + h * 0.94 },
    { x: x + w * 0.06, y: y + h * 0.82 },
    { x: x + w * 0.06, y: y + h * 0.18 },
    { x: x + w * 0.12, y: y + h * 0.04 },
  ], options);
}

function drawSealOpenEnclosure(x, y, w, h, openSide, options = {}) {
  if (openSide === "top") {
    drawSealStroke([{ x: x + w * 0.08, y: y + h * 0.16 }, { x: x + w * 0.08, y: y + h * 0.90 }, { x: x + w * 0.92, y: y + h * 0.90 }, { x: x + w * 0.92, y: y + h * 0.16 }], options);
  } else if (openSide === "left") {
    drawSealStroke([{ x: x + w * 0.88, y: y + h * 0.10 }, { x: x + w * 0.18, y: y + h * 0.10 }, { x: x + w * 0.18, y: y + h * 0.90 }, { x: x + w * 0.88, y: y + h * 0.90 }], options);
  } else {
    drawSealStroke([{ x: x + w * 0.12, y: y + h * 0.10 }, { x: x + w * 0.82, y: y + h * 0.10 }, { x: x + w * 0.82, y: y + h * 0.90 }, { x: x + w * 0.12, y: y + h * 0.90 }], options);
  }
}

function drawSealDoublePillar(x, y, w, h, options = {}) {
  drawSealVertical(x + w * 0.24, y, y + h, { ...options, seed: (options.seed || 1) + 1 });
  drawSealVertical(x + w * 0.76, y, y + h, { ...options, seed: (options.seed || 1) + 2 });
}

function drawSealLayeredBars(x, y, w, h, count, options = {}) {
  const c = max(1, count);
  for (let i = 0; i < c; i++) {
    const t = c === 1 ? 0.5 : i / (c - 1);
    const inset = w * lerp(0.02, 0.16, abs(t - 0.5));
    drawSealHorizontal(x + inset, x + w - inset, y + h * lerp(0.08, 0.92, t), { ...options, seed: (options.seed || 1) + i * 11 });
  }
}

function drawSealFork(x, y, w, h, options = {}) {
  const cx = x + w * 0.50;
  drawSealVertical(cx, y + h * 0.18, y + h * 0.92, { ...options, seed: (options.seed || 1) + 1 });
  drawSealCurve([{ x: cx, y: y + h * 0.24 }, { x: x + w * 0.24, y: y + h * 0.42 }, { x: x + w * 0.08, y: y + h * 0.72 }], { ...options, seed: (options.seed || 1) + 2 });
  drawSealCurve([{ x: cx, y: y + h * 0.24 }, { x: x + w * 0.76, y: y + h * 0.42 }, { x: x + w * 0.92, y: y + h * 0.72 }], { ...options, seed: (options.seed || 1) + 3 });
}

function drawSealCross(x, y, w, h, options = {}) {
  drawSealHorizontal(x + w * 0.08, x + w * 0.92, y + h * 0.45, { ...options, seed: (options.seed || 1) + 4 });
  drawSealVertical(x + w * 0.50, y + h * 0.06, y + h * 0.94, { ...options, seed: (options.seed || 1) + 5 });
}

function drawSealBottomContainer(b, dna, options = {}) {
  drawSealOpenEnclosure(b.x + b.w * 0.22, b.y + b.h * 0.66, b.w * 0.56, b.h * 0.26, "top", options);
}

function drawSealPauseMarks(b, dna, options = {}) {
  const count = floor(lerp(0, 5, dna.pauseMarkLevel));
  if (!count) return;
  push();
  noStroke();
  fill(rgba(PALETTE.cinnabar, 115 * ((options.alpha ?? 255) / 255)));
  for (let i = 0; i < count; i++) {
    const nx = 0.20 + seededUnit((options.seed || 1) + i, 71) * 0.60;
    const ny = 0.18 + seededUnit((options.seed || 1) + i, 91) * 0.64;
    circle(b.x + b.w * nx, b.y + b.h * ny, max(2, min(b.w, b.h) * 0.014));
  }
  pop();
}

function sealPoint(b, nx, ny) {
  return { x: b.x + b.w * nx, y: b.y + b.h * ny };
}

function sealWeight(b, dna) {
  return max(1.6, min(b.w, b.h) * lerp(0.012, 0.026, 1 - (dna.averageSpeed || 0)));
}

function insetBounds(b, pad) {
  return { x: b.x + pad, y: b.y + pad, w: b.w - pad * 2, h: b.h - pad * 2 };
}

function applySealWobble(points, seed, wobble) {
  return points.map((pt, i) => {
    if (i === 0 || i === points.length - 1) return { ...pt };
    return {
      x: pt.x + (seededUnit(seed + i, 17) - 0.5) * wobble * 4,
      y: pt.y + (seededUnit(seed + i, 23) - 0.5) * wobble * 4,
    };
  });
}

function partialSealPoints(points, progress) {
  if (progress >= 0.999) return points;
  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let j = 0; j < 14; j++) {
      const t = j / 14;
      sampled.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  }
  sampled.push(points[points.length - 1]);
  return sampled.slice(0, max(2, floor(sampled.length * constrain(progress, 0, 1))));
}

function drawComponentInRectZone(componentType, zone, progress, weight, gx, gy, side, ghost = false, fitted = null) {
  const b = getFittedBoundsForComponent(getZoneSafeBounds(zone, gx, gy, side), componentType, zone);
  const strokeW = getOutputStrokeWeight(side);
  const policy = getZoneFitPolicy(zone);

  push();
  if (policy.useStrictClipping) clipToRectZone(zone, gx, gy, side);
  stroke(PALETTE.ink);
  strokeWeight(strokeW);
  strokeCap(PROJECT);
  strokeJoin(MITER);
  noFill();
  const ctx = { ...b, p: progress, weight: strokeW, ghost };
  drawComponentByType(componentType, ctx);
  if (policy.useStrictClipping) drawingContext.restore();
  pop();
}

function getZoneKey(zone) {
  return zone && zone.step ? "zone" + zone.step : "";
}

function getZoneFitPolicy(zone) {
  return ZONE_FIT_POLICY[getZoneKey(zone)] || {};
}

function hasZoneFitPolicy(zone) {
  return Object.prototype.hasOwnProperty.call(ZONE_FIT_POLICY, getZoneKey(zone));
}

function clipToRectZone(zone, squareX, squareY, squareSize) {
  const x = squareX + zone.x * squareSize;
  const y = squareY + zone.y * squareSize;
  const w = zone.w * squareSize;
  const h = zone.h * squareSize;
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(x, y, w, h);
  drawingContext.clip();
}

// 先按区域政策取得可绘制边界；是否外扩由 getFittedBoundsForComponent 再决定。
function getZoneSafeBounds(zone, squareX, squareY, squareSize, paddingRatio = 0.06) {
  const policy = getZoneFitPolicy(zone);
  const hasPolicy = hasZoneFitPolicy(zone);
  if (zone.type === "rect") {
    const x = squareX + zone.x * squareSize;
    const y = squareY + zone.y * squareSize;
    const w = zone.w * squareSize;
    const h = zone.h * squareSize;
    const padX = policy.paddingX !== undefined ? w * policy.paddingX : (hasPolicy ? 0 : min(w, h) * paddingRatio);
    const padY = policy.paddingY !== undefined ? h * policy.paddingY : (hasPolicy ? 0 : min(w, h) * paddingRatio);

    return {
      x: x + padX,
      y: y + padY,
      w: w - padX * 2,
      h: h - padY * 2,
      left: x + padX,
      right: x + w - padX,
      top: y + padY,
      bottom: y + h - padY,
      cx: x + w / 2,
      cy: y + h / 2,
    };
  }

  if (zone.type === "compoundU") {
    return getCompoundUSafeBounds(zone, squareX, squareY, squareSize);
  }

  return null;
}

function getCompoundUSafeBounds(zone, squareX, squareY, squareSize, paddingRatio = 0.06) {
  const policy = getZoneFitPolicy(zone);
  const o = zone.outer;
  const c = zone.innerCutout;
  const ox0 = squareX + o.x * squareSize;
  const oy0 = squareY + o.y * squareSize;
  const ow0 = o.w * squareSize;
  const oh0 = o.h * squareSize;
  const cx0 = squareX + c.x * squareSize;
  const cy0 = squareY + c.y * squareSize;
  const cw0 = c.w * squareSize;
  const ch0 = c.h * squareSize;
  const padX = policy.paddingX !== undefined ? ow0 * policy.paddingX : 0;
  const padY = policy.paddingY !== undefined ? oh0 * policy.paddingY : 0;
  const overshoot = policy.allowOvershoot ? min(ow0, oh0) * (policy.overshootRatio ?? FIT_OVERSHOOT) : 0;
  const innerPad = overshoot;

  const ox = ox0 + padX - overshoot;
  const oy = oy0 + padY - overshoot;
  const ow = ow0 - padX * 2 + overshoot * 2;
  const oh = oh0 - padY * 2 + overshoot * 2;
  const cx = cx0 - innerPad;
  const cy = cy0 - innerPad;
  const cw = cw0 + innerPad * 2;
  const ch = ch0 + innerPad * 2;

  return {
    ox, oy, ow, oh,
    cx, cy, cw, ch,
    left: ox,
    right: ox + ow,
    top: oy,
    bottom: oy + oh,
    leftLeg: {
      x: ox,
      y: oy,
      w: max(1, cx - ox),
      h: oh,
    },
    topBand: {
      x: ox,
      y: oy,
      w: ow,
      h: max(1, cy - oy),
    },
    rightLeg: {
      x: cx + cw,
      y: oy,
      w: max(1, ox + ow - (cx + cw)),
      h: oh,
    },
    inner: {
      x: cx,
      y: cy,
      w: cw,
      h: ch,
    },
  };
}

function expandBounds(bounds, ratio = FIT_OVERSHOOT) {
  const dx = bounds.w * ratio;
  const dy = bounds.h * ratio;
  return {
    ...bounds,
    x: bounds.x - dx,
    y: bounds.y - dy,
    w: bounds.w + dx * 2,
    h: bounds.h + dy * 2,
    left: bounds.left - dx,
    right: bounds.right + dx,
    top: bounds.top - dy,
    bottom: bounds.bottom + dy,
    cx: bounds.cx,
    cy: bounds.cy,
  };
}

// Fit 规则：zone 决定书写区域，componentType 只决定如何更积极贴边。
function getFittedBoundsForComponent(zoneBounds, componentType, zone) {
  const policy = getZoneFitPolicy(zone);
  if (!policy.allowOvershoot) return zoneBounds;
  return expandBounds(zoneBounds, policy.overshootRatio ?? FIT_OVERSHOOT);
}

function isVerticalComponent(type) {
  return ["vertical_axis", "vertical_hook", "vertical_foot", "left_stem_double_attach", "top_bar_with_stem"].includes(type);
}

function isHorizontalComponent(type) {
  return ["horizontal_bar", "layered_three_bars", "top_bar_with_stem", "top_cross", "double_vertical_bridge"].includes(type);
}

function drawComponentInCompoundZone(componentType, compoundZone, progress, weight, gx, gy, side, ghost = false) {
  const geom = getCompoundUGeometry(compoundZone, gx, gy, side);
  switch (componentType) {
    case "open_enclosure_hook":
      drawUOpenEnclosureHookComponent(geom, progress, weight);
      break;
    case "square_enclosure":
      drawUSquareEnclosureComponent(geom, progress, weight);
      break;
    case "half_enclosure":
      drawUHalfEnclosureComponent(geom, progress, weight);
      break;
    case "upper_bowl":
      drawUUpperBowlComponent(geom, progress, weight);
      break;
    case "enclosure_tail":
      drawUEnclosureTailComponent(geom, progress, weight);
      break;

    case "layered_three_bars":
      drawULayeredThreeBarsComponent(geom, progress, weight);
      break;
    case "horizontal_bar":
      drawUHorizontalBarComponent(geom, progress, weight);
      break;
    case "top_bar_with_stem":
      drawUTopBarWithStemComponent(geom, progress, weight);
      break;
    case "top_cross":
      drawUTopCrossComponent(geom, progress, weight);
      break;
    case "double_vertical_bridge":
      drawUDoubleVerticalBridgeComponent(geom, progress, weight);
      break;

    case "diagonal_connector":
      drawUDiagonalConnectorComponent(geom, progress, weight);
      break;
    case "central_cross":
      drawUCentralCrossComponent(geom, progress, weight);
      break;
    case "branching_stem":
      drawUBranchingStemComponent(geom, progress, weight);
      break;
    case "turning_zhi":
      drawUTurningZhiComponent(geom, progress, weight);
      break;
    case "turning_curve":
      drawUTurningCurveComponent(geom, progress, weight);
      break;
    case "bowl_with_leg":
      drawUBowlWithLegComponent(geom, progress, weight);
      break;

    case "open_person":
      drawUOpenPersonComponent(geom, progress, weight);
      break;
    case "downward_open":
      drawUDownwardOpenComponent(geom, progress, weight);
      break;
    case "fork_down":
      drawUForkDownComponent(geom, progress, weight);
      break;
    case "double_valley":
      drawUDoubleValleyComponent(geom, progress, weight);
      break;
    case "mountain_peaks":
      drawUMountainPeaksComponent(geom, progress, weight);
      break;

    case "vertical_axis":
      drawUVerticalAxisComponent(geom, progress, weight);
      break;
    case "vertical_hook":
      drawUVerticalHookComponent(geom, progress, weight);
      break;
    case "vertical_foot":
      drawUVerticalFootComponent(geom, progress, weight);
      break;
    case "left_stem_double_attach":
      drawULeftStemDoubleAttachComponent(geom, progress, weight);
      break;
    case "lower_container":
      drawULowerContainerComponent(geom, progress, weight);
      break;
    case "open_corner":
      drawUOpenCornerComponent(geom, progress, weight);
      break;
    default:
      drawUAxisComponent(geom, progress, weight);
      break;
  }
}

function getCompoundUGeometry(zone, gx, gy, side) {
  return getCompoundUSafeBounds(zone, gx, gy, side);
}

function drawUOpenEnclosureHookComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.18, 0.22), uPoint(geom.topBand, 0.92, 0.22)],
      [uPoint(geom.rightLeg, 0.78, 0.1), uPoint(geom.rightLeg, 0.78, 0.78)],
      [uPoint(geom.leftLeg, 0.26, 0.18), uPoint(geom.leftLeg, 0.26, 0.76)],
      [uPoint(geom.rightLeg, 0.78, 0.78), uPoint(geom.rightLeg, 0.34, 0.94)],
    ],
    progress,
    s
  );
}

function drawUSquareEnclosureComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.08, 0.16), uPoint(geom.topBand, 0.92, 0.16)],
      [uPoint(geom.rightLeg, 0.82, 0.06), uPoint(geom.rightLeg, 0.82, 0.94)],
      [uPoint(geom.leftLeg, 0.18, 0.06), uPoint(geom.leftLeg, 0.18, 0.94)],
      [uPoint(geom.leftLeg, 0.18, 0.94), uPoint(geom.leftLeg, 0.82, 0.94)],
      [uPoint(geom.rightLeg, 0.18, 0.94), uPoint(geom.rightLeg, 0.82, 0.94)],
    ],
    progress,
    s
  );
}

function drawUHalfEnclosureComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.12, 0.18), uPoint(geom.topBand, 0.88, 0.18)],
      [uPoint(geom.rightLeg, 0.78, 0.08), uPoint(geom.rightLeg, 0.78, 0.88)],
      [uPoint(geom.rightLeg, 0.25, 0.88), uPoint(geom.rightLeg, 0.78, 0.88)],
    ],
    progress,
    s
  );
}

function drawUUpperBowlComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.14, 0.18), uPoint(geom.topBand, 0.86, 0.18)],
      [uPoint(geom.topBand, 0.18, 0.76), uPoint(geom.topBand, 0.82, 0.76)],
      [uPoint(geom.leftLeg, 0.38, 0.08), uPoint(geom.leftLeg, 0.38, 0.32)],
      [uPoint(geom.rightLeg, 0.62, 0.08), uPoint(geom.rightLeg, 0.62, 0.32)],
    ],
    progress,
    s
  );
}

function drawUEnclosureTailComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.1, 0.16), uPoint(geom.topBand, 0.9, 0.16)],
      [uPoint(geom.rightLeg, 0.78, 0.08), uPoint(geom.rightLeg, 0.78, 0.86)],
      [uPoint(geom.leftLeg, 0.22, 0.08), uPoint(geom.leftLeg, 0.22, 0.86)],
      [uPoint(geom.rightLeg, 0.46, 0.72), uPoint(geom.rightLeg, 0.88, 0.96)],
    ],
    progress,
    s
  );
}

function drawULayeredThreeBarsComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.08, 0.2), uPoint(geom.topBand, 0.92, 0.2)],
      [uPoint(geom.topBand, 0.18, 0.52), uPoint(geom.topBand, 0.82, 0.52)],
      [uPoint(geom.topBand, 0.28, 0.82), uPoint(geom.topBand, 0.72, 0.82)],
    ],
    progress,
    s
  );
}

function drawUHorizontalBarComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.06, 0.48), uPoint(geom.topBand, 0.94, 0.48)],
      [uPoint(geom.leftLeg, 0.5, 0.22), uPoint(geom.leftLeg, 0.5, 0.48)],
      [uPoint(geom.rightLeg, 0.5, 0.22), uPoint(geom.rightLeg, 0.5, 0.48)],
    ],
    progress,
    s
  );
}

function drawUTopBarWithStemComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.06, 0.2), uPoint(geom.topBand, 0.94, 0.2)],
      [uPoint(geom.leftLeg, 0.54, 0.08), uPoint(geom.leftLeg, 0.54, 0.62)],
      [uPoint(geom.topBand, 0.18, 0.62), uPoint(geom.topBand, 0.44, 0.62)],
    ],
    progress,
    s
  );
}

function drawUTopCrossComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.12, 0.22), uPoint(geom.topBand, 0.88, 0.22)],
      [uPoint(geom.topBand, 0.5, 0.04), uPoint(geom.topBand, 0.5, 0.94)],
      [uPoint(geom.leftLeg, 0.48, 0.08), uPoint(geom.leftLeg, 0.48, 0.36)],
    ],
    progress,
    s
  );
}

function drawUDoubleVerticalBridgeComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.leftLeg, 0.52, 0.16), uPoint(geom.leftLeg, 0.52, 0.46)],
      [uPoint(geom.rightLeg, 0.48, 0.16), uPoint(geom.rightLeg, 0.48, 0.46)],
      [uPoint(geom.topBand, 0.16, 0.52), uPoint(geom.topBand, 0.84, 0.52)],
      [uPoint(geom.leftLeg, 0.52, 0.58), uPoint(geom.leftLeg, 0.52, 0.82)],
      [uPoint(geom.rightLeg, 0.48, 0.58), uPoint(geom.rightLeg, 0.48, 0.82)],
    ],
    progress,
    s
  );
}

function drawUDiagonalConnectorComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.12, 0.22), { x: geom.cx + geom.cw, y: geom.cy }, uPoint(geom.rightLeg, 0.42, 0.42)],
    ],
    progress,
    s
  );
}

function drawUCentralCrossComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  const cross = uPoint(geom.topBand, 0.5, 0.86);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.14, 0.18), cross, uPoint(geom.rightLeg, 0.36, 0.3)],
      [uPoint(geom.topBand, 0.86, 0.18), cross, uPoint(geom.leftLeg, 0.64, 0.3)],
    ],
    progress,
    s
  );
}

function drawUBranchingStemComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  const root = uPoint(geom.leftLeg, 0.5, 0.38);
  drawUProgressSegments(
    [
      [uPoint(geom.leftLeg, 0.5, 0.08), uPoint(geom.leftLeg, 0.5, 0.92)],
      [root, { x: geom.cx, y: geom.cy }, uPoint(geom.rightLeg, 0.34, 0.22)],
      [root, uPoint(geom.leftLeg, 0.82, 0.78)],
    ],
    progress,
    s
  );
}

function drawUTurningZhiComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.12, 0.18), uPoint(geom.topBand, 0.88, 0.18)],
      [uPoint(geom.topBand, 0.88, 0.18), { x: geom.cx, y: geom.cy }, uPoint(geom.leftLeg, 0.28, 0.62)],
      [uPoint(geom.leftLeg, 0.28, 0.88), uPoint(geom.leftLeg, 0.86, 0.88)],
      [uPoint(geom.rightLeg, 0.16, 0.88), uPoint(geom.rightLeg, 0.82, 0.88)],
    ],
    progress,
    s
  );
}

function drawUTurningCurveComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.86, 0.18), uPoint(geom.topBand, 0.26, 0.24), uPoint(geom.topBand, 0.72, 0.58)],
      [uPoint(geom.topBand, 0.72, 0.58), { x: geom.cx + geom.cw, y: geom.cy }, uPoint(geom.rightLeg, 0.32, 0.5)],
      [uPoint(geom.rightLeg, 0.32, 0.5), uPoint(geom.rightLeg, 0.82, 0.82)],
    ],
    progress,
    s
  );
}

function drawUBowlWithLegComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.18, 0.18), uPoint(geom.topBand, 0.82, 0.18)],
      [uPoint(geom.rightLeg, 0.66, 0.12), uPoint(geom.rightLeg, 0.66, 0.46)],
      [uPoint(geom.topBand, 0.36, 0.72), uPoint(geom.topBand, 0.72, 0.72)],
      [uPoint(geom.rightLeg, 0.36, 0.52), uPoint(geom.rightLeg, 0.84, 0.92)],
    ],
    progress,
    s
  );
}

function drawUOpenPersonComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  const topCenter = uPoint(geom.topBand, 0.5, 0.74);
  drawUProgressSegments(
    [
      [topCenter, { x: geom.cx, y: geom.cy }, uPoint(geom.leftLeg, 0.5, 0.84)],
      [topCenter, { x: geom.cx + geom.cw, y: geom.cy }, uPoint(geom.rightLeg, 0.5, 0.84)],
      [uPoint(geom.topBand, 0.38, 0.58), uPoint(geom.topBand, 0.62, 0.58)],
    ],
    progress,
    s
  );
}

function drawUDownwardOpenComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  const bottomJoin = uPoint(geom.topBand, 0.5, 0.92);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.18, 0.12), bottomJoin],
      [uPoint(geom.topBand, 0.82, 0.12), bottomJoin],
    ],
    progress,
    s
  );
}

function drawUForkDownComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  const fork = uPoint(geom.topBand, 0.5, 0.58);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.2, 0.12), fork],
      [uPoint(geom.topBand, 0.8, 0.12), fork],
      [fork, uPoint(geom.leftLeg, 0.76, 0.58)],
    ],
    progress,
    s
  );
}

function drawUDoubleValleyComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [
        uPoint(geom.topBand, 0.1, 0.16),
        uPoint(geom.topBand, 0.3, 0.86),
        uPoint(geom.topBand, 0.5, 0.2),
        uPoint(geom.topBand, 0.7, 0.86),
        uPoint(geom.topBand, 0.9, 0.16),
      ],
    ],
    progress,
    s
  );
}

function drawUMountainPeaksComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [
        uPoint(geom.leftLeg, 0.22, 0.78),
        uPoint(geom.topBand, 0.34, 0.16),
        uPoint(geom.topBand, 0.5, 0.78),
        uPoint(geom.topBand, 0.66, 0.16),
        uPoint(geom.rightLeg, 0.78, 0.78),
      ],
    ],
    progress,
    s
  );
}

function drawUVerticalAxisComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.leftLeg, 0.48, 0.08), uPoint(geom.leftLeg, 0.48, 0.92)],
    ],
    progress,
    s
  );
}

function drawUVerticalHookComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.leftLeg, 0.54, 0.08), uPoint(geom.leftLeg, 0.54, 0.82)],
      [uPoint(geom.leftLeg, 0.54, 0.82), uPoint(geom.leftLeg, 0.86, 0.92)],
    ],
    progress,
    s
  );
}

function drawUVerticalFootComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.leftLeg, 0.44, 0.08), uPoint(geom.leftLeg, 0.44, 0.88)],
      [uPoint(geom.leftLeg, 0.44, 0.88), uPoint(geom.leftLeg, 0.92, 0.88)],
    ],
    progress,
    s
  );
}

function drawULeftStemDoubleAttachComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.leftLeg, 0.36, 0.08), uPoint(geom.leftLeg, 0.36, 0.92)],
      [uPoint(geom.leftLeg, 0.38, 0.22), uPoint(geom.leftLeg, 0.88, 0.22)],
      [uPoint(geom.leftLeg, 0.38, 0.58), uPoint(geom.leftLeg, 0.88, 0.58)],
      [uPoint(geom.leftLeg, 0.84, 0.22), uPoint(geom.leftLeg, 0.84, 0.42)],
      [uPoint(geom.leftLeg, 0.84, 0.58), uPoint(geom.leftLeg, 0.84, 0.82)],
    ],
    progress,
    s
  );
}

function drawULowerContainerComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.leftLeg, 0.28, 0.56), uPoint(geom.leftLeg, 0.28, 0.92)],
      [uPoint(geom.rightLeg, 0.72, 0.56), uPoint(geom.rightLeg, 0.72, 0.92)],
      [uPoint(geom.leftLeg, 0.28, 0.92), uPoint(geom.leftLeg, 0.86, 0.92)],
      [uPoint(geom.rightLeg, 0.14, 0.92), uPoint(geom.rightLeg, 0.72, 0.92)],
    ],
    progress,
    s
  );
}

function drawUOpenCornerComponent(geom, progress, weight) {
  const s = uStrokeWeight(geom, weight);
  drawUProgressSegments(
    [
      [uPoint(geom.topBand, 0.88, 0.18), uPoint(geom.topBand, 0.24, 0.18)],
      [uPoint(geom.leftLeg, 0.24, 0.16), uPoint(geom.leftLeg, 0.24, 0.82)],
      [uPoint(geom.leftLeg, 0.24, 0.82), uPoint(geom.leftLeg, 0.82, 0.82)],
    ],
    progress,
    s
  );
}

function drawUAxisComponent(geom, progress, weight) {
  drawUVerticalAxisComponent(geom, progress, weight);
}

function drawUProgressSegments(paths, progress, strokeW) {
  const per = 1 / paths.length;
  for (let i = 0; i < paths.length; i++) {
    const local = constrain((progress - i * per) / per, 0, 1);
    if (local <= 0) continue;
    drawZone3Path(paths[i], local, strokeW);
  }
}

function drawZone3Path(points, progress, weight) {
  drawProgressPolyline(points, progress, weight);
}

function drawProgressPolyline(points, progress, strokeW) {
  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let j = 0; j < 18; j++) {
      const t = j / 18;
      sampled.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  }
  sampled.push(points[points.length - 1]);
  const count = max(2, floor(sampled.length * constrain(progress, 0, 1)));
  drawGlyphPolyline(sampled.slice(0, count), { strokeWeight: strokeW });
}

function uPoint(region, nx, ny) {
  return { x: region.x + region.w * edgeNorm(nx), y: region.y + region.h * edgeNorm(ny) };
}

function uStrokeWeight(geom, weight) {
  return getOutputStrokeWeight(max(geom.ow, geom.oh));
}

function getOutputStrokeWeight(side) {
  return side < 180 ? constrain(side * 0.009, 1.1, 2.5) : constrain(side * 0.009, 2.8, 5);
}

function drawComponentByType(type, ctx) {
  const fns = {
    open_person: drawBoundsOpenPerson,
    left_stem_double_attach: drawBoundsLeftStemDoubleAttach,
    open_corner: drawBoundsOpenCorner,
    layered_three_bars: drawBoundsLayeredThreeBars,
    horizontal_bar: drawBoundsHorizontalBar,
    top_bar_with_stem: drawBoundsTopBarWithStem,
    double_vertical_bridge: drawBridge,
    branching_stem: drawBranch,
    mountain_peaks: drawPeaks,
    bowl_with_leg: drawBowlLeg,
    downward_open: drawDownwardV,
    double_valley: drawDoubleV,
    central_cross: drawCross,
    turning_zhi: drawZigzag,
    open_triangle: drawOpenTriangle,
    vertical_double_bowl: drawVerticalDoubleBowl,
    open_left_arc: drawOpenLeftArc,
    half_enclosure: drawHalfEnclosure,
    layered_bars: drawLayeredBars,
    upper_bars: drawUpperBars,
    open_enclosure_hook: drawOpenEnclosureHook,
    bridge: drawBridge,
    vertical_axis: drawBoundsVerticalAxis,
    vertical_hook: drawBoundsVerticalHook,
    branch: drawBranch,
    vertical_foot: drawBoundsVerticalFoot,
    peaks: drawPeaks,
    diagonal_connector: drawBoundsDiagonalConnector,
    square_enclosure: drawBoundsSquareEnclosure,
    upper_bowl: drawUpperBowl,
    enclosure_tail: drawEnclosureTail,
    bowl_leg: drawBowlLeg,
    turning_curve: drawTurningCurve,
    top_cross: drawBoundsTopCross,
    lower_container: drawBoundsLowerContainer,
    downward_v: drawDownwardV,
    double_v: drawDoubleV,
    cross: drawBoundsCentralCross,
    fork_down: drawForkDown,
    zigzag: drawBoundsTurningZhi,
  };
  (fns[type] || drawVerticalAxis)(ctx);
}

// 字母只决定画什么构件，不决定位置；位置由 getZoneForStep() 处理。
function getComponentTypeForLetter(letter) {
  return componentTypeMap[letter] || "vertical_axis";
}

function addToCurrentBlock(letter, zones = "none") {
  if (letter === "?" || letter === "-" || zones.length === 0) {
    invalidInput(letter, zones, "INVALID");
    return;
  }
  if (!/^[A-Z]$/.test(letter)) {
    invalidInput(letter, zones, "MISREAD");
    return;
  }

  finishActiveComponent();
  const stepIndex = currentLetters.length;
  const zone = getZoneForStep(stepIndex);
  const type = getComponentTypeForLetter(letter);
  const component = {
    letter,
    zones,
    type,
    stepIndex,
    zoneKey: "zone" + (stepIndex + 1),
    zone,
    role: zone.name,
    fitted: fitComponentToZone(type, zone),
    weight: zone.type === "compoundU" ? 0.9 : 1,
  };

  activeComponent = {
    component,
    started: millis(),
    duration: 520,
  };
  lastLetter = letter;
  lastZones = zones;
  statusText = "confirmed " + letter + " / " + (currentLetters.length + 1) + "-4";
}

// 输入顺序决定写入哪个区域
function getZoneForStep(stepIndex) {
  if (stepIndex === 0) return fixedWritingZones.zone1;
  if (stepIndex === 1) return fixedWritingZones.zone2;
  if (stepIndex === 2) return fixedWritingZones.zone3;
  if (stepIndex === 3) return fixedWritingZones.zone4;
  return fixedWritingZones.zone4;
}

function finishActiveComponent() {
  if (!activeComponent) return;
  currentComponents.push(activeComponent.component);
  currentLetters.push(activeComponent.component.letter);
  activeComponent = null;
  if (currentLetters.length >= 4) archiveCurrentBlock();
}

function fitComponentToZone(componentType, zone) {
  if (zone.type === "compoundU") {
    const parts = getCompoundUParts(zone);
    return {
      type: "compoundU",
      parts: parts.map((part) => ({ ...part })),
      bounds: compoundBounds(parts),
    };
  }

  return {
    type: "rect",
    bounds: {
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
    },
  };
}

function compoundBounds(parts) {
  const minX = min(parts.map((p) => p.x));
  const minY = min(parts.map((p) => p.y));
  const maxX = max(parts.map((p) => p.x + p.w));
  const maxY = max(parts.map((p) => p.y + p.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// 当前 block 满 4 个字母后归档
function archiveCompletedBlock() {
  // 这里把当前生成结果保存进 Archive。
  residueCounter++;
  const name = "R-" + String(residueCounter).padStart(3, "0");
  archiveBlocks.unshift({
    id: name,
    name,
    source: inputMode,
    recognisedWord: tabletExperience.glyphGroup?.recognisedWord || tabletExperience.glyphDNA?.nameText || tabletExperience.features?.recognitionFullText || null,
    traceHash: tabletExperience.glyphDNA?.traceHash || tabletExperience.features?.traceHash || null,
    recognitionConfidence: tabletExperience.glyphDNA?.recognitionConfidence ?? tabletExperience.features?.recognitionConfidence ?? 0,
    glyphDNA: tabletExperience.glyphDNA ? JSON.parse(JSON.stringify(tabletExperience.glyphDNA)) : null,
    glyphGroup: tabletExperience.glyphGroup ? JSON.parse(JSON.stringify(tabletExperience.glyphGroup)) : null,
    features: tabletExperience.features ? JSON.parse(JSON.stringify(tabletExperience.features)) : null,
    components: currentComponents.map((c) => JSON.parse(JSON.stringify(c))),
    timestamp: Date.now(),
  });
  archiveBlocks = archiveBlocks.slice(0, 8);
  currentLetters = [];
  currentComponents = [];
  statusText = "archived " + name;
}

function archiveCurrentBlock() {
  archiveCompletedBlock();
}

function invalidInput(letter, zones, reason) {
  lastLetter = letter;
  lastZones = zones || "none";
  misreadMark = { letter, zones, reason, born: millis(), life: 1250 };
  statusText = reason + " " + letter;
}

function handleTabletStatus(payload = {}) {
  console.log("[screen] handwriting-status", payload);
  if (payload.status === "HANDWRITING_RECEIVED") {
    tabletExperience.state = "WRITING_RECEIVED";
    tabletExperience.receivedAt = millis();
    tabletExperience.resetAt = 0;
    statusText = "handwriting received";
    lastLetter = "tablet";
    lastZones = payload.submissionId || "pending";
  }
  if (payload.status === "RECOGNISING") {
    tabletExperience.state = "RECOGNISING";
    tabletExperience.receivedAt = millis();
    statusText = "recognising handwriting";
    lastLetter = "RECOGNISING";
    lastZones = payload.submissionId || "gemini";
    console.log("[screen] RECOGNISING", payload.submissionId || "");
  }
}

function handleTabletResult(data) {
  const recognisedForKey = cleanRecognisedWord(data?.recognition?.fullText || "");
  const resultKey = data?.submissionId || recognisedForKey;
  const now = typeof millis === "function" ? millis() : Date.now();
  if (resultKey && recognisedForKey && resultKey === lastTabletResultKey && now - lastTabletResultAt < 1200) {
    console.log("[screen] duplicate handwriting-result ignored", resultKey);
    return;
  }
  lastTabletResultKey = resultKey;
  lastTabletResultAt = now;
  // 这里接收服务器识别出的名字，并准备进入生成动画。
  console.log("[screen] handwriting-result", {
    submissionId: data?.submissionId || "none",
    recognition: data?.recognition || null,
  });
  inputMode = "nameHandwriting";
  finishActiveComponent();
  currentLetters = [];
  currentComponents = [];
  const features = extractNameFeatures(data);
  const recognisedWord = cleanRecognisedWord(data?.recognition?.fullText || "");
  const traceImage = data?.traceImageBase64
    ? loadImage(data.traceImageBase64, () => {}, (error) => console.warn("[screen] trace image failed", error))
    : null;
  console.log("[screen] recognisedWord:", recognisedWord || "none");
  console.log("[screen] groups:", splitWordIntoGlyphGroups(recognisedWord).map((items) => items.join("")).join(" / ") || "none");
  tabletExperience = {
    state: recognisedWord.length >= 2 ? "TRACE_HOLD" : "UNREADABLE",
    data,
    features,
    glyphDNA: null,
    glyphGroup: null,
    fourZoneDNA: null,
    letters: [],
    receivedAt: millis(),
    generatedAt: 0,
    archivedAt: 0,
    resetAt: 0,
    notifiedArchive: false,
    traceImage,
  };
  statusText = recognisedWord.length >= 2 ? "trace hold after recognition" : "unreadable trace / write full word";
  lastLetter = recognisedWord || "UNREADABLE TRACE";
  lastZones = features.recognition?.mode || "unknown";
  if (recognisedWord.length < 2) tabletExperience.resetAt = millis();
}

function handleTabletHandwriting(data) {
  handleTabletResult(data);
}

function resetTabletExperienceForNextVisitor(reason = "external reset") {
  // 等待下一位观众前，清空上一轮临时状态。
  currentLetters = [];
  currentComponents = [];
  activeComponent = null;
  misreadMark = null;
  tabletExperience.state = "IDLE";
  tabletExperience.data = null;
  tabletExperience.features = null;
  tabletExperience.glyphDNA = null;
  tabletExperience.glyphGroup = null;
  tabletExperience.fourZoneDNA = null;
  tabletExperience.letters = [];
  tabletExperience.traceImage = null;
  tabletExperience.receivedAt = 0;
  tabletExperience.generatedAt = 0;
  tabletExperience.archivedAt = 0;
  tabletExperience.resetAt = 0;
  tabletExperience.notifiedArchive = false;
  statusText = "waiting";
  lastLetter = "none";
  lastZones = "none";
  console.log("[screen] next visitor reset", reason);
}

window.addEventListener("mizi:reset-experience", (event) => {
  resetTabletExperienceForNextVisitor(event.detail?.reason || "exhibition reset");
});

window.addEventListener("mizi:mock-handwriting-result", (event) => {
  handleTabletResult(event.detail || {});
});

window.addEventListener("mizi:handwriting-result", (event) => {
  handleTabletResult(event.detail || {});
});

function updateTabletExperience() {
  // 这里推进原始笔迹、生成动画、归档和失败重试。
  if (!tabletExperience || tabletExperience.state === "IDLE") return;
  const now = millis();
  const age = now - tabletExperience.receivedAt;
  if (tabletExperience.state === "WRITING_RECEIVED" || tabletExperience.state === "RECOGNISING") return;
  if (tabletExperience.state === "TRACE_HOLD" && age > 700) {
    tabletExperience.state = "TRACE_FADE";
    statusText = "fading raw trace";
    console.log("[screen] p5-state TRACE_HOLD -> TRACE_FADE", {
      recognisedWord: cleanRecognisedWord(tabletExperience.data?.recognition?.fullText || ""),
    });
  }
  if (tabletExperience.state === "TRACE_FADE" && age > 2600) {
    const generated = generateResidueFromTabletFeatures(tabletExperience.features);
    console.log("[screen] p5-generate", {
      generated,
      recognisedWord: cleanRecognisedWord(tabletExperience.data?.recognition?.fullText || ""),
    });
    if (generated) {
      tabletExperience.state = "GENERATING";
      tabletExperience.generatedAt = now;
      statusText = "generating word glyph group";
    } else {
      tabletExperience.state = "UNREADABLE";
      tabletExperience.resetAt = now;
      statusText = "unreadable trace / write full word";
    }
  }
  if (tabletExperience.state === "GENERATING" && now - tabletExperience.generatedAt > glyphGroupRevealDuration(tabletExperience.glyphGroup) + 900) {
    archiveCurrentBlock();
    tabletExperience.state = "ARCHIVED";
    tabletExperience.archivedAt = now;
    tabletExperience.notifiedArchive = true;
    statusText = "residue archived";
    console.log("[screen] p5-archived", {
      recognisedWord: tabletExperience.glyphGroup?.recognisedWord || "",
      groups: tabletExperience.glyphGroup?.groups?.map((letters) => letters.join("")) || [],
    });
    window.dispatchEvent(new CustomEvent("mizi:glyph-archived", {
      detail: {
        archivedAt: Date.now(),
        recognisedWord: tabletExperience.glyphGroup?.recognisedWord || "",
        groups: tabletExperience.glyphGroup?.groups?.map((letters) => letters.join("")) || [],
        archiveName: archiveBlocks[0]?.name || "",
      },
    }));
  }
  if (tabletExperience.state === "UNREADABLE" && now - tabletExperience.resetAt > 2000) {
    tabletExperience.state = "RESET";
    tabletExperience.resetAt = now;
    currentLetters = [];
    currentComponents = [];
    activeComponent = null;
    statusText = "reset";
  }
  if (!window.MI_ZI_EXHIBITION_PAGE && tabletExperience.state === "ARCHIVED" && now - tabletExperience.archivedAt > 8000) {
    tabletExperience.state = "RESET";
    tabletExperience.resetAt = now;
    currentLetters = [];
    currentComponents = [];
    activeComponent = null;
    statusText = "reset";
  }
  if (tabletExperience.state === "RESET" && now - tabletExperience.resetAt > 900) {
    tabletExperience.state = "IDLE";
    tabletExperience.data = null;
    tabletExperience.features = null;
    tabletExperience.glyphDNA = null;
    tabletExperience.glyphGroup = null;
    tabletExperience.fourZoneDNA = null;
    tabletExperience.letters = [];
    tabletExperience.traceImage = null;
    statusText = "waiting";
  }
}

function generateResidueFromTabletFeatures(features) {
  // 这里根据识别文字和笔迹特征生成最终字符。
  finishActiveComponent();
  currentLetters = [];
  currentComponents = [];
  const recognisedWord = validRecognisedWordFromFeatures(features);
  if (!recognisedWord) {
    tabletExperience.glyphDNA = null;
    tabletExperience.glyphGroup = null;
    tabletExperience.fourZoneDNA = null;
    tabletExperience.letters = [];
    lastLetter = "UNREADABLE TRACE";
    lastZones = "none";
    return false;
  }

  const glyphGroup = createGlyphGroupFromWord(recognisedWord, features);
  currentComponents = glyphGroupToComponents(glyphGroup);
  currentLetters = currentComponents.map((component) => component.letter);
  const glyphDNA = featuresToGlyphDNA({
    ...features,
    recognition: {
      ...(features.recognition || {}),
      fullText: recognisedWord,
      likelyText: recognisedWord,
      confidence: max(features.recognitionConfidence || 0.56, 0.56),
    },
    recognitionFullText: recognisedWord,
    recognitionLikelyText: recognisedWord,
  });
  tabletExperience.glyphDNA = glyphDNA;
  tabletExperience.glyphGroup = glyphGroup;
  tabletExperience.fourZoneDNA = null;
  tabletExperience.letters = glyphGroup.groups.flat();
  lastLetter = recognisedWord;
  lastZones = glyphGroup.groups.map((letters) => letters.join("")).join(" / ");
  return true;
}

function validRecognisedWordFromFeatures(features = {}) {
  const recognition = features.recognition || {};
  const candidates = [
    features.recognitionFullText,
    recognition.fullText,
    features.recognitionLikelyText,
    recognition.likelyText,
    ...(features.recognitionCandidates || []),
    ...(recognition.candidates || []),
  ];
  for (const candidate of candidates) {
    const word = cleanRecognisedWord(candidate);
    if (word.length >= 2) return word;
  }
  return "";
}

function hashString(input = "") {
  let hash = 2166136261;
  for (let i = 0; i < String(input).length; i++) {
    hash ^= String(input).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashNumberArray(values = []) {
  let hash = 2166136261;
  for (const value of values) {
    const text = (Number.isFinite(Number(value)) ? Number(value) : 0).toFixed(3);
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function combineHashes(...values) {
  return hashString(values.join("|"));
}

function constrain01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function cleanRecognisedWord(input = "") {
  return String(input).toUpperCase().replace(/[^A-Z]/g, "");
}

function splitWordIntoGlyphGroups(fullText) {
  const cleanWord = cleanRecognisedWord(fullText);
  // Keep five-letter names together because the last two letters share the centre layout.
  if (cleanWord.length === 5) return [cleanWord.split("")];

  const groups = [];
  for (let i = 0; i < cleanWord.length; i += 4) {
    groups.push(cleanWord.slice(i, i + 4).split(""));
  }
  return groups;
}

function createGlyphGroupFromWord(recognisedWord, traceFeatures = {}) {
  const cleanWord = cleanRecognisedWord(recognisedWord);
  const groups = splitWordIntoGlyphGroups(cleanWord);
  return {
    recognisedWord: cleanWord,
    groups,
    glyphs: groups.map((letters, index) => lettersToFourZoneDNA(letters, traceFeatures, index)),
    traceHash: traceFeatures.traceHash || 0,
    confidence: traceFeatures.recognitionConfidence || 0,
  };
}

function lettersToFourZoneDNA(letterGroup, traceFeatures = {}, groupIndex = 0) {
  const fixedLetters = letterGroup.slice(0, 5);
  // Letters choose glyph components; their position comes from the fixed square-zone order.
  const items = fixedLetters.map((letter, index) => componentDNAForLetter(letter, markerFormalZoneKeyForIndex(index, fixedLetters.length), groupIndex, traceFeatures));
  return {
    letters: [...fixedLetters],
    layoutType: fixedLetters.length === 5 ? "fixed_four_zone_split_core" : "fixed_four_zone",
    items,
    zone1: items[0] || null,
    zone2: items[1] || null,
    zone3: items[2] || null,
    zone4: items[3] || null,
    zone4Right: items[4] || null,
    traceStyle: {
      strokeWeight: traceFeatures.strokeCount ? constrain(1.08 - (traceFeatures.averageSpeed || 0) * 0.04, 0.72, 1.18) : 1,
      curvature: traceFeatures.curvature || 0,
      revealSpeed: traceFeatures.averageSpeed || 0,
    },
  };
}

function markerFormalZoneKeyForIndex(index, groupLength = 4) {
  if (groupLength === 5 && index === 3) return "zone4Left";
  if (groupLength === 5 && index === 4) return "zone4Right";
  return "zone" + (index + 1);
}

function markerFormalZoneForIndex(index, groupLength = 4) {
  if (groupLength === 5 && (index === 3 || index === 4)) {
    const z4 = fixedWritingZones.zone4;
    const gap = z4.w * 0.025;
    const halfW = (z4.w - gap) * 0.5;
    const x = index === 4 ? z4.x + halfW + gap : z4.x;
    return rectLayoutZone(4, index === 4 ? "inner_core_right" : "inner_core_left", x, z4.y, halfW, z4.h);
  }
  return [fixedWritingZones.zone1, fixedWritingZones.zone2, fixedWritingZones.zone3, fixedWritingZones.zone4][index] || getZoneForStep(index);
}

function rectLayoutZone(step, name, x, y, w, h) {
  return { step, name, type: "rect", x, y, w, h };
}

function getAdaptiveZonesForGroup(letterGroup = []) {
  // 这里决定一个方块内部每个字母放到哪个区域。
  const letters = letterGroup.map((letter) => cleanRecognisedWord(letter)[0]).filter(Boolean);
  if (letters.length === 1) return [rectLayoutZone(1, "single_full_square", 0.00, 0.00, 1.00, 1.00)];

  if (letters.length === 2) {
    if (chooseTwoLetterLayout(letters) === "top_bottom") {
      return [
        rectLayoutZone(1, "upper_half", 0.00, 0.00, 1.00, 0.50),
        rectLayoutZone(2, "lower_half", 0.00, 0.50, 1.00, 0.50),
      ];
    }
    return [
      rectLayoutZone(1, "left_half", 0.00, 0.00, 0.50, 1.00),
      rectLayoutZone(2, "right_half", 0.50, 0.00, 0.50, 1.00),
    ];
  }

  if (letters.length === 3) {
    return [
      rectLayoutZone(1, "left_full_height", 0.00, 0.00, 0.34, 1.00),
      rectLayoutZone(2, "right_upper_smaller", 0.34, 0.00, 0.66, 0.46),
      rectLayoutZone(3, "right_lower_larger", 0.34, 0.46, 0.66, 0.54),
    ];
  }

  if (letters.length === 5) {
    const z4 = fixedWritingZones.zone4;
    const gap = z4.w * 0.04;
    const childW = z4.w * 0.48;
    return [
      fixedWritingZones.zone1,
      fixedWritingZones.zone2,
      fixedWritingZones.zone3,
      rectLayoutZone(4, "inner_core_left", z4.x, z4.y, childW, z4.h),
      rectLayoutZone(4, "inner_core_right", z4.x + childW + gap, z4.y, childW, z4.h),
    ];
  }

  return [fixedWritingZones.zone1, fixedWritingZones.zone2, fixedWritingZones.zone3, fixedWritingZones.zone4].slice(0, letters.length);
}

function describeAdaptiveLayout(letterGroup = []) {
  const count = letterGroup.length;
  if (count === 1) return "single_full_square";
  if (count === 2) return chooseTwoLetterLayout(letterGroup) === "top_bottom" ? "two_top_bottom" : "two_left_right";
  if (count === 3) return "three_left_right_upper_lower";
  if (count === 5) return "five_single_square_split_inner";
  return "standard_four_zone";
}

function chooseTwoLetterLayout(letterGroup = []) {
  const letters = letterGroup.map((letter) => cleanRecognisedWord(letter)[0]).filter(Boolean);
  const score = letters.reduce((sum, letter) => sum + componentOrientationScore(getComponentTypeForLetter(letter)), 0);
  if (score >= 0.7) return "left_right";
  if (score <= -0.7) return "top_bottom";
  return hashString(letters.join("") || "MI") % 2 === 0 ? "left_right" : "top_bottom";
}

function componentOrientationScore(componentType) {
  const tall = new Set(["vertical_axis", "vertical_hook", "vertical_foot", "left_stem_double_attach", "double_vertical_bridge", "branching_stem"]);
  const wide = new Set(["horizontal_bar", "layered_three_bars", "top_cross", "top_bar_with_stem", "lower_container", "mountain_peaks", "double_valley"]);
  const neutralEnclosures = new Set(["square_enclosure", "half_enclosure", "upper_bowl", "open_corner", "open_enclosure_hook", "enclosure_tail"]);
  if (tall.has(componentType)) return 1;
  if (wide.has(componentType)) return -1;
  if (neutralEnclosures.has(componentType)) return 0.15;
  return 0;
}

function componentDNAForLetter(letter, zoneKey, groupIndex, traceFeatures = {}) {
  const cleanLetter = cleanRecognisedWord(letter)[0] || "";
  const componentType = getComponentTypeForLetter(cleanLetter);
  return {
    letter: cleanLetter,
    componentType,
    zoneKey,
    groupIndex,
    source: componentMap[cleanLetter]?.ref || "",
    note: componentMap[cleanLetter]?.note || "",
    weight: constrain(0.9 + (traceFeatures.strokeCount || 0) * 0.012, 0.9, 1.18),
  };
}

function glyphGroupToComponents(glyphGroup) {
  const components = [];
  for (let g = 0; g < (glyphGroup?.glyphs || []).length; g++) {
    const glyph = glyphGroup.glyphs[g];
    const zoneItems = glyph.items || [glyph.zone1, glyph.zone2, glyph.zone3, glyph.zone4].filter(Boolean);
    const groupLength = zoneItems.length || 4;
    for (let i = 0; i < zoneItems.length; i++) {
      const item = zoneItems[i];
      if (!item) continue;
      const zone = markerFormalZoneForIndex(i, groupLength);
      components.push({
        letter: item.letter,
        zones: "word-group",
        type: item.componentType,
        stepIndex: i,
        groupIndex: g,
        zoneKey: markerFormalZoneKeyForIndex(i, groupLength),
        zone,
        role: zone.name,
        fitted: fitComponentToZone(item.componentType, zone),
        weight: item.weight || (zone.type === "compoundU" ? 0.9 : 1),
      });
    }
  }
  return components;
}

function analyseFullWord(input = "") {
  const cleanWord = cleanRecognisedWord(input);
  const letters = cleanWord.split("");
  const familyCounts = { axis: 0, enclosure: 0, fork: 0, layer: 0, curve: 0, attachment: 0 };
  for (const letter of letters) {
    for (const [family, familyLetters] of Object.entries(LETTER_FAMILIES)) {
      if (familyLetters.has(letter)) familyCounts[family]++;
    }
  }
  const uniqueLetters = new Set(letters).size;
  const repeatedLetters = letters.length - uniqueLetters;
  const sortedFamilies = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);
  return {
    cleanWord,
    letters,
    length: letters.length,
    uniqueLetters,
    repeatedLetters,
    familyCounts,
    dominantFamily: sortedFamilies[0]?.[0] || "axis",
    secondaryFamily: sortedFamilies[1]?.[0] || "enclosure",
    wordHash: hashString(cleanWord || "TRACE_ONLY"),
  };
}

function normaliseTraceFeatures(features = {}) {
  return {
    strokeCount: Math.max(0, Number(features.strokeCount) || 0),
    totalLength: Math.max(0, Number(features.totalLength) || 0),
    bboxRatio: Math.max(0.1, Number(features.bboxRatio) || 1),
    curvature: features.pointCount
      ? constrain01(features.curvature / max(1, features.pointCount * 0.42))
      : constrain01(features.curvature),
    directionChanges: Math.max(0, Number(features.directionChanges) || 0),
    density: constrain01(features.density),
    averageSpeed: Math.max(0, Number(features.averageSpeed) || 0),
    pauseCount: Math.max(0, Number(features.pauseCount) || 0),
    verticalExtent: constrain01(features.verticalExtent),
    horizontalExtent: constrain01(features.horizontalExtent),
  };
}

function nameToFourZoneDNA(fullWord, traceFeatures = {}, traceHash = 0) {
  const wordAnalysis = analyseFullWord(fullWord);
  const trace = normaliseTraceFeatures(traceFeatures);
  const resolvedTraceHash = Number.isFinite(Number(traceHash)) && Number(traceHash) !== 0
    ? Number(traceHash) >>> 0
    : hashNumberArray([
      trace.strokeCount,
      trace.totalLength,
      trace.bboxRatio,
      trace.curvature,
      trace.directionChanges,
      trace.density,
      trace.averageSpeed,
      trace.pauseCount,
      trace.verticalExtent,
      trace.horizontalExtent,
    ]);
  const seed = combineHashes(wordAnalysis.cleanWord || "UNREADABLE", wordAnalysis.wordHash, resolvedTraceHash);
  const complexity = constrain01(wordAnalysis.length / 10 + trace.density * 0.25 + min(trace.directionChanges / 40, 0.25));
  const curvature = constrain(trace.curvature * 0.7 + wordAnalysis.familyCounts.curve * 0.08 + 0.15, 0.12, 0.95);
  const density = constrain(complexity * 0.65 + wordAnalysis.repeatedLetters * 0.08 + trace.density * 0.35, 0.15, 1);
  const symmetry = constrain((wordAnalysis.familyCounts.axis + wordAnalysis.familyCounts.enclosure + wordAnalysis.familyCounts.fork) / max(1, wordAnalysis.length), 0, 1);

  return {
    recognisedWord: wordAnalysis.cleanWord || null,
    lettersAnalysed: wordAnalysis.letters,
    wordAnalysis,
    traceHash: resolvedTraceHash,
    seed,
    style: {
      complexity,
      curvature,
      density,
      symmetry,
      strokeWeightFactor: map(constrain(trace.averageSpeed, 0, 3), 0, 3, 1.15, 0.85),
    },
    zone1: createZoneDNA("zone1", wordAnalysis, trace, seed, 11),
    zone2: createZoneDNA("zone2", wordAnalysis, trace, seed, 22),
    zone3: createZoneDNA("zone3", wordAnalysis, trace, seed, 33),
    zone4: createZoneDNA("zone4", wordAnalysis, trace, seed, 44),
  };
}

function createZoneDNA(zoneId, wordAnalysis, trace, seed, salt) {
  const candidates = getWeightedZoneCandidates(zoneId, wordAnalysis, trace);
  const componentType = pickSeeded(candidates, seed, salt);
  return {
    componentType,
    variant: floor(seededUnit(seed, salt + 1) * 4),
    density: constrain(trace.density * 0.5 + wordAnalysis.length / 14 + seededUnit(seed, salt + 2) * 0.2, 0.15, 1),
    curvature: constrain(trace.curvature * 0.65 + wordAnalysis.familyCounts.curve * 0.09 + seededUnit(seed, salt + 3) * 0.15, 0.1, 0.95),
    asymmetry: (seededUnit(seed, salt + 4) - 0.5) * min(0.16, trace.directionChanges / 300),
    seed: combineHashes(seed, zoneId, salt),
  };
}

function getWeightedZoneCandidates(zoneId, wordAnalysis, trace) {
  const result = [...ZONE_COMPONENTS[zoneId]];
  const counts = wordAnalysis.familyCounts;
  if (zoneId === "zone1") {
    repeatPush(result, "straight_axis", counts.axis + 1);
    repeatPush(result, "forked_axis", counts.fork);
    repeatPush(result, "curved_axis", counts.curve);
    repeatPush(result, "double_axis", counts.layer);
    repeatPush(result, "hooked_axis", counts.attachment);
    if (trace.verticalExtent > trace.horizontalExtent) repeatPush(result, "straight_axis", 3);
  }
  if (zoneId === "zone2") {
    repeatPush(result, "single_crown", counts.axis);
    repeatPush(result, "double_crown", counts.layer);
    repeatPush(result, "triple_layer", counts.layer + 1);
    repeatPush(result, "human_crown", counts.fork);
    repeatPush(result, "fork_crown", counts.fork);
    repeatPush(result, "curved_crown", counts.curve);
    if (trace.bboxRatio > 1.4) repeatPush(result, "triple_layer", 3);
  }
  if (zoneId === "zone3") {
    repeatPush(result, "plain_u_frame", counts.enclosure + 1);
    repeatPush(result, "double_pillar_u", counts.axis);
    repeatPush(result, "open_u_frame", counts.attachment);
    repeatPush(result, "curved_u_frame", counts.curve);
    repeatPush(result, "side_attachment_u", counts.attachment + 1);
    repeatPush(result, "layered_u_frame", counts.layer);
    if (trace.curvature > 0.55) repeatPush(result, "curved_u_frame", 4);
  }
  if (zoneId === "zone4") {
    repeatPush(result, "inner_cross", counts.fork);
    repeatPush(result, "inner_enclosure", counts.enclosure);
    repeatPush(result, "inner_fork", counts.fork + 1);
    repeatPush(result, "inner_layers", counts.layer);
    repeatPush(result, "inner_curve", counts.curve);
    repeatPush(result, "inner_double_pillar", counts.axis);
    if (trace.directionChanges > 15) repeatPush(result, "inner_cross", 3);
  }
  return result;
}

function repeatPush(array, value, count) {
  for (let i = 0; i < Math.max(0, floor(count)); i++) array.push(value);
}

function pickSeeded(list, seed, salt = 0) {
  if (!Array.isArray(list) || !list.length) return "straight_axis";
  const index = floor(seededUnit(seed, salt) * list.length);
  return list[min(index, list.length - 1)];
}

function getRectBounds(zone, gridX, gridY, gridSize) {
  return {
    x: gridX + zone.x * gridSize,
    y: gridY + zone.y * gridSize,
    w: zone.w * gridSize,
    h: zone.h * gridSize,
  };
}

function getZone3Bounds(gridX, gridY, gridSize) {
  return {
    outer: getRectBounds(fixedWritingZones.zone3.outer, gridX, gridY, gridSize),
    innerCutout: getRectBounds(fixedWritingZones.zone3.innerCutout, gridX, gridY, gridSize),
  };
}

function drawGlyphFromFourZoneDNA(dna, gridX, gridY, gridSize, options = {}) {
  if (!dna) return;
  const reveal = constrain01(options.reveal ?? 1);
  const archiveScale = options.archiveScale ?? 1;
  const baseWeight = max(1.2, gridSize * 0.012 * archiveScale * (dna.style?.strokeWeightFactor || 1));
  drawZone1Component(dna.zone1, getRectBounds(fixedWritingZones.zone1, gridX, gridY, gridSize), baseWeight, constrain01(reveal / 0.25));
  drawZone2Component(dna.zone2, getRectBounds(fixedWritingZones.zone2, gridX, gridY, gridSize), baseWeight, constrain01((reveal - 0.18) / 0.28));
  drawZone3Component(dna.zone3, getZone3Bounds(gridX, gridY, gridSize), baseWeight, constrain01((reveal - 0.40) / 0.35));
  drawZone4Component(dna.zone4, getRectBounds(fixedWritingZones.zone4, gridX, gridY, gridSize), baseWeight, constrain01((reveal - 0.68) / 0.32));
}

function drawZone1Component(dna, b, weight, reveal) {
  const cx = b.x + b.w * 0.58;
  const top = b.y + b.h * 0.04;
  const bottom = b.y + b.h * 0.96;
  const opts = { weight, progress: reveal, seed: dna.seed };
  if (dna.componentType === "curved_axis") drawSealCurve([{ x: cx, y: top }, { x: b.x + b.w * 0.25, y: b.y + b.h * 0.30 }, { x: b.x + b.w * 0.85, y: b.y + b.h * 0.70 }, { x: cx, y: bottom }], opts);
  else if (dna.componentType === "forked_axis") {
    drawSealVertical(cx, b.y + b.h * 0.20, bottom, opts);
    drawSealCurve([{ x: cx, y: b.y + b.h * 0.22 }, { x: b.x + b.w * 0.12, y: top }], { ...opts, seed: dna.seed + 1 });
    drawSealCurve([{ x: cx, y: b.y + b.h * 0.22 }, { x: b.x + b.w * 0.92, y: top }], { ...opts, seed: dna.seed + 2 });
  } else if (dna.componentType === "double_axis") {
    drawSealVertical(b.x + b.w * 0.38, top, bottom, opts);
    drawSealVertical(b.x + b.w * 0.72, top, bottom, { ...opts, seed: dna.seed + 3 });
  } else if (dna.componentType === "hooked_axis") drawSealHookTail(cx, top, bottom, "right", opts);
  else if (dna.componentType === "segmented_axis") {
    drawSealVertical(cx, top, b.y + b.h * 0.45, opts);
    drawSealVertical(cx, b.y + b.h * 0.55, bottom, { ...opts, seed: dna.seed + 4 });
  } else drawSealVertical(cx, top, bottom, opts);
}

function drawZone2Component(dna, b, weight, reveal) {
  const opts = { weight, progress: reveal, seed: dna.seed };
  const left = b.x + b.w * 0.04;
  const right = b.x + b.w * 0.96;
  if (dna.componentType === "double_crown") {
    drawSealHorizontal(left, right, b.y + b.h * 0.34, opts);
    drawSealHorizontal(b.x + b.w * 0.12, b.x + b.w * 0.88, b.y + b.h * 0.72, { ...opts, seed: dna.seed + 1 });
  } else if (dna.componentType === "triple_layer") {
    for (let i = 0; i < 3; i++) drawSealHorizontal(left + i * b.w * 0.03, right - i * b.w * 0.03, b.y + b.h * (0.24 + i * 0.28), { ...opts, seed: dna.seed + i });
  } else if (dna.componentType === "human_crown" || dna.componentType === "fork_crown") {
    const cx = b.x + b.w * 0.5;
    drawSealCurve([{ x: cx, y: b.y + b.h * 0.88 }, { x: b.x + b.w * 0.18, y: b.y + b.h * 0.12 }], opts);
    drawSealCurve([{ x: cx, y: b.y + b.h * 0.88 }, { x: b.x + b.w * 0.82, y: b.y + b.h * 0.12 }], { ...opts, seed: dna.seed + 2 });
    if (dna.componentType === "fork_crown") drawSealVertical(cx, b.y + b.h * 0.46, b.y + b.h * 0.94, { ...opts, seed: dna.seed + 3 });
  } else if (dna.componentType === "curved_crown") drawSealCurve([{ x: left, y: b.y + b.h * 0.65 }, { x: b.x + b.w * 0.28, y: b.y + b.h * 0.10 }, { x: b.x + b.w * 0.72, y: b.y + b.h * 0.10 }, { x: right, y: b.y + b.h * 0.65 }], opts);
  else drawSealHorizontal(left, right, b.y + b.h * 0.52, opts);
}

function drawZone3Component(dna, bounds, weight, reveal) {
  const o = bounds.outer;
  const c = bounds.innerCutout;
  const leftX = o.x + o.w * 0.08;
  const rightX = o.x + o.w * 0.92;
  const topY = o.y + o.h * 0.06;
  const bottomY = o.y + o.h * 0.96;
  const opts = { weight, progress: reveal, seed: dna.seed };
  const drawBaseU = (seedAdd = 0) => {
    drawSealVertical(leftX, topY, bottomY, { ...opts, seed: dna.seed + seedAdd });
    drawSealCurve([{ x: leftX, y: bottomY }, { x: o.x + o.w * 0.34, y: bottomY + o.h * 0.02 }, { x: o.x + o.w * 0.66, y: bottomY + o.h * 0.02 }, { x: rightX, y: bottomY }], { ...opts, seed: dna.seed + seedAdd + 1 });
    drawSealVertical(rightX, bottomY, topY, { ...opts, seed: dna.seed + seedAdd + 2 });
  };
  if (dna.componentType === "curved_u_frame") {
    drawSealCurve([{ x: leftX, y: topY }, { x: o.x, y: o.y + o.h * 0.35 }, { x: o.x, y: o.y + o.h * 0.72 }, { x: leftX, y: bottomY }], opts);
    drawSealCurve([{ x: leftX, y: bottomY }, { x: o.x + o.w * 0.30, y: o.y + o.h }, { x: o.x + o.w * 0.70, y: o.y + o.h }, { x: rightX, y: bottomY }], { ...opts, seed: dna.seed + 4 });
    drawSealCurve([{ x: rightX, y: bottomY }, { x: o.x + o.w, y: o.y + o.h * 0.70 }, { x: o.x + o.w, y: o.y + o.h * 0.30 }, { x: rightX, y: topY }], { ...opts, seed: dna.seed + 5 });
  } else {
    drawBaseU();
    if (dna.componentType === "double_pillar_u") drawSealVertical(o.x + o.w * 0.25, topY, bottomY, { ...opts, weight: weight * 0.75, seed: dna.seed + 6 });
    if (dna.componentType === "side_attachment_u") drawSealHorizontal(leftX, c.x, c.y + c.h * 0.35, { ...opts, weight: weight * 0.85, seed: dna.seed + 7 });
    if (dna.componentType === "layered_u_frame") {
      drawSealHorizontal(leftX, rightX, o.y + o.h * 0.30, { ...opts, weight: weight * 0.72, seed: dna.seed + 8 });
      drawSealHorizontal(leftX, rightX, o.y + o.h * 0.48, { ...opts, weight: weight * 0.72, seed: dna.seed + 9 });
    }
  }
}

function drawZone4Component(dna, b, weight, reveal) {
  const opts = { weight, progress: reveal, seed: dna.seed };
  const left = b.x + b.w * 0.12;
  const right = b.x + b.w * 0.88;
  const top = b.y + b.h * 0.08;
  const bottom = b.y + b.h * 0.94;
  const cx = b.x + b.w * 0.5;
  const cy = b.y + b.h * 0.52;
  if (dna.componentType === "inner_cross") {
    drawSealVertical(cx, top, bottom, opts);
    drawSealHorizontal(left, right, cy, { ...opts, seed: dna.seed + 1 });
  } else if (dna.componentType === "inner_enclosure") drawSealEnclosure(left, top, right - left, bottom - top, opts);
  else if (dna.componentType === "inner_fork") drawSealFork(left, top, right - left, bottom - top, opts);
  else if (dna.componentType === "inner_layers") drawSealLayeredBars(left, top, right - left, bottom - top, 3, opts);
  else if (dna.componentType === "inner_curve") drawSealCurve([{ x: left, y: top }, { x: right, y: b.y + b.h * 0.24 }, { x: left, y: b.y + b.h * 0.68 }, { x: right, y: bottom }], opts);
  else if (dna.componentType === "inner_double_pillar") {
    drawSealVertical(b.x + b.w * 0.34, top, bottom, opts);
    drawSealVertical(b.x + b.w * 0.66, top, bottom, { ...opts, seed: dna.seed + 2 });
  } else drawSealVertical(cx, top, bottom, opts);
}

function drawArchiveItem(archiveItem, x, y, size) {
  if (!archiveItem?.fourZoneDNA) return;
  drawGlyphFromFourZoneDNA(archiveItem.fourZoneDNA, x, y, size, { reveal: 1, archiveScale: 0.72 });
}

function runFourZoneDNATest() {
  const testTraceJing = { strokeCount: 5, totalLength: 1380, bboxRatio: 1.6, curvature: 0.64, directionChanges: 19, density: 0.52, averageSpeed: 1.2, pauseCount: 3, verticalExtent: 0.7, horizontalExtent: 0.84 };
  const testTraceXuan = { strokeCount: 7, totalLength: 1620, bboxRatio: 1.35, curvature: 0.38, directionChanges: 27, density: 0.67, averageSpeed: 0.9, pauseCount: 4, verticalExtent: 0.78, horizontalExtent: 0.73 };
  const jingDNA = nameToFourZoneDNA("JING", testTraceJing, hashString("JING_TRACE"));
  const xuanDNA = nameToFourZoneDNA("XUAN", testTraceXuan, hashString("XUAN_TRACE"));
  console.table({
    JING: { word: jingDNA.recognisedWord, zone1: jingDNA.zone1.componentType, zone2: jingDNA.zone2.componentType, zone3: jingDNA.zone3.componentType, zone4: jingDNA.zone4.componentType, seed: jingDNA.seed },
    XUAN: { word: xuanDNA.recognisedWord, zone1: xuanDNA.zone1.componentType, zone2: xuanDNA.zone2.componentType, zone3: xuanDNA.zone3.componentType, zone4: xuanDNA.zone4.componentType, seed: xuanDNA.seed },
  });
  return { jingDNA, xuanDNA };
}

function analyzeNameText(nameText) {
  const cleanName = String(nameText || "").toUpperCase().replace(/[^A-Z]/g, "");
  const letters = cleanName.split("");
  const familyCounts = {
    axis: 0,
    enclosure: 0,
    fork: 0,
    layer: 0,
    curve: 0,
    attachment: 0,
  };
  const seen = {};
  let vowelCount = 0;
  let ascenderCount = 0;
  let descenderCount = 0;

  for (const letter of letters) {
    const family = nameFamilyByLetter[letter] || "axis";
    familyCounts[family]++;
    seen[letter] = (seen[letter] || 0) + 1;
    if (VOWELS.has(letter)) vowelCount++;
    if (ASCENDERS.has(letter)) ascenderCount++;
    if (DESCENDERS.has(letter)) descenderCount++;
  }

  const familyWeights = { axis: 1.00, enclosure: 0.95, fork: 1.08, layer: 1.02, curve: 1.12, attachment: 1.00 };
  const ranked = Object.entries(familyCounts).sort((a, b) => {
    const weighted = b[1] * familyWeights[b[0]] - a[1] * familyWeights[a[0]];
    return weighted || b[1] - a[1];
  });
  const repeatedLetters = Object.keys(seen).filter((letter) => seen[letter] > 1);
  const familySpread = ranked.filter(([, count]) => count > 0).length;
  const length = letters.length;

  return {
    cleanName,
    length,
    letters,
    familyCounts,
    dominantFamily: ranked[0]?.[1] ? ranked[0][0] : "axis",
    secondaryFamily: ranked[1]?.[1] ? ranked[1][0] : "axis",
    vowelCount,
    consonantCount: max(0, length - vowelCount),
    repeatedLetters,
    hasDescenders: descenderCount > 0,
    hasAscenders: ascenderCount > 0,
    structureScore: constrain(length / 8 + familySpread * 0.12 + repeatedLetters.length * 0.08, 0, 1),
    familySpread,
  };
}

function extractNameFeatures(data) {
  const handwriting = extractHandwritingFeatures(data);
  const recognition = data?.recognition || { fullText: null, likelyText: null, confidence: 0, candidates: [], mode: "fallback" };
  const fullText = recognition.confidence >= 0.55 ? (recognition.fullText || recognition.likelyText || "") : "";
  const nameAnalysis = analyzeNameText(fullText || "");
  return {
    ...handwriting,
    submissionId: data?.submissionId || recognition.submissionId || null,
    nameText: nameAnalysis.cleanName,
    nameAnalysis,
    recognition,
    recognitionFullText: recognition.fullText || null,
    recognitionLikelyText: recognition.fullText || recognition.likelyText || null,
    recognitionCandidates: recognition.candidates || [],
    recognitionConfidence: recognition.confidence || 0,
  };
}

function extractHandwritingFeatures(data) {
  const strokes = Array.isArray(data?.strokes) ? data.strokes : [];
  const cameraFeatures = data?.visualFeatures;
  if (!strokes.length && cameraFeatures) {
    return {
      strokeCount: max(1, Number(cameraFeatures.strokeCount) || 1),
      pointCount: max(1, Number(cameraFeatures.pointCount) || 1),
      totalLength: max(1, Number(cameraFeatures.totalLength) || 1),
      traceHash: Number(cameraFeatures.traceHash) || hashString(data?.imageBase64 || "camera"),
      bboxWidth: max(1, Number(cameraFeatures.bboxWidth) || 1),
      bboxHeight: max(1, Number(cameraFeatures.bboxHeight) || 1),
      directionChanges: max(0, Number(cameraFeatures.directionChanges) || 0),
      bboxRatio: max(0.1, Number(cameraFeatures.bboxRatio) || 1),
      density: constrain(Number(cameraFeatures.density) || 0, 0, 1),
      canvasDensity: constrain(Number(cameraFeatures.canvasDensity) || 0, 0, 1),
      averagePressure: constrain(Number(cameraFeatures.averagePressure) || 0.5, 0, 1),
      averageSpeed: max(0, Number(cameraFeatures.averageSpeed) || 0.55),
      pauseCount: max(0, Number(cameraFeatures.pauseCount) || 0),
      angleBias: Number(cameraFeatures.angleBias) || 0,
      angleVariance: constrain(Number(cameraFeatures.angleVariance) || 0, 0, 1),
      curvature: max(0, Number(cameraFeatures.curvature) || 0),
      verticalExtent: constrain(Number(cameraFeatures.verticalExtent) || 0, 0, 1),
      horizontalExtent: constrain(Number(cameraFeatures.horizontalExtent) || 0, 0, 1),
      sourceType: "camera",
      inkCoverage: constrain(Number(cameraFeatures.inkCoverage) || 0, 0, 1),
      roughness: constrain(Number(cameraFeatures.roughness) || 0, 0, 1),
    };
  }
  let totalLength = 0;
  let directionChanges = 0;
  let pressureSum = 0;
  let pressureCount = 0;
  let pointCount = 0;
  let pauseCount = 0;
  let angleSin = 0;
  let angleCos = 0;
  let angleCount = 0;
  let curvature = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let firstT = Infinity;
  let lastT = -Infinity;

  for (const stroke of strokes) {
    let previousAngle = null;
    for (let i = 0; i < stroke.length; i++) {
      const pt = stroke[i];
      minX = min(minX, pt.x);
      minY = min(minY, pt.y);
      maxX = max(maxX, pt.x);
      maxY = max(maxY, pt.y);
      firstT = min(firstT, pt.t || data.timestamp || Date.now());
      lastT = max(lastT, pt.t || data.timestamp || Date.now());
      pressureSum += pt.pressure ?? 0.5;
      pressureCount++;
      pointCount++;
      if (i > 0) {
        const prev = stroke[i - 1];
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        const segmentLength = sqrt(dx * dx + dy * dy);
        totalLength += segmentLength;
        const angle = atan2(dy, dx);
        angleSin += sin(angle);
        angleCos += cos(angle);
        angleCount++;
        if (pt.t && prev.t && pt.t - prev.t > 260) pauseCount++;
        if (previousAngle !== null) {
          const diff = abs(angleDifference(angle, previousAngle));
          curvature += diff;
          if (diff > 0.82) directionChanges++;
        }
        previousAngle = angle;
      }
    }
  }

  const bboxW = isFinite(minX) ? max(1, maxX - minX) : 1;
  const bboxH = isFinite(minY) ? max(1, maxY - minY) : 1;
  const duration = max(1, lastT - firstT);
  const canvasArea = max(1, (data?.width || bboxW) * (data?.height || bboxH));
  const bboxArea = max(1, bboxW * bboxH);
  const resultant = angleCount ? sqrt(angleSin * angleSin + angleCos * angleCos) / angleCount : 0;
  return {
    strokeCount: strokes.length,
    pointCount,
    totalLength,
    traceHash: hashTrace(strokes, totalLength, directionChanges),
    bboxWidth: bboxW,
    bboxHeight: bboxH,
    directionChanges,
    bboxRatio: bboxW / bboxH,
    density: constrain(totalLength / bboxArea * 6.5, 0, 1),
    canvasDensity: constrain(totalLength / canvasArea * 10, 0, 1),
    averagePressure: pressureCount ? pressureSum / pressureCount : 0.5,
    averageSpeed: totalLength / duration,
    pauseCount,
    angleBias: angleCount ? atan2(angleSin / angleCount, angleCos / angleCount) : 0,
    angleVariance: constrain(1 - resultant, 0, 1),
    curvature,
    verticalExtent: bboxH / max(1, data?.height || bboxH),
    horizontalExtent: bboxW / max(1, data?.width || bboxW),
  };
}

function hashTrace(strokes, totalLength, directionChanges) {
  let hash = 2166136261;
  for (const stroke of strokes) {
    hash ^= stroke.length;
    hash = Math.imul(hash, 16777619);
    const stride = max(1, floor(stroke.length / 12));
    for (let i = 0; i < stroke.length; i += stride) {
      const pt = stroke[i];
      hash ^= floor((pt.x || 0) * 10) + floor((pt.y || 0) * 17) + floor((pt.pressure || 0.5) * 100);
      hash = Math.imul(hash, 16777619);
    }
  }
  hash ^= floor(totalLength) + directionChanges * 131;
  return hash >>> 0;
}

function angleDifference(a, b) {
  return atan2(sin(a - b), cos(a - b));
}

function featuresToGlyphDNA(features) {
  const nameAnalysis = features.nameAnalysis || analyzeNameText(features.nameText || "");
  const hasRecognitionText = Boolean(nameAnalysis.cleanName && features.recognitionConfidence >= 0.55);
  const nameLength = nameAnalysis.length || 0;
  const familyCounts = nameAnalysis.familyCounts || {};
  const traceFamily = familyFromTraceFeatures(features);
  const dominantFamily = hasRecognitionText ? (nameAnalysis.dominantFamily || "axis") : traceFamily;
  const secondaryFamily = nameAnalysis.secondaryFamily || "axis";
  const complexity = constrain((features.strokeCount * 0.14) + (features.directionChanges * 0.055) + (features.totalLength / 3600), 0, 1);
  const curveLevel = constrain(features.curvature / max(1, features.pointCount * 0.42), 0, 1);
  const verticality = constrain((features.bboxHeight / max(1, features.bboxWidth + features.bboxHeight)) * 1.45, 0, 1);
  const horizontality = constrain((features.bboxWidth / max(1, features.bboxWidth + features.bboxHeight)) * 1.45, 0, 1);
  const speed = constrain(features.averageSpeed / 1.25, 0, 1);
  const pauses = constrain(features.pauseCount / 8, 0, 1);
  const symmetryLevel = 1 - constrain(abs(features.bboxRatio - 1), 0, 1);
  const angleBias = features.angleBias || 0;
  const familyDenominator = max(1, nameLength);
  const branchiness = constrain((features.directionChanges / 18) + abs(sin(angleBias)) * 0.28 + (hasRecognitionText ? (familyCounts.fork || 0) / familyDenominator * 0.55 : features.angleVariance * 0.45), 0, 1);
  const roundness = constrain(curveLevel + (features.bboxRatio > 0.72 && features.bboxRatio < 1.35 ? 0.12 : 0) + (hasRecognitionText ? (familyCounts.enclosure || 0) / familyDenominator * 0.45 : features.density * 0.22), 0, 1);
  const layerLevel = constrain(hasRecognitionText ? (familyCounts.layer || 0) / familyDenominator + (familyCounts.axis || 0) / familyDenominator * 0.32 : features.canvasDensity + features.horizontalExtent * 0.32, 0, 1);
  const strokeComplexity = constrain(complexity * 0.58 + pauses * 0.16 + (hasRecognitionText ? nameAnalysis.structureScore * 0.72 : features.angleVariance * 0.42 + features.density * 0.34), 0, 1);
  const openingDirection = angleBias > 0.45 ? "right" : angleBias < -0.45 ? "left" : features.bboxRatio > 1.25 ? "wide" : "center";
  const templateInput = {
    nameAnalysis,
    dominantFamily,
    secondaryFamily,
    nameLength,
    familySpread: hasRecognitionText ? nameAnalysis.familySpread : 0,
    fallbackTemplate: "disabled_legacy_template",
    strokeComplexity,
    innerDensity: constrain(complexity * 0.45 + nameAnalysis.structureScore * 0.62, 0, 1),
    curveLevel,
    roundness,
    branchiness,
    verticality,
    openingDirection,
  };

  return {
    nameText: nameAnalysis.cleanName,
    nameHash: hashName(nameAnalysis.cleanName),
    nameAnalysis,
    hasRecognitionText,
    recognitionFullText: features.recognitionFullText || features.recognitionLikelyText || null,
    recognitionLikelyText: features.recognitionLikelyText || null,
    recognitionCandidates: features.recognitionCandidates || [],
    recognitionConfidence: features.recognitionConfidence || 0,
    recognitionMode: features.recognition?.mode || "fallback",
    traceHash: features.traceHash,
    fallbackTemplate: templateInput.fallbackTemplate,
    dominantFamily,
    secondaryFamily,
    familyCounts,
    nameLength,
    familySpread: nameAnalysis.familySpread,
    mainStructure: dominantFamily === "axis" || verticality > 0.62 ? "vertical_seal" : horizontality > 0.62 ? "wide_seal" : "balanced_seal",
    enclosureType: complexity > 0.68 ? "dense_enclosure" : roundness > 0.52 ? "soft_enclosure" : "open_frame",
    innerDensity: hasRecognitionText ? templateInput.innerDensity : constrain(complexity * 0.58 + features.density * 0.52, 0, 1),
    curveLevel,
    roundness,
    branchiness,
    layerLevel,
    symmetryLevel,
    verticality,
    horizontality,
    openingDirection,
    strokeComplexity,
    sealVariantSeed: floor(((hasRecognitionText ? hashName(nameAnalysis.cleanName) : features.traceHash) + features.totalLength + features.directionChanges * 17 + features.strokeCount * 31) % 997),
    averageSpeed: speed,
    pauseMarkLevel: pauses,
    structureTemplate: "disabled_legacy_template",
  };
}

function hashName(name) {
  let hash = 17;
  for (let i = 0; i < String(name || "").length; i++) {
    hash = (hash * 31 + String(name).charCodeAt(i)) % 1000003;
  }
  return hash;
}

function familyFromTraceFeatures(features) {
  const hashChoice = ["axis", "enclosure", "fork", "layer", "curve", "attachment"][(features.traceHash || 0) % 6];
  if (features.curvature / max(1, features.pointCount * 0.42) > 0.62) return "curve";
  if (features.bboxRatio > 1.55 && features.directionChanges > 5) return "layer";
  if (features.angleVariance > 0.56 && features.directionChanges > 4) return "fork";
  if (features.verticalExtent > 0.66 || features.bboxRatio < 0.72) return "axis";
  if (features.density > 0.52) return "enclosure";
  if (features.directionChanges > 8) return "attachment";
  return hashChoice;
}

function templateFromTraceFeatures(features, family) {
  if (features.strokeCount >= 7 || (features.directionChanges > 12 && features.density > 0.42)) return "hybrid_template";
  if (family === "axis") return "central_axis_template";
  if (family === "enclosure") return "enclosure_template";
  if (family === "fork") return "fork_template";
  if (family === "layer") return "layered_template";
  if (family === "curve") return "curve_template";
  if (family === "attachment") return "side_attachment_template";
  return ["central_axis_template", "enclosure_template", "fork_template", "layered_template", "curve_template", "side_attachment_template"][(features.traceHash || 0) % 6];
}

function glyphDNAToComponentPlan(dna) {
  const mainType = dna.mainStructure === "vertical_seal"
    ? "vertical_hook"
    : dna.mainStructure === "wide_seal"
      ? "double_vertical_bridge"
      : "central_cross";

  const topType = dna.openingDirection === "left"
    ? "turning_zhi"
    : dna.openingDirection === "right"
      ? "branching_stem"
      : dna.symmetryLevel > 0.62
        ? "top_cross"
        : "layered_three_bars";

  const outerType = dna.enclosureType === "dense_enclosure"
    ? "square_enclosure"
    : dna.enclosureType === "soft_enclosure"
      ? "turning_curve"
      : dna.openingDirection === "wide"
        ? "open_person"
        : "diagonal_connector";

  const innerType = dna.innerDensity > 0.72
    ? "double_valley"
    : dna.pauseMarkLevel > 0.42
      ? "layered_three_bars"
      : dna.averageSpeed > 0.62
        ? "downward_open"
        : "lower_container";

  const heavy = lerp(0.82, 1.28, 1 - dna.averageSpeed);
  const complex = lerp(0.82, 1.22, dna.strokeComplexity);
  return [
    { type: mainType, weight: heavy },
    { type: topType, weight: lerp(0.72, 1.08, dna.verticality) },
    { type: outerType, weight: complex },
    { type: innerType, weight: lerp(0.72, 1.12, dna.innerDensity) },
  ];
}

// Handwriting is not OCR-recognised. It is transformed into generative parameters for the Mi Zi Grid residue.
// 系统不识别名字的具体语义，而是提取书写轨迹的形式特征，将其转译为米字格中的名字残迹。
function mapHandwritingFeaturesToLetters(features) {
  const first = pickByThreshold(features.strokeCount, [2, 4, 7], ["I", "J", "B", "K"]);
  const second = pickByThreshold(features.totalLength, [600, 1400, 2400], ["T", "E", "H", "M"]);
  const third = pickByThreshold(features.directionChanges, [3, 8, 15], ["N", "Z", "S", "G"]);
  const combined = features.bboxRatio + features.averageSpeed * 0.15 + features.averagePressure * 0.75;
  const fourth = pickByThreshold(combined, [1.15, 1.75, 2.45], ["O", "U", "A", "X"]);
  return [first, second, third, fourth];
}

function pickByThreshold(value, thresholds, letters) {
  for (let i = 0; i < thresholds.length; i++) {
    if (value < thresholds[i]) return letters[i];
  }
  return letters[letters.length - 1];
}

function drawMisreadFeedback(x, y, side) {
  const age = millis() - misreadMark.born;
  const t = 1 - constrain(age / misreadMark.life, 0, 1);
  if (t <= 0) {
    misreadMark = null;
    return;
  }

  push();
  translate(x, y);
  stroke(rgba(PALETTE.red, 220 * t));
  strokeWeight(2);
  noFill();
  rect(side * 0.16, side * 0.16, side * 0.68, side * 0.68);
  line(side * 0.18, side * 0.18, side * 0.82, side * 0.82);
  line(side * 0.82, side * 0.18, side * 0.18, side * 0.82);
  noStroke();
  fill(rgba(PALETTE.red, 230 * t));
  textFont("Courier New");
  textSize(14);
  textAlign(CENTER);
  text(misreadMark.reason + ": " + misreadMark.letter, side / 2, side * 0.92);
  textAlign(LEFT);
  textFont("Georgia");
  pop();
}

// 绘制完成后的 archive 缩略图
function drawArchive() {
  if (window.MI_ZI_EXHIBITION_PAGE) {
    const pageState = document.body?.dataset?.state || "";
    if (pageState !== "result_archived") return;
  }
  const layout = exhibitionLayoutMetrics();
  const x = exhibitionMode ? layout.rightX : width * 0.725;
  const y = exhibitionMode ? layout.rightY : height * 0.235;
  const w = exhibitionMode ? layout.rightW : width * 0.215;
  const h = exhibitionMode ? layout.rightH : height * 0.58;
  noFill();
  stroke(rgba(PALETTE.ink, exhibitionMode ? 22 : 26));
  rect(x, y, w, h);
  noStroke();
  fill(rgba(PALETTE.ink, 198));
  textFont("Georgia");
  textSize(20);
  text("Residue Archive", x + 18, y + 34);
  fill(rgba(PALETTE.greyText, 160));
  textFont("Courier New");
  textSize(9);
  text("confirmed blocks / stored traces", x + 18, y + 53);
  // R stands for Residue, not a recognised Latin letter.
  text("R = Residue index", x + 18, y + 67);

  const columns = w > 250 ? 2 : 1;
  const tile = min((w - 52 - (columns - 1) * 18) / columns, h * 0.17, exhibitionMode ? 96 : 108);
  const colGap = 18;
  const rowGap = exhibitionMode ? 38 : 42;
  for (let i = 0; i < archiveBlocks.length; i++) {
    const px = x + 26 + (i % columns) * (tile + colGap);
    const py = y + 92 + floor(i / columns) * (tile + rowGap);
    if (py + tile + 24 > y + h) break;
    noStroke();
    fill(rgba(PALETTE.paperDeep, 78));
    rect(px - 7, py - 7, tile + 14, tile + 31);
    noFill();
    stroke(rgba(PALETTE.grid, 52));
    rect(px - 7, py - 7, tile + 14, tile + 31);
    if (archiveBlocks[i].glyphGroup?.glyphs?.length) {
      drawGlyphGroup(archiveBlocks[i].glyphGroup, { x: px, y: py, w: tile, h: tile }, 1, { showDebug: false });
    } else {
      drawFrameworkGrid(px, py, tile, 0.36, {
        showDebugZones: false,
        showArrows: false,
        showAnchors: false,
      });
      for (const component of archiveBlocks[i].components || []) {
        drawComponent(component, px, py, tile, 1, true);
      }
    }
    noStroke();
    fill(rgba(PALETTE.cinnabar, 198));
    textFont("Courier New");
    textSize(10);
    textAlign(CENTER);
    text(archiveBlocks[i].name, px + tile / 2, py + tile + 17);
    textAlign(LEFT);
  }
  textFont("Georgia");
}

function drawSystemLabels() {
  if (!debugVisible) return;
  const margin = min(width, height) * 0.035;
  const x = margin + 22;
  const y = height * 0.695;
  const lines = [
    ["DEMO", "BODYGRID"],
    ["CURRENT", blockNamePreview() || "new block"],
    ["STEP", currentStepLabel()],
    ["ZONE", currentZoneLabel()],
    ["NEXT DEMO", demoSequence[demoIndex % demoSequence.length]],
    ["RECEIVED", lastLetter],
    ["ZONES", lastZones],
    ["STATUS", statusText],
  ];
  textFont("Courier New");
  textSize(10);
  noStroke();
  for (let i = 0; i < lines.length; i++) {
    fill(rgba(PALETTE.greyText, 150));
    text(lines[i][0], x, y + i * 20);
    fill(rgba(PALETTE.ink, 170));
    text(lines[i][1], x + 116, y + i * 20);
  }
  textFont("Georgia");
}

function currentStepLabel() {
  const count = min(currentLetters.length + (activeComponent ? 1 : 0), 4);
  return count + "/4";
}

function currentZoneLabel() {
  const index = activeComponent ? activeComponent.component.stepIndex : constrain(currentLetters.length, 0, 3);
  const zone = getZoneForStep(index);
  return "zone" + (index + 1) + " / " + zone.name;
}

function drawDebugOverlay() {
  if (!debugVisible) return;
  const x = 28;
  const y = height - 220;
  const w = min(620, width * 0.46);
  const h = 204;
  const debugDNA = tabletExperience.glyphDNA || currentComponents.find((component) => component.glyphDNA)?.glyphDNA || archiveBlocks[0]?.glyphDNA || null;
  const debugFeatures = tabletExperience.features || archiveBlocks[0]?.features || null;
  const rec = debugFeatures?.recognition || {};
  const analysis = debugDNA?.nameAnalysis || debugFeatures?.nameAnalysis || analyzeNameText(debugDNA?.nameText || "");
  const debugGroup = tabletExperience.glyphGroup || archiveBlocks[0]?.glyphGroup || null;
  const cleanFullText = debugGroup?.recognisedWord || cleanRecognisedWord(rec.fullText || debugFeatures?.recognitionFullText || "");
  const letters = cleanFullText.split("");
  const groupLabels = debugGroup?.groups?.map((items) => items.join("")) || splitWordIntoGlyphGroups(cleanFullText).map((items) => items.join(""));
  const archiveComponents = archiveBlocks[0]?.components || [];
  const componentsForDebug = currentComponents.length ? currentComponents : archiveComponents;
  noStroke();
  fill(243, 238, 226, 176);
  rect(x, y, w, h, 1);
  noFill();
  stroke(rgba(PALETTE.grid, 92));
  rect(x, y, w, h, 1);
  noStroke();
  fill(rgba(PALETTE.greyText, 180));
  textFont("Courier New");
  textSize(10);
  text("RAW: " + lastSerialLine, x + 12, y + 18);
  text("SERIAL: " + serialConnected + " / 9600   LETTER: " + lastLetter, x + 12, y + 36);
  text("BLOCK: " + (currentLetters.join("") || "none") + "   STEP: " + currentStepLabel() + "   ZONE: " + currentZoneLabel(), x + 12, y + 54);
  text("OCR raw text: " + (rec.rawText || "none"), x + 12, y + 72);
  text("OCR clean fullText: " + (cleanFullText || "none"), x + 12, y + 90);
  text("Word length: " + (cleanFullText.length || 0), x + 12, y + 108);
  text("Letters: " + (letters.join(" ") || "none"), x + 12, y + 126);
  text("Groups: " + (groupLabels.join(" / ") || "none"), x + 12, y + 144);
  text("OCR status: " + (rec.ocrStatus || rec.mode || "none"), x + 12, y + 162);
  text("Confidence: " + (rec.confidence !== undefined ? nf(rec.confidence, 1, 2) : "none"), x + w * 0.52, y + 90);
  text("API mode: " + (rec.apiMode || rec.mode || "none"), x + w * 0.52, y + 108);
  text("Model: " + (rec.model || "none"), x + w * 0.52, y + 126);
  text("Submission ID: " + (rec.submissionId || debugFeatures?.submissionId || "none"), x + w * 0.52, y + 144);
  text("Image hash: " + ((rec.imageHash || "").slice(0, 10) || "none"), x + w * 0.52, y + 162);
  text("API call: " + (rec.apiCall || "none"), x + w * 0.52, y + 180);
  text("Trace hash: " + (debugDNA?.traceHash || debugFeatures?.traceHash || "none"), x + 12, y + 180);
  textFont("Georgia");
}

function drawSvgStrokePreview() {
  const panelW = min(width * 0.22, 320);
  const panelH = 132;
  const x = width * 0.72;
  const y = height * 0.82;
  const tile = panelH - 44;
  const px = x + 18;
  const py = y + 30;
  const components = currentComponents.slice();
  if (activeComponent) components.push(activeComponent.component);

  push();
  noFill();
  stroke(rgba(PALETTE.ink, 35));
  rect(x, y, panelW, panelH);
  noStroke();
  fill(rgba(PALETTE.ink, 190));
  textFont("Courier New");
  textSize(10);
  text("SVG PATH STROKE PREVIEW", x + 14, y + 18);
  fill(rgba(PALETTE.grey, 190));
  text("experiment only / not main renderer", x + 14, y + panelH - 14);

  noFill();
  stroke(rgba(PALETTE.grid, 145));
  rect(px, py, tile, tile);
  stroke(rgba(PALETTE.grid, 78));
  line(px + tile / 2, py, px + tile / 2, py + tile);
  line(px, py + tile / 2, px + tile, py + tile / 2);

  const previewComponents = components.length ? components : svgPreviewFallbackComponents();
  const totalPaths = max(1, previewComponents.length);
  for (let i = 0; i < previewComponents.length; i++) {
    const phase = (frameCount * 0.018 - i / totalPaths + 1) % 1;
    drawSvgComponentPreview(previewComponents[i], px, py, tile, phase);
  }
  pop();
}

function svgPreviewFallbackComponents() {
  return [0, 1, 2, 3].map((stepIndex) => ({
    type: ["open_person", "top_cross", "diagonal_connector", "lower_container"][stepIndex],
    zone: getZoneForStep(stepIndex),
  }));
}

function drawSvgComponentPreview(component, squareX, squareY, squareSize, progress) {
  const zone = component.zone || fixedWritingZones.zone1;
  const bounds = zone.type === "compoundU" ? zone.outer : zone;
  const x = squareX + bounds.x * squareSize;
  const y = squareY + bounds.y * squareSize;
  const w = bounds.w * squareSize;
  const h = bounds.h * squareSize;
  const paths = svgPreviewPathsForType(component.type, x, y, w, h);
  const per = 1 / paths.length;

  push();
  noFill();
  stroke(PALETTE.red);
  strokeWeight(max(1.2, squareSize * 0.018));
  strokeCap(ROUND);
  strokeJoin(ROUND);
  for (let i = 0; i < paths.length; i++) {
    const local = constrain((progress - i * per) / per, 0, 1);
    if (local > 0) drawSvgPreviewPath(paths[i], local);
  }
  pop();
}

function svgPreviewPathsForType(type, x, y, w, h) {
  const pt = (nx, ny) => ({ x: x + nx * w, y: y + ny * h });
  const pathMap = {
    open_person: [[pt(0.5, 0.08), pt(0.16, 0.88)], [pt(0.5, 0.08), pt(0.86, 0.88)], [pt(0.32, 0.58), pt(0.68, 0.58)]],
    central_cross: [[pt(0.12, 0.12), pt(0.88, 0.88)], [pt(0.88, 0.12), pt(0.12, 0.88)]],
    square_enclosure: [[pt(0.18, 0.12), pt(0.18, 0.88), pt(0.84, 0.88), pt(0.84, 0.12), pt(0.18, 0.12)]],
    lower_container: [[pt(0.14, 0.12), pt(0.16, 0.74), pt(0.5, 0.9), pt(0.84, 0.74), pt(0.86, 0.12)]],
    top_cross: [[pt(0.12, 0.16), pt(0.88, 0.16)], [pt(0.5, 0.12), pt(0.5, 0.92)]],
    diagonal_connector: [[pt(0.1, 0.16), pt(0.5, 0.72), pt(0.9, 0.18)]],
    turning_zhi: [[pt(0.12, 0.14), pt(0.88, 0.14), pt(0.18, 0.86), pt(0.9, 0.86)]],
  };
  return pathMap[type] || [[pt(0.5, 0.06), pt(0.5, 0.94)]];
}

function drawSvgPreviewPath(points, progress) {
  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let j = 0; j < 18; j++) {
      const t = j / 18;
      sampled.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  }
  sampled.push(points[points.length - 1]);
  const count = max(2, floor(sampled.length * progress));
  beginShape();
  for (let i = 0; i < count; i++) vertex(sampled[i].x, sampled[i].y);
  endShape();
}

function blockNamePreview() {
  const letters = currentLetters.slice();
  if (activeComponent) letters.push(activeComponent.component.letter);
  return letters.join("");
}

function demoInput() {
  inputMode = "demo";
  const letter = demoSequence[demoIndex % demoSequence.length];
  demoIndex++;
  addToCurrentBlock(letter, keyMap[letter] || "none");
}

function drawGlyphTestMode() {
  background("#f4efe3");
  image(paperLayer, 0, 0);
  const marginX = width * 0.045;
  const topY = height * 0.055;
  const profile = GLYPH_TEST_PROFILES[glyphTestProfileIndex] || "zone1Tall";
  const loopMs = 5200;
  const loopProgress = ((millis() - glyphTestReplayStartedAt) % loopMs) / loopMs;

  drawGlyphTestHeader(marginX, topY, profile);
  drawGlyphTestAlphabet(marginX, topY + height * 0.105, width - marginX * 2, height * 0.39, profile, loopProgress);
  drawGlyphTestNames(marginX, height * 0.60, width - marginX * 2, height * 0.32, loopProgress);
}

function drawGlyphTestHeader(x, y, profile) {
  noStroke();
  fill("#25231f");
  textFont("Georgia");
  textSize(max(22, min(width, height) * 0.024));
  textAlign(LEFT, BASELINE);
  text("Name Translator / glyph test", x, y);
  fill("#6d665d");
  textFont("Courier New");
  textSize(max(11, min(width, height) * 0.010));
  text("profile: " + profile + "   keys 1-5 switch profile   click/space/R replay   formal output untouched", x, y + 28);
}

function drawGlyphTestAlphabet(x, y, w, h, profile, loopProgress) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const cols = 13;
  const rows = 2;
  const cellW = w / cols;
  const cellH = h / rows;
  const side = min(cellW * 0.70, cellH * 0.74);
  const progress = glyphTestPingPongProgress(loopProgress);
  for (let i = 0; i < letters.length; i++) {
    const col = i % cols;
    const row = floor(i / cols);
    const cx = x + col * cellW + cellW * 0.5;
    const cy = y + row * cellH + cellH * 0.54;
    drawGlyphTestTile(letters[i], cx - side / 2, cy - side / 2, side, profile, 0.032, progress, profile);
    noStroke();
    fill(rgba(PALETTE.red, 145));
    textFont("Georgia");
    textSize(max(10, side * 0.12));
    textAlign(CENTER, BASELINE);
    text(letters[i], cx, cy - side * 0.58);
  }
}

function drawGlyphTestNames(x, y, w, h, loopProgress) {
  const rowH = h / GLYPH_TEST_NAME_SAMPLES.length;
  for (let i = 0; i < GLYPH_TEST_NAME_SAMPLES.length; i++) {
    const word = GLYPH_TEST_NAME_SAMPLES[i];
    const labelW = min(150, w * 0.12);
    noStroke();
    fill("#6d665d");
    textFont("Courier New");
    textSize(max(10, min(width, height) * 0.010));
    textAlign(LEFT, CENTER);
    text(word, x, y + rowH * i + rowH * 0.5);
    const previewX = x + labelW;
    const previewW = w - labelW;
    const colW = previewW / GLYPH_TEST_STROKE_RATIOS.length;
    for (let r = 0; r < GLYPH_TEST_STROKE_RATIOS.length; r++) {
      const ratio = GLYPH_TEST_STROKE_RATIOS[r];
      drawGlyphTestNamePreview(
        word,
        previewX + colW * r + colW * 0.04,
        y + rowH * i + rowH * 0.06,
        colW * 0.90,
        rowH * 0.88,
        ratio,
        loopProgress
      );
      noStroke();
      fill(rgba(PALETTE.greyText, 155));
      textFont("Courier New");
      textSize(10);
      textAlign(CENTER, TOP);
      text(ratio.toFixed(3), previewX + colW * r + colW * 0.49, y + rowH * i + 2);
    }
  }
}

function drawGlyphTestNamePreview(word, x, y, w, h, ratio, loopProgress) {
  const groups = glyphTestSplitWord(word);
  const gap = w * 0.035;
  const side = min(h * 0.82, (w - gap * (groups.length - 1)) / max(1, groups.length));
  const totalW = side * groups.length + gap * (groups.length - 1);
  const startX = x + (w - totalW) / 2;
  const startY = y + (h - side) / 2;
  const active = glyphTestNameProgress(loopProgress, glyphTestTotalSlots(groups));
  let slotOffset = 0;
  for (let g = 0; g < groups.length; g++) {
    const gx = startX + g * (side + gap);
    drawFrameworkGrid(gx, startY, side, 0.42, { showDebugZones: false, showArrows: false, showAnchors: false });
    for (let i = 0; i < groups[g].length; i++) {
      const slot = glyphTestSlotForIndex(i, groups[g].length);
      const stepProgress = constrain((active - slotOffset - i) / 0.92, 0, 1);
      if (stepProgress > 0) drawMarkerGlyphInTile(groups[g][i], slot.profile, gx, startY, side, ratio, stepProgress, slot.colorKey, slot.half);
    }
    slotOffset += groups[g].length;
  }
}

function drawGlyphTestTile(letter, x, y, side, profile, ratio, progress, colorKey) {
  drawFrameworkGrid(x, y, side, 0.25, { showDebugZones: false, showArrows: false, showAnchors: false });
  drawMarkerGlyphInTile(letter, profile, x, y, side, ratio, progress, colorKey, "left");
}

function drawMarkerGlyphInTile(letter, profile, gx, gy, side, ratio, progress, colorKey = profile, half = "left") {
  const glyph = MARKER_GLYPH_PATHS_V2[letter];
  if (!glyph) return;
  // Map the normalized glyph path into the active square zone before drawing it.
  const rawStrokes = glyph.strokes.map(markerStrokeToPoints);
  const bounds = markerGlyphBounds(rawStrokes);
  const strokeW = max(1, side * ratio);
  const col = GLYPH_TEST_COLORS[colorKey] || GLYPH_TEST_COLORS[profile] || GLYPH_TEST_COLORS.zone1Tall;
  const strokeCount = rawStrokes.length || 1;
  push();
  blendMode(MULTIPLY);
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  for (let i = 0; i < rawStrokes.length; i++) {
    const local = constrain((progress * strokeCount - i) / 0.95, 0, 1);
    if (local <= 0) continue;
    const pts = rawStrokes[i].map((pt, pointIndex) => glyphTestMapPoint(pt, bounds, profile, gx, gy, side, strokeW, half, letter, i, pointIndex));
    const alphaKey = ratio.toFixed(3);
    const alpha = GLYPH_TEST_ALPHA_BY_RATIO[alphaKey] || 166;
    stroke(col[0], col[1], col[2], alpha);
    strokeWeight(strokeW);
    drawSimpleProgressPath(pts, local);
  }
  pop();
}

function markerStrokeToPoints(strokeDef) {
  const pts = strokeDef.points || [];
  if (strokeDef.kind !== "curve" || pts.length < 4) {
    return pts.map(([x, y]) => ({ x, y }));
  }
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

function markerGlyphBounds(strokes) {
  const all = strokes.flat();
  const xs = all.map((pnt) => pnt.x);
  const ys = all.map((pnt) => pnt.y);
  return {
    minX: min(xs),
    minY: min(ys),
    maxX: max(xs),
    maxY: max(ys),
    w: max(0.001, max(xs) - min(xs)),
    h: max(0.001, max(ys) - min(ys)),
  };
}

function glyphTestMapPoint(pt, bounds, profile, gx, gy, side, strokeW, half, letter, strokeIndex, pointIndex) {
  const nx = constrain((pt.x - bounds.minX) / bounds.w, 0, 1);
  const ny = constrain((pt.y - bounds.minY) / bounds.h, 0, 1);
  const jitter = glyphTestStableJitter(letter, profile, strokeIndex, pointIndex, side);
  if (profile === "zone3CompoundU") {
    return glyphTestMapCompoundU(nx, ny, gx, gy, side, strokeW, jitter);
  }
  const rect = glyphTestRectForProfile(profile, gx, gy, side, strokeW, half);
  return {
    x: rect.x + nx * rect.w + jitter.x,
    y: rect.y + ny * rect.h + jitter.y,
  };
}

function glyphTestRectForProfile(profile, gx, gy, side, strokeW, half = "left") {
  if (profile === "zone4Half") {
    const z4 = fixedWritingZones.zone4;
    const gap = z4.w * side * 0.025;
    const halfW = (z4.w * side - gap) * 0.5;
    const hx = half === "right" ? gx + z4.x * side + halfW + gap : gx + z4.x * side;
    return glyphTestSafeRect(hx, gy + z4.y * side, halfW, z4.h * side, strokeW, 0.036);
  }
  if (profile === "zone1Tall") {
    const zone = fixedWritingZones.zone1;
    const expandedW = zone.w * side * 1.22;
    return glyphTestSafeRect(gx + zone.x * side, gy + zone.y * side, expandedW, zone.h * side, strokeW, 0.052);
  }
  const zone = profile === "zone2Wide"
      ? fixedWritingZones.zone2
      : fixedWritingZones.zone4;
  return glyphTestSafeRect(gx + zone.x * side, gy + zone.y * side, zone.w * side, zone.h * side, strokeW);
}

function glyphTestSafeRect(x, y, w, h, strokeW, padRatio = 0.06) {
  const pad = max(strokeW * 0.58, min(w, h) * padRatio);
  return { x: x + pad, y: y + pad, w: max(1, w - pad * 2), h: max(1, h - pad * 2) };
}

function glyphTestMapCompoundU(nx, ny, gx, gy, side, strokeW, jitter) {
  const z = fixedWritingZones.zone3;
  const outer = {
    x: gx + z.outer.x * side,
    y: gy + z.outer.y * side,
    w: z.outer.w * side,
    h: z.outer.h * side,
  };
  const inner = {
    x: gx + z.innerCutout.x * side,
    y: gy + z.innerCutout.y * side,
    w: z.innerCutout.w * side,
    h: z.innerCutout.h * side,
  };
  const safeOuter = glyphTestSafeRect(outer.x, outer.y, outer.w, outer.h, strokeW, 0.045);
  const cutPad = max(strokeW * 1.15, side * 0.015);
  const cut = {
    x: inner.x - cutPad,
    y: inner.y - cutPad,
    w: inner.w + cutPad * 2,
    h: inner.h + cutPad * 2,
  };
  let mappedX = safeOuter.x + nx * safeOuter.w;
  let mappedY = safeOuter.y + ny * safeOuter.h;
  const inCutout = mappedX > cut.x && mappedX < cut.x + cut.w && mappedY > cut.y && mappedY < cut.y + cut.h;
  if (inCutout) {
    const leftTarget = cut.x - strokeW * 0.45;
    const rightTarget = cut.x + cut.w + strokeW * 0.45;
    const t = glyphTestSmoothstep(0.36, 0.64, nx);
    mappedX = t < 0.5 ? leftTarget : rightTarget;
  }
  return {
    x: constrain(mappedX, safeOuter.x, safeOuter.x + safeOuter.w) + jitter.x,
    y: constrain(mappedY, safeOuter.y, safeOuter.y + safeOuter.h) + jitter.y,
  };
}

function glyphTestStableJitter(letter, profile, strokeIndex, pointIndex, side) {
  const seed = hashString([letter, profile, strokeIndex, pointIndex].join(":"));
  const amp = side * 0.0028;
  return {
    x: (((seed & 255) / 255) - 0.5) * amp,
    y: ((((seed >>> 8) & 255) / 255) - 0.5) * amp,
  };
}

function glyphTestSmoothstep(edge0, edge1, value) {
  const t = constrain((value - edge0) / max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function drawSimpleProgressPath(points, progress) {
  const p = constrain(progress, 0, 1);
  if (points.length < 2 || p <= 0) return;
  const lengths = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = dist(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    lengths.push(len);
    total += len;
  }
  let remaining = total * p;
  beginShape();
  vertex(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    if (remaining >= lengths[i]) {
      vertex(points[i + 1].x, points[i + 1].y);
      remaining -= lengths[i];
    } else {
      const t = lengths[i] ? remaining / lengths[i] : 0;
      vertex(lerp(points[i].x, points[i + 1].x, t), lerp(points[i].y, points[i + 1].y, t));
      break;
    }
  }
  endShape();
}

function glyphTestSplitWord(input) {
  const clean = cleanRecognisedWord(input);
  if (clean.length === 5) return [clean.split("")];
  const groups = [];
  for (let i = 0; i < clean.length; i += 4) groups.push(clean.slice(i, i + 4).split(""));
  return groups;
}

function glyphTestSlotForIndex(index, groupLength) {
  if (groupLength === 5 && index === 3) return { profile: "zone4Half", colorKey: "zone4HalfLeft", half: "left" };
  if (groupLength === 5 && index === 4) return { profile: "zone4Half", colorKey: "zone4HalfRight", half: "right" };
  const slots = [
    { profile: "zone1Tall", colorKey: "zone1Tall", half: "left" },
    { profile: "zone2Wide", colorKey: "zone2Wide", half: "left" },
    { profile: "zone3CompoundU", colorKey: "zone3CompoundU", half: "left" },
    { profile: "zone4Core", colorKey: "zone4Core", half: "left" },
  ];
  return slots[index] || slots[slots.length - 1];
}

function glyphTestTotalSlots(groups) {
  return groups.reduce((sum, group) => sum + group.length, 0) || 1;
}

function glyphTestNameProgress(loopProgress, totalSlots) {
  const activeWindow = 0.78;
  const hold = 0.16;
  const t = loopProgress < activeWindow ? loopProgress / activeWindow : loopProgress < activeWindow + hold ? 1 : 1 - (loopProgress - activeWindow - hold) / (1 - activeWindow - hold);
  return constrain(t, 0, 1) * totalSlots;
}

function glyphTestPingPongProgress(loopProgress) {
  if (loopProgress < 0.44) return loopProgress / 0.44;
  if (loopProgress < 0.68) return 1;
  return constrain(1 - (loopProgress - 0.68) / 0.32, 0, 1);
}

function handleGlyphTestKey() {
  if (key >= "1" && key <= "5") {
    glyphTestProfileIndex = Number(key) - 1;
    glyphTestReplayStartedAt = millis();
    return;
  }
  if (key === " " || key === "r" || key === "R") {
    glyphTestReplayStartedAt = millis();
  }
}

function keyPressed() {
  if (GLYPH_TEST_MODE) {
    handleGlyphTestKey();
    return;
  }
  if (key === " ") {
    demoInput();
    return;
  }
  if (key === "d" || key === "D") {
    debugVisible = !debugVisible;
    debugToggle.html(debugVisible ? "Hide Debug" : "Show Debug");
    return;
  }
  if (key === "m" || key === "M") {
    exhibitionMode = !exhibitionMode;
    controlsExpanded = !exhibitionMode;
    debugVisible = !exhibitionMode;
    debugToggle.html(debugVisible ? "Hide Debug" : "Show Debug");
    layoutControls();
    return;
  }
  if (key === "c" || key === "C") {
    clearWork();
    return;
  }
  if (key.length === 1 && /[a-z]/i.test(key)) {
    inputMode = "bodyGrid";
    const letter = key.toUpperCase();
    addToCurrentBlock(letter, keyMap[letter] || "none");
  }
}

function mousePressed() {
  if (GLYPH_TEST_MODE) {
    glyphTestReplayStartedAt = millis();
    return false;
  }
}

function clearWork() {
  currentLetters = [];
  currentComponents = [];
  archiveBlocks = [];
  residueCounter = 0;
  activeComponent = null;
  misreadMark = null;
  demoIndex = 0;
  lastSerialLine = "no serial data";
  lastZones = "none";
  lastLetter = "none";
  statusText = "waiting";
  tabletExperience.data = null;
  tabletExperience.features = null;
  tabletExperience.glyphDNA = null;
  tabletExperience.glyphGroup = null;
  tabletExperience.fourZoneDNA = null;
  tabletExperience.letters = [];
  tabletExperience.state = "IDLE";
}

// Component renderers. They draw modular geometric sources, not Latin letters.
function activeGlyphMode() {
  return renderMode === "rough" && roughCanvas ? "rough" : "clean";
}

function drawGlyphLine(x1, y1, x2, y2, options = {}) {
  const strokeCol = options.stroke || PALETTE.ink;
  const strokeW = options.strokeWeight || 2;
  if (activeGlyphMode() === "rough") {
    roughCanvas.line(x1, y1, x2, y2, {
      stroke: strokeCol,
      strokeWidth: strokeW,
      roughness: options.roughness || 1.15,
      bowing: options.bowing || 0.65,
    });
    return;
  }
  push();
  drawExpressiveStroke(
    [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ],
    {
      stroke: strokeCol,
      weightStart: strokeW * 0.78,
      weightMid: strokeW,
      weightEnd: strokeW * 0.66,
      slightJitter: options.slightJitter ?? 0.018,
      inkDensity: options.inkDensity ?? 1,
    }
  );
  pop();
}

function drawGlyphRect(x, y, w, h, options = {}) {
  const strokeCol = options.stroke || PALETTE.ink;
  const strokeW = options.strokeWeight || 2;
  if (activeGlyphMode() === "rough") {
    roughCanvas.rectangle(x, y, w, h, {
      stroke: strokeCol,
      strokeWidth: strokeW,
      roughness: options.roughness || 1.1,
      bowing: options.bowing || 0.55,
      fill: options.fill || undefined,
      fillStyle: options.fill ? "solid" : undefined,
    });
    return;
  }
  push();
  noFill();
  stroke(strokeCol);
  strokeWeight(strokeW);
  rect(x, y, w, h);
  pop();
}

function drawGlyphPolyline(points, options = {}) {
  if (points.length < 2) return;
  const strokeCol = options.stroke || PALETTE.ink;
  const strokeW = options.strokeWeight || 2;
  if (activeGlyphMode() === "rough") {
    const pairs = points.map((pt) => [pt.x, pt.y]);
    if (roughCanvas.linearPath) {
      roughCanvas.linearPath(pairs, {
        stroke: strokeCol,
        strokeWidth: strokeW,
        roughness: options.roughness || 1.15,
        bowing: options.bowing || 0.65,
      });
    } else {
      for (let i = 0; i < points.length - 1; i++) {
        drawGlyphLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, options);
      }
    }
    return;
  }
  drawExpressiveStroke(points, {
    stroke: strokeCol,
    weightStart: strokeW * 0.76,
    weightMid: strokeW,
    weightEnd: strokeW * 0.64,
    slightJitter: options.slightJitter ?? 0.015,
    inkDensity: options.inkDensity ?? 1,
  });
}

// 书法 stroke 辅助层：用中心路径分段绘制，模拟起笔、行笔、收笔的轻微粗细变化。
function drawExpressiveStroke(points, options = {}) {
  if (!points || points.length < 2) return;
  const strokeCol = options.stroke || PALETTE.ink;
  const weightStart = options.weightStart || 2;
  const weightMid = options.weightMid || 3;
  const weightEnd = options.weightEnd || 1.8;
  const jitter = options.slightJitter || 0;
  const density = options.inkDensity || 1;
  const sampled = sampleStrokePoints(points, 12);

  push();
  noFill();
  stroke(strokeCol);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  for (let i = 0; i < sampled.length - 1; i++) {
    const t = i / max(1, sampled.length - 2);
    const wave = sin(t * PI);
    const w = lerp(weightStart, weightEnd, t) + wave * (weightMid - (weightStart + weightEnd) * 0.5);
    strokeWeight(max(0.8, w));
    const a = offsetStrokePoint(sampled[i], i, jitter, w);
    const b = offsetStrokePoint(sampled[i + 1], i + 1, jitter, w);
    line(a.x, a.y, b.x, b.y);
  }
  if (density > 0.92) {
    strokeWeight(max(0.7, weightEnd * 0.48));
    stroke(rgba(PALETTE.ink, 95));
    const tail = sampled[sampled.length - 1];
    const prev = sampled[sampled.length - 2];
    line(prev.x, prev.y, tail.x, tail.y);
  }
  pop();
}

function sampleStrokePoints(points, stepsPerSegment) {
  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let j = 0; j < stepsPerSegment; j++) {
      const t = j / stepsPerSegment;
      sampled.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

function offsetStrokePoint(pt, index, amount, strokeW) {
  if (!amount) return pt;
  const offset = sin(index * 1.91) * strokeW * amount;
  return { x: pt.x + offset, y: pt.y - offset * 0.42 };
}

function p(ctx, x, y) {
  return { x: ctx.x + fillNorm(x) * ctx.w, y: ctx.y + fillNorm(y) * ctx.h };
}

function fillNorm(value) {
  return constrain((value - 0.06) / 0.88, 0, 1);
}

function edgeNorm(value) {
  return constrain((value - 0.04) / 0.92, 0, 1);
}

function drawPath(ctx, points, progress) {
  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let j = 0; j < 20; j++) {
      const t = j / 20;
      sampled.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  }
  sampled.push(points[points.length - 1]);
  const count = max(2, floor(sampled.length * progress));
  drawGlyphPolyline(sampled.slice(0, count), { strokeWeight: ctx.weight || 2 });
}

function drawModuleTriangle(ctx, ax, ay, bx, by, cx, cy, progress) {
  if (progress <= 0) return;
  const a = p(ctx, ax, ay);
  const b = p(ctx, bx, by);
  const cpt = p(ctx, cx, cy);
  const amount = constrain(progress, 0, 1);
  fill(PALETTE.ink);
  noStroke();
  beginShape();
  vertex(a.x, a.y);
  vertex(lerp(a.x, b.x, amount), lerp(a.y, b.y, amount));
  vertex(lerp(a.x, cpt.x, amount), lerp(a.y, cpt.y, amount));
  endShape(CLOSE);
  noFill();
  stroke(PALETTE.ink);
}

function drawSegmented(ctx, paths) {
  const per = 1 / paths.length;
  for (let i = 0; i < paths.length; i++) {
    const local = constrain((ctx.p - i * per) / per, 0, 1);
    if (local <= 0) continue;
    drawPath(ctx, paths[i].map((pt) => p(ctx, pt[0], pt[1])), local);
  }
}

function drawBoundsSegments(ctx, paths) {
  const per = 1 / paths.length;
  for (let i = 0; i < paths.length; i++) {
    const local = constrain((ctx.p - i * per) / per, 0, 1);
    if (local <= 0) continue;
    drawProgressPolyline(paths[i], local, ctx.weight || 2);
  }
}

function bpt(ctx, x, y) {
  return { x: lerp(ctx.left, ctx.right, x), y: lerp(ctx.top, ctx.bottom, y) };
}

// bounds-aware components: 直接使用区域四边，避免“居中小符号”。
function drawBoundsVerticalAxis(ctx) {
  drawBoundsSegments(ctx, [[bpt(ctx, 0.32, 0), bpt(ctx, 0.32, 1)]]);
}

function drawBoundsVerticalHook(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0.34, 0), bpt(ctx, 0.34, 0.88)],
    [bpt(ctx, 0.34, 0.88), bpt(ctx, 0.72, 1)],
  ]);
}

function drawBoundsVerticalFoot(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0.32, 0), bpt(ctx, 0.32, 1)],
    [bpt(ctx, 0.28, 1), bpt(ctx, 1, 1)],
  ]);
}

function drawBoundsTopBarWithStem(ctx) {
  const stemX = lerp(ctx.left, ctx.right, 0.24);
  const yTop = ctx.top + ctx.weight * 0.15;
  const yMid = lerp(ctx.top, ctx.bottom, 0.52);
  drawBoundsSegments(ctx, [
    [{ x: ctx.left - ctx.weight * 0.25, y: yTop }, { x: ctx.right, y: yTop }],
    [{ x: stemX, y: ctx.top }, { x: stemX, y: ctx.bottom }],
    [{ x: stemX - ctx.weight * 0.25, y: yMid }, { x: ctx.right, y: yMid }],
  ]);
}

function drawBoundsLayeredThreeBars(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0, 0.04), bpt(ctx, 1, 0.04)],
    [bpt(ctx, 0.04, 0.5), bpt(ctx, 0.96, 0.5)],
    [bpt(ctx, 0, 0.96), bpt(ctx, 1, 0.96)],
  ]);
}

function drawBoundsHorizontalBar(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0, 0.5), bpt(ctx, 1, 0.5)],
    [bpt(ctx, 0, 0.22), bpt(ctx, 0, 0.78)],
  ]);
}

function drawBoundsOpenPerson(ctx) {
  const top = bpt(ctx, 0.5, 0);
  drawBoundsSegments(ctx, [
    [top, bpt(ctx, 0, 1)],
    [top, bpt(ctx, 1, 1)],
    [bpt(ctx, 0.28, 0.56), bpt(ctx, 0.72, 0.56)],
  ]);
}

function drawBoundsDiagonalConnector(ctx) {
  drawBoundsSegments(ctx, [[bpt(ctx, 0, 0), bpt(ctx, 1, 1)]]);
}

function drawBoundsTurningZhi(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0, 0.04), bpt(ctx, 1, 0.04)],
    [bpt(ctx, 1, 0.04), bpt(ctx, 0, 0.76)],
    [bpt(ctx, 0, 0.96), bpt(ctx, 1, 0.96)],
  ]);
}

function drawBoundsSquareEnclosure(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0, 0), bpt(ctx, 1, 0)],
    [bpt(ctx, 1, 0), bpt(ctx, 1, 1)],
    [bpt(ctx, 0, 0), bpt(ctx, 0, 1)],
    [bpt(ctx, 0, 1), bpt(ctx, 1, 1)],
  ]);
}

function drawBoundsLowerContainer(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0, 0), bpt(ctx, 0, 1)],
    [bpt(ctx, 1, 0), bpt(ctx, 1, 1)],
    [bpt(ctx, 0, 1), bpt(ctx, 1, 1)],
  ]);
}

function drawBoundsCentralCross(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0, 0), bpt(ctx, 1, 1)],
    [bpt(ctx, 1, 0), bpt(ctx, 0, 1)],
  ]);
}

function drawBoundsTopCross(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 0, 0), bpt(ctx, 1, 0)],
    [bpt(ctx, 0.5, 0), bpt(ctx, 0.5, 1)],
  ]);
}

function drawBoundsLeftStemDoubleAttach(ctx) {
  const stemX = lerp(ctx.left, ctx.right, 0.2);
  drawBoundsSegments(ctx, [
    [{ x: stemX, y: ctx.top }, { x: stemX, y: ctx.bottom }],
    [{ x: stemX - ctx.weight * 0.2, y: lerp(ctx.top, ctx.bottom, 0.18) }, bpt(ctx, 1, 0.18), bpt(ctx, 1, 0.42), { x: stemX, y: lerp(ctx.top, ctx.bottom, 0.42) }],
    [{ x: stemX - ctx.weight * 0.2, y: lerp(ctx.top, ctx.bottom, 0.58) }, bpt(ctx, 1, 0.58), bpt(ctx, 1, 0.9), { x: stemX, y: lerp(ctx.top, ctx.bottom, 0.9) }],
  ]);
}

function drawBoundsOpenCorner(ctx) {
  drawBoundsSegments(ctx, [
    [bpt(ctx, 1, 0), bpt(ctx, 0, 0), bpt(ctx, 0, 1), bpt(ctx, 1, 1)],
  ]);
}

function drawOpenTriangle(ctx) {
  drawSegmented(ctx, [
    [[0.5, 0.08], [0.16, 0.88]],
    [[0.5, 0.08], [0.86, 0.88]],
    [[0.32, 0.58], [0.68, 0.58]],
  ]);
}

function drawVerticalDoubleBowl(ctx) {
  drawSegmented(ctx, [
    [[0.18, 0.08], [0.18, 0.92]],
    [[0.18, 0.1], [0.82, 0.1], [0.82, 0.42], [0.18, 0.42]],
    [[0.18, 0.52], [0.82, 0.52], [0.82, 0.88], [0.18, 0.88]],
  ]);
}

function drawOpenLeftArc(ctx) {
  drawSegmented(ctx, [
    [[0.82, 0.12], [0.22, 0.18], [0.14, 0.5], [0.24, 0.82], [0.82, 0.88]],
  ]);
}

function drawHalfEnclosure(ctx) {
  drawSegmented(ctx, [
    [[0.16, 0.08], [0.16, 0.92]],
    [[0.16, 0.1], [0.82, 0.12], [0.82, 0.86]],
  ]);
}

function drawLayeredBars(ctx) {
  drawSegmented(ctx, [
    [[0.18, 0.18], [0.86, 0.18]],
    [[0.24, 0.5], [0.76, 0.5]],
    [[0.14, 0.82], [0.88, 0.82]],
  ]);
}

function drawHorizontalBar(ctx) {
  drawSegmented(ctx, [
    [[0.08, 0.48], [0.92, 0.48]],
    [[0.2, 0.36], [0.2, 0.62]],
    [[0.8, 0.36], [0.8, 0.62]],
  ]);
}

function drawUpperBars(ctx) {
  drawSegmented(ctx, [
    [[0.12, 0.16], [0.88, 0.16]],
    [[0.18, 0.46], [0.72, 0.46]],
    [[0.2, 0.16], [0.2, 0.9]],
  ]);
}

function drawOpenEnclosureHook(ctx) {
  drawSegmented(ctx, [
    [[0.78, 0.12], [0.22, 0.14], [0.18, 0.82], [0.72, 0.82]],
    [[0.72, 0.82], [0.56, 0.96]],
  ]);
}

function drawBridge(ctx) {
  drawSegmented(ctx, [
    [[0.18, 0.08], [0.18, 0.92]],
    [[0.82, 0.08], [0.82, 0.92]],
    [[0.18, 0.5], [0.82, 0.5]],
  ]);
}

function drawVerticalAxis(ctx) {
  drawSegmented(ctx, [[[0.5, 0.06], [0.5, 0.94]]]);
}

function drawVerticalHook(ctx) {
  drawSegmented(ctx, [[[0.55, 0.04], [0.48, 0.68], [0.56, 0.92], [0.22, 0.82]]]);
}

function drawBranch(ctx) {
  drawSegmented(ctx, [
    [[0.18, 0.06], [0.18, 0.92]],
    [[0.2, 0.48], [0.86, 0.12]],
    [[0.22, 0.5], [0.86, 0.9]],
  ]);
}

function drawVerticalFoot(ctx) {
  drawSegmented(ctx, [
    [[0.22, 0.08], [0.22, 0.86]],
    [[0.22, 0.86], [0.88, 0.86]],
  ]);
}

function drawPeaks(ctx) {
  drawSegmented(ctx, [[[0.08, 0.84], [0.26, 0.14], [0.5, 0.82], [0.74, 0.14], [0.92, 0.84]]]);
}

function drawDiagonalConnector(ctx) {
  drawSegmented(ctx, [[[0.1, 0.16], [0.5, 0.72], [0.9, 0.18]]]);
}

function drawSquareEnclosure(ctx) {
  drawSegmented(ctx, [
    [[0.18, 0.12], [0.18, 0.9]],
    [[0.18, 0.12], [0.84, 0.12], [0.84, 0.9]],
    [[0.18, 0.88], [0.84, 0.88]],
  ]);
}

function drawUpperBowl(ctx) {
  drawSegmented(ctx, [
    [[0.18, 0.08], [0.18, 0.92]],
    [[0.18, 0.1], [0.82, 0.12], [0.82, 0.48], [0.18, 0.48]],
  ]);
}

function drawEnclosureTail(ctx) {
  drawSquareEnclosure(ctx);
  if (ctx.p > 0.72) drawSegmented({ ...ctx, p: (ctx.p - 0.72) / 0.28 }, [[[0.62, 0.64], [0.92, 0.96]]]);
}

function drawBowlLeg(ctx) {
  drawUpperBowl(ctx);
  if (ctx.p > 0.7) drawSegmented({ ...ctx, p: (ctx.p - 0.7) / 0.3 }, [[[0.44, 0.52], [0.88, 0.9]]]);
}

function drawTurningCurve(ctx) {
  drawSegmented(ctx, [[[0.82, 0.16], [0.2, 0.2], [0.68, 0.52], [0.28, 0.84], [0.86, 0.86]]]);
}

function drawTopCross(ctx) {
  drawSegmented(ctx, [
    [[0.12, 0.16], [0.88, 0.16]],
    [[0.5, 0.12], [0.5, 0.92]],
  ]);
}

function drawLowerContainer(ctx) {
  drawSegmented(ctx, [[[0.14, 0.12], [0.16, 0.74], [0.5, 0.9], [0.84, 0.74], [0.86, 0.12]]]);
}

function drawDownwardV(ctx) {
  drawSegmented(ctx, [
    [[0.12, 0.12], [0.5, 0.88]],
    [[0.88, 0.12], [0.5, 0.88]],
  ]);
}

function drawDoubleV(ctx) {
  drawSegmented(ctx, [[[0.08, 0.14], [0.28, 0.88], [0.5, 0.18], [0.72, 0.88], [0.92, 0.14]]]);
}

function drawCross(ctx) {
  drawSegmented(ctx, [
    [[0.12, 0.12], [0.88, 0.88]],
    [[0.88, 0.12], [0.12, 0.88]],
  ]);
}

function drawForkDown(ctx) {
  drawSegmented(ctx, [
    [[0.16, 0.1], [0.5, 0.46], [0.84, 0.1]],
    [[0.5, 0.46], [0.5, 0.92]],
  ]);
}

function drawZigzag(ctx) {
  drawSegmented(ctx, [[[0.12, 0.14], [0.88, 0.14], [0.18, 0.86], [0.9, 0.86]]]);
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    statusText = "Web Serial unavailable";
    serialErrorHint = "Use Chrome or Edge on localhost/https";
    return;
  }
  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 9600 });
    serialConnected = true;
    serialKeepReading = true;
    connectButton.html("Disconnect");
    statusText = "serial connected";
    readSerialLoop();
  } catch (err) {
    statusText = "serial connection cancelled";
    serialErrorHint = String(err);
  }
}

async function disconnectSerial() {
  serialKeepReading = false;
  try {
    if (serialReader) await serialReader.cancel();
  } catch (err) {}
  try {
    if (serialReader) serialReader.releaseLock();
  } catch (err) {}
  serialReader = null;
  try {
    if (serialPort) await serialPort.close();
  } catch (err) {}
  serialPort = null;
  serialConnected = false;
  connectButton.html("Connect Arduino");
  statusText = "serial released";
}

async function readSerialLoop() {
  const decoder = new TextDecoderStream();
  serialPipeClosed = serialPort.readable.pipeTo(decoder.writable).catch((err) => {
    serialErrorHint = String(err);
  });
  serialReader = decoder.readable.getReader();

  while (serialKeepReading) {
    try {
      const { value, done } = await serialReader.read();
      if (done) break;
      if (value) consumeSerialText(value);
    } catch (err) {
      serialErrorHint = String(err);
      statusText = "serial read error";
      break;
    }
  }
}

function consumeSerialText(chunk) {
  lastSerialAt = millis();
  lineBuffer += chunk;
  const lines = lineBuffer.split(/\r?\n/);
  lineBuffer = lines.pop() || "";
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length > 0) handleSerialLine(line);
  }
}

function handleSerialLine(line) {
  lastSerialLine = line;
  const parsed = parseConfirmedLine(line);
  if (!parsed) return;
  inputMode = "bodyGrid";
  addToCurrentBlock(parsed.letter, parsed.zones);
}

function parseConfirmedLine(line) {
  const confirmedMatch = line.match(/CONFIRMED:\s*([0-9-]+)\s+Letter:\s*([A-Z?-])/i);
  if (confirmedMatch) {
    return { zones: normalizeZones(confirmedMatch[1]), letter: confirmedMatch[2].toUpperCase() };
  }
  const compactMatch = line.match(/ZONES:\s*([0-9-]+)\s*,\s*LETTER:\s*([A-Z?-])/i);
  if (compactMatch) {
    return { zones: normalizeZones(compactMatch[1]), letter: compactMatch[2].toUpperCase() };
  }
  return null;
}

function normalizeZones(zones) {
  return zones
    .split("-")
    .map((v) => int(v))
    .filter((v) => v >= 1 && v <= 8)
    .sort((a, b) => a - b)
    .join("-");
}

function seededUnit(index, salt) {
  const x = sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - floor(x);
}

function rgba(hex, alpha = 255) {
  const h = hex.replace("#", "");
  return color(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha);
}

function clamp(v, lo, hi) {
  return max(lo, min(hi, v));
}

function titleCase(value) {
  const text = String(value || "");
  return (text[0] || "").toUpperCase() + text.slice(1);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
}
