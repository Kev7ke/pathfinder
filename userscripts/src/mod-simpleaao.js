/* --------------------------------------------------------------------------
 * SimpleAAO — the dispatch orders you would have built by hand.
 *
 * A dispatch order is a filter the game builds in its own editor: "send three
 * fire engines", "send one K-9 unit". Building one is a page of seventy-odd
 * fields where two of them matter, and then you do it again for two engines,
 * and again for four. Nobody builds the twenty orders they actually want.
 *
 * THE FORM SAYS HOW, AND NOTHING HERE IS GUESSED AT. `/aaos/new` carries one
 * field per capability the game has a word for, and each one is
 * `<input type="number" name="aao[fire]">` — so an order is a **count** per
 * capability, not a tick. That is the whole feature: pick the class the game
 * names, pick how many, and the order is the form the game would have posted.
 *
 * Every word on this page is the game's own. The groups are the editor's own
 * tabs (Fire, Rescue, Police, FBI, Water Rescue, Brush, Tow Trucks, Mountain
 * Rescue); the rows are its own labels — "Police Motorcycle", "Utility Truck",
 * "Fire Engine". Nothing is translated and no list of classes is kept here, so
 * a capability the game adds next month turns up on its own.
 *
 * IT WRITES, AND IT CAN BE UNDONE — which is why it may write at all. A
 * dispatch order is a thing the game lets you delete; credits and an alarm are
 * not. So the rule is met the way the rule asks: a preview that names exactly
 * what is about to be created, a confirmation before anything is sent, and
 * every order it made written down here with the game's own link to it, so
 * removing one is a click rather than a hunt.
 *
 * NOTHING IS HAND-BUILT. The FormData comes out of the real form fetched from
 * `/aaos/new`, and two fields are replaced — the caption and the one count. The
 * CSRF token, the category, the colours and every other setting go back exactly
 * as the game wrote them. That is the route SwitchDispatchCenter and the
 * Renamer already take.
 * -------------------------------------------------------------------------- */

/** The editor, fetched once for the page load: the form is the vocabulary. */
let SA_FORM = null;

async function saEditor() {
    if (SA_FORM) return SA_FORM;
    SA_FORM = (async () => {
        const res = await fetch('/aaos/new', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`the dispatch-order editor answered HTTP ${res.status}`);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const form = doc.querySelector('form[action*="aao"], form');
        if (!form) throw new Error('the dispatch-order editor carried no form');

        /* A DOMParser leaves `form.action` empty where the page had none, which
         * has cost this repo a release once already. The attribute is read, and
         * where the game states none the form is posted back to where it came
         * from rather than to a path made up here. */
        const action = form.getAttribute('action') || '/aaos/new';

        /* The tabs ARE the groups, named by the game. `#tabs` links point at the
         * panels by id, so the two are paired without naming either. */
        const tabName = new Map();
        for (const a of doc.querySelectorAll('a[href^="#"][data-toggle="tab"]')) {
            tabName.set(a.getAttribute('href').slice(1), a.textContent.trim());
        }

        const groups = [];
        for (const panel of doc.querySelectorAll('.tab-pane[id]')) {
            const rows = [];
            for (const input of panel.querySelectorAll('input[type="number"][name^="aao["]')) {
                const key = /^aao\[(.+)\]$/.exec(input.getAttribute('name'))?.[1];
                if (!key) continue;
                const label = panel.querySelector(`label[for="${input.id}"]`)?.textContent.trim();
                rows.push({ key, label: label || key, field: input.getAttribute('name') });
            }
            if (rows.length) {
                groups.push({ id: panel.id, name: tabName.get(panel.id) || panel.id, rows });
            }
        }
        if (!groups.length) throw new Error('the editor named no vehicle class at all');
        return { doc, form, action, groups };
    })().catch((err) => { SA_FORM = null; throw err; });
    return SA_FORM;
}

/**
 * Create one order, out of the game's own form.
 *
 * Two fields are replaced and nothing else is touched, so whatever the editor
 * would have sent by default is what gets sent.
 */
