import { test, expect } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';
import type { LabelsOf, GroupsOf, ComponentsOf, EventsOf, ResourcesOf, AssetGroupNamesOf, ReactiveQueryNamesOf, AssetTypesOf, ScreenStatesOf } from './type-utils';
import { createTransformPlugin } from './plugins/transform';

// ==================== Type-level assertion helpers ====================

/**
 * Asserts that two types are exactly equal.
 * Produces a compile error when the types don't match.
 */
function assertType<_T extends true>() {}

type IsEqual<T, U> = [T] extends [U] ? [U] extends [T] ? true : false : false;

// ==================== Type-level tests ====================

// 1. Plugin accumulates labels
test('type-level: Plugin accumulates labels', () => {
	const plugin = definePlugin<{ pos: { x: number } }, {}, {}, {}, {}, 'move' | 'render', never>({
		id: 'test',
		install(world) {
			world.addSystem('move')
				.setProcess(() => {});
			world.addSystem('render')
				.setProcess(() => {});
		},
	});

	assertType<IsEqual<LabelsOf<typeof plugin>, 'move' | 'render'>>();

	expect(plugin).toBeDefined();
});

// 2. Plugin accumulates groups
test('type-level: Plugin accumulates groups', () => {
	const plugin = definePlugin<{ pos: { x: number } }, {}, {}, {}, {}, 'sys1' | 'sys2', 'rendering' | 'physics'>({
		id: 'test',
		install(world) {
			world.addSystem('sys1')
				.inGroup('rendering')
				.setProcess(() => {});
			world.addSystem('sys2')
				.inGroup('physics')
				.setProcess(() => {});
		},
	});

	assertType<IsEqual<GroupsOf<typeof plugin>, 'rendering' | 'physics'>>();

	expect(plugin).toBeDefined();
});

