import {
	Scene,
	WebGLRenderer,
	PerspectiveCamera,
} from 'three';
import { definePlugin, type Resources } from '../types';
import { createGround, createSkybox, createUIElement, setupLighting } from '../utils';

export default async function createInitPlugin() {
	// Create Three.js renderer
	const renderer = new WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;

	// Create scene
	const scene = new Scene();

	// Create first-person camera (positioned at the turret's viewpoint)
	const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
	camera.position.set(0, 5, 0); // Position at turret height
	camera.lookAt(0, 5, -10); // Look forward

	return definePlugin({
		id: 'init-plugin',
		install(world) {
			world
				.addResource('renderer', renderer)
				.addResource('scene', scene)
				.addResource('camera', camera);

			world.addSystem('init')
				.setOnInitialize((ecs) => {
					// Append renderer to DOM
					document.getElementById('game-container')?.appendChild(renderer.domElement);

					// Add a reticle/crosshair for aiming
					const reticle = document.createElement('div');
					reticle.id = 'reticle';
					reticle.style.position = 'absolute';
					reticle.style.top = '50%';
					reticle.style.left = '50%';
					reticle.style.transform = 'translate(-50%, -50%)';
					reticle.style.width = '20px';
					reticle.style.height = '20px';
					reticle.style.borderRadius = '50%';
					reticle.style.border = '2px solid white';
					reticle.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
					reticle.style.pointerEvents = 'none'; // Don't block clicks
					reticle.style.zIndex = '1000';

					// Add a dot in the middle
					const centerDot = document.createElement('div');
					centerDot.style.position = 'absolute';
					centerDot.style.top = '50%';
					centerDot.style.left = '50%';
					centerDot.style.transform = 'translate(-50%, -50%)';
					centerDot.style.width = '4px';
					centerDot.style.height = '4px';
					centerDot.style.borderRadius = '50%';
					centerDot.style.backgroundColor = 'red';
					reticle.appendChild(centerDot);

					document.getElementById('game-container')?.appendChild(reticle);

					// Handle window resize
					window.addEventListener('resize', () => {
						camera.aspect = window.innerWidth / window.innerHeight;
						camera.updateProjectionMatrix();
						renderer.setSize(window.innerWidth, window.innerHeight);
					});

					// Initialize assets object
					const assets: Resources['assets'] = {
						models: {},
						textures: {}
					};

					// Add ground to scene
					const ground = createGround();
					scene.add(ground);

					// Add skybox to scene
					const skybox = createSkybox();
					scene.add(skybox);

					// Setup lighting
					setupLighting(scene);

					// Create UI elements
					const scoreElement = createUIElement('score', 'Score: 0', '20px', '20px');
					const healthElement = createUIElement('health', 'Health: 100/100', '20px', '60px');
					const waveElement = createUIElement('wave', 'Wave: 1', '20px', '100px');
					const messageElement = createUIElement('message', 'READY', '50%', '25%');
					messageElement.style.transform = 'translate(-50%, -50%)';
					messageElement.style.fontSize = '32px';
					messageElement.style.opacity = '0';

					// Initialize resources
					ecs
						.addResource('assets', assets)
						.addResource('gameState', {
							status: 'ready',
							wave: 1,
							score: 0
						})
						.addResource('input', {
							mousePosition: { x: 0, y: 0 },
							mouseButtons: { left: false, right: false, middle: false },
							keys: {}
						})
						.addResource('config', {
							playerFireRate: 10,
							playerProjectileSpeed: 0.03,
							playerProjectileDamage: 100,
							maxEnemies: 20,
							enemySpawnRate: 1,
							waveCount: 5,
							enemiesPerWave: 15
						})
						.addResource('waveManager', {
							currentWave: 1,
							enemiesRemaining: 15,
							waveStartTime: 0
						})
						.addResource('uiElements', {
							scoreElement,
							healthElement,
							waveElement,
							messageElement,
							radarElement: null
						})
						.addResource('radar', {
							range: 100,
							updateFrequency: 0.5,
							lastUpdateTime: 0
						});
				})
				.setEventHandlers({
					// Initialize the game when gameInit event is fired
					gameInit(_, ecs) {
						// Start animation loop
						const renderer = ecs.getResource('renderer');
						const scene = ecs.getResource('scene');
						const camera = ecs.getResource('camera');

						// Animation loop
						function animate(time: number) {
							requestAnimationFrame(animate);
							// Convert time to seconds for the ECS update
							ecs.update(time / 1000);
							// Render the scene
							renderer.render(scene, camera);
						}

						// Start animation loop
						animate(0);

						// Show ready message
						const uiElements = ecs.getResource('uiElements');
						if (uiElements.messageElement) {
							uiElements.messageElement.style.top = '25%';
							uiElements.messageElement.style.opacity = '1';
							setTimeout(() => {
								if (uiElements.messageElement) {
									uiElements.messageElement.style.opacity = '0';
									// Start the game after message disappears
									setTimeout(() => {
										ecs.eventBus.publish('gameStart', true);
									}, 500);
								}
							}, 2000);
						}
					},
				});
		},
	});
}
