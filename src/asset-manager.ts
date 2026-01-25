/**
 * Asset management for ECSpresso ECS framework
 */

import type EventBus from './event-bus';
import type {
	AssetStatus,
	AssetDefinition,
	AssetHandle,
	AssetsResource,
	AssetEvents,
	AssetConfigurator,
} from './asset-types';

interface AssetEntry<T> {
	definition: AssetDefinition<T>;
	status: AssetStatus;
	value?: T;
	error?: Error;
	loadPromise?: Promise<T>;
}

/**
 * Manages asset loading and access for ECSpresso
 */
export default class AssetManager<AssetTypes extends Record<string, unknown> = Record<string, never>> {
	private readonly assets: Map<string, AssetEntry<unknown>> = new Map();
	private readonly groups: Map<string, Set<string>> = new Map();
	private eventBus: EventBus<AssetEvents> | null = null;

	/**
	 * Set the event bus for asset events
	 * @internal
	 */
	setEventBus(eventBus: EventBus<AssetEvents>): void {
		this.eventBus = eventBus;
	}

	/**
	 * Register an asset definition
	 */
	register<K extends string, T>(
		key: K,
		definition: AssetDefinition<T>
	): void {
		this.assets.set(key, {
			definition,
			status: 'pending',
		});

		if (definition.group) {
			const groupSet = this.groups.get(definition.group) ?? new Set();
			groupSet.add(key);
			this.groups.set(definition.group, groupSet);
		}
	}

	/**
	 * Load all assets marked as eager
	 */
	async loadEagerAssets(): Promise<void> {
		const eagerAssets: string[] = [];

		for (const [key, entry] of this.assets) {
			if (entry.definition.eager && entry.status === 'pending') {
				eagerAssets.push(key);
			}
		}

		await Promise.all(eagerAssets.map(key => this.loadAsset(key)));
	}

	/**
	 * Load a single asset by key
	 */
	async loadAsset<K extends keyof AssetTypes>(key: K): Promise<AssetTypes[K]> {
		const keyStr = key as string;
		const entry = this.assets.get(keyStr);

		if (!entry) {
			throw new Error(`Asset '${keyStr}' not found`);
		}

		// Already loaded
		if (entry.status === 'loaded' && entry.value !== undefined) {
			return entry.value as AssetTypes[K];
		}

		// Already loading - return existing promise
		if (entry.status === 'loading' && entry.loadPromise) {
			return entry.loadPromise as Promise<AssetTypes[K]>;
		}

		// Failed - try again
		if (entry.status === 'failed') {
			entry.status = 'pending';
		}

		// Start loading
		entry.status = 'loading';
		entry.loadPromise = entry.definition.loader();

		try {
			const value = await entry.loadPromise;
			entry.value = value;
			entry.status = 'loaded';
			entry.loadPromise = undefined;

			this.eventBus?.publish('assetLoaded', { key: keyStr });
			this.checkGroupProgress(entry.definition.group);

			return value as AssetTypes[K];
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			entry.status = 'failed';
			entry.error = error;
			entry.loadPromise = undefined;

			this.eventBus?.publish('assetFailed', { key: keyStr, error });
			throw error;
		}
	}

	/**
	 * Load all assets in a group
	 */
	async loadAssetGroup(groupName: string): Promise<void> {
		const groupKeys = this.groups.get(groupName);

		if (!groupKeys || groupKeys.size === 0) {
			throw new Error(`Asset group '${groupName}' not found or empty`);
		}

		await Promise.all(
			Array.from(groupKeys).map(key => this.loadAsset(key as keyof AssetTypes))
		);
	}

	/**
	 * Get a loaded asset. Throws if not loaded.
	 */
	get<K extends keyof AssetTypes>(key: K): AssetTypes[K] {
		const keyStr = key as string;
		const entry = this.assets.get(keyStr);

		if (!entry) {
			throw new Error(`Asset '${keyStr}' not found`);
		}

		if (entry.status !== 'loaded' || entry.value === undefined) {
			throw new Error(`Asset '${keyStr}' is not loaded (status: ${entry.status})`);
		}

		return entry.value as AssetTypes[K];
	}

	/**
	 * Get a loaded asset or undefined
	 */
	getOrUndefined<K extends keyof AssetTypes>(key: K): AssetTypes[K] | undefined {
		const keyStr = key as string;
		const entry = this.assets.get(keyStr);

		if (!entry || entry.status !== 'loaded') {
			return undefined;
		}

		return entry.value as AssetTypes[K] | undefined;
	}

	/**
	 * Get a handle to an asset with status information
	 */
	getHandle<K extends keyof AssetTypes>(key: K): AssetHandle<AssetTypes[K]> {
		const keyStr = key as string;
		const entry = this.assets.get(keyStr);

		if (!entry) {
			throw new Error(`Asset '${keyStr}' not found`);
		}

		const manager = this;
		return {
			get status() {
				return entry.status;
			},
			get isLoaded() {
				return entry.status === 'loaded';
			},
			get() {
				return manager.get(key);
			},
			getOrUndefined() {
				return manager.getOrUndefined(key);
			},
		};
	}

	/**
	 * Get the status of an asset
	 */
	getStatus<K extends keyof AssetTypes>(key: K): AssetStatus {
		const keyStr = key as string;
		const entry = this.assets.get(keyStr);

		if (!entry) {
			throw new Error(`Asset '${keyStr}' not found`);
		}

		return entry.status;
	}

