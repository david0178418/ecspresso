import Bundle from '../../../src/bundle';
import { createSpriteComponents } from '../../../src/bundles/renderers/pixi';
import { createVelocity } from '../../../src/bundles/utils/movement';
import { createAABBCollider } from '../../../src/bundles/utils/collision';
import { createDestroyOutOfBounds } from '../../../src/bundles/utils/bounds';
import type { Components, Events, Resources } from '../types';
import { spawnPlayer, createProjectileSprite } from '../utils';
import { layers } from '../layers';

/**
 * Handles entity spawning in response to game events.
 */
export default function createSpawnerBundle() {
	return new Bundle<Components, Events, Resources>('spawner-bundle')
		.addSystem('entity-spawner')
		.setEventHandlers({
			gameInit: {
				handler(_data, ecs) {
					spawnPlayer(ecs);
				},
			},

			playerShoot: {
				handler(_data, ecs) {
					const [player] = ecs.getEntitiesWithQuery(['player', 'worldTransform']);
					if (!player) return;

					const projectileSprite = createProjectileSprite(ecs, 'player');

					ecs.spawn({
						...createSpriteComponents(projectileSprite, {
							x: player.components.worldTransform.x,
							y: player.components.worldTransform.y - 20
						}),
						...createVelocity(0, -400),
						projectile: { owner: 'player', damage: 1 },
						...createAABBCollider(projectileSprite.width, projectileSprite.height),
						...layers.playerProjectile(),
						...createDestroyOutOfBounds(20),
					});
				}
			},

			enemyShoot: {
				handler(data, ecs) {
					const enemyEntity = ecs.entityManager.getEntity(data.enemyId);
					if (!enemyEntity) return;

					const enemyWorldTransform = enemyEntity.components['worldTransform'];
					if (!enemyWorldTransform) return;

					const projectileSprite = createProjectileSprite(ecs, 'enemy');

					ecs.spawn({
						...createSpriteComponents(projectileSprite, {
							x: enemyWorldTransform.x,
							y: enemyWorldTransform.y + 20
						}),
						...createVelocity(0, 400),
						projectile: { owner: 'enemy', damage: 1 },
						...createAABBCollider(projectileSprite.width, projectileSprite.height),
						...layers.enemyProjectile(),
						...createDestroyOutOfBounds(20),
					});
				}
			},

			playerRespawn: {
				handler(_data, ecs) {
					const gameState = ecs.getResource('gameState');
					if (gameState.status === 'playing') {
						spawnPlayer(ecs);
					}
				}
			}
		})
		.bundle;
}
