import {
	SphereGeometry,
	MeshStandardMaterial,
	Mesh,
	AmbientLight,
	DirectionalLight,
	BoxGeometry,
	EdgesGeometry,
	LineSegments,
	LineBasicMaterial,
} from 'three';
import ECSpresso from '../../src';
import {
	createRenderer3DPlugin,
	createMeshComponents,
} from '../../src/plugins/rendering/renderer3D';
import {
	createPhysics3DPlugin,
	createRigidBody3D,
} from '../../src/plugins/physics/physics3D';
import {
	defineCollisionLayers,
	createSphereCollider,
} from '../../src/plugins/physics/collision3D';
import { createSpatialIndex3DPlugin } from '../../src/plugins/spatial/spatial-index3D';
import { createCamera3DPlugin } from '../../src/plugins/spatial/camera3D';
import {
	createDiagnosticsPlugin,
	createDiagnosticsOverlay,
} from '../../src/plugins/debug/diagnostics';

// -- Constants --

const BOX_HALF = 120;           // bounding box extends ±120 on each axis
const BOX_SIZE = BOX_HALF * 2;
const BALL_RADIUS = 0.4;
const SPAWN_RATE = 3;           // spheres per frame while held
const SPAWN_HEIGHT = BOX_HALF - BALL_RADIUS - 0.5;
const SPAWN_JITTER = BOX_HALF * 0.6;
const COLORS = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24, 0xa29bfe, 0xfd79a8, 0x00cec9, 0xe17055];

// -- Collision layers --

const layers = defineCollisionLayers({
	ball: ['ball'],
});

// -- ECS setup --

const ecs = ECSpresso.create()
	.withPlugin(createRenderer3DPlugin({
		background: 0x1a1a2e,
		antialias: true,
		cameraOptions: { fov: 60, near: 0.1, far: 700 },
	}))
	.withPlugin(createSpatialIndex3DPlugin({ cellSize: 4, phases: ['fixedUpdate'] }))
	.withPlugin(createPhysics3DPlugin({
		collisionSystemGroup: 'collision',
		layers,
	}))
	.withPlugin(createCamera3DPlugin({
		target: { x: 0, y: 0, z: 0 },
		azimuth: 0.6,
		elevation: 0.4,
		distance: 140,
		minDistance: 15,
		maxDistance: 400,
	}))
	.withPlugin(createDiagnosticsPlugin())
	.withComponentTypes<{ radius: number }>()
	.build();

// Bounce system — reflects velocity off all 6 faces of the bounding box.
ecs
	.addSystem('bounce')
	.inPhase('postUpdate')
	.addQuery('balls', {
		with: ['worldTransform3D', 'velocity3D', 'radius'],
	})
	.setProcess(({ queries }) => {
		for (const entity of queries.balls) {
			const { worldTransform3D, velocity3D, radius } = entity.components;
			const min = -BOX_HALF + radius;
			const max = BOX_HALF - radius;

			if (worldTransform3D.x < min) {
				worldTransform3D.x = min;
				velocity3D.x = Math.abs(velocity3D.x);
			} else if (worldTransform3D.x > max) {
				worldTransform3D.x = max;
				velocity3D.x = -Math.abs(velocity3D.x);
			}

			if (worldTransform3D.y < min) {
				worldTransform3D.y = min;
				velocity3D.y = Math.abs(velocity3D.y);
			} else if (worldTransform3D.y > max) {
				worldTransform3D.y = max;
				velocity3D.y = -Math.abs(velocity3D.y);
			}

			if (worldTransform3D.z < min) {
				worldTransform3D.z = min;
				velocity3D.z = Math.abs(velocity3D.z);
			} else if (worldTransform3D.z > max) {
				worldTransform3D.z = max;
				velocity3D.z = -Math.abs(velocity3D.z);
			}
		}
	});

// Continuous spawn system — emits spheres near the top of the box while pointer is held.
const pointerState = { down: false };

