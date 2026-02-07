# WebGL / Three.js Implementation Architecture

## Overview

This document describes the Three.js-based rendering architecture for the
head-tracking parallax application. Three.js is chosen for its mature API,
broad browser support, and built-in support for custom projection matrices.

---

## 1. Module Structure

```
headtracking/
├── index.html                  # Entry point, canvas + video elements
├── src/
│   ├── main.js                 # Bootstrap, orchestrates modules
│   ├── tracking/
│   │   ├── FaceTracker.js      # MediaPipe Face Mesh wrapper
│   │   └── HeadPoseEstimator.js# Converts landmarks → world coords
│   ├── projection/
│   │   ├── OffAxisCamera.js    # Custom camera with off-axis projection
│   │   ├── KooimaProjection.js # Kooima's generalized projection math
│   │   └── Smoothing.js        # One-Euro / EMA filters
│   ├── scene/
│   │   ├── SceneManager.js     # Three.js scene, renderer, lighting
│   │   └── DemoContent.js      # Demo objects for parallax showcase
│   ├── calibration/
│   │   └── CalibrationUI.js    # Screen size / distance calibration
│   └── config.js               # Default parameters, constants
├── lib/                        # Vendored or CDN-loaded dependencies
├── docs/                       # Design documents
└── package.json
```

---

## 2. Core Modules

### 2.1 `main.js` — Application Entry Point

```javascript
// Pseudocode — module orchestration

import { FaceTracker } from './tracking/FaceTracker.js';
import { HeadPoseEstimator } from './tracking/HeadPoseEstimator.js';
import { OffAxisCamera } from './projection/OffAxisCamera.js';
import { SceneManager } from './scene/SceneManager.js';
import { config } from './config.js';

async function init() {
    const tracker = new FaceTracker();
    await tracker.init();                       // Request webcam, load model

    const estimator = new HeadPoseEstimator(config);
    const camera = new OffAxisCamera(config);
    const scene = new SceneManager(camera);

    function animate() {
        requestAnimationFrame(animate);

        const landmarks = tracker.getLatestLandmarks();
        if (landmarks) {
            const headPos = estimator.estimate(landmarks);
            camera.updateFromHeadPosition(headPos);
        }

        scene.render();
    }

    animate();
}

init();
```

### 2.2 `FaceTracker.js` — Webcam + MediaPipe

Responsibilities:
- Request webcam via `navigator.mediaDevices.getUserMedia()`
- Initialize MediaPipe Face Mesh (via `@mediapipe/face_mesh` or CDN)
- Run detection on each video frame
- Expose latest landmark results

```javascript
class FaceTracker {
    constructor() {
        this.video = null;
        this.faceMesh = null;
        this.latestResults = null;
    }

    async init() {
        // 1. Get webcam stream
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' }
        });
        this.video = document.getElementById('webcam');
        this.video.srcObject = stream;
        await this.video.play();

        // 2. Init MediaPipe Face Mesh
        this.faceMesh = new FaceMesh({ locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,    // Enables iris landmarks
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        this.faceMesh.onResults((results) => {
            this.latestResults = results;
        });

        // 3. Start processing loop
        const camera = new Camera(this.video, {
            onFrame: async () => {
                await this.faceMesh.send({ image: this.video });
            },
            width: 640,
            height: 480
        });
        camera.start();
    }

    getLatestLandmarks() {
        if (!this.latestResults?.multiFaceLandmarks?.[0]) return null;
        return this.latestResults.multiFaceLandmarks[0];
    }
}
```

### 2.3 `HeadPoseEstimator.js` — Landmark → World Position

Responsibilities:
- Extract nose-tip landmark
- Convert normalized coords to millimetres (screen-relative)
- Optionally estimate depth from iris size
- Apply smoothing filters

