import * as selectors from './core/selectors.js';
import { info, safe } from './core/log.js';
import { injectStyles } from './core/styles.js';
import { createStorage } from './core/storage.js';
import { createMenu } from './core/menu.js';
import { createRegistry } from './core/registry.js';
import { createObserver } from './core/observer.js';
import { createMovableFeature } from './features/movable/index.js';
import { createTextScaleFeature } from './features/textScale/index.js';
import { createResizeFeature } from './features/resize/index.js';
import { createHeaderControlsFeature } from './features/headerControls/index.js';

function boot() {
  injectStyles(document);

  const registry = createRegistry({
    storage: createStorage(),
    selectors,
    menu: createMenu(),
  });
  registry.register(createMovableFeature());
  registry.register(createTextScaleFeature());
  registry.register(createResizeFeature());
  registry.register(createHeaderControlsFeature());
  registry.init();

  const observer = createObserver({
    selectors,
    onWidgetAdded: (widget) => registry.widgetAdded(widget),
    onWidgetRemoved: (widget) => registry.widgetRemoved(widget),
  });
  observer.start();

  info('ready:', registry.list().join(', '));
}

// Nothing above us catches a throw here, and a half-booted userscript must
// never take Torn's own page down with it.
const safeBoot = safe('main.boot', boot);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeBoot, { once: true });
} else {
  safeBoot();
}
