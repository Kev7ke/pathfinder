/* --------------------------------------------------------------------------
 * EasyEdit — the game's own settings, where you already are.
 *
 * A group rather than a tool. Everything under it takes a setting the game
 * keeps two or three clicks away and puts the game's own control for it on the
 * page you are already looking at. Nothing under it invents a request: the
 * control it offers is the game's own, moved, so what gets sent is what the
 * game would have sent.
 *
 * A module joins by declaring `group: 'easyedit'`. ElementFriend then lists it
 * inside this tile rather than beside it, and switching EasyEdit off takes
 * every one of them with it.
 * ------------------------------------------------------------------------ */

YMCA.register({
    id: 'easyedit',
    title: 'EasyEdit',
    tagline: 'Settings where you already are',
    description: 'Takes a setting the game keeps behind two or three clicks and puts its own '
        + 'control on the page you are already on. Every one of them moves the game’s own '
        + 'field rather than building a request, and every one asks before it saves.',

    mainTile: false,
    optional: true,
    defaultOn: true,

    settings(el, ctx) {
        efGroupTiles(el, ctx, 'easyedit',
            'Each of these moves one of the game’s own fields. Nothing is sent until you '
            + 'press the button that says what it will do.');
    },
});
