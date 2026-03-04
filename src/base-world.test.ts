import { describe, test, expect } from 'bun:test';
import ECSpresso from './ecspresso';
import type { BaseWorld } from './types';

type TestComponents = {
	position: { x: number; y: number };
	health: number;
};

describe('BaseWorld', () => {
	test('ECSpresso structurally satisfies BaseWorld (empty — no component access)', () => {
		const ecs = ECSpresso.create().build();
		const _: BaseWorld = ecs;
		void _;
		expect(true).toBe(true);
	});

	test('ECSpresso structurally satisfies BaseWorld<C> with matching components', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.build();
		const _: BaseWorld<TestComponents> = ecs;
		void _;
		expect(true).toBe(true);
	});

	test('ECSpresso with superset components satisfies BaseWorld<C> with subset', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.build();
		// BaseWorld only declares 'position', but world has both 'position' and 'health'
		const _: BaseWorld<Pick<TestComponents, 'position'>> = ecs;
		void _;
		expect(true).toBe(true);
	});

	test('BaseWorld (empty) prevents component access', () => {
		function acceptsBaseWorld(w: BaseWorld) {
			w.removeEntity(1);
			w.getResource('k');
			w.hasResource('k');
			w.eventBus.publish('e', {});
			w.commands.spawn({});
			w.commands.removeEntity(1);
		}
		void acceptsBaseWorld;
		expect(true).toBe(true);
	});

	test('BaseWorld<C> enables typed component access', () => {
		function acceptsTypedWorld(w: BaseWorld<TestComponents>) {
			// These are typed — no casts needed
			const pos: { x: number; y: number } | undefined = w.getComponent(1, 'position');
			const hp: number | undefined = w.getComponent(1, 'health');
			w.hasComponent(1, 'position');
			w.markChanged(1, 'health');
			w.spawn({ position: { x: 0, y: 0 } });
			w.commands.addComponent(1, 'health', 42);
			w.commands.removeComponent(1, 'position');
			void pos;
			void hp;
		}
		void acceptsTypedWorld;
		expect(true).toBe(true);
	});
});
