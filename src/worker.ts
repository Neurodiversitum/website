// The Worker's entry point (`main` in wrangler.jsonc). Requests go to Astro; the scheduled
// handler runs the background jobs; the email handler is the club inbox (contact@).
// Keep this file small: logic lives in src/lib.
import { handle } from '@astrojs/cloudflare/handler';
import { handleInboundMail } from '@/lib/inbox/handler';
import { runScheduledJobs } from '@/lib/jobs';

export default {
  fetch: handle,
  async scheduled(controller, env) {
    await runScheduledJobs(env, new Date(controller.scheduledTime));
  },
  async email(message, env) {
    await handleInboundMail(message, env);
  },
} satisfies ExportedHandler<Env>;
