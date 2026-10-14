/**
 * Point d'entrée du mouvement, chargé sur chaque page sans dépendance lourde.
 *
 * Décide si l'animation est permise — préférence système, ou bascule
 * explicite pour qui ne peut pas changer les réglages de l'appareil qu'iel
 * utilise (poste partagé, par exemple) — et ne charge le moteur GSAP/Lenis
 * que dans ce cas : qui ne verra jamais une animation n'en télécharge pas
 * non plus le code.
 */

const STORAGE_KEY = 'law-order:motion';

type Preference = 'reduced' | 'full';

function storedPreference(): Preference | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'reduced' || value === 'full' ? value : null;
  } catch {
    // Stockage indisponible (navigation privée stricte) : on retombe sur la
    // préférence système à chaque visite, sans erreur.
    return null;
  }
}

function systemPrefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Le mouvement est permis sauf choix contraire — explicite ou système. */
export function motionAllowed(): boolean {
  const stored = storedPreference();
  if (stored) return stored === 'full';
  return !systemPrefersReducedMotion();
}

function wireToggle(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-motion-toggle]');
  if (!button) return;

  const label = button.querySelector<HTMLElement>('[data-motion-toggle-label]');
  const sync = () => {
    const allowed = motionAllowed();
    button.setAttribute('aria-pressed', String(allowed));
    if (label) label.textContent = allowed ? 'Animations activées' : 'Animations réduites';
  };
  sync();

  button.addEventListener('click', () => {
    const next: Preference = motionAllowed() ? 'reduced' : 'full';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Le choix ne persistera pas d'une visite à l'autre : pas d'erreur pour
      // autant, seulement un effet limité à la page courante après rechargement.
    }

    const announce = document.querySelector<HTMLElement>('[data-motion-announce]');
    if (announce) {
      announce.textContent =
        next === 'reduced'
          ? 'Animations réduites. La page se recharge.'
          : 'Animations activées. La page se recharge.';
    }

    // Un rechargement plutôt qu'un démontage à chaud : GSAP ScrollTrigger et
    // ses sections épinglées se réinitialisent proprement plutôt que de
    // risquer un état à mi-course. Le délai laisse le message ci-dessus
    // atteindre les technologies d'assistance avant le déchargement.
    window.setTimeout(() => window.location.reload(), 350);
  });
}

async function start(): Promise<void> {
  const allowed = motionAllowed();
  document.documentElement.dataset.motion = allowed ? 'on' : 'off';
  wireToggle();

  if (!allowed) return;

  // Sur téléphone et tablette, garder le défilement et les contenus natifs
  // évite de télécharger GSAP et Three.js pour des effets discrets.
  if (!window.matchMedia('(min-width: 64em) and (hover: hover) and (pointer: fine)').matches) return;

  const { initEngine } = await import('./motionEngine');
  initEngine();
}

void start();
