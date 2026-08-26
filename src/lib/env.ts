/**
 * Construction destinée au sous-domaine de test plutôt qu'au site public.
 * Activée par `npm run build:preview`.
 */
export const IS_PREVIEW = import.meta.env.PUBLIC_PREVIEW === '1';
