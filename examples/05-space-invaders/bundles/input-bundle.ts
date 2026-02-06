import { createInputBundle as createLibInputBundle } from '../../../src/bundles/input';
import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';

/**
 * Returns the library input bundle pre-configured with Space Invaders key bindings.
 */
export function createInputBundle() {
	return createLibInputBundle({
		actions: {
			moveLeft: { keys: ['ArrowLeft', 'a'] },
			moveRight: { keys: ['ArrowRight', 'd'] },
			shoot: { keys: [' '] },
			pause: { keys: ['p'] },
		},
	});
}

/**
 * Game-specific input processing bundle.
 * Polls inputState each frame and publishes game events (shoot, pause/resume/start).
 */
export default function createInputProcessingBundle(): Bundle<Components, Events, Resources> {
	return new Bundle<Components, Events, Resources>('input-processing-bundle')
		.addSystem('input-actions')
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
		.bundle;
}
