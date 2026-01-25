/**
 * Asset management types for ECSpresso ECS framework
 */

/**
 * Status of an asset in the loading lifecycle
 */
export type AssetStatus = 'pending' | 'loading' | 'loaded' | 'failed';

/**
 * Definition for an asset including its loader and configuration
 */
export interface AssetDefinition<T> {
	readonly loader: () => Promise<T>;
	readonly eager?: boolean;
	readonly group?: string;
}

/**
 * Handle to an asset that provides status information and access methods
 */
export interface AssetHandle<T> {
	readonly status: AssetStatus;
	readonly isLoaded: boolean;
	/**
	 * Get the asset value. Throws if asset is not loaded.
	 */
	get(): T;
	/**
	 * Get the asset value if loaded, undefined otherwise.
	 */
	getOrUndefined(): T | undefined;
}

/**
 * Resource interface for accessing assets in systems
 * Exposed as $assets resource
 */
export interface AssetsResource<A extends Record<string, unknown>> {
	/**
	 * Get the loading status of an asset
	 */
	getStatus<K extends keyof A>(key: K): AssetStatus;
	/**
	 * Check if an asset is loaded
	 */
	isLoaded<K extends keyof A>(key: K): boolean;
	/**
	 * Check if all assets in a group are loaded
	 */
	isGroupLoaded(groupName: string): boolean;
	/**
	 * Get the loading progress of a group (0-1)
	 */
	getGroupProgress(groupName: string): number;
	/**
	 * Get a loaded asset. Throws if not loaded.
	 */
	get<K extends keyof A>(key: K): A[K];
	/**
	 * Get a loaded asset or undefined if not loaded
	 */
	getOrUndefined<K extends keyof A>(key: K): A[K] | undefined;
	/**
	 * Get a handle to an asset with status information
	 */
	getHandle<K extends keyof A>(key: K): AssetHandle<A[K]>;
}

/**
 * Events emitted by the asset system
 */
export interface AssetEvents {
	assetLoaded: { key: string };
	assetFailed: { key: string; error: Error };
	assetGroupLoaded: { group: string };
	assetGroupProgress: { group: string; progress: number; loaded: number; total: number };
}

/**
 * Configuration for asset definitions during builder setup
 */
export interface AssetConfigurator<A extends Record<string, unknown>> {
	/**
	 * Add a single eager asset
	 */
	add<K extends string, T>(
		key: K,
		loader: () => Promise<T>
	): AssetConfigurator<A & Record<K, T>>;

	/**
	 * Add a single asset with full configuration
	 */
	addWithConfig<K extends string, T>(
		key: K,
		definition: AssetDefinition<T>
	): AssetConfigurator<A & Record<K, T>>;

	/**
	 * Add a group of assets that can be loaded together
	 */
	addGroup<G extends string, T extends Record<string, () => Promise<unknown>>>(
		groupName: G,
		assets: T
	): AssetConfigurator<A & { [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
}
