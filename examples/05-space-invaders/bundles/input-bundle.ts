import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';

export default function createInputBundle(): Bundle<Components, Events, Resources> {
	return new Bundle<Components, Events, Resources>('input-bundle')
		.addResource('input', {
			left: false,
			right: false,
			shoot: false,
			pause: false,
		})
		.addSystem('input-handling')
		.setOnInitialize(({ eventBus }) => {
			window.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.repeat) return;

				eventBus.publish('inputUpdate', {
					key: e.code,
					pressed: true,
				});
			});
			window.addEventListener('keyup', (e: KeyboardEvent) => {
				eventBus.publish('inputUpdate', {
					key: e.code,
					pressed: false,
				});
			});
		})
		.setEventHandlers({
			inputUpdate: {
				handler(data, ecs) {
					const input = ecs.getResource('input');
					const gameState = ecs.getResource('gameState');

					switch (data.key) {
						case 'ArrowLeft':
						case 'KeyA':
							input.left = data.pressed;
							break;
						case 'ArrowRight':
						case 'KeyD':
							input.right = data.pressed;
							break;
						case 'Space':
							input.shoot = data.pressed;

							if (data.pressed && gameState.status === 'playing') {
								ecs.eventBus.publish('playerShoot', {});
							}

							break;
						case 'KeyP':
							// Toggle pause on key down (not on key up)
							if(!data.pressed) return;

							input.pause = !input.pause;

							if (gameState.status === 'playing') {
								ecs.eventBus.publish('gamePause');
							} else if (gameState.status === 'paused') {
								ecs.eventBus.publish('gameResume');
							} else if (gameState.status === 'ready') {
								ecs.eventBus.publish('gameStart');
							}
							break;
					}
				}
			},

			// Reset input state on game init
			gameInit: {
				handler(_data, ecs) {
					const input = ecs.getResource('input');
					input.left = false;
					input.right = false;
					input.shoot = false;
					input.pause = false;
				}
			}
		})
		.bundle;
}
