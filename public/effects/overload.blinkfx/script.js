// Overload Scene Script
// Handles dropdown randomization on musical transitions

var spinTime = 0.0;
var everyBeat = 0.0;
function update(dt) {

    spinTime += 20.0*(syn_Level+syn_Presence)*(dt/60.0);
    uniforms.spinTime = spinTime;
    if (syn_OnBeat>0.999){
        everyBeat+=1;
    }
    uniforms.everyOtherBeat = Math.floor(everyBeat/2.0);
    // Check for syn_PrimeBang trigger and randomize dropdowns if auto_cycle is enabled
    if ((inputs.cycle > 0.5) || (syn_PrimeBang > 0.5 && inputs.auto_cycle > 0.5)) {
        // Randomize distortion type (0-3: None, Melting, Wrapping, Full Melt)
        setControl("distortion_type", Math.floor(Math.random() * 4));
        
        // Randomize color scheme (0-4: Default, Green Mix, Teal Mix, Red Noise, HSV Rainbow)
        setControl("color_scheme", Math.floor(Math.random() * 5));
    }
}