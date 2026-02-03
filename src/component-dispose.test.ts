import { expect, describe, test, spyOn } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle, { mergeBundles } from './bundle';

interface TestComponents {
	mesh: { vertices: number[]; dispose: () => void };
	texture: { data: Uint8Array; dispose: () => void };
	health: number;
	position: { x: number; y: number };
}

interface TestEvents {}

function createWorld() {
	return ECSpresso.create()
		.withComponentTypes<TestComponents>()
		.withEventTypes<TestEvents>()
		.build();
}

describe('Component Dispose', () => {
	test('dispose fires on removeComponent with correct value', () => {
		const ecs = createWorld();
		const disposed: Array<TestComponents['mesh']> = [];
		ecs.registerDispose('mesh', (mesh) => { disposed.push(mesh); });

		const meshValue = { vertices: [1, 2, 3], dispose: () => {} };
		const entity = ecs.spawn({ mesh: meshValue });
		ecs.entityManager.removeComponent(entity.id, 'mesh');

		expect(disposed).toHaveLength(1);
		expect(disposed[0]).toBe(meshValue);
	});

	test('dispose fires on entity destruction via removeEntity', () => {
		const ecs = createWorld();
		const disposed: Array<TestComponents['mesh']> = [];
		ecs.registerDispose('mesh', (mesh) => { disposed.push(mesh); });

		const meshValue = { vertices: [4, 5, 6], dispose: () => {} };
		ecs.spawn({ mesh: meshValue });

		ecs.removeEntity(1);

		expect(disposed).toHaveLength(1);
		expect(disposed[0]).toBe(meshValue);
	});

	test('dispose fires for descendants on cascade destruction', () => {
		const ecs = createWorld();
		const disposed: Array<TestComponents['mesh']> = [];
		ecs.registerDispose('mesh', (mesh) => { disposed.push(mesh); });

		const parentMesh = { vertices: [1], dispose: () => {} };
		const childMesh = { vertices: [2], dispose: () => {} };

		const parent = ecs.spawn({ mesh: parentMesh });
		ecs.spawnChild(parent.id, { mesh: childMesh });

		ecs.removeEntity(parent.id);

		expect(disposed).toHaveLength(2);
		expect(disposed).toContain(childMesh);
		expect(disposed).toContain(parentMesh);
	});

	test('dispose fires on component replacement via addComponent', () => {
		const ecs = createWorld();
		const disposed: Array<TestComponents['mesh']> = [];
		ecs.registerDispose('mesh', (mesh) => { disposed.push(mesh); });

		const oldMesh = { vertices: [1], dispose: () => {} };
		const newMesh = { vertices: [2], dispose: () => {} };

		const entity = ecs.spawn({ mesh: oldMesh });
		ecs.entityManager.addComponent(entity.id, 'mesh', newMesh);

		expect(disposed).toHaveLength(1);
		expect(disposed[0]).toBe(oldMesh);
	});

	test('dispose fires on component replacement via addComponents', () => {
		const ecs = createWorld();
		const disposed: Array<TestComponents['mesh']> = [];
		ecs.registerDispose('mesh', (mesh) => { disposed.push(mesh); });

		const oldMesh = { vertices: [1], dispose: () => {} };
		const newMesh = { vertices: [2], dispose: () => {} };

		const entity = ecs.spawn({ mesh: oldMesh, health: 100 });
		ecs.entityManager.addComponents(entity.id, { mesh: newMesh, health: 200 });

		expect(disposed).toHaveLength(1);
		expect(disposed[0]).toBe(oldMesh);
	});

	test('dispose error isolation — throws do not block removal or other callbacks', () => {
		const ecs = createWorld();
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

		ecs.registerDispose('mesh', () => { throw new Error('dispose failed'); });

		let removedCallbackFired = false;
		ecs.onComponentRemoved('mesh', () => { removedCallbackFired = true; });

		const meshValue = { vertices: [1], dispose: () => {} };
		const entity = ecs.spawn({ mesh: meshValue });
		ecs.entityManager.removeComponent(entity.id, 'mesh');

		expect(removedCallbackFired).toBe(true);
		expect(warnSpy).toHaveBeenCalled();

		// Verify the component was actually removed
		expect(ecs.hasComponent(entity.id, 'mesh')).toBe(false);

		warnSpy.mockRestore();
	});

	test('multiple disposed components on one entity all fire', () => {
		const ecs = createWorld();
		const disposedMeshes: Array<TestComponents['mesh']> = [];
		const disposedTextures: Array<TestComponents['texture']> = [];

		ecs.registerDispose('mesh', (mesh) => { disposedMeshes.push(mesh); });
		ecs.registerDispose('texture', (texture) => { disposedTextures.push(texture); });

		const meshValue = { vertices: [1], dispose: () => {} };
		const textureValue = { data: new Uint8Array([1, 2]), dispose: () => {} };

		ecs.spawn({ mesh: meshValue, texture: textureValue });
		ecs.removeEntity(1);

		expect(disposedMeshes).toHaveLength(1);
		expect(disposedMeshes[0]).toBe(meshValue);
		expect(disposedTextures).toHaveLength(1);
		expect(disposedTextures[0]).toBe(textureValue);
	});

	test('ordering: dispose fires before onComponentRemoved callbacks', () => {
		const ecs = createWorld();
		const callOrder: string[] = [];

		ecs.registerDispose('mesh', () => { callOrder.push('dispose'); });
		ecs.onComponentRemoved('mesh', () => { callOrder.push('onComponentRemoved'); });

		const entity = ecs.spawn({ mesh: { vertices: [1], dispose: () => {} } });
		ecs.entityManager.removeComponent(entity.id, 'mesh');

		expect(callOrder).toEqual(['dispose', 'onComponentRemoved']);
	});

	test('ordering: dispose fires before onComponentRemoved on entity destruction', () => {
		const ecs = createWorld();
		const callOrder: string[] = [];

		ecs.registerDispose('mesh', () => { callOrder.push('dispose'); });
		ecs.onComponentRemoved('mesh', () => { callOrder.push('onComponentRemoved'); });

		ecs.spawn({ mesh: { vertices: [1], dispose: () => {} } });
		ecs.removeEntity(1);

		expect(callOrder).toEqual(['dispose', 'onComponentRemoved']);
	});

	test('command buffer removeComponent triggers dispose during playback', () => {
		const ecs = createWorld();
		const disposed: Array<TestComponents['mesh']> = [];
		ecs.registerDispose('mesh', (mesh) => { disposed.push(mesh); });

		const meshValue = { vertices: [1], dispose: () => {} };
		const entity = ecs.spawn({ mesh: meshValue });

		ecs.commands.removeComponent(entity.id, 'mesh');
		expect(disposed).toHaveLength(0);

		ecs.update(0.016);

		expect(disposed).toHaveLength(1);
		expect(disposed[0]).toBe(meshValue);
	});

	test('command buffer removeEntity triggers dispose during playback', () => {
		const ecs = createWorld();
		const disposed: Array<TestComponents['mesh']> = [];
		ecs.registerDispose('mesh', (mesh) => { disposed.push(mesh); });

		const meshValue = { vertices: [1], dispose: () => {} };
		ecs.spawn({ mesh: meshValue });

		ecs.commands.removeEntity(1);
		expect(disposed).toHaveLength(0);

		ecs.update(0.016);

		expect(disposed).toHaveLength(1);
		expect(disposed[0]).toBe(meshValue);
	});

	test('bundle-registered dispose installed and fires correctly', () => {
		const bundle = new Bundle<TestComponents>('test-dispose-bundle');
		const disposed: Array<TestComponents['mesh']> = [];

		bundle.registerDispose('mesh', (mesh) => { disposed.push(mesh); });

		const ecs = ECSpresso.create()
			.withBundle(bundle)
			.build();

		const meshValue = { vertices: [1], dispose: () => {} };
		ecs.spawn({ mesh: meshValue });
		ecs.removeEntity(1);

		expect(disposed).toHaveLength(1);
		expect(disposed[0]).toBe(meshValue);
	});

	test('builder withDispose registered and fires correctly', () => {
		const disposed: Array<TestComponents['mesh']> = [];

		const ecs = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.withDispose('mesh', (mesh) => { disposed.push(mesh); })
			.build();

		const meshValue = { vertices: [1], dispose: () => {} };
		ecs.spawn({ mesh: meshValue });
		ecs.removeEntity(1);

		expect(disposed).toHaveLength(1);
		expect(disposed[0]).toBe(meshValue);
	});

	test('dispose override — later registration replaces earlier', () => {
		const ecs = createWorld();
		const firstDisposed: Array<TestComponents['mesh']> = [];
		const secondDisposed: Array<TestComponents['mesh']> = [];

		ecs.registerDispose('mesh', (mesh) => { firstDisposed.push(mesh); });
		ecs.registerDispose('mesh', (mesh) => { secondDisposed.push(mesh); });

		const meshValue = { vertices: [1], dispose: () => {} };
		ecs.spawn({ mesh: meshValue });
		ecs.removeEntity(1);

		expect(firstDisposed).toHaveLength(0);
		expect(secondDisposed).toHaveLength(1);
	});

	test('no dispose registered — normal behavior unaffected', () => {
		const ecs = createWorld();

		let removedCallbackFired = false;
		ecs.onComponentRemoved('mesh', () => { removedCallbackFired = true; });

		const entity = ecs.spawn({ mesh: { vertices: [1], dispose: () => {} } });
		ecs.entityManager.removeComponent(entity.id, 'mesh');

		expect(removedCallbackFired).toBe(true);
		expect(ecs.hasComponent(entity.id, 'mesh')).toBe(false);
	});

	test('mergeBundles carries dispose registrations', () => {
		const bundle1 = new Bundle<Pick<TestComponents, 'mesh'>>('bundle1');
		const bundle2 = new Bundle<Pick<TestComponents, 'texture'>>('bundle2');

		const disposedMeshes: Array<TestComponents['mesh']> = [];
		const disposedTextures: Array<TestComponents['texture']> = [];

		bundle1.registerDispose('mesh', (mesh) => { disposedMeshes.push(mesh); });
		bundle2.registerDispose('texture', (texture) => { disposedTextures.push(texture); });

		const merged = mergeBundles('merged', bundle1, bundle2);

		const ecs = ECSpresso.create()
			.withBundle(merged)
			.build();

		const meshValue = { vertices: [1], dispose: () => {} };
		const textureValue = { data: new Uint8Array([1]), dispose: () => {} };

		ecs.spawn({ mesh: meshValue, texture: textureValue });
		ecs.removeEntity(1);

		expect(disposedMeshes).toHaveLength(1);
		expect(disposedMeshes[0]).toBe(meshValue);
		expect(disposedTextures).toHaveLength(1);
		expect(disposedTextures[0]).toBe(textureValue);
	});

	test('type safety — component name constrained, callback value typed', () => {
		const ecs = createWorld();

		// This should compile — mesh is a valid component name
		ecs.registerDispose('mesh', (mesh) => {
			// mesh should be typed as TestComponents['mesh']
			const _vertices: number[] = mesh.vertices;
			void _vertices;
		});

		// This should compile — health is a valid component name with number type
		ecs.registerDispose('health', (health) => {
			const _val: number = health;
			void _val;
		});

		// @ts-expect-error — 'nonexistent' is not a valid component name
		ecs.registerDispose('nonexistent', () => {});
	});
});
