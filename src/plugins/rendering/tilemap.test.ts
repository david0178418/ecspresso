import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import { createTransformPlugin } from '../spatial/transform';
import { createCollisionPlugin, defineCollisionLayers } from '../physics/collision';
import {
	createTilemapPlugin,
	parseTiledJSON,
	decodeGid,
	createLoadedTilemap,
	TILE_FLIP_HORIZONTAL,
	TILE_FLIP_VERTICAL,
	TILE_FLIP_DIAGONAL,
	type TilemapRuntimeData,
	type TiledMap,
} from './tilemap';

// ==================== GID Flip Bits ====================

describe('Tilemap — decodeGid', () => {
	test('decodes plain GID with no flip bits', () => {
		const r = decodeGid(42);
		expect(r.id).toBe(42);
		expect(r.flipH).toBe(false);
		expect(r.flipV).toBe(false);
		expect(r.flipD).toBe(false);
	});

	test('decodes empty cell (0)', () => {
		const r = decodeGid(0);
		expect(r.id).toBe(0);
	});

	test('decodes horizontal flip', () => {
		const r = decodeGid((TILE_FLIP_HORIZONTAL | 5) >>> 0);
		expect(r.id).toBe(5);
		expect(r.flipH).toBe(true);
		expect(r.flipV).toBe(false);
		expect(r.flipD).toBe(false);
	});

	test('decodes vertical flip', () => {
		const r = decodeGid((TILE_FLIP_VERTICAL | 7) >>> 0);
		expect(r.id).toBe(7);
		expect(r.flipV).toBe(true);
	});

	test('decodes diagonal flip', () => {
		const r = decodeGid((TILE_FLIP_DIAGONAL | 9) >>> 0);
		expect(r.id).toBe(9);
		expect(r.flipD).toBe(true);
	});

	test('decodes all three flip bits combined', () => {
		const all = (TILE_FLIP_HORIZONTAL | TILE_FLIP_VERTICAL | TILE_FLIP_DIAGONAL | 13) >>> 0;
		const r = decodeGid(all);
		expect(r.id).toBe(13);
		expect(r.flipH).toBe(true);
		expect(r.flipV).toBe(true);
		expect(r.flipD).toBe(true);
	});
});

// ==================== Runtime Tilemap Construction ====================

function makeRuntimeData(overrides?: Partial<TilemapRuntimeData>): TilemapRuntimeData {
	const tiles = new Uint32Array([
		1, 1, 1, 1,
		1, 0, 0, 1,
		1, 0, 0, 1,
		1, 1, 1, 1,
	]);
	return {
		width: 4,
		height: 4,
		tileSize: 16,
		layers: [{ name: 'floor', tiles }],
		tilesets: [{ textureKey: 'tiles', columns: 4, tileWidth: 16, tileHeight: 16 }],
		tileMetadata: { 1: { solid: true, blocksSight: true, walkable: false } },
		...overrides,
	};
}

