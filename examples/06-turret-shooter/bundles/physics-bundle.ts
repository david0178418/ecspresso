import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';

export default function createPhysicsBundle() {
	return new Bundle<Components, Events, Resources>('physics-bundle')
		// Movement system
		.addSystem('movement')
		.addQuery('movables', {
			with: [
				'position',
				'velocity'
			]
		})
		.setProcess(({ movables }, deltaTime, ecs) => {
			// Check if game is paused
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'playing') return;

			for (const entity of movables) {
				const { position, velocity } = entity.components;

				// Apply velocity to position
				position.x += velocity.x * deltaTime;
				position.y += velocity.y * deltaTime;
				position.z += velocity.z * deltaTime;
			}
		})
		.bundle;
}
