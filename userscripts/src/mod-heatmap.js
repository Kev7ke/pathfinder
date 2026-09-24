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
 * THE SCALE IS RELATIVE TO THIS MAP AND SAYS SO. There is no figure anywhere in
 * the game for what "good cover" is, so the deepest shade is the best-covered
 * spot *on this player's own map* rather than a standard. Inventing a threshold
 * would be a guess wearing a colour.
 *
 * WHY THE DEFAULT IN THE WINDOW IS NOT RED-TO-GREEN, although that is what was
 * asked for: run over the documented status palette, `#0ca30c` against
 * `#d03b3b` comes back at **ΔE 4.1 under deuteranopia** — below the floor of 6,
 * which is to say the two ends of the scale are the one pair a colour-blind
 * reader cannot tell apart. Magnitude takes one hue, light to dark, so that is
 * the default there. Red to green is what the game's own map opens on, because
 * it is what was pictured and because the count is written on every station —
 * the second encoding that measurement asks for.
 *
 * A HEATMAP IS A SUM OF RADIAL KERNELS, NOT A CIRCLE PER STATION. The first
 * version drew a coarse grid in banded colours, which reads as a blob that
 * grows and runs into the next blob rather than as a quantity. What is drawn
 * now is the textbook thing: one radial fall-off per station, ADDED together
 * into a mask, and the mask coloured through a continuous ramp. Three things
 * follow from doing it that way and all three are the point —
 *
 *   - the sum is the reading. Two stations near each other are hotter than
 *     either alone, which is what "how much cover is here" means;
 *   - the kernel is compactly supported, `(1 - t²)^focus`, so the wash STOPS at
 *     the distance the player set instead of trailing off for ever. Raising the
 *     exponent hugs the stations more tightly, and that is a setting;
 *   - the colour is continuous, sampled from the browser's own gradient
 *     interpolation at 256 steps, so there are no bands to mistake for
 *     thresholds nobody set.
 *
 * AND THE NORMALISATION IS THE MAP'S, NOT THE SCREEN'S. Dividing by the hottest
 * cell on screen meant the colours changed as you panned — the same station
 * dark green alone and orange beside a bigger one. The peak is taken over every
 * station in play, in kilometres, so it does not move when the view does.
 * -------------------------------------------------------------------------- */

/** The documented sequential ramp: one hue, light to dark, for magnitude. */
const HM_BLUE = ['#e7f1fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
/* The status palette's own steps, for the red-to-green that was asked for —
 * with a deeper green past the top of it. Five steps left "well covered" and
 * "covered twice over" the same colour, and the difference between those two is
 * exactly what somebody looking at their own map wants to see. */
const HM_WARM = ['#d03b3b', '#e8714a', '#f5a623', '#d6c916', '#8fbf1a', '#0ca30c', '#0a7a33', '#07532c'];

const HM_SCALES = {
    blue: { label: 'One hue, light to dark', steps: HM_BLUE },
    warm: { label: 'Red to green', steps: HM_WARM },
};

/* How tightly the wash hugs the station. The exponent on `(1 - t²)`: 1 is a
 * soft dome that fills the whole reach, 7 is a tight core with a thin skirt.
 * It is a setting because how far a vehicle counts for is already the player's
 * and this is the other half of the same question. */
const HM_FOCUS = {
    soft: { label: 'Soft, fills the whole reach', p: 1.5 },
    balanced: { label: 'Balanced', p: 2.5 },
    tight: { label: 'Tight around the station', p: 4 },
    tighter: { label: 'Tightest', p: 7 },
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

/* ------------------------------------------------------------ the gradient */

/**
 * The ramp as 256 samples, interpolated by the browser rather than by us.
 *
 * A list of seven colours drawn as seven bands reads as seven thresholds, and
 * there are no thresholds here. Painting the list into a one-pixel-tall canvas
 * gradient and reading it back gives a continuous ramp for nothing, and it is
 * the same interpolation CSS would do with the same stops.
 */
const hmRamps = new Map();
function hmRamp(steps) {
    const key = steps.join(',');
    if (hmRamps.has(key)) return hmRamps.get(key);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 1;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 256, 0);
    steps.forEach((s, i) => grad.addColorStop(steps.length === 1 ? 0 : i / (steps.length - 1), s));
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 1);
    const lut = g.getImageData(0, 0, 256, 1).data;
    hmRamps.set(key, lut);
    return lut;
}

/** The ramp's colour at t, as the three channels. */
function hmAt(lut, t) {
    const i = Math.max(0, Math.min(255, Math.round((t > 0 ? t : 0) * 255))) * 4;
    return [lut[i], lut[i + 1], lut[i + 2]];
}

