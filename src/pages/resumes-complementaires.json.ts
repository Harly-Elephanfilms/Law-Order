import type { APIRoute } from 'astro';
import supplements from '../data/episode-supplements.json';

export const GET: APIRoute = () => new Response(JSON.stringify(supplements, null, 2), {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
