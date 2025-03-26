import { Container, Sprite, Text } from 'pixi.js';
import type { Application } from 'pixi.js';

/**
 * All component types used in the Space Invaders game
 */
export interface Components {
	// Position and movement
	position: {
		x: number;
		y: number;
	};
	velocity: {
		x: number;
		y: number;
	};

	// Rendering
	sprite: Sprite;

	// Game object types
	player: boolean;
	enemy: {
		type: 'grunt' | 'elite' | 'boss';
		points: number;
		health: number;
	};
	projectile: {
		owner: 'player' | 'enemy';
		damage: number;
	};
	shield: {
		health: number;
		maxHealth: number;
	};

	// Additional components
	collider: {
		width: number;
		height: number;
	};
	lifetime: {
		remaining: number;
	};
	powerup: {
		type: 'rapidFire' | 'shield' | 'extraLife';
		duration?: number;
	};
}

/**
 * All event types used in the Space Invaders game
 */
export interface Events {
	// Game state events
	gameInit: true;
	gameStart: true;
	gamePause: true;
	gameResume: true;
	gameOver: {
		win: boolean;
		score: number;
	};
	levelComplete: {
		level: number;
	};

	// Input events
	inputUpdate: {
		key: string;
		pressed: boolean;
	};

	// Gameplay events
	playerShoot: {};
	playerDeath: {};
	enemyShoot: {
		enemyId: number;
	};
	enemyMove: {
		direction: 'left' | 'right' | 'down';
	};
	entityDestroyed: {
		entityId: number;
		wasEnemy?: boolean;
		points?: number;
	};
	playerRespawn: {};

	// UI events
	updateScore: {
		points: number;
	};
	updateLives: {
		lives: number;
	};
}

/**
 * All resource types used in the Space Invaders game
 */
export interface Resources {
	// PIXI resources
	pixi: Application;
	gameContainer: Container;
	entityContainer: Container;
	uiContainer: Container;

	// Game state
	gameState: {
		status: 'ready' | 'playing' | 'paused' | 'gameOver';
		level: number;
		lives: number;
	};

	// Player input
	input: {
		left: boolean;
		right: boolean;
		shoot: boolean;
		pause: boolean;
	};

	// Game configuration
	config: {
		playerSpeed: number;
		enemySpeed: number;
		projectileSpeed: number;
		enemiesPerRow: number;
		enemyRows: number;
		shootCooldown: number;
	};

	// Score
	score: {
		value: number;
	};

	// Enemy movement state
	enemyMovementState: {
		isMovingDown: boolean;
		lastDirectionChange: number;
		currentDirection: 'left' | 'right';
	};

	// UI elements
	uiElements: {
		scoreText: Text;
		livesText: Text;
		messageText: Text;
	};
}