function hmRgb(c) { return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`; }

/** WCAG relative luminance, so "readable" is a measurement and not a feeling. */
function hmLum(r, g, b) {
    const f = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * The same colour, darkened until it reads on white.
 *
 * The badge is white so the figure is legible over any tile, which means the
 * ramp's own yellow would be a number nobody can read. Darkening in steps until
 * the contrast ratio clears 4.5:1 keeps the shade that count earned while
 * making it legible, rather than swapping in a colour of YMCA's own.
 */
function hmInk(c) {
    let [r, g, b] = c;
    for (let i = 0; i < 14; i += 1) {
        if (1.05 / (hmLum(r, g, b) + 0.05) >= 4.5) break;
        r *= 0.82; g *= 0.82; b *= 0.82;
    }
    return hmRgb([r, g, b]);
}

/* -------------------------------------------------------------- the drawing */

/** Canvases reused between frames, because allocating one per frame is not free. */
const hmScratches = new Map();
function hmScratch(key, w, h) {
    let c = hmScratches.get(key);
    if (!c) { c = document.createElement('canvas'); hmScratches.set(key, c); }
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c;
}

/**
 * The hottest a point on this map can be, in the map's own units.
 *
 * Taken at the stations, because the sum of kernels peaks where the kernels are
 * centred. In kilometres, so it is the same number at every zoom and the
 * colours do not change under a pan — which is the fault it was written to fix.
 */
function hmPeak(stations, radius, focus) {
    let peak = 0;
    for (const a of stations) {
        let sum = 0;
        for (const b of stations) {
            const t = hmKm(a.lat, a.lon, b.lat, b.lon) / radius;
            if (t < 1) sum += b.n * ((1 - t * t) ** focus);
        }
        if (sum > peak) peak = sum;
    }
    return peak || 1;
}

/**
 * Paint the heat itself: one radial fall-off per station, added up.
 *
 * `globalCompositeOperation = 'lighter'` is what makes it a sum rather than a
 * pile of discs — it adds the source into the destination, so where two
 * stations' reach overlaps the mask carries both. What accumulates is the
 * ALPHA channel, which is why the colouring pass reads that and not the red.
 *
 * The mask is drawn at a third of the size and blown back up. That is not a
 * corner cut: scaling up with smoothing is a bilinear filter, which is exactly
 * the smoothing this wants, done by the browser at no cost — and it takes the
 * per-pixel colouring loop from a million iterations a frame to a hundred
 * thousand.
 */
function hmHeat(g, w, h, pts, opts) {
    const { peak, steps, opacity, rPx, focus } = opts;
    if (!pts.length || !(rPx > 0) || !(w > 0) || !(h > 0)) return () => 0;

    const s = 1 / 3;
    const mw = Math.max(1, Math.ceil(w * s));
    const mh = Math.max(1, Math.ceil(h * s));
    const mask = hmScratch('mask', mw, mh);
    const mg = mask.getContext('2d', { willReadFrequently: true });
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.clearRect(0, 0, mw, mh);
    mg.globalCompositeOperation = 'lighter';

    const rr = rPx * s;
    /* The kernel as gradient stops. Twelve is enough that the browser's own
     * interpolation between them is invisible, and the last one is a real zero
     * so the reach ends where the player said it does. */
    for (const p of pts) {
        const x = p.x * s;
        const y = p.y * s;
        if (x < -rr || y < -rr || x > mw + rr || y > mh + rr) continue;
        const grad = mg.createRadialGradient(x, y, 0, x, y, rr);
        for (let i = 0; i <= 12; i += 1) {
            const t = i / 12;
            grad.addColorStop(t, `rgba(255,255,255,${((1 - t * t) ** focus).toFixed(4)})`);
        }
        mg.globalAlpha = Math.min(1, p.n / peak);
        mg.fillStyle = grad;
        mg.beginPath();
        mg.arc(x, y, rr, 0, Math.PI * 2);
        mg.fill();
    }
    mg.globalCompositeOperation = 'source-over';
    mg.globalAlpha = 1;

    const img = mg.getImageData(0, 0, mw, mh);
    const d = img.data;
    const lut = hmRamp(steps);
    /* WHAT WAS DRAWN IS ALSO THE READING, so it is kept before the colouring
     * pass writes over it. A station's badge takes the shade of the ground it
     * stands on rather than of its own count: one appliance at a station
     * surrounded by three others is not thin cover, and colouring it red for
     * owning one said the opposite of what the map underneath was saying. */
    const inten = new Uint8ClampedArray(mw * mh);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 1) inten[j] = d[i + 3];
    for (let i = 0; i < d.length; i += 4) {
        const v = d[i + 3];
        if (!v) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; continue; }
        const j = v * 4;
        d[i] = lut[j];
        d[i + 1] = lut[j + 1];
        d[i + 2] = lut[j + 2];
        /* Fades in over the coldest sliver, so the far edge of the reach is a
         * fade rather than a line drawn round every station. */
        d[i + 3] = Math.round(255 * opacity * Math.min(1, v / 30));
    }
    mg.putImageData(img, 0, 0);

    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(mask, 0, 0, mw, mh, 0, 0, w, h);

    return (x, y) => {
        const cx = Math.max(0, Math.min(mw - 1, Math.round(x * s)));
        const cy = Math.max(0, Math.min(mh - 1, Math.round(y * s)));
        return inten[cy * mw + cx] / 255;
    };
}

/**
 * The station and what it counted, in a badge that reads over any tile.
 *
 * White fill, a ring in the shade of the cover THERE, and the figure in the
 * same shade darkened until it clears 4.5:1 against the white. The colour is
 * still the reading; the badge is only what makes it legible over a map that is
 * already full of things.
 *
 * THE SHADE IS THE GROUND'S, NOT THE STATION'S OWN COUNT. One appliance at a
 * station with three others around it is not thin cover, and a badge coloured
 * off `n / peak` said red while the wash under it said green — the figure and
 * the colour disagreeing about the same spot. Each badge reads the heat where
 * it stands, which is the same number the map is already showing.
 */
function hmBadges(g, pts, lut) {
    g.font = 'bold 12px "Helvetica Neue", Helvetica, Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of pts) {
        const colour = hmAt(lut, Math.max(0, Math.min(1, p.t)));
        const label = String(p.n);
        const r = Math.max(9, g.measureText(label).width / 2 + 6);
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = '#fff';
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = hmRgb(colour);
        g.stroke();
        g.fillStyle = hmInk(colour);
        g.fillText(label, p.x, p.y);
    }
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

/**
 * The lists to tick: the types this fleet holds and the centres they answer to.
 *
 * Worked out in one place because there are two pages of tick boxes now — the
 * window's and the one on the game's own map — and two copies of this would
 * drift the first time a type was named.
 */
function hmChoices(buildings, vehicles) {
    const { placed, noPlace } = hmStations(buildings, vehicles);
    /* The names come from the store every module writes to, so a type named
     * once is named here too. A type nothing has named is still offered — by
     * its id, which is what the game calls it. */
    let names = {};
    try { names = JSON.parse(localStorage.getItem('ymca-vehicle-types')) || {}; } catch (e) { /* none */ }
    const nameOf = (id) => (names[id] && (names[id].name || names[id])) || `Type ${id}`;
    const types = [...new Set(placed.flatMap((s) => [...s.byType.keys()]))]
        .sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))));
    const centres = (buildings || [])
        .filter((b) => (buildings || []).some((x) => String(x.leitstelle_building_id) === String(b.id)))
        .map((b) => ({ id: String(b.id), name: b.caption || `Center ${b.id}` }));
    /* A STATION ANSWERING TO NO CENTRE IS STILL A STATION. Without an entry of
     * its own it vanished the moment the list was filtered at all, which reads
     * as cover that is not there — the one thing this page must not get wrong.
     * It is offered by the game's own words for it. */
    if (centres.length && placed.some((s) => !s.centre)) {
        centres.push({ id: '', name: '— not assigned —' });
    }
    const countOf = (t) => placed.reduce((n, s) => n + (s.byType.get(t) || 0), 0);
    return {
        placed, noPlace, types, centres, nameOf, countOf,
        groups: hmGroups(buildings, placed, types, nameOf),
    };
}

/**
 * The vehicle types, under the kind of building they actually stand in.
 *
 * A flat list of forty types is a list nobody reads, and the game already
 * groups them for you: `/api/buildings` states `building_type` per station, so
 * a type's group is **where its vehicles are**, counted rather than assumed. A
 * type parked at two kinds of building goes under the one holding most of them,
 * so every type is offered exactly once and a group's tick means what it says.
 *
 * The names are the Renamer's, which is the one place in YMCA a building type's
 * name is learnt from the game and kept — a second copy here would drift the
 * first time one was corrected. A kind nothing has named is its own id, which
 * is what the game calls it.
 */
function hmGroups(buildings, placed, types, nameOf) {
    const kindOf = new Map();
    for (const b of buildings || []) kindOf.set(String(b.id), String(b.building_type ?? ''));

    let learnt = {};
    try { learnt = JSON.parse(localStorage.getItem('ymca-renamer-stationTypes')) || {}; } catch (e) { /* none */ }
    const builtin = typeof BUILTIN_STATION_TYPES === 'object' ? BUILTIN_STATION_TYPES : {};
    const kindName = (id) => learnt[id] || builtin[id] || `Building type ${id || '\u2014'}`;

    /* How many of each type stand at each kind of building. */
    const tally = new Map();
    for (const s of placed) {
        const kind = kindOf.get(s.id) ?? '';
        for (const [t, n] of s.byType) {
            if (!tally.has(t)) tally.set(t, new Map());
            const at = tally.get(t);
            at.set(kind, (at.get(kind) || 0) + n);
        }
    }

    const byKind = new Map();
    for (const t of types) {
        const at = tally.get(t) || new Map();
        let best = '';
        let most = -1;
        for (const [kind, n] of at) if (n > most) { best = kind; most = n; }
        if (!byKind.has(best)) byKind.set(best, []);
        byKind.get(best).push(t);
    }
    return [...byKind.entries()]
        .map(([id, list]) => ({
            id,
            label: kindName(id),
            types: list.sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b)))),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** The settings both faces read, with every default in one place. */
function hmSettings(cfg) {
    return {
        radius: Number(cfg.radius) || 8,
        focus: HM_FOCUS[cfg.focus] ? cfg.focus : 'tight',
        scale: HM_SCALES[cfg.scale] ? cfg.scale : 'blue',
        mapScale: HM_SCALES[cfg.mapScale] ? cfg.mapScale : 'warm',
        opacity: Number.isFinite(Number(cfg.opacity)) ? Number(cfg.opacity) : 0.55,
    };
}

YMCA.register({
    id: 'heatmap',
    optional: true,
    defaultOn: true,
    title: 'HeatSeeker',
    tagline: 'Where your cover is thin',

    description: 'A map of your own stations shaded by how many of a chosen kind of vehicle '
        + 'can reach each spot. Tick the types and the dispatch centres to see cover for all of '
        + 'it or one branch at a time, in here or on the game’s own map. The scale is '
        + 'relative to your own map, not a standard.',

    /* An injection cannot be un-run, so what it put in the game's page is taken
     * back here: the control, the canvas and the tick boxes all go. */
    onSwitch(on) {
        if (on) return;
        hmClear();
        document.getElementById(HM_BTN_ID)?.remove();
    },

    async mount(el, ctx) {
        el.innerHTML = '<p class="ymca-dim">Reading your stations and your fleet…</p>';
        const [buildings, vehicles] = await Promise.all([
            ctx.game('/api/buildings'), ctx.game('/api/vehicles'),
        ]);
        const {
            placed, noPlace, types, centres, nameOf, countOf, groups,
        } = hmChoices(buildings, vehicles);
        if (!placed.length) {
            el.innerHTML = `<div class="ymca-note">No station of yours carries both a vehicle and
        a position, so there is nothing to draw yet.${noPlace.length
    ? ` ${noPlace.length} station${noPlace.length === 1 ? '' : 's'} had vehicles but no
        coordinates.` : ''}</div>`;
            return;
        }

        const cfg = ctx.store.read('cfg', {});
        const set = hmSettings(cfg);
        const on = new Set(Array.isArray(cfg.types) && cfg.types.length ? cfg.types : types);
        const centresOn = new Set(Array.isArray(cfg.centres) && cfg.centres.length
            ? cfg.centres : centres.map((c) => c.id));

        el.innerHTML = `
      <div class="ymca-card">
        <b>${placed.length} station${placed.length === 1 ? '' : 's'} on the map</b>
        <p class="ymca-sub" style="margin:4px 0 10px">Every spot is shaded by how many of the
          ticked vehicles reach it, each station spreading its own count outwards and the
          overlaps adding up. <b>The scale is this map's own</b> &mdash; the deepest shade is
          wherever your cover is thickest, not a standard anybody set.</p>
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
        ${groups.map((gr) => `<div style="margin-bottom:6px">
          <div style="margin:6px 0 2px"><b>${ctx.esc(gr.label)}</b>
            <button class="ymca-btn" data-all="group" data-group="${ctx.esc(gr.id)}">all</button>
            <button class="ymca-btn" data-none="group" data-group="${ctx.esc(gr.id)}">none</button>
          </div>
          <div class="ymca-pick">${gr.types.map((t) => `<label><input type="checkbox"
            data-type="${ctx.esc(t)}" data-group="${ctx.esc(gr.id)}"${on.has(t) ? ' checked' : ''}>
            ${ctx.esc(String(nameOf(t)))}
            <span class="ymca-dim">${countOf(t)}</span></label>`).join('')}</div>
        </div>`).join('')}
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
            ${[2, 4, 6, 8, 12, 20, 35].map((n) => `<option value="${n}"${n === set.radius
    ? ' selected' : ''}>${n} km</option>`).join('')}
          </select></label>
        <label style="display:block;margin-top:7px">How tightly it hugs the station
          <select data-focus style="margin-left:6px">
            ${Object.entries(HM_FOCUS).map(([k, f]) => `<option value="${k}"${k === set.focus
    ? ' selected' : ''}>${f.label}</option>`).join('')}
          </select></label>
        <label style="display:block;margin-top:7px">Scale in here
          <select data-scale style="margin-left:6px">
            ${Object.entries(HM_SCALES).map(([k, s]) => `<option value="${k}"${k === set.scale
    ? ' selected' : ''}>${s.label}</option>`).join('')}
          </select></label>
        <label style="display:block;margin-top:7px">Scale on the game's map
          <select data-mapscale style="margin-left:6px">
            ${Object.entries(HM_SCALES).map(([k, s]) => `<option value="${k}"${k === set.mapScale
    ? ' selected' : ''}>${s.label}</option>`).join('')}
          </select></label>
        <label style="display:block;margin-top:7px">How strong on the map
          <select data-opacity style="margin-left:6px">
            ${[0.25, 0.4, 0.55, 0.7, 0.85].map((n) => `<option value="${n}"${n === set.opacity
    ? ' selected' : ''}>${Math.round(n * 100)}%</option>`).join('')}
          </select></label>
        <p class="ymca-sub" style="margin:8px 0 0">The button on the game's own map turns the
          same cover on over the real thing, and brings these tick boxes with it so the choosing
          happens where the map is. There it opens on <b>red to green</b>, because that is what
          it is for &mdash; and the count is written beside every station in the same shade,
          which is what makes that scale readable at all.</p>
        <p class="ymca-dim" style="margin:8px 0 0;font-size:12px"><b>Red to green is the one pair
          a colour-blind reader cannot separate</b> &mdash; measured, not assumed: those two ends
          come back at &#916;E 4.1 under deuteranopia, where 6 is the floor. One hue from light
          to dark says the same thing and says it to everybody, so that is what this one opens
          on. The distance is yours because no page of the game states what a vehicle covers.</p>
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
            const r = Number(el.querySelector('[data-radius]')?.value) || set.radius;
            const steps = HM_SCALES[el.querySelector('[data-scale]')?.value || set.scale].steps;
            const focus = (HM_FOCUS[el.querySelector('[data-focus]')?.value] || HM_FOCUS[set.focus]).p;

            const shown = placed
                .filter((s) => !centres.length || areas.has(s.centre))
                .map((s) => ({ ...s, n: picked.reduce((n, t) => n + (s.byType.get(t) || 0), 0) }))
                .filter((s) => s.n > 0);

            const w = canvas.clientWidth || 600;
            const h = 360;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
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

            const pts = shown.map((s) => ({ x: px(s.lon), y: py(s.lat), n: s.n }));
            const peak = hmPeak(shown, r, focus);
            /* `k` is pixels per degree of latitude, and a degree of latitude is
             * 111.32 km wherever you stand. */
            const heatAt = hmHeat(g, w, h, pts, {
                peak, steps, opacity: 0.85, rPx: (r * k) / 111.32, focus,
            });
            hmBadges(g, pts.map((q) => ({ ...q, t: heatAt(q.x, q.y) })), hmRamp(steps));

            const total = shown.reduce((n, s) => n + s.n, 0);
            legend.innerHTML = `<span class="ymca-dim" style="font-size:12px">thin</span>
        <span style="flex:0 0 140px;height:12px;border-radius:2px;display:inline-block;
          background:linear-gradient(to right,${steps.join(',')})"></span>
        <span class="ymca-dim" style="font-size:12px">thickest here</span>
        <span class="ymca-dim" style="font-size:12px;margin-left:10px">&middot;
          ${shown.length} station${shown.length === 1 ? '' : 's'},
          ${ctx.fmt(total)} vehicle${total === 1 ? '' : 's'}, within ${r} km</span>`;
            ctx.status(`${shown.length} stations, ${r} km.`);
        };

        el.addEventListener('change', (e) => {
            if (e.target.dataset.radius !== undefined) save({ radius: Number(e.target.value) });
            else if (e.target.dataset.focus !== undefined) save({ focus: e.target.value });
            else if (e.target.dataset.scale !== undefined) save({ scale: e.target.value });
            else if (e.target.dataset.mapscale !== undefined) save({ mapScale: e.target.value });
            else if (e.target.dataset.opacity !== undefined) {
                save({ opacity: Number(e.target.value) });
            } else if (e.target.dataset.type !== undefined) {
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
            const btn = all || none;
            const what = btn.dataset.all || btn.dataset.none;
            /* A group is the same tick, narrowed: which kind of building the
             * vehicles stand at, so a whole branch goes on or off at once. */
            const sel = what === 'group'
                ? `[data-type][data-group="${CSS.escape(btn.dataset.group)}"]`
                : (what === 'types' ? '[data-type]' : '[data-centre]');
            for (const box of el.querySelectorAll(sel)) box.checked = !!all;
            if (what === 'centres') save({ centres: all ? centres.map((c) => c.id) : [] });
            else save({ types: [...el.querySelectorAll('[data-type]:checked')].map((b) => b.dataset.type) });
            draw();
        });

        draw();
        /* The canvas is sized off its own width, so a window that changes shape
         * gets redrawn rather than stretched. */
        window.addEventListener('resize', draw, { passive: true });
    },
});

