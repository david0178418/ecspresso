/**
 * State Machine Example
 *
 * Demonstrates the state machine bundle with enemies that patrol, chase,
 * and attack based on proximity to the player.
 *
 * States:
 *   Patrol (blue)  — wander back and forth
 *   Chase (orange) — move toward player when nearby
 *   Attack (red)   — flash red when very close, then return to chase
 */

import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from '../../src';
import {
	createRenderer2DBundle,
	createSpriteComponents,
	type Renderer2DComponentTypes,
	type Renderer2DResourceTypes,
} from '../../src/bundles/renderers/renderer2D';
import {
	createPhysics2DBundle,
	createRigidBody,
	setVelocity,
	type Physics2DComponentTypes,
} from '../../src/bundles/utils/physics2D';
import { createInputBundle, type InputResourceTypes } from '../../src/bundles/utils/input';
import {
	createStateMachineKit,
	getStateMachineState,
	type StateMachineComponentTypes,
	type StateMachineEventTypes,
} from '../../src/bundles/utils/state-machine';

// ==================== Types ====================
// Aggregate types are needed here because `type ECS` must be defined
// before the ecs builder chain (state machine kit uses it).

interface AppComponents {
	player: true;
	enemy: true;
	patrolDirection: 1 | -1;
	speed: number;
}

type Components = AppComponents & Renderer2DComponentTypes & Physics2DComponentTypes & StateMachineComponentTypes;
type Events = StateMachineEventTypes;
type Resources = Renderer2DResourceTypes & InputResourceTypes;

// ==================== Constants ====================

const CHASE_RANGE = 180;
const ATTACK_RANGE = 50;
const PATROL_SPEED = 80;
const CHASE_SPEED = 150;
const ATTACK_DURATION = 0.4;

const STATE_COLORS = {
	patrol: 0x4444ff,
	chase: 0xff8800,
	attack: 0xff0000,
} as const;

// ==================== Types ====================

type ECS = ECSpresso<Components, Events, Resources>;

const { bundle: stateMachineBundle, defineStateMachine, createStateMachine } =
	createStateMachineKit<ECS>();

// ==================== Helpers ====================

function getPlayerPosition(ecs: ECS): { x: number; y: number } | null {
	const entities = ecs.getEntitiesWithQuery(['player', 'worldTransform']);
	const player = entities[0];
	if (!player) return null;
	return player.components.worldTransform;
}

function distanceToPlayer(ecs: ECS, entityId: number): number {
	const playerPos = getPlayerPosition(ecs);
	if (!playerPos) return Infinity;

	const wt = ecs.entityManager.getComponent(entityId, 'worldTransform');
	if (!wt) return Infinity;

	const dx = wt.x - playerPos.x;
	const dy = wt.y - playerPos.y;
	return Math.sqrt(dx * dx + dy * dy);
}

// ==================== State Machine Definition ====================

const enemyFSM = defineStateMachine('enemy', {
	initial: 'patrol',
	states: {
		patrol: {
			onEnter(ecs, entityId) {
				updateEnemyColor(ecs, entityId, STATE_COLORS.patrol);
			},
			onUpdate(ecs, entityId) {
				const wt = ecs.entityManager.getComponent(entityId, 'worldTransform');
				const dir = ecs.entityManager.getComponent(entityId, 'patrolDirection');
				if (!wt || dir === null) return;

				// Reverse at screen edges
				const bounds = ecs.getResource('bounds');
				if (wt.x < 40 || wt.x > bounds.width - 40) {
					const newDir = dir === 1 ? -1 : 1;
					ecs.entityManager.addComponent(entityId, 'patrolDirection', newDir);
					setVelocity(ecs, entityId, newDir * PATROL_SPEED, 0);
				}
			},
			transitions: [
				{
					target: 'chase',
					guard: (ecs, entityId) => distanceToPlayer(ecs, entityId) < CHASE_RANGE,
				},
			],
		},
		chase: {
			onEnter(ecs, entityId) {
				updateEnemyColor(ecs, entityId, STATE_COLORS.chase);
			},
			onUpdate(ecs, entityId) {
				const playerPos = getPlayerPosition(ecs);
				if (!playerPos) return;

				const wt = ecs.entityManager.getComponent(entityId, 'worldTransform');
				if (!wt) return;

				const dx = playerPos.x - wt.x;
				const dy = playerPos.y - wt.y;
				const len = Math.sqrt(dx * dx + dy * dy);
				if (len < 0.001) return;

				setVelocity(ecs, entityId, (dx / len) * CHASE_SPEED, (dy / len) * CHASE_SPEED);
			},
			transitions: [
				{
					target: 'attack',
					guard: (ecs, entityId) => distanceToPlayer(ecs, entityId) < ATTACK_RANGE,
				},
				{
					target: 'patrol',
					guard: (ecs, entityId) => distanceToPlayer(ecs, entityId) > CHASE_RANGE * 1.3,
				},
			],
		},
		attack: {
			onEnter(ecs, entityId) {
				updateEnemyColor(ecs, entityId, STATE_COLORS.attack);
				setVelocity(ecs, entityId, 0, 0);
			},
			transitions: [
				{
					target: 'chase',
					guard: (ecs, entityId) => {
						const sm = ecs.entityManager.getComponent(entityId, 'stateMachine');
						return (sm?.stateTime ?? 0) > ATTACK_DURATION;
					},
				},
			],
		},
	},
});

