import test from 'node:test';
import assert from 'node:assert/strict';
import { clampAxis, clampPosition } from '../src/features/movable/geometry.js';

test('clampAxis leaves a value that already fits', () => {
  assert.equal(clampAxis(100, 200, 1000), 100);
  assert.equal(clampAxis(0, 200, 1000), 0);
  assert.equal(clampAxis(800, 200, 1000), 800);
});

test('clampAxis pins negatives to 0 and overshoot to the far edge', () => {
  assert.equal(clampAxis(-50, 200, 1000), 0);
  assert.equal(clampAxis(950, 200, 1000), 800);
});

test('clampAxis returns 0 when the widget is larger than or exactly fills the viewport', () => {
  assert.equal(clampAxis(50, 1200, 1000), 0, 'oversized widget pins to 0');
  assert.equal(clampAxis(-50, 1200, 1000), 0);
  assert.equal(clampAxis(50, 1000, 1000), 0, 'exact fit leaves no room to move');
});

test('clampAxis treats non-finite input as 0', () => {
  assert.equal(clampAxis(NaN, 200, 1000), 0);
  assert.equal(clampAxis(Infinity, 200, 1000), 800);
  assert.equal(clampAxis(100, NaN, 1000), 0);
  assert.equal(clampAxis(100, 200, NaN), 0);
});

test('clampPosition clamps both axes independently', () => {
  assert.deepEqual(
    clampPosition({ x: -20, y: 900, width: 200, height: 120, viewportWidth: 1000, viewportHeight: 800 }),
    { x: 0, y: 680 },
  );
  assert.deepEqual(
    clampPosition({ x: 300, y: 200, width: 200, height: 120, viewportWidth: 1000, viewportHeight: 800 }),
    { x: 300, y: 200 },
  );
  assert.deepEqual(
    clampPosition({ x: 300, y: 200, width: 1400, height: 900, viewportWidth: 1000, viewportHeight: 800 }),
    { x: 0, y: 0 },
  );
});