/* --------------------------------------------------------------------------
 * And the same thing on the game's own map.
 *
 * THE TILES ARE THE PROJECTION, so no function of the game's is called and no
 * global is reached for. A loaded tile is
 * `https://maps.missionchief.com/tile/13/2410/3080.png` — zoom, column, row —
 * and in Web Mercator the tile at (x, y, z) is exactly the world-pixel square
 * from (x·256, y·256) to (x·256+256, y·256+256). One tile's `getBoundingClientRect`
 * therefore fixes the whole page: where world pixel zero sits on screen, and at
 * what scale. Every station's own latitude and longitude goes through the same
 * formula and lands where the game would have put it.
 *
 * That is why this needs neither `window.map` nor Leaflet: the answer is in the
 * markup, and markup is what this repo reads. It also survives the game
 * renaming anything it likes, because nothing here knows a name to break.
 *
 * THE BUTTON IS THE GAME'S OWN KIND. `.leaflet-top.leaflet-left` already holds
 * a `.leaflet-bar.leaflet-control.leaflet-control-custom` the game made itself,
 * so ours is one of those, next to it.
 *
 * AND THE TICK BOXES COME WITH IT. Choosing which vehicles to look at from
 * inside a lightbox, two clicks away from the map the answer is drawn on, is
 * the same fault as a tool you have to open a window to reach. The button turns
 * the mode on and the lists appear beside it; they go when the mode goes, or
 * when they are closed on their own — closing the lists is not switching the
 * cover off, because somebody who has finished choosing still wants to see it.
 * -------------------------------------------------------------------------- */

