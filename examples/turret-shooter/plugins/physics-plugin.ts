import { definePlugin } from '../types';

export default function createPhysicsPlugin() {
	return definePlugin({
		id: 'physics-plugin',
		install(world) {
			// Movement system - in gameplay group so it pauses automatically
			world.addSystem('movement')
				.inGroup('gameplay')
				.inPhase('fixedUpdate')
				.addQuery('movables', {
					with: ['position', 'velocity']
				})
				.setProcess(({ queries: { movables }, dt }) => {
					for (const entity of movables) {
						const { position, velocity } = entity.components;

						// Apply velocity to position
						position.x += velocity.x * dt;
						position.y += velocity.y * dt;
						position.z += velocity.z * dt;
					}
				});
		},
	});
}
