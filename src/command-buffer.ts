import type ECSpresso from './ecspresso';
import type { Entity, RemoveEntityOptions } from './types';

/**
 * CommandBuffer queues structural changes to be executed later.
 * This prevents ordering issues when modifying entities during system execution.
 *
 * Commands are executed in FIFO order when playback() is called.
 *
 * @example
 * ```typescript
 * // In a system
 * ecs.commands.removeEntity(entityId);
 * ecs.commands.spawn({ position: { x: 0, y: 0 } });
 *
 * // Later (automatically at end of update())
 * ecs.commands.playback(ecs);
 * ```
 */
export default class CommandBuffer<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
	AssetTypes extends Record<string, unknown> = {},
	ScreenStates extends Record<string, any> = {},
> {
	private commands: Array<(ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>) => void> = [];

	/**
	 * Queue an entity removal command
	 * @param entityOrId The entity or entity ID to remove
	 * @param options Optional removal options (cascade, etc.)
	 */
	removeEntity(entityOrId: number | Entity<ComponentTypes>, options?: RemoveEntityOptions): void {
		this.commands.push((ecs) => {
			ecs.removeEntity(entityOrId, options);
		});
	}

	/**
	 * Queue a component addition command
	 * @param entityOrId The entity or entity ID
	 * @param componentName The name of the component to add
	 * @param componentValue The component data
	 */
	addComponent<K extends keyof ComponentTypes>(
		entityOrId: number | Entity<ComponentTypes>,
		componentName: K,
		componentValue: ComponentTypes[K]
	): void {
		this.commands.push((ecs) => {
			ecs.addComponent(entityOrId, componentName, componentValue);
		});
	}

	/**
	 * Queue a component removal command
	 * @param entityOrId The entity or entity ID
	 * @param componentName The name of the component to remove
	 */
	removeComponent<K extends keyof ComponentTypes>(
		entityOrId: number | Entity<ComponentTypes>,
		componentName: K
	): void {
		this.commands.push((ecs) => {
			ecs.removeComponent(entityOrId, componentName);
		});
	}

	/**
	 * Queue an entity spawn command
	 * @param components The initial components for the new entity
	 * @returns void (entity ID not available until playback)
	 */
	spawn<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): void {
		this.commands.push((ecs) => {
			ecs.spawn(components);
		});
	}

	/**
	 * Queue a child entity spawn command
	 * @param parentOrId The parent entity or entity ID
	 * @param components The initial components for the new child entity
	 */
	spawnChild<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		parentOrId: number | Entity<ComponentTypes>,
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): void {
		this.commands.push((ecs) => {
			ecs.spawnChild(parentOrId, components);
		});
	}

	/**
	 * Queue multiple component additions
	 * @param entityOrId The entity or entity ID
	 * @param components Object with component names as keys and component data as values
	 */
	addComponents<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		entityOrId: number | Entity<ComponentTypes>,
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): void {
		this.commands.push((ecs) => {
			ecs.addComponents(entityOrId, components);
		});
	}

	/**
	 * Queue a parent assignment command
	 * @param childOrId The child entity or entity ID
	 * @param parentOrId The parent entity or entity ID
	 */
	setParent(childOrId: number | Entity<ComponentTypes>, parentOrId: number | Entity<ComponentTypes>): void {
		this.commands.push((ecs) => {
			ecs.setParent(childOrId, parentOrId);
		});
	}

	/**
	 * Queue a component mutation command.
	 * The mutator runs during playback, receiving the component for in-place mutation.
	 * Automatically marks the component as changed.
	 * @param entityOrId The entity or entity ID
	 * @param componentName The component to mutate
	 * @param mutator A function that receives the component value for in-place mutation
	 */
	mutateComponent<K extends keyof ComponentTypes>(
		entityOrId: number | Entity<ComponentTypes>,
		componentName: K,
		mutator: (value: ComponentTypes[K]) => void
	): void {
		this.commands.push((ecs) => {
			ecs.mutateComponent(entityOrId, componentName, mutator);
		});
	}

	/**
	 * Queue a markChanged command
	 * @param entityOrId The entity or entity ID
	 * @param componentName The component to mark as changed
	 */
	markChanged<K extends keyof ComponentTypes>(entityOrId: number | Entity<ComponentTypes>, componentName: K): void {
		this.commands.push((ecs) => {
			ecs.markChanged(entityOrId, componentName);
		});
	}

	/**
	 * Queue a parent removal command
	 * @param childOrId The child entity or entity ID
	 */
	removeParent(childOrId: number | Entity<ComponentTypes>): void {
		this.commands.push((ecs) => {
			ecs.removeParent(childOrId);
		});
	}

	/**
	 * Execute all queued commands in FIFO order.
	 * Errors from individual commands are caught and logged, but do not stop playback.
	 * @param ecs The ECSpresso instance to execute commands on
	 */
	playback(
		ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
	): void {
		// Execute all commands, catching errors to prevent one bad command from stopping all playback
		for (const command of this.commands) {
			try {
				command(ecs);
			} catch (error) {
				// Log error but continue with remaining commands
				// This matches Unity DOTS behavior where invalid commands are silently skipped
				console.warn('CommandBuffer: Command failed during playback:', error);
			}
		}

		// Clear the queue
		this.commands = [];
	}

	/**
	 * Clear all queued commands without executing them
	 */
	clear(): void {
		this.commands = [];
	}

	/**
	 * Get the number of queued commands
	 * @returns The number of commands waiting to be executed
	 */
	get length(): number {
		return this.commands.length;
	}
}