const HM_CANVAS_ID = 'ymca-heat-canvas';
const HM_BTN_ID = 'ymca-heat-btn';
const HM_PANEL_ID = 'ymca-heat-panel';
let hmFrame = null;
/* What was last painted. The map announces nothing when it moves, so this is
 * redrawn per frame — but a frame that would paint exactly the same pixels is
 * skipped, which is the difference between an idle map costing nothing and
 * costing a colouring pass sixty times a second. */
let hmLast = '';

/** Where world pixel zero sits on screen, and how big a world pixel is. */
function hmProjection() {
    const map = document.getElementById('map');
    if (!map) return null;
    /* A zoom animation has tiles of two zooms on screen at once and every rect
     * mid-flight, so the frame is skipped rather than drawn at the wrong size. */
    if (map.classList.contains('leaflet-zoom-anim')) return null;
    for (const img of map.querySelectorAll('img.leaflet-tile.leaflet-tile-loaded')) {
        const at = /\/(\d+)\/(\d+)\/(\d+)\.[a-z]+(?:\?|$)/i.exec(img.getAttribute('src') || '');
        if (!at) continue;
        const rect = img.getBoundingClientRect();
        if (!(rect.width > 0)) continue;
        const scale = rect.width / 256;
        const z = Number(at[1]);
        return {
            z,
            scale,
            /* Screen position of world pixel (0,0) at this zoom. */
            left: rect.left - Number(at[2]) * 256 * scale,
            top: rect.top - Number(at[3]) * 256 * scale,
            map: map.getBoundingClientRect(),
        };
    }
    return null;
}

