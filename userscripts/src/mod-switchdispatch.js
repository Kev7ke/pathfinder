/* --------------------------------------------------------------------------
 * SwitchDispatchCenter — which dispatch centre a station answers to, up top.
 *
 * The game already has the control. It is a plain `<select>` in the building's
 * own form, down the page with everything else a station can be set to:
 *
 *   <select name="building[leitstelle_building_id]"
 *           id="building_leitstelle_building_id">
 *     <option value=""></option>
 *     <option value="5694841">EMSManiacs</option>
 *     <option selected="selected" value="5677680">NY</option>
 *   </select>
 *
 * And the answer is already at the top of the page, in the navigation row —
 * `#building-navigation-container`, Previous building, the centre's own name as
 * a button, Next building. So the one place the answer is *shown* is not the
 * place it can be *changed*, and moving a run of stations means scrolling down
 * and back up once per station.
 *
 * THE CONTROL IS THE GAME'S OWN, MOVED. Nothing here builds a request. The
 * dropdown sets the value on the game's own `<select>`, fires the `change` the
 * game listens for, and submits the game's own form — which is what keeps the
 * CSRF token and every unrelated setting on that page intact. Where the select
 * is not in the page there is nothing to mirror, so nothing is offered.
 *
 * AND IT ASKS FIRST. Picking from a dropdown is one slip away from moving a
 * station you meant to look at, so the pick only arms a button that names what
 * it will do — "Move to LI" — and says what it is moving from. That button is
 * the confirmation and the sentence is the undo: the centre it was in is on
 * screen until the moment it changes.
 * ------------------------------------------------------------------------ */

const SD_SELECT = '#building_leitstelle_building_id';
const SD_NAV = '#building-navigation-container';
const SD_ID = 'ymca-sd-pick';

/** The game's own field, or nothing — this is never built from scratch. */
function sdField() {
    const select = document.querySelector(SD_SELECT);
    return select && select.options.length ? select : null;
}

/** What the game currently has it set to, by its own selected option. */
function sdCurrent(select) {
    const option = select.options[select.selectedIndex] || null;
    return option && option.value
        ? { id: option.value, name: (option.textContent || '').trim() }
        : null;
}

/**
 * Where it goes in the navigation row.
 *
 * Straight after the button that names the current centre, so the answer and
 * the way to change it are in the same place. With no centre set the game puts
 * no such button there at all, and then it goes between Previous and Next,
 * which is where that button would have been.
 */
function sdSlot(nav, current) {
    const links = [...nav.querySelectorAll('a')];
    if (current) {
        const naming = links.find((a) => (a.textContent || '').trim() === current.name);
        if (naming) return { node: naming, where: 'after' };
    }
    const next = links.find((a) => /\/buildings\/\d+$/.test(a.getAttribute('href') || '')
        && a.classList.contains('btn-success'));
    if (next) return { node: next, where: 'before' };
    return { node: nav, where: 'append' };
}

function sdMount(ctx) {
    if (document.getElementById(SD_ID)) return true;
    const select = sdField();
    const nav = document.querySelector(SD_NAV);
    /* Both halves have to be there: the game's own field to move, and the row
     * to put the control in. One without the other is a page this does not
     * belong on, not a page to wait on. */
    if (!select || !nav) return false;

    const current = sdCurrent(select);
    const box = document.createElement('span');
    box.id = SD_ID;
    box.style.cssText = 'display:inline-flex;gap:4px;align-items:center;margin:0 4px';

    const pick = document.createElement('select');
    pick.className = 'input-sm';
    /* A native control takes the system's own colours rather than the game's
     * button classes: `.btn-default` came back white on white in the probe. */
    pick.style.cssText = 'background:Field;color:FieldText;color-scheme:light dark;'
        + 'border:1px solid rgba(0,0,0,.35);border-radius:3px;font-size:12px;padding:1px 3px';
    pick.title = 'Assigned Dispatch Center';
    pick.innerHTML = [...select.options].map((o) => `<option value="${esc(o.value)}"${
        o.value === (current?.id || '') ? ' selected' : ''}>${
        esc((o.textContent || '').trim() || '— none —')}</option>`).join('');

    const save = document.createElement('a');
    save.className = 'btn btn-xs btn-warning';
    save.href = '#';
    save.setAttribute('role', 'button');
    save.hidden = true;

    const armed = () => {
        const chosen = [...pick.options].find((o) => o.value === pick.value);
        const changed = pick.value !== (current?.id || '');
        save.hidden = !changed;
        if (!changed) return;
        const name = (chosen?.textContent || '').trim();
        save.textContent = pick.value ? `Move to ${name}` : 'Leave it unassigned';
        save.title = current
            ? `It is in ${current.name} until you press this. Pick ${current.name} again to undo.`
            : 'It is unassigned until you press this.';
    };
    pick.addEventListener('change', armed);

    save.addEventListener('click', (e) => {
        e.preventDefault();
        /* THE GAME'S OWN FIELD, THE GAME'S OWN FORM. Setting the value and
         * firing `change` is what any handler the game has on it expects, and
         * submitting the form it sits in is what keeps the CSRF token and
         * every other setting on the page exactly as they were. */
        select.value = pick.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const form = select.form || select.closest('form');
        if (!form) {
            save.textContent = 'The game’s own form is not on this page';
            ctx.log.warn('no form to submit', 'the dispatch centre select has no form');
            return;
        }
        ctx.log.info('dispatch centre changed', `${current?.name || 'none'} → ${pick.value}`);
        const button = form.querySelector('input[type="submit"], button[type="submit"]');
        if (button) button.click();
        else if (form.requestSubmit) form.requestSubmit();
        else form.submit();
    });

    box.append(pick, save);
    const slot = sdSlot(nav, current);
    if (slot.where === 'after') slot.node.after(box);
    else if (slot.where === 'before') slot.node.before(box);
    else nav.append(box);
    armed();
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
    /* A building page, and never a frame: the mission window's address bar says
     * `/` and the map has no building form on it. Asking the page what it holds
     * is what decides, so a route this has never seen answers too. */
    if (window.top !== window.self) return true;
    if (!document.querySelector(SD_SELECT)) return false;
    return sdMount(ctx);
});
