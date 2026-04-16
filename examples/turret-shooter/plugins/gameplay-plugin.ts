import { definePlugin } from '../types';

export default function createGameplayPlugin() {
	return definePlugin({
		id: 'gameplay-plugin',
		install(world) {
			// Lifetime system
			world.addSystem('lifetime')
				.inGroup('gameplay')
				.processEach({ with: ['lifetime'] }, ({ entity, dt, ecs }) => {
					entity.components.lifetime.remaining -= dt;

					if (entity.components.lifetime.remaining <= 0) {
						ecs.eventBus.publish('entityDestroyed', {
							entityId: entity.id
						});
					}
				});

			// Collision system
			world.addSystem('collision')
				.inGroup('gameplay')
				.inPhase('postUpdate')
				.addQuery('players', {
					with: ['player', 'localTransform3D', 'collider']
				})
				.addQuery('enemies', {
					with: ['enemy', 'localTransform3D', 'collider']
				})
				.addQuery('projectiles', {
					with: ['projectile', 'localTransform3D', 'collider']
				})
				.withResources(['waveManager'])
				.setProcess(({ queries: { enemies, projectiles }, ecs, resources: { waveManager } }) => {
					for (const projectile of projectiles) {
						const projTransform = projectile.components.localTransform3D;
						const projectileRadius = projectile.components.collider.radius;
						const projectileComponent = projectile.components.projectile;

						if (projectileComponent.owner !== 'player') continue;

						for (const enemy of enemies) {
							const enemyTransform = enemy.components.localTransform3D;
							const enemyRadius = enemy.components.collider.radius;
							const enemyComponent = enemy.components.enemy;

							if (enemyComponent.isDestroying) continue;

							const dx = projTransform.x - enemyTransform.x;
							const dy = projTransform.y - enemyTransform.y;
							const dz = projTransform.z - enemyTransform.z;
							const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

							if (distance < (projectileRadius + enemyRadius)) {
								enemyComponent.health -= projectileComponent.damage;

								ecs.eventBus.publish('entityDestroyed', {
									entityId: projectile.id
								});

								if (enemyComponent.health <= 0) {
									ecs.eventBus.publish('enemyDestroyed', {
										entityId: enemy.id,
										points: enemyComponent.scoreValue
									});

									ecs.eventBus.publish('updateScore', {
										points: enemyComponent.scoreValue
									});

									waveManager.enemiesRemaining--;

									if (waveManager.enemiesRemaining <= 0) {
										ecs.eventBus.publish('waveComplete', {
											wave: waveManager.currentWave
										});
									}
								}

								break;
							}
						}
					}
				});
		},
	});
}
