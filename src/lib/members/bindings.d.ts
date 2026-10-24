// The parts of the Cloudflare runtime the member area uses. `wrangler types --include-runtime=false`
// writes the Env interface (worker-configuration.d.ts); the full runtime types are not loaded,
// because they clash with the browser types the public pages' scripts need.

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

interface EmailAddress {
  email: string;
  name?: string;
}
interface EmailAttachment {
  content: string | ArrayBuffer | ArrayBufferView;
  filename: string;
  type: string;
  disposition: 'attachment' | 'inline';
  contentId?: string;
}
interface EmailMessageBuilder {
  to: string | EmailAddress | (string | EmailAddress)[];
  from: string | EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | EmailAddress | (string | EmailAddress)[];
  bcc?: string | EmailAddress | (string | EmailAddress)[];
  replyTo?: string | EmailAddress;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}
interface SendEmail {
  send(message: EmailMessageBuilder): Promise<{ messageId: string }>;
}

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface R2ObjectBody {
  key: string;
  size: number;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}

interface ImagesTransform {
  width?: number;
  height?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  rotate?: number;
}
interface ImagesResult {
  response(options?: { headers?: Record<string, string> }): Response;
  image(): ReadableStream;
  contentType(): string;
}
interface ImagesTransformer {
  transform(options: ImagesTransform): ImagesTransformer;
  output(options: {
    format: 'image/webp' | 'image/jpeg' | 'image/png' | 'image/avif';
    quality?: number;
    anim?: boolean;
  }): Promise<ImagesResult>;
}
interface ImagesBinding {
  input(stream: ReadableStream): ImagesTransformer;
  info(stream: ReadableStream): Promise<{
    format: string;
    fileSize: number;
    width?: number;
    height?: number;
  }>;
}

interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<unknown>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry(): void;
}
interface ExportedHandler<E = unknown> {
  fetch?(request: Request, env: E, ctx: ExecutionContext): Promise<Response>;
  scheduled?(
    controller: ScheduledController,
    env: E,
    ctx: ExecutionContext,
  ): Promise<void> | void;
  email?(
    message: ForwardableEmailMessage,
    env: E,
    ctx: ExecutionContext,
  ): Promise<void> | void;
}

/** Secrets are set in the dashboard, so the generated Env does not list them. */
interface Env {
  BETTER_AUTH_SECRET?: string;
  NOTION_MEMBERS_TOKEN?: string;
  /** Events: token of the read-only content integration (the same one as the build secret). */
  NOTION_TOKEN?: string;
  /** Club inbox: token of the Notion integration "Website inbox" (connected to "Club Inbox" only). */
  NOTION_INBOX_TOKEN?: string;
  /** Optional: an API token with Analytics Read on the zone, for reply detection through GraphQL. */
  CF_ANALYTICS_TOKEN?: string;
  CF_ZONE_ID?: string;
  /** Bindings are optional at type level, because local dev may run without them. */
  EMAIL?: SendEmail;
  LOGIN_RATE?: RateLimit;
  FILES?: R2Bucket;
  IMAGES?: ImagesBinding;
}

declare module 'cloudflare:workers' {
  export const env: Env;
  export function waitUntil(promise: Promise<unknown>): void;
}
