import Bundle from '../../../src/bundle';
import { createTimer } from '../../../src/bundles/utils/timers';
import type { Components, Events, Resources } from '../types';
import { isColliding } from '../utils';

/**
 * Creates a bundle for handling collisions in the Space Invaders game
 */
export default function createCollisionBundle(): Bundle<Components, Events, Resources> {
	return new Bundle<Components, Events, Resources>('collision-bundle')
		.addSystem('collision-detection')
		.inGroup('gameplay')
		.addQuery('projectiles', {
			with: ['projectile', 'position', 'collider'],
		})
		.addQuery('players', {
			with: ['player', 'position', 'collider'],
		})
		.addQuery('enemies', {
			with: ['enemy', 'position', 'collider'],
		})
		.setProcess(({ projectiles, players, enemies }, _deltaTime, ecs) => {
			// Process projectile collisions
			for (const projectile of projectiles) {
				const projectileData = projectile.components['projectile'];
				const projectilePos = projectile.components['position'];
				const projectileCollider = projectile.components['collider'];

				if (!projectileData || !projectilePos || !projectileCollider) continue;

				// Check for collisions based on projectile owner
				if (projectileData.owner === 'player') {
					// Player projectiles can hit enemies
					for (const enemy of enemies) {
						const enemyPos = enemy.components['position'];
						const enemyCollider = enemy.components['collider'];

						if (!enemyPos || !enemyCollider) continue;

						// Check if collision occurred
						if (!isColliding(
							projectilePos.x, projectilePos.y, projectileCollider.width, projectileCollider.height,
							enemyPos.x, enemyPos.y, enemyCollider.width, enemyCollider.height
						)) continue;

						// Handle projectile and enemy collision
						// Destroy the projectile
						ecs.eventBus.publish('entityDestroyed', { entityId: projectile.id });

						// Damage the enemy
						const enemyData = enemy.components['enemy'];
						if (!enemyData) return;

						// Reduce enemy health
						enemyData.health -= 1;

						// Check if enemy is destroyed
						if (enemyData.health > 0) continue;

						// Destroy the enemy
						ecs.eventBus.publish('entityDestroyed', {
							entityId: enemy.id,
							wasEnemy: true,
							points: enemyData.points
						});

						// Stop checking this projectile, it's been destroyed
						break;
					}
				} else {
					// Enemy projectiles can hit the player
					for (const player of players) {
						const playerPos = player.components['position'];
						const playerCollider = player.components['collider'];

						if (!playerPos || !playerCollider) continue;

						if (!isColliding(
							projectilePos.x, projectilePos.y, projectileCollider.width, projectileCollider.height,
							playerPos.x, playerPos.y, playerCollider.width, playerCollider.height
						)) continue;

						// Destroy the projectile
						ecs.eventBus.publish('entityDestroyed', { entityId: projectile.id });

						// Kill the player
						ecs.eventBus.publish('entityDestroyed', { entityId: player.id });

						// Trigger player death event
						ecs.eventBus.publish('playerDeath');

						// Stop checking this projectile, it's been destroyed
						break;
					}
				}
			}
		})
		.setEventHandlers({
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
							score: ecs.getResource('score').value
						});
					} else {
						// Spawn respawn timer entity
						ecs.spawn({
							...createTimer(1.0),
							respawnTimer: true as const,
						});
					}
				}
			}
		})
		.bundle
		// Respawn timer system
		.addSystem('respawn-timer')
		.inGroup('gameplay')
		.addQuery('respawnTimers', {
			with: ['timer', 'respawnTimer'] as const,
		})
		.setProcess(({ respawnTimers }, _deltaTime, ecs) => {
			const gameState = ecs.getResource('gameState');

			for (const entity of respawnTimers) {
				if (entity.components.timer.justFinished) {
					// Remove the timer entity
					ecs.removeEntity(entity.id);

					// Trigger respawn if game is still playing
					if (gameState.status === 'playing') {
						ecs.eventBus.publish('playerRespawn', {});
					}
				}
			}
		})
		.bundle
		.addSystem('movement')
		.inGroup('gameplay')
		.addQuery('movingEntities', {
			with: ['position', 'velocity']
		})
		.setProcess(({ movingEntities }, deltaTime, ecs) => {
			const pixi = ecs.getResource('pixi');
			const screenWidth = pixi.screen.width;
			const screenHeight = pixi.screen.height;

			// Update positions based on velocity
			for (const entity of movingEntities) {
				const position = entity.components['position'];
				const velocity = entity.components['velocity'];

				if (!position || !velocity) continue;

				// Apply velocity
				position.x += velocity.x * deltaTime;
				position.y += velocity.y * deltaTime;

				// Handle player boundaries
				if (entity.components.player) {
					// Keep player within screen bounds
					position.x = Math.max(30, Math.min(screenWidth - 30, position.x));
				}

				// Handle projectile boundaries
				if (entity.components.projectile) {
					// Destroy projectiles that go off-screen
					if (position.y < -20 || position.y > screenHeight + 20 ||
							position.x < -20 || position.x > screenWidth + 20) {
						ecs.eventBus.publish('entityDestroyed', { entityId: entity.id });
					}
				}
			}
		})
		.bundle
		// Lifetime system for temporary entities
		.addSystem('lifetime')
		.inGroup('gameplay')
		.addQuery('temporaries', {
			with: ['lifetime']
		})
		.setProcess(({ temporaries }, deltaTime, ecs) => {
			// Update lifetimes and destroy expired entities
			for (const entity of temporaries) {
				const lifetime = entity.components['lifetime'];

				if (!lifetime) continue;

				lifetime.remaining -= deltaTime;

				if (lifetime.remaining <= 0) {
					ecs.eventBus.publish('entityDestroyed', { entityId: entity.id });
				}
			}
		})
		.bundle;
}
