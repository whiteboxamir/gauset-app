import fs from "node:fs/promises";
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(left, up, upLeft) {
    const predictor = left + up - upLeft;
    const leftDistance = Math.abs(predictor - left);
    const upDistance = Math.abs(predictor - up);
    const upLeftDistance = Math.abs(predictor - upLeft);
    if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
        return left;
    }
    if (upDistance <= upLeftDistance) {
        return up;
    }
    return upLeft;
}

function summarizeSamples(samples, sampleSource) {
    if (samples.length === 0) {
        return {
            available: false,
            reason: "empty_sample_set",
        };
    }

    let fingerprint = 2166136261;
    let lumaSum = 0;
    let alphaSum = 0;
    let spreadSum = 0;
    let minLuma = 255;
    let maxLuma = 0;
    let opaqueCount = 0;

    for (const sample of samples) {
        lumaSum += sample.luma;
        alphaSum += sample.a;
        spreadSum += sample.spread;
        minLuma = Math.min(minLuma, sample.luma);
        maxLuma = Math.max(maxLuma, sample.luma);
        if (sample.a > 16) {
            opaqueCount += 1;
        }

        fingerprint ^= sample.r;
        fingerprint = Math.imul(fingerprint, 16777619);
        fingerprint ^= sample.g;
        fingerprint = Math.imul(fingerprint, 16777619);
        fingerprint ^= sample.b;
        fingerprint = Math.imul(fingerprint, 16777619);
        fingerprint ^= sample.a;
        fingerprint = Math.imul(fingerprint, 16777619);
    }

    const sampleCount = samples.length;
    const meanLuma = lumaSum / sampleCount;
    const meanAlpha = alphaSum / (sampleCount * 255);
    const meanColorSpread = spreadSum / sampleCount;
    const lumaVariance = samples.reduce((sum, sample) => sum + (sample.luma - meanLuma) ** 2, 0) / sampleCount;

    return {
        available: true,
        reason: null,
        sampleSource,
        fingerprint: fingerprint >>> 0,
        sampleCount,
        meanLuma,
        lumaStdDev: Math.sqrt(lumaVariance),
        lumaRange: maxLuma - minLuma,
        meanAlpha,
        opaqueRatio: opaqueCount / sampleCount,
        meanColorSpread,
        samples,
    };
}

async function decodePng(filePath) {
    const buffer = await fs.readFile(filePath);
    if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new Error(`Not a PNG file: ${filePath}`);
    }

    let offset = PNG_SIGNATURE.length;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let compression = 0;
    let filterMethod = 0;
    let interlace = 0;
    const idatChunks = [];

    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString("ascii", offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const data = buffer.subarray(dataStart, dataEnd);
        offset = dataEnd + 4;

        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data.readUInt8(8);
            colorType = data.readUInt8(9);
            compression = data.readUInt8(10);
            filterMethod = data.readUInt8(11);
            interlace = data.readUInt8(12);
        } else if (type === "IDAT") {
            idatChunks.push(data);
        } else if (type === "IEND") {
            break;
        }
    }

    if (!width || !height) {
        throw new Error(`PNG is missing IHDR dimensions: ${filePath}`);
    }
    if (bitDepth !== 8) {
        throw new Error(`Unsupported PNG bit depth ${bitDepth} in ${filePath}`);
    }
    if (compression !== 0 || filterMethod !== 0 || interlace !== 0) {
        throw new Error(`Unsupported PNG compression/filter/interlace in ${filePath}`);
    }

    const bytesPerPixel =
        colorType === 6 ? 4 :
        colorType === 2 ? 3 :
        colorType === 0 ? 1 :
        0;
    if (!bytesPerPixel) {
        throw new Error(`Unsupported PNG color type ${colorType} in ${filePath}`);
    }

    const scanlineLength = width * bytesPerPixel;
    const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
    const pixels = Buffer.allocUnsafe(height * scanlineLength);
    let readOffset = 0;

    for (let row = 0; row < height; row += 1) {
        const filterType = inflated.readUInt8(readOffset);
        readOffset += 1;
        const rowStart = row * scanlineLength;

        for (let index = 0; index < scanlineLength; index += 1) {
            const raw = inflated[readOffset + index];
            const left = index >= bytesPerPixel ? pixels[rowStart + index - bytesPerPixel] : 0;
            const up = row > 0 ? pixels[rowStart - scanlineLength + index] : 0;
            const upLeft = row > 0 && index >= bytesPerPixel ? pixels[rowStart - scanlineLength + index - bytesPerPixel] : 0;

            let value = raw;
            if (filterType === 1) {
                value = (raw + left) & 0xff;
            } else if (filterType === 2) {
                value = (raw + up) & 0xff;
            } else if (filterType === 3) {
                value = (raw + Math.floor((left + up) / 2)) & 0xff;
            } else if (filterType === 4) {
                value = (raw + paethPredictor(left, up, upLeft)) & 0xff;
            } else if (filterType !== 0) {
                throw new Error(`Unsupported PNG filter type ${filterType} in ${filePath}`);
            }

            pixels[rowStart + index] = value;
        }

        readOffset += scanlineLength;
    }

    return {
        width,
        height,
        colorType,
        bytesPerPixel,
        pixels,
    };
}

export async function samplePngVisual(filePath, samplePositions = null) {
    try {
        const png = await decodePng(filePath);
        const positions =
            Array.isArray(samplePositions) && samplePositions.length > 0
                ? samplePositions
                : [
                      [0.5, 0.5],
                      [0.25, 0.25],
                      [0.75, 0.25],
                      [0.25, 0.75],
                      [0.75, 0.75],
                  ];
        const samples = [];

        for (const [nx, ny] of positions) {
            const x = Math.max(0, Math.min(png.width - 1, Math.round((png.width - 1) * nx)));
            const y = Math.max(0, Math.min(png.height - 1, Math.round((png.height - 1) * ny)));
            const pixelOffset = (y * png.width + x) * png.bytesPerPixel;
            const r = png.pixels[pixelOffset + 0];
            const g = png.colorType === 0 ? png.pixels[pixelOffset + 0] : png.pixels[pixelOffset + 1];
            const b = png.colorType === 0 ? png.pixels[pixelOffset + 0] : png.pixels[pixelOffset + 2];
            const a = png.colorType === 6 ? png.pixels[pixelOffset + 3] : 255;
            const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
            const spread = Math.max(r, g, b) - Math.min(r, g, b);

            samples.push({
                x,
                y,
                r,
                g,
                b,
                a,
                luma,
                spread,
            });
        }

        return summarizeSamples(samples, "screenshot_png");
    } catch (error) {
        return {
            available: false,
            reason: "png_decode_failed",
            message: error instanceof Error ? error.message : String(error),
        };
    }
}
