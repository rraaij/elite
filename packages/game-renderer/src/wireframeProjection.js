/**
 * Wireframe projection + clipping helpers for migration phase M5.1.2.
 *
 * This module implements a deterministic, software-style pipeline:
 * - transform model vertices into camera space
 * - clip each edge against the near plane
 * - project to 2D with perspective divide
 * - clip projected segments to viewport bounds
 *
 * The pipeline is intentionally explicit and testable to provide a stable
 * base before we add full LL9-level visibility and face normal behavior.
 */
/**
 * Region-code constants for Cohen-Sutherland 2D clipping.
 */
const OUTCODE_INSIDE = 0;
const OUTCODE_LEFT = 1;
const OUTCODE_RIGHT = 2;
const OUTCODE_TOP = 4;
const OUTCODE_BOTTOM = 8;
/**
 * Clamp one number into an inclusive range.
 */
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
/**
 * Compute one Cohen-Sutherland outcode for a point and viewport bounds.
 */
function computeOutcode(point, width, height) {
	let outcode = OUTCODE_INSIDE;
	if (point.x < 0) {
		outcode |= OUTCODE_LEFT;
	} else if (point.x > width - 1) {
		outcode |= OUTCODE_RIGHT;
	}
	if (point.y < 0) {
		outcode |= OUTCODE_TOP;
	} else if (point.y > height - 1) {
		outcode |= OUTCODE_BOTTOM;
	}
	return outcode;
}
/**
 * Clip a 2D line segment to viewport rectangle using Cohen-Sutherland.
 *
 * Returns `null` if fully outside, otherwise returns the clipped segment.
 */
function clipLineToViewport(start, end, width, height) {
	if (width <= 0 || height <= 0) {
		return null;
	}
	let pointA = { ...start };
	let pointB = { ...end };
	let outcodeA = computeOutcode(pointA, width, height);
	let outcodeB = computeOutcode(pointB, width, height);
	while (true) {
		// Trivial accept: both points are inside viewport.
		if ((outcodeA | outcodeB) === 0) {
			return {
				start: pointA,
				end: pointB,
			};
		}
		// Trivial reject: both points share one outside region.
		if ((outcodeA & outcodeB) !== 0) {
			return null;
		}
		// Clip one endpoint at a time against the appropriate border.
		const outcodeOutside = outcodeA !== 0 ? outcodeA : outcodeB;
		const deltaX = pointB.x - pointA.x;
		const deltaY = pointB.y - pointA.y;
		let x = 0;
		let y = 0;
		if ((outcodeOutside & OUTCODE_TOP) !== 0) {
			y = 0;
			x = pointA.x + (deltaY === 0 ? 0 : (deltaX * (y - pointA.y)) / deltaY);
		} else if ((outcodeOutside & OUTCODE_BOTTOM) !== 0) {
			y = height - 1;
			x = pointA.x + (deltaY === 0 ? 0 : (deltaX * (y - pointA.y)) / deltaY);
		} else if ((outcodeOutside & OUTCODE_RIGHT) !== 0) {
			x = width - 1;
			y = pointA.y + (deltaX === 0 ? 0 : (deltaY * (x - pointA.x)) / deltaX);
		} else {
			x = 0;
			y = pointA.y + (deltaX === 0 ? 0 : (deltaY * (x - pointA.x)) / deltaX);
		}
		// Update whichever point was outside.
		if (outcodeOutside === outcodeA) {
			pointA = { x, y };
			outcodeA = computeOutcode(pointA, width, height);
		} else {
			pointB = { x, y };
			outcodeB = computeOutcode(pointB, width, height);
		}
	}
}
/**
 * Rotate one world-space point into camera space.
 *
 * For this migration slice we only rotate around the Y axis (heading). This
 * keeps behavior deterministic and aligns with the current simulation model,
 * which already exposes heading as the primary orientation signal.
 */
