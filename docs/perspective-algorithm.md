# Perspective Transformation Algorithm Design

## Overview

This document defines the mathematical approach for translating webcam face-tracking
data into a dynamically updated off-axis (asymmetric frustum) projection, creating
a "fish tank VR" parallax effect where the monitor acts as a window into a 3D scene.

---

## 1. Coordinate Systems

### 1.1 Webcam / Face-Tracker Space

MediaPipe Face Mesh returns 468 facial landmarks in **normalized coordinates**:

| Axis | Range | Direction           |
|------|-------|---------------------|
| X    | 0 → 1 | Left → Right        |
| Y    | 0 → 1 | Top → Bottom        |
| Z    | ~-0.1 → 0.1 | Relative depth (face-width scale) |

We use the **nose tip landmark (index 1)** as the primary head position proxy.

### 1.2 Screen Space (millimetres, right-handed)

Origin at the **centre of the physical monitor**:

| Axis | Direction          |
|------|--------------------|
| +X   | Right              |
| +Y   | Up                 |
| +Z   | Out of screen (toward viewer) |

Physical screen dimensions must be configured:

```
screenWidth   = W mm   (e.g. 344 for a 16" MacBook Pro)
screenHeight  = H mm   (e.g. 215 for a 16" MacBook Pro)
```

### 1.3 Three.js World Space

Matches Screen Space (1 Three.js unit = 1 mm). The scene content lives
behind the screen plane (negative Z), and the viewer's eye is at positive Z.

---

## 2. Webcam-to-World Coordinate Mapping

### 2.1 Lateral Position (X, Y)

```
headX = (landmark.x - 0.5) * screenWidth   // mm, centred on screen
headY = (0.5 - landmark.y) * screenHeight   // mm, Y flipped (cam Y is down)
```

The webcam image is **mirrored** (selfie view), so landmark.x already increases
to the viewer's right — no additional flip needed.

### 2.2 Depth (Z) via Iris Size

Human iris diameter is a biological constant: **11.7 mm ± 0.5 mm**.

Using the pinhole camera model:

```
Z_head = (f_pixels × 11.7) / iris_pixels
```

Where `f_pixels` is the camera focal length in pixels, obtained during calibration.

**Calibration procedure (one-time):**
1. User sits at a **known distance** `D_cal` (default 600 mm).
2. Measure iris width in pixels → `iris_cal`.
3. `f_pixels = (iris_cal × D_cal) / 11.7`

### 2.3 Simplified Constant-Depth Fallback

If iris detection is unavailable or unreliable:

```
Z_head = DEFAULT_VIEWING_DISTANCE   // e.g. 600 mm
```

Lateral tracking alone provides a convincing parallax effect.

---

## 3. Off-Axis Projection (Kooima's Generalized Perspective Projection)

### 3.1 Inputs

```
pa  = screen lower-left   = (-W/2, -H/2, 0)
pb  = screen lower-right  = (+W/2, -H/2, 0)
pc  = screen upper-left   = (-W/2, +H/2, 0)
pe  = eye position         = (headX, headY, headZ)
n   = near clip            = 1 mm
f   = far clip             = 10000 mm
```

### 3.2 Algorithm

**Step 1 — Screen orthonormal basis:**

```
vr = normalize(pb - pa)     // screen right    → (1, 0, 0)
vu = normalize(pc - pa)     // screen up       → (0, 1, 0)
vn = normalize(vr × vu)     // screen normal   → (0, 0, 1)
```

For a flat, axis-aligned monitor these simplify to unit vectors. The full
formulation supports tilted/rotated screens if needed later.

**Step 2 — Vectors from eye to screen corners:**

```
va = pa - pe
vb = pb - pe
vc = pc - pe
```

**Step 3 — Perpendicular distance from eye to screen plane:**

```
d = -dot(va, vn)    // positive when eye is in front of screen
```

**Step 4 — Frustum extents at the near plane:**

```
k  = n / d
l  = dot(vr, va) × k       // left
r  = dot(vr, vb) × k       // right
b  = dot(vu, va) × k       // bottom
t  = dot(vu, vc) × k       // top
```

**Step 5 — Asymmetric frustum projection matrix (OpenGL column-major):**

