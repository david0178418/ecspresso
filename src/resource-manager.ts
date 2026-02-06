/**
 * Resource factory with declared dependencies and optional disposal callback
 */
export interface ResourceFactoryWithDeps<T, Context = unknown, D extends string = string> {
	dependsOn?: readonly D[];
	factory: (context: Context) => T | Promise<T>;
	onDispose?: (resource: T, context: Context) => void | Promise<void>;
}

/**
 * Type guard for detecting { factory } pattern (with optional dependsOn and onDispose)
 */
function isFactoryWithDeps<T>(resource: unknown): resource is ResourceFactoryWithDeps<T> {
	return (
		typeof resource === 'object' &&
		resource !== null &&
		'factory' in resource &&
		typeof (resource as ResourceFactoryWithDeps<T>).factory === 'function'
	);
}

/**
 * Topological sort with cycle detection
 */
function topologicalSort<K extends string>(
	keys: readonly K[],
	getDeps: (key: K) => readonly string[]
): K[] {
	const sorted: K[] = [];
	const visited = new Set<K>();
	const visiting = new Set<K>();

	function visit(key: K, path: K[] = []): void {
		if (visited.has(key)) return;
		if (visiting.has(key)) {
			throw new Error(`Circular resource dependency: ${[...path, key].join(' -> ')}`);
		}

		visiting.add(key);
		for (const dep of getDeps(key)) {
			const found = keys.find(k => k === dep);
			if (found) {
				visit(found, [...path, key]);
			}
		}
		visiting.delete(key);
		visited.add(key);
		sorted.push(key);
	}

	for (const key of keys) {
		visit(key);
	}
	return sorted;
}

/**
 * When Context is unknown (default), context args are optional.
 * When Context is a specific type (e.g. ECSpresso<...>), context is required.
 */
type ContextArgs<Context> = unknown extends Context ? [context?: Context] : [context: Context];

export default
class ResourceManager<
	ResourceTypes extends Record<string, any> = Record<string, any>,
	Context = unknown,
