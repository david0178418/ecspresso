import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';

export default function createGameplayBundle() {
	return new Bundle<Components, Events, Resources>('gameplay-bundle')
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
		.bundle;
}