	/**
	 * Check if an asset is loaded
	 */
	isLoaded<K extends keyof AssetTypes>(key: K): boolean {
		const keyStr = key as string;
		const entry = this.assets.get(keyStr);
		return entry?.status === 'loaded';
	}

	/**
	 * Check if all assets in a group are loaded
	 */
	isGroupLoaded(groupName: string): boolean {
		const groupKeys = this.groups.get(groupName);

		if (!groupKeys || groupKeys.size === 0) {
			return false;
		}

		for (const key of groupKeys) {
			const entry = this.assets.get(key);
			if (!entry || entry.status !== 'loaded') {
				return false;
			}
		}

		return true;
	}

	/**
	 * Get the loading progress of a group (0-1)
	 */
	getGroupProgress(groupName: string): number {
		const groupKeys = this.groups.get(groupName);

		if (!groupKeys || groupKeys.size === 0) {
			return 0;
		}

		let loaded = 0;
		for (const key of groupKeys) {
			const entry = this.assets.get(key);
			if (entry?.status === 'loaded') {
				loaded++;
			}
		}

		return loaded / groupKeys.size;
	}

	/**
	 * Get detailed group progress
	 */
	getGroupProgressDetails(groupName: string): { loaded: number; total: number; progress: number } {
		const groupKeys = this.groups.get(groupName);

		if (!groupKeys || groupKeys.size === 0) {
			return { loaded: 0, total: 0, progress: 0 };
		}

		let loaded = 0;
		for (const key of groupKeys) {
			const entry = this.assets.get(key);
			if (entry?.status === 'loaded') {
				loaded++;
			}
		}

		const total = groupKeys.size;
		return { loaded, total, progress: loaded / total };
	}

	/**
	 * Check group progress and emit events
	 */
	private checkGroupProgress(groupName: string | undefined): void {
		if (!groupName || !this.eventBus) return;

		const details = this.getGroupProgressDetails(groupName);

		this.eventBus.publish('assetGroupProgress', {
			group: groupName,
			...details,
		});

		if (details.loaded === details.total) {
			this.eventBus.publish('assetGroupLoaded', { group: groupName });
		}
	}

	/**
	 * Create the $assets resource object
	 */
	createResource(): AssetsResource<AssetTypes> {
		const manager = this;
		return {
			getStatus<K extends keyof AssetTypes>(key: K): AssetStatus {
				return manager.getStatus(key);
			},
			isLoaded<K extends keyof AssetTypes>(key: K): boolean {
				return manager.isLoaded(key);
			},
			isGroupLoaded(groupName: string): boolean {
				return manager.isGroupLoaded(groupName);
			},
			getGroupProgress(groupName: string): number {
				return manager.getGroupProgress(groupName);
			},
			get<K extends keyof AssetTypes>(key: K): AssetTypes[K] {
				return manager.get(key);
			},
			getOrUndefined<K extends keyof AssetTypes>(key: K): AssetTypes[K] | undefined {
				return manager.getOrUndefined(key);
			},
			getHandle<K extends keyof AssetTypes>(key: K): AssetHandle<AssetTypes[K]> {
				return manager.getHandle(key);
			},
		};
	}

	/**
	 * Get all registered asset keys
	 */
	getKeys(): Array<keyof AssetTypes> {
		return Array.from(this.assets.keys()) as Array<keyof AssetTypes>;
	}

	/**
	 * Get all group names
	 */
	getGroupNames(): string[] {
		return Array.from(this.groups.keys());
	}

	/**
	 * Get all asset keys in a group
	 */
	getGroupKeys(groupName: string): Array<keyof AssetTypes> {
		const groupKeys = this.groups.get(groupName);
		return groupKeys ? Array.from(groupKeys) as Array<keyof AssetTypes> : [];
	}
}

/**
 * Implementation of AssetConfigurator for builder pattern
 */
export class AssetConfiguratorImpl<A extends Record<string, unknown>> implements AssetConfigurator<A> {
	private readonly manager: AssetManager<A>;

	constructor(manager: AssetManager<A>) {
		this.manager = manager;
	}

	add<K extends string, T>(
		key: K,
		loader: () => Promise<T>
	): AssetConfigurator<A & Record<K, T>> {
		this.manager.register(key, { loader, eager: true });
		return this as unknown as AssetConfigurator<A & Record<K, T>>;
	}

	addWithConfig<K extends string, T>(
		key: K,
		definition: AssetDefinition<T>
	): AssetConfigurator<A & Record<K, T>> {
		this.manager.register(key, definition);
		return this as unknown as AssetConfigurator<A & Record<K, T>>;
	}

	addGroup<G extends string, T extends Record<string, () => Promise<unknown>>>(
		groupName: G,
		assets: T
	): AssetConfigurator<A & { [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
		for (const [key, loader] of Object.entries(assets)) {
			this.manager.register(key, {
				loader: loader as () => Promise<unknown>,
				eager: false,
				group: groupName,
			});
		}
		return this as unknown as AssetConfigurator<A & { [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
	}

	/**
	 * Get the underlying manager
	 * @internal
	 */
	getManager(): AssetManager<A> {
		return this.manager;
	}
}

/**
 * Create a new AssetConfigurator for builder pattern usage
 */
export function createAssetConfigurator<A extends Record<string, unknown> = Record<string, never>>(
	manager?: AssetManager<A>
): AssetConfiguratorImpl<A> {
	return new AssetConfiguratorImpl(manager ?? new AssetManager<A>());
}
