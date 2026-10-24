// Profile pictures in R2 under `pictures/<user_id>`. The browser shrinks the picture to 512 px
// before upload; the Worker checks the bytes, re-encodes to WebP when the Images binding exists,
// and stores the result. Pictures are served through /api/members/picture/<id> with a session check.
import { now, type Member } from './db';
import { detectImageType, PICTURE_MAX_BYTES } from './files';

export type PictureProblem = 'missing' | 'tooBig' | 'notImage' | 'noStorage';

export async function savePicture(
  env: Env,
  member: Member,
  file: File | null,
): Promise<PictureProblem | null> {
  if (!env.FILES) return 'noStorage';
  if (!file || file.size === 0) return 'missing';
  if (file.size > PICTURE_MAX_BYTES) return 'tooBig';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return 'notImage';
  let body: ArrayBuffer = bytes.buffer as ArrayBuffer;
  let contentType: string = type;
  if (env.IMAGES) {
    try {
      const result = await env.IMAGES.input(new Blob([bytes]).stream())
        .transform({ width: 512, height: 512, fit: 'cover' })
        .output({ format: 'image/webp', quality: 85 });
      body = await result.response().arrayBuffer();
      contentType = 'image/webp';
    } catch (error) {
      // The original (already shrunk by the browser) is still a valid picture.
      console.warn('picture transform', error);
    }
  }
  const key = `pictures/${member.user_id}`;
  await env.FILES.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { uploadedAt: now() },
  });
  await env.DB.prepare(
    'UPDATE "member" SET "picture_key" = ?, "updated_at" = ? WHERE "user_id" = ?',
  )
    .bind(key, now(), member.user_id)
    .run();
  return null;
}

export async function deletePicture(env: Env, member: Member): Promise<void> {
  if (member.picture_key && env.FILES)
    await env.FILES.delete(member.picture_key);
  await env.DB.prepare(
    'UPDATE "member" SET "picture_key" = NULL, "updated_at" = ? WHERE "user_id" = ?',
  )
    .bind(now(), member.user_id)
    .run();
}

/**
 * Who may see whose picture: the member themselves, the board, and every member when the
 * owner is listed in the directory.
 */
export async function pictureResponse(
  env: Env,
  viewer: Member,
  ownerId: string,
): Promise<Response> {
  if (!env.FILES) return new Response('Not found', { status: 404 });
  const owner = await env.DB.prepare(
    'SELECT "picture_key", "directory_opt_in" FROM "member" WHERE "user_id" = ?',
  )
    .bind(ownerId)
    .first<{ picture_key: string | null; directory_opt_in: number }>();
  if (!owner?.picture_key) return new Response('Not found', { status: 404 });
  const allowed =
    viewer.user_id === ownerId ||
    viewer.role !== 'member' ||
    owner.directory_opt_in === 1;
  if (!allowed) return new Response('Not found', { status: 404 });
  const object = await env.FILES.get(owner.picture_key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/webp',
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
