/**
 * HeadPoseEstimator.js — Converts face landmarks to smoothed 3D head position.
 *
 * Takes MediaPipe Face Landmarker output (478 normalised landmarks) and
 * produces a world-space head position in millimetres (screen-centred),
 * suitable for driving the off-axis projection camera.
 *
 * Pipeline:
 *   1. Extract nose tip (landmark 1) for lateral (X, Y) position
 *   2. Extract iris landmarks (468, 473) for depth (Z) via pinhole model
 *   3. Convert normalised coordinates → mm (screen-centred)
 *   4. Apply sensitivity multipliers
 *   5. Smooth with Vector3OneEuroFilter (from Smoothing.js)
 *
 * The iris-based depth estimation uses the biological constant that the
 * human iris diameter is ~11.7 mm. Combined with a calibrated focal length
 * this gives distance via the pinhole camera equation:
 *   Z = (focalLengthPx × 11.7) / irisWidthPx
 */

import { Vector3OneEuroFilter } from '../projection/Smoothing.js';

/** Average human iris diameter in mm */
const IRIS_DIAMETER_MM = 11.7;

/** Minimum iris width in pixels to trust the depth estimate */
const MIN_IRIS_PX = 5;

export class HeadPoseEstimator {
  /**
   * @param {Object} config
   * @param {number} config.screenWidthMm    - Physical screen width (mm)
   * @param {number} config.screenHeightMm   - Physical screen height (mm)
   * @param {number} config.defaultViewingDistance - Fallback depth (mm)
   * @param {number} config.videoWidth        - Webcam resolution width (px)
   * @param {number} config.videoHeight       - Webcam resolution height (px)
   * @param {number} [config.sensitivityX=1]  - Lateral tracking multiplier
   * @param {number} [config.sensitivityY=1]  - Vertical tracking multiplier
   * @param {number} [config.sensitivityZ=1]  - Depth tracking multiplier
   * @param {boolean} [config.useIrisDepth=false] - Enable iris-based depth
   * @param {number|null} [config.focalLengthPx=null] - Camera focal length (px)
   * @param {Object} [config.smoothing]       - One-Euro filter options
   * @param {number} [config.smoothing.minCutoff=1.0]
   * @param {number} [config.smoothing.beta=0.5]
   * @param {number} [config.smoothing.dCutoff=1.0]
   * @param {number} [config.smoothing.deadZone=2.0]
   */
  constructor(config) {
    this._screenW = config.screenWidthMm;
    this._screenH = config.screenHeightMm;
    this._defaultZ = config.defaultViewingDistance;
    this._videoW = config.videoWidth ?? 640;
    this._videoH = config.videoHeight ?? 480;
    this._sensX = config.sensitivityX ?? 1.0;
    this._sensY = config.sensitivityY ?? 1.0;
    this._sensZ = config.sensitivityZ ?? 1.0;
    this._useIrisDepth = config.useIrisDepth ?? false;
    this._focalLengthPx = config.focalLengthPx ?? null;

    this._filter = new Vector3OneEuroFilter(config.smoothing ?? {});
    this._wasTracking = false;
  }

  /**
   * Convert face landmarks to a smoothed 3D head position in mm.
   *
   * Coordinate system (screen-centred, right-handed):
   *   +X = right, +Y = up, +Z = toward viewer (out of screen)
   *
   * @param {Array<{x: number, y: number, z: number}>} landmarks - 478 normalised landmarks
   * @returns {{ x: number, y: number, z: number }} Head position in mm
   */
  estimate(landmarks) {
    if (!landmarks || landmarks.length === 0) {
      // Face lost — reset filter so we don't smooth across a gap
      if (this._wasTracking) {
        this._filter.reset();
        this._wasTracking = false;
      }
      return null;
    }
    this._wasTracking = true;

    const nose = landmarks[1]; // Nose tip

    // --- Lateral position (X, Y) ---
    // Normalised → mm, centred on screen.
    // Webcam image is mirrored (selfie), so landmark.x already increases
    // to the viewer's right — no additional flip needed.
    let x = (nose.x - 0.5) * this._screenW;
    let y = (0.5 - nose.y) * this._screenH; // Y flipped (cam Y is down)

    // --- Depth (Z) ---
    let z = this._defaultZ;
    if (this._useIrisDepth && this._focalLengthPx !== null) {
      z = this._estimateDepthFromIris(landmarks);
    }

    // --- Sensitivity ---
    x *= this._sensX;
    y *= this._sensY;
    // Z sensitivity: scale deviation from default distance
    z = this._defaultZ + (z - this._defaultZ) * this._sensZ;

    // --- Smooth ---
    const t = performance.now() / 1000;
    return this._filter.filter({ x, y, z }, t);
  }

  /**
   * Calibrate the focal length from a known viewing distance.
   * User sits at `distanceMm` and we measure iris width in pixels.
   *
   * @param {Array<{x: number, y: number, z: number}>} landmarks
   * @param {number} distanceMm - Known distance from screen (mm)
   * @returns {number} Computed focal length in pixels
   */
  calibrate(landmarks, distanceMm) {
    const irisPx = this._irisWidthPx(landmarks);
    if (irisPx < MIN_IRIS_PX) {
      throw new Error('Cannot calibrate: iris not detected clearly enough.');
    }
    this._focalLengthPx = (irisPx * distanceMm) / IRIS_DIAMETER_MM;
    this._useIrisDepth = true;
    return this._focalLengthPx;
  }

  /**
   * Reset the smoothing filter. Call when tracking is lost and reacquired.
   */
  reset() {
    this._filter.reset();
    this._wasTracking = false;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Estimate head distance from camera using iris diameter.
   * Pinhole camera model: Z = (f_px × iris_mm) / iris_px
   *
   * Uses the average of both iris widths for robustness.
   */
  _estimateDepthFromIris(landmarks) {
    const irisPx = this._irisWidthPx(landmarks);
    if (irisPx < MIN_IRIS_PX) return this._defaultZ;
    return (this._focalLengthPx * IRIS_DIAMETER_MM) / irisPx;
  }

  /**
   * Measure iris width in pixels (average of both eyes).
   *
   * Left iris:  landmarks 468 (centre), 469 (left), 470 (top), 471 (right), 472 (bottom)
   * Right iris: landmarks 473 (centre), 474 (left), 475 (top), 476 (right), 477 (bottom)
   *
   * We measure horizontal diameter: |left - right| for each eye.
   */
  _irisWidthPx(landmarks) {
    const leftW =
      Math.abs(landmarks[469].x - landmarks[471].x) * this._videoW;
    const rightW =
      Math.abs(landmarks[474].x - landmarks[476].x) * this._videoW;
    return (leftW + rightW) / 2;
  }
}