// 3. Builder accumulates from multiple plugins
test('type-level: Builder accumulates labels/groups from multiple plugins', () => {
	const pluginA = definePlugin<{ a: number }, {}, {}, {}, {}, 'sysA', 'groupA'>({
		id: 'a',
		install(world) {
			world.addSystem('sysA')
				.inGroup('groupA')
				.setProcess(() => {});
		},
	});

	const pluginB = definePlugin<{ b: number }, {}, {}, {}, {}, 'sysB', 'groupB'>({
		id: 'b',
		install(world) {
			world.addSystem('sysB')
				.inGroup('groupB')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(pluginA)
		.withPlugin(pluginB)
		.build();

	// Should accept known labels
	ecs.removeSystem('sysA');
	ecs.removeSystem('sysB');

	// Should accept known groups
	ecs.disableSystemGroup('groupA');
	ecs.enableSystemGroup('groupB');

	expect(ecs).toBeDefined();
});

// 4. @ts-expect-error on invalid labels
test('type-level: invalid label produces compile error', () => {
	const plugin = definePlugin<{ a: number }, {}, {}, {}, {}, 'validLabel'>({
		id: 'test',
		install(world) {
			world.addSystem('validLabel')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.build();

	// Valid - should compile
	ecs.removeSystem('validLabel');

	// Invalid - should error
	// @ts-expect-error 'typo' is not a valid label
	ecs.removeSystem('typo');

	expect(true).toBe(true);
});

// 5. @ts-expect-error on invalid groups
test('type-level: invalid group produces compile error', () => {
	const plugin = definePlugin<{ a: number }, {}, {}, {}, {}, 'sys', 'validGroup'>({
		id: 'test',
		install(world) {
			world.addSystem('sys')
				.inGroup('validGroup')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.build();

	// Valid - should compile
	ecs.disableSystemGroup('validGroup');

	// Invalid - should error
	// @ts-expect-error 'typo' is not a valid group
	ecs.disableSystemGroup('typo');

	expect(true).toBe(true);
});

// 6. No plugins → string (backward compat)
test('type-level: no plugins defaults to string for labels and groups', () => {
	const ecs = ECSpresso.create().build();

	// Should accept any string when no plugins contribute labels/groups
	ecs.removeSystem('anything');
	ecs.disableSystemGroup('anything');
	ecs.enableSystemGroup('anything');
	ecs.isSystemGroupEnabled('anything');
	ecs.getSystemsInGroup('anything');
	ecs.updateSystemPriority('anything', 1);
	ecs.updateSystemPhase('anything', 'update');

	expect(ecs).toBeDefined();
});

// 7. Direct construction → string (backward compat)
test('type-level: direct construction defaults to string', () => {
	const ecs = new ECSpresso();

	// Direct construction should accept any string
	ecs.removeSystem('anything');
	ecs.disableSystemGroup('anything');

	expect(ecs).toBeDefined();
});

// 8. withComponentTypes preserves labels/groups
test('type-level: withComponentTypes preserves labels/groups', () => {
	const plugin = definePlugin<{ a: number }, {}, {}, {}, {}, 'mySystem', 'myGroup'>({
		id: 'test',
		install(world) {
			world.addSystem('mySystem')
				.inGroup('myGroup')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.withComponentTypes<{ player: true }>()
		.build();

	// Labels/groups should still be constrained
	ecs.removeSystem('mySystem');
	ecs.disableSystemGroup('myGroup');

	// @ts-expect-error labels still constrained after withComponentTypes
	ecs.removeSystem('nope');

	// @ts-expect-error groups still constrained after withComponentTypes
	ecs.disableSystemGroup('nope');

	expect(ecs).toBeDefined();
});

// 9. Multiple groups per system
test('type-level: multiple groups per system tracked', () => {
	const plugin = definePlugin<{ a: number }, {}, {}, {}, {}, 'sys', 'groupA' | 'groupB'>({
		id: 'test',
		install(world) {
			world.addSystem('sys')
				.inGroup('groupA')
				.inGroup('groupB')
				.setProcess(() => {});
		},
	});

	assertType<IsEqual<GroupsOf<typeof plugin>, 'groupA' | 'groupB'>>();

	expect(plugin).toBeDefined();
});

// 10. Composite plugin unions labels/groups
test('type-level: composite plugin unions labels/groups', () => {
	const pluginA = definePlugin<{ a: number }, {}, {}, {}, {}, 'sysA', 'groupA'>({
		id: 'a',
		install(world) {
			world.addSystem('sysA')
				.inGroup('groupA')
				.setProcess(() => {});
		},
	});

	const pluginB = definePlugin<{ b: number }, {}, {}, {}, {}, 'sysB', 'groupB'>({
		id: 'b',
		install(world) {
			world.addSystem('sysB')
				.inGroup('groupB')
				.setProcess(() => {});
		},
	});

	const composite = definePlugin<
		{ a: number } & { b: number }, {}, {},
		{}, {},
		'sysA' | 'sysB',
		'groupA' | 'groupB'
	>({
		id: 'composite',
		install(world) {
			world.installPlugin(pluginA);
			world.installPlugin(pluginB);
		},
	});

	assertType<IsEqual<LabelsOf<typeof composite>, 'sysA' | 'sysB'>>();
	assertType<IsEqual<GroupsOf<typeof composite>, 'groupA' | 'groupB'>>();

	expect(composite).toBeDefined();
});

// 11. LabelsOf/GroupsOf extraction utilities
test('type-level: LabelsOf and GroupsOf extraction', () => {
	const plugin = definePlugin<{ x: number }, { click: true }, { db: object }, {}, {}, 'alpha' | 'beta', 'grp1' | 'grp2'>({
		id: 'test',
		install(world) {
			world.addSystem('alpha')
				.inGroup('grp1')
				.setProcess(() => {});
			world.addSystem('beta')
				.inGroup('grp2')
				.setProcess(() => {});
		},
	});

	assertType<IsEqual<LabelsOf<typeof plugin>, 'alpha' | 'beta'>>();
	assertType<IsEqual<GroupsOf<typeof plugin>, 'grp1' | 'grp2'>>();
	assertType<IsEqual<ComponentsOf<typeof plugin>, { x: number }>>();
	assertType<IsEqual<EventsOf<typeof plugin>, { click: true }>>();
	assertType<IsEqual<ResourcesOf<typeof plugin>, { db: object }>>();
	assertType<IsEqual<AssetGroupNamesOf<typeof plugin>, never>>();
	assertType<IsEqual<ReactiveQueryNamesOf<typeof plugin>, never>>();

	expect(plugin).toBeDefined();
});

// 12. Built-in plugin labels/groups flow through
test('type-level: built-in plugin labels/groups flow through', () => {
	const transformPlugin = createTransformPlugin();

	assertType<IsEqual<LabelsOf<typeof transformPlugin>, 'transform-propagation'>>();
	assertType<IsEqual<GroupsOf<typeof transformPlugin>, 'transform'>>();

	const ecs = ECSpresso.create()
		.withPlugin(transformPlugin)
		.build();

	ecs.removeSystem('transform-propagation');
	ecs.disableSystemGroup('transform');

	// @ts-expect-error not a label from transform plugin
	ecs.removeSystem('nonexistent');

	expect(ecs).toBeDefined();
});

// ==================== Runtime tests ====================

// 13. removeSystem works correctly
test('runtime: removeSystem returns true/false', () => {
	const plugin = definePlugin<{ pos: { x: number } }, {}, {}, {}, {}, 'mySys'>({
		id: 'test',
		install(world) {
			world.addSystem('mySys')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.build();

	expect(ecs.removeSystem('mySys')).toBe(true);
	expect(ecs.removeSystem('mySys')).toBe(false);
});

// 14. disableSystemGroup/enableSystemGroup work correctly
test('runtime: disableSystemGroup/enableSystemGroup', () => {
	const plugin = definePlugin<{ pos: { x: number } }, {}, {}, {}, {}, 'grouped', 'myGroup'>({
		id: 'test',
		install(world) {
			world.addSystem('grouped')
				.inGroup('myGroup')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.build();

	expect(ecs.isSystemGroupEnabled('myGroup')).toBe(true);
	ecs.disableSystemGroup('myGroup');
	expect(ecs.isSystemGroupEnabled('myGroup')).toBe(false);
	ecs.enableSystemGroup('myGroup');
	expect(ecs.isSystemGroupEnabled('myGroup')).toBe(true);
});

// 15. getSystemsInGroup returns correct labels
test('runtime: getSystemsInGroup returns correct labels', () => {
	const plugin = definePlugin<{ pos: { x: number } }, {}, {}, {}, {}, 'a' | 'b' | 'c', 'grp'>({
		id: 'test',
		install(world) {
			world.addSystem('a')
				.inGroup('grp')
				.setProcess(() => {});
			world.addSystem('b')
				.inGroup('grp')
				.setProcess(() => {});
			world.addSystem('c')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.build();

	const inGroup = ecs.getSystemsInGroup('grp');
	expect(inGroup).toContain('a');
	expect(inGroup).toContain('b');
	expect(inGroup).not.toContain('c');
	expect(inGroup.length).toBe(2);
});

// 16. updateSystemPhase/updateSystemPriority work correctly
test('runtime: updateSystemPhase and updateSystemPriority', () => {
	const plugin = definePlugin<{ pos: { x: number } }, {}, {}, {}, {}, 'mover'>({
		id: 'test',
		install(world) {
			world.addSystem('mover')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.build();

	expect(ecs.updateSystemPhase('mover', 'render')).toBe(true);
	expect(ecs.updateSystemPhase('nonexistent' as 'mover', 'update')).toBe(false);

	expect(ecs.updateSystemPriority('mover', 100)).toBe(true);
	expect(ecs.updateSystemPriority('nonexistent' as 'mover', 50)).toBe(false);
});

// Additional: withEventTypes preserves labels/groups
test('type-level: withEventTypes preserves labels/groups', () => {
	const plugin = definePlugin<{ a: number }, {}, {}, {}, {}, 'sys1', 'grp1'>({
		id: 'test',
		install(world) {
			world.addSystem('sys1')
				.inGroup('grp1')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.withEventTypes<{ boom: { power: number } }>()
		.build();

	ecs.removeSystem('sys1');
	ecs.disableSystemGroup('grp1');

	// @ts-expect-error
	ecs.removeSystem('nope');
	// @ts-expect-error
	ecs.disableSystemGroup('nope');

	expect(ecs).toBeDefined();
});

// Additional: withResource preserves labels/groups
test('type-level: withResource preserves labels/groups', () => {
	const plugin = definePlugin<{ a: number }, {}, {}, {}, {}, 'sys1', 'grp1'>({
		id: 'test',
		install(world) {
			world.addSystem('sys1')
				.inGroup('grp1')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.withResource('score', 0)
		.build();

	ecs.removeSystem('sys1');
	ecs.disableSystemGroup('grp1');

	// @ts-expect-error
	ecs.removeSystem('nope');
	// @ts-expect-error
	ecs.disableSystemGroup('nope');

	expect(ecs).toBeDefined();
});

// Additional: isSystemGroupEnabled and getSystemsInGroup have typed params
test('type-level: isSystemGroupEnabled and getSystemsInGroup accept typed groups', () => {
	const plugin = definePlugin<{ a: number }, {}, {}, {}, {}, 'sys', 'myGroup'>({
		id: 'test',
		install(world) {
			world.addSystem('sys')
				.inGroup('myGroup')
				.setProcess(() => {});
		},
	});

	const ecs = ECSpresso.create()
		.withPlugin(plugin)
		.build();

	ecs.isSystemGroupEnabled('myGroup');
	ecs.getSystemsInGroup('myGroup');

	// @ts-expect-error
	ecs.isSystemGroupEnabled('wrong');
	// @ts-expect-error
	ecs.getSystemsInGroup('wrong');

	expect(true).toBe(true);
});

// ==================== AssetTypesOf / ScreenStatesOf extraction ====================

// 17-22: Asset/Screen type extraction tests
// These tests relied on Plugin.addAsset/addScreen/addAssetGroup which
// don't exist on the plugin pattern. The plugin install function uses
// world._registerAsset and world._registerScreen instead.
// Asset/screen type propagation is tested via the builder in builder-type-inference.test.ts.

test('type-level: AssetTypesOf returns {} for plugin with no assets', () => {
	const plugin = definePlugin<{ a: number }, {}, {}>({
		id: 'test',
		install() {},
	});

	assertType<IsEqual<AssetTypesOf<typeof plugin>, {}>>();

	expect(plugin).toBeDefined();
});

test('type-level: ScreenStatesOf returns {} for plugin with no screens', () => {
	const plugin = definePlugin<{ a: number }, {}, {}>({
		id: 'test',
		install() {},
	});

	assertType<IsEqual<ScreenStatesOf<typeof plugin>, {}>>();

	expect(plugin).toBeDefined();
});
