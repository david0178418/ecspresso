import Bundle from '../../../src/bundle';
import { createTimer } from '../../../src/bundles/utils/timers';
import type { Components, Events, Resources } from '../types';

/**
 * Handles game-specific collision responses and combat logic.
 * Collision detection is provided by the collision bundle.
 */
export default function createCombatBundle(): Bundle<Components, Events, Resources> {
	return new Bundle<Components, Events, Resources>('combat-bundle')
		.addSystem('combat')
		.inGroup('gameplay')
		.setEventHandlers({
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

						// Remove the projectile
						ecs.commands.removeEntity(projectileId);

						// Damage the enemy
						const enemyData = ecs.entityManager.getComponent(enemyId, 'enemy');
						if (!enemyData) return;

						enemyData.health -= 1;

						if (enemyData.health <= 0) {
							ecs.commands.removeEntity(enemyId);

							// Update score
							const score = ecs.getResource('score');
							score.value += enemyData.points;
							ecs.eventBus.publish('updateScore', { points: score.value });

							// Check if all enemies destroyed (this is the last one)
							const enemies = ecs.getEntitiesWithQuery(['enemy']);
							if (enemies.length === 1) {
								const gameState = ecs.getResource('gameState');
								if (gameState.status === 'playing') {
									ecs.eventBus.publish('levelComplete', { level: gameState.level });
								}
							}
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

						ecs.commands.removeEntity(projectileId);
						ecs.commands.removeEntity(playerId);
						ecs.eventBus.publish('playerDeath');
					}
				},
			},

			playerDeath: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					gameState.lives -= 1;
					ecs.eventBus.publish('updateLives', { lives: gameState.lives });

					if (gameState.lives <= 0) {
						ecs.eventBus.publish('gameOver', {
							win: false,
							score: ecs.getResource('score').value,
						});
					} else {
						ecs.spawn(createTimer<Events>(1.0, { onComplete: 'playerRespawn' }));
					}
				},
			},
		})
		.bundle;
}
