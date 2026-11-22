// Each scenario starts with independent script callbacks, blocks and properties.
const {execFileSync}=require('node:child_process');
const {test}=require('node:test');
const {join}=require('node:path');
for(const scenario of ['--column-budget','--q4-route']){
    test(scenario,()=>execFileSync(process.execPath,[join(__dirname,'mock_routing_test.cjs'),scenario],{stdio:'inherit'}));
}
