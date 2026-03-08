/**
 * Lightweight raster primitive helpers for software-style rendering.
 *
 * The original game relied heavily on integer raster routines. These helpers
 * intentionally stay integer-first and side-effect free except for invoking
 * the provided pixel plot callback.
 */

/**
 * Screen bounds used by clipping checks.
 */
export interface RasterBounds {
	width: number;
	height: number;
}

/**
 * Integer pixel coordinate used by line/circle APIs.
 */
export interface RasterPoint {
	x: number;
	y: number;
}

/**
 * Callback used by primitives to emit pixels.
 *
 * The callback itself does not need to handle clipping; primitives clip first.
 */
export type PixelPlotter = (x: number, y: number) => void;

/**
 * Normalize one coordinate to integer pixel space.
 *
 * `Math.trunc` is used so positive and negative values are treated consistently
 * with integer-like arithmetic in legacy-style raster code paths.
 */
function toRasterInt(value: number): number {
	return Math.trunc(value);
}

/**
 * Validate that bounds represent a drawable positive-area surface.
 */
function hasDrawableArea(bounds: RasterBounds): boolean {
	return bounds.width > 0 && bounds.height > 0;
}

/**
 * Check whether one integer coordinate lies inside the visible raster area.
 */
function isInBounds(bounds: RasterBounds, x: number, y: number): boolean {
	return x >= 0 && y >= 0 && x < bounds.width && y < bounds.height;
}

/**
 * Plot one clipped pixel.
 *
 * Returns `true` when a pixel was emitted and `false` when clipped.
 */
export function plotPixel(bounds: RasterBounds, x: number, y: number, plot: PixelPlotter): boolean {
	if (!hasDrawableArea(bounds)) {
		return false;
	}

	const pixelX = toRasterInt(x);
	const pixelY = toRasterInt(y);
	if (!isInBounds(bounds, pixelX, pixelY)) {
		return false;
	}

	plot(pixelX, pixelY);
	return true;
}

/**
 * Draw one line segment with Bresenham integer stepping.
 *
 * We intentionally keep this implementation straightforward:
 * - integer stepping only
 * - clipping handled per plotted pixel
 * - deterministic traversal order for stable replay/test output
 *
 * Returns number of visible pixels emitted.
 */
export function drawLine(
	bounds: RasterBounds,
	start: RasterPoint,
	end: RasterPoint,
	plot: PixelPlotter,
): number {
	if (!hasDrawableArea(bounds)) {
		return 0;
	}

	let x0 = toRasterInt(start.x);
	let y0 = toRasterInt(start.y);
	const x1 = toRasterInt(end.x);
	const y1 = toRasterInt(end.y);

	const deltaX = Math.abs(x1 - x0);
	const stepX = x0 < x1 ? 1 : -1;
	const deltaY = -Math.abs(y1 - y0);
	const stepY = y0 < y1 ? 1 : -1;

	let error = deltaX + deltaY;
	let plottedCount = 0;

	while (true) {
		if (plotPixel(bounds, x0, y0, plot)) {
			plottedCount += 1;
		}

		if (x0 === x1 && y0 === y1) {
			break;
		}

		const doubledError = error * 2;
		if (doubledError >= deltaY) {
			error += deltaY;
			x0 += stepX;
		}
		if (doubledError <= deltaX) {
			error += deltaX;
			y0 += stepY;
		}
	}

	return plottedCount;
}

/**
 * Plot one deduplicated symmetry point list for circle drawing.
 *
 * Midpoint circle math naturally emits eight-way symmetry points, but some
 * octant pairs overlap for small radii (for example `x === y` or `y === 0`).
 * We deduplicate within each step so returned plot counts represent unique
 * visible pixels.
 */
function plotUniqueCircleStepPoints(
	bounds: RasterBounds,
	centerX: number,
	centerY: number,
	x: number,
	y: number,
	plot: PixelPlotter,
): number {
	const visited = new Set<string>();
	const points: ReadonlyArray<RasterPoint> = [
		{ x: centerX + x, y: centerY + y },
		{ x: centerX - x, y: centerY + y },
		{ x: centerX + x, y: centerY - y },
		{ x: centerX - x, y: centerY - y },
		{ x: centerX + y, y: centerY + x },
		{ x: centerX - y, y: centerY + x },
		{ x: centerX + y, y: centerY - x },
		{ x: centerX - y, y: centerY - x },
	] as const;

	let plottedCount = 0;
	for (const point of points) {
		const key = `${point.x},${point.y}`;
		if (visited.has(key)) {
			continue;
		}
		visited.add(key);

		if (plotPixel(bounds, point.x, point.y, plot)) {
			plottedCount += 1;
		}
	}

	return plottedCount;
}

/**
 * Draw one circle outline via midpoint circle stepping.
 *
 * Returns number of visible pixels emitted.
 */
export function drawCircle(
	bounds: RasterBounds,
	center: RasterPoint,
	radius: number,
	plot: PixelPlotter,
): number {
	if (!hasDrawableArea(bounds)) {
		return 0;
	}

	const centerX = toRasterInt(center.x);
	const centerY = toRasterInt(center.y);
	const circleRadius = Math.max(0, toRasterInt(radius));

	let x = circleRadius;
	let y = 0;
	let decision = 1 - circleRadius;
	let plottedCount = 0;

	while (x >= y) {
		plottedCount += plotUniqueCircleStepPoints(bounds, centerX, centerY, x, y, plot);
		y += 1;

		if (decision <= 0) {
			decision += y * 2 + 1;
			continue;
		}

		x -= 1;
		decision += (y - x) * 2 + 1;
	}

	return plottedCount;
}
