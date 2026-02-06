/**
 * BFS cycle detection for required component graphs.
 * Shared by ECSpresso and Bundle.
 *
 * @param trigger     The component that triggers the requirement
 * @param newRequired The component about to be added as required
 * @param getRequirements Callback returning the existing requirements for a component
 * @throws Error if adding trigger→newRequired would create a cycle
 */
export function checkRequiredCycle<K>(
	trigger: K,
	newRequired: K,
	getRequirements: (component: K) => Iterable<{ component: K }> | undefined,
): void {
	const visited = new Set<K>();
	const stack: K[] = [newRequired];

	while (stack.length > 0) {
		const current = stack.pop()!;
		if (current === trigger) {
			throw new Error(
				`Circular required component dependency: '${String(trigger)}' -> '${String(newRequired)}' -> ... -> '${String(trigger)}'`
			);
		}
		if (visited.has(current)) continue;
		visited.add(current);

		const reqs = getRequirements(current);
		if (reqs) {
			for (const r of reqs) {
				stack.push(r.component);
			}
		}
	}
}
