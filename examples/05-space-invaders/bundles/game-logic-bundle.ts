import Bundle from '../../../src/bundle';
import { createTimer } from '../../../src/bundles/timers';
import type { Components, Events, Resources } from '../types';
import { spawnEnemyFormation } from '../utils';

const DIRECTION_VELOCITIES: Record<string, { x: number; y: number }> = {
	'left': { x: -1, y: 0 },
	'right': { x: 1, y: 0 },
	'down': { x: 0, y: 2 },
};

export default function createGameLogicBundle() {
	return new Bundle<Components, Events, Resources>('game-logic-bundle')
		.addSystem('game-state')
		.setEventHandlers({
			gameInit: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					const score = ecs.getResource('score');

					gameState.status = 'ready';
					gameState.level = 1;
					gameState.lives = 3;
					score.value = 0;

					ecs.eventBus.publish('updateScore', { points: 0 });
					ecs.eventBus.publish('updateLives', { lives: gameState.lives });
				}
			},

			gameStart: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.status = 'playing';
					ecs.enableSystemGroup('gameplay');

					const movementState = ecs.getResource('enemyMovementState');
					movementState.isMovingDown = false;
					movementState.currentDirection = 'right';
					movementState.lastEdgeHit = null;

					spawnEnemyFormation(ecs);
					ecs.eventBus.publish('enemyMove', { direction: 'right' });
				}
			},

			gamePause: {
				handler(_data, ecs) {
					ecs.getResource('gameState').status = 'paused';
					ecs.disableSystemGroup('gameplay');
				}
			},

			gameResume: {
				handler(_data, ecs) {
					ecs.getResource('gameState').status = 'playing';
					ecs.enableSystemGroup('gameplay');
				}
			},

			gameOver: {
				handler(_data, ecs) {
					ecs.getResource('gameState').status = 'gameOver';
					ecs.disableSystemGroup('gameplay');
				}
			},

			levelComplete: {
				handler(_data, ecs) {
					ecs.getResource('gameState').level += 1;
					ecs.spawn(createTimer<Events>(1.5, { onComplete: 'levelTransitionComplete' }));
				}
			},

			levelTransitionComplete: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					if (gameState.status !== 'playing') return;

					const movementState = ecs.getResource('enemyMovementState');
					movementState.isMovingDown = false;
					movementState.currentDirection = 'right';
					movementState.lastEdgeHit = null;

					spawnEnemyFormation(ecs);
					ecs.eventBus.publish('enemyMove', { direction: 'right' });
				}
			},

			descentComplete: {
				handler(_data, ecs) {
					const movementState = ecs.getResource('enemyMovementState');
					const enemies = ecs.getEntitiesWithQuery(['enemy', 'worldTransform']);

					let minX = Number.MAX_VALUE;
					for (const enemy of enemies) {
						const worldTransform = enemy.components['worldTransform'];
						if (worldTransform) minX = Math.min(minX, worldTransform.x);
					}

					movementState.isMovingDown = false;
					movementState.currentDirection = minX < 30 ? 'right' : 'left';
					ecs.eventBus.publish('enemyMove', { direction: movementState.currentDirection });
				}
			},

			enemyMove: {
				handler(data, ecs) {
					const config = ecs.getResource('config');
					const gameState = ecs.getResource('gameState');
					const enemies = ecs.getEntitiesWithQuery(['enemy', 'velocity']);

					const speedMultiplier = 1.0 + (gameState.level - 1) * 0.2;
					const baseSpeed = config.enemySpeed * speedMultiplier;
					const velocityMultiplier = DIRECTION_VELOCITIES[data.direction];
					if (!velocityMultiplier) return;

					for (const enemy of enemies) {
						const enemyVel = enemy.components['velocity'];
						if (!enemyVel) continue;
						enemyVel.x = velocityMultiplier.x * baseSpeed;
						enemyVel.y = velocityMultiplier.y * baseSpeed;
					}
				}
			}
		})
		.and()

		.addSystem('enemy-controller')
		.inGroup('gameplay')
		.addQuery('enemies', { with: ['enemy', 'worldTransform'] })
		.setProcess(({ enemies }, deltaTime, ecs) => {
			if (enemies.length === 0) return;

			const gameState = ecs.getResource('gameState');
			const movementState = ecs.getResource('enemyMovementState');
			const bounds = ecs.getResource('bounds');

			let minX = Number.MAX_VALUE;
			let maxX = Number.MIN_VALUE;
			let maxY = Number.MIN_VALUE;

			for (const enemy of enemies) {
				const worldTransform = enemy.components['worldTransform'];
				if (!worldTransform) continue;
				minX = Math.min(minX, worldTransform.x);
				maxX = Math.max(maxX, worldTransform.x);
				maxY = Math.max(maxY, worldTransform.y);
			}

			// Game over if enemies reach bottom
			if (maxY > bounds.height - 100) {
				ecs.eventBus.publish('gameOver', { win: false, score: ecs.getResource('score').value });
				return;
			}

			// Check for edge hit and trigger descent
			const padding = 30;
			const currentEdge = minX < padding ? 'left' : maxX > bounds.width - padding ? 'right' : null;
			const shouldDescend = currentEdge !== null &&
				currentEdge !== movementState.lastEdgeHit &&
				!movementState.isMovingDown;

			if (shouldDescend) {
				movementState.lastEdgeHit = currentEdge;
				movementState.isMovingDown = true;
				ecs.eventBus.publish('enemyMove', { direction: 'down' });
				ecs.spawn(createTimer<Events>(0.5, { onComplete: 'descentComplete' }));
			}

			// Random enemy shooting
			if (Math.random() < 0.02 * deltaTime * gameState.level) {
				const randomIndex = Math.floor(Math.random() * enemies.length);
				const randomEnemy = enemies[randomIndex];
				if (randomEnemy) {
					ecs.eventBus.publish('enemyShoot', { enemyId: randomEnemy.id });
				}
			}
		})
		.and()

		.addSystem('player-input')
		.inGroup('gameplay')
		.inPhase('preUpdate')
		.addQuery('players', { with: ['player', 'velocity'] })
		.setProcess(({ players }, _deltaTime, ecs) => {
			const input = ecs.getResource('inputState');
			const config = ecs.getResource('config');

			for (const player of players) {
				player.components.velocity.x = input.actions.isActive('moveLeft') ? -config.playerSpeed
					: input.actions.isActive('moveRight') ? config.playerSpeed
					: 0;
			}
		})
		.bundle;
}
