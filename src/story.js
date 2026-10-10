import * as THREE from 'three';
import { FACTIONS } from './locations.js';
import { makeRunner, makeCrate } from './models.js';
import { makeBody, stepSkater } from './physics.js';
import { toon, glow, ink, textSprite, nameTag } from './toon.js';
import { arcDist, tangent, frameQuat, greatCircle, darkness } from './geo.js';
import { pick } from './rng.js';
import { VEHICLES } from './vehicles.js';
import { spawnKadeTruck, updateKadeTruck, kadeDefeated, updateMortarDrop } from './kade.js';
import { FOES, makeProp } from './storyAssets.js';
import { saveWorldState } from './worldstate.js';

// Faction stories. Every faction has a leader who offers a four-chapter storyline once you're
// FRIENDLY with them. Finishing the first chapter of one story commits you to it (the other
// leaders stop dealing with you), which keeps each playthrough coherent and replayable.
const KEY = 'moonrunner-story-v1';
const REQ = [10, 15, 25, 35, 45];

export const LEADERS = {
  spacecom: { name: 'Admiral Ada Okonkwo', title: 'Commander, International Moon Force', look: { suit: 0xf4f1ff, accent: 0xffd23f, helmet: 0xf4f1ff, visor: 0xffd23f, scarf: 0xd7263d } },
  vostok: { name: 'General Yuri Volkov', title: 'Supreme Commander, Vostok Lunar Army', look: { suit: 0x6b6f78, accent: 0xff3b5c, helmet: 0x8a8f99, visor: 0x111111, scarf: 0xff3b5c } },
  meridian: { name: 'Chairwoman Lucinda Vane', title: 'Chief Executive, Meridian Exchange', look: { suit: 0xffc83a, accent: 0xffffff, helmet: 0xffe27a, visor: 0x1a1030, scarf: 0x2ec4ff } },
  kepler: { name: 'Mayor Hettie "Gran" Pike', title: 'Elected Mayor, Kepler Settlements', look: { suit: 0x7a4a2a, accent: 0x7dff6a, helmet: 0xfff4e0, visor: 0x2b8f4a, scarf: 0xff9f1c } },
  daedalus: { name: 'Director Ilsa Moreau', title: 'Director of Applied Sciences, Daedalus', look: { suit: 0x1a1426, accent: 0xff2e88, helmet: 0xeeeaf8, visor: 0xc77dff, scarf: 0xc77dff } },
  rustmoon: { name: 'Captain Kade', title: 'King of the Rustmoon Pirates · Deadliest Shot on the Moon', look: { suit: 0x1a1a1a, accent: 0xff2a3a, helmet: 0x2b2b2b, visor: 0xff2a3a, scarf: 0xd7263d } },
};

// Tech unlocked by the research-minded stories.
export const TECH = {
  dash: { name: 'Phase Dash', key: 'Z', desc: 'Swing all your momentum (plus a kick) towards wherever you are looking: a mid-air turn, climb or dive. 4 s cooldown.' },
  shield: { name: 'Deflector Shield', key: '—', desc: 'An invisible field that absorbs one hit or hard knock every 12 s (you see it when it takes one).' },
  vanes: { name: 'Quantum Slipstream Vanes', key: '—', desc: 'Your skates keep a share of their grip on the air: steer while you fly.' },
  teleport: { name: 'Personal Teleporter', key: 'T', desc: 'Jump to any discovered settlement or your outposts. 90 s cooldown.' },
};

// Modules for outposts you found (the base-builder part).
export const MODULES = {
  greenhouse: { name: 'Greenhouse', cost: 600, desc: 'Heals you while you are nearby, and grows a little income.' },
  clinic: { name: 'Clinic', cost: 800, desc: 'You redeploy here after a K.O. (nearest clinic wins).' },
  beacon: { name: 'Beacon Tower', cost: 700, desc: 'Charts 1.5 km of map around it and links to your other beacons for fast travel.' },
  turret: { name: 'Militia Turret', cost: 900, desc: 'Shoots pirates within 300 m.' },
  market: { name: 'Market Stall', cost: 1200, desc: 'Earns ₵40 a minute (up to ₵800) to collect at the terminal.' },
  garage: { name: 'Garage', cost: 1500, desc: 'Unlocks your faction hauler and lets you summon it anywhere.' },
};