describe('Tilemap — createLoadedTilemap (runtime path)', () => {
	test('produces a LoadedTilemap with expected shape from runtime data', () => {
		const lt = createLoadedTilemap(makeRuntimeData());
		expect(lt.width).toBe(4);
		expect(lt.height).toBe(4);
		expect(lt.tileWidth).toBe(16);
		expect(lt.tileHeight).toBe(16);
		expect(lt.layers).toHaveLength(1);
		expect(lt.layers[0]!.name).toBe('floor');
		expect(lt.tilesets).toHaveLength(1);
	});

	test('layer parallax defaults to {1,1}', () => {
		const lt = createLoadedTilemap(makeRuntimeData());
		expect(lt.layers[0]!.parallax).toEqual({ x: 1, y: 1 });
	});

	test('layer parallax overridden by data', () => {
		const lt = createLoadedTilemap(makeRuntimeData({
			layers: [{ name: 'bg', tiles: new Uint32Array(16), parallax: { x: 0.5, y: 0.5 } }],
		}));
		expect(lt.layers[0]!.parallax).toEqual({ x: 0.5, y: 0.5 });
	});

	test('layer opacity defaults to 1', () => {
		const lt = createLoadedTilemap(makeRuntimeData());
		expect(lt.layers[0]!.opacity).toBe(1);
	});

	test('accepts tiles as plain number[]', () => {
		const lt = createLoadedTilemap(makeRuntimeData({
			layers: [{ name: 'floor', tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] }],
		}));
		expect(lt.layers[0]!.tiles[0]).toBe(1);
		expect(lt.layers[0]!.tiles[15]).toBe(16);
	});

	test('throws when layer tiles length does not match width*height', () => {
		expect(() => createLoadedTilemap(makeRuntimeData({
			layers: [{ name: 'floor', tiles: new Uint32Array(5) }],
		}))).toThrow();
	});

	test('throws when width or height is non-positive', () => {
		expect(() => createLoadedTilemap({ ...makeRuntimeData(), width: 0 })).toThrow();
		expect(() => createLoadedTilemap({ ...makeRuntimeData(), height: -1 })).toThrow();
	});

	test('throws when tilesets are empty', () => {
		expect(() => createLoadedTilemap({ ...makeRuntimeData(), tilesets: [] })).toThrow();
	});

	test('assigns firstgid=1 to first runtime tileset by default', () => {
		const lt = createLoadedTilemap(makeRuntimeData());
		expect(lt.tilesets[0]!.firstgid).toBe(1);
	});

	test('preserves explicit firstgid on runtime tilesets', () => {
		const lt = createLoadedTilemap({
			...makeRuntimeData(),
			tilesets: [
				{ textureKey: 'a', columns: 4, tileWidth: 16, tileHeight: 16 },
				{ textureKey: 'b', columns: 4, tileWidth: 16, tileHeight: 16, firstgid: 100 },
			],
		});
		expect(lt.tilesets[0]!.firstgid).toBe(1);
		expect(lt.tilesets[1]!.firstgid).toBe(100);
	});
});

// ==================== Coordinate Helpers ====================

describe('Tilemap — coordinate helpers', () => {
	const lt = createLoadedTilemap(makeRuntimeData({
		width: 8,
		height: 6,
		tileSize: 32,
		layers: [{ name: 'a', tiles: new Uint32Array(48) }],
	}));

	test('tileToWorld returns tile center', () => {
		expect(lt.tileToWorld(0, 0)).toEqual({ x: 16, y: 16 });
		expect(lt.tileToWorld(2, 3)).toEqual({ x: 80, y: 112 });
	});

	test('worldToTile returns enclosing tile', () => {
		expect(lt.worldToTile(0, 0)).toEqual({ tx: 0, ty: 0 });
		expect(lt.worldToTile(31, 31)).toEqual({ tx: 0, ty: 0 });
		expect(lt.worldToTile(32, 32)).toEqual({ tx: 1, ty: 1 });
		expect(lt.worldToTile(80, 112)).toEqual({ tx: 2, ty: 3 });
	});

	test('worldToTile handles negative coordinates', () => {
		const wt = lt.worldToTile(-1, -1);
		expect(wt.tx).toBe(-1);
		expect(wt.ty).toBe(-1);
	});

	test('round-trip: worldToTile(tileToWorld(tx,ty)) returns input', () => {
		for (let ty = 0; ty < lt.height; ty++) {
			for (let tx = 0; tx < lt.width; tx++) {
				const w = lt.tileToWorld(tx, ty);
				expect(lt.worldToTile(w.x, w.y)).toEqual({ tx, ty });
			}
		}
	});
});

// ==================== Query API ====================

describe('Tilemap — getTile', () => {
	const lt = createLoadedTilemap(makeRuntimeData());

	test('returns the GID at a cell', () => {
		expect(lt.getTile(0, 0, 0)).toBe(1);
		expect(lt.getTile(0, 1, 1)).toBe(0);
	});

	test('returns 0 for out-of-bounds cells', () => {
		expect(lt.getTile(0, -1, 0)).toBe(0);
		expect(lt.getTile(0, 0, -1)).toBe(0);
		expect(lt.getTile(0, 999, 0)).toBe(0);
		expect(lt.getTile(0, 0, 999)).toBe(0);
	});

	test('returns 0 for non-existent layer', () => {
		expect(lt.getTile(99, 0, 0)).toBe(0);
	});

	test('returns masked GID (no flip bits)', () => {
		const tiles = new Uint32Array([
			(TILE_FLIP_HORIZONTAL | 7) >>> 0,
		]);
		const lt2 = createLoadedTilemap({
			width: 1, height: 1, tileSize: 16,
			layers: [{ name: 'a', tiles }],
			tilesets: [{ textureKey: 't', columns: 4, tileWidth: 16, tileHeight: 16 }],
		});
		expect(lt2.getTile(0, 0, 0)).toBe(7);
	});
});

