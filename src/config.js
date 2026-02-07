/**
 * config.js — Centralized configuration for the head tracking VR app.
 *
 * All spatial units are in millimetres (mm) to match the coordinate system
 * used throughout the src/ modules (KooimaProjection, OffAxisCamera, etc.).
 *
 * Adjust screenWidthMm / screenHeightMm to match your physical monitor
 * for the most convincing parallax effect.
 */

export const CONFIG = {

  // Physical screen dimensions in mm.
  // Defaults approximate a 15-16" laptop display.
  screen: {
    widthMm: 344,             // Screen width (e.g. 344 mm for 16" MacBook Pro)
    heightMm: 215,            // Screen height
  },

  // Projection / clipping planes (mm)
  projection: {
    nearClip: 1,              // Near clipping plane
    farClip: 10000,           // Far clipping plane
    defaultViewingDistance: 600, // Default assumed eye distance from screen (mm)
  },

  // Face tracking (webcam + MediaPipe FaceLandmarker)
  tracking: {
    videoWidth: 640,          // Webcam capture width (px)
    videoHeight: 480,         // Webcam capture height (px)
    videoElementId: 'webcam', // DOM <video> element id
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  // Head pose estimation from face landmarks
  headPose: {
    // Average human iris diameter (mm) — biological constant used for
    // depth estimation via pinhole camera model.
    irisDiameterMm: 11.7,

    // Approximate webcam field-of-view factor.
    // focalLength_px ≈ videoWidth * fovFactor. Typical webcam ~60° → ~0.8
    fovFactor: 0.8,

    // Sensitivity multipliers (amplify or dampen parallax per axis)
    sensitivityX: 1.0,
    sensitivityY: 1.0,
    sensitivityZ: 1.0,

    // Whether to use iris-based depth tracking (experimental).
    // If false, Z is held at defaultViewingDistance.
    useIrisDepth: false,
  },

  // One-Euro filter parameters for smoothing head position
  // (Casiez et al., CHI 2012)
  smoothing: {
    minCutoff: 1.0,           // Low cutoff when stationary → smoother
    beta: 0.5,                // Speed coefficient → higher = more responsive to fast moves
    dCutoff: 1.0,             // Cutoff for derivative estimation
    deadZone: 2.0,            // Dead zone threshold (mm) — suppress micro-jitter
  },

  // Debug options
  debug: {
    enabled: false,           // Start with debug overlay hidden (press 'D' to toggle)
    showWebcam: true,         // Show small webcam preview in debug mode
  },
};
