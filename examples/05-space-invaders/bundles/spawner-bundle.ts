import Bundle from '../../../src/bundle';
import { createLocalTransform } from '../../../src/bundles/renderers/renderer2D';
import { createRigidBody } from '../../../src/bundles/physics2D';
import { createAABBCollider } from '../../../src/bundles/collision';
import { createDestroyOutOfBounds } from '../../../src/bundles/bounds';
import type { Components, Events, Resources } from '../types';
import { spawnPlayer, createProjectileSprite } from '../utils';
import collisionLayers from '../collision-layers';

/**
 * Handles entity spawning in response to game events.
 */
export default function createSpawnerBundle() {
	return new Bundle<Components, Events, Resources>('spawner-bundle')
		.addSystem('entity-spawner')
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
		.bundle;
}
