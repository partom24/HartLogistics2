// A lane follows native Hopper outputs or face-connected Transporters.
export const HOPPER = 'minecraft:hopper';
export const PIPE = 'hartlogistics:transporter';
export const isTransport = id => id===HOPPER || id===PIPE;
const down = [0,-1,0], up = [0,1,0];
const faces = [down, undefined, [0,0,-1], [0,0,1], [-1,0,0], [1,0,0]];
export const neighbors = [up, ...faces.filter(Boolean)];
export const positionKey = p => [p.x,p.y,p.z].join(',');
export const step = (p,[x,y,z]) => ({x:p.x+x,y:p.y+y,z:p.z+z});

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
        neighbors.map(face => step(receiver,face)).filter(p => isTransport(block(p).typeId));
    if (ports.length !== 1) throw Error('Found '+ports.length+' adjacent transport inlets. Select the inlet with hartlab:bind_inlet.');
    const directions=[], lane = [], visited = new Set(), spots = new Map();
    function column(p,tap,dir) {
        while (block(p).typeId === sorterId) {
            const k = positionKey(p), existing = spots.get(k);
            if (!existing) spots.set(k,{...p,tap});
            else if (positionKey(existing.tap)!==positionKey(tap)) existing.ambiguous = true;
            p = step(p,dir);
        }
    }
    const method=block(ports[0]).typeId;
    const parents=new Map();
    let terminal;
    if(method===PIPE){
        // Breadth-first order gives downstream branches a deterministic tap order.
        lane.push(ports[0]);
        visited.add(positionKey(ports[0]));
        for(let index=0;index<lane.length;index++){
            const current=lane[index];
            for(const face of neighbors){
                const next=step(current,face), key=positionKey(next);
                if(visited.has(key) || block(next).typeId!==PIPE)continue;
                visited.add(key);
                parents.set(key,current);
                lane.push(next);
            }
        }
    }else{
        let p = ports[0];
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
            p=next;
        }
        if (!lane.length) throw Error('Registered inlet has no Hopper at '+positionKey(p));
        if(block(p).typeId===PIPE)throw Error('Hopper output enters a Transporter. Use a dedicated lane for each method.');
        terminal=p;
    }
    const bulk=new Map();
    for(const [tapIndex,p] of lane.entries()){
        for (const side of neighbors) {
            const start = step(p,side);
            if(block(start).typeId==='hartlogistics:bulk_storage' && !bulk.has(positionKey(start)))
                bulk.set(positionKey(start),{...start,tapIndex});
            if (block(start).typeId!==sorterId) continue;
            column(start,p,up);
            column(start,p,down);
        }
    }
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
    // Follow lane order, keep each physical column together, then order Sorters
    // from its lowest eligible Sorter to its highest. Do this once per discovery.
    const tapOrder=new Map(lane.map((tap,i)=>[positionKey(tap),i]));
    const ordered=[...spots.values()].filter(s=>!s.ambiguous);
    ordered.sort((a,b)=>tapOrder.get(positionKey(a.tap))-tapOrder.get(positionKey(b.tap))
        || a.x-b.x || a.z-b.z || a.y-b.y);
    return {bulk:[...bulk.values()],method, parents, lane, directions, terminal, taps:visited, spots:ordered};
}
