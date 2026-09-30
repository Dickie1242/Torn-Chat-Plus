/** A chat's message size: its own, or the default every unadjusted chat shares. */
export function scaleOf(storage, id) {
  const own = storage.getWidget(id).scale;
  return own === null ? storage.getSetting('messageScale') : own;
}
