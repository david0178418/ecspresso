import { definePlugin } from '../types';

export default function createUIPlugin() {
	return definePlugin({
		id: 'ui-plugin',
		install(world) {
			// Radar system
			world.addSystem('radar-system')
				.setProcess((_queries, _deltaTime, ecs) => {
					const gameState = ecs.getResource('gameState');
					const radarContainer = document.getElementById('radar-overlay');

					// Handle radar animation based on game state
					if (radarContainer) {
						const radarSweep = document.getElementById('radar-sweep') as HTMLDivElement;
						if (radarSweep) {
							// Pause animation when game is not playing
							if (gameState.status !== 'playing') {
								radarSweep.style.animationPlayState = 'paused';
							} else {
								radarSweep.style.animationPlayState = 'running';
							}
						}
					}

					// Skip other radar updates if game is paused
					if (gameState.status !== 'playing') return;

					// Get radar container element
					if (!radarContainer) return;

					// Get player entity and rotation
					const playerEntities = ecs.entityManager.getEntitiesWithQuery(['player', 'rotation']);
					if (playerEntities.length === 0) return;

					const player = playerEntities[0];
					if (!player) return; // Ensure player exists

					const playerRotation = player.components.rotation;
					const playerFacing = playerRotation.y; // Horizontal rotation angle

					// Get all enemies
					const enemyEntities = ecs.entityManager.getEntitiesWithQuery(['enemy', 'position']);

					// Update or create blips for each enemy
					for (const enemy of enemyEntities) {
						if (enemy.components.enemy.isDestroying) continue;

						const position = enemy.components.position;
						const enemyType = enemy.components.enemy.type;

						// Calculate distance from player (center)
						const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
						const maxDistance = 200; // Maximum radar range
						const normalizedDistance = Math.min(distanceFromCenter, maxDistance) / maxDistance;

						// Calculate absolute angle from center to enemy
						const absoluteAngle = Math.atan2(position.x, position.z);

						// Calculate relative angle (subtract player's facing direction)
						// This makes straight ahead (player facing) always point up on the radar
						let relativeAngle = absoluteAngle - playerFacing;

						// Normalize angle to be between -PI and PI
						while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
						while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

						// Calculate radar position based on relative angle
						// X is sin, Z is cos (for a top-down view where up is player facing direction)
						const radarRadius = 75; // Half of radar diameter
						const blipX = Math.sin(relativeAngle) * normalizedDistance * radarRadius;
						const blipZ = Math.cos(relativeAngle) * normalizedDistance * radarRadius; // Positive cos to make forward be up (not negative)

						// Find existing blip or create new one
						let blip = radarContainer.querySelector(`.radar-blip[data-entity-id="${enemy.id}"]`) as HTMLDivElement;

						if (!blip) {
							// Create new blip
							blip = document.createElement('div');
							blip.classList.add('radar-blip');
							blip.setAttribute('data-entity-id', enemy.id.toString());
							blip.setAttribute('data-enemy-type', enemyType);

							// Style the blip
							blip.style.position = 'absolute';
							blip.style.width = '12px'; // Larger blips
							blip.style.height = '12px';
							blip.style.borderRadius = '50%';
							blip.style.backgroundColor = enemyType === 'ground' ? '#ff3333' : '#3333ff';
							blip.style.boxShadow = enemyType === 'ground'
								? '0 0 8px #ff0000'
								: '0 0 8px #0000ff';
							blip.style.zIndex = '150';

							// Add to radar
							radarContainer.appendChild(blip);
						}

						// Update blip position
						blip.style.left = `${50 + blipX}%`;
						blip.style.top = `${50 + blipZ}%`;
						blip.style.transform = 'translate(-50%, -50%)';
					}
				});
		},
	});
}
