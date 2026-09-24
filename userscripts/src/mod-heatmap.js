/* --------------------------------------------------------------------------
 * HeatSeeker — where your cover is thick and where it is thin.
 *
 * A fleet list says what you own; it does not say where it is. Fourteen
 * stations and eighty vehicles read as a table of numbers, and the question
 * nobody can answer from that table is the one worth asking: pick a kind of
 * vehicle, and where on the map is there none of it?
 *
 * EVERYTHING HERE IS ALREADY IN THE GAME'S OWN JSON, so nothing was captured
 * for it. `/api/buildings` carries `latitude` and `longitude` per station along
 * with `leitstelle_building_id`; `/api/vehicles` carries `building_id` and
 * `vehicle_type`. Vehicles per station per type, and where each station is.
 *
 * IT IS NOT THE GAME'S MAP, and that is said on the panel. Overlaying the
 * game's own Leaflet map means reaching for a global nobody here has seen, and
 * a wrong guess there is a dead overlay rather than an honest one. So this
 * draws its own, out of the coordinates the game states, and Diagnostics asks
 * the map question separately.
 *
 * THE SCALE IS RELATIVE TO THIS MAP AND SAYS SO. There is no figure anywhere in
 * the game for what "good cover" is, so the darkest cell is the best-covered
 * spot *on this player's own map* rather than a standard. Inventing a threshold
 * would be a guess wearing a colour.
 *
 * WHY THE DEFAULT IS NOT RED-TO-GREEN, although that is what was asked for:
 * run over the documented status palette, `#0ca30c` against `#d03b3b` comes
 * back at **ΔE 4.1 under deuteranopia** — below the floor of 6, which is to say
 * the two ends of the scale are the one pair a colour-blind reader cannot tell
 * apart. Magnitude takes one hue, light to dark, so that is the default. Red to
 * green is still offered because it is what was pictured, and either way the
 * count is written on every station, so the colour is never the only encoding.
 * -------------------------------------------------------------------------- */

/** The documented sequential ramp: one hue, light to dark, for magnitude. */
const HM_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
/** The status palette's own three steps, for the red-to-green that was asked for. */
const HM_WARM = ['#d03b3b', '#ec835a', '#fab219', '#8fbf1a', '#0ca30c'];

const HM_SCALES = {
    blue: { label: 'One hue, light to dark', steps: HM_BLUE },
    warm: { label: 'Red to green', steps: HM_WARM },
};

/** Kilometres between two points on the globe, near enough for a city. */
function hmKm(aLat, aLon, bLat, bLon) {
    const R = 6371;
    const rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLon = (bLon - aLon) * rad;
    const lat = ((aLat + bLat) / 2) * rad;
    const x = dLon * Math.cos(lat);
    return Math.sqrt(dLat * dLat + x * x) * R;
}

/** A colour off a ramp, by where the value sits between nothing and the most. */
function hmColour(t, steps) {
    if (!(t > 0)) return null;
    const at = Math.min(steps.length - 1, Math.floor(t * steps.length));
    return steps[at];
}

/**
 * What is at each station, by type.
 *
 * A station with no coordinates is counted and named rather than plotted: the
 * game states them for every building this has seen, and if one day it does not
 * that is worth knowing rather than quietly dropping the station.
 */
function hmStations(buildings, vehicles) {
    const byId = new Map();
    for (const b of buildings || []) {
        byId.set(String(b.id), {
            id: String(b.id),
            name: b.caption || `Building ${b.id}`,
            centre: b.leitstelle_building_id == null ? '' : String(b.leitstelle_building_id),
            lat: Number(b.latitude),
            lon: Number(b.longitude),
            byType: new Map(),
            total: 0,
        });
    }
    for (const v of vehicles || []) {
        const at = byId.get(String(v.building_id));
        if (!at) continue;
        const t = String(v.vehicle_type ?? '');
        at.byType.set(t, (at.byType.get(t) || 0) + 1);
        at.total += 1;
    }
    const placed = [];
    const noPlace = [];
    for (const s of byId.values()) {
        if (!s.total) continue;
        if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) placed.push(s);
        else noPlace.push(s.name);
    }
    return { placed, noPlace };
}

