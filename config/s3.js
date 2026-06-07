const AWS = require('aws-sdk');
require('dotenv').config();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'ap-south-1',
});

const uploadToS3 = async (fileBuffer, fileName, mimeType) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `products/${Date.now()}-${fileName}`,
    Body: fileBuffer,
    ContentType: mimeType,
  };
  const result = await s3.upload(params).promise();
  return result.Location;
};

const deleteFromS3 = async (fileUrl) => {
  try {
    const key = fileUrl.split('.amazonaws.com/')[1];
    if (!key) return;
    await s3.deleteObject({ Bucket: process.env.AWS_S3_BUCKET, Key: key }).promise();
  } catch (err) {
    console.error('S3 delete error:', err.message);
  }
};

module.exports = { s3, uploadToS3, deleteFromS3 };
