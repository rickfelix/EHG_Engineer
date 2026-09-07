import { scoreLeg4, EARNING_POINTS, LADDER_DISTANCE, VERDICTS, LEG_POINTS } from '../lib/drive-loop/score/leg4-capacity.js';
const persist = () => ({ id: 'row-x' });
const fc = (v) => () => ({ verdict: v, beltDepth: 1, demandSoon: 1, deficit: 0 });
console.log('EARNING_POINTS =', JSON.stringify(EARNING_POINTS));
console.log('frozen:', Object.isFrozen(EARNING_POINTS), '| LEG_POINTS =', LEG_POINTS);
const RATIFIED = { 'DEFICIT-URGENT': 0, DEFICIT: 1, TIGHT: 2, SURPLUS: 1 };
console.log('exact match to ratified be6e9d73:', JSON.stringify(EARNING_POINTS) === JSON.stringify(RATIFIED) || VERDICTS.every(v=>EARNING_POINTS[v]===RATIFIED[v]) && Object.keys(EARNING_POINTS).length===4);
const vals = [];
for (const v of VERDICTS) { const r = scoreLeg4({ computeVerdict: fc(v), persist }); vals.push(r.points.value); console.log(`  ${v.padEnd(15)} points=${r.points.value}  ladder_distance=${r.ladder_distance.value}`); }
console.log('distinct point values:', new Set(vals).size, '(ffebbd68 predicate needs >=3)');
console.log('LADDER_DISTANCE =', JSON.stringify(LADDER_DISTANCE), 'frozen:', Object.isFrozen(LADDER_DISTANCE));
const ov = scoreLeg4({ computeVerdict: fc('TIGHT'), persist, earning: { 'DEFICIT-URGENT':0, DEFICIT:0, TIGHT:99, SURPLUS:0 } });
console.log('injectable override TIGHT->99 yields:', ov.points.value);
console.log('default unpolluted after override:', scoreLeg4({ computeVerdict: fc('TIGHT'), persist }).points.value);
// HEALTHY_VERDICTS must be gone, not aliased
const mod = await import('../lib/drive-loop/score/leg4-capacity.js');
console.log('exports:', Object.keys(mod).sort().join(', '));
console.log('HEALTHY_VERDICTS present?', 'HEALTHY_VERDICTS' in mod);
// old param name must be inert
const stale = scoreLeg4({ computeVerdict: fc('SURPLUS'), persist, healthy: ['TIGHT'] });
console.log('stale `healthy:` arg ignored -> SURPLUS scores', stale.points.value, '(ratified 1, NOT silently 0)');