```javascript
class HeadPoseEstimator {
    constructor(config) {
        this.config = config;
        this.filterX = new OneEuroFilter(config.smoothing);
        this.filterY = new OneEuroFilter(config.smoothing);
        this.filterZ = new OneEuroFilter(config.smoothing);
    }

    estimate(landmarks) {
        const nose = landmarks[1];   // Nose tip

        // Convert normalised → mm (screen-centred)
        let x = (nose.x - 0.5) * this.config.screenWidthMm;
        let y = (0.5 - nose.y) * this.config.screenHeightMm;
        let z = this.config.defaultViewingDistance;

        // Iris depth (if enabled)
        if (this.config.useIrisDepth) {
            z = this.estimateDepthFromIris(landmarks);
        }

        // Apply sensitivity
        x *= this.config.sensitivityX;
        y *= this.config.sensitivityY;

        // Smooth
        const now = performance.now() / 1000;
        x = this.filterX.filter(x, now);
        y = this.filterY.filter(y, now);
        z = this.filterZ.filter(z, now);

        return new THREE.Vector3(x, y, z);
    }

    estimateDepthFromIris(landmarks) {
        // Iris landmarks: left iris 468-472, right iris 473-477
        // Use average of both eyes for robustness
        const leftIrisLeft  = landmarks[469];
        const leftIrisRight = landmarks[471];
        const irisWidthNorm = Math.abs(leftIrisRight.x - leftIrisLeft.x);
        const irisWidthPx = irisWidthNorm * 640; // video width

        if (irisWidthPx < 5) return this.config.defaultViewingDistance;

        return (this.config.focalLengthPx * 11.7) / irisWidthPx;
    }
}
```

### 2.4 `KooimaProjection.js` — Off-Axis Math

Pure math module — no Three.js dependencies (takes/returns arrays or simple objects).

```javascript
/**
 * Computes asymmetric frustum parameters using Kooima's
 * Generalized Perspective Projection.
 *
 * @param {Vector3} eyePos     - Viewer's eye position (mm)
 * @param {Object}  screen     - { width, height } in mm
 * @param {number}  near       - Near clip distance
 * @param {number}  far        - Far clip distance
 * @returns {{ left, right, bottom, top, near, far, eyePos }}
 */
function computeFrustum(eyePos, screen, near, far) {
    const halfW = screen.width / 2;
    const halfH = screen.height / 2;

    // Screen corners (screen centred at origin in XY plane)
    const pa = { x: -halfW, y: -halfH, z: 0 };  // lower-left
    const pb = { x:  halfW, y: -halfH, z: 0 };  // lower-right
    const pc = { x: -halfW, y:  halfH, z: 0 };  // upper-left

    // For axis-aligned screen, basis vectors are trivial:
    // vr = (1,0,0), vu = (0,1,0), vn = (0,0,1)

    // Vectors from eye to corners
    const va = { x: pa.x - eyePos.x, y: pa.y - eyePos.y, z: pa.z - eyePos.z };
    const vb = { x: pb.x - eyePos.x, y: pb.y - eyePos.y, z: pb.z - eyePos.z };
    const vc = { x: pc.x - eyePos.x, y: pc.y - eyePos.y, z: pc.z - eyePos.z };

    // Distance from eye to screen plane (vn = z-axis)
    const d = -va.z;   // = eyePos.z (since pa.z = 0)
    const k = near / d;

    // Frustum extents at near plane
    // dot(vr, va) = va.x, dot(vu, va) = va.y, etc.
    const left   = va.x * k;
    const right  = vb.x * k;
    const bottom = va.y * k;
    const top    = vc.y * k;

    return { left, right, bottom, top, near, far, eyePos };
}
```

### 2.5 `OffAxisCamera.js` — Three.js Camera Wrapper

```javascript
class OffAxisCamera {
    constructor(config) {
        this.config = config;
        this.camera = new THREE.PerspectiveCamera(
            60,                                    // placeholder FOV
            config.screenWidthMm / config.screenHeightMm,
            config.nearClip,
            config.farClip
        );
        // Position camera at default viewing position
        this.camera.position.set(0, 0, config.defaultViewingDistance);
    }

    updateFromHeadPosition(headPos) {
        const { left, right, bottom, top, near, far } =
            computeFrustum(headPos, {
                width:  this.config.screenWidthMm,
                height: this.config.screenHeightMm
            }, this.config.nearClip, this.config.farClip);

        // Set asymmetric frustum projection
        // Three.js makePerspective expects: left, right, top, bottom, near, far
        this.camera.projectionMatrix.makePerspective(
            left, right, top, bottom, near, far
        );
        this.camera.projectionMatrixInverse
            .copy(this.camera.projectionMatrix)
            .invert();

        // Update camera position to match eye position
        this.camera.position.set(headPos.x, headPos.y, headPos.z);

        // Look toward the screen plane (negative Z direction from eye)
        this.camera.lookAt(headPos.x, headPos.y, 0);

        this.camera.updateMatrixWorld(true);
    }

    getCamera() {
        return this.camera;
    }
}
```