> {
	private resources: Map<keyof ResourceTypes, any> = new Map();
	private resourceFactories: Map<keyof ResourceTypes, (context: Context) => any | Promise<any>> = new Map();
	private resourceDependencies: Map<keyof ResourceTypes, readonly (keyof ResourceTypes & string)[]> = new Map();
	private resourceDisposers: Map<keyof ResourceTypes, (resource: any, context: Context) => void | Promise<void>> = new Map();
	private initializedResourceKeys: Set<keyof ResourceTypes> = new Set();

	/**
	 * Add a resource to the manager
	 * @param label The resource key
	 * @param resource The resource value, a factory function, or a factory with dependencies
	 * @returns The resource manager instance for chaining
	 */
	add<K extends keyof ResourceTypes>(
		label: K,
		resource:
			| ResourceTypes[K]
			| ((context: Context) => ResourceTypes[K] | Promise<ResourceTypes[K]>)
			| ResourceFactoryWithDeps<ResourceTypes[K], Context, keyof ResourceTypes & string>,
	) {
		if (isFactoryWithDeps<ResourceTypes[K]>(resource)) {
			// Factory with optional dependencies and/or onDispose
			this.resourceFactories.set(label, resource.factory as (context: Context) => any | Promise<any>);
			// Type guard narrows to default D=string; the call-site constraint ensures correctness
			this.resourceDependencies.set(label, (resource.dependsOn ?? []) as readonly (keyof ResourceTypes & string)[]);
			if (resource.onDispose) {
				this.resourceDisposers.set(label, resource.onDispose as (resource: any, context: Context) => void | Promise<void>);
			}
		} else if (this._isFactoryFunction(resource)) {
			// Factory function (no dependencies)
			this.resourceFactories.set(label, resource as (context: Context) => any | Promise<any>);
			this.resourceDependencies.set(label, []);
		} else {
			// Direct resource value
			this.resources.set(label, resource);
			this.initializedResourceKeys.add(label);
			this.resourceDependencies.set(label, []);
		}
		return this;
	}

	/**
	 * Improved detection of factory functions vs direct values/classes
	 * @private
	 */
	private _isFactoryFunction(value: unknown): boolean {
		if (typeof value !== 'function') {
			return false;
		}

		// Get the function as string for analysis
		const funcStr = value.toString();

		// Check for explicit class syntax
		if (funcStr.startsWith('class ')) {
			return false;
		}

		// Check for native functions/constructors
		if (funcStr.includes('[native code]')) {
			return false;
		}

		// Check if it's a constructor function (has prototype properties beyond constructor)
		// This is a more nuanced check than just checking for prototype existence
		if (value.prototype) {
			const prototypeKeys = Object.getOwnPropertyNames(value.prototype);
			// Constructor functions typically have additional prototype properties
			// Regular functions only have 'constructor'
			if (prototypeKeys.length > 1 || (prototypeKeys.length === 1 && prototypeKeys[0] !== 'constructor')) {
				return false;
			}
		}

		// Additional heuristics for constructor functions
		// Constructor functions typically start with capital letter
		const firstChar = value.name.charAt(0);
		if (firstChar && firstChar === firstChar.toUpperCase() && value.name.length > 1) {
			// But this alone isn't enough - many factory functions also start with capitals
			// Only treat as constructor if it also has other constructor-like characteristics
			if (funcStr.includes('this.') || funcStr.includes('new ')) {
				return false;
			}
		}

		// If it passes all checks, treat as factory function
		return true;
	}

	/**
	 * Try to get a resource from the manager.
	 * Returns the resource value if it exists, or undefined if not found.
	 * Like `get`, initializes factory resources on first access.
	 * @param label The resource key
	 * @param context Context to pass to factory functions (usually the ECSpresso instance)
	 * @returns The resource value, or undefined if not found
	 * @see get — the throwing alternative
	 */
	tryGet<K extends keyof ResourceTypes>(
		label: K,
		...args: ContextArgs<Context>
	): ResourceTypes[K] | undefined {
		if (!this.has(label)) return undefined;
		return this.get(label, ...args);
	}

	/**
	 * Get a resource from the manager
	 * @param label The resource key
	 * @param context Context to pass to factory functions (usually the ECSpresso instance)
	 * @returns The resource value
	 * @throws Error if resource not found
	 * @see tryGet — the non-throwing alternative
	 */
	get<K extends keyof ResourceTypes>(
		label: K,
		...args: ContextArgs<Context>
	): ResourceTypes[K] {
		// Check if we already have the initialized resource
		const resource = this.resources.get(label);
		if (resource !== undefined) {
			return resource;
		}

		// Check if we have a factory for this resource
		const factory = this.resourceFactories.get(label);
		if (factory === undefined) {
			throw new Error(`Resource ${String(label)} not found`);
		}

		// Initialize the resource, passing the context
		const context = args[0] as Context;
		const initializedResource = factory(context);

		// If it's not a Promise, store it immediately
		if (!(initializedResource instanceof Promise)) {
			this.resources.set(label, initializedResource);
			this.initializedResourceKeys.add(label);
		}

		return initializedResource;
	}

	/**
	 * Check if a resource exists
	 * @param label The resource key
	 * @returns True if the resource exists
	 */
	has<K extends keyof ResourceTypes>(label: K): boolean {
		return this.resources.has(label) || this.resourceFactories.has(label);
	}

	/**
	 * Remove a resource (without calling onDispose)
	 * @param label The resource key
	 * @returns True if the resource was removed
	 */
	remove<K extends keyof ResourceTypes>(label: K): boolean {
		const resourceRemoved = this.resources.delete(label);
		const factoryRemoved = this.resourceFactories.delete(label);
		this.resourceDependencies.delete(label);
		this.resourceDisposers.delete(label);
		this.initializedResourceKeys.delete(label);
		return resourceRemoved || factoryRemoved;
	}

	/**
	 * Get all resource keys
	 * @returns Array of resource keys
	 */
	getKeys(): Array<keyof ResourceTypes> {
		const keys = new Set([
			...this.resources.keys(),
			...this.resourceFactories.keys()
		]);
		return Array.from(keys);
	}

	/**
	 * Check if a resource needs to be initialized
	 * @param label The resource key
	 * @returns True if the resource needs initialization
	 */
	needsInitialization<K extends keyof ResourceTypes>(label: K): boolean {
		return this.resourceFactories.has(label) && !this.initializedResourceKeys.has(label);
	}

	/**
	 * Get all resource keys that need to be initialized
	 * @returns Array of resource keys that need initialization
	 */
	getPendingInitializationKeys(): Array<keyof ResourceTypes> {
		return Array
			.from(this.resourceFactories.keys())
			.filter(key => !this.initializedResourceKeys.has(key));
	}

	/**
	 * Initialize a specific resource if it's a factory function
	 * @param label The resource key
	 * @param context Context to pass to factory functions
	 * @returns Promise that resolves when the resource is initialized
	 */
	async initializeResource<K extends keyof ResourceTypes>(
		label: K,
		...args: ContextArgs<Context>
	): Promise<void> {
		if (!this.resourceFactories.has(label) || this.initializedResourceKeys.has(label)) {
			return;
		}

		const factory = this.resourceFactories.get(label)!;
		const context = args[0] as Context;
		const initializedResource = await factory(context);
		this.resources.set(label, initializedResource);
		this.initializedResourceKeys.add(label);
		this.resourceFactories.delete(label);
	}

	/**
	 * Initialize specific resources or all resources that haven't been initialized yet.
	 * Resources are initialized in topological order based on their dependencies.
	 * @param context Context to pass to factory functions (usually the ECSpresso instance)
	 * @param keys Optional array of resource keys to initialize
	 * @returns Promise that resolves when the specified resources are initialized
	 */
	async initializeResources<K extends keyof ResourceTypes>(
		...args: [...ContextArgs<Context>, ...K[]]
	): Promise<void> {
		// First arg is context (when Context is typed), remaining are keys
		const keys = args.slice(1) as K[];

		// Determine which keys to initialize
		const keysToInit = keys.length === 0
			? this.getPendingInitializationKeys()
			: keys;

		// If no keys to initialize, we're done
		if (keysToInit.length === 0) return;

		// Sort keys topologically based on dependencies
		const sortedKeys = topologicalSort(
			keysToInit as readonly (keyof ResourceTypes & string)[],
			(key) => [...(this.resourceDependencies.get(key) ?? [])]
		);

		// Initialize in order (sequentially to respect dependencies)
		for (const key of sortedKeys) {
			await this.initializeResource(key, ...args.slice(0, 1) as ContextArgs<Context>);
		}
	}

	/**
	 * Get the dependencies of a resource
	 * @param label The resource key
	 * @returns Array of resource keys that this resource depends on
	 */
	getDependencies<K extends keyof ResourceTypes>(label: K): readonly (keyof ResourceTypes & string)[] {
		return this.resourceDependencies.get(label) ?? [];
	}

	/**
	 * Dispose a single resource, calling its onDispose callback if it exists
	 * @param label The resource key to dispose
	 * @param context Context to pass to the onDispose callback
	 * @returns True if the resource existed and was disposed, false if it didn't exist
	 */
	async disposeResource<K extends keyof ResourceTypes>(
		label: K,
		...args: ContextArgs<Context>
	): Promise<boolean> {
		if (!this.resources.has(label) && !this.resourceFactories.has(label)) {
			return false;
		}

		// Only call onDispose if the resource was initialized
		if (this.initializedResourceKeys.has(label)) {
			const disposer = this.resourceDisposers.get(label);
			const resource = this.resources.get(label);
			if (disposer && resource !== undefined) {
				const context = args[0] as Context;
				await disposer(resource, context);
			}
		}

		// Clean up all tracking
		this.resources.delete(label);
		this.resourceFactories.delete(label);
		this.resourceDependencies.delete(label);
		this.resourceDisposers.delete(label);
		this.initializedResourceKeys.delete(label);

		return true;
	}

	/**
	 * Dispose all initialized resources in reverse dependency order.
	 * Resources that depend on others are disposed first.
	 * @param context Context to pass to onDispose callbacks
	 */
	async disposeResources(
		...args: ContextArgs<Context>
	): Promise<void> {
		// Get only initialized resource keys
		const initializedKeys = Array.from(this.initializedResourceKeys);

		if (initializedKeys.length === 0) return;

		// Sort in dependency order, then reverse for disposal
		const sortedKeys = topologicalSort(
			initializedKeys as readonly (keyof ResourceTypes & string)[],
			(key) => [...(this.resourceDependencies.get(key) ?? [])]
		).reverse();

		// Dispose in reverse dependency order
		for (const key of sortedKeys) {
			await this.disposeResource(key, ...args);
		}
	}
}