function rotateWorldToCameraByHeading(worldPoint, headingDeg) {
	const radians = (-headingDeg * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return {
		x: worldPoint.x * cos - worldPoint.z * sin,
		y: worldPoint.y,
		z: worldPoint.x * sin + worldPoint.z * cos,
	};
}
/**
 * Clip one camera-space segment against the near plane z = nearPlaneZ.
 *
 * Returns `null` if segment is fully behind near plane.
 */
function clipSegmentAgainstNearPlane(start, end, nearPlaneZ) {
	const startInside = start.z >= nearPlaneZ;
	const endInside = end.z >= nearPlaneZ;
	if (!startInside && !endInside) {
		return null;
	}
	if (startInside && endInside) {
		return {
			start,
			end,
		};
	}
	const deltaZ = end.z - start.z;
	if (deltaZ === 0) {
		return null;
	}
	// Intersect with z = nearPlaneZ.
	const t = (nearPlaneZ - start.z) / deltaZ;
	const clippedPoint = {
		x: start.x + (end.x - start.x) * t,
		y: start.y + (end.y - start.y) * t,
		z: nearPlaneZ,
	};
	if (!startInside) {
		return {
			start: clippedPoint,
			end,
		};
	}
	return {
		start,
		end: clippedPoint,
	};
}
/**
 * Project one camera-space point into screen-space coordinates.
 */
function projectCameraPointToScreen(point, viewport) {
	const centerX = viewport.centerX ?? viewport.width * 0.5;
	const centerY = viewport.centerY ?? viewport.height * 0.5;
	const scale = viewport.focalLengthPx / point.z;
	return {
		x: centerX + point.x * scale,
		y: centerY - point.y * scale,
	};
}
/**
 * Apply model scale and ship translation to one blueprint vertex.
 */
function composeShipVertexWorldPosition(vertex, shipPosition, modelScale) {
	return {
		x: shipPosition.x + vertex.x * modelScale,
		y: shipPosition.y + vertex.y * modelScale,
		z: shipPosition.z + vertex.z * modelScale,
	};
}
/**
 * Validates viewport values and returns normalized, safe settings.
 */
function normalizeViewport(viewport) {
	const normalized = {
		width: Math.max(1, Math.floor(viewport.width)),
		height: Math.max(1, Math.floor(viewport.height)),
		focalLengthPx: Math.max(1, viewport.focalLengthPx),
		nearPlaneZ: Math.max(1, viewport.nearPlaneZ),
	};
	if (viewport.centerX !== undefined) {
		normalized.centerX = viewport.centerX;
	}
	if (viewport.centerY !== undefined) {
		normalized.centerY = viewport.centerY;
	}
	return normalized;
}
/**
 * Project ship wireframes into visible screen segments.
 *
 * Segment order is deterministic:
 * - ships sorted by slot id
 * - edges iterated in blueprint order
 */
export function projectWireframeScene(config) {
	const viewport = normalizeViewport(config.viewport);
	const modelScale = Math.max(0.01, config.modelScale);
	const orderedShips = [...config.ships]
		.filter((ship) => ship.kind === "ship")
		.sort((left, right) => left.slotId - right.slotId);
	const segments = [];
	let shipsProjected = 0;
	let edgesConsidered = 0;
	let edgesCulledByNearPlane = 0;
	let edgesCulledByViewport = 0;
	for (const ship of orderedShips) {
		const blueprint = config.resolveBlueprintById(ship.blueprintId);
		if (!blueprint) {
			continue;
		}
		shipsProjected += 1;
		for (let edgeIndex = 0; edgeIndex < blueprint.edges.length; edgeIndex += 1) {
			const edge = blueprint.edges[edgeIndex];
			if (!edge) {
				continue;
			}
			edgesConsidered += 1;
			const vertexStart = blueprint.vertices[edge.vertex1];
			const vertexEnd = blueprint.vertices[edge.vertex2];
			if (!vertexStart || !vertexEnd) {
				continue;
			}
			// Build camera-space endpoints for this edge.
			const worldStart = composeShipVertexWorldPosition(vertexStart, ship.position, modelScale);
			const worldEnd = composeShipVertexWorldPosition(vertexEnd, ship.position, modelScale);
			const cameraStart = rotateWorldToCameraByHeading(worldStart, config.headingDeg);
			const cameraEnd = rotateWorldToCameraByHeading(worldEnd, config.headingDeg);
			const clippedNear = clipSegmentAgainstNearPlane(cameraStart, cameraEnd, viewport.nearPlaneZ);
			if (!clippedNear) {
				edgesCulledByNearPlane += 1;
				continue;
			}
			const projectedStart = projectCameraPointToScreen(clippedNear.start, viewport);
			const projectedEnd = projectCameraPointToScreen(clippedNear.end, viewport);
			const clippedScreen = clipLineToViewport(
				projectedStart,
				projectedEnd,
				viewport.width,
				viewport.height,
			);
			if (!clippedScreen) {
				edgesCulledByViewport += 1;
				continue;
			}
			segments.push({
				slotId: ship.slotId,
				blueprintId: ship.blueprintId,
				edgeIndex,
				x0: clamp(clippedScreen.start.x, 0, viewport.width - 1),
				y0: clamp(clippedScreen.start.y, 0, viewport.height - 1),
				x1: clamp(clippedScreen.end.x, 0, viewport.width - 1),
				y1: clamp(clippedScreen.end.y, 0, viewport.height - 1),
			});
		}
	}
	return {
		segments,
		diagnostics: {
			shipsConsidered: orderedShips.length,
			shipsProjected,
			edgesConsidered,
			edgesCulledByNearPlane,
			edgesCulledByViewport,
			segmentsEmitted: segments.length,
		},
	};
}
