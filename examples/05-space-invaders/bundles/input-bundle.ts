import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';

type InputKey = 'left' | 'right' | 'shoot';

const keyToInput: Record<string, InputKey> = {
	'ArrowLeft': 'left',
	'KeyA': 'left',
	'ArrowRight': 'right',
	'KeyD': 'right',
	'Space': 'shoot',
};

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

					// Handle movement and shoot keys
					const inputKey = keyToInput[data.key];
					if (inputKey) {
						input[inputKey] = data.pressed;

						// Fire on shoot press during gameplay
						if (inputKey === 'shoot' && data.pressed && gameState.status === 'playing') {
							ecs.eventBus.publish('playerShoot', {});
						}
						return;
					}

					// Handle pause key
					if (data.key === 'KeyP' && data.pressed) {
						input.pause = !input.pause;

						const statusToEvent: Record<string, () => void> = {
							'playing': () => ecs.eventBus.publish('gamePause'),
							'paused': () => ecs.eventBus.publish('gameResume'),
							'ready': () => ecs.eventBus.publish('gameStart'),
						};

						statusToEvent[gameState.status]?.();
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
