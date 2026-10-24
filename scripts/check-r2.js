import { uploadR2Image } from "../services/r2.js";

// A valid transparent 1×1 PNG. The script keeps these files so the returned
// URLs can be inspected after the test.
const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0dAAAAABJRU5ErkJggg==",
  "base64"
);

const folders = ["products", "banners"];
let failed = false;

console.log("Checking Cloudflare R2 upload and retrieval…\n");

for (const folder of folders) {
  try {
    const image = await uploadR2Image({
      folder,
      fileName: `r2-connection-check-${Date.now()}.png`,
      contentType: "image/png",
      body: TEST_PNG,
    });

    console.log(`✓ ${folder}: stored successfully`);
    console.log(`  Key: ${image.key}`);
    console.log(`  URL: ${image.url}`);

    const publicResponse = await fetch(image.url, { method: "GET" });
    if (publicResponse.ok) {
      console.log(`  ✓ Public retrieval: HTTP ${publicResponse.status}\n`);
    } else {
      failed = true;
      console.error(`  ✗ Public retrieval: HTTP ${publicResponse.status}. The object was uploaded, but R2_PUBLIC_URL/bucket public access needs attention.\n`);
    }
  } catch (error) {
    failed = true;
    console.error(`✗ ${folder}: ${error instanceof Error ? error.message : "Unknown R2 error"}\n`);
  }
}

if (failed) {
  console.error("Cloudflare R2 check failed.");
  process.exitCode = 1;
} else {
  console.log("Cloudflare R2 is configured correctly: uploads and public image retrieval both work.");
}
