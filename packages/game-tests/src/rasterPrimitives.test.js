import { describe, expect, it } from "vitest";
import { drawCircle, drawLine, plotPixel } from "../../game-renderer/src/index";

/**
 * Collect drawn pixels in a deterministic sorted string list.
 * Tests use this to assert primitive output without requiring a real canvas.
 */
function createPointCollector() {
	const points = [];
	const plot = (x, y) => {
		points.push({ x, y });
	};
	return {
		plot,
		toSortedPoints() {
			return points
				.map((point) => `${point.x},${point.y}`)
				.sort((left, right) => left.localeCompare(right));
		},
		hasOutOfBoundsPoint(bounds) {
			return points.some(
				(point) =>
					point.x < 0 || point.y < 0 || point.x >= bounds.width || point.y >= bounds.height,
			);
		},
	};
}
describe("renderer raster primitives", () => {
	it("clips pixel plotting to raster bounds", () => {
		const bounds = { width: 4, height: 4 };
		const collector = createPointCollector();
		expect(plotPixel(bounds, 1, 1, collector.plot)).toBe(true);
		expect(plotPixel(bounds, -1, 1, collector.plot)).toBe(false);
		expect(plotPixel(bounds, 1, -1, collector.plot)).toBe(false);
		expect(plotPixel(bounds, 4, 1, collector.plot)).toBe(false);
		expect(plotPixel(bounds, 1, 4, collector.plot)).toBe(false);
		expect(collector.toSortedPoints()).toEqual(["1,1"]);
	});
	it("draws horizontal lines with inclusive endpoints", () => {
		const bounds = { width: 8, height: 6 };
		const collector = createPointCollector();
		const plottedCount = drawLine(bounds, { x: 1, y: 2 }, { x: 4, y: 2 }, collector.plot);
		expect(plottedCount).toBe(4);
		expect(collector.toSortedPoints()).toEqual(["1,2", "2,2", "3,2", "4,2"]);
	});
	it("draws the same pixel set when line endpoints are reversed", () => {
		const bounds = { width: 8, height: 8 };
		const forwardCollector = createPointCollector();
		const reverseCollector = createPointCollector();
		drawLine(bounds, { x: 1, y: 1 }, { x: 6, y: 4 }, forwardCollector.plot);
		drawLine(bounds, { x: 6, y: 4 }, { x: 1, y: 1 }, reverseCollector.plot);
		expect(forwardCollector.toSortedPoints()).toEqual(reverseCollector.toSortedPoints());
	});
	it("clips lines that start and end outside bounds", () => {
		const bounds = { width: 4, height: 4 };
		const collector = createPointCollector();
		const plottedCount = drawLine(bounds, { x: -2, y: -2 }, { x: 5, y: 5 }, collector.plot);
		expect(plottedCount).toBe(4);
		expect(collector.toSortedPoints()).toEqual(["0,0", "1,1", "2,2", "3,3"]);
		expect(collector.hasOutOfBoundsPoint(bounds)).toBe(false);
	});
	it("draws radius-zero circles as one pixel", () => {
		const bounds = { width: 10, height: 10 };
		const collector = createPointCollector();
		const plottedCount = drawCircle(bounds, { x: 5, y: 5 }, 0, collector.plot);
		expect(plottedCount).toBe(1);
		expect(collector.toSortedPoints()).toEqual(["5,5"]);
	});
	it("draws midpoint circle octants for radius two", () => {
		const bounds = { width: 12, height: 12 };
		const collector = createPointCollector();
		const plottedCount = drawCircle(bounds, { x: 5, y: 5 }, 2, collector.plot);
		expect(plottedCount).toBe(12);
		expect(collector.toSortedPoints()).toEqual([
			"3,4",
			"3,5",
			"3,6",
			"4,3",
			"4,7",
			"5,3",
			"5,7",
			"6,3",
			"6,7",
			"7,4",
			"7,5",
			"7,6",
		]);
	});
	it("clips circles near an edge without emitting out-of-bounds pixels", () => {
		const bounds = { width: 4, height: 4 };
		const collector = createPointCollector();
		const plottedCount = drawCircle(bounds, { x: 0, y: 0 }, 3, collector.plot);
		expect(plottedCount).toBeGreaterThan(0);
		expect(collector.hasOutOfBoundsPoint(bounds)).toBe(false);
	});
});
