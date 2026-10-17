function Timer() {
    this.time = 0.0;
}

Timer.prototype.updateTime = function (rate, val, dt) {
    this.time = this.time + rate * dt * val;
};

var bassTimevar = new Timer();
var timevar = new Timer();

function update(dt) {

    try {
        bassTimevar.updateTime(1.0, inputs.rate + inputs.rate * (inputs.syn_Level * inputs.syn_Hits + inputs.syn_BassPresence), dt);
        timevar.updateTime(1.0, inputs.rate, dt);

        uniforms.script_time = timevar.time;
        uniforms.bass_time = bassTimevar.time;

    } catch (e) {
        print(e);
    }

}
