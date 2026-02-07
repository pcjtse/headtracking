/**
 * FaceTracker.js — Webcam + MediaPipe FaceLandmarker integration
 *
 * Initialises the webcam via getUserMedia and runs MediaPipe Face Landmarker
 * to detect 478 facial landmarks per frame. Exposes a polling API
 * (getLatestLandmarks) for the render loop and an optional callback API
 * for landmark updates.
 *
 * Key landmarks extracted:
 *   - Nose tip: index 1
 *   - Left iris centre: index 468
 *   - Right iris centre: index 473
 */

const MEDIAPIPE_WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

const FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class FaceTracker {
  /**
   * @param {Object} [options]
   * @param {number} [options.videoWidth=640]  - Ideal webcam width
   * @param {number} [options.videoHeight=480] - Ideal webcam height
   * @param {string} [options.videoElementId='webcam'] - ID of the <video> element
   * @param {number} [options.minDetectionConfidence=0.5]
   * @param {number} [options.minTrackingConfidence=0.5]
   * @param {Function} [options.onLandmarks] - Callback: (landmarks, timestamp) => void
   * @param {Function} [options.onError]     - Callback: (error) => void
   */
  constructor(options = {}) {
    this._videoWidth = options.videoWidth ?? 640;
    this._videoHeight = options.videoHeight ?? 480;
    this._videoElementId = options.videoElementId ?? 'webcam';
    this._minDetectionConfidence = options.minDetectionConfidence ?? 0.5;
    this._minTrackingConfidence = options.minTrackingConfidence ?? 0.5;
    this._onLandmarks = options.onLandmarks ?? null;
    this._onError = options.onError ?? null;

    this._video = null;
    this._faceLandmarker = null;
    this._latestResult = null;
    this._running = false;
    this._animFrameId = null;
    this._lastVideoTime = -1;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Initialise webcam and MediaPipe model. Must be called once before use.
   * Rejects if camera permission is denied or the model fails to load.
   */
  async init() {
    await this._initWebcam();
    await this._initFaceLandmarker();
    this._running = true;
    this._detect();
  }

  /**
   * Returns the latest detected face landmarks, or null if no face is visible.
   *
   * Each landmark is { x, y, z } in normalised coordinates:
   *   x: 0 (left) → 1 (right)
   *   y: 0 (top)  → 1 (bottom)
   *   z: relative depth (face-width scale)
   *
   * @returns {Array<{x: number, y: number, z: number}>|null} 478 landmarks or null
   */
  getLatestLandmarks() {
    if (!this._latestResult?.faceLandmarks?.[0]) return null;
    return this._latestResult.faceLandmarks[0];
  }

  /**
   * Convenience: returns nose tip (landmark 1), left iris (468),
   * right iris (473), or null if no face detected.
   *
   * @returns {{ noseTip, leftIris, rightIris }|null}
   */
  getKeyLandmarks() {
    const lm = this.getLatestLandmarks();
    if (!lm) return null;
    return {
      noseTip: lm[1],
      leftIris: lm[468],
      rightIris: lm[473],
    };
  }

  /**
   * Returns the 4×4 facial transformation matrix from the latest detection,
   * or null if unavailable. Useful for direct head pose extraction.
   *
   * @returns {Object|null} MediaPipe transformation matrix
   */
  getTransformationMatrix() {
    if (!this._latestResult?.facialTransformationMatrixes?.[0]) return null;
    return this._latestResult.facialTransformationMatrixes[0];
  }

  /**
   * Whether a face is currently detected.
   * @returns {boolean}
   */
  isFaceDetected() {
    return this.getLatestLandmarks() !== null;
  }

  /**
   * Stop tracking and release webcam resources.
   */
  destroy() {
    this._running = false;
    if (this._animFrameId != null) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    if (this._video?.srcObject) {
      this._video.srcObject.getTracks().forEach((t) => t.stop());
      this._video.srcObject = null;
    }
    if (this._faceLandmarker) {
      this._faceLandmarker.close();
      this._faceLandmarker = null;
    }
    this._latestResult = null;
  }

  // ---------------------------------------------------------------------------
  // Private — Webcam
  // ---------------------------------------------------------------------------

  async _initWebcam() {
    // Check API availability
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new FaceTrackerError(
        'camera-unavailable',
        'getUserMedia is not supported in this browser.'
      );
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: this._videoWidth },
          height: { ideal: this._videoHeight },
          facingMode: 'user',
        },
        audio: false,
      });

      this._video = document.getElementById(this._videoElementId);
      if (!this._video) {
        // Create a hidden video element if none exists in the DOM
        this._video = document.createElement('video');
        this._video.id = this._videoElementId;
        this._video.style.display = 'none';
        document.body.appendChild(this._video);
      }

      this._video.srcObject = stream;
      this._video.setAttribute('playsinline', '');
      this._video.setAttribute('autoplay', '');

      await new Promise((resolve, reject) => {
        this._video.onloadeddata = resolve;
        this._video.onerror = reject;
        this._video.play().catch(reject);
      });
    } catch (err) {
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError'
      ) {
        throw new FaceTrackerError(
          'permission-denied',
          'Camera permission was denied. Please allow camera access.'
        );
      }
      if (
        err.name === 'NotFoundError' ||
        err.name === 'DevicesNotFoundError'
      ) {
        throw new FaceTrackerError(
          'camera-unavailable',
          'No camera device was found.'
        );
      }
      throw new FaceTrackerError('camera-error', err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Private — MediaPipe
  // ---------------------------------------------------------------------------

  async _initFaceLandmarker() {
    // Dynamic import so the module is CDN-friendly (no bundler required)
    const { FaceLandmarker, FilesetResolver } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest'
    );

    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);

    this._faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARKER_MODEL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: this._minDetectionConfidence,
      minFacePresenceConfidence: this._minDetectionConfidence,
      minTrackingConfidence: this._minTrackingConfidence,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Private — Detection Loop
  // ---------------------------------------------------------------------------

  _detect() {
    if (!this._running) return;

    this._animFrameId = requestAnimationFrame(() => this._detect());

    // Only run detection when a new video frame is available
    const now = performance.now();
    if (this._video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = this._video.currentTime;

    try {
      this._latestResult = this._faceLandmarker.detectForVideo(
        this._video,
        now
      );

      if (this._onLandmarks && this._latestResult?.faceLandmarks?.[0]) {
        this._onLandmarks(this._latestResult.faceLandmarks[0], now);
      }
    } catch (err) {
      if (this._onError) {
        this._onError(err);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Error type
// -----------------------------------------------------------------------------

export class FaceTrackerError extends Error {
  /**
   * @param {'permission-denied'|'camera-unavailable'|'camera-error'|'model-error'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'FaceTrackerError';
    this.code = code;
  }
}
