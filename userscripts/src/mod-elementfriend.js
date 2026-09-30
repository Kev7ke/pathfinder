/* --------------------------------------------------------------------------
 * ElementFriend — the switchboard.
 *
 * Not a tool. A page of element tiles, one per part of YMCA that the player
 * may or may not want, each with a switch on its face and its own settings
 * behind it.
 *
 * WHY IT EXISTS. YMCA grew a tool at a time and every one of them landed on
 * the front page whether or not anybody asked for it. MissionMagician draws
 * itself into the mission window, TrackOps hooks the game's own functions,
 * RelabelTable renames things — those are not equally welcome to everyone, and
 * a tool set that cannot be turned down is a tool set somebody uninstalls
 * whole. So the switch, not the uninstall.
 *
 * WHAT A SWITCH ACTUALLY DOES. Both halves of a module: the tile disappears
 * from the launcher AND `YMCA.inject` refuses to run it, so nothing of it
 * reaches the game's page either. A switch that left the mission panel behind
 * would be switching off the part nobody looks at.
 *
 * THE SWITCHBOARD IS THE SHELL'S, NOT THIS MODULE'S. `YMCA.isOn` is read by
 * the launcher and by injection, both of which run before any module mounts.
 * ElementFriend is only the face of it, so a module that goes does not take
 * the state of every other one with it.
 *
 * TWO KINDS OF TILE. A module with `mainTile: false` — HighFive — lives only
 * here, because its work happens in the game's own page and a launcher tile
 * for it would open a panel that does nothing. Everything else keeps its main
 * tile and is listed here as well, so the one page answers "what have I got
 * switched on" without going looking.
 *
 * SETTINGS BELONG TO THE MODULE. A module may declare `settings(el, ctx)`, and
 * what it writes goes into its OWN namespace — `YMCA.contextFor(mod.id)`, not
 * ElementFriend's store — so the module reads its settings back without
 * knowing this page exists.
 * ------------------------------------------------------------------------ */

/**
 * The modules that carry a switch, minus the ones that belong to a group.
 *
 * A group is a tile of its own — EagleEye is the first — and its members are
 * listed inside it. Otherwise the switchboard grows a row per tweak and stops
 * being a page anybody can take in.
 */
function efElements() {
    return YMCA.modules.filter((m) => m.optional && !m.group);
}

function efSwitch(id, on, label) {
    return `<label class="ymca-switch" data-sw="${esc(id)}">
      <input type="checkbox" ${on ? 'checked' : ''}><i></i>
      <span class="ymca-sw-text">${esc(label || (on ? 'On' : 'Off'))}</span>
    </label>`;
}

/** Wire every switch inside `root`. `after` is told which module changed. */
function efWireSwitches(root, ctx, after) {
    root.querySelectorAll('.ymca-switch[data-sw] input').forEach((box) => {
        box.addEventListener('change', () => {
            const label = box.closest('.ymca-switch');
            const id = label.dataset.sw;
            YMCA.switchElement(id, box.checked);
            const text = label.querySelector('.ymca-sw-text');
            if (text) text.textContent = box.checked ? 'On' : 'Off';
            const mod = YMCA.modules.find((m) => m.id === id);
            ctx.status(`${mod ? mod.title : id} is ${box.checked ? 'on' : 'off'}.`);
            if (after) after(id, box.checked);
        });
    });
}

/**
 * One tile: what it is, what it does in a sentence or three, and its switch.
 *
 * THE DESCRIPTION IS THE POINT OF THE PAGE. A tagline of four words tells
 * somebody which tool this is and nothing about whether they want it, and "do
 * I want it" is the only question this page exists to answer. So the tile
 * carries the module's own `description` — the same sentences its own panel
 * heads itself with, so there is one wording to keep true rather than two.
 *
 * A GROUP SAYS WHAT IS IN IT instead, by name. "Switch this off and every one
 * of them goes" means nothing until the list is on the tile.
 */
function efTile(m) {
    const on = YMCA.isOn(m);
    const inside = YMCA.inGroup ? YMCA.inGroup(m.id) : [];
    const holds = inside.length
        ? `<span class="ymca-dim" style="font-size:12px">Holds ${
            inside.map((x) => esc(x.title)).join(', ')}</span>`
        : '';
    return `<div class="ymca-tile el ${on ? '' : 'off'}" data-el="${esc(m.id)}"
      role="button" tabindex="0">
      ${iconFor(m.id)}<b>${esc(m.title)}</b>
      <span>${esc(m.description || m.tagline || '')}</span>
      ${holds}
      ${!inside.length && m.mainTile === false
        ? '<span class="ymca-dim" style="font-size:12px">Lives in the game’s own pages</span>'
        : ''}
      <div class="ymca-foot">
        <span class="ymca-dim" style="font-size:12px">${m.settings
        ? 'Open for settings' : 'Nothing to set'}</span>
        ${efSwitch(m.id, on)}
      </div>
    </div>`;
}

