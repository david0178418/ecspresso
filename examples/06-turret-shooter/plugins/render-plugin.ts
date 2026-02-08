import { Group, Mesh, Vector3, Material, Object3D, SphereGeometry, MeshBasicMaterial } from 'three';
import { definePlugin } from '../types';
import {
	createTurret,
	createGroundEnemy,
	createAirEnemy,
	createRadarBlip,
	createExplosion
} from '../utils';

export default function createRenderPlugin() {
	return definePlugin({
		id: 'render-plugin',
		install(world) {
			// Automatically remove 3D models from the scene graph when the component
			// is removed (entity destruction, explicit removal, or replacement).
			world.registerDispose('model', (model) => {
				if (model.parent) {
					model.parent.remove(model);
				}
			});

			// Main renderer system
			world.addSystem('renderer')
				.inPhase('render')
				.addQuery('renderables', {
					with: [
						'position',
						'rotation',
						'model'
					]
				})
				.setProcess(({ renderables }, _deltaTime, _ecs) => {
					for (const entity of renderables) {
						const { position, rotation, model } = entity.components;

						// Update 3D object position and rotation
						if (!entity.components.player) {
							// Only update non-player objects' positions and rotations
							// The player/turret model doesn't need to move since the camera replaces it
							model.position.set(position.x, position.y, position.z);
							model.rotation.set(rotation.x, rotation.y, rotation.z);

							// Add visual feedback for enemies being destroyed
							if (entity.components.enemy && entity.components.enemy.isDestroying) {
								// Apply a pulsing scale effect during destruction
								const scale = 1 + Math.sin(performance.now() / 100) * 0.2;
								model.scale.set(scale, scale, scale);

								// Make it semi-transparent
								if (model.traverse) {
									model.traverse((child: Object3D) => {
										// Check if this is a mesh with material
										if ('isMesh' in child && (child as Mesh).isMesh) {
											const mesh = child as Mesh;

											if (mesh.material) {
												if (Array.isArray(mesh.material)) {
													mesh.material.forEach((mat: Material) => {
														if ('opacity' in mat) {
															mat.opacity = 0.6;
															mat.transparent = true;
														}
													});
												} else if ('opacity' in mesh.material) {
													mesh.material.opacity = 0.6;
													mesh.material.transparent = true;
												}
											}
										}
									});
								}
							}
						}
					}
				})
				.and()
				// 3D object factory system
				.addSystem('model-factory')
				.setEventHandlers({
					gameStart(_data, ecs) {
						const scene = ecs.getResource('scene');
						// const camera = ecs.getResource('camera');

						const turretModel = createTurret();
						// Make turret parts invisible in first-person view
						// In a first-person game, we typically don't see our own model
						turretModel.visible = false;
						scene.add(turretModel);

						// Create player turret entity
						ecs.spawn({
							model: turretModel,
							player: {
								health: 100,
								maxHealth: 100,
								lastShotTime: 0,
								fireRate: ecs.getResource('config').playerFireRate
							},
							position: {
								x: 0,
								y: 0,
								z: 0
							},
							rotation: {
								x: 0,
								y: 0,
								z: 0
							},
							scale: {
								x: 1,
								y: 1,
								z: 1
							},
							collider: {
								radius: 5
							}
						});

						// Create radar display - use a 2D HTML overlay instead of 3D for better visibility
						const gameContainer = document.getElementById('game-container');
						if (gameContainer) {
							// Create a radar container element
							const radarContainer = document.createElement('div');
							radarContainer.id = 'radar-overlay';
							radarContainer.style.position = 'absolute';
							radarContainer.style.bottom = '20px';
							radarContainer.style.right = '20px';
							radarContainer.style.width = '150px';
							radarContainer.style.height = '150px';
							radarContainer.style.borderRadius = '50%';
							radarContainer.style.backgroundColor = 'rgba(0, 20, 0, 0.7)';
							radarContainer.style.border = '2px solid #00ff00';
							radarContainer.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.5)';
							radarContainer.style.overflow = 'hidden';
							radarContainer.style.zIndex = '100';

							// Add central point
							const centerPoint = document.createElement('div');
							centerPoint.style.position = 'absolute';
							centerPoint.style.left = '50%';
							centerPoint.style.top = '50%';
							centerPoint.style.width = '6px';
							centerPoint.style.height = '6px';
							centerPoint.style.borderRadius = '50%';
							centerPoint.style.backgroundColor = '#00ff00';
							centerPoint.style.transform = 'translate(-50%, -50%)';
							radarContainer.appendChild(centerPoint);

							// Add radar "sweep" animation - triangle shape with trailing fade
							const radarSweep = document.createElement('div');
							radarSweep.id = 'radar-sweep';
							radarSweep.style.position = 'absolute';
							radarSweep.style.left = '0';
							radarSweep.style.top = '0';
							radarSweep.style.width = '150px'; // Full radar diameter
							radarSweep.style.height = '150px'; // Full radar diameter
							radarSweep.style.transformOrigin = '50% 50%'; // Set origin to center of radar
							radarSweep.style.transform = 'rotate(0deg)';
							radarSweep.style.animation = 'radar-sweep 4s linear infinite';
							radarSweep.style.zIndex = '125';

							// Create a simple triangle with gradient - flipped direction
							radarSweep.style.background = 'conic-gradient(from 0deg at 50% 50%, rgba(0, 255, 0, 0) 0deg, rgba(0, 255, 0, 0.8) 30deg)';
							radarSweep.style.clipPath = 'polygon(50% 50%, 100% 0%, 50% 0%)'; // Triangle from center to top-right to top-center

							// Add CSS animation for the radar sweep
							const style = document.createElement('style');
							style.textContent = `
								@keyframes radar-sweep {
									from { transform: rotate(0deg); }
									to { transform: rotate(360deg); }
								}
							`;
							document.head.appendChild(style);

							// Remove the previous animation style if it exists
							const existingStyle = document.querySelector('style');
							if (existingStyle && existingStyle !== style) {
								existingStyle.remove();
							}

							radarContainer.appendChild(radarSweep);

							// Add grid lines
							const gridLine1 = document.createElement('div');
							gridLine1.style.position = 'absolute';
							gridLine1.style.left = '50%';
							gridLine1.style.top = '0';
							gridLine1.style.width = '1px';
							gridLine1.style.height = '100%';
							gridLine1.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
							gridLine1.style.transform = 'translateX(-50%)';
							radarContainer.appendChild(gridLine1);

							const gridLine2 = document.createElement('div');
							gridLine2.style.position = 'absolute';
							gridLine2.style.left = '0';
							gridLine2.style.top = '50%';
							gridLine2.style.width = '100%';
							gridLine2.style.height = '1px';
							gridLine2.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
							gridLine2.style.transform = 'translateY(-50%)';
							radarContainer.appendChild(gridLine2);

							// Add circular grid
							const circleGrid = document.createElement('div');
							circleGrid.style.position = 'absolute';
							circleGrid.style.left = '50%';
							circleGrid.style.top = '50%';
							circleGrid.style.width = '100px';
							circleGrid.style.height = '100px';
							circleGrid.style.borderRadius = '50%';
							circleGrid.style.border = '1px solid rgba(0, 255, 0, 0.3)';
							circleGrid.style.transform = 'translate(-50%, -50%)';
							radarContainer.appendChild(circleGrid);

							const circleGrid2 = document.createElement('div');
							circleGrid2.style.position = 'absolute';
							circleGrid2.style.left = '50%';
							circleGrid2.style.top = '50%';
							circleGrid2.style.width = '50px';
							circleGrid2.style.height = '50px';
							circleGrid2.style.borderRadius = '50%';
							circleGrid2.style.border = '1px solid rgba(0, 255, 0, 0.3)';
							circleGrid2.style.transform = 'translate(-50%, -50%)';
							radarContainer.appendChild(circleGrid2);

							// Add player direction indicator (a small triangle pointing up)
							const playerIndicator = document.createElement('div');
							playerIndicator.id = 'player-direction';
							playerIndicator.style.position = 'absolute';
							playerIndicator.style.left = '50%';
							playerIndicator.style.top = '50%';
							playerIndicator.style.width = '0';
							playerIndicator.style.height = '0';
							playerIndicator.style.borderLeft = '8px solid transparent';
							playerIndicator.style.borderRight = '8px solid transparent';
							playerIndicator.style.borderBottom = '16px solid #00ff00';
							playerIndicator.style.transform = 'translate(-50%, -50%)';
							playerIndicator.style.zIndex = '160';
							radarContainer.appendChild(playerIndicator);

							// Add the radar container to the game container
							gameContainer.appendChild(radarContainer);

							// Store the radar container reference
							ecs.getResource('uiElements').radarElement = radarContainer;
						}
					},
					playerShoot(data, ecs) {
						const scene = ecs.getResource('scene');
						const camera = ecs.getResource('camera');
						// const config = ecs.getResource('config');

						// SIMPLEST POSSIBLE PROJECTILE - directly in front of camera
						const projectileGroup = new Group();
						scene.add(projectileGroup);

						// Create a very bright, large sphere
						const projectileGeometry = new SphereGeometry(0.25, 16, 16);
						const projectileMaterial = new MeshBasicMaterial({ color: 0xff0000 });
						const projectile = new Mesh(projectileGeometry, projectileMaterial);
						projectileGroup.add(projectile);

						// Position directly in front of camera
						projectileGroup.position.copy(camera.position);

						// Add the direction from the camera
						const direction = data.direction || new Vector3(0, 0, -1);

						// Place it 5 units in front initially so it's visible
						projectileGroup.position.x += direction.x * 5;
						projectileGroup.position.y += direction.y * 5;
						projectileGroup.position.z += direction.z * 5;

						// Debug message to console only (not visible to player)
						console.log('Firing projectile in direction:', direction);

						// SUPER SIMPLE ANIMATION
						let distance = 0;
						const maxDistance = 100;
						const speed = 3;

						function animate() {
							// Check if game is paused
							const gameState = ecs.getResource('gameState');
							if (gameState.status !== 'playing') {
								// If paused, keep animation loop running but don't move projectile
								requestAnimationFrame(animate);
								return;
							}

							// Move in the direction vector
							projectileGroup.position.x += direction.x * speed;
							projectileGroup.position.y += direction.y * speed;
							projectileGroup.position.z += direction.z * speed;

							distance += speed;

							// Check for max distance
							if (distance >= maxDistance) {
								scene.remove(projectileGroup);
								return;
							}

							// Check for collisions with enemies
							const enemyEntities = ecs.entityManager.getEntitiesWithQuery(['enemy', 'position']);
							for (const enemy of enemyEntities) {
								if (!enemy.components.collider) continue;

								const enemyPos = enemy.components.position;
								const dx = projectileGroup.position.x - enemyPos.x;
								const dy = projectileGroup.position.y - enemyPos.y;
								const dz = projectileGroup.position.z - enemyPos.z;
								const distanceToEnemy = Math.sqrt(dx*dx + dy*dy + dz*dz);

								// Increase collision radius for better hit detection
								// We're reducing this by 50% to match the smaller projectile
								const collisionRadius = enemy.components.collider.radius + 2.5;

								if (distanceToEnemy < collisionRadius) {
									// Hit an enemy
									console.log('Hit enemy!', {
										enemyId: enemy.id,
										enemyType: enemy.components.enemy.type
									});

									// Damage the enemy
									if (enemy.components.enemy) {
										// Force damage to be enough to destroy in one hit
										const requiredDamage = Math.max(enemy.components.enemy.health, 100);
										enemy.components.enemy.health -= requiredDamage;

										// Check if enemy destroyed - force destroy if health is very low
										if (enemy.components.enemy.health <= 0) {
											// Create explosion effect at enemy position
											const enemyPosition = new Vector3(
												enemy.components.position.x,
												enemy.components.position.y,
												enemy.components.position.z
											);
											createExplosion(scene, enemyPosition);

											// Mark enemy as destroying to prevent multiple hits
											enemy.components.enemy.isDestroying = true;

											// Publish the enemy destroyed event
											ecs.eventBus.publish('enemyDestroyed', {
												entityId: enemy.id,
												points: enemy.components.enemy.scoreValue
											});

											// Also publish entityDestroyed to ensure removal
											ecs.eventBus.publish('entityDestroyed', {
												entityId: enemy.id
											});
										}
									}

									// Remove projectile
									scene.remove(projectileGroup);
									return;
								}
							}

							requestAnimationFrame(animate);
						}

						// Start animation
						animate();
					},
					enemySpawn(data, ecs) {
						const scene = ecs.getResource('scene');

						// Create enemy model based on type
						const enemyModel = data.type === 'ground'
							? createGroundEnemy()
							: createAirEnemy();

						scene.add(enemyModel);

						// Set position based on spawn data
						const position = {
							x: data.position.x,
							y: data.type === 'ground' ? 1.5 : 15, // Ground or air height
							z: data.position.z
						};

						// Calculate rotation to face the player (center)
						const angle = Math.atan2(-position.x, -position.z);

						// Create enemy entity
						const enemyEntity = ecs.spawn({
							model: enemyModel,
							position,
							rotation: {
								x: 0,
								y: angle,
								z: 0
							},
							scale: {
								x: 1,
								y: 1,
								z: 1
							},
							velocity: {
								x: 0,
								y: 0,
								z: 0
							},
							enemy: {
								type: data.type,
								health: data.type === 'ground' ? 30 : 15,
								speed: data.type === 'ground' ? 0.02 : 0.03,
								attackDamage: data.type === 'ground' ? 15 : 10,
								scoreValue: data.type === 'ground' ? 100 : 150,
								isDestroying: false
							},
							collider: {
								radius: data.type === 'ground' ? 3 : 2
							}
						});

						// Add radar blip for this enemy
						const blipModel = createRadarBlip(data.type);

						// Handle radar blip for first-person view
						const camera = ecs.getResource('camera');
						// Find radar in children of camera
						const radarObject = camera.children.find(child => child.name === 'radar');

						if (radarObject) {
							radarObject.add(blipModel);
						} else {
							// Fallback to scene if radar not found
							scene.add(blipModel);
						}

						ecs.spawn({
							model: blipModel,
							position: {
								x: 0,
								y: 0.1,
								z: 0
							},
							rotation: {
								x: 0,
								y: 0,
								z: 0
							},
							scale: {
								x: 1,
								y: 1,
								z: 1
							},
							radarBlip: {
								type: data.type,
								distance: Math.sqrt(position.x * position.x + position.z * position.z),
								angle: angle
							}
						});

						// Spawn enemy - create blip on HTML radar
						const radarContainer = document.getElementById('radar-overlay');
						if (radarContainer) {
							// Create a blip element for this enemy
							const blip = document.createElement('div');
							blip.classList.add('radar-blip');
							blip.setAttribute('data-entity-id', enemyEntity.id.toString());
							blip.setAttribute('data-enemy-type', data.type);

							// Set blip position based on enemy position relative to player (center of radar)
							// Calculate distance and direction from center
							const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
							const maxDistance = 200; // Maximum radar range
							const normalizedDistance = Math.min(distanceFromCenter, maxDistance) / maxDistance;

							// Calculate angle from center and position accordingly
							const radarRadius = 75; // Half of radar diameter
							const blipSize = 8;
							const blipX = Math.sin(angle) * normalizedDistance * radarRadius;
							const blipZ = Math.cos(angle) * normalizedDistance * radarRadius;

							// Position the blip in the radar
							blip.style.position = 'absolute';
							blip.style.width = `${blipSize}px`;
							blip.style.height = `${blipSize}px`;
							blip.style.borderRadius = '50%';
							blip.style.backgroundColor = data.type === 'ground' ? '#ff3333' : '#3333ff';
							blip.style.left = `${50 + blipX}%`;
							blip.style.top = `${50 + blipZ}%`;
							blip.style.transform = 'translate(-50%, -50%)';
							blip.style.boxShadow = data.type === 'ground'
								? '0 0 5px #ff0000'
								: '0 0 5px #0000ff';

							// Add to radar
							radarContainer.appendChild(blip);
						}
					},
					entityDestroyed(data, ecs) {
						// Handle cleanup of radar blips in HTML radar
						const radarContainer = document.getElementById('radar-overlay');
						if (radarContainer) {
							const blipElement = radarContainer.querySelector(`.radar-blip[data-entity-id="${data.entityId}"]`);
							if (blipElement) {
								radarContainer.removeChild(blipElement);
							}
						}

						// Remove the entity from the ECS
						// (model cleanup is handled automatically by registerDispose)
						ecs.entityManager.removeEntity(data.entityId);
					}
				})
				.and();
		},
	});
}