// Chapter scripts. Step types: goto, relays, clear, capture, build, defend, experiment, carry, boss,
// kade, jam (plant a phase jammer and keep it alive while it converts a post), assault (storm a
// settlement: break its guns or its command pylon, then hold its centre). foe: whose troops a step
// throws at you (storyAssets FOES); backup: how many allied cars and troopers roll in with you;
// prop: what the step plants. A finale's reward.world reshapes the Moon (worldstate.js).
const CHAPTERS = {
  spacecom: [
    {
      title: 'Clear the Trade Lanes',
      brief: '"Runner. Convoys to the Helium-3 Exchange keep getting jumped. I need someone fast enough to find the ambush before it finds my trucks. Clear them out."',
      steps: [{ t: 'clear', at: { site: 'mine', min: 450, max: 750 }, n: 5, foe: 'rustmoon', label: 'Clear the pirate ambush' }],
      reward: { credits: 360, outfit: 'spacecom' },
      outro: '"Clean work. You\'re on SPACECOM\'s books now, Runner. Don\'t make me regret it."',
    },
    {
      title: 'Operation Foothold',
      brief: '"Rustmoon\'s squatting on outposts around Farside. We\'re taking one back, and you\'re not going in alone: a SPACECOM squad rolls with you. Clear the scum, then hold the ground until my engineers lock it down."',
      steps: [{ t: 'capture', at: { outpost: 'rustmoon', near: 'farside' }, guards: 5, hold: 25, foe: 'rustmoon', backup: 2, label: 'Take the outpost' }],
      reward: { credits: 540, upgrade: ['seeker', 1] },
      outro: '"Outpost secured. R&D fitted your discs with a SPACECOM Seeker Module: they\'ll hunt a little harder now. Wheels come next."',
    },
    {
      title: 'Signal in the Dark',
      brief: '"We\'re lighting up a relay mast on the dark side so patrols can see the pirates coming. It needs a minute to calibrate, and they WILL come. Keep it standing."',
      steps: [
        { t: 'goto', at: { site: 'farside', min: 500, max: 800 }, r: 25, label: 'Reach the relay site' },
        { t: 'defend', at: { prev: true }, secs: 60, hp: 700, prop: 'relay', foe: 'rustmoon', label: 'Protect the relay while it calibrates' },
      ],
      reward: { credits: 660, vehicle: 'interceptor', tech: 'shield' },
      outro: '"Relay\'s up. You\'ve earned wheels: the motor pool will drop a Lunar Interceptor wherever you call for it (V). And R&D sent a Deflector Shield. Try not to need it."',
    },
    {
      title: 'Captain Kade',
      brief: '"Captain Kade. The King of the Rustmoon Pirates. He\'s put more of my people in the dirt than the vacuum has. Intel says he\'s near Gloom Harbor. Bring him in. Watch for the red dot, Runner. When you see it, MOVE."',
      steps: [
        { t: 'goto', at: { site: 'gloom', min: 350, max: 550 }, r: 60, label: 'Find Kade near Gloom Harbor' },
        { t: 'kade', label: 'Defeat Captain Kade' },
      ],
      reward: { credits: 1200, rep: 12 },
      outro: '"Kade\'s in a cell, and his clans are tearing each other apart over his chair. That\'s our window. Come and see me when you\'re ready to finish this."',
    },
    {
      title: 'Dark Side Dawn',
      brief: '"With Kade gone the clans are headless. We hit Rustmoon Hold tonight with everything we have: knock out their command pylon, then hold the yard until the flag goes up. After tonight there IS no Rustmoon."',
      steps: [{ t: 'assault', at: { loc: 'rustmoon' }, loc: 'rustmoon', core: true, hold: 30, foe: 'rustmoon', backup: 3, label: 'Storm Rustmoon Hold' }],
      reward: { credits: 2400, outfit: 'spacecom2', rep: 15, world: 'piratesGone' },
      outro: '"The flag\'s up over Rustmoon Hold. The clans are finished, Runner. The dark side is ours to protect now, and the Moon can breathe."',
      final: true,
    },
  ],
  vostok: [
    {
      title: 'Proving Ground',
      brief: '"You want to work for Vostok? Show me. Raiders are camping near Base Four. Remove them."',
      steps: [{ t: 'clear', at: { site: 'vostok4', min: 400, max: 700 }, n: 5, foe: 'rustmoon', label: 'Remove the raiders' }],
      reward: { credits: 390, outfit: 'vostok' },
      outro: '"Acceptable. You are Vostok\'s now, comrade. Daedalus will hear your name and spit."',
    },
    {
      title: 'Bite the Daedalus',
      brief: '"Daedalus hides a listening post near our border. Their security guards it. Take it with my squad, hold it, raise our flag."',
      steps: [{ t: 'capture', at: { outpost: 'daedalus', near: 'vostok' }, guards: 5, hold: 30, foe: 'daedalus', backup: 2, label: 'Capture the Daedalus post', war: 'daedalus' }],
      reward: { credits: 600, weapon: 'scatter' },
      outro: '"The post is ours. Take a Scattergun, comrade: seven pellets, no arguments. Key 2."',
    },
    {
      title: 'Hold the Line',
      brief: '"Daedalus wants the post back, and they bought pirate guns to help. Plant a field generator and hold. The garrison is on its way: they will reach you, if you live that long."',
      steps: [
        { t: 'goto', at: { captured: true }, r: 30, label: 'Return to the captured post' },
        { t: 'defend', at: { prev: true }, secs: 75, hp: 900, prop: 'fieldgen', foe: 'daedalus', mixed: 'rustmoon', garrisonAt: 35, label: 'Hold until the garrison arrives' },
      ],
      reward: { credits: 780, vehicle: 'apc', tech: 'shield' },
      outro: '"The line held. Take an APC: the BTR-M. Press V and it will find you. It does not die easily. Neither should you: take a Deflector Shield as well. Now we finish this."',
    },
    {
      title: 'Red Moon Rising',
      brief: '"Daedalus\' Forward Post is guarded by their Warden, a hovering monster of a war machine. Find it in the open and destroy it. Then they will know whose Moon this is."',
      steps: [
        { t: 'boss', at: { site: 'daedalus2', min: 450, max: 700 }, boss: { name: 'THE DAEDALUS WARDEN', hp: 1300, model: 'warden' }, foe: 'daedalus', escort: 2, label: 'Destroy the Daedalus Warden' },
      ],
      reward: { credits: 1500, rep: 12, upgrade: ['flak', 1] },
      outro: '"The Warden is scrap. Our armourers sewed you a Flak Weave from its plating. Sharpen yourself, comrade: there is one more door to kick in."',
    },
    {
      title: 'Iron Moon',
      brief: '"The Citadel. Their guns, their labs, their Director. My whole army rolls tonight and you ride at the front. Silence the Citadel\'s guns, take the square, and Daedalus is finished."',
      steps: [{ t: 'assault', at: { loc: 'daedalus' }, loc: 'daedalus', guns: 5, hold: 35, foe: 'daedalus', backup: 3, label: 'Storm the Daedalus Citadel' }],
      reward: { credits: 3000, outfit: 'vostok2', rep: 15, vehicle: 'skimmer', weapon: 'rail', world: 'conquer', loser: 'daedalus' },
      outro: '"The Citadel flies our flag. Daedalus is Vostok now: its labs, its guns, its toys. Take a Phase Skimmer and their Rail Lance, and wear this: Hero of the Moon. You earned it."',
      final: true,
    },
  ],
  daedalus: [
    {
      title: 'Recovery Protocol',
      brief: '"A prototype core is sitting in a field lab at the Forward Post. It is unstable. Bring it to me here. Gently. If it cracks you will not need to worry about the delivery fee."',
      steps: [{ t: 'carry', from: 'daedalus2', to: { loc: 'daedalus' }, fragile: 26, label: 'Carry the prototype core', cargo: 'PROTOTYPE CORE' }],
      reward: { credits: 420, outfit: 'daedalus' },
      outro: '"Intact. Remarkable. You are Daedalus\' runner now. Vostok will consider you a target. Consider that a compliment."',
    },
    {
      title: 'Asset Denial',
      brief: '"Vostok placed a post on our border. It hears everything we say. We do not storm things, Runner: we rewrite them. Plant a phase jammer inside their perimeter and keep it alive while it turns their post into ours."',
      steps: [{ t: 'jam', at: { outpost: 'vostok', near: 'daedalus' }, guards: 4, secs: 50, hp: 650, foe: 'vostok', backup: 2, label: 'Jam the Vostok post', war: 'vostok' }],
      reward: { credits: 600, weapon: 'rail' },
      outro: '"Efficient. Take a Rail Lance: an instant, piercing beam. Key 3. Do try to aim."',
    },
    {
      title: 'Phase Trial',
      brief: '"I am calibrating a phase field in the open. Five nodes hang in it, and something has to pass through each before the field collapses. Volunteers have been… scarce."',
      steps: [
        { t: 'goto', at: { site: 'daedalus', min: 400, max: 700 }, r: 30, label: 'Reach the test site' },
        { t: 'experiment', at: { prev: true }, secs: 75, nodes: 5, label: 'Fly through the calibration nodes' },
      ],
      reward: { credits: 780, tech: 'dash', vehicle: 'skimmer' },
      outro: '"Calibrated. The field rewrote a little of you: point yourself anywhere and press Z, and your momentum will follow. And take a Phase Skimmer (V). It hovers. It drifts. Do not do either into a wall."',
    },
    {
      title: 'The Black Sun',
      brief: '"Our reactor goes live tonight at the Forward Post. Vostok will try to stop it with their Hammer, a tracked brute with an ego. Keep the reactor alive while it ignites. Then break the Hammer."',
      steps: [
        { t: 'goto', at: { loc: 'daedalus2', off: [-0.4, 0] }, r: 30, label: 'Reach the reactor' },
        { t: 'defend', at: { prev: true }, secs: 70, hp: 1000, prop: 'reactor', foe: 'vostok', label: 'Keep the reactor alive while it ignites' },
        { t: 'boss', at: { prev: true }, boss: { name: 'THE VOSTOK HAMMER', hp: 1500, model: 'hammer' }, foe: 'vostok', escort: 2, label: 'Break the Vostok Hammer' },
      ],
      reward: { credits: 1500, rep: 12, world: 'blackSun', upgrade: ['overcharge', 1] },
      outro: '"The Black Sun burns, and it will keep burning. You have my gratitude, which is rare, and an Overcharger for your weapons, which is useful. One experiment remains."',
    },
    {
      title: 'Total Eclipse',
      brief: '"Bastion Vostok-9. The General\'s fortress, and the last thing standing between us and a quiet Moon. Our security moves on it tonight. Disable its guns, take the parade ground, and Vostok ceases to be a variable."',
      steps: [{ t: 'assault', at: { loc: 'vostok' }, loc: 'vostok', guns: 5, hold: 35, foe: 'vostok', backup: 3, label: 'Storm Bastion Vostok-9' }],
      reward: { credits: 3000, outfit: 'daedalus2', rep: 15, vehicle: 'apc', weapon: 'scatter', world: 'conquer', loser: 'vostok' },
      outro: '"Vostok is Daedalus now. Their bases, their armour, their remarkably loud guns. Take a BTR-M, their Scattergun, and a Prototype Shell. For science."',
      final: true,
    },
  ],
  kepler: [
    {
      title: 'Room to Grow',
      brief: '"Kepler\'s bursting at the seams, dear. I\'ve found a lovely flat spot for a homestead. Haul the prefab parts out there and we\'ll have a new home by supper."',
      steps: [{ t: 'build', from: 'kepler', site: { site: 'kepler', min: 600, max: 900 }, trips: 3, found: { kind: 'homestead', name: 'Pike\'s Hope' }, label: 'Haul prefab parts to the homestead site' }],
      reward: { credits: 420, outfit: 'kepler' },
      outro: '"Pike\'s Hope! Oh, it\'s perfect. It\'s yours to run, love: use the terminal there to add a greenhouse, a clinic, a market… Kepler\'s proud to call you family."',
    },
    {
      title: 'Raiders at the Gate',
      brief: '"Pirates are sniffing around Pike\'s Hope. The settlers are frightened. Keep the generator running, dear: the militia is on its way, and they\'ll get there if you buy them the time."',
      steps: [
        { t: 'goto', at: { founded: true }, r: 30, label: 'Get to Pike\'s Hope' },
        { t: 'defend', at: { prev: true }, secs: 70, hp: 800, prop: 'homegen', foe: 'rustmoon', garrisonAt: 30, label: 'Keep the generator running' },
      ],
      reward: { credits: 660, module: 'turret', upgrade: ['dampers', 1] },
      outro: '"You saved them. I\'ve had a militia turret installed at Pike\'s Hope, on the house. And dear… the councils have been talking about you."',
    },
    {
      title: 'The Survey',
      brief: '"A homestead is lovely. But the Moon needs a proper town of ours, a real one, and the councils want YOU to choose where. I\'ve three spots in mind. Go and see each one, then tell me."',
      steps: [{ t: 'survey', sites: [
        { site: 'hertz', min: 700, max: 1000, clear: 320, kind: 'ice', name: 'Shadow Crater', note: 'Water ice under the dark: the town\'s bank fills faster. But the dark side is pirate country.' },
        { site: 'aldrin', min: 800, max: 1100, clear: 320, kind: 'plain', name: 'Sunlit Plain', note: 'Flat, bright and right by the traffic lanes: a busy, easy place to live.' },
        { site: 'kepler', min: 900, max: 1200, clear: 320, kind: 'ridge', name: 'High Ridge', note: 'You can see half the Moon from up there: the town\'s guns and radio reach further.' },
      ], hold: 3, label: 'Survey the three sites' }],
      reward: { credits: 780, vehicle: 'mule' },
      outro: '"A fine choice. I\'ve sent you a Homestead Mule for the hauling to come. Press V. Now: the town core."',
    },
    {
      title: 'Founding Day',
      brief: '"Haul the town core out to your site and we\'ll lay the founding stone. Every raider on this side of the Moon will want to crash the party, so the militia\'s coming too."',
      steps: [
        { t: 'build', from: 'kepler', site: { chosen: true }, trips: 3, found: { kind: 'homestead', name: 'town' }, label: 'Haul the town core to your site' },
        { t: 'defend', at: { prev: true }, secs: 60, hp: 900, prop: 'ballot', foe: 'rustmoon', garrisonAt: 20, label: 'Keep the founding ceremony safe' },
      ],
      reward: { credits: 1200 },
      outro: '"The stone is laid! Now it needs the Charter: every Kepler town signs, and then it\'s a town, and you\'re its Councillor."',
    },
    {
      title: 'The Charter',
      brief: '"Ride round the towns and collect their signatures, then come home for the signing. When the ink\'s dry, the Moon Council will meet in YOUR hall. Mind you, they\'ll expect you to lead it."',
      steps: [
        { t: 'relays', sites: [{ locOpen: 'tranq' }, { locOpen: 'aldrin' }, { locOpen: 'twilight' }, { locOpen: 'hertz' }], hold: 3, prop: 'ballot', label: 'Collect the towns\' signatures' },
        { t: 'goto', at: { chosen: true }, r: 40, label: 'Ride home for the signing' },
      ],
      reward: { credits: 1800, outfit: 'kepler2', rep: 15, world: 'hometown' },
      outro: '"Signed, sealed and yours. Councillor. Oh, I like the sound of that. Take Gran\'s best coat, dear: you\'ll be on the news."',
      final: true,
    },
  ],
  meridian: [
    {
      title: 'Sensor Net',
      brief: '"Information is money, Runner. Plant three sensor relays around the Exchange. Quickly. Time is also money."',
      steps: [{ t: 'relays', sites: [{ site: 'meridian', min: 400, max: 700 }, { site: 'meridian', min: 500, max: 800 }, { site: 'meridian', min: 600, max: 900 }], hold: 3, prop: 'sensor', label: 'Plant sensor relays' }],
      reward: { credits: 420, outfit: 'meridian' },
      outro: '"Data is flowing. Consider yourself retained by Meridian. Exclusively."',
    },
    {
      title: 'Flash Crash',
      brief: '"The Shackleton array has just seen something the market hasn\'t, and the market finds out in two minutes. Carry the data spike to the Exchange before it does, and keep to the relay gates: they keep the signal clean. Fast, Runner. Faster than that."',
      steps: [{ t: 'gates', from: 'shackleton', to: 'meridian', gates: 8, pace: 40, label: 'Race the data spike to the Exchange' }],
      reward: { credits: 660, vehicle: 'van' },
      outro: '"Two seconds ahead of the market. Do you know what two seconds is worth? Neither do you. Take a Courier Light-Bike, so you\'re never late again. Press V."',
    },
    {
      title: 'Handle With Care',
      brief: '"Dr. Zbornak has a sample we\'ve licensed. Antimatter. In a jar. Bring it to the Exchange without dropping it, and Meridian will be very grateful."',
      steps: [{ t: 'carry', from: 'antimatter', to: { loc: 'meridian' }, fragile: 22, label: 'Carry the antimatter sample', cargo: 'ANTIMATTER SAMPLE' }],
      reward: { credits: 900, tech: 'teleport', upgrade: ['uplink', 1] },
      outro: '"Delivered, and nobody evaporated. The labs have fitted you with a Personal Teleporter: press T. A business expense."',
    },
    {
      title: 'Launch Window',
      brief: '"Our scientists have found something orbiting the Moon: an asteroid seven kilometres long, rolling on its axis, and every time it passes over the Monolith, the Monolith hums. We\'re building a launch complex beside it. Haul the parts, then tune the Monolith so we know what we\'re aiming at."',
      steps: [
        { t: 'build', from: 'meridian', site: { loc: 'monolith', off: [1.25, 0] }, trips: 3, found: { kind: 'launch' }, label: 'Haul the launch complex to the Monolith' },
        { t: 'relays', sites: [{ loc: 'monolith', off: [0.5, 0.15] }, { loc: 'monolith', off: [-0.3, 0.4] }, { loc: 'monolith', off: [-0.3, -0.4] }], hold: 4, prop: 'sensor', label: 'Tune the Monolith\'s resonance' },
      ],
      reward: { credits: 1500, upgrade: ['gyro', 1] },
      outro: '"It answered. The asteroid has a heart, Runner: a core that hums at the Monolith\'s pitch. Meridian calls it the Spindle, and Meridian wants that core. The rocket is fuelled."',
    },
    {
      title: 'The Spindle',
      brief: '"Our rocket puts you down at one end of the Spindle; the core is at the other, seven kilometres of rolling rock away. Bring it back. Our telemetry shows… something else up there. We\'d rather not speculate. Go."',
      steps: [
        { t: 'goto', at: { loc: 'monolith', off: [1.25, 0] }, r: 24, label: 'Get to the launch complex' },
        { t: 'spindle', label: 'Cross the Spindle and bring back its core' },
      ],
      reward: { credits: 3600, tech: 'vanes', outfit: 'meridian2', rep: 15, world: 'quantum' },
      outro: '"The core is in the vault and the board is ecstatic. We tuned a sliver of its field into your skates: Quantum Slipstream Vanes. They keep a grip on the air itself, Runner, so you can steer mid-flight. And the Gilded Executive. You\'ve made us very, very rich."',
      final: true,
    },
  ],
  rustmoon: [
    {
      title: 'Ship Shape',
      brief: '"So you\'re the runner everyone\'s whispering about. SPACECOM\'s got a depot sitting on our side of the line. Take it, with a few of my lads for company. Show me you\'ve got teeth."',
      steps: [{ t: 'capture', at: { outpost: 'spacecom', near: 'rustmoon' }, guards: 4, hold: 20, foe: 'spacecom', backup: 2, label: 'Take the SPACECOM depot', war: 'spacecom' }],
      reward: { credits: 480, outfit: 'rustmoon' },
      outro: '"Ha! That\'s a pirate\'s work. You ride with ME now. SPACECOM won\'t forget your face. Neither will I."',
    },
    {
      title: 'The Convoy',
      brief: '"An armoured convoy runs a loop past Farside every night: a SPACECOM hauler the size of a house and its escorts. Crack the big one open and I\'ll give you one of ours."',
      steps: [{ t: 'boss', at: { site: 'farside', min: 500, max: 800 }, boss: { name: 'SPACECOM ARMOURED CONVOY', hp: 1200, model: 'convoy' }, foe: 'spacecom', escort: 2, label: 'Crack the armoured convoy' }],
      reward: { credits: 720, weapon: 'mortar' },
      outro: '"Now THAT was music. Take a Junk Mortar: lob scrap, watch it go boom. Key 4."',
    },
    {
      title: 'Lights Out',
      brief: '"SPACECOM holds the dark side from three towns: the Farside listening post and the waystations at Twilight and Hertzsprung. Plant a charge in the heart of each. Their guns will wake up, so be quick. When they go up, my clans move in and those towns are ours."',
      steps: [{ t: 'relays', sites: [{ locOpen: 'farside' }, { locOpen: 'twilight' }, { locOpen: 'hertz' }], hold: 4, guards: 3, foe: 'spacecom', prop: 'charge', label: 'Plant charges in the three towns', charge: true, rouse: true }],
      reward: { credits: 900, rep: 10, vehicle: 'warrig', tech: 'shield', world: 'pirateTowns', towns: ['farside', 'twilight', 'hertz'] },
      outro: '"Boom, boom, boom. Beautiful. The clans are already moving in: Farside, Twilight and Hertzsprung fly our colours now. Take a Scrapjaw War-Rig: it rams. Press V. And a Deflector we lifted off a SPACECOM convoy. One more job, Runner. The big one."',
    },
    {
      title: 'The Big Score',
      brief: '"Meridian keeps a vault cube at the Exchange. Grab it, run it home to Rustmoon Hold, and don\'t you dare crack it. Every gun on the Moon will be pointed at you."',
      steps: [
        { t: 'carry', from: 'meridian', to: { loc: 'rustmoon' }, fragile: 30, label: 'Run the vault cube to Rustmoon Hold', cargo: 'MERIDIAN VAULT CUBE', chase: true, chaseFoes: ['meridian', 'spacecom'] },
      ],
      reward: { credits: 1800, rep: 15, upgrade: ['shadow', 1] },
      outro: '"THE BIG SCORE! Ha! You\'re a Dread Captain now, Runner. And a Dread Captain gets the last word on the plan. Come see me. We\'re going for the crown."',
    },
    {
      title: 'Lawless Moon',
      brief: '"The International Moon Base. SPACECOM\'s heart. Every clan I\'ve got hits it at once and you lead the charge: kill its big guns, take the plaza, and the Moon has no law but ours."',
      steps: [{ t: 'assault', at: { loc: 'ilmb' }, loc: 'ilmb', holdOff: [0, 100], guns: 6, hold: 40, foe: 'spacecom', backup: 7, reinforce: 1, label: 'Storm the International Moon Base' }],
      reward: { credits: 3600, outfit: 'rustmoon2', rep: 20, world: 'lawless' },
      outro: '"The ILMB is OURS. Hear that, Runner? That\'s a Moon with nobody left to stop us. Long live the clans."',
      final: true,
    },
  ],
};

