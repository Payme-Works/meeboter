import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

let s3ClientInstance: S3Client | null = null;

const credentials =
	env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
		? {
				accessKeyId: env.AWS_ACCESS_KEY_ID,
				secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
			}
		: undefined;

const getS3Client = (): S3Client => {
	s3ClientInstance ??= new S3Client({
		region: env.AWS_REGION,
		credentials: credentials,
	});

	return s3ClientInstance;
};

const s3Client = getS3Client();

export const generateSignedUrl = async (key: string, expiresIn = 3600) => {
	const command = new GetObjectCommand({
		Bucket: env.AWS_BUCKET_NAME,
		Key: key,
	});

	return await getSignedUrl(s3Client, command, { expiresIn });
};
