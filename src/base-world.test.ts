import { describe, test, expect } from 'bun:test';
import ECSpresso from './ecspresso';
import type { BaseWorld } from './types';

describe('BaseWorld', () => {
	test('ECSpresso structurally satisfies BaseWorld', () => {
		const ecs = ECSpresso.create().build();
		const _: BaseWorld = ecs;
		void _;
		expect(true).toBe(true);
	});

	test('BaseWorld has the expected methods', () => {
		function acceptsBaseWorld(w: BaseWorld) {
			w.getComponent(1, 'x');
			w.hasComponent(1, 'x');
			w.removeEntity(1);
			w.spawn({});
			w.markChanged(1, 'x');
			w.getResource('k');
			w.hasResource('k');
			w.eventBus.publish('e', {});
			w.commands.spawn({});
			w.commands.removeEntity(1);
			w.commands.addComponent(1, 'x', {});
			w.commands.removeComponent(1, 'x');
		}
		void acceptsBaseWorld;
		expect(true).toBe(true);
	});
});
