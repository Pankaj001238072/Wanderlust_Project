// helpers/fileHelper.js

const fs = require("fs").promises;

async function deleteLocalFile(file) {
  if (!file) return;
  let filePath = null;
  if (typeof file === "string") {
    filePath = file;
  } else if (file.path) {
    filePath = file.path;
  }
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (err) {
    // Ignore file not found errors
    if (err.code !== "ENOENT") {
      console.log("File delete error:", err.message);
    }
  }
}

module.exports = { deleteLocalFile };
