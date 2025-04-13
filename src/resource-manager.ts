export default
class ResourceManager<ResourceTypes extends Record<string, any> = Record<string, any>> {
	private resources: Map<string, any> = new Map();
	private resourceFactories: Map<string, () => any | Promise<any>> = new Map();
	private initializedResourceKeys: Set<string> = new Set();

	/**
	 * Add a resource to the manager
	 * @param label The resource key
	 * @param resource The resource value or a factory function that returns the resource
	 * @returns The resource manager instance for chaining
	 */
	add<K extends keyof ResourceTypes | string, R = K extends keyof ResourceTypes ? ResourceTypes[K] : any>(
		label: K,
		resource: R | (() => R | Promise<R>)
	) {
		if (typeof resource === 'function' && !resource.toString().startsWith('class')) {
			// Likely a factory function
			this.resourceFactories.set(label as string, resource as () => any | Promise<any>);
		} else {
			// Direct resource value
			this.resources.set(label as string, resource);
			this.initializedResourceKeys.add(label as string);
		}
		return this;
	}

	/**
	 * Get a resource from the manager
	 * @param label The resource key
	 * @returns The resource value
	 * @throws Error if resource not found
	 */
	get<K extends keyof ResourceTypes | string>(
		label: K
	): K extends keyof ResourceTypes ? ResourceTypes[K] : any {
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

		// Initialize the resource synchronously (this might throw if the factory returns a Promise)
		const initializedResource = factory();

		// If it's not a Promise, store it immediately
		if (!(initializedResource instanceof Promise)) {
			this.resources.set(label as string, initializedResource);
			this.initializedResourceKeys.add(label as string);
		}

		return initializedResource as any;
	}

	/**
	 * Get a resource from the manager, returning undefined if not found
	 * @param label The resource key
	 * @returns The resource value or undefined if not found
	 */
	getOptional<K extends keyof ResourceTypes | string>(label: K): K extends keyof ResourceTypes ? ResourceTypes[K] | undefined : any {
		try {
			return this.get(label);
		} catch {
			return undefined as any;
		}
	}

	/**
	 * Check if a resource exists
	 * @param label The resource key
	 * @returns True if the resource exists
	 */
	has<K extends keyof ResourceTypes | string>(label: K): boolean {
		return this.resources.has(label as string) || this.resourceFactories.has(label as string);
	}

	/**
	 * Remove a resource
	 * @param label The resource key
	 * @returns True if the resource was removed
	 */
	remove<K extends keyof ResourceTypes | string>(label: K): boolean {
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
	needsInitialization<K extends keyof ResourceTypes | string>(label: K): boolean {
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
	 * @returns Promise that resolves when the resource is initialized
	 */
	async initializeResource<K extends keyof ResourceTypes | string>(label: K): Promise<void> {
		if (!this.resourceFactories.has(label as string) || this.initializedResourceKeys.has(label as string)) {
			return;
		}

		const factory = this.resourceFactories.get(label as string)!;
		const initializedResource = await factory();
		this.resources.set(label as string, initializedResource);
		this.initializedResourceKeys.add(label as string);
	}

	/**
	 * Initialize specific resources or all resources that haven't been initialized yet
	 * @param keys Optional array of resource keys to initialize. If not provided, all pending resources will be initialized.
	 * @returns Promise that resolves when the specified resources are initialized
	 */
	async initializeResources<K extends keyof ResourceTypes | string>(
		...keys: K[]
	): Promise<void> {
		// If no keys provided, initialize all pending resources
		if (keys.length === 0) {
			const pendingKeys = this.getPendingInitializationKeys();
			await Promise.all(pendingKeys.map(key => this.initializeResource(key)));
			return;
		}

		// Otherwise, initialize only the specified resources
		await Promise.all(
			keys.map(key => this.initializeResource(key))
		);
	}
}
