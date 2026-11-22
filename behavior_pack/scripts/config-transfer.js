// Run only in the isolated migration entry point under the original pack identity.
import {previewConfiguration} from './config-preview.js';

export async function transferConfiguration(world,queue,apply,pause){
    const plan=previewConfiguration(world,queue);
    const entries=[...plan.settings].map(([k,v])=>[k,JSON.stringify(v)]);
    const rosterKey='hartlab:config_roster_'+queue;
    const roster=JSON.stringify([plan.target,entries.map(([k])=>k).sort()]);
    const saved=world.getDynamicProperty(rosterKey);
    if(saved!==undefined && saved!==roster)throw Error('Saved terminal or setting membership changed');
    if(apply && saved===undefined){
        world.setDynamicProperty(rosterKey,roster);
        if(world.getDynamicProperty(rosterKey)!==roster)throw Error('Configuration roster readback failed');
    }
    let written=0;
    for(let i=0;i<entries.length;i++){
        if(i && i%8===0)await pause();
        const [key,value]=entries[i];
        const existing=world.getDynamicProperty(key);
        if(existing===value)continue;
        if(existing!==undefined || !apply)throw Error('Missing or conflicting setting '+key);
        world.setDynamicProperty(key,value);
        if(world.getDynamicProperty(key)!==value)throw Error('Setting readback failed '+key);
        written++;
    }
    const current=previewConfiguration(world,queue);
    if(current.target!==plan.target || current.settings.size!==entries.length ||
        world.getDynamicProperty(rosterKey)!==roster)throw Error('Configuration changed or roster missing');
    for(const [key,value] of entries){
        if(JSON.stringify(current.settings.get(key))!==value || world.getDynamicProperty(key)!==value)
            throw Error('Final configuration mismatch '+key);
    }
    return {target:plan.target,settings:entries.length,written};
}
