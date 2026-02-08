import { definePlugin } from '../../../src/plugin';
import type { Components, Events, Resources } from '../types';

export default function createPhysicsPlugin() {
	return definePlugin<Components, Events, Resources>({
		id: 'physics-plugin',
		install(world) {
			// Movement system - in gameplay group so it pauses automatically
			world.addSystem('movement')
				.inGroup('gameplay')
				.inPhase('fixedUpdate')
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
				.and();
		},
	});
}
