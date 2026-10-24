/// <reference path="../worker-configuration.d.ts" />
/// <reference path="./lib/members/bindings.d.ts" />

import type { Member } from '@/lib/members/db';
import type { Session } from '@/lib/members/auth';

declare global {
  namespace App {
    interface Locals {
      /** False when the Worker has no database or secret yet (local dev, first deploy). */
      configured: boolean;
      session: Session | null;
      member: Member | null;
    }
  }
}
