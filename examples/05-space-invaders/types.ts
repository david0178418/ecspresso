import { Container, Text } from 'pixi.js';
import type { TimerComponentTypes, TimerEventData } from '../../src/bundles/utils/timers';
import type { TransformComponentTypes } from '../../src/bundles/utils/transform';
import type { MovementComponentTypes } from '../../src/bundles/utils/movement';
import type { BoundsComponentTypes } from '../../src/bundles/utils/bounds';
import type { CollisionComponentTypes, CollisionEventTypes } from '../../src/bundles/utils/collision';
import type { Renderer2DComponentTypes, Renderer2DResourceTypes } from '../../src/bundles/renderers/renderer2D';

/**
 * All event types used in the Space Invaders game
 */
export interface Events extends CollisionEventTypes {
	// Game state
	gameInit: true;
	gameStart: true;
	gamePause: true;
	gameResume: true;
	gameOver: { win: boolean; score: number };
	levelComplete: { level: number };

	// Input
	inputUpdate: { key: string; pressed: boolean };

	// Gameplay
	playerShoot: {};
	playerDeath: {};
	enemyShoot: { enemyId: number };
	enemyMove: { direction: 'left' | 'right' | 'down' };

	// Timer completions
	playerRespawn: TimerEventData;
	messageHide: TimerEventData;
	levelTransitionComplete: TimerEventData;
	descentComplete: TimerEventData;

	// UI
	updateScore: { points: number };
	updateLives: { lives: number };
}

/**
 * All component types used in the Space Invaders game
 */
export interface Components
	extends TimerComponentTypes<Events>,
	        TransformComponentTypes,
	        MovementComponentTypes,
	        BoundsComponentTypes,
	        CollisionComponentTypes,
	        Renderer2DComponentTypes {
	player: boolean;
	enemy: { type: 'grunt' | 'elite' | 'boss'; points: number; health: number };
	projectile: { owner: 'player' | 'enemy'; damage: number };
}

/**
 * All resource types used in the Space Invaders game
 */
export interface Resources extends Renderer2DResourceTypes {
	uiContainer: Container;

	gameState: {
		status: 'ready' | 'playing' | 'paused' | 'gameOver';
		level: number;
		lives: number;
	};

	input: {
		left: boolean;
		right: boolean;
		shoot: boolean;
		pause: boolean;
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
