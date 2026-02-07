/**
 * KooimaProjection.js
 *
 * Implements Robert Kooima's Generalized Perspective Projection algorithm
 * for computing off-axis (asymmetric frustum) projection parameters from
 * a viewer's eye position and physical screen geometry.
 *
 * This is a pure math module with no Three.js or rendering dependencies.
 *
 * Reference: Kooima, R. "Generalized Perspective Projection" (2009)
 */

/**
 * @typedef {Object} ScreenGeometry
 * @property {number} width  - Physical screen width in mm
 * @property {number} height - Physical screen height in mm
 */

/**
 * @typedef {Object} FrustumParams
 * @property {number} left   - Left frustum boundary at near plane
 * @property {number} right  - Right frustum boundary at near plane
 * @property {number} top    - Top frustum boundary at near plane
 * @property {number} bottom - Bottom frustum boundary at near plane
 * @property {number} near   - Near clipping plane distance
 * @property {number} far    - Far clipping plane distance
 */

/**
 * @typedef {Object} Vec3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * Compute asymmetric frustum parameters using Kooima's Generalized
 * Perspective Projection.
 *
 * The screen is assumed to be axis-aligned, centred at the origin,
 * lying in the z=0 plane. The viewer looks from positive Z toward
 * negative Z.
 *
 * @param {Vec3}           eyePos - Viewer eye position in mm (screen-centred coords)
 * @param {ScreenGeometry} screen - Physical screen dimensions in mm
 * @param {number}         near   - Near clipping plane distance (positive, in mm)
 * @param {number}         far    - Far clipping plane distance (positive, in mm)
 * @returns {FrustumParams}
 */
export function calculateOffAxisFrustum(eyePos, screen, near, far) {
    const halfW = screen.width / 2;
    const halfH = screen.height / 2;

    // Screen corners in world space (z = 0 plane, centred at origin)
    // pa = lower-left, pb = lower-right, pc = upper-left
    const pa_x = -halfW, pa_y = -halfH, pa_z = 0;
    const pb_x =  halfW, pb_y = -halfH, pb_z = 0;
    const pc_x = -halfW, pc_y =  halfH, pc_z = 0;

    // For an axis-aligned screen the orthonormal basis is trivial:
    //   vr (right)  = (1, 0, 0)
    //   vu (up)     = (0, 1, 0)
    //   vn (normal) = (0, 0, 1)  — points toward viewer
    //
    // Therefore:
    //   dot(vr, v) = v.x
    //   dot(vu, v) = v.y
    //   dot(vn, v) = v.z

    // Vectors from eye to screen corners
    const va_x = pa_x - eyePos.x;
    const va_y = pa_y - eyePos.y;
    const va_z = pa_z - eyePos.z;

    const vb_x = pb_x - eyePos.x;
    // vb_y and vb_z not needed (only vb_x used for right extent)

    const vc_y = pc_y - eyePos.y;
    // vc_x and vc_z not needed (only vc_y used for top extent)

    // Perpendicular distance from eye to screen plane
    // d = -dot(va, vn) = -(va.z) = eyePos.z (since pa_z = 0)
    const d = -va_z;

    // Guard against eye being on or behind the screen plane
    if (d <= 0) {
        // Fall back to a small positive distance to avoid division by zero
        // or inverted projection
        return calculateOffAxisFrustum(
            { x: eyePos.x, y: eyePos.y, z: 1 },
            screen, near, far
        );
    }

    // Scale factor: project screen extents onto the near plane
    const k = near / d;

    // Frustum extents at the near plane
    // dot(vr, va) = va_x, dot(vr, vb) = vb_x
    // dot(vu, va) = va_y, dot(vu, vc) = vc_y
    const left   = va_x * k;
    const right  = vb_x * k;
    const bottom = va_y * k;
    const top    = vc_y * k;

    return { left, right, top, bottom, near, far };
}

/**
 * Full Kooima projection for an arbitrarily oriented screen.
 *
 * Use this if the screen is not axis-aligned (e.g. tilted monitor,
 * multi-screen setups, or projected displays).
 *
 * @param {Vec3} eyePos       - Viewer eye position
 * @param {Vec3} screenLL     - Screen lower-left corner (pa)
 * @param {Vec3} screenLR     - Screen lower-right corner (pb)
 * @param {Vec3} screenUL     - Screen upper-left corner (pc)
 * @param {number} near       - Near clipping plane
 * @param {number} far        - Far clipping plane
 * @returns {{ frustum: FrustumParams, viewMatrix: number[] }}
 */
export function calculateGeneralizedProjection(eyePos, screenLL, screenLR, screenUL, near, far) {
    // Step 1: Screen orthonormal basis
    const vr = normalize(sub(screenLR, screenLL));
    const vu = normalize(sub(screenUL, screenLL));
    const vn = normalize(cross(vr, vu));

    // Step 2: Vectors from eye to screen corners
    const va = sub(screenLL, eyePos);
    const vb = sub(screenLR, eyePos);
    const vc = sub(screenUL, eyePos);

    // Step 3: Distance from eye to screen plane
    const d = -dot(va, vn);

    if (d <= 0) {
        // Eye is behind screen — nudge forward
        const nudged = add(eyePos, scale(vn, 1 - d));
        return calculateGeneralizedProjection(nudged, screenLL, screenLR, screenUL, near, far);
    }

    const k = near / d;

    // Step 4: Frustum extents
    const left   = dot(vr, va) * k;
    const right  = dot(vr, vb) * k;
    const bottom = dot(vu, va) * k;
    const top    = dot(vu, vc) * k;

    // Step 5: View matrix (rotation + translation)
    // Rotates world into screen-aligned coordinates, then translates eye to origin
    const tx = -dot(vr, eyePos);
    const ty = -dot(vu, eyePos);
    const tz = -dot(vn, eyePos);

    // Column-major 4x4 view matrix (as flat array for Three.js Matrix4.fromArray())
    // Three.js stores matrices in column-major order
    const viewMatrix = [
        vr.x, vu.x, vn.x, 0,
        vr.y, vu.y, vn.y, 0,
        vr.z, vu.z, vn.z, 0,
        tx,   ty,   tz,   1
    ];

    return {
        frustum: { left, right, top, bottom, near, far },
        viewMatrix
    };
}

// --- Vector math helpers (inline, no dependencies) ---

/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** @param {Vec3} v @param {number} s @returns {Vec3} */
function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/** @param {Vec3} a @param {Vec3} b @returns {number} */
function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

/** @param {Vec3} v @returns {Vec3} */
function normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}