const _v = new THREE.Vector3();

export class Story {
  constructor(game) {
    this.game = game;
    this.faction = null; // the story you're committed to
    this.progress = {}; // faction -> chapters completed
    this.vehicles = [];
    this.tech = [];
    this.founded = []; // outpost ids you founded
    this.capturedIds = [];
    this.townSite = null; // Kepler: { dir, kind, name, outpost } once surveyed
    this.kade = { met: 0, beaten: 0, captured: false, nextAt: 0 };
    this.active = null;
    this.leaders = {};
    this.techCd = { dash: 0, shield: 0, teleport: 0 };
    this.load();
    this.buildLeaders();
    this.buildUI();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d) return;
      Object.assign(this, { faction: d.faction || null, progress: d.progress || {}, vehicles: d.vehicles || [], tech: d.tech || [], founded: d.founded || [], capturedIds: d.capturedIds || [] });
      Object.assign(this.kade, d.kade || {});
      this.townSite = d.townSite || null;
      // (the Meridian finale used to give Quantum-Lock Delivery: those saves get its replacement)
      if (this.game.ws && this.game.ws.quantum && !this.tech.includes('vanes')) this.tech.push('vanes');
    } catch { /* new story */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ faction: this.faction, progress: this.progress, vehicles: this.vehicles, tech: this.tech, founded: this.founded, capturedIds: this.capturedIds, kade: this.kade, townSite: this.townSite })); } catch { /* unavailable */ }
  }

  chaptersDone(f) { return this.progress[f] || 0; }

  // ---------- leaders ----------
  buildLeaders() {
    const g = this.game;
    for (const [f, L] of Object.entries(LEADERS)) {
      const loc = g.locations.find((l) => l.id === FACTIONS[f].hq);
      if (!loc) continue;
      const m = makeRunner({ ...L.look, pirate: f === 'rustmoon' });
      if (f === 'rustmoon') this.addRifle(m, true);
      const spot = this.findSpot(loc);
      g.world.put(m.root, loc, spot.x, spot.z, 0, Math.atan2(-spot.x, -spot.z), true);
      m.root.scale.setScalar(1.15);
      // a little podium + name plate
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.4, 16), toon(new THREE.Color(FACTIONS[f].color).getHex()));
      ink(pod, 0.05);
      g.world.put(pod, loc, spot.x, spot.z, 0.2);
      m.root.position.y = 0.4;
      const sign = nameTag(textSprite(L.name.toUpperCase(), { color: FACTIONS[f].color, size: 52, scale: 0.5, bg: '#120a1e' }), L.name.toUpperCase(), FACTIONS[f].color);
      sign.position.set(spot.x, 4.0, spot.z);
      loc.group.add(sign);
      // faction-coloured beacon: a glowing ring on the ground and a soft light column you can spot from afar
      const fc = new THREE.Color(FACTIONS[f].color).getHex();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 40), glow(fc));
      ring.rotation.x = Math.PI / 2;
      g.world.put(ring, loc, spot.x, spot.z, 0.15, 0, true);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 40, 20, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: fc, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      g.world.put(beam, loc, spot.x, spot.z, 0, 0, true);
      loc.group.updateMatrixWorld(true);
      for (const o of [m.root, sign, pod, ring, beam]) o.userData.keep = true; // (world.rebuildLocation)
      this.leaders[f] = { f, loc, model: m, sign, pod, ring, beam, pos: g.world.toWorld(loc, spot.x, 1, spot.z), t: Math.random() * 5 };
      // a leader whose faction the story has ended (conquered, dismantled, fallen) isn't there at all
      m.root.visible = sign.visible = ring.visible = beam.visible = pod.visible = this.leaderVisible(f);
    }
  }

  // An open, visible spot for a leader: well clear of buildings (so the name sign never clips),
  // just off to the side of where you usually arrive (not blocking the path in).
  findSpot(loc) {
    const g = this.game;
    const cands = [];
    const r0 = Math.max(24, loc.r * 0.3), r1 = Math.min(loc.r * 0.78, 150);
    for (let rad = r0; rad <= r1; rad += 8) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        cands.push({ x: Math.sin(a) * rad, z: Math.cos(a) * rad, score: Math.abs(Math.abs(a > Math.PI ? a - Math.PI * 2 : a) - 0.5) + Math.abs(rad - (r0 + r1) / 2) / 60 });
      }
    }
    cands.sort((p, q) => p.score - q.score);
    for (const c of cands) {
      let blocked = false;
      for (const y of [1.2, 3.5, 6]) {
        const p = g.world.toWorld(loc, c.x, y, c.z);
        if (g.colliders.query(p, 9, []).some((col) => g.colliders.contact(col, p, 8, _v) > 0)) { blocked = true; break; }
      }
      if (!blocked) return c;
    }
    return { x: 0, z: Math.min(loc.r * 0.6, 90) };
  }

  addRifle(m, slung) {
    const rifle = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 2.1), toon(0x221d33));
    ink(barrel, 0.03);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6).rotateX(Math.PI / 2), toon(0x3a3550));
    scope.position.set(0, 0.14, 0.1);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), glow(0xff2a3a));
    lens.position.set(0, 0.14, 0.42);
    rifle.add(barrel, scope, lens);
    if (slung) { rifle.position.set(0.1, 0.6, -0.42); rifle.rotation.set(0.2, 0, 0.9); m.torso.add(rifle); }
    else { rifle.position.set(0, -0.55, 0.8); m.armR.add(rifle); }
    // a long coat
    const coat = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), toon(0x111111, { side: THREE.DoubleSide }));
    coat.position.set(0, 0.25, -0.4);
    coat.rotation.x = 0.2;
    m.torso.add(coat);
    m.coat = coat;
    return rifle;
  }

  leaderVisible(f) {
    const F = FACTIONS[f];
    if (F.absorbedBy || F.gone || F.fallen) return false;
    if (f !== 'rustmoon') return true;
    const r = this.game.rep;
    return r.rustmoon !== 'unknown' && r.rustmoon !== 'locked' && r.get('rustmoon') >= 10 && !this.kade.captured;
  }

  // F near a leader or one of your outposts' terminals. Returns true if it set a prompt.
  interact(P) {
    const g = this.game;
    for (const L of Object.values(this.leaders)) {
      L.model.root.visible = this.leaderVisible(L.f);
      L.sign.visible = L.ring.visible = L.beam.visible = L.pod.visible = L.model.root.visible;
      if (!L.model.root.visible || !L.loc.active || P.pos.distanceTo(L.pos) > 6) continue;
      g.hud.prompt(`<b>F</b> — TALK TO ${LEADERS[L.f].name.toUpperCase()}`);
      if (g.input.pressed('KeyF') && g.boardCooldown <= 0) this.talk(L.f);
      return true;
    }
    for (const o of this.myOutposts()) {
      if (!o.terminal || !o.model || P.pos.distanceTo(o.terminal) > 4.5) continue;
      g.hud.prompt(`<b>F</b> — ${g.territory.name(o).toUpperCase()} TERMINAL`);
      if (g.input.pressed('KeyF') && g.boardCooldown <= 0) this.outpostMenu(o);
      return true;
    }
    return false;
  }

  talk(f) {
    const g = this.game;
    const L = LEADERS[f];
    const done = this.chaptersDone(f);
    const chapters = CHAPTERS[f];
    const name = `${L.name.toUpperCase()}`;
    const sub = `<small>${L.title}</small><br><br>`;
    if (this.faction && this.faction !== f) {
      const other = FACTIONS[this.faction].name;
      g.dialog(name, `${sub}${pick([`"You run for ${other} now. We have nothing to discuss."`, `"I don't hire ${other}'s errand runners. Off you go."`, `"Interesting choice, ${other}. We'll see how that works out for you."`])}`, [{ label: 'FAIR ENOUGH' }]);
      return;
    }
    if (this.active && this.active.f === f) {
      const ch = this.active.def;
      g.dialog(name, `${sub}"${ch.title}. You know what to do." <br><small>${this.status()}</small>`, [
        { label: '1 · ON IT' },
        { label: '2 · ABANDON THIS CHAPTER', fn: () => this.fail('Chapter abandoned. Talk to me when you\'re ready to try again.') },
      ]);
      return;
    }
    if (done >= chapters.length) {
      g.dialog(name, `${sub}"${pick(['The Moon owes you, Runner.', 'Legends don\'t need errands. Go enjoy it.', 'You did it. Now go cause some trouble.'])}"<br><br><small>Story complete: ${chapters.length}/${chapters.length} chapters.</small>`, [{ label: 'THANKS' }]);
      return;
    }
    const need = REQ[done];
    const rep = g.rep.get(f);
    if (rep < need) {
      const tier = need >= 25 ? 'TRUSTED' : 'FRIENDLY';
      g.dialog(name, `${sub}"${done ? 'Not yet. Do some more work for us first.' : `Who are you? Come back when ${FACTIONS[f].name} knows your name.`}"<br><br><small>Next chapter needs ${need} reputation with ${FACTIONS[f].name} (you have ${rep}). Contracts and events raise it.${tier ? '' : ''}</small>`, [{ label: 'OK' }]);
      return;
    }
    if (this.active) { g.dialog(name, `${sub}"Finish what you're doing for ${FACTIONS[this.active.f].name} first."`, [{ label: 'OK' }]); return; }
    const ch = chapters[done];
    const warn = !this.faction ? '<br><br><b style="color:#ff2a4a">Finishing this chapter commits you to this story: the other leaders will stop offering you theirs.</b>' : '';
    g.dialog(`${name} · CHAPTER ${done + 1}`, `${sub}<b>${ch.title}</b><br>${ch.brief}${warn}`, [
      { label: '1 · I\'M IN', fn: () => this.start(f, done) },
      { label: '2 · NOT YET' },
    ]);
  }

  // ---------- running a chapter ----------
  start(f, idx) {
    const g = this.game;
    const def = CHAPTERS[f][idx];
    if (f === 'meridian' && idx >= 4) this.ensureLaunchPad();
    this.active = { f, idx, def, si: -1, steps: def.steps.map((s) => ({ ...s })), t: 0, units: [], props: [] };
    g.hud.alert(`★ ${FACTIONS[f].name.toUpperCase()}: ${def.title.toUpperCase()}`, FACTIONS[f].color, 3.5);
    g.audio.pickup();
    this.next();
  }

  // Resolve a site selector into a position (+ the outpost it refers to, if any).
  resolve(sel, step) {
    const g = this.game;
    const T = g.territory;
    const A = this.active;
    const locOf = (id) => g.locations.find((l) => l.id === id);
    if (!sel) return null;
    if (sel.prev) return A.lastAt;
    if (sel.chosen) {
      if (!this.townSite) this.defaultTownSite();
      const d = new THREE.Vector3().fromArray(this.townSite.dir);
      return { pos: g.planet.ground(d, new THREE.Vector3()) };
    }
    if (sel.locOpen) { const l = locOf(sel.locOpen); const sp = this.findSpot(l); return { pos: g.planet.ground(g.world.toWorld(l, sp.x, 0, sp.z), new THREE.Vector3()), loc: l }; }
    if (sel.loc && sel.off) { const l = locOf(sel.loc); return { pos: g.planet.ground(g.world.toWorld(l, l.r * sel.off[0], 0, l.r * sel.off[1]), new THREE.Vector3()), loc: l }; }
    if (sel.loc) { const l = locOf(sel.loc); return { pos: l.pos.clone(), loc: l }; }
    if (sel.outpost || sel.outpostAny) {
      const ref = locOf(sel.near) || { dir: g.player.pos.clone().normalize() };
      const want = sel.outpost || sel.outpostAny;
      const pool = T.outposts.filter((x) => x.faction === want && !x.built).sort((a, b) => arcDist(ref.dir, a.dir) - arcDist(ref.dir, b.dir)).slice(0, 4);
      let o = pool.sort((a, b) => this.roughness(a.dir) - this.roughness(b.dir))[0] || null;
      if (!o) o = T.nearest(ref.dir, (x) => !x.built && x.faction !== A.f);
      if (!o) return this.resolve({ site: sel.near || 'ilmb', min: 400, max: 700 });
      return { pos: g.planet.ground(o.dir, new THREE.Vector3()), outpost: o };
    }
    if (sel.captured) {
      const o = T.outposts.find((x) => x.id === this.capturedIds[this.capturedIds.length - 1]) || T.nearest(g.player.pos.clone().normalize(), (x) => x.faction === A.f);
      if (!o) return { pos: g.player.pos.clone() };
      return { pos: g.planet.ground(o.dir, new THREE.Vector3()), outpost: o };
    }
    if (sel.founded || sel.foundedIdx !== undefined) {
      let mine = this.myOutposts();
      if (!mine.length) {
        const r = this.resolve({ site: 'kepler', min: 600, max: 900, clear: 220 });
        const o2 = g.territory.found(r.pos.clone().normalize(), 'kepler', 'homestead', 'Pike\'s Hope');
        this.founded.push(o2.id);
        this.save();
        mine = this.myOutposts();
      }
      const o = sel.foundedIdx !== undefined ? mine[sel.foundedIdx] || mine[0] : mine[mine.length - 1];
      if (!o) return { pos: g.player.pos.clone() };
      return { pos: g.planet.ground(o.dir, new THREE.Vector3()), outpost: o };
    }
    if (sel.site) {
      // the flattest of a dozen candidates: fights on a crater's rim or a slope were clunky
      const l = locOf(sel.site);
      const clear = sel.clear || 150;
      let best = null, bestScore = Infinity;
      for (let tries = 0, ok = 0; tries < 90 && ok < 12; tries++) {
        const dist = sel.min + Math.random() * (sel.max - sel.min);
        const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), l.dir).normalize();
        const d = greatCircle(l.dir, t, dist);
        if (g.locations.some((x) => arcDist(d, x.dir) < (x.zoneR || x.r) + clear)) continue;
        if (T.outposts.some((o) => arcDist(d, o.dir) < 120)) continue;
        if (g.world.lakes.some((lk) => arcDist(d, lk.d) < lk.rad + 30)) continue;
        ok++;
        const sc = this.roughness(d);
        if (sc < bestScore) { bestScore = sc; best = d; }
      }
      if (best) return { pos: g.planet.ground(best, new THREE.Vector3()) };
      return { pos: g.planet.ground(greatCircle(l.dir, tangent(new THREE.Vector3(1, 0, 0), l.dir).normalize(), sel.min), new THREE.Vector3()) };
    }
    return null;
  }

  next() {
    const g = this.game;
    const A = this.active;
    this.clearStep();
    A.si++;
    if (A.si >= A.steps.length) { this.complete(); return; }
    const s = A.steps[A.si];
    s.phase = 'go';
    s.prog = 0;
    s.timer = s.secs || 0;
    if (s.at) { const r = this.resolve(s.at, s); if (r) { s.pos = r.pos; s.outpost = r.outpost; A.lastAt = r; } }
    if (s.site) { const r = this.resolve(s.site, s); s.pos = r.pos; A.lastAt = r; }
    if (s.t === 'relays') { const rs = s.sites.map((x) => this.resolve(x, s)); s.list = rs.map((r) => r.pos); s.outs = rs.map((r) => r.outpost || null); s.locs = rs.map((r) => r.loc || null); s.guarded = []; s.k = 0; s.pos = s.list[0]; }
    if (s.t === 'gates') { s.fromLoc = g.locations.find((l) => l.id === s.from); s.toLoc = g.locations.find((l) => l.id === s.to); s.phase = 'fetch'; }
    if (s.t === 'survey') { s.list = s.sites.map((x) => this.resolve(x, s).pos); s.k = 0; s.pos = s.list[0]; }
    if (s.t === 'assault') { s.locRef = g.locations.find((l) => l.id === s.loc); s.phase = 'go'; s.prog = 0; }
    if (s.t === 'experiment' && s.nodes) { s.got = 0; }
    if (s.t === 'build' || s.t === 'carry') { s.fromLoc = g.locations.find((l) => l.id === s.from); s.phase = 'fetch'; s.trip = 0; }
    if (s.t === 'carry') { const r = this.resolve(s.to, s); s.dest = r.pos; s.destLoc = r.loc || null; }
    if (s.t === 'kade') { s.unit = this.spawnKade(true); }
    this.setMarker(this.stepTarget(s));
  }

  stepTarget(s) {
    if (!s) return null;
    if (s.t === 'gates') return s.phase === 'fetch' ? s.fromLoc.pos : s.k < s.gateList.length ? s.gateList[s.k].pos : s.toLoc.pos;
    if (s.t === 'spindle') return null;
    if ((s.t === 'build' || s.t === 'carry') && s.phase === 'fetch') return s.fromLoc.pos;
    if (s.t === 'carry') return s.dest;
    if (s.t === 'kade') return s.unit && !s.unit.dead ? s.unit.body.pos : null;
    return s.pos;
  }

  setMarker(pos) {
    const g = this.game;
    if (!this.marker) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 10, 1, true).translate(0, 80, 0), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      g.scene.add(m);
      this.marker = m;
    }
    this.marker.visible = !!pos;
    if (pos) {
      this.marker.position.copy(pos);
      this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
      this.marker.material.color.set(FACTIONS[this.active.f].color);
    }
  }

  clearStep() {
    const g = this.game;
    const A = this.active;
    if (!A) return;
    for (const p of A.props) p.removeFromParent();
    A.props = [];
    if (A.obj) { g.events.protect = g.events.protect.filter((o) => o !== A.obj); A.obj = null; }
    if (A.carrying) { g.player.setCargo(null); A.carrying = false; }
  }

  // the chapter's over (won or lost): stand the backup down, let stormed bases re-man their guns
  teardown() {
    const g = this.game;
    g.enemies.removeAllies();
    for (const b of g.enemies.bases) b.assault = false;
    for (const l of g.enemies.lairs) if (l.core) l.core.assaultTarget = false;
  }

  complete() {
    const g = this.game;
    const A = this.active;
    const f = A.f;
    const def = A.def;
    this.clearStep();
    this.teardown();
    this.setMarker(null);
    this.active = null;
    this.progress[f] = A.idx + 1;
    const first = !this.faction;
    if (first) this.faction = f;
    const r = def.reward;
    if (r.credits) g.addCredits(r.credits, 'Story');
    g.rep.add(f, r.rep || 8, `Story: ${def.title}`);
    const unlocks = [];
    if (r.vehicle && !this.vehicles.includes(r.vehicle)) { this.vehicles.push(r.vehicle); unlocks.push(`Vehicle: ${VEHICLES[r.vehicle].name} (V)`); }
    if (r.tech && !this.tech.includes(r.tech)) { this.tech.push(r.tech); unlocks.push(`Tech: ${TECH[r.tech].name}${TECH[r.tech].key !== '—' ? ` (${TECH[r.tech].key})` : ''}`); }
    if (r.outfit) { g.upgrades['outfit_' + r.outfit] = 1; unlocks.push('Outfit added to your wardrobe (C)'); }
    if (r.module) { for (const o of this.myOutposts().slice(-1)) if (!o.modules.includes(r.module)) o.modules.push(r.module); unlocks.push(`Free ${MODULES[r.module].name} at your newest outpost`); this.refreshOutposts(); }
    if (r.everyModule) { for (const o of this.myOutposts()) if (!o.modules.includes(r.everyModule)) o.modules.push(r.everyModule); this.refreshOutposts(); unlocks.push(`A ${MODULES[r.everyModule].name} at every homestead`); }
    const WNAME = { rail: 'Daedalus Rail Lance (key 3)', scatter: 'Vostok Scattergun (key 2)', mortar: 'Rustmoon Junk Mortar (key 4)' };
    if (r.weapon && !g.upgrades[r.weapon]) { g.upgrades[r.weapon] = 1; g.player.applyUpgrades(g.upgrades); unlocks.push(`Weapon: ${WNAME[r.weapon] || r.weapon}`); }
    if (r.upgrade) {
      const [key, lvl] = r.upgrade;
      const UNAME = { seeker: 'SPACECOM Seeker Module', flak: 'Vostok Flak Weave', overcharge: 'Daedalus Overcharger', dampers: 'Mag-Cushion Dampers', uplink: 'Meridian Market Uplink', gyro: 'Meridian Gyro-Edges', shadow: 'Rustmoon Shadow Rig' };
      if ((g.upgrades[key] || 0) < lvl) { g.upgrades[key] = lvl; g.player.applyUpgrades(g.upgrades); unlocks.push(`Upgrade: ${UNAME[key] || key} (level ${lvl})`); }
    }
    const dawn = this.worldReward(r, unlocks);
    this.save();
    g.save();
    g.style(80, 'CHAPTER COMPLETE');
    g.actionPanel('delivered', null, `${def.title.toUpperCase()} — COMPLETE!`);
    g.audio.cash();
    const lock = first ? `<br><br><b style="color:#ff2a4a">You are now ${LEADERS[f].name}'s runner. The other leaders will remember that.</b>` : '';
    const ul = unlocks.length ? `<br><br>${unlocks.map((u) => `★ ${u}`).join('<br>')}` : '';
    g.dialog(`${LEADERS[f].name.toUpperCase()} (RADIO)`, `${def.outro}${ul}${lock}${def.final ? '<br><br><b>STORY COMPLETE!</b>' : `<br><br><small>Next chapter at ${REQ[A.idx + 1]} reputation.</small>`}`,
      [{ label: dawn ? 'ROGER THAT · ONE WEEK LATER…' : 'ROGER THAT' }]);
    // the cut runs as soon as the dialog is closed, however it's closed (Story.update)
    if (dawn) this.pendingDawn = dawn;
  }

  // A chapter whose ending changes the Moon. Small changes happen on the spot; a finale's are
  // written to the world state and the game cuts to "one week later" and rebuilds the Moon.
  // Returns the cut (a function) when there is one.
  worldReward(r, unlocks) {
    const g = this.game;
    const ws = g.ws;
    if (!r.world) return null;
    if (r.world === 'lightsOut') {
      // the crews build on the rubble: the razed outposts are Rustmoon's now
      for (const id of ws.razed || []) {
        const o = g.territory.outposts.find((x) => x.id === id);
        if (!o) continue;
        o.razed = false;
        o.kind = o.kind === 'depot' ? 'junk' : 'shack';
        o.kindChanged = true;
        if (o.model) g.territory.despawn(o);
        g.territory.capture(o, 'rustmoon');
      }
      ws.razed = [];
      saveWorldState(ws);
      unlocks.push('Three new Rustmoon outposts stand where SPACECOM\'s were');
      return null;
    }
    if (r.world === 'blackSun') {
      ws.blackSun = true;
      saveWorldState(ws);
      const l = g.locations.find((x) => x.id === 'daedalus2');
      if (l && !l.blackSun) { l.blackSun = true; g.world.storyMarks(l); }
      unlocks.push('The Black Sun stands at the Forward Post for good');
      return null;
    }
    const L = (id) => g.locations.find((l) => l.id === id);
    // a finale: written down now (so it sticks even if the game is closed), shown after the cut
    let title = null, news = null;
    if (r.world === 'conquer') {
      const win = FACTIONS[this.faction].name, lose = FACTIONS[r.loser].name;
      ws.conquered = { ...(ws.conquered || {}), [r.loser]: this.faction };
      const names = g.locations.filter((l) => l.faction === r.loser).map((l) => l.name).join(', ');
      title = `${lose.toUpperCase()} FALLS TO ${win.toUpperCase()}`;
      news = `<b>${lose.toUpperCase()} IS NO MORE.</b> ${names} now fly ${win}'s flag and their turrets answer to new masters. ${lose}'s shops still trade: your ${win} standing opens them now.<br><br><small>The war between Vostok and Daedalus is over.</small>`;
    } else if (r.world === 'piratesGone') {
      ws.piratesGone = true;
      title = 'THE RUSTMOON CLANS ARE FINISHED';
      news = `<b>SPACECOM HOLDS THE DARK SIDE.</b> Rustmoon Hold is a ruin under a SPACECOM flag; ${['gulch', 'blackrock', 'gloom'].map((id) => L(id) && L(id).name).filter(Boolean).join(', ')} have been resettled by Kepler families, and the camps stand empty. No pirate squads roam the Moon any more.<br><br><small>Renegades still turn up for the odd job. The Moon is quieter, not empty.</small>`;
    } else if (r.world === 'hometown' && this.townSite) {
      const t = this.townSite;
      ws.town = { dir: t.dir, name: t.name, kind: t.kind, slots: Array(8).fill(null), bank: 0, replaces: t.outpost };
      ws.council = { passed: [], next: 0 };
      this.founded = this.founded.filter((id) => id !== t.outpost);
      this.save();
      title = `${t.name.toUpperCase()} IS FOUNDED`;
      news = `<b>THE MOON HAS A NEW TOWN, AND A COUNCIL.</b> ${t.name} has its charter, and you are its Councillor. The Moon Council (SPACECOM, Vostok, Daedalus, Meridian and Kepler) now sits in ${t.name}'s hall.<br><br><small>Fill your town's eight plots from the hall's terminal. Call council votes there too: every member votes with you more readily the better its standing with you, and a motion that carries changes the Moon.</small>`;
    } else if (r.world === 'quantum') {
      ws.quantum = true; // (the core is home: it glows in the Spindle up in the sky)
      saveWorldState(ws);
      return null;
    } else if (r.world === 'pirateTowns') {
      ws.pirateTowns = [...new Set([...(ws.pirateTowns || []), ...r.towns])];
      title = 'THE DARK SIDE BURNS';
      news = `<b>THE CLANS HAVE MOVED IN.</b> ${r.towns.map((id) => L(id) && L(id).name).filter(Boolean).join(', ')} are Rustmoon dens now: SPACECOM's listening post and two Kepler waystations, rebuilt from the wreckage under black-and-green flags.<br><br><small>You ride with the clans, so their guns are yours. Everyone else would do well to steer clear.</small>`;
    } else if (r.world === 'lawless') {
      ws.lawless = true;
      title = 'THE INTERNATIONAL MOON BASE HAS FALLEN';
      news = `<b>THE MOON HAS NO LAW.</b> The ILMB flies the clans' black and green, SPACECOM's guns are silent everywhere and its outposts are Rustmoon's. Nobody is coming to stop a pirate any more.<br><br><small>The ILMB's docks and shops still trade: they just answer to Captain Kade now.</small>`;
    }
    if (!title) return null;
    ws.bulletin = news;
    saveWorldState(ws);
    return () => g.newDawn(title, news);
  }

  // A charge brought a SPACECOM outpost down (Lights Out): rubble, for good, until your crews build.
  raze(o) {
    const g = this.game;
    o.razed = true;
    g.ws.razed = [...new Set([...(g.ws.razed || []), o.id])];
    saveWorldState(g.ws);
    if (o.model) { g.territory.despawn(o); g.territory.spawn(o); }
    g.hud.alert(`${g.territory.name(o).toUpperCase()} DESTROYED`, '#7dff3a', 3);
  }

  // the phase trial: emitters round the ring, five nodes hanging in the field at flying height
  placeTrial(s) {
    const g = this.game;
    const A = this.active;
    const up = s.pos.clone().normalize();
    const t1 = tangent(new THREE.Vector3(1, 0, 0), up).normalize();
    const t2 = new THREE.Vector3().crossVectors(up, t1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const m = makeProp('emitter');
      m.position.copy(g.planet.ground(s.pos.clone().addScaledVector(t1, Math.cos(a) * 42).addScaledVector(t2, Math.sin(a) * 42), new THREE.Vector3()));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), m.position.clone().normalize());
      g.scene.add(m);
      A.props.push(m);
    }
    s.nodeList = [];
    for (let i = 0; i < s.nodes; i++) {
      const a = (i / s.nodes) * Math.PI * 2 + 0.3;
      const r = 12 + (i % 2) * 14;
      const ground = g.planet.ground(s.pos.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r), new THREE.Vector3());
      const pos = ground.clone().addScaledVector(ground.clone().normalize(), 5 + i * 2.2);
      const m = makeProp('node');
      m.position.copy(pos);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
      m.rotateX(Math.PI / 2);
      g.scene.add(m);
      A.props.push(m);
      s.nodeList.push({ pos, mesh: m, got: false });
    }
  }

  // Jam (Daedalus): reach the post past its guards, plant the jammer at it, keep the jammer alive
  // while waves come for it; then the post is yours.
  updateJam(s, dt) {
    const g = this.game;
    const P = g.player;
    const A = this.active;
    const near = (pos, r) => pos && P.pos.distanceTo(pos) < r;
    if (s.phase === 'go') {
      if (!s.spawned && near(s.pos, 600)) {
        s.spawned = true;
        s.units = this.spawnGuards(s.pos, s.guards, { foe: s.foe });
        if (s.backup && !A.backup) this.spawnBackup(s.backup, s.pos);
      }
      if (near(s.pos, 28)) {
        s.phase = 'jam';
        s.timer = s.secs;
        const m = this.generatorProp(s.pos, 'jammer');
        A.props.push(m);
        const up = s.pos.clone().normalize();
        A.obj = { center: s.pos.clone().addScaledVector(up, 2.5), vel: new THREE.Vector3(), radius: 2.2, hp: s.hp, maxHp: s.hp, dead: false, label: 'JAMMER' };
        g.events.protect.push(A.obj);
        s.waveT = 4;
        g.hud.alert('JAMMER PLANTED — KEEP IT ALIVE!', '#c77dff', 3);
      }
      return;
    }
    if (A.obj.dead) { this.fail('The jammer was destroyed.'); return; }
    s.timer -= dt;
    s.waveT -= dt;
    if (s.waveT <= 0) { s.waveT = 14; this.wave(s.pos, 2 + Math.floor((s.secs - s.timer) / 20), A.obj, 280, s.foe); }
    if (s.timer <= 0) {
      if (!s.outpost) s.outpost = g.territory.found(s.pos, A.f, 'tower', null);
      g.territory.capture(s.outpost, A.f);
      this.capturedIds.push(s.outpost.id);
      if (s.war) g.rep.add(s.war, -6, `Lost an outpost to ${FACTIONS[A.f].name}`);
      g.fx.pop('POST REWRITTEN!', null, { color: '#c77dff', size: 70 });
      g.hud.alert(`${FACTIONS[A.f].name.toUpperCase()} TERRITORY EXPANDS`, FACTIONS[A.f].color, 3);
      this.next();
    }
  }

  // Flash Crash (Meridian): pick up the data spike, then race it to the Exchange through relay gates
  // strung along the way before the market catches up. Every gate passed buys a few seconds.
  updateGates(s, dt) {
    const g = this.game;
    const P = g.player;
    const A = this.active;
    if (s.phase === 'fetch') {
      if (P.pos.distanceTo(s.fromLoc.pos) > Math.min(60, s.fromLoc.r * 0.6)) return;
      // string the gates along the great circle to the Exchange
      const a = s.fromLoc.pos, b = s.toLoc.pos;
      const total = a.distanceTo(b);
      s.gateList = [];
      const free = (d) => {
        // flat ground, out of crater bowls, nothing (a boulder, a building) within a gate's width
        if (this.roughness(d) > 5) return false;
        const gp = g.planet.ground(d, new THREE.Vector3());
        const up = gp.clone().normalize();
        for (const h of [1.5, 5.5, 10]) { const q = gp.clone().addScaledVector(up, h); if (g.colliders.query(q, 9, []).some((c) => g.colliders.contact(c, q, 8, new THREE.Vector3()) > 0)) return false; }
        return true;
      };
      for (let i = 1; i <= s.gates; i++) {
        const t = i / (s.gates + 1);
        const base = a.clone().lerp(b, t).normalize();
        const side = tangent(new THREE.Vector3().crossVectors(a, b), base).normalize();
        // a little weave, nudged sideways (then along) until the spot is clear
        let d = null;
        for (let k = 0; k < 24 && !d; k++) {
          const off = Math.sin(i * 1.7) * 0.012 + (k ? ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 12) / 3600 : 0);
          const c = base.clone().addScaledVector(side, off).normalize();
          if (free(c)) d = c;
        }
        if (!d) d = base;
        g.planet.clearSpot(d); // (no boulder under a gate, whether its chunk is built yet or not)
        const ground = g.planet.ground(d, new THREE.Vector3());
        const up = ground.clone().normalize();
        const fwd = tangent(b.clone().sub(a), up).normalize();
        const m = makeProp('gate');
        m.position.copy(ground);
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, fwd), up, fwd));
        g.scene.add(m);
        A.props.push(m);
        s.gateList.push({ pos: ground.clone().addScaledVector(up, 5.6), mesh: m });
      }
      s.k = 0;
      s.timer = total / s.pace + 12;
      s.secs = s.timer;
      s.phase = 'race';
      P.setCargo(0x2ec4ff);
      A.carrying = true;
      g.hud.alert('THE MARKET OPENS IN TWO MINUTES — GO!', '#2ec4ff', 3);
      g.audio.pickup();
      this.setMarker(this.stepTarget(s));
      return;
    }
    s.timer -= dt;
    if (s.k < s.gateList.length && P.center.distanceTo(s.gateList[s.k].pos) < 11) {
      const gt = s.gateList[s.k];
      gt.mesh.visible = false;
      s.k++;
      s.timer += 3;
      g.fx.pop(`GATE ${s.k}/${s.gateList.length} +3s`, gt.pos.clone(), { color: '#2ec4ff', size: 50 });
      g.audio.tone(700 + s.k * 70, 0.12, 'square', 0.1);
      this.setMarker(this.stepTarget(s));
    }
    if (s.k >= s.gateList.length && P.pos.distanceTo(s.toLoc.pos) < 60) {
      A.carrying = false;
      P.setCargo(null);
      g.fx.pop('AHEAD OF THE MARKET!', null, { color: '#2ec4ff', size: 64 });
      this.next();
      return;
    }
    if (s.timer <= 0) this.fail('The market found out first.');
  }

  // How rough the ground is round a point (height spread over a 45 m ring, plus a penalty for sitting
  // on a crater's rim): mission sites go to the flattest of their candidates.
  roughness(dir) {
    const g = this.game;
    const d = dir.clone().normalize();
    const t1 = tangent(new THREE.Vector3(1, 0, 0), d).normalize(), t2 = new THREE.Vector3().crossVectors(d, t1);
    const R = d.clone().multiplyScalar(3600);
    const h0 = g.planet.surface(R);
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = R.clone().addScaledVector(t1, Math.cos(a) * 45).addScaledVector(t2, Math.sin(a) * 45);
      sum += Math.abs(g.planet.surface(p) - h0);
    }
    let rim = 0;
    for (const c of g.planet.craters || []) {
      if (c.R < 40) continue;
      const k = arcDist(d, c.d) / c.R;
      if (k > 0.7 && k < 1.35) rim = Math.max(rim, 25);
    }
    return sum / 8 + rim;
  }

  // A town site when the survey was skipped (cheats): the first candidate that's well clear.
  defaultTownSite() {
    const r = this.resolve({ site: 'aldrin', min: 800, max: 1100, clear: 320 });
    this.townSite = { dir: r.pos.clone().normalize().toArray(), kind: 'plain', name: 'Pike\'s Landing', outpost: null };
    this.save();
  }

  // The Meridian launch complex beside the Monolith (built in Launch Window; made good if skipped).
  ensureLaunchPad() {
    const g = this.game;
    const ml = g.locations.find((l) => l.id === 'monolith');
    if (!ml || ml.launchPad) return;
    g.ws.launchPad = true;
    saveWorldState(g.ws);
    ml.launchPad = true;
    g.world.storyMarks(ml);
  }

  // Cheats: skip the current step, but do what it would have done (a homestead founded, a site
  // chosen, a post captured, the launch complex built), so later chapters have what they need.
  skipStep() {
    const g = this.game;
    const A = this.active;
    if (!A) return;
    const s = A.steps[A.si];
    if (s.t === 'build' && s.found) {
      if (s.found.kind === 'launch') this.ensureLaunchPad();
      else {
        const town = s.found.name === 'town';
        if (town && !this.townSite) this.defaultTownSite();
        const o = g.territory.found(s.pos.clone().normalize(), A.f, s.found.kind, town ? `${this.townSite.name} (founding)` : s.found.name);
        if (town) this.townSite.outpost = o.id;
        else this.founded.push(o.id);
        A.lastAt = { pos: s.pos.clone(), outpost: o };
      }
    } else if (s.t === 'survey' && !this.townSite) this.defaultTownSite();
    else if ((s.t === 'capture' || s.t === 'jam') && s.outpost) { g.territory.capture(s.outpost, A.f); this.capturedIds.push(s.outpost.id); }
    else if (s.t === 'spindle' && g.spindle.active) { g.spindle.exit(); }
    this.save();
    this.next();
  }

  // Is the current objective close (you're in the fight)? Pirate squads stay away then.
  engaged() {
    const A = this.active;
    if (!A) return false;
    const s = A.steps[A.si];
    const t = this.stepTarget(s) || (s && s.pos);
    return !!t && this.game.player.pos.distanceTo(t) < 900;
  }

  // The on-screen meter for a hold (planting, surveying, holding ground): fraction, label, colour.
  meter() {
    const A = this.active;
    if (!A) return null;
    const s = A.steps[A.si];
    if (!s) return null;
    const col = FACTIONS[A.f].color;
    if ((s.t === 'relays' || s.t === 'survey') && s.prog > 0) return { k: s.prog / (s.hold || 3), label: s.t === 'survey' ? 'SURVEYING' : s.charge ? 'PLANTING THE CHARGE' : s.prop === 'ballot' ? 'COLLECTING SIGNATURES' : 'PLANTING THE SENSOR', col };
    if (s.t === 'capture' && s.phase === 'hold') return { k: s.prog / s.hold, label: 'HOLDING THE OUTPOST', col };
    if (s.t === 'assault' && s.phase === 'hold') return { k: s.prog / s.hold, label: `TAKING ${s.locRef.name.toUpperCase()}`, col };
    if (s.t === 'jam' && s.phase === 'jam') return { k: 1 - Math.max(0, s.timer) / s.secs, label: 'REWRITING THE POST', col };
    if (s.t === 'defend' && A.obj) return { k: 1 - Math.max(0, s.timer) / s.secs, label: 'HOLD ON', col };
    return null;
  }

  // Survey (Kepler): plant a marker at each candidate site, then choose one for your town, and name it.
  updateSurvey(s, dt) {
    const g = this.game;
    const P = g.player;
    const A = this.active;
    if (s.choosing) return;
    if (P.pos.distanceTo(s.pos) < 18) {
      s.prog += dt;
      if (s.prog < (s.hold || 3)) return;
      s.prog = 0;
      A.props.push(this.relayProp(s.pos, 'sensor'));
      const site = s.sites[s.k];
      g.fx.pop(`${site.name.toUpperCase()} SURVEYED`, null, { color: FACTIONS[A.f].color, size: 50 });
      g.hud.toast(`${site.name}: ${site.note}`, 5);
      g.audio.pickup();
      s.k++;
      if (s.k < s.list.length) { s.pos = s.list[s.k]; this.setMarker(s.pos); return; }
      s.choosing = true;
      this.setMarker(null);
      const pickName = (i) => {
        const names = { ice: ['Coldwater', 'Pike\'s Hollow', 'Icefall'], plain: ['Brightfield', 'Pike\'s Landing', 'New Tranquility'], ridge: ['Highwatch', 'Runner\'s Rest', 'Skyline'] }[s.sites[i].kind];
        g.dialog('NAME YOUR TOWN', `<small>${s.sites[i].name}. What will the Moon call it?</small>`, names.map((n, j) => ({
          label: `${j + 1} · ${n.toUpperCase()}`,
          fn: () => {
            this.townSite = { dir: s.list[i].clone().normalize().toArray(), kind: s.sites[i].kind, name: n, outpost: null };
            this.save();
            g.hud.alert(`${n.toUpperCase()}: THE SITE IS CHOSEN`, FACTIONS[A.f].color, 3);
            s.choosing = false;
            this.next();
          },
        })));
      };
      g.dialog('CHOOSE YOUR TOWN\'S SITE', s.sites.map((x) => `<b>${x.name}</b>: ${x.note}`).join('<br><br>'), s.sites.map((x, i) => ({ label: `${i + 1} · ${x.name.toUpperCase()}`, fn: () => pickName(i) })));
    } else s.prog = Math.max(0, s.prog - dt);
  }

  gunsDown(s) { return s.base ? s.base.turrets.filter((t) => t.dead).length : 0; }

  // Assault: storm a settlement with your backup. Approach; break its guns (or its command pylon)
  // while its troops pour in; then hold its centre.
  updateAssault(s, dt) {
    const g = this.game;
    const P = g.player;
    const A = this.active;
    const near = (pos, r) => pos && P.pos.distanceTo(pos) < r;
    const L = s.locRef;
    if (s.phase === 'go') {
      if (!near(s.pos, 750)) return;
      s.phase = 'break';
      s.base = g.enemies.bases.find((b) => b.loc === L) || null;
      if (s.core) {
        s.coreE = L.core;
        if (s.coreE) { s.coreE.assaultTarget = true; if (s.coreE.dead) g.enemies.revive(s.coreE); L.destroyedUntil = 0; }
      } else if (s.base) {
        s.base.assault = true;
        s.need = Math.min(s.guns || 5, s.base.turrets.length);
      } else s.need = 0;
      this.spawnBackup(s.backup || 3, s.pos);
      s.waveT = 3;
      s.reinforceT = s.reinforce !== undefined ? 70 : 40;
      g.hud.alert(`ASSAULT ON ${L.name.toUpperCase()}!`, FACTIONS[A.f].color, 4);
      g.cam.shake = 0.8;
      g.audio.alarm();
      return;
    }
    // their troops keep coming, at you and your backup alike
    s.waveT -= dt;
    if (s.waveT <= 0) { s.waveT = s.phase === 'hold' ? 15 : 20; this.wave(s.pos, s.phase === 'hold' ? 4 : 3, null, 240, s.foe); }
    // and more of yours, when the line gets thin
    s.reinforceT -= dt;
    if (s.reinforceT <= 0) {
      s.reinforceT = s.reinforce !== undefined ? 70 : 35;
      if (g.enemies.allies().length < 3) { A.backup = false; this.spawnBackup(s.reinforce ?? 2, s.pos); }
    }
    if (s.phase === 'break') {
      const done = s.core ? !s.coreE || s.coreE.dead : this.gunsDown(s) >= s.need;
      if (done) {
        s.phase = 'hold';
        s.prog = 0;
        s.holdAt = s.holdOff ? g.planet.ground(g.world.toWorld(L, s.holdOff[0], 0, s.holdOff[1]), new THREE.Vector3()) : s.pos;
        this.setMarker(s.holdAt);
        g.fx.pop(s.core ? 'PYLON DOWN!' : 'GUNS SILENT!', null, { color: '#ffd23f', size: 70 });
        g.hud.alert('TAKE THE CENTRE AND HOLD IT!', FACTIONS[A.f].color, 3);
      }
      return;
    }
    if (near(s.holdAt, 95)) s.prog += dt; else s.prog = Math.max(0, s.prog - dt * 0.5);
    if (s.prog >= s.hold) {
      g.fx.pop(`${L.name.toUpperCase()} TAKEN!`, null, { color: FACTIONS[A.f].color, size: 80 });
      g.cam.shake = 1;
      this.next();
    }
  }

  fail(reason) {
    const g = this.game;
    if (!this.active) return;
    this.clearStep();
    this.teardown();
    this.setMarker(null);
    const f = this.active.f;
    for (const u of this.active.units) if (!u.dead && u.model) { u.dead = true; u.model.root.removeFromParent(); }
    this.active = null;
    g.hud.alert('CHAPTER FAILED', '#ff2a4a', 3);
    g.hud.toast(`${reason} (${LEADERS[f].name} will give you another go.)`, 4);
  }

  onDeath() { if (this.active && !(this.game.spindle && this.game.spindle.active)) this.fail('You went down.'); }

  onImpact(speed) {
    const A = this.active;
    if (!A || !A.carrying) return;
    const s = A.steps[A.si];
    if (s.t !== 'carry' && s.t !== 'build') return;
    const g = this.game;
    // everything you haul has durability: small knocks chip it, a bad landing takes a lot. Mag-Cushion
    // Dampers soften the hit, a Kepler Cargo Cradle shrugs off a share of it
    const soft = (s.t === 'carry' ? s.fragile : 30) * 0.45;
    if (speed < soft) return;
    const up = g.upgrades;
    const dmg = (speed - soft) * (s.t === 'carry' ? 7 : 5) * (1 - (up.dampers || 0) * 0.15) * (1 - (up.cradle || 0) * 0.2);
    A.cargoHp = (A.cargoHp ?? 100) - dmg;
    if (A.cargoHp > 0) {
      g.fx.pop(`${s.t === 'carry' ? 'CAREFUL!' : 'DENTED!'} ${Math.max(0, Math.round(A.cargoHp))}%`, null, { color: '#ff9f1c', size: 40, life: 0.8 });
      return;
    }
    A.carrying = false;
    g.player.setCargo(null);
    g.fx.explosion(g.player.center.clone(), s.t === 'carry' ? 7 : 3, s.t === 'carry');
    g.fx.pop(s.t === 'carry' ? 'IT CRACKED!' : 'PARTS SMASHED!', null, { color: '#ff2a4a', size: 64 });
    if (s.t === 'carry' && s.fragile < 25) g.damagePlayer(25, 'impact');
    g.hud.toast(`Go back to ${s.fromLoc.name} for another ${s.t === 'carry' ? 'one' : 'load'}.`, 3);
    s.phase = 'fetch';
    this.setMarker(this.stepTarget(s));
  }

  // spawn enemies around a point
  spawnGuards(pos, n, opts = {}) {
    const foe = opts.foe || 'rustmoon';
    const g = this.game;
    const up = pos.clone().normalize();
    const out = [];
    for (let i = 0; i < n; i++) {
      // somewhere in the open around the site (outposts are big compounds now: never inside a building)
      let p = null;
      for (let k = 0; k < 24 && !p; k++) {
        const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
        const c = g.planet.ground(greatCircle(up, t, 25 + Math.random() * 50 + k * 3), new THREE.Vector3(), 2);
        if (!g.colliders.query(c, 8, []).some((col) => g.colliders.contact(col, c, 5, new THREE.Vector3()) > 0)) p = c;
      }
      if (!p) p = greatCircle(up, tangent(new THREE.Vector3(1, 0, 0), up).normalize(), 90);
      const e = g.enemies.spawnPirate(i % 3 === 2 ? 'rover' : 'skater', p, null, { rogue: true, targetObj: opts.targetObj || null, foe });
      e.storyUnit = true;
      out.push(e);
    }
    this.active.units.push(...out);
    return out;
  }

  // Your backup: allied cars and troopers in your faction's colours, rolling in from behind you
  // towards the objective.
  spawnBackup(n, at) {
    const g = this.game;
    const A = this.active;
    const P = g.player;
    const foe = A.f;
    const up = P.pos.clone().normalize();
    const back = tangent(at.clone().sub(P.pos), up).normalize().negate();
    for (let i = 0; i < n * 2; i++) {
      const side = new THREE.Vector3().crossVectors(up, back).multiplyScalar((i - n + 0.5) * 9);
      const p = P.pos.clone().addScaledVector(back, 60 + (i % 2) * 15).add(side);
      g.enemies.spawnAlly(i % 2 ? 'skater' : 'rover', p, foe, at);
    }
    A.backup = true;
    g.hud.alert(`${FACTIONS[foe].name.toUpperCase()} BACKUP ROLLING IN!`, FACTIONS[foe].color, 3);
  }

  // Waves for a chapter: hostiles that also go after your backup.
  wave(pos, n, obj, dist, foe) {
    const out = this.game.enemies.spawnWave(pos, n, obj, dist, foe);
    for (const u of out) u.storyUnit = true;
    this.active.units.push(...out);
    return out;
  }

  updateStep(dt) {
    const g = this.game;
    const P = g.player;
    const A = this.active;
    const s = A.steps[A.si];
    if (!s) return;
    const near = (pos, r) => pos && P.pos.distanceTo(pos) < r;
    A.t += dt;
    switch (s.t) {
      case 'goto':
        if (near(s.pos, s.r || 30)) this.next();
        break;
      case 'relays': {
        // (charges: the chapter waits for the last one to go off before it's done)
        if (s.doneIn !== undefined) { s.doneIn -= dt; if (s.doneIn <= 0) this.next(); return; }
        if (s.guards && !s.guarded[s.k] && near(s.pos, 420)) { s.guarded[s.k] = true; this.spawnGuards(s.pos.clone(), s.guards, { foe: s.foe }); }
        if (near(s.pos, 18)) {
          s.prog += dt;
          if (s.prog >= (s.hold || 3)) {
            s.prog = 0;
            const prop = this.relayProp(s.pos, s.prop || (s.charge ? 'charge' : 'sensor'));
            A.props.push(prop);
            g.fx.pop(s.charge ? 'CHARGE SET!' : 'DONE!', null, { color: FACTIONS[A.f].color, size: 54 });
            g.audio.pickup();
            s.k++;
            if (s.rouse && s.locs[s.k - 1]) { const b = g.enemies.bases.find((x) => x.loc === s.locs[s.k - 1]); if (b) { b.aggro = Math.max(b.aggro, 60); g.hud.alert(`${b.loc.name.toUpperCase()} DEFENCES ENGAGING!`, '#ff2a4a', 3); } }
            if (s.charge) {
              const pos = s.pos.clone(), o = s.outs && s.outs[s.k - 1]; // (s.k has moved on to the next site)
              g.schedule(4, () => { g.fx.explosion(pos.clone().addScaledVector(pos.clone().normalize(), 6), 14, true); g.audio.boom(true); if (o) this.raze(o); });
            }
            if (s.k >= s.list.length) { if (s.charge) { s.doneIn = 4.6; this.setMarker(null); } else this.next(); return; }
            s.pos = s.list[s.k];
            this.setMarker(s.pos);
          }
        } else s.prog = Math.max(0, s.prog - dt);
        break;
      }
      case 'clear':
      case 'boss': {
        if (!s.spawned && near(s.pos, 600)) {
          s.spawned = true;
          if (s.t === 'boss') {
            const e = g.enemies.spawnBoss(s.pos, s.boss, s.foe);
            e.storyUnit = true;
            s.units = [e];
            A.units.push(e);
            // its escort rides alongside
            for (let i = 0; i < (s.escort || 0); i++) {
              const up = s.pos.clone().normalize();
              const side = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
              const u = g.enemies.spawnPirate('rover', s.pos.clone().addScaledVector(side, 25 + i * 10), null, { rogue: true, foe: s.foe });
              u.storyUnit = true;
              s.units.push(u);
              A.units.push(u);
            }
            g.hud.alert(s.boss.name, '#ff2a4a', 3);
            g.cam.shake = 0.6;
          } else s.units = this.spawnGuards(s.pos, s.n, { foe: s.foe });
        }
        if (s.spawned) {
          // units that wandered out of range get respawned when you return
          const key = s.t === 'boss' ? [s.units[0]] : s.units;
          if (key.every((e) => e.dead) && key.some((e) => e.hp > 0)) { s.spawned = false; break; }
          if (key.every((e) => e.dead)) { g.fx.pop(s.t === 'boss' ? 'WRECKED!' : 'CLEARED!', null, { color: '#7dff3a', size: 64 }); this.next(); }
        }
        break;
      }
      case 'capture': {
        if (s.phase === 'go') {
          if (!s.spawned && near(s.pos, 600)) {
            s.spawned = true;
            s.units = this.spawnGuards(s.pos, s.guards, { foe: s.foe });
            if (s.backup && !A.backup) this.spawnBackup(s.backup, s.pos);
          }
          if (s.spawned && s.units.every((e) => e.dead)) {
            if (s.units.some((e) => e.hp > 0)) s.spawned = false;
            else { s.phase = 'hold'; g.hud.toast('Guards down. Stand on the outpost to take it.', 3); }
          }
        } else {
          if (near(s.pos, 55)) s.prog += dt; else s.prog = Math.max(0, s.prog - dt * 0.5);
          s.waveT = (s.waveT || 6) - dt;
          if (s.waveT <= 0) { s.waveT = 14; this.spawnGuards(s.pos.clone(), 2, { foe: s.foe }); }
          if (s.prog >= s.hold) {
            if (!s.outpost) s.outpost = g.territory.found(s.pos, A.f, 'tower', null);
            g.territory.capture(s.outpost, A.f);
            this.capturedIds.push(s.outpost.id);
            if (s.war) g.rep.add(s.war, -6, `Lost an outpost to ${FACTIONS[A.f].name}`);
            g.fx.pop('OUTPOST TAKEN!', null, { color: FACTIONS[A.f].color, size: 70 });
            g.hud.alert(`${FACTIONS[A.f].name.toUpperCase()} TERRITORY EXPANDS`, FACTIONS[A.f].color, 3);
            this.next();
          }
        }
        break;
      }
      case 'build':
      case 'carry': {
        if (s.phase === 'fetch') {
          if (near(s.fromLoc.pos, Math.max(60, s.fromLoc.r * 0.85))) {
            s.phase = 'haul';
            A.carrying = true;
            A.cargoHp = 100;
            P.setCargo(s.t === 'carry' ? 0xff2e88 : 0xffd23f);
            g.fx.pop(s.t === 'carry' ? `${s.cargo}!` : 'PREFAB PARTS!', null, { color: '#ffd23f', size: 50 });
            g.audio.pickup();
            this.setMarker(this.stepTarget(s));
            if (s.chase) { g.hud.alert('EVERY GUN ON THE MOON IS AFTER YOU!', '#ff2a4a', 3); this.chaseT = 0; }
          }
        } else {
          if (s.chase) {
            this.chaseT -= dt;
            if (this.chaseT <= 0) {
              this.chaseT = 22;
              s.chaseN = (s.chaseN || 0) + 1;
              const foes = s.chaseFoes || ['rustmoon'];
              this.spawnGuards(P.pos.clone().addScaledVector(g.cam.fwd, -300), 2, { foe: foes[s.chaseN % foes.length] });
            }
          }
          const dest = s.t === 'carry' ? s.dest : s.pos;
          if (near(dest, s.t === 'carry' ? Math.max(45, (s.destLoc ? s.destLoc.r * 0.85 : 45)) : 32)) {
            A.carrying = false;
            P.setCargo(null);
            if (s.t === 'carry') { g.fx.pop('DELIVERED!', null, { color: '#7dff3a', size: 64 }); this.next(); break; }
            s.trip++;
            const crate = makeCrate(0xffd23f, 1.6);
            const up = s.pos.clone().normalize();
            crate.position.copy(g.planet.ground(greatCircle(up, tangent(new THREE.Vector3(Math.random(), Math.random(), Math.random()), up).normalize(), 4 + s.trip * 3), new THREE.Vector3(), 0.8));
            g.scene.add(crate);
            A.props.push(crate);
            g.fx.pop(`LOAD ${s.trip}/${s.trips}`, null, { color: '#ffd23f', size: 54 });
            if (s.trip >= s.trips) {
              if (s.found.kind === 'launch') {
                g.ws.launchPad = true;
                saveWorldState(g.ws);
                const ml = g.locations.find((l) => l.id === 'monolith');
                if (ml && !ml.launchPad) { ml.launchPad = true; g.world.storyMarks(ml); }
                g.fx.explosion(s.pos.clone().addScaledVector(up, 3), 8, false);
                g.hud.alert('THE MERIDIAN LAUNCH COMPLEX IS BUILT!', FACTIONS[A.f].color, 3.5);
                A.lastAt = { pos: s.pos.clone() };
                this.next();
                break;
              }
              const town = s.found.name === 'town';
              const o = g.territory.found(s.pos, A.f, s.found.kind, town && this.townSite ? `${this.townSite.name} (founding)` : s.found.name);
              if (town && this.townSite) this.townSite.outpost = o.id;
              this.founded.push(o.id);
              this.save();
              g.fx.explosion(s.pos.clone().addScaledVector(up, 3), 8, false);
              g.hud.alert(`${g.territory.name(o).toUpperCase()} IS BUILT!`, FACTIONS[A.f].color, 3.5);
              A.lastAt = { pos: s.pos.clone(), outpost: o };
              this.next();
            } else { s.phase = 'fetch'; this.setMarker(this.stepTarget(s)); }
          }
        }
        break;
      }
      case 'defend': {
        if (!A.obj) {
          const up = s.pos.clone().normalize();
          const m = this.generatorProp(s.pos, s.prop);
          A.props.push(m);
          const big = s.prop === 'reactor';
          A.obj = { center: s.pos.clone().addScaledVector(up, big ? 5 : 2.5), vel: new THREE.Vector3(), radius: big ? 6 : 2.6, hp: s.hp, maxHp: s.hp, dead: false, label: big ? 'REACTOR' : 'GENERATOR' };
          g.events.protect.push(A.obj);
          s.waveT = 3;
        }
        if (A.obj.dead) { this.fail('It was destroyed.'); return; }
        s.timer -= dt;
        s.waveT -= dt;
        if (s.waveT <= 0) {
          s.waveT = 16;
          s.waveN = (s.waveN || 0) + 1;
          this.wave(s.pos, 2 + Math.floor(A.t / 40), A.obj, 300, s.mixed && s.waveN % 2 === 0 ? s.mixed : s.foe || 'rustmoon');
        }
        if (s.garrisonAt && !A.backup && s.secs - s.timer >= s.garrisonAt) this.spawnBackup(2, s.pos);
        if (s.timer <= 0) { g.fx.pop('HELD!', null, { color: '#7dff3a', size: 64 }); this.next(); }
        break;
      }
      case 'experiment': {
        const inside = near(s.pos, 40);
        if (!A.props.length) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(40, 0.6, 6, 64), glow(0xc77dff));
          ring.position.copy(g.planet.ground(s.pos, new THREE.Vector3(), 0.6));
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.pos.clone().normalize());
          g.scene.add(ring);
          A.props.push(ring);
          if (s.nodes) this.placeTrial(s);
        }
        if (s.nodes) {
          // fly through every node before the field collapses
          for (const nd of s.nodeList) {
            if (nd.got || P.center.distanceTo(nd.pos) > 3.6) continue;
            nd.got = true;
            nd.mesh.visible = false;
            s.got++;
            g.fx.explosion(nd.pos.clone(), 4, false);
            g.fx.pop(`NODE ${s.got}/${s.nodes}`, nd.pos.clone(), { color: '#c77dff', size: 54 });
            g.audio.tone(600 + s.got * 120, 0.2, 'sine', 0.25, 0.5);
          }
          if (s.got >= s.nodes) { g.fx.pop('FIELD CALIBRATED!', null, { color: '#c77dff', size: 64 }); this.next(); break; }
          if (s.timer <= 0) { this.fail('The field collapsed before you reached every node.'); return; }
        }
        if (inside) {
          s.timer -= dt;
          s.zap = (s.zap || 1) - dt;
          if (s.zap <= 0) {
            s.zap = Math.max(0.7, 2 - A.t / 40);
            const up = P.up;
            const t = tangent(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), up).normalize();
            const p = g.planet.ground(greatCircle(P.pos.clone().normalize(), t, Math.random() < 0.3 ? 0 : 4 + Math.random() * 22), new THREE.Vector3(), 0.3);
            g.fx.warningRing(p, 6, 1.1);
            g.schedule(1.1, () => { if (this.active) { g.explode(p.clone().addScaledVector(p.clone().normalize(), 1), 6, 20, 'anomaly', 1.6); g.fx.pop('ZZAP!', p.clone().addScaledVector(p.clone().normalize(), 3), { color: '#c77dff', size: 46 }); } });
          }
          if (Math.random() < dt * 0.3) { g.alchemy.buffs.lowGrav = Math.max(g.alchemy.buffs.lowGrav, 2.5); }
        }
        if (s.nodes) { s.timer -= inside ? 0 : dt; break; } // (the clock runs everywhere)
        if (s.timer <= 0) { g.fx.pop('DATA CAPTURED!', null, { color: '#c77dff', size: 64 }); this.next(); }
        break;
      }
      case 'jam': this.updateJam(s, dt); break;
      case 'survey': this.updateSurvey(s, dt); break;
      case 'gates': this.updateGates(s, dt); break;
      case 'spindle':
        if (!s.started) { s.started = true; g.spindle.start(() => { s.done = true; }); }
        if (s.done) this.next();
        break;
      case 'assault': this.updateAssault(s, dt); break;
      case 'kade':
        if (s.unit && s.unit.dead) this.next();
        break;
      default: break;
    }
  }

  // a planted prop (storyAssets): a sensor pylon, a ballot stand, a demolition charge...
  relayProp(pos, kind) {
    const g = this.game;
    const root = makeProp(kind);
    root.position.copy(g.planet.ground(pos, new THREE.Vector3()));
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
    g.scene.add(root);
    return root;
  }

  // what a defend step protects: the relay mast, the field generator, the homestead generator,
  // the Black Sun reactor (storyAssets)
  generatorProp(pos, kind = 'homegen') {
    const g = this.game;
    const root = makeProp(kind);
    root.position.copy(g.planet.ground(pos, new THREE.Vector3()));
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
    g.scene.add(root);
    return root;
  }

  status() {
    const A = this.active;
    if (!A) return '';
    const s = A.steps[A.si];
    if (!s) return '';
    const P = this.game.player;
    const dist = (p) => (p ? `${(P.pos.distanceTo(p) / 1000).toFixed(1)} km` : '');
    switch (s.t) {
      case 'relays': return `${s.label} (${s.k}/${s.list.length}) · ${dist(s.pos)}${s.prog > 0 ? ` · ${Math.round((s.prog / (s.hold || 3)) * 100)}%` : ''}`;
      case 'clear': return `${s.label}${s.units ? ` · ${s.units.filter((e) => !e.dead).length} left` : ''} · ${dist(s.pos)}`;
      case 'boss': return `${s.label}${s.units && s.units[0] && !s.units[0].dead ? ` · ${Math.max(0, Math.round(s.units[0].hp))} HP` : ''} · ${dist(s.pos)}`;
      case 'capture': return s.phase === 'hold' ? `Hold the outpost: ${Math.round((s.prog / s.hold) * 100)}%` : `${s.label} · ${dist(s.pos)}`;
      case 'build': return `${s.phase === 'fetch' ? `Pick up parts at ${s.fromLoc.name}` : `Haul the parts to the site · condition ${Math.max(0, Math.round(this.active.cargoHp ?? 100))}%`} (${s.trip}/${s.trips}) · ${dist(this.stepTarget(s))}`;
      case 'carry': return `${s.phase === 'fetch' ? `Pick up the ${s.cargo.toLowerCase()} at ${s.fromLoc.name}` : `Deliver it · condition ${Math.max(0, Math.round(this.active.cargoHp ?? 100))}%`} · ${dist(this.stepTarget(s))}`;
      case 'defend': return `${s.label} · ${Math.ceil(Math.max(0, s.timer))} s${this.active.obj ? ` · ${Math.round((this.active.obj.hp / this.active.obj.maxHp) * 100)}% integrity` : ''}`;
      case 'experiment': return s.nodes ? `${s.label} (${s.got}/${s.nodes}) · ${Math.ceil(Math.max(0, s.timer))} s` : `${s.label} · ${Math.ceil(Math.max(0, s.timer))} s${P.pos.distanceTo(s.pos) > 40 ? ' · GET INSIDE THE RING' : ''}`;
      case 'gates': return s.phase === 'fetch' ? `Pick up the data spike at ${s.fromLoc.name} · ${dist(s.fromLoc.pos)}` : `${s.k < s.gateList.length ? `Gate ${s.k + 1}/${s.gateList.length}` : 'Into the Exchange'} · ${Math.ceil(Math.max(0, s.timer))} s · ${dist(this.stepTarget(s))}`;
      case 'spindle': return this.game.spindle.status();
      case 'survey': return `${s.label} (${s.k}/${s.list.length}) · ${dist(s.pos)}${s.prog > 0 ? ` · ${Math.round((s.prog / (s.hold || 3)) * 100)}%` : ''}`;
      case 'jam': return s.phase === 'jam' ? `Keep the jammer alive · ${Math.ceil(Math.max(0, s.timer))} s${this.active.obj ? ` · ${Math.round((this.active.obj.hp / this.active.obj.maxHp) * 100)}%` : ''}` : `${s.label} · ${dist(s.pos)}`;
      case 'assault': return s.phase === 'go' ? `${s.label} · ${dist(s.pos)}` : s.phase === 'break' ? (s.core ? `Destroy the command pylon${s.coreE ? ` · ${Math.max(0, Math.round(s.coreE.hp))} HP` : ''}` : `Silence the guns (${this.gunsDown(s)}/${s.need})`) : `Take the centre: ${Math.round((s.prog / s.hold) * 100)}%${P.pos.distanceTo(s.holdAt || s.pos) > 60 ? ' · GET TO THE CENTRE' : ''}`;
      case 'kade': return 'Defeat Captain Kade';
      default: return `${s.label} · ${dist(s.pos)}`;
    }
  }

  // HUD panel (shares the event panel when no event is running)
  panel() {
    const A = this.active;
    if (!A) return null;
    const s = A.steps[A.si];
    let bar = 0;
    if (s) {
      if (s.t === 'capture' && s.phase === 'hold') bar = s.prog / s.hold;
      else if (s.t === 'defend' || (s.t === 'experiment' && !s.nodes)) bar = 1 - Math.max(0, s.timer) / s.secs;
      else if (s.t === 'experiment') bar = s.got / s.nodes;
      else if (s.t === 'gates' && s.phase === 'race') bar = Math.max(0, s.timer) / s.secs;
      else if (s.t === 'spindle') bar = this.game.spindle.active ? this.game.spindle.progress() : 0;
      else if (s.t === 'jam' && s.phase === 'jam') bar = 1 - Math.max(0, s.timer) / s.secs;
      else if (s.t === 'assault') bar = s.phase === 'hold' ? s.prog / s.hold : s.phase === 'break' ? (s.core ? 1 - (s.coreE ? s.coreE.hp / s.coreE.maxHp : 1) : this.gunsDown(s) / s.need) : 0;
      else if (s.t === 'relays') bar = s.k / s.list.length;
      else if (s.t === 'build') bar = s.trip / s.trips;
      else bar = A.si / A.steps.length;
    }
    return { faction: A.f, title: `★ CH.${A.idx + 1} · ${A.def.title}`, status: this.status(), bar };
  }

  objective() {
    const A = this.active;
    if (!A) return null;
    const s = A.steps[A.si];
    if (s && s.t === 'spindle' && this.game.spindle.active) return this.game.spindle.objective();
    const pos = this.stepTarget(s);
    return pos ? { pos, label: `★ ${A.def.title.toUpperCase()}` } : null;
  }

  // ---------- outposts you founded: modules, income, healing ----------
  myOutposts() { return this.founded.map((id) => this.game.territory.outposts.find((o) => o.id === id)).filter(Boolean); }

  refreshOutposts() {
    const T = this.game.territory;
    for (const o of this.myOutposts()) if (o.model) T.despawn(o);
    T.save();
  }

  outpostMenu(o) {
    const g = this.game;
    const T = g.territory;
    o.bank = o.bank || 0;
    const mods = Object.entries(MODULES);
    const buttons = [];
    if (o.modules.includes('market') && o.bank >= 1) buttons.push({ label: `${buttons.length + 1} · COLLECT MARKET TAKINGS — ₵${Math.floor(o.bank)}`, fn: () => { g.addCredits(Math.floor(o.bank), 'Market'); o.bank = 0; this.outpostMenu(o); } });
    if (o.modules.includes('clinic')) buttons.push({ label: `${buttons.length + 1} · PATCH ME UP (free)`, fn: () => { g.player.health = g.player.maxHealth; g.fx.pop('GOOD AS NEW!', null, { color: '#7dff6a', size: 50 }); } });
    if (o.modules.includes('beacon')) buttons.push({ label: `${buttons.length + 1} · BEACON TRAVEL…`, fn: () => this.beaconMenu(o) });
    for (const [k, m] of mods) {
      if (o.modules.includes(k)) continue;
      if (o.modules.length >= 6) break;
      buttons.push({
        label: `${buttons.length + 1} · BUILD ${m.name.toUpperCase()} — ₵${m.cost}`,
        fn: () => {
          if (g.credits < m.cost) { g.hud.toast(`Not enough credits (need ₵${m.cost}).`, 2); return; }
          g.credits -= m.cost;
          o.modules.push(k);
          if (k === 'garage') { const v = o.faction === 'meridian' ? 'van' : 'mule'; if (!this.vehicles.includes(v)) { this.vehicles.push(v); g.hud.toast(`${VEHICLES[v].name} unlocked! Press V.`, 3); } }
          if (k === 'beacon') this.revealAround(o);
          g.audio.cash();
          this.refreshOutposts();
          this.save();
          g.save();
          this.outpostMenu(o);
        },
      });
    }
    buttons.push({ label: `${buttons.length + 1} · CLOSE` });
    const built = o.modules.length ? o.modules.map((k) => MODULES[k].name).join(', ') : 'nothing yet';
    const info = mods.filter(([k]) => !o.modules.includes(k)).map(([, m]) => `<b>${m.name}</b>: ${m.desc}`).join('<br>');
    g.dialog(T.name(o).toUpperCase(), `Built: <b>${built}</b> (${o.modules.length}/6)<br><br><small>${info}</small>`, buttons);
  }

  beaconMenu(from) {
    const g = this.game;
    const T = g.territory;
    const others = this.myOutposts().filter((o) => o !== from && o.modules.includes('beacon'));
    if (!others.length) { g.hud.toast('Build a beacon at another outpost to link them.', 2.5); return; }
    g.dialog('BEACON TRAVEL', 'Where to?', others.map((o, i) => ({ label: `${i + 1} · ${T.name(o)}`, fn: () => this.teleportTo(o.dir) })).concat([{ label: `${others.length + 1} · CANCEL` }]));
  }

  revealAround(o) {
    const G = this.game.globe;
    const cells = G.cells;
    const cos = Math.cos(1500 / 3600);
    for (let k = 0; k < G.explored.length; k++) if (cells[k * 3] * o.dir.x + cells[k * 3 + 1] * o.dir.y + cells[k * 3 + 2] * o.dir.z > cos) G.explored[k] = 1;
    G.save();
  }

  teleportTo(dir) {
    const g = this.game;
    const P = g.player;
    if (P.vehicle) g.garage.exit();
    const t = tangent(new THREE.Vector3(1, 0, 0), dir).normalize();
    const d = greatCircle(dir.clone().normalize(), t, 18);
    g.planet.update(g.planet.ground(d, new THREE.Vector3()), { budgetMs: 1e9 });
    const pos = g.planet.ground(d, new THREE.Vector3(), 1.5);
    const fwd = tangent(dir.clone().sub(d), d).normalize();
    P.respawn(pos, fwd);
    g.cam.fwd.copy(fwd);
    g.fx.explosion(pos, 4, false);
    g.fx.pop('*VWORP*', null, { color: '#c77dff', size: 56 });
    g.audio.tone(200, 0.5, 'sine', 0.25, 4);
  }

  // nearest clinic for redeploying after a K.O.
  clinicSpawn(from) {
    let best = null, bd = Infinity;
    const T = this.game.town;
    if (T && T.has('clinic')) { const p = T.slotWorld('clinic'); if (p) { best = { dir: p.clone().normalize() }; bd = arcDist(from, best.dir); } }
    for (const o of this.myOutposts()) {
      if (!o.modules.includes('clinic')) continue;
      const d = arcDist(from, o.dir);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  updateOutposts(dt) {
    const g = this.game;
    const P = g.player;
    for (const o of this.myOutposts()) {
      if (o.modules.includes('market')) o.bank = Math.min(800, (o.bank || 0) + (40 / 60) * dt);
      const d = P.pos.distanceTo(g.planet.ground(o.dir, _v));
      if (o.modules.includes('greenhouse') && d < 60 && !P.dead) { P.health = Math.min(P.maxHealth, P.health + 4 * dt); o.bank = (o.bank || 0) + (o.modules.includes('market') ? 0 : 0); }
      if (o.modules.includes('turret') && d < 900) {
        o.fireCd = (o.fireCd || 0) - dt;
        if (o.fireCd <= 0) {
          o.fireCd = 1.2;
          const from = g.planet.ground(o.dir, new THREE.Vector3(), 12.5); // above the hub dome
          let target = null, bd = 300;
          for (const e of g.enemies.list) {
            if (e.dead || e.faction !== 'pirate' || !e.center || e.kind === 'core' || g.enemies.friendly(e)) continue;
            const dd = e.center.distanceTo(from);
            if (dd < bd) { bd = dd; target = e; }
          }
          if (target) g.projectiles.fire('mil', from, target.center.clone().sub(from).normalize().multiplyScalar(140), { damage: 26, splash: 4, color: 0xff9f1c, size: 0.45, knock: 0.5, spare: true });
        }
      }
    }
  }

  // ---------- tech ----------
  useTech(k) {
    const g = this.game;
    const P = g.player;
    if (!this.tech.includes(k)) { g.hud.toast(`${TECH[k].name} isn't yours yet.`, 1.5); return; }
    if (this.techCd[k] > 0) { g.hud.toast(`${TECH[k].name}: ${Math.ceil(this.techCd[k])} s`, 1); return; }
    if (k === 'dash') {
      // a momentum redirect, not a blink: every bit of your speed (and a kick more) swings round to
      // wherever you're looking, pitch and all, so mid-air it's a hard turn, a climb or a dive
      if (P.vehicle) return;
      const dir = g.cam.look.clone().normalize();
      // on the ground, aiming down would only grind you into it
      if (P.body.grounded && dir.dot(P.up) < 0.08) dir.addScaledVector(P.up, 0.08 - dir.dot(P.up)).normalize();
      const sp = Math.min(Math.max(P.vel.length(), 30) + 12, 95);
      const from = P.center.clone();
      P.vel.copy(dir).multiplyScalar(sp);
      if (dir.dot(P.up) > 0.05) { P.body.grounded = false; P.body.sinceContact = 1; }
      g.fx.beam(from.addScaledVector(dir, -6), P.center.clone(), 0xc77dff);
      g.fx.pop('*PHASE*', null, { color: '#c77dff', size: 44, life: 0.6 });
      g.audio.tone(900, 0.2, 'sine', 0.2, 0.3);
      this.techCd.dash = 4;
    } else if (k === 'teleport') {
      const places = g.locations.filter((l) => l.discovered && !l.camp).map((l) => ({ name: l.name, dir: l.dir }))
        .concat(this.myOutposts().map((o) => ({ name: g.territory.name(o), dir: o.dir })));
      const page = (n) => {
        const per = 7, sl = places.slice(n * per, n * per + per), pages = Math.ceil(places.length / per);
        g.dialog('PERSONAL TELEPORTER', 'Pick a destination. (90 s recharge)', sl.map((p, i) => ({ label: `${i + 1} · ${p.name}`, fn: () => { this.techCd.teleport = 90; this.teleportTo(p.dir); } }))
          .concat(pages > 1 ? [{ label: `${sl.length + 1} · MORE (${n + 1}/${pages})`, fn: () => page((n + 1) % pages) }] : [])
          .concat([{ label: 'CANCEL' }]));
      };
      page(0);
    }
  }

  // Deflector Shield: called from damagePlayer; returns true if the hit was absorbed.
  absorb(from = null) {
    if (!this.tech.includes('shield') || this.techCd.shield > 0) return false;
    this.techCd.shield = 12;
    const g = this.game;
    // invisible until it's hit: then the field lights up round you and the hit side burns away
    g.fx.shieldHit(() => g.player.center, from);
    g.fx.pop('DEFLECTED!', null, { color: '#2ee6ff', size: 50 });
    g.audio.tone(1400, 0.15, 'triangle', 0.2, 0.5);
    g.audio.tone(520, 0.35, 'sawtooth', 0.08, 0.15);
    g.audio.burst(0.18, 5200, 0.25);
    return true;
  }

  // ---------- Captain Kade, the sniper ----------
  // Rarely shows up with a regular dark-side pirate squad (unless you ride with Rustmoon).
  maybeKade() {
    const g = this.game;
    if (this.kade.captured || g.rep.aligned() || this.faction === 'rustmoon' || g.time < this.kade.nextAt) return;
    if (darkness(g.player.up) < 0.5 || g.enemies.list.some((e) => e.kind === 'kade' && !e.dead)) return;
    if (Math.random() > 0.08) return;
    this.spawnKade(false);
  }

  spawnKade(final) {
    const g = this.game;
    const e = spawnKadeTruck(this, final);
    this.kade.met++;
    this.save();
    this.splash();
    g.actionPanel('villain', e, '"NOBODY SKATES MY SIDE OF THE MOON."');
    g.slowmo = 1.4;
    return e;
  }

  splash() {
    const el = this.splashEl;
    const L = LEADERS.rustmoon;
    el.innerHTML = `<div class="sp-burst"></div><div class="sp-name">CAPTAIN KADE</div><div class="sp-title">${L.title}</div><div class="sp-quote">${pick(['"Smile for the scope, Runner."', '"You\'ve got a lot of nerve, skating on MY side of the Moon."', '"Hope you like the new ride."', '"Run. It\'s more fun when they run."'])}</div>`;
    el.classList.remove('hidden', 'sp-out');
    void el.offsetWidth;
    el.classList.add('sp-in');
    clearTimeout(this.splashT);
    this.splashT = setTimeout(() => { el.classList.add('sp-out'); setTimeout(() => el.classList.add('hidden'), 400); }, 3200);
    this.game.audio.tone(110, 0.8, 'sawtooth', 0.25, 0.5);
    this.game.audio.boom(true);
  }

  updateKade(e, dt) { updateKadeTruck(this, e, dt); }

  onKill(e) {
    if (e.kind === 'kade') kadeDefeated(this, e);
  }

  // ---------- UI ----------
  buildUI() {
    const hud = document.getElementById('hud');
    this.splashEl = document.createElement('div');
    this.splashEl.id = 'splash';
    this.splashEl.className = 'hidden';
    hud.appendChild(this.splashEl);
    this.lockEl = document.createElement('div');
    this.lockEl.id = 'lockwarn';
    this.lockEl.className = 'hidden';
    hud.appendChild(this.lockEl);
  }

  // ---------- per frame ----------
  // the hold meter, centre-low on screen (see meter())
  renderMeter() {
    if (!this.meterEl) {
      this.meterEl = document.createElement('div');
      this.meterEl.id = 'storymeter';
      this.meterEl.innerHTML = '<div class="sm-label"></div><div class="sm-track"><div class="sm-fill"></div></div>';
      document.getElementById('hud').appendChild(this.meterEl);
    }
    const m = this.meter();
    this.meterEl.classList.toggle('on', !!m);
    if (!m) return;
    this.meterEl.querySelector('.sm-label').textContent = m.label;
    const f = this.meterEl.querySelector('.sm-fill');
    f.style.width = `${Math.round(Math.min(1, Math.max(0, m.k)) * 100)}%`;
    f.style.background = m.col;
    this.meterEl.style.setProperty('--col', m.col);
  }

  update(dt) {
    this.renderMeter();
    // a finale's "one week later" cut, as soon as its outro is closed
    if (this.pendingDawn && this.game.state === 'play') { const f = this.pendingDawn; this.pendingDawn = null; f(); }
    updateMortarDrop(this);
    for (const k of Object.keys(this.techCd)) this.techCd[k] = Math.max(0, this.techCd[k] - dt);
    for (const L of Object.values(this.leaders)) {
      if (!L.loc.active) continue;
      L.t += dt;
      L.model.head.rotation.y = Math.sin(L.t * 0.7) * 0.4;
      L.ring.scale.setScalar(1 + Math.sin(L.t * 3) * 0.06);
      L.beam.material.opacity = 0.12 + Math.sin(L.t * 2) * 0.05;
      L.model.armL.rotation.z = -0.3 + Math.sin(L.t * 1.3) * 0.15;
    }
    if (this.active) {
      this.updateStep(dt);
      if (this.active) {
        const s = this.active.steps[this.active.si];
        const tgt = this.stepTarget(s);
        if (tgt && this.marker) this.marker.position.copy(tgt);
        for (const p of this.active.props) p.traverse((o) => { if (o.userData.spin) o.rotation.y += dt * 2; });
      }
    }
    this.updateOutposts(dt);
  }

  hudTech() {
    if (!this.tech.length) return '';
    return this.tech.map((k) => {
      const cd = this.techCd[k];
      const key = TECH[k].key !== '—' ? `[${TECH[k].key}] ` : '';
      return `<span class="${cd > 0 ? 'cd' : 'ready'}">${key}${TECH[k].name}${cd > 0 ? ` ${Math.ceil(cd)}s` : ''}</span>`;
    }).join(' · ');
  }
}

export { CHAPTERS, REQ };