/** Web Mercator, the projection every slippy map tile in the world is cut on. */
function hmWorld(lat, lon, z) {
    const n = 256 * (2 ** z);
    const rad = (lat * Math.PI) / 180;
    return {
        x: ((lon + 180) / 360) * n,
        y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
    };
}

/** The canvas the heat is painted on, over the map and under nothing. */
function hmCanvas() {
    const map = document.getElementById('map');
    if (!map) return null;
    let canvas = document.getElementById(HM_CANVAS_ID);
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = HM_CANVAS_ID;
        /* Over the tiles and the markers, and never in the way of a click: the
         * map has to keep working exactly as it did. */
        canvas.style.cssText = 'position:absolute;inset:0;z-index:450;pointer-events:none';
        map.append(canvas);
    }
    return canvas;
}

function hmClear() {
    if (hmFrame) cancelAnimationFrame(hmFrame);
    hmFrame = null;
    hmLast = '';
    document.getElementById(HM_CANVAS_ID)?.remove();
    document.getElementById(HM_PANEL_ID)?.remove();
}

/**
 * Draw, and keep drawing: the map moves under us and nothing announces it.
 *
 * Watching for a pan means watching a transform the game rewrites constantly,
 * so it is asked once a frame instead — and a frame whose projection has not
 * moved and whose settings have not changed paints nothing at all.
 */
