/**
 * The "Message size" row in the Chat+ menu: a minus button, the current
 * percent, a plus button. The buttons write the anchored chat's own size and
 * nothing else - storage notifies, the feature re-scales that chat and syncs this row back.
 */

export const LABEL_TEXT = 'Message size';
export const SMALLER_LABEL = 'Chat+ smaller messages';
export const LARGER_LABEL = 'Chat+ larger messages';

const LABEL_CLASS = 'chatplus-menu__label';
export const VALUE_CLASS = 'chatplus-menu__value';
export const STEP_CLASS = 'chatplus-menu__step';

/**
 * @param {Object} config
 * @param {{min: number, max: number, step: number}} config.range
 *   the setting's own spec, so the row cannot drift from what storage clamps to
 * @param {() => number} config.getScale  the percent the row is showing (the anchored chat's)
 * @param {(percent: number) => void} config.setScale
 * @param {boolean} [config.compact]  drop the label, for the header strip
 */
export function createScaleControl({ range, getScale, setScale, compact = false }) {
  let value = null;

  function step(delta) {
    const current = getScale();
    const next = Math.min(range.max, Math.max(range.min, current + delta));
    if (next !== current) setScale(next);
  }

  function makeStep(doc, label, glyph, delta) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = STEP_CLASS;
    button.setAttribute('aria-label', label);
    button.textContent = glyph;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      step(delta);
    });
    return button;
  }

  /** Show `percent` in the row. */
  function sync(percent) {
    if (value) value.textContent = `${percent}%`;
  }

  return {
    /** @param {Element} row the menu row to fill. */
    render(row) {
      const doc = row.ownerDocument;
      value = doc.createElement('span');
      value.className = VALUE_CLASS;
      if (!compact) {
        const label = doc.createElement('span');
        label.className = LABEL_CLASS;
        label.textContent = LABEL_TEXT;
        row.append(label);
      }
      row.append(
        makeStep(doc, SMALLER_LABEL, '−', -range.step),
        value,
        makeStep(doc, LARGER_LABEL, '+', range.step),
      );
      sync(getScale());
    },
    sync,
  };
}
