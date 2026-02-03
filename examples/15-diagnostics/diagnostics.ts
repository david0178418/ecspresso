import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createRenderer2DBundle,
	createSpriteComponents,
} from "../../src/bundles/renderers/renderer2D";
import {
	createPhysics2DBundle,
	createRigidBody,
} from "../../src/bundles/utils/physics2D";
import {
	createDiagnosticsBundle,
	createDiagnosticsOverlay,
} from "../../src/bundles/utils/diagnostics";

// -- Constants --

const SCREEN_W = 800;
const SCREEN_H = 600;
const BALL_RADIUS = 10;
const COLORS = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24, 0xa29bfe, 0xfd79a8, 0x00cec9, 0xe17055];

// -- ECS setup --

const ecs = ECSpresso.create()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1a1a2e', width: SCREEN_W, height: SCREEN_H },
		container: document.body,
	}))
	.withBundle(createPhysics2DBundle({ gravity: { x: 0, y: 400 } }))
	.withBundle(createDiagnosticsBundle())
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
	})
	.build();

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

// Click to spawn more
pixiApp.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
	const rect = pixiApp.canvas.getBoundingClientRect();
	const x = e.clientX - rect.left;
	const y = e.clientY - rect.top;

	for (let i = 0; i < 10; i++) {
		spawnBall(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
	}
});

// -- Diagnostics overlay --

const cleanupOverlay = createDiagnosticsOverlay(ecs, {
	position: 'top-right',
	showSystemTimings: true,
	maxSystemsShown: 8,
});

// Clean up on page unload
window.addEventListener('beforeunload', cleanupOverlay);
