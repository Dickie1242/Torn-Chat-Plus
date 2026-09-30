import { safe } from './log.js';

/**
 * @typedef {Object} Feature
 * @property {string} id
 * @property {(ctx: any) => void} [init]
 * @property {(widget: any, ctx: any) => void} [onWidgetAdded]
 * @property {(widget: any, ctx: any) => void} [onWidgetRemoved]
 */

/**
 * Holds the registered features and fans widget lifecycle events out to them.
 * A feature that throws is reported once and never blocks the others.
 */
export function createRegistry(ctx) {
  /** @type {Feature[]} */
  const features = [];

  function fanOut(hookName, args) {
    for (const feature of features) {
      const hook = feature[hookName];
      if (typeof hook !== 'function') continue;
      safe(`${feature.id}.${hookName}`, hook)(...args);
    }
  }

  const api = {
    /** @param {Feature} feature */
    register(feature) {
      if (feature && typeof feature.id === 'string' && feature.id) features.push(feature);
      return api;
    },
    init() {
      fanOut('init', [ctx]);
    },
    widgetAdded(widget) {
      fanOut('onWidgetAdded', [widget, ctx]);
    },
    widgetRemoved(widget) {
      fanOut('onWidgetRemoved', [widget, ctx]);
    },
    list() {
      return features.map((feature) => feature.id);
    },
  };

  return api;
}
