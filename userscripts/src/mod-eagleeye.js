/* --------------------------------------------------------------------------
 * EagleEye — what the game shows you, and how much of it.
 *
 * A group rather than a tool. Everything under it changes how the game's own
 * pages look and nothing under it changes what the game does, so they belong
 * together and they belong behind one master switch: switch EagleEye off and
 * every layout change goes with it, without having to remember which ones were
 * on.
 *
 * A module joins by declaring `group: 'eagleeye'`. ElementFriend then leaves it
 * out of its own list and shows it here instead, so the switchboard does not
 * grow a row per tweak.
 * ------------------------------------------------------------------------ */

YMCA.register({
    id: 'eagleeye',
    title: 'EagleEye',
    tagline: 'How much the game shows',
    description: 'Changes to the way the game’s own pages look. Switch this off and every '
        + 'one of them goes with it.',

    mainTile: false,
    optional: true,
    defaultOn: true,

    settings(el, ctx) {
        const inside = YMCA.inGroup('eagleeye');
        el.innerHTML = `
      <p class="ymca-lead">Nothing in here changes what the game does &mdash; only how much of
        it you are looking at.</p>
      <div class="ymca-tiles">
        ${inside.map((m) => {
        const on = YMCA.isOn(m);
        return `<div class="ymca-tile el ${on ? '' : 'off'}" data-el="${esc(m.id)}"
            role="button" tabindex="0">
            ${iconFor(m.id)}<b>${esc(m.title)}</b><span>${esc(m.tagline || '')}</span>
            <div class="ymca-foot">
              <span class="ymca-dim" style="font-size:12px">${m.settings
            ? 'Open for settings' : 'Nothing to set'}</span>
              ${efSwitch(m.id, on)}
            </div>
          </div>`;
    }).join('')}
        <div class="ymca-tile soon">${iconFor('default')}<b>More to come</b>
          <span>This is where the next ones land.</span></div>
      </div>`;

        /* A member's settings replace the whole panel, and Back comes here
         * rather than all the way out to the switchboard. */
        const panel = el.closest('#ymca-panel') || el;
        const self = YMCA.modules.find((m) => m.id === 'eagleeye');
        const open = (id) => {
            const mod = YMCA.modules.find((m) => m.id === id);
            if (mod) efOpen(panel, ctx, mod, () => efOpen(panel, YMCA.contextFor('eagleeye'), self));
        };
        el.querySelectorAll('[data-el]').forEach((tile) => {
            tile.addEventListener('click', (e) => {
                if (e.target.closest('.ymca-switch')) return;
                open(tile.dataset.el);
            });
        });
        efWireSwitches(el, ctx, (id, on) => {
            el.querySelector(`[data-el="${id}"]`)?.classList.toggle('off', !on);
        });
    },
});
