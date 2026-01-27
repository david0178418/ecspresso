import Bundle from '../../../src/bundle';
import type { Components, Events, Resources } from '../types';

export default function createPhysicsBundle() {
	return new Bundle<Components, Events, Resources>('physics-bundle')
		// Movement system - in gameplay group so it pauses automatically
		.addSystem('movement')
		.inGroup('gameplay')
		.addQuery('movables', {
			with: ['position', 'velocity']
		})
		.setProcess(({ movables }, deltaTime, _ecs) => {
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
