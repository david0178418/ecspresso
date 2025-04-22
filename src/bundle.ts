import { createBundleSystemBuilder, SystemBuilderWithBundle } from './system-builder';
import type ECSpresso from './ecspresso';

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
> {
	private _systems: SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, any>[] = [];
	private _resources: Map<keyof ResourceTypes, ResourceTypes[keyof ResourceTypes]> = new Map();
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
	addSystem<Q extends Record<string, any>>(builder: SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, Q>): SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, Q>;
	addSystem(label: string): SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, {}>;
	addSystem(builderOrLabel: string | SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, any>) {
		if (typeof builderOrLabel === 'string') {
			const system = createBundleSystemBuilder<ComponentTypes, EventTypes, ResourceTypes>(builderOrLabel, this);
			this._systems.push(system);
			return system;
		} else {
			this._systems.push(builderOrLabel);
			return builderOrLabel;
		}
	}

	/**
	 * Add a resource to this bundle
	 * @param label The resource key
	 * @param resource The resource value or a factory function that returns the resource
	 */
	addResource<K extends keyof ResourceTypes>(
		label: K,
		resource: ResourceTypes[K] | ((ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>) => ResourceTypes[K] | Promise<ResourceTypes[K]>)
	) {
		// We need this cast because TypeScript doesn't recognize that a value of type
		// ResourceTypes[K] | (() => ResourceTypes[K] | Promise<ResourceTypes[K]>)
		// can be properly assigned to Map<keyof ResourceTypes, ResourceTypes[keyof ResourceTypes]>
		this._resources.set(label, resource as unknown as ResourceTypes[K]);
		return this;
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
	registerSystemsWithEcspresso(ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>) {
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
	getSystemBuilders(): SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, any>[] {
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

// Check if object has exactly the same type
type Exactly<T, U> =
	T extends U
		? U extends T
			? true
			: false
		: false;

// Create a type error for incompatible types
type IncompatibleBundles<
	C1 extends Record<string, any>,
	C2 extends Record<string, any>,
	E1 extends Record<string, any>,
	E2 extends Record<string, any>,
	R1 extends Record<string, any>,
	R2 extends Record<string, any>
> = {
	[K in keyof C1 & keyof C2]: Exactly<C1[K], C2[K]> extends false ? never : unknown;
} & {
	[K in keyof E1 & keyof E2]: Exactly<E1[K], E2[K]> extends false ? never : unknown;
} & {
	[K in keyof R1 & keyof R2]: Exactly<R1[K], R2[K]> extends false ? never : unknown;
};

/**
 * Function that merges multiple bundles into a single bundle
 */
export function mergeBundles<
	C1 extends Record<string, any>,
	E1 extends Record<string, any>,
	R1 extends Record<string, any>,
	C2 extends Record<string, any>,
	E2 extends Record<string, any>,
	R2 extends Record<string, any>
>(
	id: string,
	bundle1: Bundle<C1, E1, R1>,
	bundle2: Bundle<C2, E2, R2> & IncompatibleBundles<C1, C2, E1, E2, R1, R2>
): Bundle<C1 & C2, E1 & E2, R1 & R2>;

export function mergeBundles<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>
>(
	id: string,
	...bundles: Array<Bundle<ComponentTypes, EventTypes, ResourceTypes>>
): Bundle<ComponentTypes, EventTypes, ResourceTypes>;

export function mergeBundles(
	id: string,
	...bundles: Array<Bundle>
): Bundle {
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
			combined.addResource(label, resource);
		}
	}

	return combined;
}
