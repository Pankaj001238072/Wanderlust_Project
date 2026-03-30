// helpers/cloudHelper.js

const { cloudinary } = require("../cloudConfig");

async function uploadImage(filePath) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: "wanderlust_DEV"
  });

  return {
    url: result.secure_url,
    filename: result.public_id
  };
}

async function deleteImage(filename) {
  if (!filename) return;
  await cloudinary.uploader.destroy(filename);
}

module.exports = {
  uploadImage,
  deleteImage
};