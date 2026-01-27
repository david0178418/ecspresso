import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';
import { updateUI } from '../utils';

export default function createGameStateBundle() {
	return new Bundle<Components, Events, Resources>('game-state-bundle')
		// Game state system
		.addSystem('game-state')
		.setEventHandlers({
			gameStart: {
				handler(_data, ecs) {
					// Update game state to playing
					const gameState = ecs.getResource('gameState');
					gameState.status = 'playing';

					// Enable gameplay systems
					ecs.enableSystemGroup('gameplay');

					// Get player's initial rotation
					const playerEntities = ecs.entityManager.getEntitiesWithQuery(['player', 'rotation']);
					if (playerEntities.length > 0) {
						const playerEntity = playerEntities[0];
						if (playerEntity) {
							ecs.addResource('playerInitialRotation', {
								y: playerEntity.components.rotation.y
							});
						}
					}

					// Initialize first wave
					const waveManager = ecs.getResource('waveManager');
					const config = ecs.getResource('config');
					waveManager.currentWave = 1;
					waveManager.enemiesRemaining = config.enemiesPerWave;
					waveManager.waveStartTime = performance.now() / 1000;

					// Show wave start message
					const uiElements = ecs.getResource('uiElements');
					if (uiElements.messageElement) {
						uiElements.messageElement.innerText = `WAVE ${waveManager.currentWave}`;
						uiElements.messageElement.style.opacity = '1';
						uiElements.messageElement.style.top = '25%';
						setTimeout(() => {
							if (uiElements.messageElement) {
								uiElements.messageElement.style.opacity = '0';
							}
						}, 2000);
					}

					// Update UI
					ecs.eventBus.publish('updateWave', { wave: waveManager.currentWave });
				}
			},
			gamePause: {
				handler(_data, ecs) {
					// Pause the game
					const gameState = ecs.getResource('gameState');
					gameState.status = 'paused';

					// Disable gameplay systems
					ecs.disableSystemGroup('gameplay');

					// Explicitly pause radar sweep
					const radarSweep = document.getElementById('radar-sweep') as HTMLDivElement;
					if (radarSweep) {
						radarSweep.style.animationPlayState = 'paused';
					}

					// Show pause message
					const uiElements = ecs.getResource('uiElements');
					if (uiElements.messageElement) {
						uiElements.messageElement.innerText = 'PAUSED';
						uiElements.messageElement.style.opacity = '1';
						// Position the message higher on the screen (between middle and top)
						uiElements.messageElement.style.top = '25%';
					}
				}
			},
			gameResume: {
				handler(_data, ecs) {
					// Resume the game
					const gameState = ecs.getResource('gameState');
					gameState.status = 'playing';

					// Enable gameplay systems
					ecs.enableSystemGroup('gameplay');

					// Explicitly resume radar sweep
					const radarSweep = document.getElementById('radar-sweep') as HTMLDivElement;
					if (radarSweep) {
						radarSweep.style.animationPlayState = 'running';
					}

					// Hide pause message
					const uiElements = ecs.getResource('uiElements');
					if (uiElements.messageElement) {
						uiElements.messageElement.style.opacity = '0';
						// Don't reset position as all messages should be at 25%
					}
				}
			},
			playerHit: {
				handler(data, ecs) {
					// Get player
					const playerEntities = ecs.entityManager.getEntitiesWithQuery(['player']);
					if (playerEntities.length === 0) return;

					const playerEntity = playerEntities[0];
					if (!playerEntity) return;

					const player = playerEntity.components.player;

					// Reduce player health
					player.health -= data.damage;
					if (player.health < 0) player.health = 0;

					// Update health display
					ecs.eventBus.publish('updateHealth', {
						health: player.health
					});

					// Check if player is dead
					if (player.health <= 0) {
						// Game over
						ecs.eventBus.publish('gameOver', {
							win: false,
							score: ecs.getResource('gameState').score
						});
					}
				}
			},
			updateScore: {
				handler(data, ecs) {
					// Update score
					const gameState = ecs.getResource('gameState');
					gameState.score += data.points;

					// Update UI
					updateUI(ecs);
				}
			},
			updateHealth: {
				handler(_data, ecs) {
					// Update UI
					updateUI(ecs);
				}
			},
			updateWave: {
				handler(_data, ecs) {
					// Update UI
					updateUI(ecs);
				}
			},
			waveComplete: {
				handler(_data, ecs) {
					const waveManager = ecs.getResource('waveManager');
					const config = ecs.getResource('config');

					// Check if all waves are complete
					if (waveManager.currentWave >= config.waveCount) {
						// Game completed
						ecs.eventBus.publish('gameOver', {
							win: true,
							score: ecs.getResource('gameState').score
						});
						return;
					}

					// Start next wave
					waveManager.currentWave++;
					waveManager.enemiesRemaining = config.enemiesPerWave * waveManager.currentWave;
					waveManager.waveStartTime = performance.now() / 1000;

					// Show wave start message
					const uiElements = ecs.getResource('uiElements');
					if (uiElements.messageElement) {
						uiElements.messageElement.innerText = `WAVE ${waveManager.currentWave}`;
						uiElements.messageElement.style.opacity = '1';
						uiElements.messageElement.style.top = '25%';
						setTimeout(() => {
							if (uiElements.messageElement) {
								uiElements.messageElement.style.opacity = '0';
							}
						}, 2000);
					}

					// Update UI
					ecs.eventBus.publish('updateWave', { wave: waveManager.currentWave });
				}
			},
			gameOver: {
				handler(data, ecs) {
					// Update game state
					const gameState = ecs.getResource('gameState');
					gameState.status = 'gameOver';

					// Disable gameplay systems
					ecs.disableSystemGroup('gameplay');

					// Pause radar sweep
					const radarSweep = document.getElementById('radar-sweep') as HTMLDivElement;
					if (radarSweep) {
						radarSweep.style.animationPlayState = 'paused';
					}

					// Show game over message
					const uiElements = ecs.getResource('uiElements');
					if (uiElements.messageElement) {
						uiElements.messageElement.innerText = data.win
							? `YOU WIN!\nFinal Score: ${data.score}`
							: `GAME OVER\nFinal Score: ${data.score}`;
						uiElements.messageElement.style.opacity = '1';
						uiElements.messageElement.style.top = '25%';
						uiElements.messageElement.style.whiteSpace = 'pre';
					}
				}
			},
			enemyDestroyed: {
				handler(data, ecs) {
					console.log('enemyDestroyed event received:', data);

					// Make sure the entity exists
					const entity = ecs.entityManager.getEntity(data.entityId);
					if (!entity) {
						console.log('Entity not found:', data.entityId);
						return;
					}

					// Mark as destroying to prevent multiple destructions
					if (entity.components.enemy) {
						entity.components.enemy.isDestroying = true;

						// Add destruction visual effects for enemies
						if (entity.components.model) {
							// Scale up the enemy model briefly before destruction
							entity.components.model.scale.set(1.5, 1.5, 1.5);
						}

						// Ensure the entity is destroyed after visual effect
						setTimeout(() => {
							ecs.eventBus.publish('entityDestroyed', {
								entityId: data.entityId
							});
						}, 200);

						// Update score
						ecs.eventBus.publish('updateScore', {
							points: data.points
						});

						// Reduce enemies remaining in wave
						const waveManager = ecs.getResource('waveManager');
						waveManager.enemiesRemaining--;

						// Check if wave is complete
						if (waveManager.enemiesRemaining <= 0) {
							ecs.eventBus.publish('waveComplete', {
								wave: waveManager.currentWave
							});
						}
					}
				}
			}
		})
		.bundle;
}