```
       ⎡ 2n/(r-l)      0          (r+l)/(r-l)       0        ⎤
  P =  ⎢    0       2n/(t-b)      (t+b)/(t-b)       0        ⎢
       ⎢    0          0         -(f+n)/(f-n)   -2fn/(f-n)    ⎢
       ⎣    0          0              -1              0        ⎦
```

When the eye is centred, `(r+l)` and `(t+b)` are zero → standard symmetric
perspective. As the eye moves off-centre, these terms become non-zero →
asymmetric frustum → parallax effect.

**Step 6 — View matrix:**

```
       ⎡ vr.x  vr.y  vr.z   -dot(vr, pe) ⎤
  V =  ⎢ vu.x  vu.y  vu.z   -dot(vu, pe) ⎢
       ⎢ vn.x  vn.y  vn.z   -dot(vn, pe) ⎢
       ⎣  0      0      0         1        ⎦
```

---

## 4. Smoothing and Jitter Reduction

### 4.1 Exponential Moving Average (EMA)

Applied per-axis to raw landmark positions before coordinate conversion:

```
smoothed[t] = α × raw[t] + (1 - α) × smoothed[t-1]
```

- α = 0.3 (responsive) to 0.1 (very smooth)
- Default: **α = 0.15** — good balance for 30 fps tracking

### 4.2 One-Euro Filter (Recommended)

Adaptive low-pass filter that is smooth at low speeds and responsive at high speeds:

```
Parameters:
  minCutoff  = 1.0    // low cutoff when stationary (smoother)
  beta       = 0.5    // speed coefficient (higher = more responsive)
  dCutoff    = 1.0    // cutoff for derivative estimation
```

The One-Euro filter outperforms static EMA because it adapts to movement velocity.

### 4.3 Dead Zone

Ignore movements smaller than a threshold to prevent micro-jitter:

```
if (|delta| < DEAD_ZONE_THRESHOLD) {
    delta = 0
}
```

DEAD_ZONE_THRESHOLD ≈ 2 mm

---

## 5. Calibration Parameters

| Parameter               | Default     | Description                       |
|-------------------------|-------------|-----------------------------------|
| `screenWidthMm`         | 344         | Physical screen width (mm)        |
| `screenHeightMm`        | 215         | Physical screen height (mm)       |
| `defaultViewingDistance` | 600         | Assumed distance from screen (mm) |
| `nearClip`              | 1           | Near clipping plane (mm)          |
| `farClip`               | 10000       | Far clipping plane (mm)           |
| `smoothingAlpha`        | 0.15        | EMA smoothing factor              |
| `sensitivityX`          | 1.0         | Lateral tracking multiplier       |
| `sensitivityY`          | 1.0         | Vertical tracking multiplier      |
| `sensitivityZ`          | 1.0         | Depth tracking multiplier         |
| `useIrisDepth`          | false       | Enable iris-based depth tracking  |

Sensitivity multipliers allow amplifying or dampening the parallax effect
without changing the underlying math:

```
headX_adjusted = headX × sensitivityX
headY_adjusted = headY × sensitivityY
headZ_adjusted = defaultDistance + (headZ - defaultDistance) × sensitivityZ
```

---

## 6. Summary Pipeline

```
┌──────────────┐    ┌────────────────┐    ┌─────────────────┐
│  MediaPipe    │───▸│  Smoothing     │───▸│  Coordinate     │
│  Face Mesh    │    │  (One-Euro /   │    │  Conversion     │
│  landmarks    │    │   EMA filter)  │    │  (norm → mm)    │
└──────────────┘    └────────────────┘    └────────┬────────┘
                                                    │
                                                    ▼
                                          ┌─────────────────┐
                                          │  Eye Position   │
                                          │  (headX, Y, Z)  │
                                          └────────┬────────┘
                                                    │
                                                    ▼
                    ┌────────────────┐    ┌─────────────────┐
                    │  View Matrix   │◂──▸│  Kooima Off-Axis│
                    │                │    │  Projection     │
                    └───────┬────────┘    └────────┬────────┘
                            │                       │
                            ▼                       ▼
                    ┌─────────────────────────────────────┐
                    │  Three.js Camera Update              │
                    │  camera.projectionMatrix = P         │
                    │  camera.matrixWorldInverse = V       │
                    └─────────────────────────────────────┘
```
