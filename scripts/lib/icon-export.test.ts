import { assert, describe, it } from "@effect/vitest";
import sharp from "sharp";

import { encodePngIco, frameMacIcon, readPngDimensions } from "./icon-export.ts";

const pngHeader = (width: number, height: number) => {
  const contents = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(contents);
  contents.write("IHDR", 12, "ascii");
  contents.writeUInt32BE(width, 16);
  contents.writeUInt32BE(height, 20);
  return contents;
};

describe("icon export", () => {
  it("preserves the macOS artwork inside transparent margins with a translucent shadow", async () => {
    const body = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="824" height="824"><rect width="824" height="824" rx="180" fill="#336699"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    const result = await frameMacIcon(body);
    assert.deepEqual(readPngDimensions(result), { width: 1024, height: 1024 });
    const pixels = await sharp(result).raw().toBuffer();
    const pixel = (x: number, y: number) =>
      pixels.subarray((y * 1024 + x) * 4, (y * 1024 + x + 1) * 4);
    assert.deepEqual([...pixel(512, 512)], [51, 102, 153, 255]);
    for (const [x, y] of [
      [100, 512],
      [923, 512],
      [512, 100],
      [512, 923],
    ]) {
      assert.equal(pixel(x!, y!)[3], 255);
    }
    for (const [x, y] of [
      [99, 512],
      [924, 512],
      [512, 99],
      [512, 924],
    ]) {
      assert.isBelow(pixel(x!, y!)[3]!, 255);
    }
    assert.equal(pixel(0, 0)[3], 0);
    assert.equal(pixel(1023, 1023)[3], 0);
    assert.isAbove(pixel(512, 934)[3]!, 0);
    assert.deepEqual([...pixel(512, 934).subarray(0, 3)], [0, 0, 0]);
  });

  it("reads dimensions from a PNG IHDR chunk", () => {
    assert.deepEqual(readPngDimensions(pngHeader(1024, 512)), { width: 1024, height: 512 });
  });

  it("encodes PNG renditions into an ICO directory", () => {
    const small = pngHeader(16, 16);
    const large = pngHeader(256, 256);
    const ico = encodePngIco([
      { size: 16, contents: small },
      { size: 256, contents: large },
    ]);

    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 2);
    assert.equal(ico.readUInt8(6), 16);
    assert.equal(ico.readUInt8(22), 0);
    assert.equal(ico.readUInt32LE(18), 38);
    assert.equal(ico.readUInt32LE(34), 38 + small.length);
    assert.deepEqual(ico.subarray(38, 38 + small.length), small);
    assert.deepEqual(ico.subarray(38 + small.length), large);
  });

  it("rejects duplicate ICO rendition sizes", () => {
    assert.throws(
      () =>
        encodePngIco([
          { size: 32, contents: pngHeader(32, 32) },
          { size: 32, contents: pngHeader(32, 32) },
        ]),
      /provided more than once/,
    );
  });
});