**Critical:** We must NOT call `camera.updateProjectionMatrix()` after setting
the custom matrix, as that would overwrite it with Three.js's default symmetric
calculation.

### 2.6 `SceneManager.js` — Renderer + Scene

```javascript
class SceneManager {
    constructor(offAxisCamera) {
        this.camera = offAxisCamera.getCamera();
        this.scene = new THREE.Scene();

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('canvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Lighting
        const ambient = new THREE.AmbientLight(0x404040, 0.5);
        const directional = new THREE.DirectionalLight(0xffffff, 1.0);
        directional.position.set(100, 200, 300);
        this.scene.add(ambient, directional);

        // Demo content
        this.addDemoContent();

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    addDemoContent() {
        // See DemoContent.js section below
        DemoContent.populate(this.scene);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Note: projection matrix is set by OffAxisCamera, not by aspect ratio
    }
}
```

### 2.7 `DemoContent.js` — Parallax Showcase Scene

Objects placed at varying depths to demonstrate the parallax effect:

```javascript
class DemoContent {
    static populate(scene) {
        // --- Reference frame: "window frame" at z=0 (screen plane) ---
        const frameGeom = new THREE.EdgesGeometry(
            new THREE.PlaneGeometry(300, 200)
        );
        const frameMat = new THREE.LineBasicMaterial({ color: 0x888888 });
        const frame = new THREE.LineSegments(frameGeom, frameMat);
        frame.position.z = 0;
        scene.add(frame);

        // --- Objects behind the screen (negative Z) ---
        // Grid floor
        const grid = new THREE.GridHelper(1000, 20, 0x444444, 0x222222);
        grid.position.set(0, -100, -400);
        scene.add(grid);

        // Cubes at different depths
        const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x4488ff });
        const depths = [-200, -400, -600, -800];
        depths.forEach((z, i) => {
            const size = 30 + i * 10;
            const cube = new THREE.Mesh(
                new THREE.BoxGeometry(size, size, size),
                cubeMaterial.clone()
            );
            cube.material.color.setHSL(i * 0.2, 0.7, 0.5);
            cube.position.set((i - 1.5) * 80, 0, z);
            scene.add(cube);
        });

        // --- Objects in front of the screen (positive Z, toward viewer) ---
        // These appear to "pop out" of the screen
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(20, 32, 32),
            new THREE.MeshStandardMaterial({ color: 0xff4444 })
        );
        sphere.position.set(60, 40, 50);
        scene.add(sphere);
    }
}
```

Objects in front of z=0 appear to float in front of the screen; objects behind
z=0 appear to recede into the screen. This split is what creates the compelling
"window" illusion.

### 2.8 `Smoothing.js` — One-Euro Filter

```javascript
class OneEuroFilter {
    constructor({ minCutoff = 1.0, beta = 0.5, dCutoff = 1.0 } = {}) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.xPrev = null;
        this.dxPrev = 0;
        this.tPrev = null;
    }

    _alpha(cutoff, dt) {
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    filter(x, timestamp) {
        if (this.tPrev === null) {
            this.xPrev = x;
            this.tPrev = timestamp;
            return x;
        }

        const dt = timestamp - this.tPrev;
        if (dt <= 0) return this.xPrev;

        // Derivative estimation
        const dx = (x - this.xPrev) / dt;
        const alphaDx = this._alpha(this.dCutoff, dt);
        const dxSmoothed = alphaDx * dx + (1 - alphaDx) * this.dxPrev;

        // Adaptive cutoff
        const cutoff = this.minCutoff + this.beta * Math.abs(dxSmoothed);

        // Filtered value
        const alpha = this._alpha(cutoff, dt);
        const xFiltered = alpha * x + (1 - alpha) * this.xPrev;

        this.xPrev = xFiltered;
        this.dxPrev = dxSmoothed;
        this.tPrev = timestamp;

        return xFiltered;
    }

    reset() {
        this.xPrev = null;
        this.dxPrev = 0;
        this.tPrev = null;
    }
}
```

### 2.9 `config.js` — Default Configuration

