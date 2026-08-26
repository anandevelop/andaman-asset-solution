const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

async function run() {
  const client = new S3Client({
    region: "ap-southeast-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    endpoint: "https://test.supabase.co",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED"
  });

  const cmd = new PutObjectCommand({ 
    Bucket: "test", 
    Key: "test.jpg", 
    ContentType: "image/jpeg",
    CacheControl: "public, max-age=31536000, immutable"
  });
  
  const url = await getSignedUrl(client, cmd, { expiresIn: 3600 });
  
  console.log("URL:");
  console.log(url);
}
run();
