import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { AwsClient } from 'aws4fetch';

/**
 * @param {object} env
 * @param {string} env.R2_ACCESS_KEY_ID
 * @param {string} env.R2_SECRET_ACCESS_KEY
 * @param {string} env.R2_ENDPOINT
 * @returns {S3Client}
 */
export const createS3Client = (env) =>
	new S3Client({
		region: 'auto',
		endpoint: env.R2_ENDPOINT,
		credentials: {
			accessKeyId: env.R2_ACCESS_KEY_ID,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		},
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
	});

/**
 * Create an aws4fetch client for raw S3 requests (avoids SDK's DOMParser dependency).
 * @param {object} env
 * @returns {AwsClient}
 */
export const createAwsClient = (env) =>
	new AwsClient({
		accessKeyId: env.R2_ACCESS_KEY_ID,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		region: 'auto',
		service: 's3',
	});

/**
 * Server-side copy via raw S3 PUT + x-amz-copy-source header.
 * Uses aws4fetch to avoid the AWS SDK's DOMParser dependency in Workers.
 * @param {AwsClient} aws
 * @param {string} endpoint
 * @param {string} bucket
 * @param {string} sourceKey
 * @param {string} destKey
 */
export const copyObject = async (aws, endpoint, bucket, sourceKey, destKey) => {
	const base = endpoint.replace(/\/+$/, '');
	const destPath = destKey.split('/').map(encodeURIComponent).join('/');
	const copySource = `${bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`;
	const url = `${base}/${bucket}/${destPath}`;

	const res = await aws.fetch(url, {
		method: 'PUT',
		headers: {
			'x-amz-copy-source': copySource,
		},
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`CopyObject failed (${res.status}): ${body}`);
	}
};

/**
 * Copy with fallback: tries S3 CopyObject first, falls back to Workers get+put
 * for problematic keys (non-ASCII filenames, etc.)
 * @param {object} env
 * @param {string} sourceKey
 * @param {string} destKey
 */
export const safeCopy = async (env, sourceKey, destKey) => {
	try {
		await copyObject(env._aws, env.R2_ENDPOINT, env._bucketName, sourceKey, destKey);
	} catch (e) {
		console.warn(`CopyObject failed (${sourceKey}): ${e.message}. Falling back to get+put.`);
		const obj = await env.BUCKET.get(sourceKey);
		if (!obj) throw new Error(`Source not found: ${sourceKey}`);
		await env.BUCKET.put(destKey, obj.body, {
			httpMetadata: obj.httpMetadata,
			customMetadata: obj.customMetadata,
		});
	}
};

/**
 * Run multiple safeCopy operations in parallel with a concurrency limit.
 * @param {object} env
 * @param {{ from: string, to: string }[]} pairs
 * @param {number} [concurrency=20]
 * @returns {Promise<{ succeeded: string[], failed: { key: string, error: string }[] }>}
 */
export const batchCopy = async (env, pairs, concurrency = 20) => {
	const succeeded = [];
	const failed = [];
	let idx = 0;

	const worker = async () => {
		while (idx < pairs.length) {
			const i = idx++;
			const { from, to } = pairs[i];
			try {
				await safeCopy(env, from, to);
				succeeded.push(from);
			} catch (e) {
				failed.push({ key: from, error: e.message });
			}
		}
	};

	const workers = Array.from({ length: Math.min(concurrency, pairs.length) }, () => worker());
	await Promise.all(workers);
	return { succeeded, failed };
};

/**
 * Generate a presigned GET URL for direct browser download
 * @param {S3Client} s3
 * @param {string} bucket
 * @param {string} key
 * @param {number} [expiresIn=3600]
 * @returns {Promise<string>}
 */
export const presignGet = (s3, bucket, key, expiresIn = 604800) =>
	getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
