import { expect, describe, test } from 'bun:test';
import SimpleECS from './simple-ecs';
import Bundle, { mergeBundles } from './bundle';

// Define test component and resource types
interface PositionComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
}

interface PositionResources {
	gravity: { value: number };
}

interface PlayerComponents {
	player: { id: string };
	health: { value: number };
}

interface PlayerResources {
	playerControls: { up: boolean; down: boolean; left: boolean; right: boolean };
}

// Combined types
type GameComponents = PositionComponents & PlayerComponents;
type GameResources = PositionResources & PlayerResources;

describe('Bundle', () => {
	test('should create a bundle with correct type parameters', () => {
		const bundle = new Bundle<PositionComponents, {}, PositionResources>();
		expect(bundle).toBeInstanceOf(Bundle);
	});

	test('should add systems to the bundle', () => {
		const bundle = new Bundle<PositionComponents, {}, PositionResources>();
		bundle.addSystem('test');
		
		// Verify systems were added by checking the built systems
		const systems = bundle.getSystems();
		expect(systems.length).toBe(1);
		expect(systems[0]?.label).toBe('test');
	});

	test('should add resources to the bundle', () => {
		const bundle = new Bundle<PositionComponents, {}, PositionResources>();
		bundle.addResource('gravity', { value: 9.8 });
		
		// Verify resources were added
		const resources = bundle.getResources();
		expect(resources.size).toBe(1);
		expect(resources.get('gravity')).toEqual({ value: 9.8 });
	});

	test('should handle a world installing a bundle with the install method', () => {
		const bundle = new Bundle<PositionComponents, {}, PositionResources>('test-bundle')
			.addResource('gravity', { value: 9.8 });
			
		const world = new SimpleECS<PositionComponents, {}, PositionResources>();
		
		world.install(bundle);
		
		// Verify the bundle was installed by checking the installed bundles
		expect(world.installedBundles).toContain('test-bundle');
		expect(world.hasResource('gravity')).toBe(true);
	});

	test('should combine two bundles with combineBundle', () => {
		// Create bundles to get properly typed system builders
		const physicsBundle = new Bundle<PositionComponents, {}, PositionResources>();
		const playerBundle = new Bundle<PlayerComponents, {}, PlayerResources>();
		
		// Add resources to each bundle
		physicsBundle.addResource('gravity', { value: 9.8 });
		playerBundle.addResource('playerControls', { up: false, down: false, left: false, right: false });
		
		// Create system builders using the bundles
		physicsBundle.addSystem('physics')
			.addQuery('movingEntities', { 
				with: ['position', 'velocity']
			})
			.setProcess(() => {
				// Dummy process function
			});
			
		playerBundle.addSystem('player')
			.addQuery('players', { 
				with: ['player', 'health']
			})
			.setProcess(() => {
				// Dummy process function
			});
			
		// Combine the bundles
		const gameBundle = mergeBundles(
			'game',
			physicsBundle,
			playerBundle,
		);
		
		// Check that the combined bundle has the systems and resources from both bundles
		expect(gameBundle.getSystems().length).toBe(2);
		expect(gameBundle.getResources().size).toBe(2);
		expect(gameBundle.getResources().has('gravity')).toBe(true);
		expect(gameBundle.getResources().has('playerControls')).toBe(true);
		
		// Install the combined bundle into a world
		const world = new SimpleECS<GameComponents, {}, GameResources>();
		
		// Install and verify bundle was successfully installed
		world.install(gameBundle);
		expect(world.installedBundles).toContain('game');
		expect(world.hasResource('gravity')).toBe(true);
		expect(world.hasResource('playerControls')).toBe(true);
	});
}); 