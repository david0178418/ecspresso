import Bundle from '../../../src/bundle';
import { createTimer } from '../../../src/bundles/utils/timers';
import type { Components, Events, Resources } from '../types';
import { spawnPlayer, createProjectileSprite } from '../utils';

export default function createRenderBundle() {
	return new Bundle<Components, Events, Resources>('render-bundle')
		.addSystem('renderer')
		.addQuery('renderables', {
			with: ['position', 'sprite']
		})
		.setOnInitialize((ecs) => {
			// Set up sprite cleanup on component removal
			ecs.onComponentRemoved('sprite', (sprite) => {
				sprite.parent?.removeChild(sprite);
			});
		})
		.setProcess(({ renderables }, _deltaTime, _ecs) => {
			for (const entity of renderables) {
				const { position, sprite } = entity.components;

				sprite.x = position.x;
				sprite.y = position.y;
			}
		})
		.bundle
		.addSystem('sprite-factory')
		.setEventHandlers({
			gameInit: {
				handler(_data, ecs) {
					spawnPlayer(ecs);
				},
			},
			playerShoot: {
				handler(_data, ecs) {
					const entityContainer = ecs.getResource('entityContainer');
					const playerEntities = ecs.getEntitiesWithQuery(['player', 'position']);

					const [player] = playerEntities;

					if (!player) return;

					const playerPosition = player.components.position;
					const projectileSprite = createProjectileSprite(ecs, 'player');
					entityContainer.addChild(projectileSprite);

					ecs.spawn({
						...createTimer<Events>(2.0), // Auto-remove after 2 seconds
						position: {
							x: playerPosition.x,
							y: playerPosition.y - 20
						},
						velocity: {
							x: 0,
							y: -400, // Move up
						},
						sprite: projectileSprite,
						projectile: {
							owner: 'player',
							damage: 1
						},
						collider: {
							width: projectileSprite.width,
							height: projectileSprite.height
						},
					});
				}
			},

			enemyShoot: {
				handler(data, ecs) {
					const entityContainer = ecs.getResource('entityContainer');
					const enemyEntity = ecs.entityManager.getEntity(data.enemyId);

					if (!enemyEntity) return;

					const enemyPosition = enemyEntity.components['position'];

					if (!enemyPosition) return;

					const projectileSprite = createProjectileSprite(ecs, 'enemy');
					entityContainer.addChild(projectileSprite);

					// Create a projectile entity positioned at the bottom of the enemy
					ecs.spawn({
						...createTimer<Events>(4.0), // Auto-remove after 4 seconds
						position: {
							x: enemyPosition.x,
							y: enemyPosition.y + 20
						},
						velocity: {
							x: 0,
							y: 400,
						},
						sprite: projectileSprite,
						projectile: {
							owner: 'enemy',
							damage: 1
						},
						collider: {
							width: projectileSprite.width,
							height: projectileSprite.height
						},
					});
				}
			},
			entityDestroyed: {
				handler(data, ecs) {
					ecs.commands.removeEntity(data.entityId);
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
