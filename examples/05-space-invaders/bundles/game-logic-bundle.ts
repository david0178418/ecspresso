import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';
import { spawnEnemyFormation } from '../utils';

/**
 * Creates a bundle for handling game logic in the Space Invaders game
 */
export default function createGameLogicBundle() {
	return new Bundle<Components, Events, Resources>('game-logic-bundle')
		// Add resource for game state
		.addResource('gameState', {
			status: 'ready',
			level: 1,
			lives: 3
		})
		// Add resource for game configuration
		.addResource('config', {
			playerSpeed: 200,
			enemySpeed: 50,
			projectileSpeed: 400,
			enemiesPerRow: 8,
			enemyRows: 4,
			shootCooldown: 0.5
		})
		// Add resource for score
		.addResource('score', {
			value: 0
		})
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

					// Spawn enemies
					spawnEnemyFormation(ecs);
				}
			},

			// Pause game
			gamePause: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.status = 'paused';
				}
			},

			// Resume game
			gameResume: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.status = 'playing';
				}
			},

			// Handle game over
			gameOver: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.status = 'gameOver';
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
						const enemies = ecs.getEntitiesWithComponents(['enemy']);
						if (enemies.length === 0) {
							const gameState = ecs.getResource('gameState');

							// Complete level
							ecs.eventBus.publish('levelComplete', { level: gameState.level });
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

					// Spawn new enemy formation with increased difficulty
					setTimeout(() => {
						if (gameState.status === 'playing') {
							spawnEnemyFormation(ecs);
						}
					}, 1500);
				}
			}
		})
		.bundle
		// Enemy controller system
		.addSystem('enemy-controller')
		.addQuery('enemies', {
			with: ['enemy', 'position']
		})
		.setOnAttach((ecs) => {
			// Add a resource to track movement state
			ecs.addResource('enemyMovementState', {
				isMovingDown: false,
				lastDirectionChange: 0,
				currentDirection: 'right' as 'left' | 'right'
			});
		})
		.setProcess(({ enemies }, deltaTime, ecs) => {
			if (enemies.length === 0) return;

			const gameState = ecs.getResource('gameState');
			const movementState = ecs.getResource('enemyMovementState');

			// Skip if game is not playing
			if (gameState.status !== 'playing') return;

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

			// Determine if direction change is needed
			const padding = 30;
			const needsDirectionChange = minX < padding || maxX > screenWidth - padding;

			// Check if enemies reached the bottom of the screen
			if (maxY > pixi.screen.height - 100) {
				// Game over - enemies reached the bottom
				ecs.eventBus.publish('gameOver', { win: false, score: ecs.getResource('score').value });
				return;
			}

			const currentTime = Date.now();

			// Update enemy movement direction
			if (needsDirectionChange && !movementState.isMovingDown) {
				// Start moving down
				movementState.isMovingDown = true;
				movementState.lastDirectionChange = currentTime;
				ecs.eventBus.publish('enemyMove', { direction: 'down' });
			} else if (movementState.isMovingDown && currentTime - movementState.lastDirectionChange > 500) {
				// After moving down for 500ms, change horizontal direction
				movementState.isMovingDown = false;
				movementState.lastDirectionChange = currentTime;
				movementState.currentDirection = minX < padding ? 'right' : 'left';
				ecs.eventBus.publish('enemyMove', { direction: movementState.currentDirection });
			}

			// Random enemy shooting
			if (Math.random() < 0.02 * deltaTime * gameState.level) {
				// Pick a random enemy to shoot
				const randomIndex = Math.floor(Math.random() * enemies.length);
				const randomEnemy = enemies[randomIndex];

				if(!randomEnemy) return;

				ecs.eventBus.publish('enemyShoot', { enemyId: randomEnemy.id });
			}
		})
		.bundle
		// Enemy movement system
		.addSystem('enemy-movement')
		.addQuery('enemies', {
			with: ['enemy', 'position', 'velocity']
		})
		.setEventHandlers({
			enemyMove: {
				handler(data, ecs) {
					const config = ecs.getResource('config');
					const gameState = ecs.getResource('gameState');
					const enemies = ecs.getEntitiesWithComponents(['enemy', 'velocity']);

					// Calculate speed based on level and remaining enemies
					const speedMultiplier = 1.0 + (gameState.level - 1) * 0.2;
					const baseSpeed = config.enemySpeed * speedMultiplier;

					// Update enemy velocities based on direction
					for (const enemy of enemies) {
						const velocity = enemy.components['velocity'];
						if (!velocity) continue;

						switch (data.direction) {
							case 'left':
								velocity.x = -baseSpeed;
								velocity.y = 0;
								break;
							case 'right':
								velocity.x = baseSpeed;
								velocity.y = 0;
								break;
							case 'down':
								velocity.x = 0;
								velocity.y = baseSpeed * 2;
								break;
						}
					}
				}
			}
		})
		.bundle
		// Player movement system
		.addSystem('player-movement')
		.addQuery('players', {
			with: ['player', 'position', 'velocity', 'collider']
		})
		.setProcess(({ players }, _deltaTime, ecs) => {
			const gameState = ecs.getResource('gameState');
			const input = ecs.getResource('input');
			const config = ecs.getResource('config');
			const pixi = ecs.getResource('pixi');

			// Skip if game is not playing
			if (gameState.status !== 'playing') return;

			// Update player velocity based on input
			for (const player of players) {
				const velocity = player.components.velocity;
				const position = player.components.position;
				const collider = player.components.collider;

				// Update velocity based on input
				if (input.left) {
					velocity.x = -config.playerSpeed;
				} else if (input.right) {
					velocity.x = config.playerSpeed;
				} else {
					velocity.x = 0;
				}

				// Keep player within screen bounds
				const halfWidth = collider.width / 2;
				position.x = Math.max(halfWidth, Math.min(pixi.screen.width - halfWidth, position.x));
			}
		})
		.bundle;
}
