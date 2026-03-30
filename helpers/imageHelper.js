// helpers/imageHelper.js
// Compress image using sharp and return the path to the compressed file
const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;

async function compressImage(inputPath, outputDir) {
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const outputPath = path.join(
    outputDir,
    `${base}-compressed${ext}`,
  );
  await sharp(inputPath)
    .resize(400, 400, { fit: "cover" })
    .jpeg({ quality: 70 })
    .toFile(outputPath);
  return outputPath;
}

module.exports = { compressImage };
