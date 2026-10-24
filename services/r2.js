import crypto from "node:crypto";
import { env } from "../config/env.js";
import { fail } from "../utils/api.js";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value).digest(encoding);
const encodePath = (value) => value.split("/").map(encodeURIComponent).join("/");

function signingKey(secret, date) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function configured() {
  return Boolean(env.r2AccessKeyId && env.r2SecretAccessKey && env.r2BucketName && (env.r2Endpoint || env.r2PublicUrl));
}

function missingConfiguration() {
  return [
    !env.r2AccessKeyId && "R2_ACCESS_KEY_ID",
    !env.r2SecretAccessKey && "R2_SECRET_ACCESS_KEY",
    !env.r2BucketName && "R2_BUCKET_NAME",
    !(env.r2Endpoint || env.r2PublicUrl) && "R2_ENDPOINT or R2_PUBLIC_URL",
  ].filter(Boolean).join(", ");
}

export async function uploadR2Image({ folder, fileName, contentType, body }) {
  if (!configured()) throw fail(503, `Cloudflare R2 is not configured: ${missingConfiguration()}`);
  if (!["products", "banners", "categories", "sub-categories", "brands", "favicon"].includes(folder)) throw fail(400, "Invalid image folder");
  if (!contentType?.startsWith("image/")) throw fail(400, "Only image uploads are supported");
  if (!Buffer.isBuffer(body) || body.length === 0) throw fail(400, "An image file is required");
  if (body.length > 10 * 1024 * 1024) throw fail(400, "Image must be 10 MB or smaller");

  const extension = (fileName?.match(/\.[a-z0-9]{1,8}$/i)?.[0] || contentType.split("/")[1] || "jpg").toLowerCase();
  const baseName = (fileName || "image").replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${baseName}${extension.startsWith(".") ? extension : `.${extension}`}`;
  const endpoint = new URL(env.r2Endpoint || env.r2PublicUrl);
  const host = endpoint.host;
  const path = `/${env.r2BucketName}/${encodePath(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const canonicalHeaders = `content-type:${contentType}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;x-amz-content-sha256;x-amz-date";
  const credentialScope = `${date}/auto/s3/aws4_request`;
  const canonicalRequest = `PUT\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;
  const signature = hmac(signingKey(env.r2SecretAccessKey, date), stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${env.r2AccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(new URL(path, endpoint.origin), {
    method: "PUT",
    headers: { "content-type": contentType, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, authorization },
    body,
  });
  if (!response.ok) throw fail(502, "Cloudflare R2 could not store the image");

  const publicBase = (env.r2PublicUrl || `${endpoint.origin}/${env.r2BucketName}`).replace(/\/$/, "");
  return { key, url: `${publicBase}/${encodePath(key)}` };
}

export async function deleteR2Image(key) {
  if (!configured() || !key) return;
  const endpoint = new URL(env.r2Endpoint || env.r2PublicUrl);
  const path = `/${env.r2BucketName}/${encodePath(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256("");
  const canonicalHeaders = `x-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "x-amz-content-sha256;x-amz-date";
  const credentialScope = `${date}/auto/s3/aws4_request`;
  const canonicalRequest = `DELETE\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;
  const signature = hmac(signingKey(env.r2SecretAccessKey, date), stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${env.r2AccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  await fetch(new URL(path, endpoint.origin), {
    method: "DELETE",
    headers: { "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, authorization },
  }).catch(() => {});
}
