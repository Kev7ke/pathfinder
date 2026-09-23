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
 * AND IT ASKS FIRST. A dropdown is one slip away from moving a station you
 * meant only to look at, so the pick arms a button that names the move —
 * "Move to LI" — and says where it is now. That button is the confirmation and
 * the sentence is the undo: picking the old centre again puts it back, and the
 * centre it was in is on screen until the moment it changes.
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

async function sdMount(ctx) {
    if (document.getElementById(SD_ID)) return true;
    const nav = document.querySelector(SD_NAV);
    const id = sdBuildingId();
    if (!nav || !id) return false;

    /* Marked before the fetch, so a second attempt from the same page growing
     * does not ask the game twice for the same page. */
    const box = document.createElement('span');
    box.id = SD_ID;
    box.style.cssText = 'display:inline-flex;gap:4px;align-items:center;margin:0 4px';
    nav.append(box);

    let page;
    try {
        page = await sdEditPage(id);
    } catch (err) {
        ctx.log.warn('could not read the edit page', err.message);
        box.remove();
        return true;
    }
    /* A building the game does not let you assign. Nothing to offer, and that
     * is the building rather than a breakage. */
    if (!page) { box.remove(); return true; }

    const current = page.current;
    const pick = document.createElement('select');
    pick.className = 'input-sm';
    /* A native control takes the system's own colours rather than the game's
     * button classes: `.btn-default` came back white on white in the probe. */
    pick.style.cssText = 'background:Field;color:FieldText;color-scheme:light dark;'
        + 'border:1px solid rgba(0,0,0,.35);border-radius:3px;font-size:12px;padding:1px 3px';
    pick.title = 'Assigned Dispatch Center';
    pick.innerHTML = page.options.map((o) => `<option value="${esc(o.value)}"${
        o.value === (current?.id || '') ? ' selected' : ''}>${
        esc(o.name || '— none —')}</option>`).join('');

    const save = document.createElement('a');
    save.className = 'btn btn-xs btn-warning';
    save.href = '#';
    save.setAttribute('role', 'button');
    save.hidden = true;

    const armed = () => {
        const chosen = page.options.find((o) => o.value === pick.value);
        const changed = pick.value !== (current?.id || '');
        save.hidden = !changed;
        if (!changed) return;
        save.textContent = pick.value ? `Move to ${chosen?.name || ''}` : 'Leave it unassigned';
        save.title = current
            ? `It is in ${current.name} until you press this. Pick ${current.name} again to undo.`
            : 'It is unassigned until you press this.';
    };
    pick.addEventListener('change', armed);

    save.addEventListener('click', async (e) => {
        e.preventDefault();
        const was = save.textContent;
        save.textContent = 'Moving…';
        try {
            await sdSend(page, pick.value, ctx);
            /* The page shows the old centre in its own navigation row and in
             * its own heading, so the honest thing is to let the game redraw
             * it rather than to paint the new one over the top. */
            location.reload();
        } catch (err) {
            save.className = 'btn btn-xs btn-danger';
            save.textContent = `Could not move it: ${err.message}`;
            save.title = was;
            ctx.log.error('dispatch centre not changed', err.message);
        }
    });

    box.append(pick, save);
    const slot = sdSlot(nav, current);
    if (slot.where === 'after') slot.node.after(box);
    else if (slot.where === 'before') slot.node.before(box);
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
