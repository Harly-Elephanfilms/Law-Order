const header = document.querySelector<HTMLElement>('.site-header');
const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const panel = document.querySelector<HTMLElement>('[data-menu-panel]');
const mobile = window.matchMedia('(max-width: 63.99em)');

if (header && toggle && panel) {
  const setExpanded = (expanded: boolean) => {
    toggle.setAttribute('aria-expanded', String(expanded));
    panel.hidden = mobile.matches && !expanded;
  };
  const sync = () => {
    toggle.hidden = !mobile.matches;
    setExpanded(false);
  };
  toggle.addEventListener('click', () => setExpanded(toggle.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a') && mobile.matches) setExpanded(false);
  });
  header.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobile.matches && toggle.getAttribute('aria-expanded') === 'true') {
      setExpanded(false);
      toggle.focus();
    }
  });
  mobile.addEventListener('change', sync);
  sync();
  const measure = () => document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
  new ResizeObserver(measure).observe(header);
  measure();
}

document.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
  const id = link?.getAttribute('href')?.slice(1);
  if (!id || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = document.getElementById(decodeURIComponent(id));
  if (target instanceof HTMLDetailsElement) target.open = true;
  else if (target && !target.hasAttribute('tabindex')) target.tabIndex = -1;
});
