import { createInputPlugin as createLibInputPlugin } from '../../../src/plugins/input';
import { definePlugin } from '../types';

/**
 * Returns the library input plugin pre-configured with Space Invaders key bindings.
 */
export function createInputPlugin() {
	return createLibInputPlugin({
		actions: {
			moveLeft: { keys: ['ArrowLeft', 'a'] },
			moveRight: { keys: ['ArrowRight', 'd'] },
			shoot: { keys: [' '] },
			pause: { keys: ['p'] },
		},
	});
}

/**
 * Game-specific input processing plugin.
 * Polls inputState each frame and publishes game events (shoot, pause/resume/start).
 */
export default function createInputProcessingPlugin() {
	return definePlugin({
		id: 'input-processing-plugin',
		install(world) {
			world.addSystem('input-actions')
				.inPhase('preUpdate')
				.inGroup('gameplay')
				.setPriority(90)
				.setProcess((_queries, _dt, ecs) => {
					const input = ecs.getResource('inputState');
					const gameState = ecs.getResource('gameState');

					if (input.actions.justActivated('shoot') && gameState.status === 'playing') {
						ecs.eventBus.publish('playerShoot', {});
					}
				})
				.and()

				.addSystem('pause-handling')
				.inPhase('preUpdate')
				.setPriority(90)
				.setProcess((_queries, _dt, ecs) => {
					const input = ecs.getResource('inputState');
					const gameState = ecs.getResource('gameState');

					if (!input.actions.justActivated('pause')) return;

					const statusToEvent: Record<string, () => void> = {
						'playing': () => ecs.eventBus.publish('gamePause', true),
						'paused': () => ecs.eventBus.publish('gameResume', true),
						'ready': () => ecs.eventBus.publish('gameStart', true),
					};

					statusToEvent[gameState.status]?.();
				})
				.and();
		},
	});
}
