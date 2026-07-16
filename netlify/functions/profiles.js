import { getStore } from '@netlify/blobs';

// Two Blob stores: one for the profile JSON, one for the raw photo bytes.
const PROFILES = 'class-profiles';
const PHOTOS = 'class-photos';

// Only real image types are allowed — this prevents a user from smuggling in
// e.g. text/html and getting it served back as an executable page (stored XSS).
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Modern Netlify Function (v2). Routed at /api/profiles.
export const config = { path: '/api/profiles' };

export default async (req) => {
  const profiles = getStore(PROFILES);
  const photos = getStore(PHOTOS);
  const url = new URL(req.url);

  // --- Serve a stored photo: GET /api/profiles?photo=<id> ---
  if (req.method === 'GET' && url.searchParams.has('photo')) {
    const id = url.searchParams.get('photo');
    const blob = await photos.getWithMetadata(id, { type: 'arrayBuffer' });
    if (!blob) return new Response('Not found', { status: 404 });
    // Force a safe Content-Type and stop the browser from sniffing something else.
    const contentType = ALLOWED_TYPES.has(blob.metadata?.contentType)
      ? blob.metadata.contentType
      : 'image/jpeg';
    return new Response(blob.data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline; filename="photo"',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'",
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // --- List profiles, newest first: GET /api/profiles ---
  if (req.method === 'GET') {
    const { blobs } = await profiles.list();
    const items = (
      await Promise.all(blobs.map((b) => profiles.get(b.key, { type: 'json' })))
    ).filter(Boolean);
    items.sort((a, b) => b.createdAt - a.createdAt);
    return Response.json(items);
  }

  // --- Save a new profile: POST /api/profiles ---
  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
    }

    const firstName = String(body.firstName || '').trim().slice(0, 60);
    const major = String(body.major || '').trim().slice(0, 100);
    const year = String(body.year || '').trim().slice(0, 40);
    const region = String(body.region || '').trim().slice(0, 100);

    if (!firstName || !major || !year || !region) {
      return Response.json(
        { error: 'First name, major, year, and hometown/region are required.' },
        { status: 400 }
      );
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let hasPhoto = false;

    // Photo arrives as a data URL (e.g. "data:image/jpeg;base64,....").
    if (typeof body.photo === 'string' && body.photo.startsWith('data:')) {
      const match = body.photo.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const [, contentType, base64] = match;
        const bytes = Buffer.from(base64, 'base64');
        // Only store genuine image types, and cap size at ~2MB.
        if (ALLOWED_TYPES.has(contentType) && bytes.length <= 2 * 1024 * 1024) {
          await photos.set(id, bytes, { metadata: { contentType } });
          hasPhoto = true;
        }
      }
    }

    const profile = {
      id,
      firstName,
      major,
      year,
      region,
      hasPhoto,
      photoUrl: hasPhoto ? `/api/profiles?photo=${id}` : null,
      createdAt: Date.now(),
    };

    await profiles.setJSON(id, profile);
    return Response.json(profile, { status: 201 });
  }

  return new Response('Method not allowed', { status: 405 });
};