async function saCreate(editor, field, count, caption) {
    const data = new FormData(editor.form);
    data.set('aao[caption]', caption);
    data.set(field, String(count));
    const res = await fetch(editor.action, {
        method: (editor.form.getAttribute('method') || 'post').toUpperCase(),
        credentials: 'same-origin',
        body: data,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /* Where the game redirected to is its own page for what it just made, so
     * the way back to delete it is a reading rather than a path invented here. */
    return res.url || null;
}

YMCA.register({
    id: 'simpleaao',
    optional: true,
    defaultOn: true,
    title: 'SimpleAAO',
    tagline: 'Dispatch orders, one click each',

    description: 'The dispatch orders you would otherwise build one seventy-field page at a '
        + 'time. Pick a vehicle class the game names and how many of it, and the order is '
        + 'created from the game’s own editor. Every one it makes is listed here with the link '
        + 'to delete it again.',

    async mount(el, ctx) {
        el.innerHTML = '<p class="ymca-dim">Reading the game’s dispatch-order editor…</p>';
        let editor;
        try {
            editor = await saEditor();
        } catch (err) {
            el.innerHTML = `<div class="ymca-note bad">${ctx.esc(err.message)}. Nothing can be
        offered here until it does &mdash; every class and every group on this page is read off
        that form rather than kept in a list.</div>`;
            return;
        }

        const cfg = ctx.store.read('cfg', {});
        const open = editor.groups.some((g) => g.id === cfg.group) ? cfg.group : editor.groups[0].id;
        const made = ctx.store.read('made', []);

        const group = editor.groups.find((g) => g.id === open);
        const counts = [1, 2, 3, 4, 5];

        el.innerHTML = `
      <div class="ymca-card">
        <b>${editor.groups.length} groups, ${editor.groups.reduce((n, g) => n + g.rows.length, 0)}
          vehicle classes</b>
        <p class="ymca-sub" style="margin:4px 0 10px">All of it read off the game's own editor,
          groups and names alike. A number is how many of that class the order sends, which is
          what the editor's own field counts.</p>
        <div>${editor.groups.map((g) => `<button class="ymca-btn${g.id === open ? ' primary' : ''}"
          data-group="${ctx.esc(g.id)}">${ctx.esc(g.name)}</button>`).join(' ')}</div>
      </div>

      <div class="ymca-card">
        <table>
          <thead><tr><th>Vehicle class</th><th>Create an order for</th></tr></thead>
          <tbody>${group.rows.map((r) => `
            <tr>
              <td>${ctx.esc(r.label)} <small class="ymca-dim">${ctx.esc(r.key)}</small></td>
              <td>${counts.map((n) => `<button class="ymca-btn" data-make="${ctx.esc(r.field)}"
                data-n="${n}" data-label="${ctx.esc(r.label)}">${n}</button>`).join(' ')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <p class="ymca-sub" style="margin:10px 0 0">Each button says what it is about to create
          and waits to be told yes. An order <b>can</b> be deleted again &mdash; that is why this
          one may write at all.</p>
        <span class="ymca-status" id="sa-status"></span>
      </div>

      <div class="ymca-card">
        <b>Made from here</b>
        <p class="ymca-sub" style="margin:4px 0 8px">Every order this made, with the game's own
          link to it. Deleting one is the game's own page, not a button here.</p>
        <div id="sa-made">${made.length ? `<table><tbody>${made.map((m) => `
          <tr><td>${ctx.esc(m.caption)}</td>
            <td class="ymca-dim">${ctx.esc(m.field)} = ${ctx.esc(String(m.count))}</td>
            <td>${m.url ? `<a href="${ctx.esc(m.url)}" target="_blank" rel="noopener"
              >open it</a>` : '<span class="ymca-dim">no link came back</span>'}</td></tr>`)
            .join('')}</tbody></table>`
            : '<span class="ymca-dim">Nothing yet.</span>'}</div>
        ${made.length ? '<button class="ymca-btn" data-forget>Clear this list</button>' : ''}
      </div>`;

        const say = (text) => {
            const at = el.querySelector('#sa-status');
            if (at) at.textContent = text;
            ctx.status(text);
        };

        el.addEventListener('click', async (e) => {
            const tab = e.target.closest('[data-group]');
            if (tab) {
                ctx.store.write('cfg', Object.assign(ctx.store.read('cfg', {}),
                    { group: tab.dataset.group }));
                YMCA.modules.find((m) => m.id === 'simpleaao').mount(el, ctx);
                return;
            }
            if (e.target.closest('[data-forget]')) {
                /* The list, not the orders: nothing here deletes anything in the
                 * game, and a button that cleared both would be lying about one. */
                ctx.store.write('made', []);
                YMCA.modules.find((m) => m.id === 'simpleaao').mount(el, ctx);
                return;
            }

            const go = e.target.closest('[data-make]');
            if (!go) return;
            const field = go.dataset.make;
            const count = Number(go.dataset.n);
            const caption = `${go.dataset.label} ${count}`;

            /* The preview names exactly what is about to exist, and the yes is
             * the player's. Nothing is sent before it. */
            const ok = confirm(`Create a dispatch order in your game:\n\n`
                + `  Name:  ${caption}\n  Sends: ${count} × ${go.dataset.label}\n\n`
                + 'Everything else comes from the game’s own editor unchanged. '
                + 'You can delete it again in the game.');
            if (!ok) return;

            go.disabled = true;
            say(`Creating ${caption}…`);
            try {
                const url = await saCreate(editor, field, count, caption);
                const kept = ctx.store.read('made', []);
                kept.unshift({ caption, field, count, url, at: Date.now() });
                ctx.store.write('made', kept.slice(0, 200));
                ctx.log.info('dispatch order created', `${field}=${count}`);
                say(`${caption} created.`);
                YMCA.modules.find((m) => m.id === 'simpleaao').mount(el, ctx);
            } catch (err) {
                go.disabled = false;
                ctx.log.warn('dispatch order failed', err.message);
                say(`It was refused: ${err.message}`);
            }
        });

        ctx.status(`${group.rows.length} classes in ${group.name}.`);
    },
});
