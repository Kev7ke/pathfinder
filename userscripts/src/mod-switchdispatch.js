/* --------------------------------------------------------------------------
 * SwitchDispatchCenter — which dispatch centre a station answers to, up top.
 *
 * The answer is already at the top of every building page, in the navigation
 * row — `#building-navigation-container`, Previous building, the centre's own
 * name as a button, Next building. Changing it is somewhere else entirely, and
 * moving a run of stations means going there and back once per station.
 *
 * TWO THINGS THE FIRST VERSION GOT WRONG, and one capture settled both.
 *
 * IT IS A FRAME. A building opens in the game's own lightbox —
 * `<iframe class="lightbox_iframe" src="/buildings/5685072">` — so ruling out
 * frames, which is right for the map's own modules, ruled out every building
 * page there is. What is asked now is what the page holds, never where it sits.
 *
 * AND THE FORM IS NOT ON IT. `/buildings/<id>` came back with
 * `forms: []` and no `#building_leitstelle_building_id` anywhere. The select
 * lives on the building's own EDIT page, which the building page only links to:
 *
 *   <select name="building[leitstelle_building_id]"
 *           id="building_leitstelle_building_id">
 *     <option value=""></option>
 *     <option value="5694841">EMSManiacs</option>
 *     <option selected="selected" value="5677680">NY</option>
 *   </select>
 *
 * So that page is fetched once, which hands over both halves at the same time:
 * the options to offer, and the real form to send. Nothing here is built —
 * the FormData comes out of the game's own form and one field is replaced, so
 * the CSRF token and every unrelated setting on that page go back exactly as
 * they came. That is the same route RelabelTable takes.
 *
 * AND IT LOOKS LIKE THE GAME, BECAUSE IT IS THE GAME'S OWN DROPDOWN. The row
 * is a `.btn-group`, so what goes in it is a nested `.btn-group`: a caret
 * button wearing `btn btn-default btn-xs`, the same as the button naming the
 * centre beside it, and a `.dropdown-menu` under it. The game's own Bootstrap
 * shows that menu on `.open`, which is a class rather than a script, so this
 * needs none of the game's JavaScript to work — and it is written to the menu's
 * own `display` as well, so it still opens on a page whose stylesheet is built
 * differently.
 *
 * EACH ENTRY CARRIES ITS OWN BUTTON, AND THAT BUTTON IS THE CONFIRMATION. The
 * name is inert; the tick beside it is the one thing that moves anything. So
 * choosing is one press rather than pick-then-confirm, and a stray click on a
 * list still moves nothing — which is the whole reason the arming step existed.
 * Nothing has to say "Move to LI" either: the row already names the centre.
 * The one it is in now is marked and carries no tick, because there is nowhere
 * to move it to.
 *
 * ------------------------------------------------------------------------ */

const SD_SELECT = '#building_leitstelle_building_id';
const SD_FIELD = 'building[leitstelle_building_id]';
const SD_NAV = '#building-navigation-container';
const SD_ID = 'ymca-sd-pick';