describe('Tilemap — isSolid / isOpaque / isWalkable', () => {
	const lt = createLoadedTilemap(makeRuntimeData());

	test('isSolid returns true for cells with solid metadata in any layer', () => {
		expect(lt.isSolid(0, 0)).toBe(true);
		expect(lt.isSolid(1, 1)).toBe(false); // GID 0 = empty
	});

	test('isOpaque mirrors blocksSight metadata', () => {
		expect(lt.isOpaque(0, 0)).toBe(true);
		expect(lt.isOpaque(1, 1)).toBe(false);
	});

	test('isWalkable returns the metadata flag (default false when missing)', () => {
		expect(lt.isWalkable(0, 0)).toBe(false);
		expect(lt.isWalkable(1, 1)).toBe(false);
	});

	test('isSolid ORs across multiple layers', () => {
		const lt2 = createLoadedTilemap({
			width: 2, height: 1, tileSize: 16,
			layers: [
				{ name: 'a', tiles: new Uint32Array([0, 0]) },
				{ name: 'b', tiles: new Uint32Array([1, 0]) },
			],
			tilesets: [{ textureKey: 't', columns: 4, tileWidth: 16, tileHeight: 16 }],
			tileMetadata: { 1: { solid: true } },
		});
		expect(lt2.isSolid(0, 0)).toBe(true);
		expect(lt2.isSolid(1, 0)).toBe(false);
	});

	test('tiles with no metadata return false from all flag queries', () => {
		const lt2 = createLoadedTilemap({
			width: 1, height: 1, tileSize: 16,
			layers: [{ name: 'a', tiles: new Uint32Array([42]) }],
			tilesets: [{ textureKey: 't', columns: 4, tileWidth: 16, tileHeight: 16 }],
		});
		expect(lt2.isSolid(0, 0)).toBe(false);
		expect(lt2.isOpaque(0, 0)).toBe(false);
		expect(lt2.isWalkable(0, 0)).toBe(false);
	});

	test('out-of-bounds queries return false', () => {
		expect(lt.isSolid(-1, 0)).toBe(false);
		expect(lt.isSolid(0, 999)).toBe(false);
	});
});

// ==================== buildNavGrid ====================

describe('Tilemap — buildNavGrid', () => {
	test('produces a NavGrid sized to the tilemap with cellSize=tileSize', () => {
		const lt = createLoadedTilemap(makeRuntimeData());
		const nav = lt.buildNavGrid(0);
		expect(nav.width).toBe(4);
		expect(nav.height).toBe(4);
		expect(nav.cellSize).toBe(16);
		expect(nav.cells.length).toBe(16);
	});

	test('default cost: walkable=1, blocked=0', () => {
		const lt = createLoadedTilemap({
			width: 3, height: 1, tileSize: 16,
			layers: [{ name: 'a', tiles: new Uint32Array([1, 2, 1]) }],
			tilesets: [{ textureKey: 't', columns: 4, tileWidth: 16, tileHeight: 16 }],
			tileMetadata: {
				1: { walkable: true },
				2: { walkable: false },
			},
		});
		const nav = lt.buildNavGrid(0);
		expect(nav.cells[0]).toBe(1);
		expect(nav.cells[1]).toBe(0);
		expect(nav.cells[2]).toBe(1);
	});

	test('custom costFn overrides defaults', () => {
		const lt = createLoadedTilemap({
			width: 3, height: 1, tileSize: 16,
			layers: [{ name: 'a', tiles: new Uint32Array([1, 2, 3]) }],
			tilesets: [{ textureKey: 't', columns: 4, tileWidth: 16, tileHeight: 16 }],
		});
		const nav = lt.buildNavGrid(0, (id) => (id === 2 ? 0 : 5));
		expect(nav.cells[0]).toBe(5);
		expect(nav.cells[1]).toBe(0);
		expect(nav.cells[2]).toBe(5);
	});

	test('throws for non-existent layer', () => {
		const lt = createLoadedTilemap(makeRuntimeData());
		expect(() => lt.buildNavGrid(99)).toThrow();
	});
});

