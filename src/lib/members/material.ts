// Member-only material: files in R2 under `material/<id>/<file name>`, rows in D1.
// The board uploads and deletes; every signed-in member downloads.
import { now, type Member } from './db';
import { MATERIAL_MAX_BYTES, materialContentType, safeFileName } from './files';

export interface MaterialRow {
  id: string;
  title: string;
  description: string | null;
  r2_key: string;
  file_name: string;
  content_type: string;
  size: number;
  uploaded_by: string;
  created_at: string;
}

export type MaterialProblem = 'title' | 'file' | 'type' | 'size' | 'noStorage';

export async function listMaterial(env: Env): Promise<MaterialRow[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM "material" ORDER BY "created_at" DESC',
  ).all<MaterialRow>();
  return results;
}

export async function getMaterial(
  env: Env,
  id: string,
): Promise<MaterialRow | null> {
  return env.DB.prepare('SELECT * FROM "material" WHERE "id" = ?')
    .bind(id)
    .first<MaterialRow>();
}

export async function uploadMaterial(
  env: Env,
  uploader: Member,
  input: { title: string; description: string; file: File | null },
): Promise<MaterialProblem | null> {
  if (!env.FILES) return 'noStorage';
  const title = input.title.trim().replace(/\s+/g, ' ');
  if (title.length < 2 || title.length > 120) return 'title';
  const description = input.description.trim().slice(0, 500) || null;
  const file = input.file;
  if (!file || file.size === 0) return 'file';
  const fileName = safeFileName(file.name);
  const contentType = materialContentType(fileName);
  if (!contentType) return 'type';
  if (file.size > MATERIAL_MAX_BYTES) return 'size';
  const id = crypto.randomUUID();
  const key = `material/${id}/${fileName}`;
  await env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { title, uploadedBy: uploader.user_id },
  });
  await env.DB.prepare(
    `INSERT INTO "material" ("id", "title", "description", "r2_key", "file_name", "content_type", "size", "uploaded_by", "created_at")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      title,
      description,
      key,
      fileName,
      contentType,
      file.size,
      uploader.name,
      now(),
    )
    .run();
  return null;
}

export async function deleteMaterial(env: Env, id: string): Promise<void> {
  const row = await getMaterial(env, id);
  if (!row) return;
  if (env.FILES) await env.FILES.delete(row.r2_key);
  await env.DB.prepare('DELETE FROM "material" WHERE "id" = ?').bind(id).run();
}

/** Streams the file as a download. */
export async function materialResponse(
  env: Env,
  id: string,
): Promise<Response> {
  const row = await getMaterial(env, id);
  if (!row || !env.FILES) return new Response('Not found', { status: 404 });
  const object = await env.FILES.get(row.r2_key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': row.content_type,
      'Content-Length': String(row.size),
      'Content-Disposition': `attachment; filename="${row.file_name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
