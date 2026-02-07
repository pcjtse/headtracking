/**
 * main.js — Application entry point and render loop.
 *
 * Orchestrates initialization of all modules and runs the main
 * animation loop that ties face tracking to off-axis projection rendering.
 *
 * Startup sequence:
 *   1. Create OffAxisCamera with screen geometry + projection config
 *   2. Create SceneManager (renderer, scene, lighting, demo content)
 *   3. Create FaceTracker (webcam + MediaPipe FaceLandmarker)
 *   4. Create HeadPoseEstimator (landmark → mm conversion + smoothing)
 *   5. Start render loop: track → estimate → project → render
 */

import { CONFIG } from './config.js';
import { FaceTracker } from './tracking/FaceTracker.js';
import { HeadPoseEstimator } from './tracking/HeadPoseEstimator.js';
import { OffAxisCamera } from './projection/OffAxisCamera.js';
import { SceneManager } from './scene/SceneManager.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const debugEl = document.getElementById('debug');
const debugStats = document.getElementById('debug-stats');

// ---------------------------------------------------------------------------
// Module instances (set during init)
// ---------------------------------------------------------------------------
let offAxisCamera = null;
let sceneManager = null;
let faceTracker = null;
let headPoseEstimator = null;

// ---------------------------------------------------------------------------
// FPS tracking
// ---------------------------------------------------------------------------
let frameCount = 0;
let fpsTimestamp = performance.now();
let currentFps = 0;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init() {
  try {
    // 1. Off-axis camera
    updateLoading('Setting up camera projection...');
    offAxisCamera = new OffAxisCamera({
      screenWidthMm: CONFIG.screen.widthMm,
      screenHeightMm: CONFIG.screen.heightMm,
      defaultViewingDistance: CONFIG.projection.defaultViewingDistance,
      nearClip: CONFIG.projection.nearClip,
      farClip: CONFIG.projection.farClip,
    });

    // 2. Scene manager (renderer + scene + demo content)
    updateLoading('Building scene...');
    sceneManager = new SceneManager(offAxisCamera);

    // 3. Face tracker (webcam + MediaPipe)
    updateLoading('Initializing face tracking...');
    faceTracker = new FaceTracker({
      videoWidth: CONFIG.tracking.videoWidth,
      videoHeight: CONFIG.tracking.videoHeight,
      videoElementId: CONFIG.tracking.videoElementId,
      minDetectionConfidence: CONFIG.tracking.minDetectionConfidence,
      minTrackingConfidence: CONFIG.tracking.minTrackingConfidence,
      onError: (err) => console.warn('FaceTracker error:', err),
    });

    await faceTracker.init();

    // 4. Head pose estimator (landmarks → mm + smoothing)
    headPoseEstimator = new HeadPoseEstimator({
      screenWidthMm: CONFIG.screen.widthMm,
      screenHeightMm: CONFIG.screen.heightMm,
      defaultViewingDistance: CONFIG.projection.defaultViewingDistance,
      videoWidth: CONFIG.tracking.videoWidth,
      videoHeight: CONFIG.tracking.videoHeight,
      sensitivityX: CONFIG.headPose.sensitivityX,
      sensitivityY: CONFIG.headPose.sensitivityY,
      sensitivityZ: CONFIG.headPose.sensitivityZ,
      useIrisDepth: CONFIG.headPose.useIrisDepth,
      focalLengthPx: CONFIG.headPose.useIrisDepth
        ? CONFIG.tracking.videoWidth * CONFIG.headPose.fovFactor
        : null,
      smoothing: {
        minCutoff: CONFIG.smoothing.minCutoff,
        beta: CONFIG.smoothing.beta,
        dCutoff: CONFIG.smoothing.dCutoff,
        deadZone: CONFIG.smoothing.deadZone,
      },
    });

    // 5. Hide loading overlay
    hideLoading();

    // 6. Set up keyboard shortcuts
    setupKeyboardShortcuts();

    // 7. Start render loop
    requestAnimationFrame(animate);

  } catch (err) {
    handleInitError(err);
  }
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function animate() {
  requestAnimationFrame(animate);

  // Get latest face landmarks from tracker
  const landmarks = faceTracker.getLatestLandmarks();

  // Convert to smoothed head position in mm
  const headPos = headPoseEstimator.estimate(landmarks);

  // Update camera projection if we have a valid head position
  if (headPos) {
    offAxisCamera.updateFromHeadPosition(headPos);
  }

  // Render
  sceneManager.render();

  // Update debug overlay
  updateDebugStats(headPos, landmarks !== null);

  // FPS counter
  frameCount++;
  const now = performance.now();
  if (now - fpsTimestamp >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    fpsTimestamp = now;
  }
}

// ---------------------------------------------------------------------------
// Debug overlay
// ---------------------------------------------------------------------------

function updateDebugStats(headPos, faceDetected) {
  if (!CONFIG.debug.enabled || !debugStats) return;

  const x = headPos ? headPos.x.toFixed(1) : '--';
  const y = headPos ? headPos.y.toFixed(1) : '--';
  const z = headPos ? headPos.z.toFixed(1) : '--';

  debugStats.textContent =
    `FPS: ${currentFps}\n` +
    `Face: ${faceDetected ? 'YES' : 'NO'}\n` +
    `Head X: ${x} mm\n` +
    `Head Y: ${y} mm\n` +
    `Head Z: ${z} mm`;
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    switch (e.key.toLowerCase()) {
      case 'd':
        // Toggle debug overlay
        CONFIG.debug.enabled = !CONFIG.debug.enabled;
        if (debugEl) {
          debugEl.classList.toggle('hidden', !CONFIG.debug.enabled);
        }
        break;

      case 'f':
        // Toggle fullscreen
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// Loading / error UI
// ---------------------------------------------------------------------------

function updateLoading(message) {
  if (loadingText) loadingText.textContent = message;
}

function hideLoading() {
  if (loadingEl) {
    loadingEl.classList.add('fade-out');
    setTimeout(() => loadingEl.remove(), 500);
  }
}

function handleInitError(err) {
  console.error('Initialization failed:', err);

  let userMessage = `Error: ${err.message}`;

  // Provide helpful messages for common errors
  if (err.code === 'permission-denied') {
    userMessage = 'Camera access denied. Please allow camera permission and reload.';
  } else if (err.code === 'camera-unavailable') {
    userMessage = 'No camera found. Please connect a webcam and reload.';
  }

  if (loadingText) {
    loadingText.textContent = userMessage;
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

init();
