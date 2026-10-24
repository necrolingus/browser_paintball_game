(function () {
  function normalizeAngleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Ray-segment intersection: ray from (ox, oy) along (dx, dy) of length maxDist
  // Segment from (x1, y1) to (x2, y2)
  function raySegmentHit(ox, oy, dx, dy, x1, y1, x2, y2) {
    const sx = x2 - x1;
    const sy = y2 - y1;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-8) return null;

    const qpx = x1 - ox;
    const qpy = y1 - oy;
    const t = (qpx * sy - qpy * sx) / denom;
    if (t < 0) return null;

    const u = (qpx * dy - qpy * dx) / denom;
    if (u < 0 || u > 1) return null;

    return t;
  }

  // Check if line segment (x1, y1) -> (x2, y2) is blocked by any obstacle
  function hasLineOfSight(x1, y1, x2, y2, obstacles) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return true;
    const ux = dx / dist;
    const uy = dy / dist;

    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      // Quick AABB bounding box rejection
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      if (maxX < ob.x || minX > ob.x + ob.w || maxY < ob.y || minY > ob.y + ob.h) {
        continue;
      }

      const rx = ob.x;
      const ry = ob.y;
      const rw = ob.w;
      const rh = ob.h;

      const t1 = raySegmentHit(x1, y1, ux, uy, rx, ry, rx + rw, ry);
      if (t1 !== null && t1 < dist - 0.5) return false;
      const t2 = raySegmentHit(x1, y1, ux, uy, rx + rw, ry, rx + rw, ry + rh);
      if (t2 !== null && t2 < dist - 0.5) return false;
      const t3 = raySegmentHit(x1, y1, ux, uy, rx + rw, ry + rh, rx, ry + rh);
      if (t3 !== null && t3 < dist - 0.5) return false;
      const t4 = raySegmentHit(x1, y1, ux, uy, rx, ry + rh, rx, ry);
      if (t4 !== null && t4 < dist - 0.5) return false;
    }

    return true;
  }

  // Cast a single ray from (ox, oy) at angle up to maxDist against obstacles
  function castRay(ox, oy, angle, maxDist, nearbyObstacles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let bestT = maxDist;
    let hitOb = null;

    for (let i = 0; i < nearbyObstacles.length; i++) {
      const ob = nearbyObstacles[i];
      const rx = ob.x;
      const ry = ob.y;
      const rw = ob.w;
      const rh = ob.h;

      const t1 = raySegmentHit(ox, oy, dx, dy, rx, ry, rx + rw, ry);
      if (t1 !== null && t1 < bestT) { bestT = t1; hitOb = ob; }
      const t2 = raySegmentHit(ox, oy, dx, dy, rx + rw, ry, rx + rw, ry + rh);
      if (t2 !== null && t2 < bestT) { bestT = t2; hitOb = ob; }
      const t3 = raySegmentHit(ox, oy, dx, dy, rx + rw, ry + rh, rx, ry + rh);
      if (t3 !== null && t3 < bestT) { bestT = t3; hitOb = ob; }
      const t4 = raySegmentHit(ox, oy, dx, dy, rx, ry + rh, rx, ry);
      if (t4 !== null && t4 < bestT) { bestT = t4; hitOb = ob; }
    }

    return {
      x: ox + dx * bestT,
      y: oy + dy * bestT,
      dist: bestT,
      hitOb
    };
  }

  // Compute the 2D visibility cone polygon with exact obstacle shadow cutouts
  function computeVisibilityCone(ox, oy, aimAngle, fovRadians, viewRange, obstacles) {
    const halfFov = fovRadians / 2;

    // Filter obstacles within viewRange for fast raycasting
    const nearby = [];
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      const cx = ob.x + ob.w / 2;
      const cy = ob.y + ob.h / 2;
      const maxRadius = Math.hypot(ob.w, ob.h) / 2;
      if (Math.hypot(cx - ox, cy - oy) <= viewRange + maxRadius + 10) {
        nearby.push(ob);
      }
    }

    // Collect ray offset angles in [-halfFov, +halfFov] relative to aimAngle
    const offsets = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      offsets.push(-halfFov + (i / steps) * fovRadians);
    }

    // Add obstacle corner angles with +-epsilon jitter for crisp shadow edges
    const eps = 0.0006;
    for (let i = 0; i < nearby.length; i++) {
      const ob = nearby[i];
      const corners = [
        [ob.x, ob.y],
        [ob.x + ob.w, ob.y],
        [ob.x + ob.w, ob.y + ob.h],
        [ob.x, ob.y + ob.h]
      ];
      for (let c = 0; c < 4; c++) {
        const ang = Math.atan2(corners[c][1] - oy, corners[c][0] - ox);
        const diff = normalizeAngleDiff(ang, aimAngle);
        if (diff >= -halfFov - 0.01 && diff <= halfFov + 0.01) {
          if (diff - eps >= -halfFov) offsets.push(diff - eps);
          if (diff >= -halfFov && diff <= halfFov) offsets.push(diff);
          if (diff + eps <= halfFov) offsets.push(diff + eps);
        }
      }
    }

    offsets.sort((a, b) => a - b);

    const points = [{ x: ox, y: oy }];
    const litObstacles = new Set();
    let prevOffset = null;
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i];
      if (prevOffset !== null && Math.abs(off - prevOffset) < 1e-5) continue;
      prevOffset = off;
      const hit = castRay(ox, oy, aimAngle + off, viewRange, nearby);
      points.push(hit);
      if (hit.hitOb) {
        litObstacles.add(hit.hitOb.id);
      }
    }

    return { points, litObstacles };
  }

  // Determine if a target (enemy player or projectile) is visible to viewer
  function isEntityVisible(tx, ty, entityRadius, viewerX, viewerY, viewerAngle, fovRadians, viewRange, closeSenseRadius, obstacles) {
    const dx = tx - viewerX;
    const dy = ty - viewerY;
    const dist = Math.hypot(dx, dy);

    if (dist > viewRange + entityRadius) return false;

    // Check if inside immediate proximity sense or within view cone angle
    const angleToCenter = Math.atan2(dy, dx);
    const angleDiff = Math.abs(normalizeAngleDiff(angleToCenter, viewerAngle));
    const angularSlack = dist > 1 ? Math.atan2(entityRadius, dist) : Math.PI;
    const inCone = angleDiff <= fovRadians / 2 + angularSlack;
    const inCloseSense = dist <= closeSenseRadius + entityRadius;

    if (!inCone && !inCloseSense) return false;

    // Check unobstructed line of sight to center or shoulder edges of target
    if (hasLineOfSight(viewerX, viewerY, tx, ty, obstacles)) {
      return true;
    }

    if (entityRadius > 4 && dist > 1) {
      const perpX = (-dy / dist) * (entityRadius * 0.75);
      const perpY = (dx / dist) * (entityRadius * 0.75);
      if (hasLineOfSight(viewerX, viewerY, tx + perpX, ty + perpY, obstacles)) return true;
      if (hasLineOfSight(viewerX, viewerY, tx - perpX, ty - perpY, obstacles)) return true;
    }

    return false;
  }

  window.PaintballVisibility = {
    normalizeAngleDiff,
    hasLineOfSight,
    castRay,
    computeVisibilityCone,
    isEntityVisible
  };
})();
