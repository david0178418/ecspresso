import { Graphics, Sprite } from "pixi.js";
import ECSpresso from "../../src";
import { Components, Events, Resources } from "./types";

/**
 * Simple AABB collision detection
 */
export function isColliding(
	x1: number,
	y1: number,
	width1: number,
	height1: number,
	x2: number,
	y2: number,
	width2: number,
	height2: number,
): boolean {
	// Calculate half-widths and half-heights
	const halfWidth1 = width1 / 2;
	const halfHeight1 = height1 / 2;
	const halfWidth2 = width2 / 2;
	const halfHeight2 = height2 / 2;

	// Calculate the distance between centers
	const dx = Math.abs(x1 - x2);
	const dy = Math.abs(y1 - y2);

	// Check if the rectangles overlap
	return dx < (halfWidth1 + halfWidth2) && dy < (halfHeight1 + halfHeight2);
}


/**
 * Spawns an enemy formation based on the current level
 */
export function spawnEnemyFormation(ecs: ECSpresso<Components, Events, Resources>): void {
	const config = ecs.getResource('config');
	const gameState = ecs.getResource('gameState');
	const entityContainer = ecs.getResource('entityContainer');
	const pixi = ecs.getResource('pixi');

	// Calculate formation parameters
	const enemiesPerRow = config.enemiesPerRow;
	const rows = config.enemyRows;
	const spacing = 60;
	const startX = (pixi.screen.width - (enemiesPerRow - 1) * spacing) / 2;
	const startY = 80;

	// Create enemies
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < enemiesPerRow; col++) {
			// Determine enemy type based on row
			let enemyType: 'grunt' | 'elite' | 'boss';
			let points: number;
			let health: number;
			let color: number;

			if (row === 0) {
				enemyType = 'boss';
				points = 100 * gameState.level;
				health = 3;
				color = 0xFF0000; // Red
			} else if (row < 2) {
				enemyType = 'elite';
				points = 50 * gameState.level;
				health = 2;
				color = 0xFF00FF; // Magenta
			} else {
				enemyType = 'grunt';
				points = 20 * gameState.level;
				health = 1;
				color = 0xFFAA00; // Orange
			}

			// Create enemy sprite
			const enemySprite = createEnemySprite(ecs, enemyType, color);
			entityContainer.addChild(enemySprite);

			// Position enemy in formation
			const x = startX + col * spacing;
			const y = startY + row * spacing;

			// Create enemy entity
			ecs.spawn({
				enemy: {
					type: enemyType,
					points,
					health
				},
				sprite: enemySprite,
				position: { x, y },
				velocity: { x: config.enemySpeed, y: 0 },
				collider: {
					width: enemySprite.width,
					height: enemySprite.height
				}
			});
		}
	}

	// Start enemies moving to the right
	ecs.eventBus.publish('enemyMove', { direction: 'right' });
}

export function createEnemySprite(ecs: any, type: 'grunt' | 'elite' | 'boss', color: number): Sprite {
	const pixi = ecs.getResource('pixi');

	// Create enemy shape based on type
	const graphics = new Graphics();

	switch (type) {
		case 'boss':
			// Boss is larger with a more complex shape
			graphics
				.rect(-20, -20, 40, 40)
				.rect(-25, -10, 50, 20)
				.fill(color)
				// detail
				.circle(-10, -5, 5)
				.circle(10, -5, 5)
				.fill(0xFFFFFF);

			break;

		case 'elite':
			// Elite is medium-sized
			graphics
				.rect(-15, -15, 30, 30)
				.fill(color)
				// Add detail
				.circle(-5, -5, 3)
				.circle(5, -5, 3)
				.fill(0xFFFFFF);

			break;

		case 'grunt':
		default:
			// Grunt is small and simple
			graphics
				.rect(-10, -10, 20, 20)
				.fill(color);

			break;
	}

	graphics.fill(color);

	// Generate a texture and create a sprite
	const texture = pixi.renderer.generateTexture(graphics);
	const sprite = new Sprite(texture);

	sprite.anchor.set(0.5, 0.5);

	return sprite;
}

export function createPlayerSprite(ecs: ECSpresso<Components, Events, Resources>): Sprite {
	const pixi = ecs.getResource('pixi');

	const graphics = new Graphics()
		.rect(-20, -10, 40, 20)
		// Draw a triangle for the ship's nose
		.moveTo(-10, -10)
		.lineTo(10, -10)
		.lineTo(0, -25)
		.lineTo(-10, -10)
		.fill(0x00FF00);

	const texture = pixi.renderer.generateTexture(graphics);
	const sprite = new Sprite(texture);
	sprite.anchor.set(0.5, 0.5);

	return sprite;
}

/**
 * Creates a projectile sprite
 */
export function createProjectileSprite(ecs: ECSpresso<Components, Events, Resources>, owner: 'player' | 'enemy'): Sprite {
	const pixi = ecs.getResource('pixi');

	const graphics = new Graphics()
		.rect(-2, -8, 4, 16)
		.fill(owner === 'player' ? 0x00FFFF : 0xFF0000);

	const texture = pixi.renderer.generateTexture(graphics);

	const sprite = new Sprite(texture);
	sprite.anchor.set(0.5, 0.5);

	return sprite;
}