/** The building this page is, by its own address. Frame or not. */
function sdBuildingId() {
    return (/^\/buildings\/(\d+)(?:$|[/?#])/.exec(location.pathname) || [])[1] || '';
}

/**
 * The game's own edit page: the options to offer and the form to send.
 *
 * One request, because both answers are on it. A page that does not carry the
 * select is a building the game does not let you assign — a dispatch centre
 * itself, for one — and then nothing is offered rather than offered and dead.
 */
async function sdEditPage(id) {
    const res = await fetch(`/buildings/${id}/edit`, { credentials: 'include' });
    if (!res.ok) throw new Error(`the edit page answered ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const select = doc.querySelector(SD_SELECT);
    if (!select) return null;
    const form = select.closest('form') || doc.querySelector('form');
    if (!form) return null;
    const chosen = select.options[select.selectedIndex] || null;
    return {
        doc,
        form,
        options: [...select.options].map((o) => ({
            value: o.value, name: (o.textContent || '').trim(),
        })),
        current: chosen && chosen.value
            ? { id: chosen.value, name: (chosen.textContent || '').trim() } : null,
    };
}

/**
 * Where it goes in the navigation row.
 *
 * Straight after the button that names the current centre, so the answer and
 * the way to change it are in the same place. With no centre set the game puts
 * no such button there at all, and then it goes before Next building, which is
 * where that button would have been.
 */
function sdSlot(nav, current) {
    const links = [...nav.querySelectorAll('a')];
    if (current) {
        const naming = links.find((a) => (a.textContent || '').trim() === current.name);
        if (naming) return { node: naming, where: 'after' };
    }
    const next = links.find((a) => a.classList.contains('btn-success'));
    if (next) return { node: next, where: 'before' };
    return { node: nav, where: 'append' };
}

async function sdSend(page, value, ctx) {
    /* THE GAME'S OWN FORM, ONE FIELD REPLACED. Building a request by hand would
     * drop the CSRF token and every setting on that page that is not this one. */
    const data = new FormData(page.form);
    if (!data.has(SD_FIELD)) throw new Error(`no ${SD_FIELD} on the edit form`);
    data.set(SD_FIELD, value);
    // A document from DOMParser has no base URL, so form.action can come back empty.
    const action = page.form.getAttribute('action') || `/buildings/${sdBuildingId()}`;
    const post = await fetch(new URL(action, location.origin).toString(), {
        method: (page.form.getAttribute('method') || 'POST').toUpperCase(),
        body: data,
        credentials: 'include',
    });
    if (!post.ok) throw new Error(`saving answered ${post.status}`);
    ctx.log.info('dispatch centre changed', `${page.current?.name || 'none'} → ${value}`);
}

/** The game's own Bootstrap opens a menu on `.open`; the style is the fallback. */
function sdOpen(group, menu, open) {
    group.classList.toggle('open', open);
    menu.style.display = open ? 'block' : 'none';
}

async function sdMount(ctx) {
    if (document.getElementById(SD_ID)) return true;
    const nav = document.querySelector(SD_NAV);
    const id = sdBuildingId();
    if (!nav || !id) return false;

    /* Marked before the fetch, so a second attempt from the same page growing
     * does not ask the game twice for the same page. */
    const group = document.createElement('span');
    group.id = SD_ID;
    group.className = 'btn-group';
    group.style.position = 'relative';
    nav.append(group);

    let page;
    try {
        page = await sdEditPage(id);
    } catch (err) {
        ctx.log.warn('could not read the edit page', err.message);
        group.remove();
        return true;
    }
    /* A building the game does not let you assign. Nothing to offer, and that
     * is the building rather than a breakage. */
    if (!page) { group.remove(); return true; }

    const current = page.current;

    /* THE SAME BUTTON AS THE ONE NAMING THE CENTRE, which is what makes it read
     * as part of the game's own row rather than as something stuck to it. */
    const toggle = document.createElement('a');
    toggle.className = 'btn btn-default btn-xs dropdown-toggle';
    toggle.href = '#';
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.title = current
        ? `In ${current.name}. Pick another dispatch centre.`
        : 'Not assigned to a dispatch centre. Pick one.';
    /* POINTING THE WAY IT OPENS. A `.caret` is the game's own down-arrow, and
     * turning it a quarter keeps its colour and size while saying "leftwards",
     * which is where the menu now goes. */
    toggle.innerHTML = '<span class="caret" style="transform:rotate(90deg)"></span>';

    const menu = document.createElement('ul');
    /* IT OPENS LEFTWARDS BECAUSE THE ROW IS ALREADY AT THE RIGHT-HAND EDGE.
     * Hung from the left, the menu ran off the screen and half the centres
     * could not be reached; `dropdown-menu-right` is Bootstrap's own word for
     * it, and the two properties say the same thing where that class is not
     * defined. */
    menu.className = 'dropdown-menu dropdown-menu-right';
    menu.style.display = 'none';
    menu.style.right = '0';
    menu.style.left = 'auto';
    /* A tick at the height of the text beside it, in whatever colour it lands
     * in: no colour of YMCA's own, on the game's own page. */
    const tick = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none"'
        + ' stroke="currentColor" stroke-width="2.5" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5 L6.5 12 L13 4"/></svg>';
    menu.innerHTML = page.options.map((o) => {
        const here = o.value === (current?.id || '');
        const name = esc(o.name || '\u2014 not assigned \u2014');
        /* The one it is in now has nowhere to move to, so it is marked and
         * carries no tick. */
        return `<li class="${here ? 'active' : ''}"><a href="#" data-sd="${esc(o.value)}"
          style="display:flex;gap:14px;align-items:center;justify-content:space-between;
          ${here ? 'cursor:default' : ''}" ${here ? 'data-here="1"' : ''}>
          <span>${name}</span>
          ${here ? '<span style="opacity:.6;font-size:11px">here</span>'
        : `<span class="btn btn-xs btn-success" data-go="${esc(o.value)}"
              title="Move it to ${name}">${tick}</span>`}
        </a></li>`;
    }).join('');

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        sdOpen(group, menu, menu.style.display === 'none');
        toggle.setAttribute('aria-expanded', menu.style.display === 'block' ? 'true' : 'false');
    });

    /* THE NAME IS INERT AND THE TICK IS THE ACTION. A list where the whole row
     * moves a station is a list one stray click ruins, which is exactly what
     * the arming step was there to prevent. */
    menu.addEventListener('click', async (e) => {
        e.preventDefault();
        const go = e.target.closest('[data-go]');
        if (!go) return;
        const value = go.getAttribute('data-go');
        sdOpen(group, menu, false);
        toggle.className = 'btn btn-default btn-xs disabled';
        toggle.innerHTML = '<span style="opacity:.7">\u2026</span>';
        try {
            await sdSend(page, value, ctx);
            /* The page names the old centre in its own row and its own heading,
             * so the honest thing is to let the game redraw it rather than to
             * paint the new one over the top. */
            location.reload();
        } catch (err) {
            toggle.className = 'btn btn-danger btn-xs';
            toggle.innerHTML = '<span class="caret" style="transform:rotate(90deg)"></span>';
            toggle.title = `It did not move: ${err.message}`;
            ctx.log.error('dispatch centre not changed', err.message);
        }
    });

    /* Anywhere else, or Escape: the way every menu on the page closes. */
    document.addEventListener('click', (e) => {
        if (!group.contains(e.target)) sdOpen(group, menu, false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') sdOpen(group, menu, false);
    });

    group.append(toggle, menu);
    const slot = sdSlot(nav, current);
    if (slot.where === 'after') slot.node.after(group);
    else if (slot.where === 'before') slot.node.before(group);
    return true;
}

YMCA.register({
    id: 'switchdispatch',
    title: 'SwitchDispatchCenter',
    tagline: 'Move a station, from the top',
    description: 'Puts the building’s own “Assigned Dispatch Center” dropdown into the '
        + 'navigation row at the top of the page, beside the centre it is in now. Picking one '
        + 'arms a button that names the move; nothing is sent until you press it.',

    group: 'easyedit',
    mainTile: false,
    optional: true,
    defaultOn: true,

    onSwitch(on, ctx) {
        if (!on) document.getElementById(SD_ID)?.remove();
        else sdMount(ctx);
    },
});

YMCA.inject('switchdispatch', (ctx) => {
    /* A BUILDING PAGE IS A FRAME, and ruling frames out ruled out every one of
     * them: the game opens a building in its own lightbox, so the address is
     * `/buildings/<id>` inside an iframe. The page is asked what it holds
     * instead — the navigation row to put the control in. */
    if (!sdBuildingId() || !document.querySelector(SD_NAV)) return false;
    sdMount(ctx);
    /* The fetch finishes on its own; the row is here, so this attempt is done.
     * A second attempt would ask the game for the same page again. */
    return true;
});
