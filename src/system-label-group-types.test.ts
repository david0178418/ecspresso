import { test, expect } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle, { mergeBundles } from './bundle';
import type { LabelsOf, GroupsOf, ComponentsOf, EventsOf, ResourcesOf } from './type-utils';
import { createTransformBundle } from './bundles/utils/transform';

// ==================== Type-level assertion helpers ====================

/**
 * Asserts that two types are exactly equal.
 * Produces a compile error when the types don't match.
 */
function assertType<_T extends true>() {}

type IsEqual<T, U> = [T] extends [U] ? [U] extends [T] ? true : false : false;

// ==================== Type-level tests ====================

// 1. Bundle accumulates labels
test('type-level: Bundle accumulates labels', () => {
	const bundle = new Bundle<{ pos: { x: number } }, {}, {}>('test')
		.addSystem('move')
		.setProcess(() => {})
		.and()
		.addSystem('render')
		.setProcess(() => {})
		.and();

	assertType<IsEqual<LabelsOf<typeof bundle>, 'move' | 'render'>>();

	// Runtime: bundle exists
	expect(bundle).toBeDefined();
});

// 2. Bundle accumulates groups
test('type-level: Bundle accumulates groups', () => {
	const bundle = new Bundle<{ pos: { x: number } }, {}, {}>('test')
		.addSystem('sys1')
		.inGroup('rendering')
		.setProcess(() => {})
		.and()
		.addSystem('sys2')
		.inGroup('physics')
		.setProcess(() => {})
		.and();

	assertType<IsEqual<GroupsOf<typeof bundle>, 'rendering' | 'physics'>>();

	expect(bundle).toBeDefined();
});

// 3. Builder accumulates from multiple bundles
test('type-level: Builder accumulates labels/groups from multiple bundles', () => {
	const bundleA = new Bundle<{ a: number }, {}, {}>('a')
		.addSystem('sysA')
		.inGroup('groupA')
		.setProcess(() => {})
		.and();

	const bundleB = new Bundle<{ b: number }, {}, {}>('b')
		.addSystem('sysB')
		.inGroup('groupB')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundleA)
		.withBundle(bundleB)
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
	const bundle = new Bundle<{ a: number }, {}, {}>('test')
		.addSystem('validLabel')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
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
	const bundle = new Bundle<{ a: number }, {}, {}>('test')
		.addSystem('sys')
		.inGroup('validGroup')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
		.build();

	// Valid - should compile
	ecs.disableSystemGroup('validGroup');

	// Invalid - should error
	// @ts-expect-error 'typo' is not a valid group
	ecs.disableSystemGroup('typo');

	expect(true).toBe(true);
});

// 6. No bundles → string (backward compat)
test('type-level: no bundles defaults to string for labels and groups', () => {
	const ecs = ECSpresso.create().build();

	// Should accept any string when no bundles contribute labels/groups
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
	const bundle = new Bundle<{ a: number }, {}, {}>('test')
		.addSystem('mySystem')
		.inGroup('myGroup')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
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
	const bundle = new Bundle<{ a: number }, {}, {}>('test')
		.addSystem('sys')
		.inGroup('groupA')
		.inGroup('groupB')
		.setProcess(() => {})
		.and();

	assertType<IsEqual<GroupsOf<typeof bundle>, 'groupA' | 'groupB'>>();

	expect(bundle).toBeDefined();
});

// 10. mergeBundles unions labels/groups
test('type-level: mergeBundles unions labels/groups', () => {
	const bundleA = new Bundle<{ a: number }, {}, {}>('a')
		.addSystem('sysA')
		.inGroup('groupA')
		.setProcess(() => {})
		.and();

	const bundleB = new Bundle<{ b: number }, {}, {}>('b')
		.addSystem('sysB')
		.inGroup('groupB')
		.setProcess(() => {})
		.and();

	const merged = mergeBundles('merged', bundleA, bundleB);

	assertType<IsEqual<LabelsOf<typeof merged>, 'sysA' | 'sysB'>>();
	assertType<IsEqual<GroupsOf<typeof merged>, 'groupA' | 'groupB'>>();

	expect(merged).toBeDefined();
});

