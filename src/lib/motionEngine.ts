/**
 * Le moteur de mouvement — chargé uniquement quand l'animation est permise
 * (voir motion.ts). Trois responsabilités : le défilement doux à inertie
 * (Lenis, relié à GSAP ScrollTrigger), les révélations et parallaxes
 * génériques posées via des attributs `data-*` dans les gabarits, et deux
 * mises en scène propres à l'accueil (bandeau, galerie des saisons).
 *
 * Rien ici n'est indispensable au contenu : chaque élément animé existe déjà,
 * visible et fonctionnel, dans le HTML rendu par Astro. Ce module ajoute du
 * mouvement par-dessus, il ne le remplace jamais.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

let lenis: Lenis | undefined;

const WIDE_SCREEN = '(min-width: 64em)';
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/* ---------- Défilement doux ---------- */

function initSmoothScroll(): void {
  lenis = new Lenis({
    duration: 1.05,
    easing: (t: number) => 1 - Math.pow(1 - t, 3),
    smoothWheel: true,
    syncTouch: false, // le tactile garde son défilement natif, plus prévisible
  });

  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.on('scroll', ScrollTrigger.update);

  // Une boîte de dialogue ouverte (bande-annonce, visionneuse) coupe le
  // défilement de la page qu'elle recouvre plutôt que de le laisser filer
  // derrière elle.
  document.addEventListener('dialog:open', () => lenis?.stop());
  document.addEventListener('dialog:close', () => lenis?.start());

  // Ancre interne : un en-tête collant ne doit jamais recouvrir la cible.
  const header = document.querySelector<HTMLElement>('.site-header');
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    const id = link.getAttribute('href');
    if (!id || id === '#') return;
    link.addEventListener('click', (event) => {
      const target = document.querySelector<HTMLElement>(id);
      if (!target) return;
      event.preventDefault();
      if (target instanceof HTMLDetailsElement) target.open = true;
      history.pushState(null, '', id);
      lenis?.scrollTo(target, {
        offset: -(header?.offsetHeight ?? 0) - 24,
        duration: 1.1,
        onComplete: () => {
          const focus = target instanceof HTMLDetailsElement ? target.querySelector('summary') : target;
          if (focus instanceof HTMLElement) {
            if (!focus.hasAttribute('tabindex') && focus.tagName !== 'SUMMARY') focus.tabIndex = -1;
            focus.focus({ preventScroll: true });
          }
        },
      });
    });
  });
}

/* ---------- Révélations génériques ---------- */
/* `data-reveal` : fondu + léger décalage vertical.
   `data-reveal="clip"` : l'image se découvre du bas vers le haut.
   `data-reveal-group` sur un ancêtre : les `data-reveal` qu'il contient se
   révèlent en cascade au lieu de se déclencher chacune séparément. */

function prepare(el: HTMLElement): void {
  if (el.dataset.reveal === 'clip') {
    gsap.set(el, { clipPath: 'inset(0% 0% 100% 0%)' });
  } else {
    gsap.set(el, { autoAlpha: 0, y: 26 });
  }
}

function reveal(el: HTMLElement): void {
  if (el.dataset.reveal === 'clip') {
    gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'power3.out' });
  } else {
    gsap.to(el, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out' });
  }
}

function initReveals(): void {
  const handled = new Set<Element>();

  document.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
    const items = Array.from(group.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!items.length) return;
    items.forEach((item) => {
      handled.add(item);
      prepare(item);
    });
    ScrollTrigger.create({
      trigger: group,
      start: 'top 85%',
      once: true,
      onEnter: () => items.forEach((item, i) => gsap.delayedCall(i * 0.09, () => reveal(item))),
    });
  });

  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    if (handled.has(el)) return;
    prepare(el);
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => reveal(el),
    });
  });
}

/* ---------- Parallaxe générique ---------- */
/* `data-parallax="18"` : décalage vertical, en pourcentage de l'élément,
   étalé sur sa traversée du viewport. Réservé aux visuels, avec parcimonie. */

