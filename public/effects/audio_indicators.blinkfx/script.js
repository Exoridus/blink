var tracker = 0.0;
var trackerSmooth = 0.0;
var trackerSmoothId = 0.0;

function update(dt) {

	if (inputs.syn_InputLevel > tracker){
		tracker = inputs.syn_InputLevel;
	} else {
		tracker -= (tracker-inputs.syn_InputLevel)*0.05;
	}

	var mixVal = 0.04;
	trackerSmooth = inputs.syn_InputLevel*mixVal+trackerSmooth*(1.0-mixVal);

	if (trackerSmooth > trackerSmoothId){
		trackerSmoothId = trackerSmooth;
	} else {
		trackerSmoothId -= (trackerSmoothId-trackerSmooth)*0.05;
	}

  uniforms.inputTrackerScript = tracker;
  uniforms.trackerSmoothScript = trackerSmooth;
  uniforms.trackerSmoothIDScript = trackerSmoothId;
}
