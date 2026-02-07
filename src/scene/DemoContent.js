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
    addGridWallsAndCeiling(scene);
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
 * Grid lines on the ceiling, left/right walls, and back wall — matching the floor grid.
 */
function addGridWallsAndCeiling(scene) {
    const color = 0x282828;
    const cellSize = 50; // matches floor: 1000 / 20

    // Room bounds derived from the floor grid (1000×1000 centered at (0, -120, -400))
    const xMin = -500, xMax = 500;
    const zFront = 100, zBack = -900;
    const yFloor = -120, yCeil = 380; // height = 500 (10 cells of 50)

    const mat = new THREE.LineBasicMaterial({ color });

    // --- Ceiling (XZ plane at y = yCeil) ---
    const ceilPts = [];
    for (let x = xMin; x <= xMax; x += cellSize) {
        ceilPts.push(new THREE.Vector3(x, yCeil, zFront), new THREE.Vector3(x, yCeil, zBack));
    }
    for (let z = zBack; z <= zFront; z += cellSize) {
        ceilPts.push(new THREE.Vector3(xMin, yCeil, z), new THREE.Vector3(xMax, yCeil, z));
    }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ceilPts), mat));

    // --- Left wall (YZ plane at x = xMin) ---
    const leftPts = [];
    for (let y = yFloor; y <= yCeil; y += cellSize) {
        leftPts.push(new THREE.Vector3(xMin, y, zFront), new THREE.Vector3(xMin, y, zBack));
    }
    for (let z = zBack; z <= zFront; z += cellSize) {
        leftPts.push(new THREE.Vector3(xMin, yFloor, z), new THREE.Vector3(xMin, yCeil, z));
    }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(leftPts), mat));

    // --- Right wall (YZ plane at x = xMax) ---
    const rightPts = [];
    for (let y = yFloor; y <= yCeil; y += cellSize) {
        rightPts.push(new THREE.Vector3(xMax, y, zFront), new THREE.Vector3(xMax, y, zBack));
    }
    for (let z = zBack; z <= zFront; z += cellSize) {
        rightPts.push(new THREE.Vector3(xMax, yFloor, z), new THREE.Vector3(xMax, yCeil, z));
    }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rightPts), mat));

    // --- Back wall (XY plane at z = zBack) ---
    const backPts = [];
    for (let x = xMin; x <= xMax; x += cellSize) {
        backPts.push(new THREE.Vector3(x, yFloor, zBack), new THREE.Vector3(x, yCeil, zBack));
    }
    for (let y = yFloor; y <= yCeil; y += cellSize) {
        backPts.push(new THREE.Vector3(xMin, y, zBack), new THREE.Vector3(xMax, y, zBack));
    }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(backPts), mat));
}

/**
 * Coloured cubes at increasing depths behind the screen.
 */
function addDepthCubes(scene) {
    const cubes = [
        // Scattered around the room
        { pos: [-200,  20, -150], size: 30, hue: 0.55 },
        { pos: [ 150, 100, -350], size: 38, hue: 0.40 },
        { pos: [-100, 180, -550], size: 46, hue: 0.25 },
        { pos: [ 250, -50, -750], size: 54, hue: 0.10 },
        // Hanging from the ceiling (y near 380)
        { pos: [-350, 340, -200], size: 25, hue: 0.60 },
        { pos: [ 100, 320, -450], size: 32, hue: 0.80 },
        { pos: [ 380, 350, -650], size: 20, hue: 0.95 },
        { pos: [-150, 330, -700], size: 28, hue: 0.70 },
        { pos: [  50, 355, -150], size: 18, hue: 0.05 },
        { pos: [-400, 345, -500], size: 22, hue: 0.35 },
    ];

    cubes.forEach(({ pos, size, hue }, i) => {
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(hue, 0.75, 0.5),
            roughness: 0.4,
            metalness: 0.1
        });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(pos[0], pos[1], pos[2]);

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
    const geometry = new THREE.PlaneGeometry(1000, 500);
    const material = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
    });
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(0, 130, -901);
    scene.add(wall);
}
