import type { EventHandler } from "./types";

export default
class EventBus<EventTypes> {
	private handlers: Map<keyof EventTypes, Array<EventHandler<any>>> = new Map();

	/**
	 * Subscribe to an event
	 */
	subscribe<E extends keyof EventTypes>(
		eventType: E,
		callback: (data: EventTypes[E]) => void
	): () => void {
		return this.addHandler(eventType, callback, false);
	}

	/**
	 * Subscribe to an event once
	 */
	once<E extends keyof EventTypes>(
		eventType: E,
		callback: (data: EventTypes[E]) => void
	): () => void {
		return this.addHandler(eventType, callback, true);
	}

	/**
	 * Unsubscribe a specific callback from an event by reference
	 * @returns true if the callback was found and removed, false otherwise
	 */
	unsubscribe<E extends keyof EventTypes>(
		eventType: E,
		callback: (data: EventTypes[E]) => void
	): boolean {
		const handlers = this.handlers.get(eventType);
		if (!handlers) return false;

		const index = handlers.findIndex(h => h.callback === callback);
		if (index === -1) return false;

		handlers.splice(index, 1);
		return true;
	}

	/**
	 * Internal method to add an event handler
	 */
	private addHandler<E extends keyof EventTypes>(
		eventType: E,
		callback: (data: EventTypes[E]) => void,
		once: boolean
	): () => void {
		if (!this.handlers.has(eventType)) {
			this.handlers.set(eventType, []);
		}

		const handler: EventHandler<any> = {
			callback,
			once
		};

		this.handlers.get(eventType)!.push(handler);

		// Return unsubscribe function
		return () => {
			const handlers = this.handlers.get(eventType);
			if (handlers) {
				const index = handlers.indexOf(handler);
				if (index !== -1) {
					handlers.splice(index, 1);
				}
			}
		};
	}

	/**
	 * Publish an event. Data is required unless EventTypes[E] extends void | undefined.
	 */
	publish<E extends keyof EventTypes>(
		...[eventType, data]: EventTypes[E] extends void | undefined
			? [eventType: E, data?: EventTypes[E]]
			: [eventType: E, data: EventTypes[E]]
	): void {
		const handlers = this.handlers.get(eventType);
		if (!handlers) return;

		// Create a copy of handlers to avoid issues with handlers that modify the array
		const handlersToCall = [...handlers];

		// Call all handlers and collect handlers to remove
		const handlersToRemove: EventHandler<any>[] = [];

		for (const handler of handlersToCall) {
			handler.callback(data as EventTypes[E]);
			if (handler.once) {
				handlersToRemove.push(handler);
			}
		}

		if (handlersToRemove.length > 0) {
			for (const handler of handlersToRemove) {
				const index = handlers.indexOf(handler);
				if (index !== -1) {
					handlers.splice(index, 1);
				}
			}
		}
	}

	clear(): void {
		this.handlers.clear();
	}

	clearEvent<E extends keyof EventTypes>(eventType: E): void {
		this.handlers.delete(eventType);
	}
}
