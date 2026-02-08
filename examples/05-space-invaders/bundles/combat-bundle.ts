import Bundle from '../../../src/bundle';
import type ECSpresso from '../../../src/ecspresso';
import { createTimer } from '../../../src/bundles/timers';
import { createCollisionPairHandler } from '../../../src/bundles/collision';
import type { Components, Events, Resources } from '../types';
import type collisionLayers from '../collision-layers';

type ECS = ECSpresso<Components, Events, Resources>;
type Layer = keyof typeof collisionLayers;

/**
 * Handles game-specific collision responses and combat logic.
 * Collision detection is provided by the collision bundle.
 */
export default function createCombatBundle(): Bundle<Components, Events, Resources> {
	return new Bundle<Components, Events, Resources>('combat-bundle')
		.addSystem('combat')
		.inGroup('gameplay')
		.setEventHandlers({
			collision: createCollisionPairHandler<ECS, Layer>({
				'playerProjectile:enemy': (projectileId, enemyId, ecs) => {
					ecs.commands.removeEntity(projectileId);

					const enemyData = ecs.entityManager.getComponent(enemyId, 'enemy');
					if (!enemyData) return;

					enemyData.health -= 1;

					if (enemyData.health <= 0) {
						ecs.commands.removeEntity(enemyId);

						const score = ecs.getResource('score');
						score.value += enemyData.points;
						ecs.eventBus.publish('updateScore', { points: score.value });

						const enemies = ecs.getEntitiesWithQuery(['enemy']);
						if (enemies.length === 1) {
							const gameState = ecs.getResource('gameState');
							if (gameState.status === 'playing') {
								ecs.eventBus.publish('levelComplete', { level: gameState.level });
							}
						}
					}
				},
				'enemyProjectile:player': (projectileId, playerId, ecs) => {
					ecs.commands.removeEntity(projectileId);
					ecs.commands.removeEntity(playerId);
					ecs.eventBus.publish('playerDeath', {});
				},
			}),

			playerDeath(_data, ecs) {
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
		})
		.bundle;
}
