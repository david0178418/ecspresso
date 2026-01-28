import Bundle from '../../../src/bundle';
import { createTimer } from '../../../src/bundles/utils/timers';
import type { Components, Events, Resources } from '../types';

/**
 * Creates a bundle for handling game-specific collision responses in Space Invaders.
 * The actual collision detection is handled by the collision bundle.
 */
export default function createGameCollisionBundle(): Bundle<Components, Events, Resources> {
	return new Bundle<Components, Events, Resources>('game-collision-bundle')
		.addSystem('collision-response')
		.inGroup('gameplay')
		.setEventHandlers({
			// Handle collision events from the collision bundle
			collision: {
				handler(data, ecs) {
					const { entityA, entityB, layerA, layerB } = data;

					// Player projectile hits enemy
					if (
						(layerA === 'playerProjectile' && layerB === 'enemy') ||
						(layerA === 'enemy' && layerB === 'playerProjectile')
					) {
						const projectileId = layerA === 'playerProjectile' ? entityA : entityB;
						const enemyId = layerA === 'enemy' ? entityA : entityB;

						// Destroy the projectile
						ecs.eventBus.publish('entityDestroyed', { entityId: projectileId });

						// Damage the enemy
						const enemyData = ecs.entityManager.getComponent(enemyId, 'enemy');
						if (!enemyData) return;

						enemyData.health -= 1;

						if (enemyData.health <= 0) {
							ecs.eventBus.publish('entityDestroyed', {
								entityId: enemyId,
								wasEnemy: true,
								points: enemyData.points,
							});
						}
						return;
					}

					// Enemy projectile hits player
					if (
						(layerA === 'enemyProjectile' && layerB === 'player') ||
						(layerA === 'player' && layerB === 'enemyProjectile')
					) {
						const projectileId = layerA === 'enemyProjectile' ? entityA : entityB;
						const playerId = layerA === 'player' ? entityA : entityB;

						// Destroy the projectile
						ecs.eventBus.publish('entityDestroyed', { entityId: projectileId });

						// Kill the player
						ecs.eventBus.publish('entityDestroyed', { entityId: playerId });
						ecs.eventBus.publish('playerDeath');
					}
				},
			},

			// Handle player death
			playerDeath: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.lives -= 1;

					// Update lives UI
					ecs.eventBus.publish('updateLives', { lives: gameState.lives });

					if (gameState.lives <= 0) {
						// Game over
						ecs.eventBus.publish('gameOver', {
							win: false,
							score: ecs.getResource('score').value,
						});
					} else {
						// Spawn respawn timer entity with event-based completion
						ecs.spawn({
							...createTimer<Events>(1.0, { onComplete: 'playerRespawn' }),
						});
					}
				},
			},

			// Handle out of bounds events (projectile cleanup)
			entityOutOfBounds: {
				handler(data, ecs) {
					// Only destroy projectiles that go out of bounds
					const projectile = ecs.entityManager.getComponent(data.entityId, 'projectile');
					if (projectile) {
						ecs.eventBus.publish('entityDestroyed', { entityId: data.entityId });
					}
				},
			},
		})
		.bundle;
}
