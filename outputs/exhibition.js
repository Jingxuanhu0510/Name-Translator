(() => {
  "use strict";

  const core = window.MiZiCameraCore;
  const socket = window.io ? window.io() : null;

  const video = document.getElementById("cameraVideo");
  const liveCanvas = document.getElementById("liveCanvas");
  const frozenCanvas = document.getElementById("frozenCanvas");
  const traceOverlayCanvas = document.getElementById("traceOverlayCanvas");
  const analysisCanvas = document.getElementById("analysisCanvas");
  const sourceCanvas = document.getElementById("sourceCanvas");
  const recognitionCanvas = document.getElementById("recognitionCanvas");
  const traceCanvas = document.getElementById("traceCanvas");
  const captureLayer = document.getElementById("captureLayer");
  const liveCard = document.getElementById("liveCard");
  const setupPanel = document.getElementById("setupPanel");
  const startCameraButton = document.getElementById("startCameraButton");
  const diagnostics = document.getElementById("diagnostics");
  const diagnosticsText = document.getElementById("diagnosticsText");
  const stateTitle = document.getElementById("stateTitle");
  const stateSubtitle = document.getElementById("stateSubtitle");
  const stateLabel = document.getElementById("stateLabel");
  const wordLabel = document.getElementById("wordLabel");
  const groupsLabel = document.getElementById("groupsLabel");
  const inputHint = document.getElementById("inputHint");
  const scanActionButton = document.getElementById("scanActionButton");
  const waitingRitual = document.getElementById("waitingRitual");
  const waitingResidues = document.getElementById("waitingResidues");
  const waitingCanvas = document.getElementById("waitingCanvas");
  const returnBlackout = document.getElementById("returnBlackout");
  const returnTitleCard = document.getElementById("returnTitleCard");
  const waitingPromptTitle = document.querySelector(".waiting-visitor-prompt p");
  const waitingPromptSubtitle = document.querySelector(".waiting-visitor-prompt > span");
  const PAGE_PARAMS = new URLSearchParams(window.location.search);

  const STATES = {
    BOOT: "BOOT",
    WAITING: "WAITING",
    CARD_DETECTED: "CARD_DETECTED",
    LIVE_WRITING: "LIVE_WRITING",
    READING_TRACE: "READING_TRACE",
    REWRITING_NAME: "REWRITING_NAME",
    RESULT_ARCHIVED: "RESULT_ARCHIVED",
    RESET: "RESET",
    TRACE_UNRESOLVED: "TRACE_UNRESOLVED",
  };

  // 这里规定页面只能按这些状态顺序走，避免跳错流程。
  const ALLOWED_TRANSITIONS = {
    [STATES.BOOT]: [STATES.WAITING],
    [STATES.WAITING]: [STATES.CARD_DETECTED],
    [STATES.CARD_DETECTED]: [STATES.LIVE_WRITING, STATES.WAITING],
    [STATES.LIVE_WRITING]: [STATES.READING_TRACE],
    [STATES.READING_TRACE]: [STATES.REWRITING_NAME, STATES.TRACE_UNRESOLVED],
    [STATES.TRACE_UNRESOLVED]: [STATES.LIVE_WRITING, STATES.WAITING],
    [STATES.REWRITING_NAME]: [STATES.RESULT_ARCHIVED],
    [STATES.RESULT_ARCHIVED]: [STATES.RESET],
    [STATES.RESET]: [STATES.WAITING],
  };

  const CAPTURE_DELAY_MS = 780;
  const RESULT_HOLD_MS = 12000;
  const RESET_MS = 1200;
  const NO_TRACE_RESET_MS = 1800;
  const DUPLICATE_GUARD_MS = 1600;
  const SIMILAR_HASH_TOLERANCE = 0;
  const GENERATION_FALLBACK_MS = 28000;
  const WAITING_SETTLE_MS = 550;
  const TRACE_DETECT_HOLD_MS = 480;
  const TRACE_LOST_TO_WAITING_MS = 3200;
  const CARD_ABSENT_REARM_MS = 650;
  const TRANSITION_CROSSFADE_MS = 520;
  const TRANSITION_LOCK_MS = 720;
  const ARCHIVE_REVEAL_DELAY_MS = 720;
  const EXIT_FALL_DURATION_MS = 1760;
  const EXIT_FALL_BLACK_DELAY_MS = 1280;
  const RETURN_BLACKOUT_FADE_OUT_MS = 900;
  const RETURN_TITLE_FADE_IN_MS = 600;
  const RETURN_TITLE_HOLD_MS = 1200;
  const RETURN_TITLE_FADE_OUT_MS = 600;
  const RETURN_TITLE_BLACK_REST_MS = 300;
  const RETURN_BLACKOUT_PREROLL_MS = 900;
  const RETURN_BLACKOUT_FADE_IN_MS = 1800;
  const AUTO_CARD_DETECTION_ENABLED = false;
  const USE_MOCK_RECOGNITION = PAGE_PARAMS.get("mock") === "1";
  const SETUP_MODE = PAGE_PARAMS.get("setup") === "1";
  const MANUAL_TRIGGER_DEBOUNCE_MS = 220;

  // 这里保存当前页面状态和本轮识别数据。
  let resultResetTimer = null;
  let unresolvedResetTimer = null;
  let generationFallbackTimer = null;
  let archiveRevealTimer = null;
  let waitingSceneStopTimer = null;
  let blackoutReturnTimers = [];
  let waitingSceneStopToken = 0;
  let waitingScene = null;
  let transitionLocked = false;
  let currentTransitionToken = 0;
  let cameraDeviceSelect = null;
  let roiInput = null;
  let lastManualTriggerAt = 0;
  let cameraStartPromise = null;

  const state = {
    mode: STATES.BOOT,
    stream: null,
    cameraReady: false,
    processing: false,
    activeSubmissionId: "",
    activePayload: null,
    latestSample: null,
    latestResult: null,
    lastFrameHash: null,
    lastSubmissionHash: null,
    lastSubmissionAt: 0,
    lastRecognisedWord: "",
    lastGroups: [],
    lastError: "",
    diagnosticsVisible: false,
    loopStarted: false,
    stateStartedAt: performance.now(),
    waitingArmedAt: performance.now(),
    needsFreshSurface: false,
    traceFirstSeenAt: 0,
    traceLostAt: 0,
    liveLocked: false,
    captureToken: 0,
    scanInProgress: false,
    detectorArmed: false,
    cardAbsentSince: 0,
    cycleId: 0,
    lastDetectLogKey: "",
    manualNoticeTitle: "",
    manualNoticeSubtitle: "",
    manualNoticeUntil: 0,
    returningToWaiting: false,
  };

  // 这里接收服务器返回的识别状态和最终识别结果。
  if (socket) {
    socket.on("connect", () => {
      socket.emit("camera-ready", { page: "exhibition", timestamp: Date.now() });
      updateHud();
    });

    socket.on("handwriting-status", (payload = {}) => {
      if (payload.submissionId !== state.activeSubmissionId) return;
      if (payload.status === "RECOGNISING") {
        console.log("[screen] handwriting-status RECOGNISING", payload.submissionId);
        transitionTo(STATES.READING_TRACE, "server-recognising");
      }
    });

    socket.on("handwriting-result", (payload = {}) => {
      if (payload.submissionId !== state.activeSubmissionId) return;
      handleRecognitionResult(payload);
    });
  }

  // 字符生成完成后，进入最终展示和归档停留。
  window.addEventListener("mizi:glyph-archived", (event) => {
    clearExperienceTimers();
    state.processing = false;
    state.lastError = "";
    if (event.detail?.recognisedWord) state.lastRecognisedWord = event.detail.recognisedWord;
    if (Array.isArray(event.detail?.groups)) state.lastGroups = event.detail.groups;
    transitionTo(STATES.RESULT_ARCHIVED, "glyph-complete", { event });
    resultResetTimer = window.setTimeout(() => resetExperience("RESULT HOLD COMPLETE"), RESULT_HOLD_MS);
  });

  // 空格键和实体按钮都走同一个手动触发入口。
  startCameraButton.addEventListener("click", startCamera);
  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("#scanActionButton");
    if (!button) return;
    handleManualTrigger("screen-button", event);
  }, true);

  window.addEventListener("keydown", (event) => {
    if (event.key === "d" || event.key === "D") {
      state.diagnosticsVisible = !state.diagnosticsVisible;
      diagnostics.classList.toggle("visible", state.diagnosticsVisible);
      return;
    }
    if (event.key === "r" || event.key === "R") {
      resetExperience("TECHNICAL RESET");
      return;
    }
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      handleManualTrigger("space", event);
    }
  });

  buildWaitingResidues();
  initWaitingScene();
  buildCameraSetupControls();
  transitionTo(STATES.WAITING, "boot");
  if (!SETUP_MODE) startCamera();
  requestAnimationFrame(tick);

  // 这里打开摄像头，并保存当前可用的视频流。
  async function startCamera() {
    if (state.cameraReady && video.readyState >= 2) return true;
    if (cameraStartPromise) return cameraStartPromise;
    cameraStartPromise = (async () => {
    try {
      const savedDeviceId = window.localStorage?.getItem("miziCameraDeviceId") || "";
      const videoConstraints = savedDeviceId
        ? { deviceId: { exact: savedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" };
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      state.stream = stream;
      video.srcObject = stream;
      await video.play();
      state.cameraReady = true;
      if (!SETUP_MODE) setupPanel.classList.add("hidden");
      await refreshCameraDevices();
      updateHud();
      return true;
    } catch (error) {
      state.lastError = `${error.name || "CameraError"}: ${error.message || "camera failed"}`;
      stateTitle.textContent = "CAMERA OFFLINE";
      stateSubtitle.textContent = SETUP_MODE
        ? "Selected camera is unavailable. Choose another device in setup mode."
        : "Allow camera permission, then restart the page.";
      stateLabel.textContent = "CAMERA OFFLINE";
      updateDiagnostics();
      return false;
    } finally {
      cameraStartPromise = null;
    }
    })();
    return cameraStartPromise;
  }

  function tick() {
    drawLiveCrop();
    sampleFrameState();
    updateVisualState();
    updateDiagnostics();
    requestAnimationFrame(tick);
  }

  function sampleFrameState() {
    if (!AUTO_CARD_DETECTION_ENABLED) return;
    if (transitionLocked || !state.cameraReady || state.processing || video.readyState < 2) return;
    const sample = captureAnalysisFrame();
    if (!sample) return;
    state.latestSample = sample;
    const now = performance.now();
    const hasSurface = sample.surface.hasPaperLikeSurface;
    const hasTrace = sample.surface.hasWritableTrace;

    if (state.mode === STATES.WAITING) {
      state.liveLocked = false;
      state.traceLostAt = 0;
      if (!hasSurface) {
        if (!state.cardAbsentSince) {
          state.cardAbsentSince = now;
          logDetect("card-absent-start", { hasSurface, hasTrace });
        }
        const absentMs = now - state.cardAbsentSince;
        if (!state.detectorArmed && absentMs >= CARD_ABSENT_REARM_MS) {
          state.detectorArmed = true;
          state.needsFreshSurface = false;
          state.lastError = "";
          logDetect("detector-armed", { hasSurface, hasTrace, absentMs });
          updateHud();
        }
        state.traceFirstSeenAt = 0;
        return;
      }
      state.cardAbsentSince = 0;
      if (!state.detectorArmed || state.needsFreshSurface || now < state.waitingArmedAt) {
        if (!state.detectorArmed || state.needsFreshSurface) {
          state.lastError = "take your trace card";
          logDetect("waiting-for-card-removal", { hasSurface, hasTrace });
          updateHud();
        }
        state.traceFirstSeenAt = 0;
        return;
      }
      if (!state.traceFirstSeenAt) {
        state.traceFirstSeenAt = now;
        logDetect("card-stable-start", { hasSurface, hasTrace });
      }
      if (now - state.traceFirstSeenAt >= TRACE_DETECT_HOLD_MS) {
        state.detectorArmed = false;
        state.needsFreshSurface = true;
        state.liveLocked = true;
        state.traceLostAt = 0;
        state.cycleId += 1;
        logDetect("card-detected", { hasSurface, hasTrace, stableMs: now - state.traceFirstSeenAt });
        if (transitionTo(STATES.CARD_DETECTED, "auto-card-detected")) {
          window.setTimeout(() => transitionTo(STATES.LIVE_WRITING, "auto-card-settled"), 650);
        }
      }
      return;
    }

    if (state.mode === STATES.LIVE_WRITING) {
      // Once the visitor is in the writing/capture stage, the detector no longer
      // owns navigation. Hands, faces and shadows can temporarily cover the ROI;
      // they should not pull the page back to WAITING or hide the scan button.
      if (hasSurface) state.traceLostAt = 0;
      else if (!state.traceLostAt) state.traceLostAt = now;
      return;
    }
  }

  function drawLiveCrop() {
    if (!state.cameraReady || !video.videoWidth || !video.videoHeight) return;
    const crop = core.computeCropRect(video.videoWidth, video.videoHeight);
    const ctx = liveCanvas.getContext("2d");
    ctx.save();
    ctx.fillStyle = "#f3eee2";
    ctx.fillRect(0, 0, liveCanvas.width, liveCanvas.height);
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, liveCanvas.width, liveCanvas.height);
    ctx.restore();
  }

  // 这里从摄像头画面中截取书写区域，用于分析和提交识别。
  function captureAnalysisFrame() {
    if (!video.videoWidth || !video.videoHeight) return null;
    const crop = core.computeCropRect(video.videoWidth, video.videoHeight);
    const analysisWidth = 360;
    const analysisHeight = Math.max(80, Math.round((analysisWidth * crop.height) / crop.width));
    analysisCanvas.width = analysisWidth;
    analysisCanvas.height = analysisHeight;
    const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, analysisWidth, analysisHeight);
    const imageData = ctx.getImageData(0, 0, analysisWidth, analysisHeight);
    const threshold = core.otsuThreshold(imageData);
    const features = core.analyseInk(imageData, analysisWidth, analysisHeight, threshold);
    const surface = analyseCaptureSurface(imageData, analysisWidth, analysisHeight, features);
    return { crop, imageData, threshold, features, surface };
  }

  // 按下按钮后，根据当前状态决定是进入书写页还是开始识别。
  function handleManualTrigger(source = "manual", event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const now = performance.now();
    const acceptedBase = {
      source,
      state: state.mode,
      buttonDisabled: scanActionButton.disabled,
      captureInProgress: state.scanInProgress,
      processing: state.processing,
      isTransitioning: transitionLocked,
      cycleId: state.cycleId,
      cameraReady: state.cameraReady,
      videoReadyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      socketConnected: Boolean(socket && socket.connected),
    };
    if (now - lastManualTriggerAt < MANUAL_TRIGGER_DEBOUNCE_MS) {
      console.log("[MiZi][ACTION]", { ...acceptedBase, accepted: false, rejectReason: "debounce" });
      return false;
    }
    lastManualTriggerAt = now;
    if (state.returningToWaiting) {
      console.log("[MiZi][ACTION]", { ...acceptedBase, accepted: false, rejectReason: "return-transition" });
      return false;
    }
    if (state.processing || state.scanInProgress) {
      console.log("[MiZi][ACTION]", { ...acceptedBase, accepted: false, rejectReason: "locked" });
      setLiveNotice("BUTTON LOCKED", "The current trace is already being processed.");
      return false;
    }
    if (state.mode === STATES.WAITING) {
      console.log("[MiZi][ACTION]", { ...acceptedBase, accepted: true, action: "enter-live" });
      clearExperienceTimers();
      state.liveLocked = true;
      state.detectorArmed = false;
      state.needsFreshSurface = true;
      state.cycleId += 1;
      state.traceFirstSeenAt = 0;
      state.traceLostAt = 0;
      state.processing = false;
      state.scanInProgress = false;
      state.activeSubmissionId = "";
      state.activePayload = null;
      state.latestResult = null;
      state.lastSubmissionHash = null;
      state.lastSubmissionAt = 0;
      const sessionCycle = state.cycleId;
      if (transitionTo(STATES.CARD_DETECTED, "manual-enter-live")) {
        startCamera().then((ready) => {
          window.setTimeout(() => {
            if (sessionCycle !== state.cycleId || state.mode !== STATES.CARD_DETECTED) return;
            if (ready && state.cameraReady) {
              transitionTo(STATES.LIVE_WRITING, "manual-camera-ready");
            } else {
              state.lastError = "camera not ready";
              transitionTo(STATES.WAITING, "manual-camera-failed");
            }
          }, 650);
        });
      }
      return true;
    }
    if (state.mode === STATES.CARD_DETECTED) {
      console.log("[MiZi][ACTION]", { ...acceptedBase, accepted: true, action: "finish-enter-live" });
      if (state.cameraReady) {
        transitionTo(STATES.LIVE_WRITING, "manual-card-detected-confirm");
      } else {
        startCamera().then((ready) => {
          if (ready && state.mode === STATES.CARD_DETECTED) transitionTo(STATES.LIVE_WRITING, "manual-card-camera-ready");
          if (!ready) transitionTo(STATES.WAITING, "manual-card-camera-failed");
        });
      }
      return true;
    }
    if (state.mode === STATES.LIVE_WRITING) {
      console.log("[MiZi][ACTION]", { ...acceptedBase, accepted: true, action: "capture" });
      return requestCapture(source, event);
    }
    console.log("[MiZi][ACTION]", { ...acceptedBase, accepted: false, rejectReason: "state-not-actionable" });
    if (state.mode === STATES.TRACE_UNRESOLVED) {
      setLiveNotice("TRACE NOT CLEAR", "Please rewrite and press again after the prompt returns.");
    }
    return false;
  }

  function handlePhysicalButton(event) {
    return handleManualTrigger("space", event);
  }

  function handleScanRequest(event, trigger = "screen-button") {
    return handleManualTrigger(trigger, event);
  }

  function requestCapture(trigger = "screen-button", event = null) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    // 点击有效后立刻进入读取状态，让观众看到反馈。
    logScan("event", { trigger });
    if (state.mode !== STATES.LIVE_WRITING || state.scanInProgress) {
      logScan("blocked", {
        trigger,
        mode: state.mode,
        transitionLocked,
        scanInProgress: state.scanInProgress,
        processing: state.processing,
        buttonDisabled: scanActionButton.disabled,
      });
      setLiveNotice("CAPTURE NOT READY", "Please press again when the live writing field is visible.");
      return false;
    }
    if (!state.cameraReady) {
      state.lastError = "camera not ready";
      setLiveNotice("CAMERA NOT READY", "Press again after the camera image appears.");
      startCamera();
      return false;
    }
    if (!socket || !socket.connected) {
      state.lastError = "socket offline";
      if (transitionTo(STATES.READING_TRACE, "scan-button-socket-offline")) {
        window.setTimeout(() => {
          if (transitionTo(STATES.TRACE_UNRESOLVED, "socket-offline")) {
            scheduleUnresolvedRecovery();
          }
        }, 260);
      }
      return false;
    }
    if (state.processing) {
      logScan("blocked-processing", { trigger });
      setLiveNotice("BUTTON LOCKED", "The current trace is already being processed.");
      return false;
    }

    const sample = captureAnalysisFrame();
    state.latestSample = sample;
    logScan("manual-sample", {
      trigger,
      hasWritableTrace: sample?.surface.hasWritableTrace,
      horizontalExtent: sample?.features.horizontalExtent,
      traceHash: sample?.features.traceHash,
    });

    state.processing = true;
    state.scanInProgress = true;
    scanActionButton.classList.add("locked");
    scanActionButton.classList.remove("visible");
    scanActionButton.disabled = true;
    state.liveLocked = true;
    const captureToken = ++state.captureToken;
    if (!transitionTo(STATES.READING_TRACE, "scan-button", { trigger })) {
      state.processing = false;
      state.scanInProgress = false;
      scanActionButton.classList.remove("locked");
      scanActionButton.disabled = false;
      setLiveNotice("CAPTURE FAILED", "Press scan again.");
      logScan("transition-failed", { trigger, captureToken });
      return false;
    }
    window.setTimeout(() => {
      freezeCurrentLiveFrame();
      captureAndSend(trigger, captureToken);
    }, CAPTURE_DELAY_MS);
    logScan("capture-started", { trigger, captureToken });
    return true;
  }

  function captureAndSend(trigger, captureToken) {
    if (captureToken !== state.captureToken) return;
    if (!state.cameraReady || video.readyState < 2) {
      state.processing = false;
      state.scanInProgress = false;
      if (transitionTo(STATES.TRACE_UNRESOLVED, "camera-not-readable")) {
        scheduleUnresolvedRecovery();
      }
      return;
    }

    const sample = captureAnalysisFrame();
    if (!sample) {
      state.processing = false;
      state.scanInProgress = false;
      if (transitionTo(STATES.TRACE_UNRESOLVED, "empty-capture")) {
        scheduleUnresolvedRecovery();
      }
      return;
    }

    const maxLongEdge = 1500;
    const scale = maxLongEdge / Math.max(sample.crop.width, sample.crop.height);
    const outputWidth = Math.max(1, Math.round(sample.crop.width * scale));
    const outputHeight = Math.max(1, Math.round(sample.crop.height * scale));
    sourceCanvas.width = outputWidth;
    sourceCanvas.height = outputHeight;
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    sourceCtx.drawImage(video, sample.crop.x, sample.crop.y, sample.crop.width, sample.crop.height, 0, 0, outputWidth, outputHeight);

    const sourceData = sourceCtx.getImageData(0, 0, outputWidth, outputHeight);
    const threshold = core.otsuThreshold(sourceData);
    const detailedFeatures = core.analyseInk(sourceData, outputWidth, outputHeight, threshold);
    renderRecognitionAndTrace(sourceData, outputWidth, outputHeight, threshold);
    drawTracePreview();

    state.activeSubmissionId = makeSubmissionId();
    state.lastSubmissionHash = sample.features.traceHash;
    state.lastFrameHash = sample.features.traceHash;
    state.lastSubmissionAt = performance.now();
    state.activePayload = {
      submissionId: state.activeSubmissionId,
      sourceType: "exhibition-camera",
      captureTrigger: trigger,
      strokes: [],
      imageBase64: sourceCanvas.toDataURL("image/png"),
      traceImageBase64: traceCanvas.toDataURL("image/png"),
      width: outputWidth,
      height: outputHeight,
      timestamp: Date.now(),
      visualFeatures: toScreenFeatures(detailedFeatures, outputWidth, outputHeight),
    };

    // 这里把裁切后的图片发给本地服务器，再由服务器请求 Gemini。
    console.log("[exhibition] handwriting-submit", {
      submissionId: state.activePayload.submissionId,
      imageLength: state.activePayload.imageBase64.length,
      traceLength: state.activePayload.traceImageBase64.length,
      visualFeatures: state.activePayload.visualFeatures,
    });
    if (USE_MOCK_RECOGNITION) {
      console.log("[exhibition] mock recognition enabled", state.activePayload.submissionId);
      window.setTimeout(() => {
        const mockPayload = {
          ...state.activePayload,
          recognition: {
            fullText: "JINGXUAN",
            confidence: 0.99,
            candidates: ["JINGXUAN"],
            mode: "MOCK_RECOGNITION",
          },
        };
        window.dispatchEvent(new CustomEvent("mizi:mock-handwriting-result", { detail: mockPayload }));
        handleRecognitionResult(mockPayload);
      }, 650);
      return;
    }
    socket.emit("handwriting-submit", state.activePayload);
  }

  // 这里处理 Gemini 返回的姓名，并把它交给字符生成器。
  function handleRecognitionResult(payload) {
    const recognition = payload.recognition || {};
    const fullText = String(recognition.fullText || "").toUpperCase().replace(/[^A-Z]/g, "");
    const groups = splitWordIntoGlyphGroups(fullText);
    state.latestResult = payload;
    state.lastRecognisedWord = fullText;
    state.lastGroups = groups;
    state.processing = false;
    state.scanInProgress = false;

    if (!fullText) {
      transitionTo(STATES.TRACE_UNRESOLVED, "recognition-empty");
      scheduleUnresolvedRecovery();
      return;
    }

    window.dispatchEvent(new CustomEvent("mizi:handwriting-result", { detail: payload }));
    transitionTo(STATES.REWRITING_NAME, "recognition-success", { fullText, groups });
    generationFallbackTimer = window.setTimeout(() => {
      state.lastError = "generation archive event timeout";
      console.warn("[MiZi][GENERATION_TIMEOUT]", {
        fullText,
        groups,
        activeSubmissionId: state.activeSubmissionId,
      });
      transitionTo(STATES.RESULT_ARCHIVED, "generation-timeout");
      resultResetTimer = window.setTimeout(() => resetExperience("RESULT HOLD COMPLETE"), RESULT_HOLD_MS);
    }, GENERATION_FALLBACK_MS);
  }

  // 识别失败后短暂停留，再回到书写页面重新拍。
  function scheduleUnresolvedRecovery() {
    if (unresolvedResetTimer) window.clearTimeout(unresolvedResetTimer);
    unresolvedResetTimer = window.setTimeout(() => recoverFromUnresolved(), NO_TRACE_RESET_MS);
  }

  function recoverFromUnresolved() {
    clearExperienceTimers();
    state.processing = false;
    state.scanInProgress = false;
    state.activeSubmissionId = "";
    state.activePayload = null;
    state.latestResult = null;
    state.lastSubmissionHash = null;
    state.lastSubmissionAt = 0;
    state.liveLocked = true;
    state.traceLostAt = 0;
    const sample = state.cameraReady ? captureAnalysisFrame() : null;
    const shouldRetryLive = Boolean(state.cameraReady);
    if (sample) state.latestSample = sample;
    transitionTo(shouldRetryLive ? STATES.LIVE_WRITING : STATES.WAITING, "unresolved-retry");
  }

  function resetExperience(reason) {
    const isResultReturn =
      state.mode === STATES.RESULT_ARCHIVED &&
      String(reason || "").toUpperCase().includes("RESULT HOLD COMPLETE");
    if (isResultReturn && returnBlackout) {
      beginBlackoutReturn(reason);
      return;
    }
    completeResetExperience(reason);
  }

  // 结果页结束后先进入黑场过渡，再回到待机动画。
  function beginBlackoutReturn(reason) {
    clearExperienceTimers();
    state.returningToWaiting = true;
    const glyphExit = window.MiZiGlyphExit;
    if (glyphExit && typeof glyphExit.start === "function") {
      glyphExit.start({ duration: EXIT_FALL_DURATION_MS });
    }
    returnBlackout.classList.remove("revealing", "title-visible");
    returnBlackout.classList.add("fall-fade");

    scheduleBlackoutReturn(() => {
      returnBlackout.classList.add("visible");
    }, EXIT_FALL_BLACK_DELAY_MS);

    scheduleBlackoutReturn(() => {
      returnBlackout.classList.remove("fall-fade");
      returnBlackout.classList.add("title-visible");
    }, EXIT_FALL_BLACK_DELAY_MS + RETURN_BLACKOUT_FADE_OUT_MS);

    scheduleBlackoutReturn(() => {
      returnBlackout.classList.remove("title-visible");
    }, EXIT_FALL_BLACK_DELAY_MS + RETURN_BLACKOUT_FADE_OUT_MS + RETURN_TITLE_FADE_IN_MS + RETURN_TITLE_HOLD_MS);

    scheduleBlackoutReturn(() => {
      completeResetExperience(reason, { preserveBlackoutTimers: true });
      scheduleBlackoutReturn(() => {
        returnBlackout.classList.add("revealing");
        returnBlackout.classList.remove("visible");
        scheduleBlackoutReturn(() => {
          returnBlackout.classList.remove("revealing");
          if (window.MiZiGlyphExit && typeof window.MiZiGlyphExit.cancel === "function") {
            window.MiZiGlyphExit.cancel();
          }
          state.returningToWaiting = false;
        }, RETURN_BLACKOUT_FADE_IN_MS);
      }, RESET_MS + RETURN_BLACKOUT_PREROLL_MS);
    }, EXIT_FALL_BLACK_DELAY_MS + RETURN_BLACKOUT_FADE_OUT_MS + RETURN_TITLE_FADE_IN_MS + RETURN_TITLE_HOLD_MS + RETURN_TITLE_FADE_OUT_MS + RETURN_TITLE_BLACK_REST_MS);
  }

  function scheduleBlackoutReturn(callback, delay) {
    const timer = window.setTimeout(() => {
      blackoutReturnTimers = blackoutReturnTimers.filter((id) => id !== timer);
      callback();
    }, delay);
    blackoutReturnTimers.push(timer);
    return timer;
  }

  function clearBlackoutReturnTimers() {
    blackoutReturnTimers.forEach((timer) => window.clearTimeout(timer));
    blackoutReturnTimers = [];
    if (returnBlackout) {
      returnBlackout.classList.remove("visible", "revealing", "fall-fade", "title-visible");
    }
    if (window.MiZiGlyphExit && typeof window.MiZiGlyphExit.cancel === "function") {
      window.MiZiGlyphExit.cancel();
    }
    state.returningToWaiting = false;
  }

  function completeResetExperience(reason, options = {}) {
    clearExperienceTimers({ preserveBlackoutTimers: options.preserveBlackoutTimers === true });
    state.processing = false;
    state.scanInProgress = false;
    state.activeSubmissionId = "";
    state.activePayload = null;
    state.latestResult = null;
    state.lastRecognisedWord = "";
    state.lastGroups = [];
    state.lastError = reason || "";
    state.manualNoticeTitle = "";
    state.manualNoticeSubtitle = "";
    state.manualNoticeUntil = 0;
    if (!options.preserveBlackoutTimers) state.returningToWaiting = false;
    state.needsFreshSurface = true;
    state.detectorArmed = false;
    state.cardAbsentSince = 0;
    state.captureToken++;
    state.traceFirstSeenAt = 0;
    state.traceLostAt = 0;
    state.liveLocked = false;
    clearCaptureCanvases();
    window.dispatchEvent(new CustomEvent("mizi:reset-experience", {
      detail: { reason: state.lastError || "reset" },
    }));
    transitionTo(STATES.RESET, reason || "reset");
    window.setTimeout(() => transitionTo(STATES.WAITING, "reset-complete"), RESET_MS);
  }

  function clearExperienceTimers(options = {}) {
    if (resultResetTimer) window.clearTimeout(resultResetTimer);
    if (unresolvedResetTimer) window.clearTimeout(unresolvedResetTimer);
    if (generationFallbackTimer) window.clearTimeout(generationFallbackTimer);
    if (archiveRevealTimer) window.clearTimeout(archiveRevealTimer);
    if (waitingSceneStopTimer) window.clearTimeout(waitingSceneStopTimer);
    if (options.preserveBlackoutTimers !== true) clearBlackoutReturnTimers();
    resultResetTimer = null;
    unresolvedResetTimer = null;
    generationFallbackTimer = null;
    archiveRevealTimer = null;
    waitingSceneStopTimer = null;
  }

  function clearCaptureCanvases() {
    [liveCanvas, frozenCanvas, traceOverlayCanvas].forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  function setLiveNotice(title, subtitle, duration = 1600) {
    state.manualNoticeTitle = title;
    state.manualNoticeSubtitle = subtitle;
    state.manualNoticeUntil = performance.now() + duration;
    updateHud();
    console.log("[MiZi][NOTICE]", {
      title,
      subtitle,
      state: state.mode,
      cameraReady: state.cameraReady,
      videoReadyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      processing: state.processing,
      scanInProgress: state.scanInProgress,
      transitionLocked,
    });
  }

  function transitionTo(nextMode, cause = "unspecified", payload = {}) {
    const from = state.mode;
    const timestamp = new Date().toISOString();
    if (from === nextMode) return true;
    if (!ALLOWED_TRANSITIONS[from]?.includes(nextMode)) {
      console.warn("[BLOCKED]", `${from} -> ${nextMode}`, cause, {
        from,
        to: nextMode,
        cause,
        timestamp,
        transitionLocked,
      });
      return false;
    }
    console.log("[STATE]", `${from} -> ${nextMode}`, cause, {
      from,
      to: nextMode,
      cause,
      timestamp,
      transitionLocked,
      payload,
    });
    console.log("[MiZi][STATE]", {
      from,
      to: nextMode,
      reason: cause,
      cycleId: state.cycleId,
    });
    const token = ++currentTransitionToken;
    transitionLocked = true;
    document.body.classList.add("is-transitioning");
    document.body.dataset.fromState = from.toLowerCase();
    document.body.dataset.toState = nextMode.toLowerCase();

    if (nextMode === STATES.WAITING) {
      ensureWaitingSceneRunning("transition");
    }
    if (nextMode === STATES.LIVE_WRITING && waitingScene) {
      waitingScene.setMode("writing");
      waitingScene.start();
    }

    window.setTimeout(() => {
      if (token !== currentTransitionToken) return;
      applyMode(nextMode);
    }, TRANSITION_CROSSFADE_MS * 0.42);

    window.setTimeout(() => {
      if (token !== currentTransitionToken) return;
      document.body.classList.remove("is-transitioning");
      delete document.body.dataset.fromState;
      delete document.body.dataset.toState;
      transitionLocked = false;
    }, TRANSITION_LOCK_MS);
    return true;
  }

  function applyMode(nextMode) {
    const changed = state.mode !== nextMode;
    state.mode = nextMode;
    document.body.dataset.state = nextMode.toLowerCase();
    document.body.classList.remove("archive-revealed");
    if (archiveRevealTimer) window.clearTimeout(archiveRevealTimer);
    archiveRevealTimer = null;
    if (nextMode === STATES.RESULT_ARCHIVED) {
      archiveRevealTimer = window.setTimeout(() => {
        document.body.classList.add("archive-revealed");
      }, ARCHIVE_REVEAL_DELAY_MS);
    }
    if (changed) {
      state.stateStartedAt = performance.now();
      if (nextMode === STATES.WAITING) {
        state.waitingArmedAt = performance.now() + WAITING_SETTLE_MS;
        state.traceFirstSeenAt = 0;
        state.traceLostAt = 0;
        state.cardAbsentSince = 0;
      }
      if (nextMode === STATES.LIVE_WRITING) {
        enterLiveWriting();
      }
    }
    updateWaitingScene(nextMode);
    updateHud();
  }

  function updateHud() {
    stateLabel.textContent = state.mode.replace("_", " ");
    wordLabel.textContent = state.lastRecognisedWord || "--";
    groupsLabel.textContent = state.lastGroups.length ? state.lastGroups.join(" / ") : "--";
    if (state.mode === STATES.RESULT_ARCHIVED && state.lastGroups.length) {
      groupsLabel.textContent = `TRANSLATED CHARACTER GROUPS: ${state.lastGroups.join(" / ")}`;
    }

    if (state.mode === STATES.WAITING) {
      const readyForCard = state.detectorArmed && !state.needsFreshSurface;
      stateTitle.textContent = readyForCard ? "PRESS SPACE TO BEGIN" : "TAKE YOUR TRACE CARD";
      stateSubtitle.textContent = state.cameraReady
        ? (readyForCard ? "Open the writing field, then place your trace card under the camera." : "Clear the field before the next name residue.")
        : "Starting overhead camera.";
      inputHint.textContent = state.cameraReady
        ? (readyForCard ? "SPACE / PHYSICAL BUTTON TO BEGIN" : "TAKE YOUR TRACE CARD")
        : "CAMERA SETUP";
      if (waitingPromptTitle) waitingPromptTitle.textContent = readyForCard ? "PRESS SPACE TO BEGIN" : "TAKE YOUR TRACE CARD";
      if (waitingPromptSubtitle) waitingPromptSubtitle.textContent = readyForCard
        ? "THEN PLACE YOUR TRACE CARD UNDER THE CAMERA"
        : "CLEAR THE FIELD BEFORE THE NEXT RESIDUE";
    } else if (state.mode === STATES.CARD_DETECTED) {
      stateTitle.textContent = "TRACE FIELD OPEN";
      stateSubtitle.textContent = "Place the card in the frame and write your English name.";
      inputHint.textContent = "WRITE NAME";
    } else if (state.mode === STATES.LIVE_WRITING) {
      if (state.manualNoticeUntil && performance.now() < state.manualNoticeUntil) {
        stateTitle.textContent = state.manualNoticeTitle;
        stateSubtitle.textContent = state.manualNoticeSubtitle;
        inputHint.textContent = "PRESS SPACE AGAIN";
      } else {
        state.manualNoticeTitle = "";
        state.manualNoticeSubtitle = "";
        state.manualNoticeUntil = 0;
        stateTitle.textContent = "WRITE YOUR ENGLISH NAME";
        stateSubtitle.textContent = "When the name is finished, press Space again to translate it.";
        inputHint.textContent = "PRESS SPACE AGAIN TO TRANSLATE";
      }
    } else if (state.mode === STATES.READING_TRACE) {
      stateTitle.textContent = "READING YOUR TRACE";
      stateSubtitle.textContent = "The system is trying to read the full name on the card.";
      inputHint.textContent = "BUTTON LOCKED";
    } else if (state.mode === STATES.REWRITING_NAME) {
      stateTitle.textContent = "REWRITING YOUR NAME";
      stateSubtitle.textContent = "Your name is being translated through Name Translator.";
      inputHint.textContent = "BUTTON LOCKED";
    } else if (state.mode === STATES.RESULT_ARCHIVED) {
      stateTitle.textContent = "FILTERED NAME";
      stateSubtitle.textContent = state.lastRecognisedWord ? `"${state.lastRecognisedWord}"` : "--";
      inputHint.textContent = "RESIDUE ARCHIVED";
    } else if (state.mode === STATES.TRACE_UNRESOLVED) {
      stateTitle.textContent = "TRACE NOT CLEAR";
      stateSubtitle.textContent = "Please rewrite the name, then press Space again.";
      inputHint.textContent = "PRESS AGAIN";
      wordLabel.textContent = "UNREADABLE";
      groupsLabel.textContent = "--";
    } else if (state.mode === STATES.RESET) {
      stateTitle.textContent = "TAKE YOUR TRACE CARD";
      stateSubtitle.textContent = "The transformed name has entered the archive.";
      inputHint.textContent = "RESETTING";
    }
  }

  function updateVisualState() {
    const showLive = [STATES.CARD_DETECTED, STATES.LIVE_WRITING, STATES.READING_TRACE, STATES.REWRITING_NAME, STATES.TRACE_UNRESOLVED].includes(state.mode);
    const canSubmit = state.mode === STATES.LIVE_WRITING && !state.processing && !state.scanInProgress;
    captureLayer.classList.toggle("visible", showLive);
    waitingRitual.classList.toggle("visible", state.mode === STATES.WAITING || state.mode === STATES.CARD_DETECTED || state.mode === STATES.RESET);
    liveCard.classList.toggle("capturing", state.mode === STATES.READING_TRACE);
    liveCard.classList.toggle("translating", state.mode === STATES.READING_TRACE);
    liveCard.classList.toggle("generating", state.mode === STATES.REWRITING_NAME);
    liveCard.classList.toggle("unresolved", state.mode === STATES.TRACE_UNRESOLVED);
    scanActionButton.classList.toggle("visible", canSubmit);
    scanActionButton.classList.toggle("locked", state.processing || state.scanInProgress || state.mode === STATES.READING_TRACE);
    scanActionButton.disabled = !canSubmit;
    updateHud();
  }

  function enterLiveWriting() {
    state.processing = false;
    state.scanInProgress = false;
    state.activeSubmissionId = "";
    state.activePayload = null;
    state.latestResult = null;
    state.lastError = "";
    state.manualNoticeTitle = "";
    state.manualNoticeSubtitle = "";
    state.manualNoticeUntil = 0;
    state.captureToken++;
    scanActionButton.disabled = false;
    scanActionButton.classList.remove("locked");
    scanActionButton.removeAttribute("aria-disabled");
    scanActionButton.style.pointerEvents = "auto";
    console.log("[MiZi][LIVE_READY]", {
      cycleId: state.cycleId,
      state: state.mode,
      buttonDisabled: scanActionButton.disabled,
      scanInProgress: state.scanInProgress,
      processing: state.processing,
    });
  }

  function logScan(reason, extra = {}) {
    console.log("[MiZi][SCAN]", {
      reason,
      eventReceived: true,
      state: state.mode,
      buttonDisabled: scanActionButton.disabled,
      captureInProgress: state.scanInProgress,
      isTransitioning: transitionLocked,
      cycleId: state.cycleId,
      ...extra,
    });
  }

  function logDetect(reason, extra = {}) {
    const key = [
      reason,
      state.detectorArmed,
      state.needsFreshSurface,
      state.mode,
      Boolean(extra.hasSurface),
      Boolean(extra.hasTrace),
    ].join("|");
    if (key === state.lastDetectLogKey) return;
    state.lastDetectLogKey = key;
    console.log("[MiZi][DETECT]", {
      reason,
      detectorArmed: state.detectorArmed,
      cardPresent: Boolean(extra.hasSurface),
      hasWritableTrace: Boolean(extra.hasTrace),
      cardStableMs: state.traceFirstSeenAt ? Math.round(performance.now() - state.traceFirstSeenAt) : 0,
      cardAbsentMs: state.cardAbsentSince ? Math.round(performance.now() - state.cardAbsentSince) : 0,
      cycleId: state.cycleId,
      ...extra,
    });
  }

  function buildWaitingResidues() {
    if (!waitingResidues || waitingResidues.childElementCount) return;
    const fragments = [
      { text: "R-001", x: 11, y: 18, mono: true, size: 11, delay: -2 },
      { text: "米", x: 61, y: 15, size: 58, delay: -8 },
      { text: "乂", x: 24, y: 55, size: 72, delay: -5 },
      { text: "R-004", x: 67, y: 70, mono: true, size: 11, delay: -11 },
      { text: "口", x: 43, y: 41, size: 62, delay: -14 },
      { text: "GRID", x: 17, y: 76, mono: true, size: 11, delay: -17 },
      { text: "人", x: 74, y: 42, size: 64, delay: -20 },
    ];
    fragments.forEach((item) => {
      const el = document.createElement("span");
      el.className = `residue-fragment${item.mono ? " mono" : ""}`;
      el.textContent = item.text;
      el.style.left = `${item.x}%`;
      el.style.top = `${item.y}%`;
      el.style.fontSize = `${item.size}px`;
      el.style.animationDelay = `${item.delay}s`;
      waitingResidues.appendChild(el);
    });
  }

  function buildCameraSetupControls() {
    if (!SETUP_MODE || !setupPanel) return;
    const controls = document.createElement("div");
    controls.className = "setup-operator-controls";
    controls.innerHTML = `
      <label style="display:block;margin-top:12px;font:11px/1.5 monospace;letter-spacing:.04em;">
        OVERHEAD CAMERA
        <select id="cameraDeviceSelect" style="display:block;width:100%;margin-top:6px;"></select>
      </label>
      <label style="display:block;margin-top:10px;font:11px/1.5 monospace;letter-spacing:.04em;">
        ROI JSON
        <input id="cameraRoiInput" style="display:block;width:100%;margin-top:6px;" />
      </label>
      <button id="saveCameraRoiButton" type="button" style="margin-top:8px;">Save ROI</button>
    `;
    setupPanel.appendChild(controls);
    cameraDeviceSelect = controls.querySelector("#cameraDeviceSelect");
    roiInput = controls.querySelector("#cameraRoiInput");
    roiInput.value = JSON.stringify(core.cameraRoi());
    cameraDeviceSelect.addEventListener("change", () => {
      const deviceId = cameraDeviceSelect.value;
      if (deviceId) window.localStorage?.setItem("miziCameraDeviceId", deviceId);
      state.lastError = "camera device saved; restart camera";
      updateDiagnostics();
    });
    controls.querySelector("#saveCameraRoiButton").addEventListener("click", () => {
      try {
        const roi = JSON.parse(roiInput.value || "{}");
        window.localStorage?.setItem("miziCameraRoi", JSON.stringify(roi));
        state.lastError = "camera ROI saved";
      } catch (error) {
        state.lastError = `invalid ROI JSON: ${error.message || error}`;
      }
      updateDiagnostics();
    });
    refreshCameraDevices();
  }

  async function refreshCameraDevices() {
    if (!SETUP_MODE || !cameraDeviceSelect || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const savedDeviceId = window.localStorage?.getItem("miziCameraDeviceId") || "";
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      cameraDeviceSelect.innerHTML = "";
      cameras.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        option.selected = device.deviceId === savedDeviceId;
        cameraDeviceSelect.appendChild(option);
      });
      if (!savedDeviceId && cameras[0]) {
        window.localStorage?.setItem("miziCameraDeviceId", cameras[0].deviceId);
        cameraDeviceSelect.value = cameras[0].deviceId;
      }
    } catch (error) {
      state.lastError = `camera list failed: ${error.message || error}`;
      updateDiagnostics();
    }
  }

  function initWaitingScene() {
    if (!waitingCanvas || !window.MiZiWaitingScene) return;
    try {
      waitingScene = window.MiZiWaitingScene.init(waitingCanvas, {
        source: "waiting-animation-v19",
      });
    } catch (error) {
      state.lastError = `waiting scene failed: ${error.message || error}`;
      waitingScene = null;
    }
  }

  function updateWaitingScene(nextMode) {
    if (nextMode !== STATES.LIVE_WRITING && waitingSceneStopTimer) {
      window.clearTimeout(waitingSceneStopTimer);
      waitingSceneStopTimer = null;
      waitingSceneStopToken++;
    }
    if (nextMode === STATES.WAITING) {
      ensureWaitingSceneRunning("apply-mode");
    } else if (nextMode === STATES.CARD_DETECTED) {
      if (!waitingScene) return;
      waitingScene.setMode("writing");
      waitingScene.setVisible(true);
      waitingScene.start();
    } else if (nextMode === STATES.RESET) {
      ensureWaitingSceneRunning("reset-crossfade");
    } else if (nextMode === STATES.LIVE_WRITING) {
      if (!waitingScene) return;
      waitingScene.setMode("writing");
      waitingScene.setVisible(false);
      if (waitingSceneStopTimer) window.clearTimeout(waitingSceneStopTimer);
      const stopToken = ++waitingSceneStopToken;
      waitingSceneStopTimer = window.setTimeout(() => {
        if (stopToken !== waitingSceneStopToken || state.mode !== STATES.LIVE_WRITING) return;
        waitingScene?.stop();
        waitingSceneStopTimer = null;
      }, 640);
    } else {
      if (!waitingScene) return;
      if (waitingSceneStopTimer) {
        window.clearTimeout(waitingSceneStopTimer);
        waitingSceneStopTimer = null;
        waitingSceneStopToken++;
      }
      waitingScene.setVisible(false);
      waitingScene.stop();
    }
  }

  function ensureWaitingSceneRunning(source = "unknown") {
    if (waitingSceneStopTimer) {
      window.clearTimeout(waitingSceneStopTimer);
      waitingSceneStopTimer = null;
      waitingSceneStopToken++;
    }
    if (!waitingScene) initWaitingScene();
    if (!waitingScene || !waitingCanvas) {
      console.warn("[WAITING] renderer unavailable", { source, hasCanvas: Boolean(waitingCanvas) });
      return false;
    }
    const skipEntryHold = source === "reset-crossfade";
    waitingCanvas.style.opacity = "1";
    if (typeof waitingScene.resize === "function") waitingScene.resize();
    waitingScene.setMode("waiting", { skipEntryHold });
    waitingScene.setVisible(true, { skipEntryHold });
    waitingScene.start();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        console.log("[WAITING] renderer active", {
          source,
          canvasWidth: waitingCanvas.width,
          canvasHeight: waitingCanvas.height,
          cssOpacity: getComputedStyle(waitingCanvas).opacity,
        });
      });
    });
    return true;
  }

  function freezeCurrentLiveFrame() {
    const ctx = frozenCanvas.getContext("2d");
    ctx.clearRect(0, 0, frozenCanvas.width, frozenCanvas.height);
    ctx.drawImage(liveCanvas, 0, 0, frozenCanvas.width, frozenCanvas.height);
  }

  function drawTracePreview() {
    const ctx = traceOverlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, traceOverlayCanvas.width, traceOverlayCanvas.height);
    const scale = Math.min(traceOverlayCanvas.width / traceCanvas.width, traceOverlayCanvas.height / traceCanvas.height);
    const w = traceCanvas.width * scale;
    const h = traceCanvas.height * scale;
    ctx.drawImage(traceCanvas, (traceOverlayCanvas.width - w) / 2, (traceOverlayCanvas.height - h) / 2, w, h);
  }

  function renderRecognitionAndTrace(sourceData, width, height, threshold) {
    recognitionCanvas.width = width;
    recognitionCanvas.height = height;
    traceCanvas.width = width;
    traceCanvas.height = height;
    const recognitionCtx = recognitionCanvas.getContext("2d");
    const traceCtx = traceCanvas.getContext("2d");
    const recognitionData = recognitionCtx.createImageData(width, height);
    const traceData = traceCtx.createImageData(width, height);

    for (let i = 0; i < width * height; i++) {
      const index = i * 4;
      const luminance = core.luminanceAt(sourceData.data, index);
      const inkStrength = core.clamp((threshold + 34 - luminance) / 72, 0, 1);
      const isInk = luminance < threshold + 12;
      const paper = [243, 238, 226];
      const ink = [24, 22, 19];
      for (let channel = 0; channel < 3; channel++) {
        recognitionData.data[index + channel] = isInk ? ink[channel] : paper[channel];
        traceData.data[index + channel] = ink[channel];
      }
      recognitionData.data[index + 3] = 255;
      traceData.data[index + 3] = isInk ? Math.round(255 * inkStrength) : 0;
    }

    recognitionCtx.putImageData(recognitionData, 0, 0);
    traceCtx.putImageData(traceData, 0, 0);
  }

  function toScreenFeatures(features, width, height) {
    const componentCount = Math.max(1, Math.min(18, features.componentCount || 1));
    const estimatedLength = Math.max(1, features.darkPixelCount * 0.32);
    return {
      source: "exhibition-camera-ink-mask",
      strokeCount: componentCount,
      pointCount: Math.max(1, features.darkPixelCount),
      totalLength: estimatedLength,
      traceHash: features.traceHash,
      bboxWidth: features.bboxWidth,
      bboxHeight: features.bboxHeight,
      directionChanges: Math.round(componentCount * 1.4 + features.roughness * 12),
      bboxRatio: features.bboxRatio,
      density: features.density,
      canvasDensity: features.canvasDensity,
      averagePressure: core.clamp(features.density * 1.7, 0.22, 1),
      averageSpeed: 0.55,
      pauseCount: Math.max(0, componentCount - 1),
      angleBias: features.slant,
      angleVariance: features.roughness,
      curvature: features.roughness * Math.max(1, features.darkPixelCount * 0.02),
      verticalExtent: features.verticalExtent,
      horizontalExtent: features.horizontalExtent,
      inkCoverage: features.inkCoverage,
      roughness: features.roughness,
      captureWidth: width,
      captureHeight: height,
    };
  }

  function analyseCaptureSurface(imageData, width, height, features) {
    const data = imageData.data || imageData;
    const pixels = Math.max(1, width * height);
    let bright = 0;
    let midBright = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = core.luminanceAt(data, i);
      sum += lum;
      if (lum > 188) bright++;
      if (lum > 142) midBright++;
    }
    const brightCoverage = bright / pixels;
    const midBrightCoverage = midBright / pixels;
    const meanLuminance = sum / pixels;
    const hasPaperLikeSurface = brightCoverage > 0.10 && midBrightCoverage > 0.30 && meanLuminance > 92;
    const hasContainedInk = features.inkCoverage > 0.0015 && features.inkCoverage < 0.26;
    const hasNameSpan = features.horizontalExtent >= 0.08 && features.verticalExtent >= 0.08;
    return {
      brightCoverage,
      midBrightCoverage,
      meanLuminance,
      hasPaperLikeSurface,
      hasWritableTrace: hasPaperLikeSurface && features.hasInk && hasContainedInk && hasNameSpan,
    };
  }

  function splitWordIntoGlyphGroups(fullText) {
    const clean = String(fullText || "").toUpperCase().replace(/[^A-Z]/g, "");
    const groups = [];
    for (let i = 0; i < clean.length; i += 4) groups.push(clean.slice(i, i + 4));
    return groups;
  }

  function makeSubmissionId() {
    return "EXH-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  function updateDiagnostics() {
    if (!state.diagnosticsVisible) return;
    diagnosticsText.textContent = JSON.stringify({
      mode: state.mode,
      cameraReady: state.cameraReady,
      socketConnected: Boolean(socket && socket.connected),
      activeSubmissionId: state.activeSubmissionId,
      lastWord: state.lastRecognisedWord,
      groups: state.lastGroups,
      latestFeatures: state.latestSample ? {
        hasInk: state.latestSample.features.hasInk,
        inkCoverage: state.latestSample.features.inkCoverage,
        horizontalExtent: state.latestSample.features.horizontalExtent,
        verticalExtent: state.latestSample.features.verticalExtent,
        traceHash: state.latestSample.features.traceHash,
        hasPaperLikeSurface: state.latestSample.surface.hasPaperLikeSurface,
        hasWritableTrace: state.latestSample.surface.hasWritableTrace,
      } : null,
      latestSurface: state.latestSample?.surface || null,
      needsFreshSurface: state.needsFreshSurface,
      liveLocked: state.liveLocked,
      traceDetectMs: state.traceFirstSeenAt ? Math.round(performance.now() - state.traceFirstSeenAt) : 0,
      traceLostMs: state.traceLostAt ? Math.round(performance.now() - state.traceLostAt) : 0,
      lastError: state.lastError,
    }, null, 2);
  }
})();
