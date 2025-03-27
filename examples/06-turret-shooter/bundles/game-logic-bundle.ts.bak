import { Vector3 } from 'three';
import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';
import { updateUI } from '../utils';

export default function createGameLogicBundle() {
	return new Bundle<Components, Events, Resources>('game-logic-bundle')
		// Movement system
		.addSystem('movement')
		.addQuery('movables', {
			with: [
				'position',
				'velocity'
			]
		})
		.setProcess(({ movables }, deltaTime, ecs) => {
			// Check if game is paused
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'playing') return;

			for (const entity of movables) {
				const { position, velocity } = entity.components;

				// Apply velocity to position
				position.x += velocity.x * deltaTime;
				position.y += velocity.y * deltaTime;
				position.z += velocity.z * deltaTime;
			}
		})
		.bundle
		// Enemy AI system
		.addSystem('enemy-ai')
		.addQuery('enemies', {
			with: [
				'enemy',
				'position',
				'velocity',
				'rotation'
			]
		})
		.setProcess(({ enemies }, _deltaTime, ecs) => {
			// Check if game is paused
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'playing') return;

			const playerEntities = ecs.entityManager.getEntitiesWithComponents(['player', 'position']);

			// Skip if no player exists
			if (playerEntities.length === 0) return;

			const playerEntity = playerEntities[0];
			if (!playerEntity) return;

			const playerPosition = playerEntity.components.position;

			for (const enemy of enemies) {
				const { position, velocity, rotation, enemy: enemyComponent } = enemy.components;

				// Skip enemies already marked for destruction
				if (enemyComponent.isDestroying) continue;

				// Calculate direction to player
				const directionX = playerPosition.x - position.x;
				const directionZ = playerPosition.z - position.z;
				const distance = Math.sqrt(directionX * directionX + directionZ * directionZ);

				// Skip if enemy is too close to player
				const minDistance = 10; // Minimum distance to player
				if (distance < minDistance) {
					// Damage player and mark for destruction
					if (!enemyComponent.isDestroying) {
						// Mark as destroying to avoid multiple hits
						enemyComponent.isDestroying = true;

						// Immediately stop movement
						velocity.x = 0;
						velocity.y = 0;
						velocity.z = 0;

						// Deal damage to player
						ecs.eventBus.publish('playerHit', {
							damage: enemyComponent.attackDamage * 0.1 // Reduced damage (10% of base)
						});

						// Create destruction effect and award score
						ecs.eventBus.publish('enemyDestroyed', {
							entityId: enemy.id,
							points: Math.floor(enemyComponent.scoreValue / 2) // Half points for enemies that reach the player
						});

						// Queue entity for destruction
						setTimeout(() => {
							ecs.eventBus.publish('entityDestroyed', {
								entityId: enemy.id
							});
						}, 500); // Increased delay for better visual effect
					}
				} else {
					// Normalize direction
					const normalizedDirX = directionX / distance;
					const normalizedDirZ = directionZ / distance;

					// Calculate rotation to face player (fixing direction)
					rotation.y = Math.atan2(normalizedDirX, normalizedDirZ);

					// Update velocity to move towards player
					// (matches rotation calculation direction)
					velocity.x = normalizedDirX * enemyComponent.speed;
					velocity.z = normalizedDirZ * enemyComponent.speed;
				}

				// Apply different behavior for air enemies
				if (enemyComponent.type === 'air') {
					// Add some vertical movement for air enemies
					position.y = 15 + Math.sin(performance.now() / 1000) * 3;
				}
			}
		})
		.bundle
		// Lifetime system
		.addSystem('lifetime')
		.addQuery('expirables', {
			with: [
				'lifetime'
			]
		})
		.setProcess(({ expirables }, deltaTime, ecs) => {
			// Check if game is paused
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'playing') return;

			for (const entity of expirables) {
				entity.components.lifetime.remaining -= deltaTime;

				// Destroy entity when lifetime expires
				if (entity.components.lifetime.remaining <= 0) {
					ecs.eventBus.publish('entityDestroyed', {
						entityId: entity.id
					});
				}
			}
		})
		.bundle
		// Collision system
		.addSystem('collision')
		.addQuery('collidables', {
			with: [
				'position',
				'collider'
			]
		})
		.setProcess(({ collidables }, _deltaTime, ecs) => {
			// Check if game is paused
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'playing') return;

			// Group entities by type for efficient checking
			const playerEntities = [];
			const enemyEntities = [];
			const projectileEntities = [];

			for (const entity of collidables) {
				if (entity.components.player) {
					playerEntities.push(entity);
				} else if (entity.components.enemy) {
					enemyEntities.push(entity);
				} else if (entity.components.projectile) {
					projectileEntities.push(entity);
				}
			}

			// Check projectile collisions with enemies
			for (const projectile of projectileEntities) {
				const projectilePosition = projectile.components.position;
				const projectileRadius = projectile.components.collider.radius;
				const projectileComponent = projectile.components.projectile;

				// Skip if projectile component is missing
				if (!projectileComponent) continue;

				// Only player projectiles can hit enemies
				if (projectileComponent.owner !== 'player') continue;

				for (const enemy of enemyEntities) {
					const enemyPosition = enemy.components.position;
					const enemyRadius = enemy.components.collider.radius;
					const enemyComponent = enemy.components.enemy;

					// Skip if enemy component is missing
					if (!enemyComponent) continue;

					// Simple sphere collision detection
					const dx = projectilePosition.x - enemyPosition.x;
					const dy = projectilePosition.y - enemyPosition.y;
					const dz = projectilePosition.z - enemyPosition.z;
					const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

					// Check collision
					if (distance < (projectileRadius + enemyRadius)) {
						// Damage enemy
						enemyComponent.health -= projectileComponent.damage;

						// Destroy projectile
						ecs.eventBus.publish('entityDestroyed', {
							entityId: projectile.id
						});

						// Check if enemy is destroyed
						if (enemyComponent.health <= 0) {
							ecs.eventBus.publish('enemyDestroyed', {
								entityId: enemy.id,
								points: enemyComponent.scoreValue
							});

							// Update score
							ecs.eventBus.publish('updateScore', {
								points: enemyComponent.scoreValue
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

						break; // Projectile can only hit one enemy
					}
				}
			}
		})
		.bundle
		// Spawn system
		.addSystem('spawn-system')
		.setProcess((_queries, _deltaTime, ecs) => {
			const gameState = ecs.getResource('gameState');

			// Only spawn enemies if game is playing
			if (gameState.status !== 'playing') return;

			const waveManager = ecs.getResource('waveManager');
			const config = ecs.getResource('config');

			// Current time in seconds
			const currentTime = performance.now() / 1000;

			// Check if it's time to spawn a new enemy
			const timeSinceLastSpawn = currentTime - waveManager.lastSpawnTime;
			const spawnInterval = 1 / config.enemySpawnRate;

			if (timeSinceLastSpawn >= spawnInterval) {
				// Update last spawn time
				waveManager.lastSpawnTime = currentTime;

				// Check if we still need to spawn enemies for this wave
				if (waveManager.enemiesRemaining > 0) {
					// Count current enemies
					const enemies = ecs.entityManager.getEntitiesWithComponents(['enemy']);

					// Don't spawn more than max enemies at once
					if (enemies.length < config.maxEnemies) {
						// Randomly decide if ground or air enemy (70% ground, 30% air)
						const isGroundEnemy = Math.random() < 0.7;
						const enemyType = isGroundEnemy ? 'ground' : 'air';

						// Random angle for spawn position
						const angle = Math.random() * Math.PI * 2;
						const spawnDistance = 180 + Math.random() * 40; // 180-220 units from center

						// Calculate spawn position
						const spawnX = Math.sin(angle) * spawnDistance;
						const spawnZ = Math.cos(angle) * spawnDistance;

						// Spawn enemy
						ecs.eventBus.publish('enemySpawn', {
							type: enemyType,
							position: new Vector3(spawnX, 0, spawnZ)
						});
					}
				}
			}
		})
		.bundle
		// Radar system
		.addSystem('radar-system')
		.setProcess((_queries, _deltaTime, ecs) => {
			// Check if game is paused
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'playing') return;

			// Get radar container element
			const radarContainer = document.getElementById('radar-overlay');
			if (!radarContainer) return;

			// Get player entity and rotation
			const playerEntities = ecs.entityManager.getEntitiesWithComponents(['player', 'rotation']);
			if (playerEntities.length === 0) return;

			const player = playerEntities[0];
			if (!player) return; // Ensure player exists

			const playerRotation = player.components.rotation;
			const playerFacing = playerRotation.y; // Horizontal rotation angle

			// Get all enemies
			const enemyEntities = ecs.entityManager.getEntitiesWithComponents(['enemy', 'position']);

			// Update or create blips for each enemy
			for (const enemy of enemyEntities) {
				if (enemy.components.enemy.isDestroying) continue;

				const position = enemy.components.position;
				const enemyType = enemy.components.enemy.type;

				// Calculate distance from player (center)
				const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
				const maxDistance = 200; // Maximum radar range
				const normalizedDistance = Math.min(distanceFromCenter, maxDistance) / maxDistance;

				// Calculate absolute angle from center to enemy
				const absoluteAngle = Math.atan2(position.x, position.z);

				// Calculate relative angle (subtract player's facing direction)
				// This makes straight ahead (player facing) always point up on the radar
				let relativeAngle = absoluteAngle - playerFacing;

				// Normalize angle to be between -PI and PI
				while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
				while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

				// Calculate radar position based on relative angle
				// X is sin, Z is cos (for a top-down view where up is player facing direction)
				const radarRadius = 75; // Half of radar diameter
				const blipX = Math.sin(relativeAngle) * normalizedDistance * radarRadius;
				const blipZ = Math.cos(relativeAngle) * normalizedDistance * radarRadius; // Positive cos to make forward be up (not negative)

				// Find existing blip or create new one
				let blip = radarContainer.querySelector(`.radar-blip[data-entity-id="${enemy.id}"]`) as HTMLDivElement;

				if (!blip) {
					// Create new blip
					blip = document.createElement('div');
					blip.classList.add('radar-blip');
					blip.setAttribute('data-entity-id', enemy.id.toString());
					blip.setAttribute('data-enemy-type', enemyType);

					// Style the blip
					blip.style.position = 'absolute';
					blip.style.width = '12px'; // Larger blips
					blip.style.height = '12px';
					blip.style.borderRadius = '50%';
					blip.style.backgroundColor = enemyType === 'ground' ? '#ff3333' : '#3333ff';
					blip.style.boxShadow = enemyType === 'ground'
						? '0 0 8px #ff0000'
						: '0 0 8px #0000ff';
					blip.style.zIndex = '150';

					// Add to radar
					radarContainer.appendChild(blip);
				}

				// Update blip position
				blip.style.left = `${50 + blipX}%`;
				blip.style.top = `${50 + blipZ}%`;
				blip.style.transform = 'translate(-50%, -50%)';
			}
		})
		.bundle
		// Game state system
		.addSystem('game-state')
		.setEventHandlers({
			gameStart: {
				handler(_data, ecs) {
					// Update game state to playing
					const gameState = ecs.getResource('gameState');
					gameState.status = 'playing';

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

					// Show pause message
					const uiElements = ecs.getResource('uiElements');
					if (uiElements.messageElement) {
						uiElements.messageElement.innerText = 'PAUSED';
						uiElements.messageElement.style.opacity = '1';
					}
				}
			},
			gameResume: {
				handler(_data, ecs) {
					// Resume the game
					const gameState = ecs.getResource('gameState');
					gameState.status = 'playing';

					// Hide pause message
					const uiElements = ecs.getResource('uiElements');
					if (uiElements.messageElement) {
						uiElements.messageElement.style.opacity = '0';
					}
				}
			},
			playerHit: {
				handler(data, ecs) {
					// Get player
					const playerEntities = ecs.entityManager.getEntitiesWithComponents(['player']);
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

					// Show game over message
					const uiElements = ecs.getResource('uiElements');
					if (uiElements.messageElement) {
						uiElements.messageElement.innerText = data.win
							? `YOU WIN!\nFinal Score: ${data.score}`
							: `GAME OVER\nFinal Score: ${data.score}`;
						uiElements.messageElement.style.opacity = '1';
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
