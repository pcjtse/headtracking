# Head Tracking VR with JavaScript and Webcam

A browser-based head tracking implementation that creates a 3D parallax effect using webcam face detection and Three.js. Inspired by Johnny Lee's Wii Remote head tracking demo, but using only a standard webcam and JavaScript.

## What This Does

This application tracks your head position in real-time using your webcam and adjusts the 3D scene perspective accordingly. The screen becomes a "window" into a 3D world - as you move your head left/right/up/down or closer/farther, the perspective shifts naturally, creating the illusion of depth. Objects appear to "pop out" of the screen or recede behind it.

## Quick Start

1. **Start a local web server** (required for webcam access):
   ```bash
   cd headtracking
   python3 -m http.server 8000
   ```

2. **Open in browser**: http://localhost:8000
   - **Recommended**: Chrome or Edge (best compatibility)
   - Firefox works but may have MediaPipe quirks
   - Safari has limited support

3. **Grant camera permission** when prompted

4. **Move your head** and watch the 3D scene respond!

## Controls

- **D** - Toggle debug overlay (shows FPS, head position, tracking status)
- **F** - Toggle fullscreen

## How It Works

### Technology Stack

- **Face Tracking**: MediaPipe FaceLandmarker (Google's ML face detection)
- **3D Rendering**: Three.js (WebGL)
- **Smoothing**: One-Euro adaptive filter
- **Depth Estimation**: Iris-size method (11.7mm iris diameter constant)

### Architecture

```
Webcam → MediaPipe FaceLandmarker → 468 3D face landmarks
  → Extract iris positions → Estimate head position (x, y, z in mm)
  → One-Euro filter smoothing
  → Kooima off-axis projection → Asymmetric camera frustum
  → Three.js render with adjusted perspective
```

### The Math: Off-Axis Projection

The key is **Kooima's generalized perspective projection**. Instead of a symmetric viewing frustum, we calculate an asymmetric frustum based on where your head is relative to the screen:

```javascript
left   = (-screenWidth/2 - headX) * nearPlane / headZ
right  = ( screenWidth/2 - headX) * nearPlane / headZ
bottom = (-screenHeight/2 - headY) * nearPlane / headZ
top    = ( screenHeight/2 - headY) * nearPlane / headZ
```

This creates the correct perspective as if the screen were a real window.

## Project Structure

```
headtracking/
├── index.html                    # Entry point
├── css/style.css                 # Styling + window frame effect
├── src/
│   ├── config.js                 # All tunable parameters
│   ├── main.js                   # Application orchestration
│   ├── tracking/
│   │   ├── FaceTracker.js        # MediaPipe webcam integration
│   │   └── HeadPoseEstimator.js  # Landmarks → 3D position
│   ├── projection/
│   │   ├── KooimaProjection.js   # Off-axis frustum math
│   │   ├── OffAxisCamera.js      # Three.js camera wrapper
│   │   └── Smoothing.js          # One-Euro filter
│   └── scene/
│       ├── SceneManager.js       # Renderer + lighting
│       └── DemoContent.js        # Demo objects at varying depths
└── docs/                         # Algorithm documentation
```

## Configuration

Edit `src/config.js` to customize:

- **Screen dimensions** (mm) - for accurate parallax scaling
- **Viewing distance** - default 600mm (adjust for your setup)
- **Sensitivity** - how much head movement affects the view
- **Smoothing** - One-Euro filter parameters (responsiveness vs smoothness trade-off)
- **Tracking** - webcam resolution, confidence thresholds

## Demo Scene

The default scene includes:

- **Window frame** at z=0 (the screen plane)
- **Grid floor** and **colored cubes** behind the screen (z < 0) - shows depth recession
- **Red sphere** and **green torus** in front of the screen (z > 0) - "pop out" effect
- **Directional lighting** for depth cues

## Performance

**Target**: 30 Hz face tracking, 60 FPS rendering

**Requirements**:
- Modern browser with WebGL2 support
- Webcam (640×480 or higher)
- Mid-range hardware (integrated graphics OK)

**Optimizations**:
- MediaPipe runs at webcam frame rate (~30fps)
- Three.js renders at 60fps with interpolated head position
- Duplicate frame detection skips redundant ML inference
- Capped pixel ratio (max 2×) for Retina displays

## Troubleshooting

**Camera permission denied**: Check browser settings, ensure HTTPS or localhost

**No face detected**: Ensure good lighting, face the camera directly, sit 40-80cm away

**Laggy/jittery**: Try adjusting smoothing parameters in `config.js`:
- Increase `minCutoff` (1.0 → 2.0) for more smoothing
- Decrease `beta` (0.5 → 0.3) for less responsiveness

**Poor depth tracking**: Run calibration (future feature) or adjust `defaultViewingDistance` in config

## Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome/Edge | ✅ Full support | Recommended |
| Firefox | ⚠️ Works | MediaPipe may be slower |
| Safari | ⚠️ Limited | WebGL worker issues |

## Technical Details

### Coordinate Systems

- **MediaPipe landmarks**: Normalized 0-1 coordinates
- **Head position**: Millimeters, screen-centered (+X right, +Y up, +Z toward viewer)
- **Three.js scene**: Arbitrary units (1 unit = 10mm by default)

### Depth Estimation Methods

1. **Iris-size method** (current): Uses constant 11.7mm iris diameter
2. **Constant depth** (fallback): Assumes fixed viewing distance

### Smoothing

One-Euro filter with adaptive cutoff:
- Low-pass filters both position and velocity
- Automatically adapts: smooth when still, responsive when moving
- Eliminates jitter without noticeable lag

## Credits

**Concept**: Johnny Lee's Wii Remote head tracking (2007)
**Math**: Robert Kooima's generalized perspective projection
**Implementation**: Built by a team of AI agents (researcher, cv-specialist, graphics-engineer, perf-engineer)

## References

- [Johnny Lee's Head Tracking Demo](https://www.youtube.com/watch?v=Jd3-eiid-Uw)
- [MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [Three.js Documentation](https://threejs.org/docs/)
- [Kooima's Generalized Perspective Projection](http://csc.lsu.edu/~kooima/articles/genperspective/)
- [One-Euro Filter Paper](https://cristal.univ-lille.fr/~casiez/1euro/)

## License

MIT - Feel free to use, modify, and distribute.
