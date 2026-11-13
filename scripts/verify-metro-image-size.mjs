// Synthetic Metro regression test for the scoped image-size >=2.1.0 override.
// No user files or production data are read or modified.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const metroAssetsPath = path.join(root, 'node_modules', 'metro', 'src', 'Assets.js');
assert.ok(fs.existsSync(metroAssetsPath), 'Metro dependency must be installed');
const metroRequire = createRequire(metroAssetsPath);
const imageSize = metroRequire('image-size');
assert.equal(
  typeof imageSize.default,
  'function',
  'Metro must resolve the patched image-size CommonJS default export'
);

const { getAssetData, getAssetSize } = require(metroAssetsPath);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'colanode-metro-image-'));
const filename = path.join(directory, 'test-image.png');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64'
);

try {
  fs.writeFileSync(filename, png);
  const byBytes = getAssetSize('png', png, filename);
  assert.equal(byBytes.width, 1);
  assert.equal(byBytes.height, 1);

  const byFile = await getAssetData(
    filename,
    'test-image.png',
    [],
    null,
    '/assets'
  );
  assert.equal(byFile.width, 1);
  assert.equal(byFile.height, 1);
  console.log('Metro Buffer and filename image-size compatibility PASS');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
