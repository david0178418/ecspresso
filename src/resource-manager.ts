export default
class ResourceManager<ResourceTypes extends Record<string, any> = Record<string, any>> {
	private resources: Map<string, any> = new Map();

	/**
	 * Add a resource to the manager
	 * @param label The resource key
	 * @param resource The resource value
	 * @returns The resource manager instance for chaining
	 */
	add<K extends keyof ResourceTypes | string>(label: K, resource: K extends keyof ResourceTypes ? ResourceTypes[K] : any) {
		this.resources.set(label as string, resource);
		return this;
	}

	/**
	 * Get a resource from the manager
	 * @param label The resource key
	 * @returns The resource value
	 * @throws Error if resource not found
	 */
	get<K extends keyof ResourceTypes | string>(label: K): K extends keyof ResourceTypes ? ResourceTypes[K] : any {
		const resource = this.resources.get(label as string);

		if (resource === undefined) {
			throw new Error(`Resource ${String(label)} not found`);
		}

		return resource as any;
	}

	/**
	 * Get a resource from the manager, returning undefined if not found
	 * @param label The resource key
	 * @returns The resource value or undefined if not found
	 */
	getOptional<K extends keyof ResourceTypes | string>(label: K): K extends keyof ResourceTypes ? ResourceTypes[K] : any | undefined {
		const resource = this.resources.get(label as string);
		return resource as any | undefined;
	}

	/**
	 * Check if a resource exists
	 * @param label The resource key
	 * @returns True if the resource exists
	 */
	has<K extends keyof ResourceTypes | string>(label: K): boolean {
		return this.resources.has(label as string);
	}

	/**
	 * Remove a resource
	 * @param label The resource key
	 * @returns True if the resource was removed
	 */
	remove<K extends keyof ResourceTypes | string>(label: K): boolean {
		return this.resources.delete(label as string);
	}

	/**
	 * Get all resource keys
	 * @returns Array of resource keys
	 */
	getKeys(): Array<string> {
		return Array.from(this.resources.keys());
	}
}
