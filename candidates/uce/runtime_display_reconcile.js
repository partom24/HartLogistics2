/*
 * HL2 replacement for the inherited 1.4.1 full 100-tick display sweep.
 *
 * A 1,387-Sorter world produced recurring ~200-378ms GLOBAL SCRIPT spikes
 * aligned to tick % 100 in owner's Bedrock .mcstats. The original function
 * visited EVERY Sorter and enumerated every loaded display in THREE
 * dimensions on one tick. This replacement is source+generated-main only:
 * addon/1.4.1 remains byte-identical.
 *
 * Work is amortized across ticks. Existing local display helpers still
 * preserve original filter item visuals and native-frame semantics; block
 * removal still cleans its own owned display through removeEntry/removeDisplay.
 * Never scan dimension-wide entities as part of routine maintenance.
 *
 * This budget only governs visual maintenance, NOT arbitrary construction,
 * functional routing throughput, queue custody or Sorter placement geometry.
 */
const UCE_DISPLAY_MAINTENANCE_BATCH=16;
let uceDisplayMaintenanceCursor=0;
function uceReconcileDisplaysIncremental(){
    if(!ready||!Array.isArray(registry)||registry.length===0){
        uceDisplayMaintenanceCursor=0;
        return;
    }
    const length=registry.length;
    const count=Math.min(UCE_DISPLAY_MAINTENANCE_BATCH,length);
    const start=ucePerfEnabled?Date.now():0;
    for(let i=0;i<count;i++){
        const entry=registry[(uceDisplayMaintenanceCursor+i)%length];
        if(!entry)continue;
        try{
            const block=sorterAt(entry);
            if(!block)continue; // unloaded is unknown, NOT a stale owner
            if(entry.f&&!entryHasFrameImplant(entry))
                syncDisplay(entry);
            else
                removeDisplay(entry);
        }catch(_){
            // One malformed/unavailable block must never starve every other
            // visual maintenance slot, and must not mutate any custody data.
            ucePerfNotice('display_maintenance_entry','unavailable');
        }
    }
    uceDisplayMaintenanceCursor=(uceDisplayMaintenanceCursor+count)%length;
    if(ucePerfEnabled){
        const elapsed=Date.now()-start;
        ucePerfStats.displaySlices++;
        ucePerfStats.displayChecked+=count;
        if(Number.isFinite(elapsed)&&elapsed>=0){
            ucePerfStats.maxDisplaySliceMs=Math.max(
                ucePerfStats.maxDisplaySliceMs,elapsed);
            if(elapsed>=UCE_PERF_SLOW_TICK_MS){
                ucePerfStats.slowDisplaySlices++;
                ucePerfNotice('slow_display_slice',
                    'elapsed_ms='+elapsed+' checked='+count);
            }
        }
    }
}
