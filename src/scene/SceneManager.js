/**
 * SceneManager.js
 *
 * Manages the Three.js WebGL renderer, scene graph, and lighting.
 * Handles window resize events and provides a render() method for
 * the animation loop.
 */

import * as THREE from 'three';
import { createDemoScene } from './DemoContent.js';

export class SceneManager {
    /**
     * @param {import('../projection/OffAxisCamera.js').OffAxisCamera} offAxisCamera
     */
    constructor(offAxisCamera) {
        this.camera = offAxisCamera.getCamera();
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);

        // WebGL renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('canvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Lighting
        const ambient = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 1.0);
        directional.position.set(100, 200, 300);
        this.scene.add(directional);

        const fill = new THREE.PointLight(0x8888ff, 0.4, 2000);
        fill.position.set(-200, 100, -300);
        this.scene.add(fill);

        // Populate demo content
        createDemoScene(this.scene);

        // Handle window resize
        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    /**
     * Render one frame.
     */
    render() {
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Get the scene for external modification.
     * @returns {THREE.Scene}
     */
    getScene() {
        return this.scene;
    }

    /** @private */
    _onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Note: projection matrix is managed by OffAxisCamera, not by aspect ratio.
        // No call to camera.updateProjectionMatrix() here.
    }

    /**
     * Clean up event listeners and renderer.
     */
    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.renderer.dispose();
    }
}
