import { definePlugin } from '../types';

export default function createPhysicsPlugin() {
	return definePlugin({
		id: 'physics-plugin',
		install(world) {
			// Movement system - applies velocity to localTransform3D position
			world.addSystem('movement')
				.inGroup('gameplay')
				.inPhase('fixedUpdate')
				.setProcessEach({ with: ['localTransform3D', 'velocity'] }, ({ entity, dt }) => {
					const { localTransform3D, velocity } = entity.components;
					localTransform3D.x += velocity.x * dt;
					localTransform3D.y += velocity.y * dt;
					localTransform3D.z += velocity.z * dt;
				});
		},
	});
}
