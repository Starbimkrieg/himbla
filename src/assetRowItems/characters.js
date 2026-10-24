// Asset Row catalogue: characters (runner and gear, people, creatures), one file per group; helpers in characters-util.js.
// Item format: see index.js.
import runner from './characters-runner.js';
import people from './characters-people.js';
import creatures from './characters-creatures.js';

// no colliders on figures and creatures, except the leaders' podiums
for (const g of [runner, people, creatures]) for (const it of g.items) if (it.id !== 'people.leaders') it.solid = false;

export default [runner, people, creatures];

/*
SKIPPED
- The Spindle's drone (spindle.js makeDrone): in the props catalogue (spindle.drone).
- Traffic pedestrians and buggy drivers (traffic.js), settlement crowds (world.js addFigures): same makeFigure looks as
  people.archetypes / people.special.
- Dr. Zbornak's workbench and dais (world.js buildLab / settlements.js dressLabInside): part of the lab building.
*/
