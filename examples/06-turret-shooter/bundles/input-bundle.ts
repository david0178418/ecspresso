import { Vector3, Euler, Quaternion } from 'three';
import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';

export default function createInputBundle() {
	return new Bundle<Components, Events, Resources>('input-bundle')
		.addSystem('input-handler')
		.setOnInitialize((ecs) => {
			// Track mouse movement for camera rotation
			let mouseX = 0;
			let mouseY = 0;
			let targetRotationY = 0; // Horizontal rotation (around Y axis)
			let targetRotationX = 0; // Vertical rotation (around X axis)
			const verticalLimit = Math.PI / 2; // 90 degrees limit

			// Add continuous fire check
			function checkContinuousFire() {
				const gameState = ecs.getResource('gameState');
				const input = ecs.getResource('input');

				// Only fire if game is playing and left mouse button is held
				if (gameState.status === 'playing' && input.mouseButtons.left) {
					handleShoot(ecs);
				}

				// Continue checking
				requestAnimationFrame(checkContinuousFire);
			}

			// Start continuous fire check
			checkContinuousFire();

			// Lock pointer for first-person control
			const lockPointer = () => {
				const container = document.getElementById('game-container');
				if (container) {
					container.requestPointerLock = container.requestPointerLock ||
						(container as any).mozRequestPointerLock ||
						(container as any).webkitRequestPointerLock;
					container.requestPointerLock();
				}
			};

			// Handle pointer lock change
			document.addEventListener('pointerlockchange', () => {
				const isLocked = document.pointerLockElement === document.getElementById('game-container');
				if (isLocked && ecs.getResource('gameState').status === 'playing') {
					// Pointer is locked, enable mouse movement
				} else {
					// Pointer is unlocked, pause game if playing
					if (ecs.getResource('gameState').status === 'playing') {
						ecs.eventBus.publish('gamePause', true);
					}
				}
			});

			// Mouse movement handling for first-person view
			const onMouseMove = (event: MouseEvent) => {
				// Only process if game is playing
				if (ecs.getResource('gameState').status !== 'playing') return;

				// Check if pointer is locked
				if (document.pointerLockElement === document.getElementById('game-container')) {
					// Update based on mouse movement deltas (for pointer lock)
					mouseX += event.movementX * 0.002; // Adjust sensitivity
					mouseY -= event.movementY * 0.002;

					// Limit vertical rotation to prevent flipping
					mouseY = Math.max(-verticalLimit, Math.min(verticalLimit * 0.8, mouseY));

					// Update target rotations
					targetRotationY = -mouseX; // Horizontal rotation
					targetRotationX = mouseY; // Vertical rotation

					// Get player and camera
					const playerEntities = ecs.entityManager.getEntitiesWithComponents(['player', 'rotation']);
					const camera = ecs.getResource('camera');

					if (playerEntities.length > 0) {
						const player = playerEntities[0];
						if (!player) return;

						// Update player rotation
						player.components.rotation.y = targetRotationY;
						player.components.rotation.x = targetRotationX;

						// Update camera rotation to match player
						const euler = new Euler(targetRotationX, targetRotationY, 0, 'YXZ');
						camera.quaternion.setFromEuler(euler);

						// Publish mouse move event
						ecs.eventBus.publish('inputMouseMove', {
							x: mouseX,
							y: mouseY
						});
					}
				} else {
					// Update mouse position for regular cursor
					const input = ecs.getResource('input');
					input.mousePosition.x = event.clientX;
					input.mousePosition.y = event.clientY;
				}
			};

			// Mouse button handling
			const onMouseDown = (event: MouseEvent) => {
				// Update mouse button state
				const input = ecs.getResource('input');
				if (event.button === 0) input.mouseButtons.left = true;
				if (event.button === 1) input.mouseButtons.middle = true;
				if (event.button === 2) input.mouseButtons.right = true;

				// Lock pointer on click if game is active
				if (ecs.getResource('gameState').status === 'playing' &&
					document.pointerLockElement !== document.getElementById('game-container')) {
					lockPointer();
					return;
				}

				// Fire on left click if game is active and pointer is locked
				if (event.button === 0 &&
					ecs.getResource('gameState').status === 'playing' &&
					document.pointerLockElement === document.getElementById('game-container')) {
					handleShoot(ecs);
				}

				// Publish mouse down event
				ecs.eventBus.publish('inputMouseDown', {
					button: event.button
				});
			};

			const onMouseUp = (event: MouseEvent) => {
				// Update mouse button state
				const input = ecs.getResource('input');
				if (event.button === 0) input.mouseButtons.left = false;
				if (event.button === 1) input.mouseButtons.middle = false;
				if (event.button === 2) input.mouseButtons.right = false;

				// Publish mouse up event
				ecs.eventBus.publish('inputMouseUp', {
					button: event.button
				});
			};

			// Keyboard handling
			const onKeyDown = (event: KeyboardEvent) => {
				const input = ecs.getResource('input');
				input.keys[event.key] = true;

				// Handle game state changes
				if (event.key === 'p' || event.key === 'Escape') {
					const gameState = ecs.getResource('gameState');
					if (gameState.status === 'playing') {
						ecs.eventBus.publish('gamePause', true);
						// Exit pointer lock
						document.exitPointerLock();
					} else if (gameState.status === 'paused') {
						ecs.eventBus.publish('gameResume', true);
						// Lock pointer again
						lockPointer();
					}
				}

				// Handle shooting with space
				if (event.key === ' ' && ecs.getResource('gameState').status === 'playing') {
					handleShoot(ecs);
				}

				// Publish key down event
				ecs.eventBus.publish('inputKeyDown', {
					key: event.key
				});
			};

			const onKeyUp = (event: KeyboardEvent) => {
				const input = ecs.getResource('input');
				input.keys[event.key] = false;

				// Publish key up event
				ecs.eventBus.publish('inputKeyUp', {
					key: event.key
				});
			};

			// Disable context menu on right-click
			const onContextMenu = (event: MouseEvent) => {
				event.preventDefault();
				return false;
			};

			// Register event listeners
			window.addEventListener('mousemove', onMouseMove);
			window.addEventListener('mousedown', onMouseDown);
			window.addEventListener('mouseup', onMouseUp);
			window.addEventListener('keydown', onKeyDown);
			window.addEventListener('keyup', onKeyUp);
			window.addEventListener('contextmenu', onContextMenu);

			// Store event listener references for cleanup
			ecs.addResource('eventListeners', {
				mousemove: onMouseMove,
				mousedown: onMouseDown,
				mouseup: onMouseUp,
				keydown: onKeyDown,
				keyup: onKeyUp,
				contextmenu: onContextMenu
			});

			// Add click handler to game container for pointer lock
			const container = document.getElementById('game-container');
			if (container) {
				container.addEventListener('click', () => {
					if (ecs.getResource('gameState').status === 'playing' &&
						document.pointerLockElement !== container) {
						lockPointer();
					}
				});
			}
		})
		.setOnDetach((ecs) => {
			// Clean up event listeners when system is detached
			const listeners = ecs.getResource('eventListeners');

			window.removeEventListener('mousemove', listeners.mousemove);
			window.removeEventListener('mousedown', listeners.mousedown);
			window.removeEventListener('mouseup', listeners.mouseup);
			window.removeEventListener('keydown', listeners.keydown);
			window.removeEventListener('keyup', listeners.keyup);
			window.removeEventListener('contextmenu', listeners.contextmenu);

			// Exit pointer lock if active
			if (document.pointerLockElement) {
				document.exitPointerLock();
			}
		})
		.bundle;
}