// ==================== Object Layer API ====================

describe('Tilemap — getObjectLayer / getObjects', () => {
	const lt = createLoadedTilemap(makeRuntimeData({
		objectLayers: [
			{
				name: 'spawns',
				objects: [
					{ name: 'player_start', type: 'spawn', x: 32, y: 32, width: 0, height: 0, rotation: 0, properties: {} },
					{ name: 'enemy1', type: 'enemy', x: 64, y: 64, width: 0, height: 0, rotation: 0, properties: { difficulty: 'hard' } },
				],
			},
			{
				name: 'triggers',
				objects: [
					{ name: 't1', type: 'spawn', x: 0, y: 0, width: 16, height: 16, rotation: 0, properties: {} },
				],
			},
		],
	}));

	test('getObjectLayer returns named layer objects', () => {
		const objs = lt.getObjectLayer('spawns');
		expect(objs).toHaveLength(2);
		expect(objs[0]!.name).toBe('player_start');
	});

	test('getObjectLayer returns empty array for missing layer', () => {
		expect(lt.getObjectLayer('nope')).toEqual([]);
	});

	test('getObjects filters across all object layers by type', () => {
		const spawns = lt.getObjects('spawn');
		expect(spawns).toHaveLength(2);
		const names = spawns.map(o => o.name).sort();
		expect(names).toEqual(['player_start', 't1']);
	});

	test('getObjects returns empty array when no objects match', () => {
		expect(lt.getObjects('boss')).toEqual([]);
	});
});

// ==================== Tiled JSON Parser ====================

const minimalTiledMap: TiledMap = {
	width: 3,
	height: 2,
	tilewidth: 16,
	tileheight: 16,
	tilesets: [
		{
			firstgid: 1,
			columns: 4,
			tilewidth: 16,
			tileheight: 16,
			image: 'tiles.png',
			imagewidth: 64,
			imageheight: 64,
		},
	],
	layers: [
		{
			type: 'tilelayer',
			name: 'ground',
			width: 3,
			height: 2,
			data: [1, 2, 3, 4, 5, 6],
			opacity: 1,
			visible: true,
		},
	],
};

