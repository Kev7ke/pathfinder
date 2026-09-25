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
        efGroupTiles(el, ctx, 'eagleeye',
            'Nothing in here changes what the game does \u2014 only how much of it you are '
            + 'looking at.');
    },
});
