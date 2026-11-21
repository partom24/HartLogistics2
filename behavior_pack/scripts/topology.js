// A lane follows native Hopper output faces. Coordinates enter through actual blocks.
export const HOPPER = 'minecraft:hopper';
const down = [0,-1,0], up = [0,1,0];
const faces = [down, undefined, [0,0,-1], [0,0,1], [-1,0,0], [1,0,0]];
const neighbors = [up, ...faces.filter(Boolean)];
export const positionKey = p => [p.x,p.y,p.z].join(',');
const step = (p,[x,y,z]) => ({x:p.x+x,y:p.y+y,z:p.z+z});

export function discover(receiver, registration, read, sorterId) {
    const cache = new Map();
    function block(p) {
        const k=positionKey(p);
        if(cache.has(k))return cache.get(k);
        const b = read(p);
        if (!b) throw Error('Unavailable block at '+positionKey(p));
        cache.set(k,b);
        return b;
    }
    const ports = registration.inlet ? [registration.inlet] :
        neighbors.map(face => step(receiver,face)).filter(p => block(p).typeId === HOPPER);
    if (ports.length !== 1) throw Error('Found '+ports.length+' adjacent Hoppers. Select the inlet with hartlab:bind_inlet.');
    const directions=[], lane = [], visited = new Set(), spots = new Map();
    function column(p,tap,dir) {
        while (block(p).typeId === sorterId) {
            const k = positionKey(p), existing = spots.get(k);
            if (!existing) spots.set(k,{...p,tap});
            else if (positionKey(existing.tap)!==positionKey(tap)) existing.ambiguous = true;
            p = step(p,dir);
        }
    }
    let p = ports[0], terminal;
    while (block(p).typeId === HOPPER) {
        const key = positionKey(p);
        if (visited.has(key)) throw Error('Hopper loop at '+key);
        visited.add(key);
        lane.push(p);
        const b = block(p);
        const direction=b.permutation.getState('facing_direction');
        directions.push(direction);
        const face=faces[direction];
        if (!face) throw Error('Unknown Hopper output at '+key);
        const next = step(p,face), below = step(p,down);
        if (face!==down && block(below).typeId===HOPPER) throw Error('Competing downward pull at '+key);
        for (const side of neighbors) {
            const start = step(p,side);
            if (block(start).typeId!==sorterId) continue;
            column(start,p,up);
            column(start,p,down);
        }
        p=next;
    }
    if (!lane.length) throw Error('Registered inlet has no Hopper at '+positionKey(p));
    terminal=p;
    for (const {tap:key,anchor} of Object.values(registration.columns || {})) {
        if (!visited.has(key)) continue;
        const tap=lane.find(pos=>positionKey(pos)===key);
        if (block(anchor).typeId!==sorterId) continue;
        for (const dir of [up,down]) {
            let s=anchor;
            while(block(s).typeId===sorterId) {
                spots.set(positionKey(s),{...s,tap});
                s=step(s,dir);
            }
        }
    }
    return {lane, directions, terminal, taps:visited, spots:[...spots.values()].filter(s=>!s.ambiguous)};
}
