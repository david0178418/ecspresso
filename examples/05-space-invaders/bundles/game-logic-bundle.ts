import Bundle from '../../../src/bundle';
import { createTimer } from '../../../src/bundles/utils/timers';
import type { Components, Events, Resources } from '../types';
import { spawnEnemyFormation } from '../utils';

/**
 * Creates a bundle for handling game logic in the Space Invaders game
 */
// Direction velocity multipliers (multiply by baseSpeed at runtime)
const DIRECTION_VELOCITIES: Record<string, { x: number; y: number }> = {
	'left': { x: -1, y: 0 },
	'right': { x: 1, y: 0 },
	'down': { x: 0, y: 2 },
};

export default function createGameLogicBundle() {
	return new Bundle<Components, Events, Resources>('game-logic-bundle')
		// Game state system
		.addSystem('game-state')
		.setEventHandlers({
			// Initialize the game
			gameInit: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					const score = ecs.getResource('score');

					// Reset game state
					gameState.status = 'ready';
					gameState.level = 1;
					gameState.lives = 3;
					score.value = 0;

					// Update UI
					ecs.eventBus.publish('updateScore', { points: 0 });
					ecs.eventBus.publish('updateLives', { lives: gameState.lives });
				}
			},

			// Start the game
			gameStart: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');

					// Update game state
					gameState.status = 'playing';
					ecs.enableSystemGroup('gameplay');

					// Reset movement state for new game
					const movementState = ecs.getResource('enemyMovementState');
					movementState.isMovingDown = false;
					movementState.currentDirection = 'right';
					movementState.lastEdgeHit = null;

					// Spawn enemies and start them moving right
					spawnEnemyFormation(ecs);
					ecs.eventBus.publish('enemyMove', { direction: 'right' });
				}
			},

			// Pause game
			gamePause: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.status = 'paused';
					ecs.disableSystemGroup('gameplay');
				}
			},

			// Resume game
			gameResume: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.status = 'playing';
					ecs.enableSystemGroup('gameplay');
				}
			},

			// Handle game over
			gameOver: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.status = 'gameOver';
					ecs.disableSystemGroup('gameplay');
				}
			},

			// Handle entity destroyed event
			entityDestroyed: {
				handler(data, ecs) {
					// Check if an enemy was destroyed
					if (data.wasEnemy && data.points) {
						const score = ecs.getResource('score');

						// Update score
						score.value += data.points;
						ecs.eventBus.publish('updateScore', { points: score.value });

						// Check if all enemies are destroyed
						// With command buffer, entity removal is deferred, so check if this is the last enemy
						const enemies = ecs.getEntitiesWithQuery(['enemy']);
						if (enemies.length === 1) {
							const gameState = ecs.getResource('gameState');
							if (gameState.status === 'playing') {
								ecs.eventBus.publish('levelComplete', { level: gameState.level });
							}
						}
					}
				}
			},

			// Handle level complete
			levelComplete: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.level += 1;

					// Spawn timer for level transition delay
					ecs.spawn(createTimer<Events>(1.5, { onComplete: 'levelTransitionComplete' }));
				}
			},

			// Handle level transition timer completion
			levelTransitionComplete: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					if (gameState.status !== 'playing') return;

					// Reset movement state for new level
					const movementState = ecs.getResource('enemyMovementState');
					movementState.isMovingDown = false;
					movementState.currentDirection = 'right';
					movementState.lastEdgeHit = null;

					// Spawn enemies and start them moving right
					spawnEnemyFormation(ecs);
					ecs.eventBus.publish('enemyMove', { direction: 'right' });
				}
			},

			// Handle descent timer completion
			descentComplete: {
				handler(_data, ecs) {
					const movementState = ecs.getResource('enemyMovementState');

					// Get current formation boundaries to determine new direction
					const enemies = ecs.getEntitiesWithQuery(['enemy', 'position']);
					let minX = Number.MAX_VALUE;

					for (const enemy of enemies) {
						const position = enemy.components['position'];
						if (position) {
							minX = Math.min(minX, position.x);
						}
					}

					// Change horizontal direction based on which edge was hit
					movementState.isMovingDown = false;
					movementState.currentDirection = minX < 30 ? 'right' : 'left';
					ecs.eventBus.publish('enemyMove', { direction: movementState.currentDirection });
				}
			}
		})
		.bundle
		// Enemy controller system - in gameplay group so it pauses
		.addSystem('enemy-controller')
		.inGroup('gameplay')
		.addQuery('enemies', {
			with: ['enemy', 'position']
		})
		.setProcess(({ enemies }, deltaTime, ecs) => {
			if (enemies.length === 0) return;

			const gameState = ecs.getResource('gameState');
			const movementState = ecs.getResource('enemyMovementState');

			// Track formation boundaries
			let minX = Number.MAX_VALUE;
			let maxX = Number.MIN_VALUE;
			let maxY = Number.MIN_VALUE;
			const pixi = ecs.getResource('pixi');
			const screenWidth = pixi.screen.width;

			// Find boundaries of enemy formation
			for (const enemy of enemies) {
				const position = enemy.components['position'];
				if (!position) continue;

				minX = Math.min(minX, position.x);
				maxX = Math.max(maxX, position.x);
				maxY = Math.max(maxY, position.y);
			}

			// Determine which edge was hit (if any)
			const padding = 30;
			const hitLeftEdge = minX < padding;
			const hitRightEdge = maxX > screenWidth - padding;
			const currentEdge = hitLeftEdge ? 'left' : hitRightEdge ? 'right' : null;

			// Check if enemies reached the bottom of the screen
			if (maxY > pixi.screen.height - 100) {
				// Game over - enemies reached the bottom
				ecs.eventBus.publish('gameOver', { win: false, score: ecs.getResource('score').value });
				return;
			}

			// Update enemy movement direction - only trigger descent if hitting a different edge
			const shouldDescend = currentEdge !== null &&
				currentEdge !== movementState.lastEdgeHit &&
				!movementState.isMovingDown;

			if (shouldDescend) {
				// Track which edge triggered this descent
				movementState.lastEdgeHit = currentEdge;
				// Start moving down
				movementState.isMovingDown = true;
				ecs.eventBus.publish('enemyMove', { direction: 'down' });

				// Spawn descent timer (500ms)
				ecs.spawn(createTimer<Events>(0.5, { onComplete: 'descentComplete' }));
			}

			// Random enemy shooting
			if (Math.random() < 0.02 * deltaTime * gameState.level) {
				// Pick a random enemy to shoot
				const randomIndex = Math.floor(Math.random() * enemies.length);
				const randomEnemy = enemies[randomIndex];

				if (!randomEnemy) return;

				ecs.eventBus.publish('enemyShoot', { enemyId: randomEnemy.id });
			}
		})
		.bundle
		// Enemy movement system - in gameplay group
		.addSystem('enemy-movement')
		.inGroup('gameplay')
		.addQuery('enemies', {
			with: ['enemy', 'position', 'velocity']
		})
		.setEventHandlers({
			enemyMove: {
				handler(data, ecs) {
					const config = ecs.getResource('config');
					const gameState = ecs.getResource('gameState');
					const enemies = ecs.getEntitiesWithQuery(['enemy', 'velocity']);

					// Calculate speed based on level and remaining enemies
					const speedMultiplier = 1.0 + (gameState.level - 1) * 0.2;
					const baseSpeed = config.enemySpeed * speedMultiplier;

					// Get velocity multiplier from constant
					const velocityMultiplier = DIRECTION_VELOCITIES[data.direction];
					if (!velocityMultiplier) return;

					// Update enemy velocities based on direction
					for (const enemy of enemies) {
						const enemyVel = enemy.components['velocity'];
						if (!enemyVel) continue;

						enemyVel.x = velocityMultiplier.x * baseSpeed;
						enemyVel.y = velocityMultiplier.y * baseSpeed;
					}
				}
			}
		})
		.bundle
		// Player input system - sets velocity based on input
		// Bounds clamping is handled by the bounds bundle via clampToBounds component
		.addSystem('player-input')
		.inGroup('gameplay')
		.addQuery('players', {
			with: ['player', 'velocity']
		})
		.setProcess(({ players }, _deltaTime, ecs) => {
			const input = ecs.getResource('input');
			const config = ecs.getResource('config');

			// Update player velocity based on input
			for (const player of players) {
				const velocity = player.components.velocity;
				velocity.x = input.left ? -config.playerSpeed : input.right ? config.playerSpeed : 0;
			}
		})
		.bundle;
}
