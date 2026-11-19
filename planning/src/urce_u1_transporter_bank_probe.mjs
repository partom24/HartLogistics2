/**
 * URCE U1 — visual Transporter bank-component observer, source only.
 *
 * This identifies bounded, locally loaded face-connected Transporter runs
 * and their directly adjacent verified Hart endpoints. It DOES NOT assign
 * a cargo direction, native custody, bank controller, item destination,
 * link acceptance, or authoritative missing-path result.
 *
 * A connected component may contain branches/multiple runs: it is only
 * labeled a candidate individual BANK if exactly one Receiver and one
 * Collector are observed on a simple, complete non-branching run.
 * The owner defines a bank as a physical transport run, never a network.
 */
const FACES=[
  {x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},
  {x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}
];
const TYPES={
  collector:"hartsorter:collector",receiver:"hartsorter:receiver",
  sorter:"hartsorter:sorter",bulk:"hartsorter:bulk_storage"
};
const PIPE="hartsorter:transporter";
const coord=(e)=>({x:e.x,y:e.y,z:e.z});
const offset=(p,v)=>({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});
const valid=(e)=>!!e&&typeof e.id==="string"&&e.id.length>0&&
  typeof e.d==="string"&&e.d.length>0&&
  Object.hasOwn(TYPES,e.kind)&&[e.x,e.y,e.z].every(Number.isSafeInteger);
const loc=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;

export function observeTransporterComponents({
  anchors,getBlock,maxReads=16000,maxTransporters=8192
}) {
  const invalid=(reason)=>({status:"INVALID",reason,components:[],
    unresolved:[],reads:0,coverageComplete:false,mayAuthorizeLink:false});
  if(!Array.isArray(anchors)||typeof getBlock!=="function"||
    !Number.isSafeInteger(maxReads)||maxReads<1||
    !Number.isSafeInteger(maxTransporters)||maxTransporters<1)
    return invalid("invalid_observer_arguments");
  const ids=new Set(),locations=new Set();
  for(const a of anchors){
    if(!valid(a)||ids.has(a.id))return invalid("invalid_or_duplicate_anchor");
    ids.add(a.id);
    const l=loc(a.d,a);
    if(locations.has(l))return invalid("overlapping_anchors");
    locations.add(l);
  }
  const cache=new Map(),unresolved=[];
  let reads=0;
  function read(d,p) {
    const l=loc(d,p);
    if(cache.has(l))return cache.get(l);
    let result;
    if(reads>=maxReads)result={state:"UNKNOWN",reason:"read_budget"};
    else{
      reads++;
      try{
        const b=getBlock(d,p);
        result=b&&typeof b.typeId==="string"
          ?{state:"KNOWN",type:b.typeId}
          :{state:"UNKNOWN",reason:"chunk_unavailable"};
      }catch(_){result={state:"UNKNOWN",reason:"get_block_failed"};}
    }
    cache.set(l,result);
    return result;
  }
  const byPos=new Map(anchors.map(a=>[loc(a.d,a),a]));
  const loadedIds=new Set();
  for(const anchor of anchors){
    const b=read(anchor.d,coord(anchor));
    if(b.state==="KNOWN"&&b.type===TYPES[anchor.kind])
      loadedIds.add(anchor.id);
    else unresolved.push({anchor:anchor.id,reason:b.state==="UNKNOWN"
      ?b.reason:"anchor_type_changed"});
  }
  const seeds=[];
  for(const anchor of anchors){
    if(!loadedIds.has(anchor.id))continue;
    for(const v of FACES){
      const at=offset(anchor,v),b=read(anchor.d,at);
      if(b.state==="UNKNOWN"){
        unresolved.push({anchor:anchor.id,reason:b.reason});continue;
      }
      if(b.type===PIPE)seeds.push({d:anchor.d,...at});
    }
  }
  const visited=new Set(),components=[];
  for(const seed of seeds){
    const root=loc(seed.d,seed);
    if(visited.has(root))continue;
    const queue=[seed];visited.add(root);
    const endpoints=new Set();let branching=false,unknown=false;
    let memberCount=0;
    for(let i=0;i<queue.length;i++){
      if(memberCount>=maxTransporters){
        unknown=true;
        unresolved.push({component:components.length+1,reason:"transporter_budget"});
        break;
      }
      memberCount++;
      const cur=queue[i];
      let neighborPipes=0;
      for(const v of FACES){
        const p=offset(cur,v),k=loc(cur.d,p),b=read(cur.d,p);
        if(b.state==="UNKNOWN"){
          unknown=true;unresolved.push({component:components.length+1,reason:b.reason});
          continue;
        }
        if(b.type===PIPE){
          neighborPipes++;
          if(!visited.has(k)){
            visited.add(k);queue.push({d:cur.d,...p});
          }
        } else{
          const anchor=byPos.get(k);
          if(anchor&&loadedIds.has(anchor.id) && b.type===TYPES[anchor.kind])
            endpoints.add(anchor.id);
        }
      }
      if(neighborPipes>2)branching=true;
    }
    const endpointIds=[...endpoints].sort();
    const receiverIds=endpointIds.filter(id=>
      anchors.find(a=>a.id===id)?.kind==="receiver");
    const collectorIds=endpointIds.filter(id=>
      anchors.find(a=>a.id===id)?.kind==="collector");
    const possibleBank=!unknown&&!branching&&
      receiverIds.length===1&&collectorIds.length===1;
    components.push({
      id:"component-"+(components.length+1),transporters:memberCount,
      endpointIds,receiverIds,collectorIds,
      branching,unknown,classification:possibleBank
        ?"CANDIDATE_SINGLE_BANK":"UNCLASSIFIED_COMPONENT"
    });
  }
  return {
    status:unresolved.length?"INCOMPLETE":"OBSERVED",
    components,unresolved,reads,
    // This observer shows only visual adjacency. Even when every observed
    // block was loaded it cannot certify native cargo direction, nor
    // guarantee an unobserved branch is absent.
    coverageComplete:false,mayAuthorizeLink:false
  };
}