function hmPaint(state) {
    const canvas = hmCanvas();
    const p = hmProjection();
    if (!canvas || !p) return;

    const w = Math.round(p.map.width);
    const h = Math.round(p.map.height);
    const sig = `${p.z}|${Math.round(p.left)}|${Math.round(p.top)}|${p.scale}|${w}|${h}|${state.stamp}`;
    if (sig === hmLast) return;
    hmLast = sig;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    /* Screen position of a station, in the map's own coordinates. */
    const place = (s) => {
        const world = hmWorld(s.lat, s.lon, p.z);
        return {
            x: p.left + world.x * p.scale - p.map.left,
            y: p.top + world.y * p.scale - p.map.top,
        };
    };

    /* How many screen pixels a kilometre is, here. Mercator stretches with
     * latitude, so it is taken at the middle of the map rather than assumed. */
    const midLat = (() => {
        const worldY = (p.map.top + h / 2 - p.top) / p.scale;
        const n = 256 * (2 ** p.z);
        return (Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / n))) * 180) / Math.PI;
    })();
    const kmInPixels = (256 * (2 ** p.z) * p.scale)
        / (40075.016686 * Math.cos((midLat * Math.PI) / 180));

    const rPx = Math.max(6, state.radius * kmInPixels);
    /* Off-screen stations still count towards what is drawn at the edge, so the
     * wash does not stop at the window; only the badges are trimmed. */
    const pts = state.stations.map((s) => ({ ...place(s), n: s.n }));
    if (!pts.length) return;

    const heatAt = hmHeat(g, w, h, pts, {
        peak: state.peak,
        steps: state.steps,
        opacity: state.opacity,
        rPx,
        focus: state.focus,
    });
    /* THE NUMBER CARRIES THE COLOUR TOO, in a badge that reads over any tile:
     * the game's own markers stay where they are, and this adds what it counted
     * beside each station in the shade of the cover there. The heat is read at
     * the station and the badge is drawn above it, so the figure sits clear of
     * the game's own marker without taking its colour from empty ground. */
    hmBadges(
        g,
        pts.filter((s) => s.x > -40 && s.x < w + 40 && s.y > -40 && s.y < h + 40)
            .map((s) => ({ ...s, t: heatAt(s.x, s.y), y: s.y - 14 })),
        hmRamp(state.steps),
    );
}

/** What to draw, worked out from the settings the panel writes. */
function hmState(buildings, vehicles, cfg) {
    const { placed } = hmStations(buildings, vehicles);
    const set = hmSettings(cfg);
    const types = [...new Set(placed.flatMap((s) => [...s.byType.keys()]))];
    const on = new Set(Array.isArray(cfg.types) && cfg.types.length ? cfg.types : types);
    const areas = Array.isArray(cfg.centres) && cfg.centres.length ? new Set(cfg.centres) : null;
    const stations = placed
        .filter((s) => !areas || areas.has(s.centre))
        .map((s) => ({
            lat: s.lat,
            lon: s.lon,
            n: [...on].reduce((n, t) => n + (s.byType.get(t) || 0), 0),
        }))
        .filter((s) => s.n > 0);
    const focus = HM_FOCUS[set.focus].p;
    return {
        stations,
        radius: set.radius,
        focus,
        peak: hmPeak(stations, set.radius, focus),
        opacity: set.opacity,
        /* ON THE MAP THE DEFAULT IS THE ONE THAT WAS ASKED FOR. The measurement
         * that made one hue the default in the window has not changed — red and
         * green are ΔE 4.1 apart under deuteranopia — and it is answered here by
         * the count being written beside every station in the same shade, which
         * is the secondary encoding that measurement asks for. */
        steps: HM_SCALES[set.mapScale].steps,
        /* Anything a redraw depends on, so a frame that would repeat itself
         * does not. */
        stamp: JSON.stringify([stations.length, set, cfg.types, cfg.centres]),
    };
}

