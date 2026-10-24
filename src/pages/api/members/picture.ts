// Upload or remove the profile picture (form post from the profile page).
import type { APIRoute } from 'astro';
import { handlePicture } from '@/lib/members/handlers';

export const prerender = false;

export const POST: APIRoute = (context) => handlePicture(context);