function initParallax(): void {
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const amount = Number(el.dataset.parallax) || 16;
    gsap.to(el, {
      yPercent: -amount,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
}

/* ---------- Bandeau d'accueil ---------- */

function initHero(): void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;

  const media = hero.querySelector<HTMLElement>('[data-hero-media]');
  const scrim = hero.querySelector<HTMLElement>('[data-hero-scrim]');
  const eyebrow = hero.querySelector<HTMLElement>('[data-hero-eyebrow]');
  const title = hero.querySelector<HTMLElement>('[data-hero-title]');
  const rule = hero.querySelector<HTMLElement>('[data-hero-rule]');
  const actions = hero.querySelector<HTMLElement>('[data-hero-actions]');
  const cue = hero.querySelector<HTMLElement>('[data-hero-cue]');

  // Entrée : le titre se révèle ligne à ligne. SplitText mesure les lignes
  // telles qu'effectivement composées à cette largeur d'écran — aucun retour
  // à la ligne n'est deviné à la main dans le gabarit.
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
  if (eyebrow) intro.from(eyebrow, { autoAlpha: 0, y: 14, duration: 0.7 }, 0.1);
  if (title) {
    const split = SplitText.create(title, { type: 'lines', mask: 'lines' });
    intro.from(split.lines, { yPercent: 115, autoAlpha: 0, duration: 1.1, stagger: 0.12 }, 0.25);
  }
  if (rule) {
    intro.fromTo(
      rule,
      { scaleX: 0 },
      { scaleX: 1, duration: 0.9, ease: 'power2.inOut' },
      title ? '-=0.55' : 0.3,
    );
  }
  if (actions) {
    intro.from(
      Array.from(actions.children),
      { autoAlpha: 0, y: 12, duration: 0.7, stagger: 0.08 },
      '-=0.45',
    );
  }
  if (cue) intro.from(cue, { autoAlpha: 0, duration: 0.6 }, '-=0.3');

  // L'épinglage avec zoom lent est réservé aux grands écrans : sur mobile, où
  // la barre d'adresse redimensionne la fenêtre en cours de défilement, le
  // gain visuel ne vaut pas le risque de saccade.
  if (media && window.matchMedia(WIDE_SCREEN).matches) {
    ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: () => `+=${Math.round(window.innerHeight * 0.7)}`,
      pin: true,
      scrub: 0.6,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const p = self.progress;
        gsap.set(media, { scale: 1 + p * 0.14 });
        // Plafonné : l'image reste devinable même au plus sombre du passage,
        // pour ne jamais offrir une transition noir sur noir avec la section
        // suivante, elle aussi sombre.
        if (scrim) gsap.set(scrim, { opacity: 0.55 + p * 0.3 });
        // L'invitation à défiler n'a plus lieu d'être dès que le geste a
        // commencé.
        if (cue) gsap.set(cue, { opacity: Math.max(0, 1 - p * 4) });
      },
    });
  }
}

/* ---------- Section « statement » ---------- */

function initStatement(): void {
  const quote = document.querySelector<HTMLElement>('[data-statement-quote]');
  if (!quote) return;

  const split = SplitText.create(quote, { type: 'lines', mask: 'lines' });
  gsap.set(split.lines, { yPercent: 112, autoAlpha: 0 });
  ScrollTrigger.create({
    trigger: quote,
    start: 'top 82%',
    once: true,
    onEnter: () =>
      gsap.to(split.lines, {
        yPercent: 0,
        autoAlpha: 1,
        duration: 1,
        stagger: 0.1,
        ease: 'power3.out',
      }),
  });
}

/* ---------- Galerie des saisons ---------- */
/* Une grille qui s'enroule nativement — aucun épinglage, aucun défilement à
   réapprendre. Seuls s'ajoutent une entrée en fondu et, sur grand écran avec
   un pointeur fin, une légère distorsion au survol des vignettes. */

function initFilmstrip(): void {
  const section = document.querySelector<HTMLElement>('[data-filmstrip]');
  const track = section?.querySelector<HTMLElement>('[data-filmstrip-track]');
  if (!section || !track) return;

  const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-filmstrip-card]'));

  gsap.set(cards, { autoAlpha: 0, y: 24 });
  ScrollTrigger.create({
    trigger: section,
    start: 'top 85%',
    once: true,
    onEnter: () =>
      gsap.to(cards, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.06, ease: 'power3.out' }),
  });

  if (window.matchMedia(WIDE_SCREEN).matches && window.matchMedia(FINE_POINTER).matches && 'WebGLRenderingContext' in window) {
    section.addEventListener('pointerover', () => {
      import('./hoverDistort')
        .then(({ attachHoverDistort }) => attachHoverDistort(cards))
        .catch(() => {
          // Les images ordinaires restent utilisables si WebGL est indisponible.
        });
    }, { once: true });
  }
}

/* ---------- Amorçage ---------- */

export function initEngine(): void {
  initSmoothScroll();
  initReveals();
  initParallax();
  initHero();
  initStatement();
  initFilmstrip();

  const refresh = () => {
    ScrollTrigger.refresh();
    const id = window.location.hash;
    if (!id) return;
    const target = document.getElementById(decodeURIComponent(id.slice(1)));
    if (target) lenis?.scrollTo(target, { immediate: true, offset: -(document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 0) - 24 });
  };
  if (document.readyState === 'complete') refresh();
  else window.addEventListener('load', refresh, { once: true });
}
