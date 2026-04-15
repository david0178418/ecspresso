import { definePlugin } from '../types';

export default function createPhysicsPlugin() {
	return definePlugin({
		id: 'physics-plugin',
		install(world) {
			// Movement system - applies velocity to localTransform3D position
			world.addSystem('movement')
				.inGroup('gameplay')
				.inPhase('fixedUpdate')
				.addQuery('movables', {
					with: ['localTransform3D', 'velocity']
				})
				.setProcess(({ queries: { movables }, dt }) => {
					for (const entity of movables) {
						const { localTransform3D, velocity } = entity.components;

						localTransform3D.x += velocity.x * dt;
						localTransform3D.y += velocity.y * dt;
						localTransform3D.z += velocity.z * dt;
					}
				});
		},
	});
}
