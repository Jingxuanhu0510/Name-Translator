(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MiZiCameraCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function computeCropRect(width, height) {
    // 这里根据保存的 ROI 计算实际提交的摄像头裁切区域。
    const safeW = Math.max(1, Number(width) || 1);
    const safeH = Math.max(1, Number(height) || 1);
    const roi = cameraRoi();
    const cropW = safeW * roi.w;
    const cropH = safeH * roi.h;
    return {
      x: safeW * roi.x,
      y: safeH * roi.y,
      width: cropW,
      height: cropH,
    };
  }

  function cameraRoi() {
    // 这里读取现场校准过的摄像头书写框。
    const fallback = { x: 0.21, y: 0.36, w: 0.58, h: 0.24 };
    try {
      const saved = typeof window !== "undefined" && window.localStorage
        ? JSON.parse(window.localStorage.getItem("miziCameraRoi") || "null")
        : null;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.w) && Number.isFinite(saved.h)) {
        return normalizeRoi(saved);
      }
    } catch {}
    return fallback;
  }

  function normalizeRoi(roi) {
    const w = clamp(Number(roi.w) || 0.58, 0.22, 0.94);
    const h = clamp(Number(roi.h) || 0.24, 0.12, 0.72);
    return {
      x: clamp(Number(roi.x) || 0.21, 0, 1 - w),
      y: clamp(Number(roi.y) || 0.36, 0, 1 - h),
      w,
      h,
    };
  }

  function luminanceAt(data, index) {
    return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  }

  function otsuThreshold(imageData) {
    // 这里自动估计黑白阈值，用来分离纸面和笔迹。
    const data = imageData && imageData.data ? imageData.data : imageData;
    if (!data || data.length < 4) return 128;
    const histogram = new Uint32Array(256);
    let total = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const value = clamp(Math.round(luminanceAt(data, i)), 0, 255);
      histogram[value]++;
      total++;
      sum += value;
    }
    if (!total) return 128;

    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestVariance = -1;
    let bestThreshold = 128;
    for (let threshold = 0; threshold < 256; threshold++) {
      backgroundWeight += histogram[threshold];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += threshold * histogram[threshold];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (sum - backgroundSum) / foregroundWeight;
      const between = backgroundWeight * foregroundWeight * Math.pow(backgroundMean - foregroundMean, 2);
      if (between > bestVariance) {
        bestVariance = between;
        bestThreshold = threshold;
      }
    }
    return clamp(bestThreshold, 72, 196);
  }

  function hashMask(mask) {
    let hash = 2166136261;
    const stride = Math.max(1, Math.floor(mask.length / 1600));
    for (let i = 0; i < mask.length; i += stride) {
      hash ^= mask[i] ? i + 131 : i + 17;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function connectedComponents(mask, width, height) {
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    let count = 0;
    let largest = 0;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      let size = 0;
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        const index = queue[head++];
        size++;
        const x = index % width;
        const y = Math.floor(index / width);
        const neighbours = [
          x > 0 ? index - 1 : -1,
          x + 1 < width ? index + 1 : -1,
          y > 0 ? index - width : -1,
          y + 1 < height ? index + width : -1,
        ];
        for (const next of neighbours) {
          if (next >= 0 && mask[next] && !visited[next]) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
      if (size >= 3) {
        count++;
        largest = Math.max(largest, size);
      }
    }
    return { count, largest };
  }

  function analyseInk(imageData, width, height, threshold) {
    // 这里提取笔迹面积、宽高和粗细等简单特征。
    const data = imageData.data || imageData;
    const pixelCount = Math.max(1, width * height);
    const mask = new Uint8Array(pixelCount);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let darkCount = 0;
    let edgeCount = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumYY = 0;
    let sumXY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        const index = pixel * 4;
        const isInk = luminanceAt(data, index) < threshold;
        if (!isInk) continue;
        mask[pixel] = 1;
        darkCount++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumYY += y * y;
        sumXY += x * y;
      }
    }

    if (!darkCount) {
      return {
        threshold,
        hasInk: false,
        inkCoverage: 0,
        bboxWidth: 1,
        bboxHeight: 1,
        bboxRatio: 1,
        density: 0,
        canvasDensity: 0,
        horizontalExtent: 0,
        verticalExtent: 0,
        componentCount: 0,
        roughness: 0,
        slant: 0,
        traceHash: 0,
      };
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (!mask[index]) continue;
        if (
          x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
          !mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width]
        ) edgeCount++;
      }
    }

    const bboxWidth = Math.max(1, maxX - minX + 1);
    const bboxHeight = Math.max(1, maxY - minY + 1);
    const meanX = sumX / darkCount;
    const meanY = sumY / darkCount;
    const covXX = sumXX / darkCount - meanX * meanX;
    const covYY = sumYY / darkCount - meanY * meanY;
    const covXY = sumXY / darkCount - meanX * meanY;
    const slant = 0.5 * Math.atan2(2 * covXY, covXX - covYY);
    const components = connectedComponents(mask, width, height);
    const bboxArea = Math.max(1, bboxWidth * bboxHeight);
    const inkCoverage = darkCount / pixelCount;
    const density = darkCount / bboxArea;
    const roughness = clamp(edgeCount / Math.max(1, darkCount), 0, 1);

    return {
      threshold,
      hasInk: darkCount >= 12,
      inkCoverage,
      darkPixelCount: darkCount,
      bboxX: minX,
      bboxY: minY,
      bboxWidth,
      bboxHeight,
      bboxRatio: bboxWidth / bboxHeight,
      density: clamp(density, 0, 1),
      canvasDensity: clamp(inkCoverage * 4, 0, 1),
      horizontalExtent: bboxWidth / width,
      verticalExtent: bboxHeight / height,
      componentCount: components.count,
      largestComponent: components.largest,
      roughness,
      slant,
      traceHash: hashMask(mask),
      mask,
    };
  }

  function frameDifference(previous, current) {
    if (!previous || !current || previous.length !== current.length || !current.length) return Infinity;
    let total = 0;
    for (let i = 0; i < current.length; i++) total += Math.abs(current[i] - previous[i]);
    return total / current.length;
  }

  function isAutoCaptureCandidate(features, difference) {
    // 自动检测保留给调试，正式流程主要靠手动按钮。
    return Boolean(
      features &&
      features.hasInk &&
      features.inkCoverage >= 0.002 &&
      features.inkCoverage <= 0.14 &&
      features.horizontalExtent >= 0.16 &&
      features.verticalExtent <= 0.68 &&
      difference <= 4.2
    );
  }

  return {
    clamp,
    cameraRoi,
    computeCropRect,
    luminanceAt,
    otsuThreshold,
    analyseInk,
    frameDifference,
    isAutoCaptureCandidate,
  };
});