describe('Tilemap — parseTiledJSON', () => {
	test('parses a minimal Tiled map into a LoadedTilemap', () => {
		const lt = parseTiledJSON(minimalTiledMap, { tilesetTextures: { 'tiles.png': 'tiles' } });
		expect(lt.width).toBe(3);
		expect(lt.height).toBe(2);
		expect(lt.tileWidth).toBe(16);
		expect(lt.layers).toHaveLength(1);
		expect(lt.layers[0]!.name).toBe('ground');
		expect(lt.layers[0]!.tiles[0]).toBe(1);
		expect(lt.layers[0]!.tiles[5]).toBe(6);
	});

	test('resolves tileset image paths via tilesetTextures map', () => {
		const lt = parseTiledJSON(minimalTiledMap, { tilesetTextures: { 'tiles.png': 'my-texture' } });
		expect(lt.tilesets[0]!.textureKey).toBe('my-texture');
	});

	test('parses tile properties into tileMetadata', () => {
		const map: TiledMap = {
			...minimalTiledMap,
			tilesets: [
				{
					...minimalTiledMap.tilesets[0]!,
					tiles: [
						{ id: 0, properties: [
							{ name: 'solid', type: 'bool', value: true },
							{ name: 'walkable', type: 'bool', value: false },
							{ name: 'blocksSight', type: 'bool', value: true },
						]},
						{ id: 2, properties: [
							{ name: 'walkable', type: 'bool', value: true },
							{ name: 'cost', type: 'int', value: 5 },
						]},
					],
				},
			],
		};
		const lt = parseTiledJSON(map, { tilesetTextures: { 'tiles.png': 't' } });
		// Tiled tile id 0 + firstgid 1 = GID 1
		expect(lt.isSolid(0, 0)).toBe(true);
		expect(lt.isOpaque(0, 0)).toBe(true);
		expect(lt.isWalkable(0, 0)).toBe(false);

		// Tiled tile id 2 + firstgid 1 = GID 3
		expect(lt.isWalkable(2, 0)).toBe(true);
		// Custom property 'cost' should flow through unchanged
		const meta = lt.tileMetadata.get(3);
		expect(meta).toBeDefined();
		expect(meta!['cost']).toBe(5);
	});

	test('handles multiple tilesets with distinct firstgid', () => {
		const map: TiledMap = {
			...minimalTiledMap,
			tilesets: [
				{ firstgid: 1, columns: 2, tilewidth: 16, tileheight: 16, image: 'a.png', imagewidth: 32, imageheight: 32 },
				{ firstgid: 100, columns: 2, tilewidth: 16, tileheight: 16, image: 'b.png', imagewidth: 32, imageheight: 32 },
			],
			layers: [
				{ type: 'tilelayer', name: 'l', width: 2, height: 1, data: [2, 101], opacity: 1, visible: true },
			],
			width: 2,
			height: 1,
		};
		const lt = parseTiledJSON(map, { tilesetTextures: { 'a.png': 'a', 'b.png': 'b' } });
		expect(lt.tilesets).toHaveLength(2);
		expect(lt.tilesets[0]!.firstgid).toBe(1);
		expect(lt.tilesets[1]!.firstgid).toBe(100);
	});

	test('decodes flip bits in layer data', () => {
		const flippedGid = (TILE_FLIP_HORIZONTAL | 5) >>> 0;
		const map: TiledMap = {
			...minimalTiledMap,
			width: 1,
			height: 1,
			layers: [
				{ type: 'tilelayer', name: 'l', width: 1, height: 1, data: [flippedGid], opacity: 1, visible: true },
			],
		};
		const lt = parseTiledJSON(map, { tilesetTextures: { 'tiles.png': 't' } });
		// Raw tile data preserves flip bits
		expect(lt.layers[0]!.tiles[0]).toBe(flippedGid);
		// getTile returns masked id
		expect(lt.getTile(0, 0, 0)).toBe(5);
	});

	test('parses object layers', () => {
		const map: TiledMap = {
			...minimalTiledMap,
			layers: [
				...minimalTiledMap.layers,
				{
					type: 'objectgroup',
					name: 'spawns',
					objects: [
						{
							id: 1,
							name: 'p1',
							type: 'spawn',
							x: 100,
							y: 200,
							width: 0,
							height: 0,
							rotation: 0,
							properties: [
								{ name: 'team', type: 'string', value: 'red' },
							],
						},
					],
				},
			],
		};
		const lt = parseTiledJSON(map, { tilesetTextures: { 'tiles.png': 't' } });
		const spawns = lt.getObjectLayer('spawns');
		expect(spawns).toHaveLength(1);
		expect(spawns[0]!.name).toBe('p1');
		expect(spawns[0]!.type).toBe('spawn');
		expect(spawns[0]!.x).toBe(100);
		expect(spawns[0]!.y).toBe(200);
		expect(spawns[0]!.properties['team']).toBe('red');
	});

	test('parses parallax factors per layer', () => {
		const map: TiledMap = {
			...minimalTiledMap,
			layers: [
				{
					type: 'tilelayer',
					name: 'bg',
					width: 3,
					height: 2,
					data: [1, 2, 3, 4, 5, 6],
					opacity: 0.5,
					visible: true,
					parallaxx: 0.3,
					parallaxy: 0.7,
				},
			],
		};
		const lt = parseTiledJSON(map, { tilesetTextures: { 'tiles.png': 't' } });
		expect(lt.layers[0]!.parallax).toEqual({ x: 0.3, y: 0.7 });
		expect(lt.layers[0]!.opacity).toBe(0.5);
	});

	test('throws when a tilelayer references unknown texture', () => {
		expect(() => parseTiledJSON(minimalTiledMap, { tilesetTextures: {} })).toThrow();
	});
});

// ==================== Plugin Integration ====================

function buildEcs() {
	return ECSpresso.create()
		.withPlugin(createTilemapPlugin())
		.build();
}

