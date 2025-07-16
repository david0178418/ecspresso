export default
class ResourceManager<ResourceTypes extends Record<string, any> = Record<string, any>> {
	private resources: Map<string, any> = new Map();
	private resourceFactories: Map<string, (context?: any) => any | Promise<any>> = new Map();
	private initializedResourceKeys: Set<string> = new Set();

	/**
	 * Add a resource to the manager
	 * @param label The resource key
	 * @param resource The resource value or a factory function that returns the resource
	 * @returns The resource manager instance for chaining
	 */
	add<K extends keyof ResourceTypes>(
		label: K,
		resource: ResourceTypes[K] | ((context?: any) => ResourceTypes[K] | Promise<ResourceTypes[K]>),
	) {
		if (this._isFactoryFunction(resource)) {
			// Factory function
			this.resourceFactories.set(label as string, resource as (context?: any) => any | Promise<any>);
		} else {
			// Direct resource value
			this.resources.set(label as string, resource);
			this.initializedResourceKeys.add(label as string);
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
	 * Remove a resource
	 * @param label The resource key
	 * @returns True if the resource was removed
	 */
	remove<K extends keyof ResourceTypes>(label: K): boolean {
		const resourceRemoved = this.resources.delete(label as string);
		const factoryRemoved = this.resourceFactories.delete(label as string);
		if (this.initializedResourceKeys.has(label as string)) {
			this.initializedResourceKeys.delete(label as string);
		}
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
	 * Initialize specific resources or all resources that haven't been initialized yet
	 * @param keys Optional array of resource keys to initialize or optional context to pass to factory functions
	 * @returns Promise that resolves when the specified resources are initialized
	 */
	async initializeResources<K extends keyof ResourceTypes>(
		context?: any,
		...keys: K[]
	): Promise<void> {
		// If no keys provided, initialize all pending resources
		if (keys.length === 0) {
			const pendingKeys = this.getPendingInitializationKeys();
			await Promise.all(pendingKeys.map(key => this.initializeResource(key, context)));
			return;
		}

		// Otherwise, initialize only the specified resources
		await Promise.all(
			keys.map(key => this.initializeResource(key, context))
		);
	}
}
