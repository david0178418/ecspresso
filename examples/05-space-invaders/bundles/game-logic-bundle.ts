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
						// The render bundle removes entities before this handler runs (due to bundle order)
						const enemies = ecs.getEntitiesWithQuery(['enemy']);
						if (enemies.length === 0) {
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

					// Increase level
					gameState.level += 1;

					// Spawn timer entity for level transition delay
					ecs.spawn({
						...createTimer(1.5),
						levelTransitionTimer: true as const,
					});
				}
			}
		})
		.bundle
		// Level transition timer system
		.addSystem('level-transition-timer')
		.inGroup('gameplay')
		.addQuery('transitionTimers', {
			with: ['timer', 'levelTransitionTimer'] as const,
		})
		.setProcess(({ transitionTimers }, _deltaTime, ecs) => {
			const gameState = ecs.getResource('gameState');

			for (const entity of transitionTimers) {
				if (entity.components.timer.justFinished) {
					// Remove the timer entity
					ecs.removeEntity(entity.id);

					// Spawn new enemy formation if game is still playing
					if (gameState.status === 'playing') {
						// Reset movement state for new level
						const movementState = ecs.getResource('enemyMovementState');
						movementState.isMovingDown = false;
						movementState.currentDirection = 'right';
						movementState.lastEdgeHit = null;

						// Spawn enemies and start them moving right
						spawnEnemyFormation(ecs);
						ecs.eventBus.publish('enemyMove', { direction: 'right' });
					}
				}
			}
		})
		.bundle
		// Descent timer system - handles horizontal direction change after descent
		.addSystem('descent-timer')
		.inGroup('gameplay')
		.addQuery('descentTimers', {
			with: ['timer', 'descentTimer'] as const,
		})
		.setProcess(({ descentTimers }, _deltaTime, ecs) => {
			for (const entity of descentTimers) {
				if (entity.components.timer.justFinished) {
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

					// Remove the timer entity
					ecs.removeEntity(entity.id);

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
		.setOnInitialize((ecs) => {
			// Add a resource to track movement state
			ecs.addResource('enemyMovementState', {
				isMovingDown: false,
				currentDirection: 'right' as 'left' | 'right',
				lastEdgeHit: null as 'left' | 'right' | null
			});
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
				// Check if a descent timer already exists
				const existingTimers = ecs.getEntitiesWithQuery(['descentTimer']);
				if (existingTimers.length === 0) {
					// Track which edge triggered this descent
					movementState.lastEdgeHit = currentEdge;
					// Start moving down
					movementState.isMovingDown = true;
					ecs.eventBus.publish('enemyMove', { direction: 'down' });

					// Spawn descent timer (500ms)
					ecs.spawn({
						...createTimer(0.5),
						descentTimer: true as const,
					});
				}
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
		// Player movement system - in gameplay group
		.addSystem('player-movement')
		.inGroup('gameplay')
		.addQuery('players', {
			with: ['player', 'position', 'velocity', 'collider']
		})
		.setProcess(({ players }, _deltaTime, ecs) => {
			const input = ecs.getResource('input');
			const config = ecs.getResource('config');
			const pixi = ecs.getResource('pixi');

			// Update player velocity based on input
			for (const player of players) {
				const velocity = player.components.velocity;
				const position = player.components.position;
				const collider = player.components.collider;

				// Update velocity based on input
				velocity.x = input.left ? -config.playerSpeed : input.right ? config.playerSpeed : 0;

				// Keep player within screen bounds
				const halfWidth = collider.width / 2;
				position.x = Math.max(halfWidth, Math.min(pixi.screen.width - halfWidth, position.x));
			}
		})
		.bundle;
}
