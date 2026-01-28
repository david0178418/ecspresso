import Bundle from '../../../src/bundle';
import { createTransform } from '../../../src/bundles/utils/transform';
import { createVelocity } from '../../../src/bundles/utils/movement';
import { createAABBCollider } from '../../../src/bundles/utils/collision';
import { createDestroyOutOfBounds } from '../../../src/bundles/utils/bounds';
import type { Components, Events, Resources } from '../types';
import { spawnPlayer, createProjectileSprite } from '../utils';
import { layers } from '../layers';

export default function createRenderBundle() {
	return new Bundle<Components, Events, Resources>('render-bundle')
		.addSystem('renderer')
		.addQuery('renderables', { with: ['worldTransform', 'sprite'] })
		.setOnInitialize((ecs) => {
			ecs.onComponentRemoved('sprite', (sprite) => {
				sprite.parent?.removeChild(sprite);
			});
		})
		.setProcess(({ renderables }) => {
			for (const entity of renderables) {
				const { worldTransform, sprite } = entity.components;
				sprite.x = worldTransform.x;
				sprite.y = worldTransform.y;
			}
		})
		.bundle
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

					const entityContainer = ecs.getResource('entityContainer');
					const projectileSprite = createProjectileSprite(ecs, 'player');
					entityContainer.addChild(projectileSprite);

					ecs.spawn({
						...createTransform(player.components.worldTransform.x, player.components.worldTransform.y - 20),
						...createVelocity(0, -400),
						sprite: projectileSprite,
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

					const entityContainer = ecs.getResource('entityContainer');
					const projectileSprite = createProjectileSprite(ecs, 'enemy');
					entityContainer.addChild(projectileSprite);

					ecs.spawn({
						...createTransform(enemyWorldTransform.x, enemyWorldTransform.y + 20),
						...createVelocity(0, 400),
						sprite: projectileSprite,
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