// Helper function to handle shooting
function handleShoot(ecs: any) {
	const playerEntities = ecs.entityManager.getEntitiesWithComponents(['player']);
	if (playerEntities.length === 0) return;

	const playerEntity = playerEntities[0];
	if (!playerEntity) return;

	const player = playerEntity.components.player;
	const currentTime = performance.now() / 1000; // Convert to seconds

	// Check if enough time has passed since last shot (rate limiting)
	if (currentTime - player.lastShotTime >= 1 / player.fireRate) {
		// Update last shot time
		player.lastShotTime = currentTime;

		// Get player rotation
		const rotation = playerEntity.components.rotation;

		// Calculate forward direction based on camera rotation (both horizontal and vertical)
		const direction = new Vector3(0, 0, -1);

		// Apply rotations in the correct order - first Y (horizontal), then X (vertical)
		const rotationQuaternion = new Quaternion()
			.setFromEuler(new Euler(rotation.x, rotation.y, 0, 'YXZ'));

		direction.applyQuaternion(rotationQuaternion);

		// Add random spread (1 degree = 0.0174 radians)
		const spreadAngle = 0.0174;
		const randomAngle = Math.random() * spreadAngle;
		// const randomRotation = Math.random() * Math.PI * 2; // Random rotation around the cone

		// Create a random vector perpendicular to the direction
		const perpendicular = new Vector3(
			Math.random() - 0.5,
			Math.random() - 0.5,
			Math.random() - 0.5
		).cross(direction).normalize();

		// Rotate the perpendicular vector around the direction
		const rotationAxis = new Vector3().crossVectors(direction, perpendicular);
		const spreadQuaternion = new Quaternion().setFromAxisAngle(rotationAxis, randomAngle);
		perpendicular.applyQuaternion(spreadQuaternion);

		// Apply the spread to the direction
		direction.add(perpendicular.multiplyScalar(Math.sin(randomAngle)));
		direction.normalize();

		// Fire projectile
		ecs.eventBus.publish('playerShoot', {
			direction
		});
	}
}
