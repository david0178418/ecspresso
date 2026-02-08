import { definePlugin } from '../types';

export default function createGameplayPlugin() {
	return definePlugin({
		id: 'gameplay-plugin',
		install(world) {
			// Lifetime system - in gameplay group
			world.addSystem('lifetime')
				.inGroup('gameplay')
				.addQuery('expirables', {
					with: ['lifetime']
				})
				.setProcess(({ expirables }, deltaTime, ecs) => {
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
				.and()
				// Collision system - in gameplay group with separate queries for type safety
				.addSystem('collision')
				.inGroup('gameplay')
				.inPhase('postUpdate')
				.addQuery('players', {
					with: ['player', 'position', 'collider']
				})
				.addQuery('enemies', {
					with: ['enemy', 'position', 'collider']
				})
				.addQuery('projectiles', {
					with: ['projectile', 'position', 'collider']
				})
				.setProcess(({ enemies, projectiles }, _deltaTime, ecs) => {
					// Check projectile collisions with enemies
					for (const projectile of projectiles) {
						const projectilePosition = projectile.components.position;
						const projectileRadius = projectile.components.collider.radius;
						const projectileComponent = projectile.components.projectile;

						// Only player projectiles can hit enemies
						if (projectileComponent.owner !== 'player') continue;

						for (const enemy of enemies) {
							const enemyPosition = enemy.components.position;
							const enemyRadius = enemy.components.collider.radius;
							const enemyComponent = enemy.components.enemy;

							// Skip enemies already marked for destruction
							if (enemyComponent.isDestroying) continue;

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
				.and();
		},
	});
}
