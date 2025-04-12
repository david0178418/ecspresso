export default
class ResourceManager<ResourceTypes extends Record<string, any> = Record<string, any>> {
	private resources: Map<string, unknown> = new Map();
	private factories: Map<string, (resourceManager: ResourceManager<ResourceTypes>) => Promise<unknown>> = new Map();
	private pendingResources: Map<string, Promise<unknown>> = new Map();

	/**
	 * Add a resource or resource factory to the manager
	 * @param label The resource key
	 * @param resourceOrFactory The resource value or a factory function that returns a Promise with the resource
	 * @returns The resource manager instance for chaining
	 */
	add<K extends keyof ResourceTypes>(
		label: K,
		resourceOrFactory: ResourceTypes[K] | ((resourceManager: ResourceManager<ResourceTypes>) => Promise<ResourceTypes[K]>)
	): this {
		// If resourceOrFactory is a function, treat it as a factory
		if (typeof resourceOrFactory === 'function') {
			this.factories.set(label as string, resourceOrFactory as () => Promise<unknown>);
		} else {
			// Otherwise, treat it as a direct resource
			this.resources.set(label as string, resourceOrFactory);
		}
		return this;
	}

	/**
	 * Get a resource from the manager
	 * @param label The resource key
	 * @returns The resource value
	 * @throws Error if resource not found
	 */
	get<K extends keyof ResourceTypes>(label: K): ResourceTypes[K] {
		const resource = this.resources.get(label as string);

		if (resource === undefined) {
			throw new Error(`Resource ${String(label)} not found`);
		}

		return resource as ResourceTypes[K];
	}

	/**
	 * Get a resource from the manager, returning undefined if not found
	 * @param label The resource key
	 * @returns The resource value or undefined if not found
	 */
	getOptional<K extends keyof ResourceTypes>(label: K): ResourceTypes[K] | undefined {
		const resource = this.resources.get(label as string);
		return resource as ResourceTypes[K] | undefined;
	}

	/**
	 * Check if a resource exists
	 * @param label The resource key
	 * @returns True if the resource exists
	 */
	has<K extends keyof ResourceTypes>(label: K): boolean {
		return this.resources.has(label as string);
	}

	/**
	 * Check if an async factory exists for a resource
	 * @param label The resource key
	 * @returns True if an async factory exists for this resource
	 */
	hasFactory<K extends keyof ResourceTypes>(label: K): boolean {
		return this.factories.has(label as string);
	}

	/**
	 * Get all keys that have async factories
	 * @returns Array of resource keys with async factories
	 */
	getFactoryKeys(): Array<string> {
		return Array.from(this.factories.keys());
	}

	/**
	 * Asynchronously loads a resource using its factory
	 * @param label The resource key
	 * @returns Promise that resolves to the resource
	 * @throws Error if resource doesn't exist and no factory is registered
	 */
	async loadAsync<K extends keyof ResourceTypes>(
		label: K
	): Promise<ResourceTypes[K]> {
		// If resource already exists, return it
		if (this.has(label)) {
			return this.get(label);
		}

		// If a loading process is already underway, return that promise
		const pendingResource = this.pendingResources.get(label as string);
		if (pendingResource) {
			return pendingResource as Promise<ResourceTypes[K]>;
		}

		// Check if we have a factory
		const factory = this.factories.get(label as string);
		if (!factory) {
			throw new Error(`Resource ${String(label)} not found and no async factory registered`);
		}

		// Create the resource using the factory
		const resourcePromise = factory(this)
			.then(resource => {
				// Store the direct resource value, not the factory
				this.resources.set(label as string, resource);
				this.pendingResources.delete(label as string);
				return resource as ResourceTypes[K];
			})
			.catch(error => {
				// Clean up the pending resource on error
				this.pendingResources.delete(label as string);
				// Re-throw the error to propagate it to the caller
				throw error;
			});

		this.pendingResources.set(label as string, resourcePromise);
		return resourcePromise;
	}

	/**
	 * Remove a resource
	 * @param label The resource key
	 * @returns True if the resource was removed
	 */
	remove<K extends keyof ResourceTypes>(label: K): boolean {
		const hadResource = this.resources.delete(label as string);
		const hadFactory = this.factories.delete(label as string);
		return hadResource || hadFactory;
	}

	/**
	 * Get all resource keys (both direct resources and factories)
	 * @returns Array of resource keys
	 */
	getKeys(): Array<string> {
		// Combine keys from both resources and factories
		const allKeys = new Set([
			...this.resources.keys(),
			...this.factories.keys()
		]);
		return Array.from(allKeys);
	}
}
