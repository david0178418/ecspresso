import { Vector3 } from 'three';
import { createTimer } from '../../../src/plugins/timers';
import { definePlugin } from '../types';

export default function createAIPlugin() {
	return definePlugin({
		id: 'ai-plugin',
		install(world) {
			// Enemy AI system - in gameplay group so it pauses automatically
			world.addSystem('enemy-ai')
				.inGroup('gameplay')
				.addQuery('enemies', {
					with: ['enemy', 'position', 'velocity', 'rotation']
				})
				.setProcess(({ enemies }, _deltaTime, ecs) => {
					const playerEntities = ecs.entityManager.getEntitiesWithQuery(['player', 'position']);

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

								// Add timer for pending destruction (visual effect delay)
								ecs.addComponent(enemy.id, 'timer', createTimer(0.5).timer);
								ecs.addComponent(enemy.id, 'pendingDestroy', true);
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
				.setOnInitialize((ecs) => {
					// Add playerInitialRotation resource to track initial player facing direction
					ecs.addResource('playerInitialRotation', { y: 0 });
				})
				.and()
				// Pending destroy system - destroys entities after their timer finishes
				.addSystem('pending-destroy')
				.inGroup('gameplay')
				.addQuery('pendingDestroys', {
					with: ['timer', 'pendingDestroy'],
				})
				.setProcess(({ pendingDestroys }, _deltaTime, ecs) => {
					for (const entity of pendingDestroys) {
						if (entity.components.timer.justFinished) {
							ecs.eventBus.publish('entityDestroyed', {
								entityId: entity.id
							});
						}
					}
				})
				.and()
				// Spawn timer system - handles enemy spawning via spawner entity
				.addSystem('spawn-timer')
				.inGroup('gameplay')
				.inPhase('preUpdate')
				.addQuery('spawners', {
					with: ['timer', 'enemySpawner'],
				})
				.setProcess(({ spawners }, _deltaTime, ecs) => {
					const waveManager = ecs.getResource('waveManager');
					const config = ecs.getResource('config');
					const playerInitialRotation = ecs.getResource('playerInitialRotation');

					for (const spawner of spawners) {
						if (!spawner.components.timer.justFinished) continue;

						// Check if we still need to spawn enemies for this wave
						if (waveManager.enemiesRemaining > 0) {
							// Count current enemies
							const enemies = ecs.entityManager.getEntitiesWithQuery(['enemy']);

							// Don't spawn more than max enemies at once
							if (enemies.length < config.maxEnemies) {
								// Randomly decide if ground or air enemy (70% ground, 30% air)
								const isGroundEnemy = Math.random() < 0.7;
								const enemyType = isGroundEnemy ? 'ground' : 'air';

								// Calculate spawn angle within +/-60 degrees of player's initial facing direction
								const baseAngle = playerInitialRotation.y;
								const randomOffset = (Math.random() - 0.5) * (Math.PI / 3); // Random angle between -60 and +60 degrees
								// Add Math.PI to place enemies in front instead of behind
								const angle = baseAngle + Math.PI + randomOffset;
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
				.and();
		},
	});
}
