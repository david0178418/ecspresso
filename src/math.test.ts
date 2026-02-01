import { describe, test, expect } from 'bun:test';
import {
	vec2,
	vec2Zero,
	vec2Add,
	vec2Sub,
	vec2Scale,
	vec2Negate,
	vec2Dot,
	vec2Cross,
	vec2Length,
	vec2LengthSq,
	vec2Normalize,
	vec2Distance,
	vec2DistanceSq,
	vec2Equals,
} from './math';

describe('Vector2D Math', () => {
	describe('vec2', () => {
		test('creates a vector with given components', () => {
			const v = vec2(3, 4);
			expect(v).toEqual({ x: 3, y: 4 });
		});

		test('handles negative values', () => {
			const v = vec2(-1, -2);
			expect(v).toEqual({ x: -1, y: -2 });
		});
	});

	describe('vec2Zero', () => {
		test('returns a zero vector', () => {
			expect(vec2Zero()).toEqual({ x: 0, y: 0 });
		});
	});

	describe('vec2Add', () => {
		test('adds two vectors', () => {
			expect(vec2Add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
		});

		test('adding zero is identity', () => {
			const v = vec2(5, 7);
			expect(vec2Add(v, vec2Zero())).toEqual(v);
		});
	});

	describe('vec2Sub', () => {
		test('subtracts second from first', () => {
			expect(vec2Sub(vec2(5, 7), vec2(2, 3))).toEqual({ x: 3, y: 4 });
		});

		test('subtracting self yields zero', () => {
			const v = vec2(3, 4);
			expect(vec2Sub(v, v)).toEqual({ x: 0, y: 0 });
		});
	});

	describe('vec2Scale', () => {
		test('scales a vector by a scalar', () => {
			expect(vec2Scale(vec2(3, 4), 2)).toEqual({ x: 6, y: 8 });
		});

		test('scaling by zero yields zero', () => {
			expect(vec2Scale(vec2(3, 4), 0)).toEqual({ x: 0, y: 0 });
		});

		test('scaling by negative flips direction', () => {
			expect(vec2Scale(vec2(3, 4), -1)).toEqual({ x: -3, y: -4 });
		});
	});

	describe('vec2Negate', () => {
		test('negates both components', () => {
			expect(vec2Negate(vec2(3, -4))).toEqual({ x: -3, y: 4 });
		});

		test('negating zero is zero', () => {
			const n = vec2Negate(vec2Zero());
			expect(n.x + 0).toBe(0);
			expect(n.y + 0).toBe(0);
		});
	});

	describe('vec2Dot', () => {
		test('computes dot product', () => {
			expect(vec2Dot(vec2(1, 2), vec2(3, 4))).toBe(11);
		});

		test('perpendicular vectors have zero dot product', () => {
			expect(vec2Dot(vec2(1, 0), vec2(0, 1))).toBe(0);
		});
	});

	describe('vec2Cross', () => {
		test('computes 2D cross product', () => {
			expect(vec2Cross(vec2(1, 0), vec2(0, 1))).toBe(1);
		});

		test('parallel vectors have zero cross product', () => {
			expect(vec2Cross(vec2(2, 4), vec2(1, 2))).toBe(0);
		});
	});

	describe('vec2LengthSq', () => {
		test('computes squared length', () => {
			expect(vec2LengthSq(vec2(3, 4))).toBe(25);
		});

		test('zero vector has zero squared length', () => {
			expect(vec2LengthSq(vec2Zero())).toBe(0);
		});
	});

	describe('vec2Length', () => {
		test('computes length of a 3-4-5 triangle', () => {
			expect(vec2Length(vec2(3, 4))).toBe(5);
		});

		test('unit vector has length 1', () => {
			expect(vec2Length(vec2(1, 0))).toBe(1);
		});
	});

	describe('vec2Normalize', () => {
		test('normalizes to unit length', () => {
			const n = vec2Normalize(vec2(3, 4));
			expect(n.x).toBeCloseTo(0.6, 10);
			expect(n.y).toBeCloseTo(0.8, 10);
			expect(vec2Length(n)).toBeCloseTo(1, 10);
		});

		test('normalizing zero vector returns zero', () => {
			expect(vec2Normalize(vec2Zero())).toEqual({ x: 0, y: 0 });
		});

		test('normalizing unit vector returns same direction', () => {
			const n = vec2Normalize(vec2(1, 0));
			expect(n).toEqual({ x: 1, y: 0 });
		});
	});

	describe('vec2DistanceSq', () => {
		test('computes squared distance', () => {
			expect(vec2DistanceSq(vec2(0, 0), vec2(3, 4))).toBe(25);
		});

		test('distance from self is zero', () => {
			const v = vec2(5, 7);
			expect(vec2DistanceSq(v, v)).toBe(0);
		});
	});

	describe('vec2Distance', () => {
		test('computes distance', () => {
			expect(vec2Distance(vec2(0, 0), vec2(3, 4))).toBe(5);
		});

		test('distance is symmetric', () => {
			const a = vec2(1, 2);
			const b = vec2(4, 6);
			expect(vec2Distance(a, b)).toBe(vec2Distance(b, a));
		});
	});

	describe('vec2Equals', () => {
		test('equal vectors are equal', () => {
			expect(vec2Equals(vec2(1, 2), vec2(1, 2))).toBe(true);
		});

		test('different vectors are not equal', () => {
			expect(vec2Equals(vec2(1, 2), vec2(1, 3))).toBe(false);
		});

		test('respects epsilon tolerance', () => {
			expect(vec2Equals(vec2(1, 2), vec2(1.001, 2), 0.01)).toBe(true);
			expect(vec2Equals(vec2(1, 2), vec2(1.1, 2), 0.01)).toBe(false);
		});
	});

	describe('immutability', () => {
		test('vec2Add does not mutate inputs', () => {
			const a = vec2(1, 2);
			const b = vec2(3, 4);
			vec2Add(a, b);
			expect(a).toEqual({ x: 1, y: 2 });
			expect(b).toEqual({ x: 3, y: 4 });
		});

		test('vec2Scale does not mutate input', () => {
			const v = vec2(3, 4);
			vec2Scale(v, 10);
			expect(v).toEqual({ x: 3, y: 4 });
		});

		test('vec2Normalize does not mutate input', () => {
			const v = vec2(3, 4);
			vec2Normalize(v);
			expect(v).toEqual({ x: 3, y: 4 });
		});
	});
});
