/* --------------------------------------------------------------------------
 * StationFascination — the station list, one dispatch centre at a time.
 *
 * The map's station list is every building the account owns, in one column,
 * and on an account with three dispatch centres that is three regions of
 * stations scrolled past each other. The game filters by *kind* of building —
 * its own Firehouse / Rescue / Police buttons — and not by which centre a
 * station answers to. This adds that.
 *
 * THE GAME ALREADY WROTE THE ANSWER ON EVERY ROW. A station is
 * `li#building_list_<id>` carrying `building_type_id` and
 * `leitstelle_building_id` — the id of the dispatch centre it belongs to, as a
 * plain attribute. A dispatch centre is `building_type_id="1"` and its own
 * `leitstelle_building_id` is the string `"null"`. So the grouping is read
 * rather than fetched, and `/api/buildings` is never asked.
 *
 * IT IS A STYLESHEET, FOR THE SAME REASON SHUTEYE IS. The list is rebuilt
 * whenever the game refetches buildings and the vehicles under each station
 * load lazily on scroll, so anything written onto a row is gone by the next
 * redraw. One rule keyed on the game's own attribute survives all of it.
 *
 * IT ONLY EVER HIDES. The game's own search marks rows with
 * `building-filtered-by-search`, so a rule that forced rows visible would
 * fight it. Hiding what is not in the chosen centre and leaving everything
 * else alone means the two filters simply add up.
 * ------------------------------------------------------------------------ */

const SF_STYLE_ID = 'ymca-stationfascination';
const SF_PICK_ID = 'ymca-sf-pick';
const SF_LIST = '#building_list';

function sfCfg(ctx) {
    return ctx.store.read('cfg', { centre: '' });
}

/** The dispatch centres, named by the row the game drew for each of them. */
function sfCentres() {
    return [...document.querySelectorAll(`${SF_LIST} > li[building_type_id="1"]`)].map((li) => ({
        id: (li.id || '').replace('building_list_', ''),
        // The row's own link carries the name; `search_attribute` is the same text.
        name: li.getAttribute('search_attribute')
            || li.querySelector('.map_position_mover')?.textContent.trim()
            || li.id,
    })).filter((c) => c.id);
}

/** How many stations answer to each centre, so the list can say. */
function sfCounts() {
    const counts = {};
    for (const li of document.querySelectorAll(`${SF_LIST} > li[leitstelle_building_id]`)) {
        const key = li.getAttribute('leitstelle_building_id');
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

/**
 * The picker's own look.
 *
 * A `<select>` is a native control and the game's `.btn-default` is white on
 * white in the probe, which between them made it unreadable — dark, light, and
 * worse again with an option highlighted. So it wears the browser's own form
 * pair, `Field` on `FieldText`, which is always legible against itself and
 * follows whatever theme the page is in. That is not a colour of YMCA's own:
 * it is the one the system uses for every other dropdown on the machine.
 */
const SF_LOOK = `#${SF_PICK_ID}{color-scheme:light dark;background-color:Field;color:FieldText;
  border:1px solid;border-color:rgba(128,128,128,.6);border-radius:3px;
  font:inherit;font-size:12px;line-height:1.4;padding:1px 4px;max-width:160px;height:auto}
#${SF_PICK_ID} option{background-color:Field;color:FieldText}`;

function sfCss(centre) {
    if (!centre) return SF_LOOK;
    return `${SF_LOOK}
/* Hide, never show: the game's own station search is the other half of this,
   and a forced display would override it rather than add up with it. */
${SF_LIST} > li[leitstelle_building_id]:not([leitstelle_building_id="${centre}"])`
        + `:not(#building_list_${centre}){display:none !important}
/* The centre you picked belongs at the top of its own list. A flex column and
   one order is all that takes, and it survives every redraw because it is
   keyed on the id the game writes itself. */
${SF_LIST}{display:flex;flex-direction:column}
${SF_LIST} > li#building_list_${centre}{order:-1}`;
}

function sfApply(ctx) {
    const on = YMCA.isOn('stationfascination');
    let style = document.getElementById(SF_STYLE_ID);
    if (!on) {
        style?.remove();
        document.getElementById(SF_PICK_ID)?.remove();
        return;
    }
    if (!style) {
        style = document.createElement('style');
        style.id = SF_STYLE_ID;
        (document.head || document.documentElement).append(style);
    }
    style.textContent = sfCss(sfCfg(ctx).centre);
}

/** The dropdown, in the game's own row of filter buttons. */
function sfMount(ctx) {
    if (document.getElementById(SF_PICK_ID)) return true;
    const list = document.querySelector(SF_LIST);
    const centres = sfCentres();
    /* Wait for the list rather than for the page: buildings are fetched after
     * the map, and one dispatch centre is the least that makes this a choice. */
    if (!list || centres.length < 2) return false;

    const counts = sfCounts();
    const cfg = sfCfg(ctx);
    const pick = document.createElement('select');
    pick.id = SF_PICK_ID;
    pick.innerHTML = `<option value="">All dispatch centres</option>
    ${centres.map((c) => `<option value="${esc(c.id)}"${c.id === cfg.centre ? ' selected' : ''}
      >${esc(c.name)}${counts[c.id] ? ` (${counts[c.id]})` : ''}</option>`).join('')}`;

    pick.addEventListener('change', () => {
        ctx.store.write('cfg', { ...sfCfg(ctx), centre: pick.value });
        sfApply(ctx);
        ctx.log.info('filtered by dispatch centre', pick.value || 'all');
    });

    const row = document.getElementById('btn-group-building-select')
        || document.getElementById('building_panel_heading');
    if (!row) return false;
    row.prepend(pick);
    sfApply(ctx);
    return true;
}

YMCA.register({
    id: 'stationfascination',
    title: 'StationFascination',
    tagline: 'One dispatch centre at a time',
    description: 'Adds a dispatch centre picker to the game’s own station list, so a map '
        + 'with several regions on it can be read one region at a time.',

    group: 'eagleeye',
    mainTile: false,
    optional: true,
    defaultOn: true,

    onSwitch(on, ctx) { sfApply(ctx); },

    settings(el, ctx) {
        const cfg = sfCfg(ctx);
        const centres = sfCentres();
        el.innerHTML = `
      <div class="ymca-note">The picker sits with the game's own Firehouse and Police buttons,
        above the station list. It filters by <b>which dispatch centre a station answers to</b>,
        which the game writes on every row and never offers as a filter.</div>
      <div class="ymca-card">
        <b>Right now</b>
        <p class="ymca-dim" style="margin:6px 0 0">${centres.length
        ? `${centres.length} dispatch centre${centres.length > 1 ? 's' : ''} on this page:
             ${centres.map((c) => ctx.esc(c.name)).join(', ')}. Showing
             <b>${ctx.esc(centres.find((c) => c.id === cfg.centre)?.name || 'all of them')}</b>.`
        : 'The station list is not on this page, so there is nothing to pick from. Open the map '
          + 'and it appears above the stations.'}</p>
      </div>`;
    },
});

YMCA.inject('stationfascination', (ctx) => {
    /* The station list is on the map, and a mission frame's address bar says
     * `/` as well — so the frame is what is ruled out, not the path. */
    if (window.top !== window.self) return true;
    /* The rule goes on straight away even when the list has not arrived: a
     * choice made last session should not flash the whole list first. */
    sfApply(ctx);
    return sfMount(ctx);
});
