import { createBundleSystemBuilder, SystemBuilder } from './system-builder';
import type ECSpresso from './ecspresso';
import { MergeAll } from './types';

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
	ComponentTypes extends Record<string, any> = Record<string, any>,
	EventTypes extends Record<string, any> = Record<string, any>,
	ResourceTypes extends Record<string, any> = Record<string, any>,
> {
	private _systems: SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, any>[] = [];
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
	 * Add a system to this bundle
	 */
	addSystem(label: string) {
		const system = createBundleSystemBuilder<ComponentTypes, EventTypes, ResourceTypes>(label, this);

		this._systems.push(system);

		return system;
	}

	/**
	 * Add a resource to this bundle
	 * @param label The resource key
	 * @param resource The resource value
	 */
	addResource<K extends keyof ResourceTypes>(label: K, resource: ResourceTypes[K]) {
		this._resources.set(label, resource);
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
	getResource<K extends keyof ResourceTypes>(key: K): ResourceTypes[K] | undefined {
		return this._resources.get(key) as ResourceTypes[K] | undefined;
	}

	/**
	 * Get all system builders in this bundle
	 */
	getSystemBuilders(): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, any>[] {
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

export function mergeBundles<
	Bundles extends Array<Bundle<any, any, any>>
>(
	id: string,
	...bundles: Bundles
): Bundle<
	MergeAll<{ [K in keyof Bundles]: Bundles[K] extends Bundle<infer C, any, any> ? C : never }>,
	MergeAll<{ [K in keyof Bundles]: Bundles[K] extends Bundle<any, infer E, any> ? E : never }>,
	MergeAll<{ [K in keyof Bundles]: Bundles[K] extends Bundle<any, any, infer R> ? R : never }>
> {
	if (bundles.length === 0) {
		return new Bundle(id);
	}

	const combined = new Bundle(id);

	for (const bundle of bundles) {
		for (const system of bundle.getSystemBuilders()) {
			combined.addSystem(system as any);
		}

		// Add resources from this bundle
		for (const [label, resource] of bundle.getResources().entries()) {
			combined.addResource(label as any, resource);
		}
	}

	return combined as any;
}
