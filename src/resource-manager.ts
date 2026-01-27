/**
 * Resource factory with declared dependencies and optional disposal callback
 */
interface ResourceFactoryWithDeps<T> {
	dependsOn?: readonly string[];
	factory: (context?: any) => T | Promise<T>;
	onDispose?: (resource: T, context?: any) => void | Promise<void>;
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
function topologicalSort(
	keys: readonly string[],
	getDeps: (key: string) => readonly string[]
): string[] {
	const sorted: string[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	function visit(key: string, path: string[] = []): void {
		if (visited.has(key)) return;
		if (visiting.has(key)) {
			throw new Error(`Circular resource dependency: ${[...path, key].join(' -> ')}`);
		}

		visiting.add(key);
		for (const dep of getDeps(key)) {
			if (keys.includes(dep)) {
				visit(dep, [...path, key]);
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

export default
class ResourceManager<ResourceTypes extends Record<string, any> = Record<string, any>> {
	private resources: Map<string, any> = new Map();
	private resourceFactories: Map<string, (context?: any) => any | Promise<any>> = new Map();
	private resourceDependencies: Map<string, readonly string[]> = new Map();
	private resourceDisposers: Map<string, (resource: any, context?: any) => void | Promise<void>> = new Map();
	private initializedResourceKeys: Set<string> = new Set();

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
			| ((context?: any) => ResourceTypes[K] | Promise<ResourceTypes[K]>)
			| ResourceFactoryWithDeps<ResourceTypes[K]>,
	) {
		if (isFactoryWithDeps<ResourceTypes[K]>(resource)) {
			// Factory with optional dependencies and/or onDispose
			this.resourceFactories.set(label as string, resource.factory);
			this.resourceDependencies.set(label as string, resource.dependsOn ?? []);
			if (resource.onDispose) {
				this.resourceDisposers.set(label as string, resource.onDispose);
			}
		} else if (this._isFactoryFunction(resource)) {
			// Factory function (no dependencies)
			this.resourceFactories.set(label as string, resource as (context?: any) => any | Promise<any>);
			this.resourceDependencies.set(label as string, []);
		} else {
			// Direct resource value
			this.resources.set(label as string, resource);
			this.initializedResourceKeys.add(label as string);
			this.resourceDependencies.set(label as string, []);
		}
		return this;
	}

	/**
	 * Improved detection of factory functions vs direct values/classes
	 * @private
	 */
	private _isFactoryFunction(value: any): boolean {
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
		if (value.name && value.name[0] === value.name[0].toUpperCase() && value.name.length > 1) {
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
	 * Get a resource from the manager
	 * @param label The resource key
	 * @param context Optional context to pass to factory functions (usually the ECSpresso instance)
	 * @returns The resource value
	 * @throws Error if resource not found
	 */
	get<K extends keyof ResourceTypes>(
		label: K,
		context?: any
	): ResourceTypes[K] {
		// Check if we already have the initialized resource
		const resource = this.resources.get(label as string);
		if (resource !== undefined) {
			return resource as any;
		}

		// Check if we have a factory for this resource
		const factory = this.resourceFactories.get(label as string);
		if (factory === undefined) {
			throw new Error(`Resource ${String(label)} not found`);
		}

		// Initialize the resource, passing the context
		const initializedResource = factory(context);

		// If it's not a Promise, store it immediately
		if (!(initializedResource instanceof Promise)) {
			this.resources.set(label as string, initializedResource);
			this.initializedResourceKeys.add(label as string);
		}

		return initializedResource as any;
	}

	/**
	 * Check if a resource exists
	 * @param label The resource key
	 * @returns True if the resource exists
	 */
	has<K extends keyof ResourceTypes>(label: K): boolean {
		return this.resources.has(label as string) || this.resourceFactories.has(label as string);
	}

	/**
	 * Remove a resource (without calling onDispose)
	 * @param label The resource key
	 * @returns True if the resource was removed
	 */
	remove<K extends keyof ResourceTypes>(label: K): boolean {
		const resourceRemoved = this.resources.delete(label as string);
		const factoryRemoved = this.resourceFactories.delete(label as string);
		this.resourceDependencies.delete(label as string);
		this.resourceDisposers.delete(label as string);
		this.initializedResourceKeys.delete(label as string);
		return resourceRemoved || factoryRemoved;
	}

	/**
	 * Get all resource keys
	 * @returns Array of resource keys
	 */
	getKeys(): Array<string> {
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
		return this.resourceFactories.has(label as string) && !this.initializedResourceKeys.has(label as string);
	}

	/**
	 * Get all resource keys that need to be initialized
	 * @returns Array of resource keys that need initialization
	 */
	getPendingInitializationKeys(): Array<string> {
		return Array
			.from(this.resourceFactories.keys())
			.filter(key => !this.initializedResourceKeys.has(key));
	}

	/**
	 * Initialize a specific resource if it's a factory function
	 * @param label The resource key
	 * @param context Optional context to pass to factory functions
	 * @returns Promise that resolves when the resource is initialized
	 */
	async initializeResource<K extends keyof ResourceTypes>(
		label: K,
		context?: any
	): Promise<void> {
		if (!this.resourceFactories.has(label as string) || this.initializedResourceKeys.has(label as string)) {
			return;
		}

		const factory = this.resourceFactories.get(label as string)!;
		const initializedResource = await factory(context);
		this.resources.set(label as string, initializedResource);
		this.initializedResourceKeys.add(label as string);
		this.resourceFactories.delete(label as string);
	}

	/**
	 * Initialize specific resources or all resources that haven't been initialized yet.
	 * Resources are initialized in topological order based on their dependencies.
	 * @param context Optional context to pass to factory functions (usually the ECSpresso instance)
	 * @param keys Optional array of resource keys to initialize
	 * @returns Promise that resolves when the specified resources are initialized
	 */
	async initializeResources<K extends keyof ResourceTypes>(
		context?: any,
		...keys: K[]
	): Promise<void> {
		// Determine which keys to initialize
		const keysToInit = keys.length === 0
			? this.getPendingInitializationKeys()
			: keys.map(k => k as string);

		// If no keys to initialize, we're done
		if (keysToInit.length === 0) return;

		// Sort keys topologically based on dependencies
		const sortedKeys = topologicalSort(
			keysToInit,
			(key) => this.resourceDependencies.get(key) ?? []
		);

		// Initialize in order (sequentially to respect dependencies)
		for (const key of sortedKeys) {
			await this.initializeResource(key, context);
		}
	}

	/**
	 * Get the dependencies of a resource
	 * @param label The resource key
	 * @returns Array of resource keys that this resource depends on
	 */
	getDependencies<K extends keyof ResourceTypes>(label: K): readonly string[] {
		return this.resourceDependencies.get(label as string) ?? [];
	}

	/**
	 * Dispose a single resource, calling its onDispose callback if it exists
	 * @param label The resource key to dispose
	 * @param context Optional context to pass to the onDispose callback
	 * @returns True if the resource existed and was disposed, false if it didn't exist
	 */
	async disposeResource<K extends keyof ResourceTypes>(
		label: K,
		context?: any
	): Promise<boolean> {
		const key = label as string;

		if (!this.resources.has(key) && !this.resourceFactories.has(key)) {
			return false;
		}

		// Only call onDispose if the resource was initialized
		if (this.initializedResourceKeys.has(key)) {
			const disposer = this.resourceDisposers.get(key);
			const resource = this.resources.get(key);
			if (disposer && resource !== undefined) {
				await disposer(resource, context);
			}
		}

		// Clean up all tracking
		this.resources.delete(key);
		this.resourceFactories.delete(key);
		this.resourceDependencies.delete(key);
		this.resourceDisposers.delete(key);
		this.initializedResourceKeys.delete(key);

		return true;
	}

	/**
	 * Dispose all initialized resources in reverse dependency order.
	 * Resources that depend on others are disposed first.
	 * @param context Optional context to pass to onDispose callbacks
	 */
	async disposeResources(context?: any): Promise<void> {
		// Get only initialized resource keys
		const initializedKeys = Array.from(this.initializedResourceKeys);

		if (initializedKeys.length === 0) return;

		// Sort in dependency order, then reverse for disposal
		const sortedKeys = topologicalSort(
			initializedKeys,
			(key) => this.resourceDependencies.get(key) ?? []
		).reverse();

		// Dispose in reverse dependency order
		for (const key of sortedKeys) {
			await this.disposeResource(key as keyof ResourceTypes, context);
		}
	}
}