/**
 * The tick boxes, along the top edge of the map, as the game's own dropdowns.
 *
 * A column of forty checkboxes hung off the corner control covered the map it
 * was there to explain. THE GAME ALREADY HAS THE CONTROL FOR THIS: a
 * `.btn-group` with a `.dropdown-toggle` and a `.dropdown-menu` under it, shown
 * on the class `.open` rather than by any script of Bootstrap's — which is the
 * same route SwitchDispatchCenter takes, for the same reason. So the bar is
 * three buttons on one line at the top of the map, each opening the list it
 * names, and nothing is on screen that is not being read.
 *
 * Each button says what it has: "Vehicles 6 of 9" is the state without opening
 * anything. The vehicle list is grouped by the kind of building its vehicles
 * stand at, and a group's own tick takes the whole branch with it.
 *
 * Every pointer event stops at the bar's edge. Leaflet reads pointer and wheel
 * events off the map container, so without that a tick dragged the map beneath.
 */
function hmMapBar(ctx, map, choices, repaint) {
    document.getElementById(HM_PANEL_ID)?.remove();
    const { types, centres, nameOf, countOf, groups } = choices;

    const bar = document.createElement('div');
    bar.id = HM_PANEL_ID;
    /* Top edge, clear of the game's own controls in either corner. */
    bar.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);'
        + 'z-index:1000;pointer-events:auto;display:flex;gap:6px;flex-wrap:wrap;'
        + 'justify-content:center;max-width:calc(100% - 120px)';

    const menu = (id, label, body) => `
    <div class="btn-group" data-menu="${id}">
      <button type="button" class="btn btn-default btn-xs dropdown-toggle" data-open="${id}">
        <span data-label="${id}">${label}</span> <span class="caret"></span></button>
      <div class="dropdown-menu" style="display:none;max-height:56vh;overflow:auto;
        min-width:220px;padding:6px 10px;text-align:left">${body}</div>
    </div>`;

    const box = (what, id, text, n, on) => `<label style="display:block;margin:2px 0;
      font-weight:normal;white-space:nowrap">
      <input type="checkbox" data-${what}="${ctx.esc(id)}"${on ? ' checked' : ''}
        style="margin-right:5px;vertical-align:-1px">${ctx.esc(text)}${
    n === undefined ? '' : ` <span style="opacity:.55">${n}</span>`}</label>`;

    const draw = () => {
        const cfg = ctx.store.read('cfg', {});
        const set = hmSettings(cfg);
        const on = new Set(Array.isArray(cfg.types) && cfg.types.length ? cfg.types : types);
        const centresOn = new Set(Array.isArray(cfg.centres) && cfg.centres.length
            ? cfg.centres : centres.map((c) => c.id));

        const vehicleBody = `
      <div style="margin-bottom:4px"><a href="#" data-all="types">all</a>
        &middot; <a href="#" data-none="types">none</a></div>
      ${groups.map((gr) => `<div style="margin:6px 0 0">
        <div style="font-weight:bold">${ctx.esc(gr.label)}
          <a href="#" data-all="group" data-group="${ctx.esc(gr.id)}"
            style="font-weight:normal">all</a>
          <a href="#" data-none="group" data-group="${ctx.esc(gr.id)}"
            style="font-weight:normal">none</a></div>
        ${gr.types.map((t) => box('type', t, String(nameOf(t)), countOf(t), on.has(t))).join('')}
      </div>`).join('')}`;

        const centreBody = `
      <div style="margin-bottom:4px"><a href="#" data-all="centres">all</a>
        &middot; <a href="#" data-none="centres">none</a></div>
      ${centres.map((c) => box('centre', c.id, c.name, undefined, centresOn.has(c.id))).join('')}`;

        const pick = (attr, options, now) => `<select data-${attr}
      style="width:100%;margin:2px 0 6px">${options.map(([v, text]) => `<option value="${v}"${
    String(v) === String(now) ? ' selected' : ''}>${text}</option>`).join('')}</select>`;
        const lookBody = `
      <b>How far a vehicle counts for</b>
      ${pick('radius', [2, 4, 6, 8, 12, 20, 35].map((n) => [n, `${n} km`]), set.radius)}
      <b>How tightly it hugs the station</b>
      ${pick('focus', Object.entries(HM_FOCUS).map(([k, f]) => [k, f.label]), set.focus)}
      <b>How strong</b>
      ${pick('opacity', [0.25, 0.4, 0.55, 0.7, 0.85].map((n) => [n, `${Math.round(n * 100)}%`]),
        set.opacity)}
      <b>Scale</b>
      ${pick('mapscale', Object.entries(HM_SCALES).map(([k, x]) => [k, x.label]), set.mapScale)}`;

        bar.innerHTML = [
            centres.length
                ? menu('centres', `Centres ${centresOn.size} of ${centres.length}`, centreBody)
                : '',
            menu('types', `Vehicles ${[...on].filter((t) => types.includes(t)).length} of ${types.length}`,
                vehicleBody),
            menu('look', 'Look', lookBody),
        ].join('');
    };

    /* Which menu is open survives a redraw, because ticking a box redraws the
     * bar and a menu that shut itself on every tick is one you cannot use. */
    let open = '';
    const show = () => {
        for (const group of bar.querySelectorAll('[data-menu]')) {
            const is = group.dataset.menu === open;
            group.classList.toggle('open', is);
            const m = group.querySelector('.dropdown-menu');
            /* Bootstrap shows it on `.open` alone; the display is set as well so
             * it still opens where a stylesheet is built differently. */
            if (m) m.style.display = is ? 'block' : 'none';
        }
    };
    const redraw = () => { draw(); show(); };

    for (const kind of ['mousedown', 'pointerdown', 'touchstart', 'dblclick', 'wheel', 'click']) {
        bar.addEventListener(kind, (e) => e.stopPropagation());
    }

    const save = (patch) => {
        ctx.store.write('cfg', { ...ctx.store.read('cfg', {}), ...patch });
        repaint();
        redraw();
    };
    const ticked = () => [...bar.querySelectorAll('[data-type]:checked')]
        .map((b) => b.getAttribute('data-type'));

    bar.addEventListener('change', (e) => {
        const d = e.target.dataset;
        if (d.radius !== undefined) save({ radius: Number(e.target.value) });
        else if (d.focus !== undefined) save({ focus: e.target.value });
        else if (d.opacity !== undefined) save({ opacity: Number(e.target.value) });
        else if (d.mapscale !== undefined) save({ mapScale: e.target.value });
        else if (d.type !== undefined) save({ types: ticked() });
        else if (d.centre !== undefined) {
            save({
                centres: [...bar.querySelectorAll('[data-centre]:checked')]
                    .map((b) => b.getAttribute('data-centre')),
            });
        }
    });

    bar.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-open]');
        if (toggle) {
            e.preventDefault();
            open = open === toggle.dataset.open ? '' : toggle.dataset.open;
            show();
            return;
        }
        const all = e.target.closest('[data-all]');
        const none = e.target.closest('[data-none]');
        if (!all && !none) return;
        e.preventDefault();
        const btn = all || none;
        const what = btn.dataset.all || btn.dataset.none;
        /* A group's list is the choices', not the markup's: the boxes are
         * redrawn on every change, so the ids come off what was worked out once
         * rather than off whatever happens to be on screen this second. */
        if (what === 'group') {
            const group = groups.find((gr) => gr.id === btn.dataset.group);
            const now = new Set(ticked());
            for (const t of group?.types || []) { if (all) now.add(t); else now.delete(t); }
            save({ types: [...now] });
        } else if (what === 'centres') {
            save({ centres: all ? centres.map((c) => c.id) : [] });
        } else {
            save({ types: all ? types.slice() : [] });
        }
    });

    redraw();
    map.append(bar);
    return bar;
}