YMCA.register({
    id: 'heatmap',
    optional: true,
    defaultOn: true,
    title: 'HeatSeeker',
    tagline: 'Where your cover is thin',

    description: 'A map of your own stations shaded by how much of a chosen kind of vehicle '
        + 'can reach each spot. Tick the types and the dispatch centres to see cover for all of '
        + 'it or one branch at a time. The scale is relative to your own map, not a standard.',

    async mount(el, ctx) {
        el.innerHTML = '<p class="ymca-dim">Reading your stations and your fleet…</p>';
        const [buildings, vehicles] = await Promise.all([
            ctx.game('/api/buildings'), ctx.game('/api/vehicles'),
        ]);
        const { placed, noPlace } = hmStations(buildings, vehicles);
        if (!placed.length) {
            el.innerHTML = `<div class="ymca-note">No station of yours carries both a vehicle and
        a position, so there is nothing to draw yet.${noPlace.length
    ? ` ${noPlace.length} station${noPlace.length === 1 ? '' : 's'} had vehicles but no
        coordinates.` : ''}</div>`;
            return;
        }

        /* The names come from the store every module writes to, so a type named
         * once is named here too. A type nothing has named is still offered —
         * by its id, which is what the game calls it. */
        let names = {};
        try { names = JSON.parse(localStorage.getItem('ymca-vehicle-types')) || {}; } catch (e) { /* none */ }
        const nameOf = (id) => (names[id] && (names[id].name || names[id])) || `Type ${id}`;

        const types = [...new Set(placed.flatMap((s) => [...s.byType.keys()]))]
            .sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))));
        const centres = (buildings || [])
            .filter((b) => (buildings || []).some((x) => String(x.leitstelle_building_id) === String(b.id)))
            .map((b) => ({ id: String(b.id), name: b.caption || `Center ${b.id}` }));
        /* A STATION ANSWERING TO NO CENTRE IS STILL A STATION. Without an entry
         * of its own it vanished the moment the list was filtered at all, which
         * reads as cover that is not there — the one thing this page must not
         * get wrong. It is offered by the game's own words for it. */
        if (centres.length && placed.some((s) => !s.centre)) {
            centres.push({ id: '', name: '\u2014 not assigned \u2014' });
        }

        const cfg = ctx.store.read('cfg', {});
        const on = new Set(Array.isArray(cfg.types) && cfg.types.length ? cfg.types : types);
        const centresOn = new Set(Array.isArray(cfg.centres) && cfg.centres.length
            ? cfg.centres : centres.map((c) => c.id));
        const radius = Number(cfg.radius) || 8;
        const scale = HM_SCALES[cfg.scale] ? cfg.scale : 'blue';

        el.innerHTML = `
      <div class="ymca-card">
        <b>${placed.length} station${placed.length === 1 ? '' : 's'} on the map</b>
        <p class="ymca-sub" style="margin:4px 0 10px">Every spot is shaded by how many of the
          ticked vehicles are within reach of it, falling off with distance. <b>The scale is
          this map's own</b> &mdash; the deepest shade is wherever your cover is thickest, not a
          standard anybody set.</p>
        <canvas id="hm-canvas" style="width:100%;height:360px;border-radius:4px"></canvas>
        <div id="hm-legend" style="display:flex;align-items:center;gap:8px;margin-top:8px"></div>
      </div>

      <div class="ymca-card">
        <b>Which vehicles</b>
        <p class="ymca-sub" style="margin:4px 0 8px">Cover for all of them at once, or one kind
          at a time. Counts are written on each station, so the colour is never the only thing
          saying it.</p>
        <div style="margin-bottom:8px">
          <button class="ymca-btn" data-all="types">All of them</button>
          <button class="ymca-btn" data-none="types">None</button>
        </div>
        <div class="ymca-pick">${types.map((t) => `<label><input type="checkbox"
          data-type="${ctx.esc(t)}"${on.has(t) ? ' checked' : ''}> ${ctx.esc(String(nameOf(t)))}
          <span class="ymca-dim">${placed.reduce((n, s) => n + (s.byType.get(t) || 0), 0)}</span>
          </label>`).join('')}</div>
      </div>

      ${centres.length ? `
      <div class="ymca-card">
        <b>Which dispatch centres</b>
        <p class="ymca-sub" style="margin:4px 0 8px">The whole area, or one centre's own cover.</p>
        <div style="margin-bottom:8px">
          <button class="ymca-btn" data-all="centres">All of them</button>
          <button class="ymca-btn" data-none="centres">None</button>
        </div>
        <div class="ymca-pick">${centres.map((c) => `<label><input type="checkbox"
          data-centre="${ctx.esc(c.id)}"${centresOn.has(c.id) ? ' checked' : ''}>
          ${ctx.esc(c.name)}</label>`).join('')}</div>
      </div>` : ''}

      <div class="ymca-card">
        <b>How it is drawn</b>
        <label style="display:block;margin-top:7px">How far a vehicle counts for
          <select data-radius style="margin-left:6px">
            ${[2, 4, 6, 8, 12, 20, 35].map((n) => `<option value="${n}"${n === radius
    ? ' selected' : ''}>${n} km</option>`).join('')}
          </select></label>
        <label style="display:block;margin-top:7px">Scale
          <select data-scale style="margin-left:6px">
            ${Object.entries(HM_SCALES).map(([k, s]) => `<option value="${k}"${k === scale
    ? ' selected' : ''}>${s.label}</option>`).join('')}
          </select></label>
        <p class="ymca-dim" style="margin:8px 0 0;font-size:12px"><b>Red to green is the one pair
          a colour-blind reader cannot separate</b> &mdash; measured, not assumed: those two ends
          come back at &#916;E 4.1 under deuteranopia, where 6 is the floor. One hue from light
          to dark says the same thing and says it to everybody, so that is what it opens on.
          The distance is yours because no page of the game states what a vehicle covers.</p>
        ${noPlace.length ? `<p class="ymca-warn" style="margin:8px 0 0;font-size:12px">
          ${noPlace.length} station${noPlace.length === 1 ? '' : 's'} with vehicles stated no
          position, so ${noPlace.length === 1 ? 'it is' : 'they are'} not on the map.</p>` : ''}
      </div>`;

        const save = (patch) => ctx.store.write('cfg', { ...ctx.store.read('cfg', {}), ...patch });

        const draw = () => {
            const canvas = el.querySelector('#hm-canvas');
            if (!canvas) return;
            const picked = [...el.querySelectorAll('[data-type]:checked')].map((b) => b.dataset.type);
            const areas = new Set([...el.querySelectorAll('[data-centre]:checked')]
                .map((b) => b.dataset.centre));
            const r = Number(el.querySelector('[data-radius]')?.value) || radius;
            const steps = HM_SCALES[el.querySelector('[data-scale]')?.value || scale].steps;

            const shown = placed
                .filter((s) => !centres.length || areas.has(s.centre))
                .map((s) => ({ ...s, n: picked.reduce((n, t) => n + (s.byType.get(t) || 0), 0) }))
                .filter((s) => s.n > 0);

            const w = canvas.clientWidth || 600;
            const h = 360;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            const g = canvas.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.clearRect(0, 0, w, h);

            const legend = el.querySelector('#hm-legend');
            if (!shown.length) {
                legend.innerHTML = '<span class="ymca-dim">Nothing ticked, so there is nothing '
                    + 'to draw.</span>';
                return;
            }

            /* The frame is the stations plus the reach around them, so a lone
             * station at the edge is not drawn half off the canvas. */
            const pad = r / 110 + 0.02;
            const minLat = Math.min(...shown.map((s) => s.lat)) - pad;
            const maxLat = Math.max(...shown.map((s) => s.lat)) + pad;
            const midLat = (minLat + maxLat) / 2;
            const lonPad = pad / Math.max(0.2, Math.cos(midLat * Math.PI / 180));
            const minLon = Math.min(...shown.map((s) => s.lon)) - lonPad;
            const maxLon = Math.max(...shown.map((s) => s.lon)) + lonPad;
            /* Longitude degrees are shorter than latitude ones away from the
             * equator, so the frame is squared off rather than stretched. */
            const spanLat = Math.max(1e-6, maxLat - minLat);
            const spanLon = Math.max(1e-6, maxLon - minLon) * Math.cos(midLat * Math.PI / 180);
            const k = Math.min(w / spanLon, h / spanLat);
            const offX = (w - spanLon * k) / 2;
            const offY = (h - spanLat * k) / 2;
            const px = (lon) => offX + (lon - minLon) * Math.cos(midLat * Math.PI / 180) * k;
            const py = (lat) => offY + (maxLat - lat) * k;

            /* A cell per 6 screen pixels: fine enough to read as a wash, coarse
             * enough that a big map does not cost a second of drawing. */
            const cell = 6;
            const cols = Math.ceil(w / cell);
            const rows = Math.ceil(h / cell);
            const heat = new Float64Array(cols * rows);
            let most = 0;
            for (let cy = 0; cy < rows; cy += 1) {
                for (let cx = 0; cx < cols; cx += 1) {
                    const lon = minLon + ((cx + 0.5) * cell - offX)
                        / (k * Math.cos(midLat * Math.PI / 180));
                    const lat = maxLat - ((cy + 0.5) * cell - offY) / k;
                    let sum = 0;
                    for (const s of shown) {
                        const d = hmKm(lat, lon, s.lat, s.lon);
                        /* A plain bell: a vehicle counts fully at the station and
                         * fades to nothing by about twice the distance set. */
                        sum += s.n * Math.exp(-((d / r) ** 2));
                    }
                    heat[cy * cols + cx] = sum;
                    if (sum > most) most = sum;
                }
            }

            g.globalAlpha = 0.55;
            for (let cy = 0; cy < rows; cy += 1) {
                for (let cx = 0; cx < cols; cx += 1) {
                    const colour = hmColour(heat[cy * cols + cx] / (most || 1), steps);
                    if (!colour) continue;
                    g.fillStyle = colour;
                    g.fillRect(cx * cell, cy * cell, cell, cell);
                }
            }
            g.globalAlpha = 1;

            /* The station and its count, on top, because a number is the one
             * encoding nobody has to be able to see a colour to read. */
            g.font = '11px "Helvetica Neue", Helvetica, Arial';
            g.textAlign = 'center';
            for (const s of shown) {
                const x = px(s.lon);
                const y = py(s.lat);
                g.beginPath();
                g.arc(x, y, 9, 0, Math.PI * 2);
                g.fillStyle = 'rgba(0,0,0,.55)';
                g.fill();
                g.lineWidth = 2;
                g.strokeStyle = '#fff';
                g.stroke();
                g.fillStyle = '#fff';
                g.fillText(String(s.n), x, y + 4);
            }

            legend.innerHTML = `<span class="ymca-dim" style="font-size:12px">thin</span>
        ${steps.map((c) => `<span style="width:22px;height:12px;border-radius:2px;
          background:${c};display:inline-block"></span>`).join('')}
        <span class="ymca-dim" style="font-size:12px">thickest here</span>
        <span class="ymca-dim" style="font-size:12px;margin-left:10px">&middot;
          ${shown.length} station${shown.length === 1 ? '' : 's'},
          ${ctx.fmt(shown.reduce((n, s) => n + s.n, 0))} vehicle${
    shown.reduce((n, s) => n + s.n, 0) === 1 ? '' : 's'}, within ${r} km</span>`;
            ctx.status(`${shown.length} stations, ${r} km.`);
        };

        el.addEventListener('change', (e) => {
            if (e.target.dataset.radius !== undefined) save({ radius: Number(e.target.value) });
            else if (e.target.dataset.scale !== undefined) save({ scale: e.target.value });
            else if (e.target.dataset.type !== undefined) {
                save({ types: [...el.querySelectorAll('[data-type]:checked')].map((b) => b.dataset.type) });
            } else if (e.target.dataset.centre !== undefined) {
                save({ centres: [...el.querySelectorAll('[data-centre]:checked')].map((b) => b.dataset.centre) });
            } else return;
            draw();
        });

        el.addEventListener('click', (e) => {
            const all = e.target.closest('[data-all]');
            const none = e.target.closest('[data-none]');
            if (!all && !none) return;
            const what = (all || none).dataset.all || (all || none).dataset.none;
            const sel = what === 'types' ? '[data-type]' : '[data-centre]';
            for (const box of el.querySelectorAll(sel)) box.checked = !!all;
            save(what === 'types'
                ? { types: all ? types : [] }
                : { centres: all ? centres.map((c) => c.id) : [] });
            draw();
        });

        draw();
        /* The canvas is sized off its own width, so a window that changes shape
         * gets redrawn rather than stretched. */
        window.addEventListener('resize', draw, { passive: true });
    },
});
