import { createBundleSystemBuilder, SystemBuilderWithBundle } from './system-builder';
import type ECSpresso from './ecspresso';
import type { AssetDefinition } from './asset-types';
import type { ScreenDefinition } from './screen-types';
import type { BundlesAreCompatible } from './type-utils';
import type { QueryDefinition } from './types';

/**
 * Generates a unique ID for a bundle
 */
function generateBundleId(): string {
	return `bundle_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Bundle class that encapsulates a set of components, resources, events, and systems
 * that can be merged into a ECSpresso instance
 */
export default class Bundle<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
	AssetTypes extends Record<string, unknown> = {},
	ScreenStates extends Record<string, ScreenDefinition<any, any>> = {},
	Labels extends string = never,
	Groups extends string = never,
> {
	private _systems: SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, any, any, any, any, any>[] = [];
	private _resources: Map<keyof ResourceTypes, ResourceTypes[keyof ResourceTypes]> = new Map();
	private _assets: Map<string, AssetDefinition<unknown>> = new Map();
	private _assetGroups: Map<string, Map<string, () => Promise<unknown>>> = new Map();
	private _screens: Map<string, ScreenDefinition<any, any>> = new Map();
	private _disposeCallbacks: Map<string, (value: unknown) => void> = new Map();
	private _requiredComponents: Map<string, Array<{ component: string; factory: () => unknown }>> = new Map();
	private _id: string;

	constructor(id?: string) {
		this._id = id || generateBundleId();
	}

	/**
	 * Get the unique ID of this bundle
	 */
	get id(): string {
		return this._id;
	}

	/**
	 * Set the ID of this bundle
	 * @internal Used by combineBundles
	 */
	set id(value: string) {
		this._id = value;
	}

	/**
	 * Add a system to this bundle, by label (creating a new builder) or by reusing an existing one
	 */
	addSystem<Q extends Record<string, QueryDefinition<ComponentTypes>>, BL extends string, BG extends string, L extends string, SG extends string>(builder: SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Q, BL, BG, L, SG>): SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Q, Labels, Groups, L, SG>;
	addSystem<L extends string>(label: L): SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, {}, Labels, Groups, L>;
	addSystem(builderOrLabel: string | SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, any, any, any, any, any>) {
		if (typeof builderOrLabel === 'string') {
			const system = createBundleSystemBuilder<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Labels, Groups, typeof builderOrLabel>(builderOrLabel, this as any);
			this._systems.push(system as any);
			return system;
		} else {
			this._systems.push(builderOrLabel);
			return builderOrLabel;
		}
	}

	/**
	 * Add a resource to this bundle
	 * @param label The resource key
	 * @param resource The resource value, a factory function, or a factory with dependencies
	 */
	addResource<K extends keyof ResourceTypes>(
		label: K,
		resource:
			| ResourceTypes[K]
			| ((ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, any, any>) => ResourceTypes[K] | Promise<ResourceTypes[K]>)
			| { dependsOn: readonly string[]; factory: (ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, any, any>) => ResourceTypes[K] | Promise<ResourceTypes[K]> }
	) {
		// We need this cast because TypeScript doesn't recognize that a value of type
		// ResourceTypes[K] | (() => ResourceTypes[K] | Promise<ResourceTypes[K]>) | { dependsOn, factory }
		// can be properly assigned to Map<keyof ResourceTypes, ResourceTypes[keyof ResourceTypes]>
		this._resources.set(label, resource as unknown as ResourceTypes[K]);
		return this;
	}

	/**
	 * Add an asset to this bundle
	 * @param key The asset key
	 * @param loader Function that loads and returns the asset
	 * @param options Optional asset configuration
	 */
	addAsset<K extends string, T>(
		key: K,
		loader: () => Promise<T>,
		options?: { eager?: boolean; group?: string }
	): Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes & Record<K, T>, ScreenStates, Labels, Groups> {
		this._assets.set(key, {
			loader,
			eager: options?.eager ?? true,
			group: options?.group,
		});
		return this as unknown as Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes & Record<K, T>, ScreenStates, Labels, Groups>;
	}

	/**
	 * Add a group of assets to this bundle
	 * @param groupName The group name
	 * @param assets Object mapping asset keys to loader functions
	 */
	addAssetGroup<G extends string, T extends Record<string, () => Promise<unknown>>>(
		groupName: G,
		assets: T
	): Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes & { [K in keyof T]: Awaited<ReturnType<T[K]>> }, ScreenStates, Labels, Groups> {
		const groupAssets = new Map<string, () => Promise<unknown>>();
		for (const [key, loader] of Object.entries(assets)) {
			groupAssets.set(key, loader as () => Promise<unknown>);
			this._assets.set(key, {
				loader: loader as () => Promise<unknown>,
				eager: false,
				group: groupName,
			});
		}
		this._assetGroups.set(groupName, groupAssets);
		return this as unknown as Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes & { [K in keyof T]: Awaited<ReturnType<T[K]>> }, ScreenStates, Labels, Groups>;
	}

	/**
	 * Add a screen to this bundle
	 * @param name The screen name
	 * @param definition The screen definition
	 */
	addScreen<K extends string, Config extends Record<string, unknown>, State extends Record<string, unknown>>(
		name: K,
		definition: ScreenDefinition<Config, State>
	): Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates & Record<K, ScreenDefinition<Config, State>>, Labels, Groups> {
		this._screens.set(name, definition);
		return this as unknown as Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates & Record<K, ScreenDefinition<Config, State>>, Labels, Groups>;
	}

	/**
	 * Get all asset definitions in this bundle
	 */
	getAssets(): Map<string, AssetDefinition<unknown>> {
		return new Map(this._assets);
	}

	/**
	 * Get all screen definitions in this bundle
	 */
	getScreens(): Map<string, ScreenDefinition<any, any>> {
		return new Map(this._screens);
	}

	/**
	 * Register a dispose callback for a component type in this bundle.
	 * Called when a component is removed (explicit removal, entity destruction, or replacement).
	 * @param componentName The component type to register disposal for
	 * @param callback Function receiving the component value being disposed
	 * @returns This bundle for method chaining
	 */
	registerDispose<K extends keyof ComponentTypes>(
		componentName: K,
		callback: (value: ComponentTypes[K]) => void
	): this {
		this._disposeCallbacks.set(componentName as string, callback as (value: unknown) => void);
		return this;
	}

	/**
	 * Get all registered dispose callbacks in this bundle
	 */
	getDisposeCallbacks(): Map<string, (value: unknown) => void> {
		return new Map(this._disposeCallbacks);
	}

	/**
	 * Register a required component relationship.
	 * When an entity gains `trigger`, the `required` component is auto-added
	 * (using `factory` for the default value) if not already present.
	 * @param trigger The component whose presence triggers auto-addition
	 * @param required The component to auto-add
	 * @param factory Function that creates the default value for the required component
	 * @returns This bundle for method chaining
	 */
	registerRequired<
		Trigger extends keyof ComponentTypes,
		Required extends keyof ComponentTypes,
	>(
		trigger: Trigger,
		required: Required,
		factory: () => ComponentTypes[Required]
	): this {
		const triggerKey = trigger as string;
		const requiredKey = required as string;

		if (triggerKey === requiredKey) {
			throw new Error(`Cannot require a component to depend on itself: '${triggerKey}'`);
		}

		const existing = this._requiredComponents.get(triggerKey) ?? [];

		if (existing.some(r => r.component === requiredKey)) {
			throw new Error(`Required component '${requiredKey}' already registered for trigger '${triggerKey}'`);
		}

		// Cycle detection within this bundle's requirements
		this._checkRequiredCycle(triggerKey, requiredKey);

		existing.push({ component: requiredKey, factory: factory as () => unknown });
		this._requiredComponents.set(triggerKey, existing);
		return this;
	}

	/**
	 * Get all registered required component mappings in this bundle
	 */
	getRequiredComponents(): Map<string, Array<{ component: string; factory: () => unknown }>> {
		const result = new Map<string, Array<{ component: string; factory: () => unknown }>>();
		for (const [trigger, reqs] of this._requiredComponents) {
			result.set(trigger, [...reqs]);
		}
		return result;
	}

	/**
	 * Check for circular dependencies in the required components graph
	 * @throws Error if adding the new edge would create a cycle
	 */
	private _checkRequiredCycle(trigger: string, newRequired: string): void {
		const visited = new Set<string>();
		const stack = [newRequired];

		while (stack.length > 0) {
			const current = stack.pop()!;
			if (current === trigger) {
				throw new Error(
					`Circular required component dependency: '${trigger}' -> '${newRequired}' -> ... -> '${trigger}'`
				);
			}
			if (visited.has(current)) continue;
			visited.add(current);

			const reqs = this._requiredComponents.get(current);
			if (reqs) {
				for (const r of reqs) {
					stack.push(r.component);
				}
			}
		}
	}

	/**
	 * Internal method to set a dispose callback
	 * @internal Used by mergeBundles
	 */
	_setDisposeCallback(name: string, callback: (value: unknown) => void): void {
		this._disposeCallbacks.set(name, callback);
	}

	/**
	 * Internal method to set a resource
	 * @internal Used by mergeBundles
	 */
	_setResource(key: string, value: unknown): void {
		this._resources.set(key as keyof ResourceTypes, value as ResourceTypes[keyof ResourceTypes]);
	}

	/**
	 * Internal method to set an asset definition
	 * @internal Used by mergeBundles
	 */
	_setAsset(key: string, definition: AssetDefinition<unknown>): void {
		this._assets.set(key, definition);
	}

	/**
	 * Internal method to set a screen definition
	 * @internal Used by mergeBundles
	 */
	_setScreen(name: string, definition: ScreenDefinition<any, any>): void {
		this._screens.set(name, definition);
	}

	/**
	 * Internal method to add a required component entry
	 * @internal Used by mergeBundles
	 */
	_addRequired(trigger: string, component: string, factory: () => unknown): void {
		const existing = this._requiredComponents.get(trigger) ?? [];
		if (!existing.some(r => r.component === component)) {
			existing.push({ component, factory });
			this._requiredComponents.set(trigger, existing);
		}
	}

	/**
	 * Get all systems defined in this bundle
	 * Returns built System objects instead of SystemBuilders
	 */
	getSystems() {
		return this._systems.map(system => system.build());
	}

	/**
	 * Register all systems in this bundle with an ECSpresso instance
	 * @internal Used by ECSpresso when adding a bundle
	 */
	registerSystemsWithEcspresso(ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>) {
		for (const systemBuilder of this._systems) {
			systemBuilder.build(ecspresso);
		}
	}

	/**
	 * Get all resources defined in this bundle
	 */
	getResources(): Map<keyof ResourceTypes, ResourceTypes[keyof ResourceTypes]> {
		return new Map(this._resources);
	}

	/**
	 * Get a specific resource by key
	 * @param key The resource key
	 * @returns The resource value or undefined if not found
	 */
	getResource<K extends keyof ResourceTypes>(key: K): ResourceTypes[K] {
		return this._resources.get(key) as ResourceTypes[K];
	}

	/**
	 * Get all system builders in this bundle
	 */
	getSystemBuilders(): SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, any, any, any, any, any>[] {
		return [...this._systems];
	}

	/**
	 * Check if this bundle has a specific resource
	 * @param key The resource key to check
	 * @returns True if the resource exists
	 */
	hasResource<K extends keyof ResourceTypes>(key: K): boolean {
		return this._resources.has(key);
	}
}

/**
 * Function that merges multiple bundles into a single bundle
 */
export function mergeBundles<
	C1 extends Record<string, any>,
	E1 extends Record<string, any>,
	R1 extends Record<string, any>,
	A1 extends Record<string, unknown>,
	S1 extends Record<string, ScreenDefinition<any, any>>,
	L1 extends string,
	G1 extends string,
	C2 extends Record<string, any>,
	E2 extends Record<string, any>,
	R2 extends Record<string, any>,
	A2 extends Record<string, unknown>,
	S2 extends Record<string, ScreenDefinition<any, any>>,
	L2 extends string,
	G2 extends string,
>(
	id: string,
	bundle1: Bundle<C1, E1, R1, A1, S1, L1, G1>,
	bundle2: BundlesAreCompatible<C1, C2, E1, E2, R1, R2, A1, A2, S1, S2> extends true
		? Bundle<C2, E2, R2, A2, S2, L2, G2>
		: never
): Bundle<C1 & C2, E1 & E2, R1 & R2, A1 & A2, S1 & S2, L1 | L2, G1 | G2>;

export function mergeBundles<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	AssetTypes extends Record<string, unknown>,
	ScreenStates extends Record<string, ScreenDefinition<any, any>>,
	Labels extends string,
	Groups extends string,
>(
	id: string,
	...bundles: Array<Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Labels, Groups>>
): Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Labels, Groups>;

export function mergeBundles(
	id: string,
	...bundles: Array<Bundle<any, any, any, any, any, any, any>>
): Bundle<any, any, any, any, any, any, any> {
	if (bundles.length === 0) {
		return new Bundle(id);
	}

	const combined = new Bundle(id);

	for (const bundle of bundles) {
		for (const system of bundle.getSystemBuilders()) {
			// reuse the full builder so we carry over queries, hooks, and handlers
			combined.addSystem(system);
		}

		// Add resources from this bundle
		for (const [label, resource] of bundle.getResources().entries()) {
			combined._setResource(label as string, resource);
		}

		// Add assets from this bundle
		for (const [key, definition] of bundle.getAssets().entries()) {
			combined._setAsset(key, definition);
		}

		// Add screens from this bundle
		for (const [name, definition] of bundle.getScreens().entries()) {
			combined._setScreen(name, definition);
		}

		// Add dispose callbacks from this bundle
		for (const [name, callback] of bundle.getDisposeCallbacks().entries()) {
			combined._setDisposeCallback(name, callback);
		}

		// Add required components from this bundle
		for (const [trigger, reqs] of bundle.getRequiredComponents().entries()) {
			for (const { component, factory } of reqs) {
				combined._addRequired(trigger, component, factory);
			}
		}
	}

	return combined;
}
