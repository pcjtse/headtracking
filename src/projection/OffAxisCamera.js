/**
 * OffAxisCamera.js
 *
 * Wraps a Three.js PerspectiveCamera with off-axis (asymmetric frustum)
 * projection driven by the viewer's head position. Uses KooimaProjection
 * for the underlying math.
 *
 * IMPORTANT: Never call camera.updateProjectionMatrix() — that would
 * overwrite our custom asymmetric frustum with Three.js's default
 * symmetric perspective.
 */

import * as THREE from 'three';
import { calculateOffAxisFrustum } from './KooimaProjection.js';

export class OffAxisCamera {
    /**
     * @param {Object} config
     * @param {number} config.screenWidthMm  - Physical screen width (mm)
     * @param {number} config.screenHeightMm - Physical screen height (mm)
     * @param {number} config.defaultViewingDistance - Default eye distance from screen (mm)
     * @param {number} config.nearClip - Near clipping plane (mm)
     * @param {number} config.farClip  - Far clipping plane (mm)
     */
    constructor(config) {
        this.screenWidth  = config.screenWidthMm;
        this.screenHeight = config.screenHeightMm;
        this.near = config.nearClip;
        this.far  = config.farClip;

        // Create a PerspectiveCamera — the initial fov/aspect don't matter
        // because we immediately override the projection matrix
        this.camera = new THREE.PerspectiveCamera(
            60,
            this.screenWidth / this.screenHeight,
            this.near,
            this.far
        );

        // Set initial position at default viewing distance, centred
        const defaultPos = new THREE.Vector3(0, 0, config.defaultViewingDistance);
        this.updateFromHeadPosition(defaultPos);
    }

    /**
     * Update camera projection and position from tracked head position.
     *
     * @param {THREE.Vector3} headPos - Eye position in screen-centred mm coords
     *                                  (x: right, y: up, z: toward viewer)
     */
    updateFromHeadPosition(headPos) {
        // Compute asymmetric frustum from eye position and screen geometry
        const frustum = calculateOffAxisFrustum(
            headPos,
            { width: this.screenWidth, height: this.screenHeight },
            this.near,
            this.far
        );

        // Set the custom projection matrix
        // Three.js makePerspective signature: (left, right, top, bottom, near, far)
        this.camera.projectionMatrix.makePerspective(
            frustum.left,
            frustum.right,
            frustum.top,
            frustum.bottom,
            frustum.near,
            frustum.far
        );

        // Update the inverse (required for raycasting and other Three.js internals)
        this.camera.projectionMatrixInverse
            .copy(this.camera.projectionMatrix)
            .invert();

        // Move the camera to the eye position
        this.camera.position.set(headPos.x, headPos.y, headPos.z);

        // Look toward the screen plane (z = 0) from the eye position
        // We look at a point directly ahead on the screen plane
        this.camera.lookAt(headPos.x, headPos.y, 0);

        // Force world matrix update
        this.camera.updateMatrixWorld(true);
    }

    /**
     * Returns the underlying Three.js camera for use with renderers/scenes.
     * @returns {THREE.PerspectiveCamera}
     */
    getCamera() {
        return this.camera;
    }
}
