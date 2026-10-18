// Asset Row catalogue: the characters (the runner and its gear, people, creatures). Items: see index.js. Three groups, one per
// category, each in a file of its own; the shared helpers are in characters-util.js.
import runner from './characters-runner.js';
import people from './characters-people.js';
import creatures from './characters-creatures.js';

// (lines of figures and creatures are not for walking into: no colliders, except the leaders' podiums)
for (const g of [runner, people, creatures]) for (const it of g.items) if (it.id !== 'people.leaders') it.solid = false;

export default [runner, people, creatures];

/*
SKIPPED
- The Spindle's alien drone (spindle.js makeDrone) is in the props catalogue (spindle.drone), not here.
- The road-traffic pedestrians and buggy drivers (traffic.js) and the crowds in the settlements (world.js addFigures) are the same
  makeFigure looks as people.archetypes and people.special; no separate model.
- Dr. Zbornak's workbench and dais (world.js buildLab / settlements.js dressLabInside) belong to the lab building.
*/
