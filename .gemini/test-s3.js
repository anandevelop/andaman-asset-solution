const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

async function run() {
  const client1 = new S3Client({
    region: "ap-southeast-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    endpoint: "https://test.supabase.co",
    forcePathStyle: true,
  });

  const client2 = new S3Client({
    region: "ap-southeast-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    endpoint: "https://test.supabase.co",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED"
  });

  const cmd = new PutObjectCommand({ Bucket: "test", Key: "test.jpg", ContentType: "image/jpeg" });
  
  const url1 = await getSignedUrl(client1, cmd, { expiresIn: 3600 });
  const url2 = await getSignedUrl(client2, cmd, { expiresIn: 3600 });
  
  console.log("Without fix:");
  console.log(url1);
  console.log("\nWith fix:");
  console.log(url2);
}
run();
