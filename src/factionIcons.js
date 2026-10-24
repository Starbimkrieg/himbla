// Faction emblems (src/assets/factions/*.svg, drawn by tools/icons/faction_icons.py): vector, so they stay sharp at any
// size. `factionIcon(id)` is a data URI for an <img>, or '' for a faction without one (Unaffiliated).
import kepler from './assets/factions/kepler.svg?inline';
import vostok from './assets/factions/vostok.svg?inline';
import meridian from './assets/factions/meridian.svg?inline';
import spacecom from './assets/factions/spacecom.svg?inline';
import daedalus from './assets/factions/daedalus.svg?inline';
import rustmoon from './assets/factions/rustmoon.svg?inline';

const ICONS = { kepler, vostok, meridian, spacecom, daedalus, rustmoon };

export const factionIcon = (id) => ICONS[id] || '';
