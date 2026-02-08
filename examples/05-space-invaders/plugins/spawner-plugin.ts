import { createLocalTransform } from '../../../src/plugins/renderers/renderer2D';
import { createRigidBody } from '../../../src/plugins/physics2D';
import { createAABBCollider } from '../../../src/plugins/collision';
import { createDestroyOutOfBounds } from '../../../src/plugins/bounds';
import { definePlugin } from '../types';
import { spawnPlayer, createProjectileSprite } from '../utils';
import collisionLayers from '../collision-layers';

/**
 * Handles entity spawning in response to game events.
 */
export default function createSpawnerPlugin() {
	return definePlugin({
		id: 'spawner-plugin',
		install(world) {
			world.addSystem('entity-spawner')
				.setEventHandlers({
					gameInit(_data, ecs) {
						spawnPlayer(ecs);
					},

					playerShoot(_data, ecs) {
						const [player] = ecs.getEntitiesWithQuery(['player', 'worldTransform']);
						if (!player) return;

						const projectileSprite = createProjectileSprite(ecs, 'player');

						ecs.spawn({
							sprite: projectileSprite,
							...createLocalTransform(player.components.worldTransform.x, player.components.worldTransform.y - 20),
							...createRigidBody('kinematic'),
							velocity: { x: 0, y: -400 },
							projectile: { owner: 'player', damage: 1 },
							...createAABBCollider(projectileSprite.width, projectileSprite.height),
							...collisionLayers.playerProjectile(),
							...createDestroyOutOfBounds(20),
							renderLayer: 'game',
						});
					},

					enemyShoot(data, ecs) {
						const enemyEntity = ecs.entityManager.getEntity(data.enemyId);
						if (!enemyEntity) return;

						const enemyWorldTransform = enemyEntity.components['worldTransform'];
						if (!enemyWorldTransform) return;

						const projectileSprite = createProjectileSprite(ecs, 'enemy');

						ecs.spawn({
							sprite: projectileSprite,
							...createLocalTransform(enemyWorldTransform.x, enemyWorldTransform.y + 20),
							...createRigidBody('kinematic'),
							velocity: { x: 0, y: 400 },
							projectile: { owner: 'enemy', damage: 1 },
							...createAABBCollider(projectileSprite.width, projectileSprite.height),
							...collisionLayers.enemyProjectile(),
							...createDestroyOutOfBounds(20),
							renderLayer: 'game',
						});
					},

					playerRespawn(_data, ecs) {
						const gameState = ecs.getResource('gameState');
						if (gameState.status === 'playing') {
							spawnPlayer(ecs);
						}
					}
				})
				.and();
		},
	});
}