// 11. LabelsOf/GroupsOf extraction utilities
test('type-level: LabelsOf and GroupsOf extraction', () => {
	const bundle = new Bundle<{ x: number }, { click: true }, { db: object }>('test')
		.addSystem('alpha')
		.inGroup('grp1')
		.setProcess(() => {})
		.and()
		.addSystem('beta')
		.inGroup('grp2')
		.setProcess(() => {})
		.and();

	assertType<IsEqual<LabelsOf<typeof bundle>, 'alpha' | 'beta'>>();
	assertType<IsEqual<GroupsOf<typeof bundle>, 'grp1' | 'grp2'>>();
	assertType<IsEqual<ComponentsOf<typeof bundle>, { x: number }>>();
	assertType<IsEqual<EventsOf<typeof bundle>, { click: true }>>();
	assertType<IsEqual<ResourcesOf<typeof bundle>, { db: object }>>();

	expect(bundle).toBeDefined();
});

// 12. Built-in bundle labels/groups flow through
test('type-level: built-in bundle labels/groups flow through', () => {
	const transformBundle = createTransformBundle();

	assertType<IsEqual<LabelsOf<typeof transformBundle>, 'transform-propagation'>>();
	assertType<IsEqual<GroupsOf<typeof transformBundle>, 'transform'>>();

	const ecs = ECSpresso.create()
		.withBundle(transformBundle)
		.build();

	ecs.removeSystem('transform-propagation');
	ecs.disableSystemGroup('transform');

	// @ts-expect-error not a label from transform bundle
	ecs.removeSystem('nonexistent');

	expect(ecs).toBeDefined();
});

// ==================== Runtime tests ====================

// 13. removeSystem works correctly
test('runtime: removeSystem returns true/false', () => {
	const bundle = new Bundle<{ pos: { x: number } }, {}, {}>('test')
		.addSystem('mySys')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
		.build();

	expect(ecs.removeSystem('mySys')).toBe(true);
	expect(ecs.removeSystem('mySys')).toBe(false);
});

// 14. disableSystemGroup/enableSystemGroup work correctly
test('runtime: disableSystemGroup/enableSystemGroup', () => {
	const bundle = new Bundle<{ pos: { x: number } }, {}, {}>('test')
		.addSystem('grouped')
		.inGroup('myGroup')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
		.build();

	expect(ecs.isSystemGroupEnabled('myGroup')).toBe(true);
	ecs.disableSystemGroup('myGroup');
	expect(ecs.isSystemGroupEnabled('myGroup')).toBe(false);
	ecs.enableSystemGroup('myGroup');
	expect(ecs.isSystemGroupEnabled('myGroup')).toBe(true);
});

// 15. getSystemsInGroup returns correct labels
test('runtime: getSystemsInGroup returns correct labels', () => {
	const bundle = new Bundle<{ pos: { x: number } }, {}, {}>('test')
		.addSystem('a')
		.inGroup('grp')
		.setProcess(() => {})
		.and()
		.addSystem('b')
		.inGroup('grp')
		.setProcess(() => {})
		.and()
		.addSystem('c')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
		.build();

	const inGroup = ecs.getSystemsInGroup('grp');
	expect(inGroup).toContain('a');
	expect(inGroup).toContain('b');
	expect(inGroup).not.toContain('c');
	expect(inGroup.length).toBe(2);
});

// 16. updateSystemPhase/updateSystemPriority work correctly
test('runtime: updateSystemPhase and updateSystemPriority', () => {
	const bundle = new Bundle<{ pos: { x: number } }, {}, {}>('test')
		.addSystem('mover')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
		.build();

	expect(ecs.updateSystemPhase('mover', 'render')).toBe(true);
	expect(ecs.updateSystemPhase('nonexistent' as 'mover', 'update')).toBe(false);

	expect(ecs.updateSystemPriority('mover', 100)).toBe(true);
	expect(ecs.updateSystemPriority('nonexistent' as 'mover', 50)).toBe(false);
});

// Additional: withEventTypes preserves labels/groups
test('type-level: withEventTypes preserves labels/groups', () => {
	const bundle = new Bundle<{ a: number }, {}, {}>('test')
		.addSystem('sys1')
		.inGroup('grp1')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
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
	const bundle = new Bundle<{ a: number }, {}, {}>('test')
		.addSystem('sys1')
		.inGroup('grp1')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
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
	const bundle = new Bundle<{ a: number }, {}, {}>('test')
		.addSystem('sys')
		.inGroup('myGroup')
		.setProcess(() => {})
		.and();

	const ecs = ECSpresso.create()
		.withBundle(bundle)
		.build();

	ecs.isSystemGroupEnabled('myGroup');
	ecs.getSystemsInGroup('myGroup');

	// @ts-expect-error
	ecs.isSystemGroupEnabled('wrong');
	// @ts-expect-error
	ecs.getSystemsInGroup('wrong');

	expect(true).toBe(true);
});
