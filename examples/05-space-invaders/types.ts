import { Container, Text } from 'pixi.js';
import type { TimerComponentTypes } from '../../src/plugins/timers';
import type { TransformComponentTypes } from '../../src/plugins/transform';
import type { Physics2DComponentTypes } from '../../src/plugins/physics2D';
import type { BoundsComponentTypes } from '../../src/plugins/bounds';
import type { CollisionComponentTypes, CollisionEventTypes, LayersOf } from '../../src/plugins/collision';
import type collisionLayers from './collision-layers';
import type { Renderer2DComponentTypes, Renderer2DResourceTypes } from '../../src/plugins/renderers/renderer2D';
import type { InputResourceTypes } from '../../src/plugins/input';
import { createPluginFactory } from '../../src/plugin';

type Layer = LayersOf<typeof collisionLayers>;

/**
 * All event types used in the Space Invaders game
 */
export interface Events extends CollisionEventTypes<Layer> {
	// Game state
	gameInit: true;
	gameStart: true;
	gamePause: true;
	gameResume: true;
	gameOver: { win: boolean; score: number };
	levelComplete: { level: number };

	// Gameplay
	playerShoot: {};
	playerDeath: {};
	enemyShoot: { enemyId: number };
	enemyMove: { direction: 'left' | 'right' | 'down' };

	// Timer completions
	playerRespawn: void;
	messageHide: void;
	levelTransitionComplete: void;
	descentComplete: void;

	// UI
	updateScore: { points: number };
	updateLives: { lives: number };
}

/**
 * All component types used in the Space Invaders game
 */
export interface Components
	extends TimerComponentTypes,
	        TransformComponentTypes,
	        Physics2DComponentTypes<Layer>,
	        BoundsComponentTypes,
	        CollisionComponentTypes<Layer>,
	        Renderer2DComponentTypes {
	player: boolean;
	enemy: { type: 'grunt' | 'elite' | 'boss'; points: number; health: number };
	projectile: { owner: 'player' | 'enemy'; damage: number };
}

/**
 * All resource types used in the Space Invaders game
 */
export interface Resources extends Renderer2DResourceTypes, InputResourceTypes {
	uiContainer: Container;

	gameState: {
		status: 'ready' | 'playing' | 'paused' | 'gameOver';
		level: number;
		lives: number;
	};

	config: {
		playerSpeed: number;
		enemySpeed: number;
		projectileSpeed: number;
		enemiesPerRow: number;
		enemyRows: number;
		shootCooldown: number;
	};

	score: { value: number };

	enemyMovementState: {
		isMovingDown: boolean;
		currentDirection: 'left' | 'right';
		lastEdgeHit: 'left' | 'right' | null;
	};

	uiElements: {
		scoreText: Text;
		livesText: Text;
		messageText: Text;
	};
}

export const definePlugin = createPluginFactory<Components, Events, Resources>();
