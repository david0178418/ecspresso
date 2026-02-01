import { expect, describe, test, beforeEach } from 'bun:test';
import ScreenManager, { createScreenConfigurator } from './screen-manager';
import EventBus from './event-bus';
import type { ScreenEvents, ScreenDefinition } from './screen-types';

type TestScreens = {
	loading: ScreenDefinition<Record<string, never>, { progress: number }>;
	menu: ScreenDefinition<Record<string, never>, { selectedIndex: number }>;
	gameplay: ScreenDefinition<{ level: number }, { score: number; lives: number }>;
	pause: ScreenDefinition<Record<string, never>, { pauseTime: number }>;
	[key: string]: ScreenDefinition<any, any>;
};

describe('ScreenManager', () => {
	let manager: ScreenManager<TestScreens>;
	let eventBus: EventBus<ScreenEvents>;

	beforeEach(() => {
		manager = new ScreenManager<TestScreens>();
		eventBus = new EventBus<ScreenEvents>();
		manager.setDependencies(eventBus, null, {} as any);
	});

	describe('registration', () => {
		test('should register screen definitions', () => {
			manager.register('loading', {
				initialState: () => ({ progress: 0 }),
			});

			expect(manager.hasScreen('loading')).toBe(true);
			expect(manager.getScreenNames()).toContain('loading');
		});
	});

	describe('screen transitions', () => {
		beforeEach(() => {
			manager.register('loading', {
				initialState: () => ({ progress: 0 }),
			});
			manager.register('menu', {
				initialState: () => ({ selectedIndex: 0 }),
			});
			manager.register('gameplay', {
				initialState: (_config) => ({ score: 0, lives: 3 }),
			});
			manager.register('pause', {
				initialState: () => ({ pauseTime: 0 }),
			});
		});

		test('should set screen', async () => {
			await manager.setScreen('loading', {});

			expect(manager.getCurrentScreen()).toBe('loading');
			expect(manager.getState()).toEqual({ progress: 0 });
		});

		test('should set screen with config', async () => {
			await manager.setScreen('gameplay', { level: 5 });

			expect(manager.getCurrentScreen()).toBe('gameplay');
			expect((manager.getConfig() as any).level).toBe(5);
			expect(manager.getState()).toEqual({ score: 0, lives: 3 });
		});

		test('should transition between screens', async () => {
			await manager.setScreen('loading', {});
			expect(manager.getCurrentScreen()).toBe('loading');

			await manager.setScreen('menu', {});
			expect(manager.getCurrentScreen()).toBe('menu');
			expect(manager.getStackDepth()).toBe(0);
		});

		test('should push screen as overlay', async () => {
			await manager.setScreen('gameplay', { level: 1 });
			await manager.pushScreen('pause', {});

			expect(manager.getCurrentScreen()).toBe('pause');
			expect(manager.getStackDepth()).toBe(1);
			expect(manager.isOverlay()).toBe(true);
		});

		test('should pop screen back to previous', async () => {
			await manager.setScreen('gameplay', { level: 1 });
			await manager.pushScreen('pause', {});

			await manager.popScreen();

			expect(manager.getCurrentScreen()).toBe('gameplay');
			expect(manager.getStackDepth()).toBe(0);
			expect(manager.isOverlay()).toBe(false);
		});

		test('should throw when popping empty stack', async () => {
			await manager.setScreen('loading', {});

			await expect(manager.popScreen()).rejects.toThrow(/stack is empty/);
		});

		test('should support multiple overlays', async () => {
			await manager.setScreen('gameplay', { level: 1 });
			await manager.pushScreen('pause', {});
			await manager.pushScreen('menu', {});

			expect(manager.getStackDepth()).toBe(2);

			await manager.popScreen();
			expect(manager.getCurrentScreen()).toBe('pause');

			await manager.popScreen();
			expect(manager.getCurrentScreen()).toBe('gameplay');
		});

		test('should clear stack on setScreen', async () => {
			await manager.setScreen('gameplay', { level: 1 });
			await manager.pushScreen('pause', {});
			await manager.pushScreen('menu', {});

			await manager.setScreen('loading', {});

			expect(manager.getCurrentScreen()).toBe('loading');
			expect(manager.getStackDepth()).toBe(0);
		});
	});

	describe('state management', () => {
		beforeEach(() => {
			manager.register('gameplay', {
				initialState: (_config) => ({ score: 0, lives: 3 }),
			});
		});

		test('should update state with partial object', async () => {
			await manager.setScreen('gameplay', { level: 1 });

			manager.updateState({ score: 100 });

			expect(manager.getState()).toEqual({ score: 100, lives: 3 });
		});

		test('should update state with updater function', async () => {
			await manager.setScreen('gameplay', { level: 1 });

			manager.updateState((current: any) => ({ score: current.score + 50 }));

			expect(manager.getState()).toEqual({ score: 50, lives: 3 });
		});

		test('should throw when updating state with no current screen', () => {
			expect(() => { manager.updateState({ score: 100 }); }).toThrow(/No current screen/);
		});
	});

	describe('lifecycle hooks', () => {
		test('should call onEnter when entering screen', async () => {
			let enterCalled = false;
			let enterConfig: any = null;

			manager.register('gameplay', {
				initialState: (_config) => ({ score: 0, lives: 3 }),
				onEnter: (config) => {
					enterCalled = true;
					enterConfig = config;
				},
			});

			await manager.setScreen('gameplay', { level: 5 });

			expect(enterCalled).toBe(true);
			expect(enterConfig).toEqual({ level: 5 });
		});

		test('should call onExit when leaving screen', async () => {
			let exitCalled = false;

			manager.register('loading', {
				initialState: () => ({ progress: 0 }),
				onExit: () => {
					exitCalled = true;
				},
			});
			manager.register('menu', {
				initialState: () => ({ selectedIndex: 0 }),
			});

			await manager.setScreen('loading', {});
			await manager.setScreen('menu', {});

			expect(exitCalled).toBe(true);
		});

		test('should call onExit for stacked screens when setting new screen', async () => {
			const exitCalls: string[] = [];

			manager.register('gameplay', {
				initialState: () => ({ score: 0, lives: 3 }),
				onExit: () => { exitCalls.push('gameplay'); },
			});
			manager.register('pause', {
				initialState: () => ({ pauseTime: 0 }),
				onExit: () => { exitCalls.push('pause'); },
			});
			manager.register('loading', {
				initialState: () => ({ progress: 0 }),
			});

			await manager.setScreen('gameplay', { level: 1 });
			await manager.pushScreen('pause', {});
			await manager.setScreen('loading', {});

			expect(exitCalls).toContain('pause');
			expect(exitCalls).toContain('gameplay');
		});
	});

	describe('events', () => {
		beforeEach(() => {
			manager.register('loading', {
				initialState: () => ({ progress: 0 }),
			});
			manager.register('pause', {
				initialState: () => ({ pauseTime: 0 }),
			});
		});

		test('should emit screenEnter event', async () => {
			const events: Array<{ screen: string; config: unknown }> = [];
			eventBus.subscribe('screenEnter', (data) => events.push(data));

			await manager.setScreen('loading', {});

			expect(events.length).toBe(1);
			expect(events[0]?.screen).toBe('loading');
		});

		test('should emit screenExit event', async () => {
			const events: Array<{ screen: string }> = [];
			eventBus.subscribe('screenExit', (data) => events.push(data));

			await manager.setScreen('loading', {});
			await manager.setScreen('pause', {});

			expect(events.length).toBe(1);
			expect(events[0]?.screen).toBe('loading');
		});

		test('should emit screenPush event', async () => {
			const events: Array<{ screen: string; config: unknown }> = [];
			eventBus.subscribe('screenPush', (data) => events.push(data));

			await manager.setScreen('loading', {});
			await manager.pushScreen('pause', {});

			expect(events.length).toBe(1);
			expect(events[0]?.screen).toBe('pause');
		});

		test('should emit screenPop event', async () => {
			const events: Array<{ screen: string }> = [];
			eventBus.subscribe('screenPop', (data) => events.push(data));

			await manager.setScreen('loading', {});
			await manager.pushScreen('pause', {});
			await manager.popScreen();

			expect(events.length).toBe(1);
			expect(events[0]?.screen).toBe('pause');
		});
	});

	describe('active checks', () => {
		beforeEach(() => {
			manager.register('gameplay', {
				initialState: () => ({ score: 0, lives: 3 }),
			});
			manager.register('pause', {
				initialState: () => ({ pauseTime: 0 }),
			});
		});

		test('should check if screen is current', async () => {
			await manager.setScreen('gameplay', { level: 1 });

			expect(manager.isCurrent('gameplay')).toBe(true);
			expect(manager.isCurrent('pause')).toBe(false);
		});

		test('should check if screen is active (including stack)', async () => {
			await manager.setScreen('gameplay', { level: 1 });
			await manager.pushScreen('pause', {});

			expect(manager.isActive('gameplay')).toBe(true);
			expect(manager.isActive('pause')).toBe(true);
			expect(manager.isCurrent('gameplay')).toBe(false);
			expect(manager.isCurrent('pause')).toBe(true);
		});
	});

	describe('resource creation', () => {
		beforeEach(() => {
			manager.register('gameplay', {
				initialState: (_config) => ({ score: 0, lives: 3 }),
			});
		});

		test('should create $screen resource object', async () => {
			const resource = manager.createResource();

			expect(resource.current).toBeNull();
			expect(resource.config).toBeNull();
			expect(resource.state).toBeNull();
			expect(resource.stackDepth).toBe(0);

			await manager.setScreen('gameplay', { level: 5 });

			expect(resource.current).toBe('gameplay');
			expect((resource.config as any).level).toBe(5);
			expect(resource.state).toEqual({ score: 0, lives: 3 });
		});

		test('should allow state mutation through resource', async () => {
			const resource = manager.createResource();
			await manager.setScreen('gameplay', { level: 1 });

			resource.state = { score: 999, lives: 5 };

			expect(manager.getState()).toEqual({ score: 999, lives: 5 });
		});
	});
});

describe('ScreenConfigurator', () => {
	test('should add screens via configurator', () => {
		const configurator = createScreenConfigurator<Record<string, ScreenDefinition<any, any>>>();

		configurator
			.add('loading', {
				initialState: () => ({ progress: 0 }),
			})
			.add('gameplay', {
				initialState: (_config: { level: number }) => ({ score: 0 }),
			});

		const manager = configurator.getManager();
		expect(manager.getScreenNames()).toContain('loading');
		expect(manager.getScreenNames()).toContain('gameplay');
	});
});
