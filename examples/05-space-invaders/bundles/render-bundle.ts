import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';
import { createPlayerSprite, createProjectileSprite } from '../utils';

export default function createRenderBundle() {
	return new Bundle<Components, Events, Resources>('render-bundle')
		.addSystem('renderer')
		.addQuery('renderables', {
			with: [
				'position',
				'sprite',
			]
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
					const entityContainer = ecs.getResource('entityContainer');

					const playerEntity = ecs.entityManager.createEntity();
					const playerSprite = createPlayerSprite(ecs);

					entityContainer.addChild(playerSprite);

					const pixi = ecs.getResource('pixi');
					const initialX = pixi.screen.width / 2;
					const initialY = pixi.screen.height - 80;

					ecs.entityManager.addComponents(playerEntity, {
						sprite: playerSprite,
						player: true,
						position: {
							x: initialX,
							y: initialY,
						},
						velocity: {
							x: 0,
							y: 0,
						},
						collider: {
							width: playerSprite.width,
							height: playerSprite.height,
						},
					});
				},
			},
			playerShoot: {
				handler(_data, ecs) {
					const entityContainer = ecs.getResource('entityContainer');
					const playerEntities = ecs.entityManager.getEntitiesWithQuery(['player', 'position']);

					const [player] = playerEntities;

					if (!player) return;

					const playerPosition = player.components.position;

					const projectileEntity = ecs.entityManager.createEntity();
					const projectileSprite = createProjectileSprite(ecs, 'player');

					entityContainer.addChild(projectileSprite);

					ecs.entityManager.addComponents(projectileEntity, {
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
						lifetime: {
							remaining: 2.0 // Seconds before auto-destruction
						}
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

					// Create a projectile entity
					const projectileEntity = ecs.entityManager.createEntity();
					const projectileSprite = createProjectileSprite(ecs, 'enemy');

					entityContainer.addChild(projectileSprite);

					// Position the projectile at the bottom of the enemy
					ecs.entityManager.addComponents(projectileEntity, {
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
						lifetime: {
							remaining: 4.0,
						}
					});
				}
			},
			entityDestroyed: {
				handler(data, ecs) {
					const entity = ecs.entityManager.getEntity(data.entityId);

					if (!entity) return;

					if (entity.components.sprite) {
						entity.components.sprite.parent?.removeChild(entity.components.sprite);
					}

					ecs.entityManager.removeEntity(data.entityId);
				}
			},

			playerRespawn: {
				handler(_data, ecs) {
					const entityContainer = ecs.getResource('entityContainer');
					const pixi = ecs.getResource('pixi');

					const playerEntity = ecs.entityManager.createEntity();
					const playerSprite = createPlayerSprite(ecs);

					entityContainer.addChild(playerSprite);

					const initialX = pixi.screen.width / 2;
					const initialY = pixi.screen.height - 80;

					ecs.entityManager.addComponents(playerEntity, {
						sprite: playerSprite,
						player: true,
						position: {
							x: initialX,
							y: initialY,
						},
						velocity: {
							x: 0,
							y: 0,
						},
						collider: {
							width: playerSprite.width,
							height: playerSprite.height,
						},
					});
				}
			}
		})
		.bundle;
}
