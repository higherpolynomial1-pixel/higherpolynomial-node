require('dotenv').config();
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

const bucketName = process.env.S3_BUCKET_NAME || 'collance-public-bucket-1';

const corsParams = {
    Bucket: bucketName,
    CORSConfiguration: {
        CORSRules: [
            {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
                AllowedOrigins: [
                    'http://localhost:3000',
                    'http://localhost:5173',
                    'https://higherpolynomial-react.vercel.app',
                    'https://higherpolynomial-node.vercel.app',
                    'https://www.higherpolynomial.com',
                    'https://higherpolynomial.com'
                ],
                ExposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-id-2'],
                MaxAgeSeconds: 3000
            }
        ]
    }
};

s3.putBucketCors(corsParams, (err, data) => {
    if (err) {
        console.error("Error setting CORS:", err);
        process.exit(1);
    } else {
        console.log("Successfully updated S3 CORS for production domains.");
        process.exit(0);
    }
});