function updateEnemyColor(ecs: ECS, entityId: number, color: number): void {
	const gfx = ecs.entityManager.getComponent(entityId, 'graphics');
	if (!gfx) return;
	gfx.clear().circle(0, 0, 15).fill(color);
}

// ==================== Build ECS ====================

const ecs = ECSpresso
	.create()
	.withBundle(createRenderer2DBundle({
		init: { background: '#111122', resizeTo: window },
		container: document.body,
	}))
	.withBundle(createPhysics2DBundle({ gravity: { x: 0, y: 0 } }))
	.withBundle(createInputBundle({
		actions: {
			moveUp: { keys: ['w', 'ArrowUp'] },
			moveDown: { keys: ['s', 'ArrowDown'] },
			moveLeft: { keys: ['a', 'ArrowLeft'] },
			moveRight: { keys: ['d', 'ArrowRight'] },
		},
	}))
	.withBundle(stateMachineBundle)
	.withComponentTypes<AppComponents>()
	.build();

// ==================== Systems ====================

// Player movement
ecs
	.addSystem('player-input')
	.inPhase('preUpdate')
	.addQuery('players', {
		with: ['player', 'velocity', 'speed'],
	})
	.setProcess((queries, _dt, ecs) => {
		const input = ecs.getResource('inputState');

		for (const entity of queries.players) {
			const { speed } = entity.components;
			const vx = (input.actions.isActive('moveRight') ? 1 : 0) - (input.actions.isActive('moveLeft') ? 1 : 0);
			const vy = (input.actions.isActive('moveDown') ? 1 : 0) - (input.actions.isActive('moveUp') ? 1 : 0);

			// Normalize diagonal movement
			const len = Math.sqrt(vx * vx + vy * vy);
			const scale = len > 0 ? speed / len : 0;

			setVelocity(ecs, entity.id, vx * scale, vy * scale);
		}
	})
	.build();

// State label display (updates a text label above each enemy)
ecs
	.addSystem('state-label')
	.inPhase('render')
	.addQuery('enemies', {
		with: ['enemy', 'stateMachine', 'worldTransform', 'graphics'],
	})
	.setProcess((queries) => {
		for (const entity of queries.enemies) {
			const state = getStateMachineState(ecs, entity.id);
			const gfx = entity.components.graphics;

			// Pulse scale in attack state for visual feedback
			if (state === 'attack') {
				const t = entity.components.stateMachine.stateTime;
				const pulse = 1 + 0.3 * Math.sin(t * 20);
				gfx.scale.set(pulse, pulse);
			} else {
				gfx.scale.set(1, 1);
			}
		}
	})
	.build();

// ==================== Initialize & Spawn ====================

await ecs.initialize();

const pixiApp = ecs.getResource('pixiApp');
const bounds = ecs.getResource('bounds');

// Spawn player
const playerGfx = new Graphics().circle(0, 0, 20).fill(0x00ff00);
ecs.spawn({
	...createSpriteComponents(
		new Sprite(pixiApp.renderer.generateTexture(playerGfx)),
		{ x: bounds.width / 2, y: bounds.height / 2 },
		{ anchor: { x: 0.5, y: 0.5 } },
	),
	...createRigidBody('kinematic'),
	player: true,
	speed: 250,
	velocity: { x: 0, y: 0 },
});

// Spawn enemies
const enemyPositions = [
	{ x: 100, y: 100 },
	{ x: bounds.width - 100, y: 100 },
	{ x: 100, y: bounds.height - 100 },
	{ x: bounds.width - 100, y: bounds.height - 100 },
	{ x: bounds.width / 2, y: 80 },
];

for (const pos of enemyPositions) {
	const gfx = new Graphics().circle(0, 0, 15).fill(STATE_COLORS.patrol);
	const dir: 1 | -1 = pos.x < bounds.width / 2 ? 1 : -1;

	ecs.spawn({
		...createSpriteComponents(
			new Sprite(pixiApp.renderer.generateTexture(gfx)),
			pos,
			{ anchor: { x: 0.5, y: 0.5 } },
		),
		...createRigidBody('kinematic'),
		...createStateMachine(enemyFSM),
		enemy: true,
		patrolDirection: dir,
		speed: PATROL_SPEED,
		velocity: { x: dir * PATROL_SPEED, y: 0 },
		graphics: gfx,
	});
}
