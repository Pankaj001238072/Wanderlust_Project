// helpers/cleanupTempUploads.js
// Deletes files older than 1 minute from uploads/ and public/uploads/profile/

const fs = require("fs").promises;
const path = require("path");

const UPLOAD_DIRS = [
  path.join(__dirname, "../uploads"),
  path.join(__dirname, "../public/uploads/profile"),
];

const ONE_MINUTE = 60 * 1000;

async function cleanupOldFiles() {
  const now = Date.now();
  for (const dir of UPLOAD_DIRS) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stat = await fs.stat(filePath);
          if (
            stat.isFile() &&
            now - stat.mtimeMs > ONE_MINUTE
          ) {
            await fs.unlink(filePath);
            console.log("Deleted temp file:", filePath);
          }
        } catch (e) {
          // Ignore errors for individual files
        }
      }
    } catch (e) {
      // Ignore errors for missing dirs
    }
  }
}

// Run cleanup every minute
timer = setInterval(cleanupOldFiles, ONE_MINUTE);

// Also run once on startup
cleanupOldFiles();

module.exports = cleanupOldFiles;
