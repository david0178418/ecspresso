import ECSpresso from './ecspresso';
import { SystemBuilder } from './system-builder';
import Bundle, { mergeBundles } from './bundle';

export * from './types';
export * from './asset-types';
export * from './screen-types';
export type { ReactiveQueryDefinition } from './reactive-query-manager';
export { default as EntityManager } from './entity-manager';
export { default as EventBus } from './event-bus';
export { default as HierarchyManager } from './hierarchy-manager';
/**
 * @internal ResourceManager is exported for testing purposes only.
 * Use ECSpresso resource methods instead: getResource(), addResource(), removeResource(), updateResource(), hasResource()
 */
export { default as ResourceManager } from './resource-manager';
export { default as AssetManager, createAssetConfigurator } from './asset-manager';
export { default as ScreenManager, createScreenConfigurator } from './screen-manager';
export { SystemBuilder };
export { Bundle, mergeBundles };
export default ECSpresso;