YMCA.inject('heatmap', (ctx) => {
    /* The map page and nowhere else: a mission window is a frame with no map in
     * it, and a building page has none either. */
    if (window.top !== window.self) return true;
    const corner = document.querySelector('#map .leaflet-top.leaflet-left');
    if (!corner) return;
    if (document.getElementById(HM_BTN_ID)) return true;

    /* The game's own kind of control, beside the one it made itself. */
    const bar = document.createElement('div');
    bar.id = HM_BTN_ID;
    bar.className = 'leaflet-bar leaflet-control leaflet-control-custom';
    bar.style.cssText = 'background-color:#fff;width:30px;height:30px;cursor:pointer';
    bar.title = 'Cover for the vehicles you ticked in HeatSeeker';
    bar.innerHTML = `<svg viewBox="0 0 30 30" width="30" height="30" fill="none"
    stroke="#333" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
    aria-hidden="true"><path d="M5 23 L11 9 L16 18 L20 13 L25 23 Z"/></svg>`;
    corner.append(bar);

    const run = (buildings, vehicles) => {
        const state = hmState(buildings, vehicles, ctx.store.read('cfg', {}));
        hmLast = '';
        const tick = () => {
            hmPaint(state);
            hmFrame = requestAnimationFrame(tick);
        };
        if (hmFrame) cancelAnimationFrame(hmFrame);
        tick();
    };

    const paint = async () => {
        const [buildings, vehicles] = await Promise.all([
            ctx.game('/api/buildings'), ctx.game('/api/vehicles'),
        ]);
        run(buildings, vehicles);
        /* The tick boxes come up with the mode, along the map's own top edge, so
         * the choosing happens where the answer is drawn rather than two clicks
         * away in a lightbox — and folded into dropdowns, so a list of forty
         * vehicle types is not covering the map it is there to explain. */
        hmMapBar(ctx, document.getElementById('map'), hmChoices(buildings, vehicles),
            () => run(buildings, vehicles));
    };

    bar.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const on = !document.getElementById(HM_CANVAS_ID);
        bar.style.backgroundColor = on ? '#8ab4f8' : '#fff';
        if (!on) { hmClear(); ctx.status('Cover overlay off.'); return; }
        paint().catch((err) => {
            hmClear();
            bar.style.backgroundColor = '#fff';
            ctx.log.warn('heat overlay', err.message);
        });
    });

    return true;
});
