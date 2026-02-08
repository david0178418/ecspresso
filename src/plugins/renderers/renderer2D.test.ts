import { describe, test, expect } from 'bun:test';
import {
	computeViewportScale,
	physicalToLogical,
	type ViewportScale,
} from './renderer2D';

// ==================== computeViewportScale ====================

describe('computeViewportScale', () => {
	describe('fit mode', () => {
		test('letterbox when canvas is wider than design', () => {
			// 1200x600 canvas, 800x600 design → ratio X=1.5, Y=1.0 → uniform = 1.0
			const vs = computeViewportScale(1200, 600, 800, 600, 'fit');
			expect(vs.scaleX).toBe(1);
			expect(vs.scaleY).toBe(1);
			expect(vs.offsetX).toBe(200); // (1200 - 800*1) / 2
			expect(vs.offsetY).toBe(0);
			expect(vs.designWidth).toBe(800);
			expect(vs.designHeight).toBe(600);
			expect(vs.physicalWidth).toBe(1200);
			expect(vs.physicalHeight).toBe(600);
		});

		test('pillarbox when canvas is taller than design', () => {
			// 800x900 canvas, 800x600 design → ratio X=1.0, Y=1.5 → uniform = 1.0
			const vs = computeViewportScale(800, 900, 800, 600, 'fit');
			expect(vs.scaleX).toBe(1);
			expect(vs.scaleY).toBe(1);
			expect(vs.offsetX).toBe(0);
			expect(vs.offsetY).toBe(150); // (900 - 600*1) / 2
		});

		test('scales down uniformly when canvas is smaller', () => {
			// 400x300 canvas, 800x600 design → ratio X=0.5, Y=0.5 → uniform = 0.5
			const vs = computeViewportScale(400, 300, 800, 600, 'fit');
			expect(vs.scaleX).toBe(0.5);
			expect(vs.scaleY).toBe(0.5);
			expect(vs.offsetX).toBe(0);
			expect(vs.offsetY).toBe(0);
		});

		test('non-proportional scaling picks min ratio', () => {
			// 1600x600 canvas, 800x600 design → ratio X=2.0, Y=1.0 → uniform = 1.0
			const vs = computeViewportScale(1600, 600, 800, 600, 'fit');
			expect(vs.scaleX).toBe(1);
			expect(vs.scaleY).toBe(1);
			expect(vs.offsetX).toBe(400); // (1600 - 800) / 2
			expect(vs.offsetY).toBe(0);
		});

		test('exact match produces no offset', () => {
			const vs = computeViewportScale(800, 600, 800, 600, 'fit');
			expect(vs.scaleX).toBe(1);
			expect(vs.scaleY).toBe(1);
			expect(vs.offsetX).toBe(0);
			expect(vs.offsetY).toBe(0);
		});
	});

	describe('cover mode', () => {
		test('fills canvas by cropping edges', () => {
			// 1200x600 canvas, 800x600 design → ratio X=1.5, Y=1.0 → uniform = 1.5
			const vs = computeViewportScale(1200, 600, 800, 600, 'cover');
			expect(vs.scaleX).toBe(1.5);
			expect(vs.scaleY).toBe(1.5);
			expect(vs.offsetX).toBe(0); // (1200 - 800*1.5) / 2 = 0
			expect(vs.offsetY).toBe(-150); // (600 - 600*1.5) / 2 = -150
		});

		test('exact match produces no offset', () => {
			const vs = computeViewportScale(800, 600, 800, 600, 'cover');
			expect(vs.scaleX).toBe(1);
			expect(vs.scaleY).toBe(1);
			expect(vs.offsetX).toBe(0);
			expect(vs.offsetY).toBe(0);
		});

		test('picks max ratio', () => {
			// 400x600 canvas, 800x600 design → ratio X=0.5, Y=1.0 → uniform = 1.0
			const vs = computeViewportScale(400, 600, 800, 600, 'cover');
			expect(vs.scaleX).toBe(1);
			expect(vs.scaleY).toBe(1);
			expect(vs.offsetX).toBe(-200); // (400 - 800*1) / 2 = -200
			expect(vs.offsetY).toBe(0);
		});
	});

	describe('stretch mode', () => {
		test('non-uniform scale to fill exactly', () => {
			// 1600x300 canvas, 800x600 design → scaleX=2, scaleY=0.5
			const vs = computeViewportScale(1600, 300, 800, 600, 'stretch');
			expect(vs.scaleX).toBe(2);
			expect(vs.scaleY).toBe(0.5);
			expect(vs.offsetX).toBe(0); // (1600 - 800*2) / 2 = 0
			expect(vs.offsetY).toBe(0); // (300 - 600*0.5) / 2 = 0
		});

		test('exact match produces uniform scale of 1', () => {
			const vs = computeViewportScale(800, 600, 800, 600, 'stretch');
			expect(vs.scaleX).toBe(1);
			expect(vs.scaleY).toBe(1);
			expect(vs.offsetX).toBe(0);
			expect(vs.offsetY).toBe(0);
		});
	});
});

