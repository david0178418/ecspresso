export default
class ResourceManager<ResourceTypes extends Record<string, any> = Record<string, any>> {
	private resources: Map<keyof ResourceTypes, ResourceTypes[keyof ResourceTypes]> = new Map();

	/**
	 * Add a resource to the manager
	 * @param label The resource key
	 * @param resource The resource value
	 * @returns The added resource
	 */
	add<K extends keyof ResourceTypes>(label: K, resource: ResourceTypes[K]): ResourceTypes[K] {
		this.resources.set(label, resource);
		return resource;
	}

	/**
	 * Get a resource from the manager
	 * @param label The resource key
	 * @returns The resource value
	 * @throws Error if resource not found
	 */
	get<K extends keyof ResourceTypes>(label: K): ResourceTypes[K] {
		const resource = this.resources.get(label);
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
		const resource = this.resources.get(label);
		return resource as ResourceTypes[K] | undefined;
	}

	/**
	 * Check if a resource exists
	 * @param label The resource key
	 * @returns True if the resource exists
	 */
	has<K extends keyof ResourceTypes>(label: K): boolean {
		return this.resources.has(label);
	}

	/**
	 * Remove a resource
	 * @param label The resource key
	 * @returns True if the resource was removed
	 */
	remove<K extends keyof ResourceTypes>(label: K): boolean {
		return this.resources.delete(label);
	}

	/**
	 * Get all resource keys
	 * @returns Array of resource keys
	 */
	getKeys(): Array<keyof ResourceTypes> {
		return Array.from(this.resources.keys());
	}
}