ecs
	.addSystem('continuous-spawn')
	.inPhase('preUpdate')
	.withResources(['camera3DState'])
	.setProcess(({ resources: { camera3DState } }) => {
		if (!pointerState.down) return;
		for (let i = 0; i < SPAWN_RATE; i++) {
			const x = camera3DState.targetX + (Math.random() - 0.5) * SPAWN_JITTER * 2;
			const z = camera3DState.targetZ + (Math.random() - 0.5) * SPAWN_JITTER * 2;
			spawnBall(x, SPAWN_HEIGHT, z);
		}
	});

// Initialize
await ecs.initialize();

const scene = ecs.getResource('scene');
const threeRenderer = ecs.getResource('threeRenderer');

// Lighting
scene.add(new AmbientLight(0xffffff, 0.5));
const sun = new DirectionalLight(0xffffff, 0.8);
sun.position.set(30, 50, 20);
scene.add(sun);

// Wireframe bounding box
const boxGeo = new BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
const boxEdges = new EdgesGeometry(boxGeo);
const boxLines = new LineSegments(boxEdges, new LineBasicMaterial({ color: 0x6c7086 }));
scene.add(boxLines);

// Pre-create one shared SphereGeometry and per-color materials so Three.js can batch draw calls.
const sphereGeometry = new SphereGeometry(BALL_RADIUS, 12, 8);
const ballMaterials = COLORS.map(color => new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 }));

// -- Ball spawning --

function spawnBall(x: number, y: number, z: number) {
	const colorIndex = Math.floor(Math.random() * COLORS.length);
	const material = ballMaterials[colorIndex];
	if (!material) throw new Error(`No material at index ${colorIndex}`);
	const mesh = new Mesh(sphereGeometry, material);

	ecs.spawn({
		...createMeshComponents(mesh, { x, y, z }),
		...createRigidBody3D('dynamic', { mass: 1, restitution: 0.85, drag: 0.005 }),
		...createSphereCollider(BALL_RADIUS),
		...layers.ball(),
		velocity3D: {
			x: (Math.random() - 0.5) * 30,
			y: (Math.random() - 0.5) * 10,
			z: (Math.random() - 0.5) * 30,
		},
		radius: BALL_RADIUS,
	});
}

// Spawn an initial cloud of spheres in the upper half of the box.
for (let i = 0; i < 50; i++) {
	spawnBall(
		(Math.random() - 0.5) * SPAWN_JITTER * 2,
		Math.random() * (BOX_HALF - BALL_RADIUS),
		(Math.random() - 0.5) * SPAWN_JITTER * 2,
	);
}

// -- Pointer tracking --
// camera3D already attaches its own pointerdown/move/up/wheel listeners on the same canvas
// for orbit/dolly. Our handler only sets a boolean flag and never preventDefaults, so the
// two coexist: drag rotates the camera AND spawns spheres while held.

const canvas = threeRenderer.domElement;

canvas.addEventListener('pointerdown', () => { pointerState.down = true; });
canvas.addEventListener('pointerup', () => { pointerState.down = false; });
canvas.addEventListener('pointerleave', () => { pointerState.down = false; });

// -- Collision toggle --

const toggleBtn = document.createElement('button');
toggleBtn.textContent = 'Collision: ON';
toggleBtn.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999999;padding:6px 14px;font:13px/1 monospace;background:#2a2a3e;color:#0f0;border:1px solid #555;border-radius:4px;cursor:pointer';

toggleBtn.addEventListener('click', () => {
	const enabled = ecs.isSystemGroupEnabled('collision');
	if (enabled) {
		ecs.disableSystemGroup('collision');
		ecs.disableSystemGroup('spatialIndex3D');
		toggleBtn.textContent = 'Collision: OFF';
		toggleBtn.style.color = '#f55';
	} else {
		ecs.enableSystemGroup('collision');
		ecs.enableSystemGroup('spatialIndex3D');
		toggleBtn.textContent = 'Collision: ON';
		toggleBtn.style.color = '#0f0';
	}
});

document.body.appendChild(toggleBtn);

// -- Diagnostics overlay --

const cleanupOverlay = createDiagnosticsOverlay(ecs, {
	position: 'top-right',
	showSystemTimings: true,
	maxSystemsShown: 8,
});

// Clean up on page unload
window.addEventListener('beforeunload', cleanupOverlay);