// ==================== physicalToLogical ====================

describe('physicalToLogical', () => {
	test('converts with no offset and scale 1', () => {
		const viewport: ViewportScale = {
			scaleX: 1, scaleY: 1,
			offsetX: 0, offsetY: 0,
			physicalWidth: 800, physicalHeight: 600,
			designWidth: 800, designHeight: 600,
		};
		const result = physicalToLogical(400, 300, viewport);
		expect(result.x).toBe(400);
		expect(result.y).toBe(300);
	});

	test('accounts for offset (letterbox)', () => {
		const viewport: ViewportScale = {
			scaleX: 1, scaleY: 1,
			offsetX: 200, offsetY: 0,
			physicalWidth: 1200, physicalHeight: 600,
			designWidth: 800, designHeight: 600,
		};
		// Physical (200, 300) → logical (0, 300) since offset subtracts
		const result = physicalToLogical(200, 300, viewport);
		expect(result.x).toBe(0);
		expect(result.y).toBe(300);
	});

	test('accounts for scale', () => {
		const viewport: ViewportScale = {
			scaleX: 2, scaleY: 2,
			offsetX: 0, offsetY: 0,
			physicalWidth: 1600, physicalHeight: 1200,
			designWidth: 800, designHeight: 600,
		};
		// Physical (400, 300) → logical (200, 150)
		const result = physicalToLogical(400, 300, viewport);
		expect(result.x).toBe(200);
		expect(result.y).toBe(150);
	});

	test('accounts for both offset and scale', () => {
		// fit: 1200x600 canvas, 800x600 design → scale=1, offsetX=200
		const viewport = computeViewportScale(1200, 600, 800, 600, 'fit');
		// Physical (600, 300) → logical (600-200)/1 = 400, 300/1 = 300
		const result = physicalToLogical(600, 300, viewport);
		expect(result.x).toBe(400);
		expect(result.y).toBe(300);
	});

	test('handles stretch mode non-uniform scaling', () => {
		const viewport = computeViewportScale(1600, 300, 800, 600, 'stretch');
		// scaleX=2, scaleY=0.5, offset=(0,0)
		// Physical (800, 150) → logical (400, 300)
		const result = physicalToLogical(800, 150, viewport);
		expect(result.x).toBe(400);
		expect(result.y).toBe(300);
	});

	test('cover mode with negative offset', () => {
		// cover: 400x600 canvas, 800x600 design → scale=1, offsetX=-200
		const viewport = computeViewportScale(400, 600, 800, 600, 'cover');
		// Physical (0, 0) → logical (0-(-200))/1 = 200, 0
		const result = physicalToLogical(0, 0, viewport);
		expect(result.x).toBe(200);
		expect(result.y).toBe(0);
	});

	test('origin maps correctly in fit mode', () => {
		const viewport = computeViewportScale(1200, 600, 800, 600, 'fit');
		// Physical origin of viewport area is at (offsetX, offsetY) = (200, 0)
		const result = physicalToLogical(viewport.offsetX, viewport.offsetY, viewport);
		expect(result.x).toBeCloseTo(0);
		expect(result.y).toBeCloseTo(0);
	});
});