/**
 * A group's own page of tiles — one renderer, not one per group.
 *
 * EagleEye had a copy of this inside it, and the moment EasyEdit wanted the
 * same page there would have been two copies to keep in step. Any group gets
 * it by calling this from its `settings`.
 */
function efGroupTiles(el, ctx, groupId, lead) {
    const inside = YMCA.inGroup(groupId);
    el.innerHTML = `
    <p class="ymca-lead">${esc(lead)}</p>
    <div class="ymca-tiles">
      ${inside.map(efTile).join('')}
      <div class="ymca-tile soon">${iconFor('default')}<b>More to come</b>
        <span>This is where the next ones land.</span></div>
    </div>`;

    /* A member's settings replace the whole panel, and Back comes here rather
     * than all the way out to the switchboard. */
    const panel = el.closest('#ymca-panel') || el;
    const self = YMCA.modules.find((m) => m.id === groupId);
    el.querySelectorAll('[data-el]').forEach((tile) => {
        tile.addEventListener('click', (e) => {
            if (e.target.closest('.ymca-switch')) return;
            const mod = YMCA.modules.find((m) => m.id === tile.dataset.el);
            if (mod) {
                efOpen(panel, ctx, mod,
                    () => efOpen(panel, YMCA.contextFor(groupId), self));
            }
        });
    });
    efWireSwitches(el, ctx, (id, on) => {
        el.querySelector(`[data-el="${id}"]`)?.classList.toggle('off', !on);
    });
}

function efTiles(el, ctx) {
    const mods = efElements();
    el.innerHTML = `
    <p class="ymca-lead">Everything YMCA is made of, one tile each. A switch takes that part
      out of the launcher <em>and</em> out of the game's own pages &mdash; nothing of it runs.
      Open a tile for what it can be set to.</p>
    <div class="ymca-tiles">
      ${mods.map(efTile).join('')}
      <div class="ymca-tile soon">${iconFor('default')}<b>More to come</b>
        <span>This is where the next elements land.</span></div>
    </div>`;

    // The switch is inside the tile, so the tile's own click has to stand aside
    // for it — otherwise flicking the switch also opens the settings.
    const open = (id) => {
        const mod = YMCA.modules.find((m) => m.id === id);
        if (mod) efOpen(el, ctx, mod);
    };
    el.querySelectorAll('[data-el]').forEach((tile) => {
        tile.addEventListener('click', (e) => {
            if (e.target.closest('.ymca-switch')) return;
            open(tile.dataset.el);
        });
        tile.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (e.target.closest('.ymca-switch')) return;
            e.preventDefault();
            open(tile.dataset.el);
        });
    });
    efWireSwitches(el, ctx, (id, on) => {
        el.querySelector(`[data-el="${id}"]`)?.classList.toggle('off', !on);
    });
}

function efOpen(el, ctx, mod, back) {
    const on = YMCA.isOn(mod);
    el.innerHTML = `
    <div class="ymca-row" style="justify-content:space-between;margin-bottom:12px">
      <button class="ymca-btn" id="ef-back">&larr; ${back ? 'Back' : 'All elements'}</button>
      ${efSwitch(mod.id, on, on ? 'On' : 'Off')}
    </div>
    <div class="ymca-card">
      <b style="font-size:15px">${esc(mod.title)}</b>
      <div class="ymca-dim" style="font-size:13px;margin-top:3px">${esc(mod.description || '')}</div>
    </div>
    <div id="ef-body"></div>`;

    el.querySelector('#ef-back').addEventListener('click', () => {
        if (back) back(); else efTiles(el, ctx);
    });
    efWireSwitches(el, ctx);

    const body = el.querySelector('#ef-body');
    if (!mod.settings) {
        body.innerHTML = `<div class="ymca-note">Nothing to set here. The switch is the whole
      of it: on and ${esc(mod.title)} is in the launcher${mod.mainTile === false
    ? '' : ' and in the game’s pages'}, off and it is not.</div>`;
        return;
    }
    /* A module's settings write into the module's own namespace, so it reads
     * them back without knowing this page exists. A throw here shows an error
     * and leaves the rest of the switchboard standing. */
    const failed = (err) => {
        logger.error('elementfriend', `${mod.id} settings failed`, err.stack || err.message);
        body.innerHTML = `<div class="ymca-note bad"><b>${esc(mod.title)}’s settings could
      not open.</b> ${esc(err.message)}<br>The switch above still works.</div>`;
    };
    /* A settings page that reads the game fails as a rejected promise, long
     * after the try block has closed, so both routes land on the same notice. */
    try {
        const running = mod.settings(body, YMCA.contextFor(mod.id));
        if (running && typeof running.then === 'function') running.catch(failed);
    } catch (err) {
        failed(err);
    }
}

YMCA.register({
    id: 'elementfriend',
    title: 'ElementFriend',
    tagline: 'What you want switched on',
    description: 'One page for every part of YMCA you can turn down, and the settings that '
        + 'belong to each of them.',

    async mount(el, ctx) {
        efTiles(el, ctx);
    },
});
