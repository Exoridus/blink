// Boreal Scene Script
// Standard Synesthesia script.js with audio-reactive timing

var time = 0.0;


// Main update function - called every frame
function update(dt) {
    
    // print(inputs.syn_PrimeAndBang);

    time += dt * (
    50.0 * pulse_forward +
    60.0 * 0.07 * (syn_BassLevel+syn_HighHits) * scanner_audio_rate 
    +  
    scanner_const_rate * 2.5
    )/ 5.0;
    setUniform("tScript", time);


    // Check for syn_PrimeAndBang trigger and randomize dropdowns if auto_cycle is enabled
    if (syn_PrimeBang > 0.5 && (inputs.auto_cycle > 0.5)||(inputs.cycle>0.5)) {
        // Randomize each dropdown to a valid value
        setControl("wind_movement", Math.floor(Math.random() * 3)); // 0-2
        setControl("warp_type", Math.floor(Math.random() * 4)); // 0-3
        setControl("image_select", Math.floor(Math.random() * 4)); // 0-3
    }
}