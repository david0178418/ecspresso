import { Graphics, Sprite } from "pixi.js";
import ECSpresso from "../../src";
import { createTransform } from "../../src/bundles/utils/transform";
import { createVelocity } from "../../src/bundles/utils/movement";
import { createAABBCollider } from "../../src/bundles/utils/collision";
import { createClampToBounds } from "../../src/bundles/utils/bounds";
import { layers } from "./layers";
import { Components, Events, Resources } from "./types";

/**
 * Spawns an enemy formation based on the current level
 */
export function spawnEnemyFormation(ecs: ECSpresso<Components, Events, Resources>): void {
	const config = ecs.getResource('config');
	const gameState = ecs.getResource('gameState');
	const entityContainer = ecs.getResource('entityContainer');
	const pixi = ecs.getResource('pixi');

	const enemiesPerRow = config.enemiesPerRow;
	const rows = config.enemyRows;
	const spacing = 60;
	const startX = (pixi.screen.width - (enemiesPerRow - 1) * spacing) / 2;
	const startY = 80;

	const enemyConfigs: Record<'boss' | 'elite' | 'grunt', { points: number; health: number; color: number }> = {
		boss: { points: 100 * gameState.level, health: 3, color: 0xFF0000 },
		elite: { points: 50 * gameState.level, health: 2, color: 0xFF00FF },
		grunt: { points: 20 * gameState.level, health: 1, color: 0xFFAA00 },
	};

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < enemiesPerRow; col++) {
			const enemyType: 'boss' | 'elite' | 'grunt' =
				row === 0 ? 'boss' : row < 2 ? 'elite' : 'grunt';
			const { points, health, color } = enemyConfigs[enemyType];

			const enemySprite = createEnemySprite(ecs, enemyType, color);
			entityContainer.addChild(enemySprite);

			ecs.spawn({
				enemy: { type: enemyType, points, health },
				sprite: enemySprite,
				...createTransform(startX + col * spacing, startY + row * spacing),
				...createVelocity(config.enemySpeed, 0),
				...createAABBCollider(enemySprite.width, enemySprite.height),
				...layers.enemy(),
			});
		}
	}
}

type EnemyType = 'grunt' | 'elite' | 'boss';

const enemyDrawers: Record<EnemyType, (graphics: Graphics, color: number) => void> = {
	boss: (graphics, color) => {
		graphics
			.rect(-20, -20, 40, 40)
			.rect(-25, -10, 50, 20)
			.fill(color)
			.circle(-10, -5, 5)
			.circle(10, -5, 5)
			.fill(0xFFFFFF);
	},
	elite: (graphics, color) => {
		graphics
			.rect(-15, -15, 30, 30)
			.fill(color)
			.circle(-5, -5, 3)
			.circle(5, -5, 3)
			.fill(0xFFFFFF);
	},
	grunt: (graphics, color) => {
		graphics.rect(-10, -10, 20, 20).fill(color);
	},
};

export function createEnemySprite(ecs: ECSpresso<Components, Events, Resources>, type: EnemyType, color: number): Sprite {
	const pixi = ecs.getResource('pixi');
	const graphics = new Graphics();
	enemyDrawers[type](graphics, color);

	const texture = pixi.renderer.generateTexture(graphics);
	const sprite = new Sprite(texture);
	sprite.anchor.set(0.5, 0.5);
	return sprite;
}

export function createPlayerSprite(ecs: ECSpresso<Components, Events, Resources>): Sprite {
	const pixi = ecs.getResource('pixi');
	const graphics = new Graphics()
		.rect(-20, -10, 40, 20)
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

export function spawnPlayer(ecs: ECSpresso<Components, Events, Resources>): number {
	const entityContainer = ecs.getResource('entityContainer');
	const pixi = ecs.getResource('pixi');
	const playerSprite = createPlayerSprite(ecs);
	entityContainer.addChild(playerSprite);

	const player = ecs.spawn({
		sprite: playerSprite,
		player: true,
		...createTransform(pixi.screen.width / 2, pixi.screen.height - 80),
		...createVelocity(0, 0),
		...createAABBCollider(playerSprite.width, playerSprite.height),
		...layers.player(),
		...createClampToBounds(30),
	});

	return player.id;
}
