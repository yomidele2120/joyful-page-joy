// Checks that your Cloudinary keys work.  Run from the project folder (Node 20.6+):
//   npm install
//   node --env-file=.env scripts/test-cloudinary.mjs
// .env needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (no quotes, no spaces around "=").
import { v2 as cloudinary } from 'cloudinary';

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('FAILED: Missing Cloudinary environment variables');
  process.exit(1);
}
cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
cloudinary.api.ping()
  .then(r => console.log('SUCCESS: Cloudinary connected!', r))
  .catch(e => { console.error('FAILED:', e.message); process.exit(1); });