describe('Tilemap Plugin — install', () => {
	test('registers tilemaps resource', () => {
		const ecs = buildEcs();
		expect(ecs.hasResource('tilemaps')).toBe(true);
	});

	test('tilemaps.registerRuntime stores a LoadedTilemap and is queryable', () => {
		const ecs = buildEcs();
		const reg = ecs.getResource('tilemaps');
		const lt = reg.registerRuntime('dungeon', makeRuntimeData());
		expect(reg.has('dungeon')).toBe(true);
		expect(reg.get('dungeon')).toBe(lt);
		expect(lt.width).toBe(4);
	});

	test('multiple tilemaps coexist by dataKey', () => {
		const ecs = buildEcs();
		const reg = ecs.getResource('tilemaps');
		reg.registerRuntime('world', makeRuntimeData());
		reg.registerRuntime('minimap', makeRuntimeData({ width: 2, height: 2, tileSize: 4, layers: [{ name: 'a', tiles: new Uint32Array(4) }] }));
		expect(reg.get('world')!.width).toBe(4);
		expect(reg.get('minimap')!.width).toBe(2);
	});

	test('re-registering with same dataKey replaces the existing entry', () => {
		const ecs = buildEcs();
		const reg = ecs.getResource('tilemaps');
		const a = reg.registerRuntime('m', makeRuntimeData());
		const b = reg.registerRuntime('m', makeRuntimeData({ width: 2, height: 2, layers: [{ name: 'a', tiles: new Uint32Array(4) }] }));
		expect(reg.get('m')).toBe(b);
		expect(a).not.toBe(b);
	});
});

// ==================== Collision Generation ====================

function buildEcsWithCollision() {
	const layers = defineCollisionLayers({ tilemap: ['player'], player: ['tilemap'] });
	return ECSpresso.create()
		.withPlugin(createTransformPlugin())
		.withPlugin(createCollisionPlugin({ layers }))
		.withPlugin(createTilemapPlugin({ collisionLayer: 'tilemap', collidesWith: ['player'] }))
		.build();
}

describe('Tilemap Plugin — collision generation', () => {
	test('does not spawn collision entities by default', async () => {
		const ecs = buildEcs();
		await ecs.initialize();
		const reg = ecs.getResource('tilemaps');
		reg.registerRuntime('m', makeRuntimeData());
		const colliders = ecs.getEntitiesWithQuery(['tilemapCollider']);
		expect(colliders.length).toBe(0);
	});

	test('opt-in collision spawns aabbCollider entities for solid tiles when configured', async () => {
		const ecs = buildEcsWithCollision();
		await ecs.initialize();
		const reg = ecs.getResource('tilemaps');
		reg.registerRuntime('m', makeRuntimeData());

		// Collision strips are generated by the plugin during registerRuntime
		// when a collisionLayer option is provided.
		const tileColliders = ecs.getEntitiesWithQuery(['tilemapCollider']);
		expect(tileColliders.length).toBeGreaterThan(0);

		// Each tilemap collider should have aabbCollider + collisionLayer
		for (const e of tileColliders) {
			expect(ecs.getComponent(e.id, 'aabbCollider')).toBeDefined();
			expect(ecs.getComponent(e.id, 'collisionLayer')).toBeDefined();
		}
	});

	test('contiguous solid rows merge into single AABB strips (fewer entities than cells)', async () => {
		const ecs = buildEcsWithCollision();
		await ecs.initialize();
		const reg = ecs.getResource('tilemaps');
		// 4x1 fully solid row → should merge into 1 strip, not 4 entities
		reg.registerRuntime('row', {
			width: 4, height: 1, tileSize: 16,
			layers: [{ name: 'a', tiles: new Uint32Array([1, 1, 1, 1]) }],
			tilesets: [{ textureKey: 't', columns: 4, tileWidth: 16, tileHeight: 16 }],
			tileMetadata: { 1: { solid: true } },
		});
		const colliders = ecs.getEntitiesWithQuery(['tilemapCollider']);
		expect(colliders.length).toBe(1);
		const aabb = ecs.getComponent(colliders[0]!.id, 'aabbCollider');
		expect(aabb!.width).toBe(64); // 4 tiles × 16
		expect(aabb!.height).toBe(16);
	});
});