```javascript
export const config = {
    // Screen physical dimensions (mm)
    screenWidthMm: 344,
    screenHeightMm: 215,

    // Viewing distance
    defaultViewingDistance: 600,  // mm

    // Clipping planes (mm)
    nearClip: 1,
    farClip: 10000,

    // Tracking sensitivity multipliers
    sensitivityX: 1.0,
    sensitivityY: 1.0,
    sensitivityZ: 1.0,

    // Iris-based depth tracking
    useIrisDepth: false,
    focalLengthPx: null,   // Set during calibration

    // Smoothing (One-Euro filter)
    smoothing: {
        minCutoff: 1.0,
        beta: 0.5,
        dCutoff: 1.0
    },

    // Webcam
    videoWidth: 640,
    videoHeight: 480
};
```

---

## 3. Render Loop Architecture

```
    ┌─────────────────────────────────────────────────────────┐
    │                  requestAnimationFrame                   │
    │                                                          │
    │  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
    │  │ FaceTracker   │──▸│ HeadPose     │──▸│ OffAxis     │ │
    │  │ .getLandmarks │   │ Estimator    │   │ Camera      │ │
    │  │ ()            │   │ .estimate()  │   │ .update()   │ │
    │  └──────────────┘   └──────────────┘   └──────┬──────┘ │
    │                                                 │        │
    │                                                 ▼        │
    │                                         ┌─────────────┐ │
    │                                         │ renderer     │ │
    │                                         │ .render()    │ │
    │                                         └─────────────┘ │
    └─────────────────────────────────────────────────────────┘
```

**Key design decisions:**

1. **Face tracking runs asynchronously** — MediaPipe sends results via callback,
   not synchronously per frame. The render loop reads the *latest available*
   result, so tracking at 15-30 fps doesn't block rendering at 60 fps.

2. **Smoothing is applied in HeadPoseEstimator**, not in the camera module.
   This keeps the camera module purely mathematical.

3. **No `updateProjectionMatrix()` calls** — Three.js's built-in method would
   overwrite our custom matrix. We set `projectionMatrix` directly.

---

## 4. HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
    <title>Head Tracking Parallax</title>
    <style>
        body { margin: 0; overflow: hidden; background: #000; }
        #canvas { display: block; width: 100vw; height: 100vh; }
        #webcam {
            position: fixed; bottom: 10px; right: 10px;
            width: 160px; height: 120px;
            transform: scaleX(-1);  /* Mirror for selfie view */
            border: 1px solid #333;
            z-index: 10;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <canvas id="canvas"></canvas>
    <video id="webcam" autoplay playsinline></video>

    <!-- Dependencies (ES module imports or CDN) -->
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.170/build/three.module.js"
        }
    }
    </script>
    <script type="module" src="src/main.js"></script>
</body>
</html>
```

---

## 5. Dependency Strategy

| Dependency           | Version | Load Method       | Purpose                     |
|----------------------|---------|-------------------|-----------------------------|
| Three.js             | 0.170+  | ES module (CDN)   | 3D rendering                |
| @mediapipe/face_mesh | 0.4+    | CDN script        | Face landmark detection     |
| @mediapipe/camera_utils | 0.3+ | CDN script        | Webcam frame handling       |

No build step required — pure ES modules loaded from CDN. A bundler (Vite)
can be added later for production builds.

---

## 6. Key Implementation Notes

### 6.1 Avoiding `updateProjectionMatrix()`

Three.js's `PerspectiveCamera.updateProjectionMatrix()` recomputes the matrix
from `fov`, `aspect`, `near`, and `far`. We must avoid calling this after
setting our custom matrix. This means:

- Don't use `OrbitControls` (it calls `updateProjectionMatrix` on resize)
- Override or avoid any Three.js helper that recalculates the projection
- Set `camera.matrixAutoUpdate = false` if manually managing the world matrix

### 6.2 Projection Matrix Handedness

Three.js uses a **right-handed** coordinate system with cameras looking down
**-Z**. The `makePerspective(left, right, top, bottom, near, far)` method
produces a projection matrix consistent with this convention.

Note the parameter order: `makePerspective(left, right, TOP, BOTTOM, near, far)`
— top comes before bottom (unlike the OpenGL `glFrustum` convention).

### 6.3 Performance Budget

Target: **60 fps** render, **15-30 fps** tracking.

| Component          | Budget  |
|--------------------|---------|
| Face tracking      | ~20ms   | (async, doesn't block render)
| Pose estimation    | < 1ms   |
| Projection math    | < 0.1ms |
| Three.js render    | < 12ms  |
| **Total per frame**| < 13ms  | (render path only)
