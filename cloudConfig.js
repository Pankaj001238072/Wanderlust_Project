const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME, // Cloudinary cloud name from environment variables
  api_key: process.env.CLOUD_API_KEY, // Cloudinary API key from environment variables
  api_secret: process.env.CLOUD_API_SECRET // Cloudinary API secret from environment variables
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary, // Using the configured Cloudinary instance
    params: {
        folder: 'wanderlust_DEV', // Folder in Cloudinary where images will be stored
        allowedFormats: ['png','jpg','jpeg'] // Allowed image formats for upload
    },
});

module.exports = {
    cloudinary,
    storage
};