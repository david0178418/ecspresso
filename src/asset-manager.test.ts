import { expect, describe, test, beforeEach } from 'bun:test';
import AssetManager, { createAssetConfigurator } from './asset-manager';
import EventBus from './event-bus';
import type { AssetEvents } from './asset-types';

type TestAssets = {
	texture: { width: number; height: number; data: Uint8Array };
	audio: { duration: number; sampleRate: number };
	config: { settings: Record<string, unknown> };
	[key: string]: unknown;
};

describe('AssetManager', () => {
	let manager: AssetManager<TestAssets>;
	let eventBus: EventBus<AssetEvents>;

	beforeEach(() => {
		manager = new AssetManager<TestAssets>();
		eventBus = new EventBus<AssetEvents>();
		manager.setEventBus(eventBus);
	});

	describe('registration', () => {
		test('should register an asset definition', () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(100 * 100 * 4) }),
				eager: true,
			});

			expect(manager.getStatus('texture')).toBe('pending');
		});

		test('should register assets with groups', () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(100 * 100 * 4) }),
				group: 'level1',
			});
			manager.register('audio', {
				loader: async () => ({ duration: 120, sampleRate: 44100 }),
				group: 'level1',
			});

			expect(manager.getGroupNames()).toContain('level1');
			expect(manager.getGroupKeys('level1')).toContain('texture');
			expect(manager.getGroupKeys('level1')).toContain('audio');
		});
	});

	describe('loading', () => {
		test('should load a single asset', async () => {
			const textureData = { width: 100, height: 100, data: new Uint8Array(100 * 100 * 4) };
			manager.register('texture', {
				loader: async () => textureData,
			});

			const result = await manager.loadAsset('texture');

			expect(result).toEqual(textureData);
			expect(manager.getStatus('texture')).toBe('loaded');
			expect(manager.isLoaded('texture')).toBe(true);
		});

		test('should load eager assets', async () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(4) }),
				eager: true,
			});
			manager.register('audio', {
				loader: async () => ({ duration: 120, sampleRate: 44100 }),
				eager: false,
			});

			await manager.loadEagerAssets();

			expect(manager.isLoaded('texture')).toBe(true);
			expect(manager.isLoaded('audio')).toBe(false);
		});

		test('should load asset group', async () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(4) }),
				group: 'level1',
			});
			manager.register('audio', {
				loader: async () => ({ duration: 120, sampleRate: 44100 }),
				group: 'level1',
			});

			await manager.loadAssetGroup('level1');

			expect(manager.isLoaded('texture')).toBe(true);
			expect(manager.isLoaded('audio')).toBe(true);
			expect(manager.isGroupLoaded('level1')).toBe(true);
		});

		test('should not duplicate load in-progress assets', async () => {
			let loadCount = 0;
			manager.register('texture', {
				loader: async () => {
					loadCount++;
					await new Promise(resolve => setTimeout(resolve, 10));
					return { width: 100, height: 100, data: new Uint8Array(4) };
				},
			});

			// Start two loads simultaneously
			const load1 = manager.loadAsset('texture');
			const load2 = manager.loadAsset('texture');

			await Promise.all([load1, load2]);

			expect(loadCount).toBe(1);
		});

		test('should handle load failures', async () => {
			manager.register('texture', {
				loader: async () => {
					throw new Error('Failed to load');
				},
			});

			await expect(manager.loadAsset('texture')).rejects.toThrow('Failed to load');
			expect(manager.getStatus('texture')).toBe('failed');
		});

		test('should retry failed assets', async () => {
			let attempt = 0;
			manager.register('texture', {
				loader: async () => {
					attempt++;
					if (attempt === 1) {
						throw new Error('First attempt failed');
					}
					return { width: 100, height: 100, data: new Uint8Array(4) };
				},
			});

			// First attempt fails
			await expect(manager.loadAsset('texture')).rejects.toThrow();
			expect(manager.getStatus('texture')).toBe('failed');

			// Second attempt succeeds
			const result = await manager.loadAsset('texture');
			expect(result).toBeDefined();
			expect(manager.getStatus('texture')).toBe('loaded');
		});
	});

	describe('access', () => {
		test('should get loaded asset', async () => {
			const textureData = { width: 100, height: 100, data: new Uint8Array(4) };
			manager.register('texture', {
				loader: async () => textureData,
			});

			await manager.loadAsset('texture');

			expect(manager.get('texture')).toEqual(textureData);
		});

		test('should throw when getting unloaded asset', () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(4) }),
			});

			expect(() => manager.get('texture')).toThrow(/not loaded/);
		});

		test('should return undefined for getOrUndefined on unloaded asset', () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(4) }),
			});

			expect(manager.getOrUndefined('texture')).toBeUndefined();
		});

		test('should return asset handle with status', async () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(4) }),
			});

			const handle = manager.getHandle('texture');
			expect(handle.status).toBe('pending');
			expect(handle.isLoaded).toBe(false);
			expect(handle.getOrUndefined()).toBeUndefined();

			await manager.loadAsset('texture');

			expect(handle.status).toBe('loaded');
			expect(handle.isLoaded).toBe(true);
			expect(handle.get()).toBeDefined();
		});
	});

	describe('progress', () => {
		test('should report group progress', async () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(4) }),
				group: 'level1',
			});
			manager.register('audio', {
				loader: async () => ({ duration: 120, sampleRate: 44100 }),
				group: 'level1',
			});

			expect(manager.getGroupProgress('level1')).toBe(0);

			await manager.loadAsset('texture');
			expect(manager.getGroupProgress('level1')).toBe(0.5);

			await manager.loadAsset('audio');
			expect(manager.getGroupProgress('level1')).toBe(1);
		});

		test('should emit progress events', async () => {
			const progressEvents: Array<{ group: string; progress: number }> = [];
			eventBus.subscribe('assetGroupProgress', (data) => {
				progressEvents.push({ group: data.group, progress: data.progress });
			});

			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(4) }),
				group: 'level1',
			});
			manager.register('audio', {
				loader: async () => ({ duration: 120, sampleRate: 44100 }),
				group: 'level1',
			});

			await manager.loadAssetGroup('level1');

			expect(progressEvents.length).toBe(2);
			expect(progressEvents[0]?.progress).toBe(0.5);
			expect(progressEvents[1]?.progress).toBe(1);
		});
	});

	describe('resource creation', () => {
		test('should create $assets resource object', async () => {
			manager.register('texture', {
				loader: async () => ({ width: 100, height: 100, data: new Uint8Array(4) }),
				group: 'level1',
			});

			const resource = manager.createResource();

			expect(resource.getStatus('texture')).toBe('pending');
			expect(resource.isLoaded('texture')).toBe(false);
			expect(resource.isGroupLoaded('level1')).toBe(false);

			await manager.loadAsset('texture');

			expect(resource.getStatus('texture')).toBe('loaded');
			expect(resource.isLoaded('texture')).toBe(true);
			expect(resource.isGroupLoaded('level1')).toBe(true);
			expect(resource.get('texture')).toBeDefined();
		});
	});
});

describe('AssetConfigurator', () => {
	test('should add assets via configurator', () => {
		const configurator = createAssetConfigurator<Record<string, unknown>>();

		configurator
			.add('texture', async () => ({ width: 100, height: 100 }))
			.addGroup('level1', {
				background: async () => ({ width: 800, height: 600 }),
				music: async () => ({ duration: 180 }),
			});

		const manager = configurator.getManager();
		expect(manager.getKeys()).toContain('texture');
		expect(manager.getKeys()).toContain('background');
		expect(manager.getKeys()).toContain('music');
		expect(manager.getGroupNames()).toContain('level1');
	});

	test('should set eager flag correctly', async () => {
		const configurator = createAssetConfigurator<Record<string, unknown>>();

		configurator
			.add('eager', async () => ({ eager: true }))
			.addWithConfig('lazy', {
				loader: async () => ({ lazy: true }),
				eager: false,
			});

		const manager = configurator.getManager();
		await manager.loadEagerAssets();

		expect(manager.isLoaded('eager')).toBe(true);
		expect(manager.isLoaded('lazy')).toBe(false);
	});
});
