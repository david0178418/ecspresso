import { describe, test } from 'bun:test';
import type { AssetEvents } from './asset-types';
import type { ScreenEvents } from './screen-types';

describe('Parameterized AssetEvents', () => {
	test('narrows assetLoaded.key to specific asset keys', () => {
		type Narrowed = AssetEvents<'sprite' | 'sound'>;
		const event: Narrowed['assetLoaded'] = { key: 'sprite' };
		// @ts-expect-error - 'invalid' is not assignable to 'sprite' | 'sound'
		const _bad: Narrowed['assetLoaded'] = { key: 'invalid' };
		void event;
		void _bad;
	});

	test('narrows assetGroupLoaded.group to specific group names', () => {
		type Narrowed = AssetEvents<string, 'level1' | 'level2'>;
		const event: Narrowed['assetGroupLoaded'] = { group: 'level1' };
		// @ts-expect-error - 'invalid' is not assignable to 'level1' | 'level2'
		const _bad: Narrowed['assetGroupLoaded'] = { group: 'invalid' };
		void event;
		void _bad;
	});

	test('unparameterized AssetEvents defaults to string', () => {
		type Default = AssetEvents;
		const event: Default['assetLoaded'] = { key: 'anything' };
		const group: Default['assetGroupLoaded'] = { group: 'anyGroup' };
		void event;
		void group;
	});
});

describe('Parameterized ScreenEvents', () => {
	test('narrows screenEnter.screen to specific screen names', () => {
		type Narrowed = ScreenEvents<'menu' | 'game'>;
		const event: Narrowed['screenEnter'] = { screen: 'menu', config: {} };
		// @ts-expect-error - 'invalid' is not assignable to 'menu' | 'game'
		const _bad: Narrowed['screenEnter'] = { screen: 'invalid', config: {} };
		void event;
		void _bad;
	});

	test('narrows screenExit.screen to specific screen names', () => {
		type Narrowed = ScreenEvents<'menu' | 'game'>;
		const event: Narrowed['screenExit'] = { screen: 'game' };
		// @ts-expect-error - 'invalid' is not assignable to 'menu' | 'game'
		const _bad: Narrowed['screenExit'] = { screen: 'invalid' };
		void event;
		void _bad;
	});

	test('unparameterized ScreenEvents defaults to string', () => {
		type Default = ScreenEvents;
		const event: Default['screenEnter'] = { screen: 'anything', config: {} };
		const exit: Default['screenExit'] = { screen: 'anyScreen' };
		void event;
		void exit;
	});
});
