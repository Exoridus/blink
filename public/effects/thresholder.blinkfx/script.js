function SynthTime() {
    this.x = Math.random() * 10000;
    this.y = Math.random() * 10000;
    this.z = Math.random() * 10000;
}
SynthTime.prototype.tick = function() {
    noiseTime = {
        r: Math.sin(inputs.synthMacro * 15.01), 
        g: Math.sin(inputs.synthMacro * 11.54), 
        b: Math.sin(inputs.synthMacro * 6.02)
    };
    noiseTimeExp = {
        r: noiseTime.r * noiseTime.r * noiseTime.r * 5,
        g: noiseTime.g * noiseTime.g * noiseTime.g * 5,
        b: noiseTime.b * noiseTime.b * noiseTime.b * 5
    }
    synthTimeDelta = {
        r: inputs.syn_HighLevel * noiseTimeExp.b * inputs.synthScale * inputs.synthSpeed,
        g: inputs.syn_MidLevel * noiseTimeExp.b * inputs.synthScale * inputs.synthSpeed,
        b: inputs.syn_BassLevel * noiseTimeExp.b * inputs.synthScale * inputs.synthSpeed
    };
    this.x += synthTimeDelta.r;
    this.y += synthTimeDelta.g;
    this.z += synthTimeDelta.b;
}

function Freezes() {
    this.hits = [];
}
Freezes.prototype.addhit = function() {
    this.hits.push(1);
}
Freezes.prototype.tick = function() {
    for (var index = 0; index < this.hits.length; index++) {
        this.hits[index] -= 0.01;
        if (this.hits[index] < 0.01) this.hits.splice(index,1);        
    }
}

var synthTime = new SynthTime();
uniforms.synthTime = synthTime;
var freezes = new Freezes();
uniforms.freezes = freezes
uniforms.randomR = Math.random();
uniforms.randomG = Math.random();
uniforms.randomB = Math.random();


uniforms.current_pallete = 1;
function randomizeAllColors() {
    uniforms.randomR1 = Math.random();
    uniforms.randomG1 = Math.random();
    uniforms.randomB1 = Math.random();        
    uniforms.randomR2 = Math.random();
    uniforms.randomG2 = Math.random();
    uniforms.randomB2 = Math.random();        
    uniforms.randomR3 = Math.random();
    uniforms.randomG3 = Math.random();
    uniforms.randomB3 = Math.random();        
    uniforms.randomR4 = Math.random();
    uniforms.randomG4 = Math.random();
    uniforms.randomB4 = Math.random();
}
randomizeAllColors();


function update(data) {
    synthTime.tick();
    if (inputs.syn_Hits > 0.9) {
        uniforms.randomR = Math.random();
        uniforms.randomG = Math.random();
        uniforms.randomB = Math.random();
    }
    freezes.addhit();
    freezes.tick();
    
    if (inputs.random_palette > 0.5) {
        randomizeAllColors();
        uniforms.current_pallete = 0;
    }
    if (inputs.palette1 > 0.5) uniforms.current_pallete = 1;
    if (inputs.palette2 > 0.5) uniforms.current_pallete = 2;
    if (inputs.palette3 > 0.5) uniforms.current_pallete = 3;
    if (inputs.palette4 > 0.5) uniforms.current_pallete = 4;
    if (inputs.palette5 > 0.5) uniforms.current_pallete = 5;
}