/**
 * Early conservative *risk* check. A physically connected visual run
 * between Receiver and Collector is a POSSIBLE supply leg, not a verified
 * native return. Link issuance must await a separate directed observer.
 */
export function evaluateVisualBankLoopRisk({
  observation,collectorId,receiverId,links=[]
}) {
  const hold=reason=>({decision:"HOLD",reason,persistPermitted:false});
  if(!observation||observation.status==="INVALID"||
     !Array.isArray(observation.components)||!Array.isArray(links))
    return hold("invalid_visual_observation");
  if(typeof collectorId!=="string"||typeof receiverId!=="string")
    return hold("invalid_link_endpoint");
  const adjacency=new Map();
  const add=(a,b)=>{
    if(!adjacency.has(a))adjacency.set(a,new Set());
    adjacency.get(a).add(b);
  };
  for(const c of observation.components){
    // Do not treat the whole connected component as a bank with one
    // controller. Every observed receiver->collector is only a possible
    // directed physical supply leg, NEVER a proven movement route.
    for(const r of c.receiverIds)for(const col of c.collectorIds)add(r,col);
  }
  for(const link of links){
    if(!link||typeof link.from!=="string"||typeof link.to!=="string")
      return hold("invalid_saved_link");
    add(link.from,link.to);
  }
  const queue=[receiverId],seen=new Set(queue);
  for(let i=0;i<queue.length;i++){
    const at=queue[i];
    if(at===collectorId)return hold("potential_supply_cycle");
    for(const next of adjacency.get(at)||[]){
      if(!seen.has(next)){seen.add(next);queue.push(next);}
    }
  }
  return hold("visual_topology_not_directed_cargo_proof");
}
