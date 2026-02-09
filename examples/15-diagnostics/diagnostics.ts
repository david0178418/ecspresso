import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createRenderer2DPlugin,
	createSpriteComponents,
} from "../../src/plugins/renderers/renderer2D";
import {
	createPhysics2DPlugin,
	createRigidBody,
} from "../../src/plugins/physics2D";
import {
	defineCollisionLayers,
	createCircleCollider,
} from "../../src/plugins/collision";
import {
	createDiagnosticsPlugin,
	createDiagnosticsOverlay,
} from "../../src/plugins/diagnostics";

// -- Constants --

const SCREEN_W = 800;
const SCREEN_H = 600;
const BALL_RADIUS = 10;
const SPAWN_RATE = 5; // balls per frame while held
const COLORS = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24, 0xa29bfe, 0xfd79a8, 0x00cec9, 0xe17055];

// -- Collision layers --

const layers = defineCollisionLayers({
	ball: ['ball'],
});

// -- ECS setup --

const ecs = ECSpresso.create()
	.withPlugin(createRenderer2DPlugin({
		init: { background: '#1a1a2e', width: SCREEN_W, height: SCREEN_H },
		container: document.body,
	}))
	.withPlugin(createPhysics2DPlugin({ gravity: { x: 0, y: 400 }, collisionSystemGroup: 'collision', layers }))
	.withPlugin(createDiagnosticsPlugin())
	.withComponentTypes<{ radius: number; color: number }>()
	.build();

// Bounce system
ecs
	.addSystem('bounce')
	.inPhase('postUpdate')
	.addQuery('balls', {
		with: ['worldTransform', 'velocity', 'radius'],
	})
	.setProcess((queries) => {
		for (const entity of queries.balls) {
			const { worldTransform, velocity, radius } = entity.components;

			if (worldTransform.x < radius) {
				worldTransform.x = radius;
				velocity.x = Math.abs(velocity.x) * 0.9;
			} else if (worldTransform.x > SCREEN_W - radius) {
				worldTransform.x = SCREEN_W - radius;
				velocity.x = -Math.abs(velocity.x) * 0.9;
			}

			if (worldTransform.y < radius) {
				worldTransform.y = radius;
				velocity.y = Math.abs(velocity.y) * 0.9;
			} else if (worldTransform.y > SCREEN_H - radius) {
				worldTransform.y = SCREEN_H - radius;
				velocity.y = -Math.abs(velocity.y) * 0.9;
			}
		}
	});

// Continuous spawning system — reads pointer state each frame
const pointerState = { down: false, x: 0, y: 0 };

ecs
	.addSystem('continuous-spawn')
	.inPhase('preUpdate')
	.setProcess(() => {
		if (!pointerState.down) return;
		for (let i = 0; i < SPAWN_RATE; i++) {
			spawnBall(
				pointerState.x + (Math.random() - 0.5) * 40,
				pointerState.y + (Math.random() - 0.5) * 40,
			);
		}
	});

// Initialize
await ecs.initialize();

const pixiApp = ecs.getResource('pixiApp');

// -- Ball spawning --

function spawnBall(x: number, y: number) {
	const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
	const sprite = new Sprite(
		pixiApp.renderer.generateTexture(
			new Graphics().circle(0, 0, BALL_RADIUS).fill(color),
		),
	);

	ecs.spawn({
		...createSpriteComponents(sprite, { x, y }, { anchor: { x: 0.5, y: 0.5 } }),
		...createRigidBody('dynamic', { mass: 1, restitution: 0.7, drag: 0.01 }),
		...createCircleCollider(BALL_RADIUS),
		...layers.ball(),
		velocity: {
			x: (Math.random() - 0.5) * 400,
			y: (Math.random() - 0.5) * 200,
		},
		radius: BALL_RADIUS,
		color,
	});
}

// Spawn initial batch
for (let i = 0; i < 50; i++) {
	spawnBall(
		BALL_RADIUS + Math.random() * (SCREEN_W - BALL_RADIUS * 2),
		BALL_RADIUS + Math.random() * (SCREEN_H / 2),
	);
}

// -- Pointer tracking --

const canvas = pixiApp.canvas;

function updatePointerPosition(e: PointerEvent) {
	const rect = canvas.getBoundingClientRect();
	pointerState.x = e.clientX - rect.left;
	pointerState.y = e.clientY - rect.top;
}

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
	pointerState.down = true;
	updatePointerPosition(e);
});

canvas.addEventListener('pointermove', (e: PointerEvent) => {
	if (pointerState.down) updatePointerPosition(e);
});

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
		toggleBtn.textContent = 'Collision: OFF';
		toggleBtn.style.color = '#f55';
	} else {
		ecs.enableSystemGroup('collision');
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
