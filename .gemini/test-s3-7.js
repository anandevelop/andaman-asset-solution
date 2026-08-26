const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

async function run() {
  const client = new S3Client({
    region: "ap-southeast-1",
    credentials: { 
      accessKeyId: "3145d2620b256c77f28433ac6f7adfc3", 
      secretAccessKey: "b6836f8439e4c747581cc6dff1700a4b4cbf9dc90ad355bc52ff34230a190921" 
    },
    endpoint: "https://nwgjexifvlryisfxhhxa.storage.supabase.co/storage/v1/s3",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED"
  });

  const cmd = new PutObjectCommand({ 
    Bucket: "andamanassets", 
    Key: "test4.txt"
  });
  
  const url = await getSignedUrl(client, cmd, { expiresIn: 3600 });
  
  console.log(url);
}
run();
