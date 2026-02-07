/**
 * DemoContent.js
 *
 * Populates a Three.js scene with objects at varying depths to
 * demonstrate the head-tracking parallax effect.
 *
 * Objects at z < 0  appear to recede *into* the screen.
 * Objects at z > 0  appear to float *in front of* the screen.
 * The z = 0 plane is the physical screen surface.
 */

import * as THREE from 'three';

/**
 * Add demo objects to the given scene.
 * @param {THREE.Scene} scene
 */
export function createDemoScene(scene) {
    addWindowFrame(scene);
    addGridFloor(scene);
    addDepthCubes(scene);
    addForegroundObjects(scene);
    addBackWall(scene);
}

/**
 * Wire-frame rectangle at z=0 representing the screen boundary ("window frame").
 */
function addWindowFrame(scene) {
    const shape = new THREE.Shape();
    const hw = 170; // half of a ~340mm wide frame
    const hh = 106; // half of a ~212mm tall frame
    shape.moveTo(-hw, -hh);
    shape.lineTo( hw, -hh);
    shape.lineTo( hw,  hh);
    shape.lineTo(-hw,  hh);
    shape.lineTo(-hw, -hh);

    const points = shape.getPoints();
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x666666 });
    const frame = new THREE.LineLoop(geometry, material);
    frame.position.z = 0;
    scene.add(frame);
}

/**
 * Grid floor behind the screen plane — gives strong depth cues.
 */
function addGridFloor(scene) {
    const grid = new THREE.GridHelper(1000, 20, 0x444444, 0x282828);
    grid.position.set(0, -120, -400);
    scene.add(grid);
}

/**
 * Coloured cubes at increasing depths behind the screen.
 */
function addDepthCubes(scene) {
    const depths = [-150, -300, -500, -700];
    const hues   = [0.55, 0.40, 0.25, 0.10]; // blue → orange

    depths.forEach((z, i) => {
        const size = 30 + i * 8;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(hues[i], 0.75, 0.5),
            roughness: 0.4,
            metalness: 0.1
        });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set((i - 1.5) * 90, 0, z);

        // Slight rotation for visual interest
        cube.rotation.x = 0.3;
        cube.rotation.y = 0.5 + i * 0.3;

        scene.add(cube);
    });
}

/**
 * Objects in front of the screen plane — these "pop out" toward the viewer.
 */
function addForegroundObjects(scene) {
    // Red sphere
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(18, 32, 32),
        new THREE.MeshStandardMaterial({
            color: 0xff3333,
            roughness: 0.3,
            metalness: 0.2
        })
    );
    sphere.position.set(60, 30, 60);
    scene.add(sphere);

    // Small green torus
    const torus = new THREE.Mesh(
        new THREE.TorusGeometry(12, 4, 16, 32),
        new THREE.MeshStandardMaterial({
            color: 0x33ff66,
            roughness: 0.3,
            metalness: 0.2
        })
    );
    torus.position.set(-50, 50, 40);
    torus.rotation.x = Math.PI / 4;
    scene.add(torus);
}

/**
 * Back wall to give a sense of enclosure / room depth.
 */
function addBackWall(scene) {
    const geometry = new THREE.PlaneGeometry(1200, 600);
    const material = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
    });
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(0, 50, -800);
    scene.add(wall);
}
