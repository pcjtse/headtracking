/**
 * Smoothing.js — One-Euro Filter for adaptive signal smoothing.
 *
 * Implements the algorithm from:
 * Casiez, Roussel, Vogel. "1€ Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Interactive Systems." CHI 2012.
 *
 * The One-Euro filter adapts its cutoff frequency based on input speed:
 * - When the signal is slow/stationary → low cutoff → heavy smoothing (removes jitter)
 * - When the signal moves fast → high cutoff → light smoothing (stays responsive)
 */

/**
 * Low-pass filter used internally by the One-Euro filter.
 * Simple exponential smoothing: y[n] = α·x[n] + (1-α)·y[n-1]
 */
class LowPassFilter {
    constructor() {
        this._prev = null;
    }

    filter(x, alpha) {
        if (this._prev === null) {
            this._prev = x;
            return x;
        }
        const filtered = alpha * x + (1 - alpha) * this._prev;
        this._prev = filtered;
        return filtered;
    }

    get prev() {
        return this._prev;
    }

    reset() {
        this._prev = null;
    }
}

/**
 * One-Euro filter for scalar values.
 *
 * @param {Object} [options]
 * @param {number} [options.minCutoff=1.0] - Minimum cutoff frequency (Hz).
 *   Lower values produce smoother output when stationary but add latency.
 * @param {number} [options.beta=0.5] - Speed coefficient.
 *   Higher values make the filter more responsive to fast movements.
 * @param {number} [options.dCutoff=1.0] - Cutoff frequency for the derivative filter (Hz).
 */
export class OneEuroFilter {
    constructor({ minCutoff = 1.0, beta = 0.5, dCutoff = 1.0 } = {}) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;

        this._xFilter = new LowPassFilter();
        this._dxFilter = new LowPassFilter();
        this._tPrev = null;
    }

    /**
     * Compute the smoothing factor alpha from cutoff frequency and timestep.
     * @param {number} cutoff - Cutoff frequency in Hz
     * @param {number} dt - Time delta in seconds
     * @returns {number} Alpha value in (0, 1]
     */
    _alpha(cutoff, dt) {
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    /**
     * Filter a single scalar value.
     * @param {number} x - Raw input value
     * @param {number} timestamp - Current time in seconds (e.g. performance.now() / 1000)
     * @returns {number} Filtered value
     */
    filter(x, timestamp) {
        if (this._tPrev === null) {
            this._tPrev = timestamp;
            this._xFilter.filter(x, 1.0);
            this._dxFilter.filter(0, 1.0);
            return x;
        }

        const dt = timestamp - this._tPrev;
        if (dt <= 0) return this._xFilter.prev;
        this._tPrev = timestamp;

        // Estimate derivative
        const dx = (x - this._xFilter.prev) / dt;
        const alphaDx = this._alpha(this.dCutoff, dt);
        const dxSmoothed = this._dxFilter.filter(dx, alphaDx);

        // Adaptive cutoff: increases with speed
        const cutoff = this.minCutoff + this.beta * Math.abs(dxSmoothed);

        // Filter the signal
        const alpha = this._alpha(cutoff, dt);
        return this._xFilter.filter(x, alpha);
    }

    /**
     * Reset filter state. Call when tracking is lost and reacquired
     * to avoid a smoothing lag from the stale previous value.
     */
    reset() {
        this._xFilter.reset();
        this._dxFilter.reset();
        this._tPrev = null;
    }
}

/**
 * Dead zone threshold in millimetres. Movements smaller than this
 * are suppressed to eliminate micro-jitter from face tracking noise.
 */
const DEFAULT_DEAD_ZONE = 2.0; // mm

/**
 * One-Euro filter for 3D vectors (x, y, z).
 * Applies independent One-Euro filters per axis with an optional dead zone.
 *
 * @param {Object} [options]
 * @param {number} [options.minCutoff=1.0]
 * @param {number} [options.beta=0.5]
 * @param {number} [options.dCutoff=1.0]
 * @param {number} [options.deadZone=2.0] - Dead zone threshold in mm.
 *   Movements with a Euclidean distance smaller than this are ignored.
 */
export class Vector3OneEuroFilter {
    constructor({ minCutoff = 1.0, beta = 0.5, dCutoff = 1.0, deadZone = DEFAULT_DEAD_ZONE } = {}) {
        const opts = { minCutoff, beta, dCutoff };
        this._filterX = new OneEuroFilter(opts);
        this._filterY = new OneEuroFilter(opts);
        this._filterZ = new OneEuroFilter(opts);
        this._deadZone = deadZone;
        this._lastOutput = null;
    }

    /**
     * Filter a 3D position.
     * @param {{ x: number, y: number, z: number }} pos - Raw input position (mm)
     * @param {number} timestamp - Current time in seconds
     * @returns {{ x: number, y: number, z: number }} Filtered position
     */
    filter(pos, timestamp) {
        const fx = this._filterX.filter(pos.x, timestamp);
        const fy = this._filterY.filter(pos.y, timestamp);
        const fz = this._filterZ.filter(pos.z, timestamp);

        const filtered = { x: fx, y: fy, z: fz };

        // Dead zone: suppress output change if movement is below threshold
        if (this._deadZone > 0 && this._lastOutput !== null) {
            const dx = filtered.x - this._lastOutput.x;
            const dy = filtered.y - this._lastOutput.y;
            const dz = filtered.z - this._lastOutput.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < this._deadZone) {
                return this._lastOutput;
            }
        }

        this._lastOutput = filtered;
        return filtered;
    }

    /**
     * Reset all axis filters and dead zone state.
     */
    reset() {
        this._filterX.reset();
        this._filterY.reset();
        this._filterZ.reset();
        this._lastOutput = null;
    }
}
