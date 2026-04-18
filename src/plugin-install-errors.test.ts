import { test, expect } from 'bun:test';
import ECSpresso, { type InstallPluginParam, type PluginError } from './ecspresso';
import { definePlugin, type Plugin } from './plugin';
import type { EmptyConfig, WorldConfigFrom } from './type-utils';

// ==================== Type-level assertion helpers ====================

function assertType<_T extends true>() {}

type IsEqual<T, U> = [T] extends [U] ? [U] extends [T] ? true : false : false;

// ==================== Fixture configs ====================

type WorldCfg = WorldConfigFrom<
	{ pos: { x: number; y: number } },
	{ click: true },
	{ db: object },
	{ img: string },
	{}
>;

type ConflictingComponents = WorldConfigFrom<{ pos: { a: string } }>;
type ConflictingEvents = WorldConfigFrom<{}, { click: { mouseButton: number } }>;
type ConflictingResources = WorldConfigFrom<{}, {}, { db: string }>;
type ConflictingAssets = WorldConfigFrom<{}, {}, {}, { img: number }>;

type RequiresMissingComponent = WorldConfigFrom<{ missing: number }>;
type RequiresMissingEvent = WorldConfigFrom<{}, { missingEvent: true }>;
type RequiresMissingResource = WorldConfigFrom<{}, {}, { missingResource: object }>;
type RequiresMissingAsset = WorldConfigFrom<{}, {}, {}, { missingAsset: string }>;

// ==================== Type-level tests: failure messages ====================

test('type-level: conflicting component slot produces named error', () => {
	type Actual = InstallPluginParam<WorldCfg, ConflictingComponents, EmptyConfig, never, never, never, never>;
	type Expected = PluginError<"Plugin's components conflict with this world (same key, different type)">;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: conflicting event slot produces named error', () => {
	type Actual = InstallPluginParam<WorldCfg, ConflictingEvents, EmptyConfig, never, never, never, never>;
	type Expected = PluginError<"Plugin's events conflict with this world (same key, different type)">;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: conflicting resource slot produces named error', () => {
	type Actual = InstallPluginParam<WorldCfg, ConflictingResources, EmptyConfig, never, never, never, never>;
	type Expected = PluginError<"Plugin's resources conflict with this world (same key, different type)">;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: conflicting asset slot produces named error', () => {
	type Actual = InstallPluginParam<WorldCfg, ConflictingAssets, EmptyConfig, never, never, never, never>;
	type Expected = PluginError<"Plugin's assets conflict with this world (same key, different type)">;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: multi-slot conflict produces union of named errors', () => {
	type MultiConflict = WorldConfigFrom<{ pos: { a: string } }, { click: { mouseButton: number } }>;
	type Actual = InstallPluginParam<WorldCfg, MultiConflict, EmptyConfig, never, never, never, never>;
	type Expected =
		| PluginError<"Plugin's components conflict with this world (same key, different type)">
		| PluginError<"Plugin's events conflict with this world (same key, different type)">;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: missing required component produces named error', () => {
	type Actual = InstallPluginParam<WorldCfg, EmptyConfig, RequiresMissingComponent, never, never, never, never>;
	type Expected = PluginError<'Plugin requires components not provided by this world'>;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: missing required event produces named error', () => {
	type Actual = InstallPluginParam<WorldCfg, EmptyConfig, RequiresMissingEvent, never, never, never, never>;
	type Expected = PluginError<'Plugin requires events not provided by this world'>;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: missing required resource produces named error', () => {
	type Actual = InstallPluginParam<WorldCfg, EmptyConfig, RequiresMissingResource, never, never, never, never>;
	type Expected = PluginError<'Plugin requires resources not provided by this world'>;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: missing required asset produces named error', () => {
	type Actual = InstallPluginParam<WorldCfg, EmptyConfig, RequiresMissingAsset, never, never, never, never>;
	type Expected = PluginError<'Plugin requires assets not provided by this world'>;
	assertType<IsEqual<Actual, Expected>>();
});

test('type-level: multi-slot missing requirements produce union of named errors', () => {
	type MultiMissing = WorldConfigFrom<{ missing: number }, { missingEvent: true }>;
	type Actual = InstallPluginParam<WorldCfg, EmptyConfig, MultiMissing, never, never, never, never>;
	type Expected =
		| PluginError<'Plugin requires components not provided by this world'>
		| PluginError<'Plugin requires events not provided by this world'>;
	assertType<IsEqual<Actual, Expected>>();
});

// ==================== Type-level tests: happy path ====================

test('type-level: compatible plugin with satisfied requirements resolves to Plugin', () => {
	type CompatibleProvide = WorldConfigFrom<{ vel: { x: number; y: number } }>;
	type SatisfiedRequires = WorldConfigFrom<{ pos: { x: number; y: number } }>;
	type Actual = InstallPluginParam<WorldCfg, CompatibleProvide, SatisfiedRequires, 'label', 'group', 'ag', 'rq'>;
	type Expected = Plugin<CompatibleProvide, SatisfiedRequires, 'label', 'group', 'ag', 'rq'>;
	assertType<IsEqual<Actual, Expected>>();
});

// ==================== Runtime smoke test ====================

test('runtime: installPlugin still installs a compatible plugin', () => {
	const world = ECSpresso.create().withComponentTypes<{ pos: number }>().build();
	let installed = false;
	const plugin = definePlugin('test-compat')
		.withComponentTypes<{ vel: number }>()
		.install(() => { installed = true; });
	world.installPlugin(plugin);
	expect(installed).toBe(true);
});

// ==================== Wiring test ====================
// Confirms installPlugin's overload is actually connected to InstallPluginParam.
// The type-level message-content tests above compare expected strings against
// InstallPluginParam directly; these @ts-expect-error calls prove the overload
// routes through the same logic so incompatible plugins are rejected at the
// call site.

test('wiring: installPlugin rejects incompatible plugin at call site', () => {
	const world = ECSpresso.create().withComponentTypes<{ pos: number }>().build();

	const conflictingPlugin = definePlugin('bad')
		.withComponentTypes<{ pos: string }>()
		.install(() => {});
	// @ts-expect-error - conflicting component type should be rejected
	world.installPlugin(conflictingPlugin);

	const needyPlugin = definePlugin('needy')
		.requires<WorldConfigFrom<{ missing: number }>>()
		.install(() => {});
	// @ts-expect-error - missing required component should be rejected
	world.installPlugin(needyPlugin);

	expect(true).toBe(true);
});
