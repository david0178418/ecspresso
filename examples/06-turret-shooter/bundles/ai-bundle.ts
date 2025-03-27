import { Vector3 } from 'three';
import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';

export default function createAIBundle() {
	return new Bundle<Components, Events, Resources>('ai-bundle')
		// Enemy AI system
		.addSystem('enemy-ai')
		.addQuery('enemies', {
			with: [
				'enemy',
				'position',
				'velocity',
				'rotation'
			]
		})
		.setProcess(({ enemies }, _deltaTime, ecs) => {
			// Check if game is paused
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'playing') return;

			const playerEntities = ecs.entityManager.getEntitiesWithComponents(['player', 'position']);

			// Skip if no player exists
			if (playerEntities.length === 0) return;

			const playerEntity = playerEntities[0];
			if (!playerEntity) return;

			const playerPosition = playerEntity.components.position;

			for (const enemy of enemies) {
				const { position, velocity, rotation, enemy: enemyComponent } = enemy.components;

				// Skip enemies already marked for destruction
				if (enemyComponent.isDestroying) continue;

				// Calculate direction to player
				const directionX = playerPosition.x - position.x;
				const directionZ = playerPosition.z - position.z;
				const distance = Math.sqrt(directionX * directionX + directionZ * directionZ);

				// Skip if enemy is too close to player
				const minDistance = 10; // Minimum distance to player
				if (distance < minDistance) {
					// Damage player and mark for destruction
					if (!enemyComponent.isDestroying) {
						// Mark as destroying to avoid multiple hits
						enemyComponent.isDestroying = true;

						// Immediately stop movement
						velocity.x = 0;
						velocity.y = 0;
						velocity.z = 0;

						// Deal damage to player
						ecs.eventBus.publish('playerHit', {
							damage: enemyComponent.attackDamage * 0.1 // Reduced damage (10% of base)
						});

						// Create destruction effect and award score
						ecs.eventBus.publish('enemyDestroyed', {
							entityId: enemy.id,
							points: Math.floor(enemyComponent.scoreValue / 2) // Half points for enemies that reach the player
						});

						// Queue entity for destruction
						setTimeout(() => {
							ecs.eventBus.publish('entityDestroyed', {
								entityId: enemy.id
							});
						}, 500); // Increased delay for better visual effect
					}
				} else {
					// Normalize direction
					const normalizedDirX = directionX / distance;
					const normalizedDirZ = directionZ / distance;

					// Calculate rotation to face player (fixing direction)
					rotation.y = Math.atan2(normalizedDirX, normalizedDirZ);

					// Update velocity to move towards player
					// (matches rotation calculation direction)
					velocity.x = normalizedDirX * enemyComponent.speed;
					velocity.z = normalizedDirZ * enemyComponent.speed;
				}

				// Apply different behavior for air enemies
				if (enemyComponent.type === 'air') {
					// Add some vertical movement for air enemies
					position.y = 15 + Math.sin(performance.now() / 1000) * 3;
				}
			}
		})
		.bundle
		// Spawn system
		.addSystem('spawn-system')
		.setProcess((_queries, _deltaTime, ecs) => {
			const gameState = ecs.getResource('gameState');

			// Only spawn enemies if game is playing
			if (gameState.status !== 'playing') return;

			const waveManager = ecs.getResource('waveManager');
			const config = ecs.getResource('config');

			// Current time in seconds
			const currentTime = performance.now() / 1000;

			// Check if it's time to spawn a new enemy
			const timeSinceLastSpawn = currentTime - waveManager.lastSpawnTime;
			const spawnInterval = 1 / config.enemySpawnRate;

			if (timeSinceLastSpawn >= spawnInterval) {
				// Update last spawn time
				waveManager.lastSpawnTime = currentTime;

				// Check if we still need to spawn enemies for this wave
				if (waveManager.enemiesRemaining > 0) {
					// Count current enemies
					const enemies = ecs.entityManager.getEntitiesWithComponents(['enemy']);

					// Don't spawn more than max enemies at once
					if (enemies.length < config.maxEnemies) {
						// Randomly decide if ground or air enemy (70% ground, 30% air)
						const isGroundEnemy = Math.random() < 0.7;
						const enemyType = isGroundEnemy ? 'ground' : 'air';

						// Random angle for spawn position
						const angle = Math.random() * Math.PI * 2;
						const spawnDistance = 180 + Math.random() * 40; // 180-220 units from center

						// Calculate spawn position
						const spawnX = Math.sin(angle) * spawnDistance;
						const spawnZ = Math.cos(angle) * spawnDistance;

						// Spawn enemy
						ecs.eventBus.publish('enemySpawn', {
							type: enemyType,
							position: new Vector3(spawnX, 0, spawnZ)
						});
					}
				}
			}
		})
		.bundle;
}
