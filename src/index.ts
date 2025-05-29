import ECSpresso from './ecspresso';
import { SystemBuilder } from './system-builder';
import Bundle, { mergeBundles } from './bundle';

export * from './types';
export { default as EntityManager } from './entity-manager';
export { default as EventBus } from './event-bus';
/**
 * @internal ResourceManager is exported for testing purposes only.
 * Use ECSpresso resource methods instead: getResource(), addResource(), removeResource(), updateResource(), hasResource()
 */
export { default as ResourceManager } from './resource-manager';
export { SystemBuilder };
export { Bundle, mergeBundles };
export default ECSpresso;
