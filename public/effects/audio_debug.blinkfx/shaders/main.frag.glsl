void main() {
    vec2 uv = gl_FragCoord.xy / bl_resolution;
    vec3 col = vec3(0.02, 0.02, 0.04);

    if (mode == 1) {
        // ---- SPECTRUM MODE (4-band vertical stack) ----
        float bin = uv.x * 1024.0;
        float i = floor(bin);
        float u = (i + 0.5) / 1024.0;
        vec4 s = texture(fx_spectrum, vec2(u, 0.5));

        float y_raw    = s.r * 0.45;
        float y_juiced = s.g * 0.45;
        float y_smooth = s.b * 0.45;
        float y_wave   = s.a;

        float thresh = 0.04;
        if (uv.y < 0.25) {
            col = vec3(1.0, 0.15, 0.15);
            col *= smoothstep(y_raw - thresh, y_raw, uv.y * 4.0) * smoothstep(y_raw + thresh, y_raw, uv.y * 4.0);
        } else if (uv.y < 0.5) {
            col = vec3(0.15, 1.0, 0.15);
            col *= smoothstep(y_juiced - thresh, y_juiced, (uv.y - 0.25) * 4.0) * smoothstep(y_juiced + thresh, y_juiced, (uv.y - 0.25) * 4.0);
        } else if (uv.y < 0.75) {
            col = vec3(0.15, 0.4, 1.0);
            col *= smoothstep(y_smooth - thresh, y_smooth, (uv.y - 0.5) * 4.0) * smoothstep(y_smooth + thresh, y_smooth, (uv.y - 0.5) * 4.0);
        } else {
            col = vec3(0.9, 0.6, 0.2);
            col *= smoothstep(y_wave - thresh, y_wave, (uv.y - 0.75) * 4.0) * smoothstep(y_wave + thresh, y_wave, (uv.y - 0.75) * 4.0);
        }
    } else if (mode == 2) {
        // ---- HISTOGRAM MODE (4-band vertical stack, newest-left) ----
        float x = uv.x * 400.0;
        float i = floor(x);
        float u = (i + 0.5) / 400.0;
        vec4 h = texture(fx_histogram, vec2(u, 0.5));

        float y_level = h.r * 0.4 + 0.5;
        float y_bass  = h.g * 0.4 + 0.5;
        float y_mid   = h.b * 0.4 + 0.5;
        float y_high  = h.a * 0.4 + 0.5;

        float thresh = 0.007;
        if (uv.y < 0.25) { col = vec3(1.0, 1.0, 0.3); col *= smoothstep(y_level - thresh, y_level, uv.y * 4.0) * smoothstep(y_level + thresh, y_level, uv.y * 4.0); }
        else if (uv.y < 0.5) { col = vec3(1.0, 0.35, 0.2); col *= smoothstep(y_bass - thresh, y_bass, (uv.y - 0.25) * 4.0) * smoothstep(y_bass + thresh, y_bass, (uv.y - 0.25) * 4.0); }
        else if (uv.y < 0.75) { col = vec3(0.2, 0.8, 1.0); col *= smoothstep(y_mid - thresh, y_mid, (uv.y - 0.5) * 4.0) * smoothstep(y_mid + thresh, y_mid, (uv.y - 0.5) * 4.0); }
        else { col = vec3(0.2, 1.0, 0.3); col *= smoothstep(y_high - thresh, y_high, (uv.y - 0.75) * 4.0) * smoothstep(y_high + thresh, y_high, (uv.y - 0.75) * 4.0); }
    } else if (mode == 3) {
        // ---- COMBINED MODE ----
        float splitX = 0.485;
        if (uv.x < splitX) {
            float bin = (uv.x / splitX) * 1024.0;
            float i = floor(bin);
            float u = (i + 0.5) / 1024.0;
            vec4 s = texture(fx_spectrum, vec2(u, 0.5));
            float y = s.r * 0.3 + s.g * 0.4 + s.b * 0.3;
            col = vec3(0.15, 0.8, 1.0);
            col *= smoothstep(y - 0.03, y, uv.y) * smoothstep(y + 0.03, y, uv.y);
        } else {
            float x = ((uv.x - splitX) / (1.0 - splitX)) * 400.0;
            float i = floor(x);
            float u = (i + 0.5) / 400.0;
            vec4 h = texture(fx_histogram, vec2(u, 0.5));
            float y = (h.r + h.g + h.b + h.a) * 0.25 + 0.5;
            col = vec3(1.0, 0.5, 0.1);
            col *= smoothstep(y - 0.007, y, uv.y) * smoothstep(y + 0.007, y, uv.y);
        }
    } else {
        // ---- DASHBOARD MODE (mode == 0) ----
        float panelLeft = 0.66;
        float barLeft = 0.68;

        // === Largest panel: stacked spectrum + waveform ===
        if (uv.x < panelLeft) {
            float relX = uv.x / panelLeft;

            if (uv.y < 0.52) {
                // Spectrum: raw (R), juiced (G), smooth (B) fills
                float bin = relX * 1024.0;
                float i = floor(bin);
                float u = (i + 0.5) / 1024.0;
                vec4 s = texture(fx_spectrum, vec2(u, 0.5));

                float rawFill    = s.r * 0.5;
                float juicedFill = s.g * 0.5;
                float smoothFill = s.b * 0.5;

                float subY = uv.y / 0.52;
                float subX = fract(bin);
                float gap = smoothstep(0.47, 0.5, subX) * 0.6;

                if (subY < rawFill) {
                    col = mix(vec3(1.0, 0.1, 0.15), vec3(0.9, 0.05, 0.2), subY) * (1.0 - gap);
                } else if (subY < juicedFill + rawFill * 0.15) {
                    col = mix(vec3(0.2, 1.0, 0.2), vec3(0.1, 0.8, 0.3), (subY - rawFill) / 0.15) * 0.5 * (1.0 - gap);
                } else {
                    col = mix(vec3(0.3, 0.5, 0.9), vec3(0.15, 0.3, 0.8), subY) * smoothFill * 0.3 * (1.0 - gap);
                }
            } else {
                // Waveform line cluster
                float bin = relX * 1024.0;
                float i = floor(bin);
                float u = (i + 0.5) / 1024.0;
                vec4 s = texture(fx_spectrum, vec2(u, 0.5));

                float waveVal = s.a;
                float waveY = 0.76 + waveVal * 0.22;
                float dist = abs(uv.y - waveY);
                col = vec3(0.9, 0.6, 0.1) * (1.0 - smoothstep(0.0, 0.006, dist)) * 2.0;
            }
        }

        // === Bottom-left: histogram scroll (level + bass + mid + high) ===
        else if (uv.x < barLeft && uv.y > 0.6) {
            float relX = (uv.x - panelLeft) / (barLeft - panelLeft);
            float x = relX * 400.0;
            float i = floor(x);
            float u = (i + 0.5) / 400.0;
            vec4 h = texture(fx_histogram, vec2(u, 0.5));

            float subY = (uv.y - 0.6) / 0.4;
            float y = h.r * 0.22 + h.g * 0.25 + h.b * 0.28 + h.a * 0.25 + 0.5;
            float thresh = 0.01;
            col = vec3(0.2, 0.7, 1.0);
            col *= smoothstep(y - thresh, y, subY) * smoothstep(y + thresh, y, subY) * 1.5;
        }

        // === Right bar strip: scalar meters ===
        float barW = (1.0 - barLeft) / 2.0;

        // Meter labels (top → bottom):
        //  syn_BPMSin8, syn_BPMTri8, syn_RawLevel, syn_InputLevel, syn_Level
        //  syn_Presence, syn_BassHits, syn_MidHits, syn_HighHits
        //  syn_OnBeat, syn_CurvedTime
        float meterStart = 0.06;
        float meterSpacing = 0.082;
        float meterH = 0.06;

        for (int m = 0; m < 14; m++) {
            float top = meterStart + float(m) * meterSpacing;
            float bottom = top + meterH;

            if (uv.y >= top && uv.y <= bottom) {
                float val = 0.0;
                vec3 barCol = vec3(0.5);

                if (m == 0)  { val = syn_BPMSin8;      barCol = vec3(0.9, 0.5, 0.9); }  // BPMSin8
                if (m == 1)  { val = syn_BPMTri8;      barCol = vec3(0.5, 0.7, 0.9); }  // BPMTri8
                if (m == 2)  { val = syn_BPMTwitcher;  barCol = vec3(0.7, 0.4, 0.9); }  // BPMTwitcher
                if (m == 3)  { val = syn_RawLevel;     barCol = vec3(0.95, 0.8, 0.1); } // RawLevel
                if (m == 4)  { val = syn_InputLevel;   barCol = vec3(0.95, 0.9, 0.3); } // InputLevel
                if (m == 5)  { val = syn_Level;        barCol = vec3(0.1, 1.0, 0.3); }  // Level
                if (m == 6)  { val = syn_BassLevel;    barCol = vec3(1.0, 0.25, 0.15); } // BassLevel
                if (m == 7)  { val = syn_MidLevel;     barCol = vec3(0.1, 0.6, 1.0); }  // MidLevel
                if (m == 8)  { val = syn_HighLevel;    barCol = vec3(0.1, 1.0, 0.4); }  // HighLevel
                if (m == 9)  { val = syn_Presence;     barCol = vec3(1.0, 0.8, 0.1); }  // Presence
                if (m == 10) { val = syn_BassHits;     barCol = vec3(1.0, 0.25, 0.1); } // BassHits
                if (m == 11) { val = syn_MidHits;      barCol = vec3(0.1, 0.8, 0.9); }  // MidHits
                if (m == 12) { val = syn_HighHits;     barCol = vec3(0.3, 1.0, 0.3); }  // HighHits
                if (m == 13) { val = syn_OnBeat;       barCol = vec3(1.0, 1.0, 0.3); }  // OnBeat

                float fillX = barLeft + barW * val;
                float barY = (uv.y - top) / meterH;

                if (uv.x > barLeft && uv.x < fillX) {
                    col = mix(barCol * 0.3, barCol, barY);
                } else if (uv.x > barLeft && uv.x < barLeft + barW) {
                    col = vec3(0.06, 0.06, 0.08);
                }

                // Divider line
                if (barY < 0.03 && uv.x > barLeft) {
                    col = vec3(0.1, 0.1, 0.15);
                }
            }
        }

        // === Second bar column: more scalars ===
        float barLeft2 = barLeft + barW + 0.005;
        float barW2 = (1.0 - barLeft2);

        for (int m2 = 0; m2 < 10; m2++) {
            float top = meterStart + float(m2) * meterSpacing;
            float bottom = top + meterH;

            if (uv.y >= top && uv.y <= bottom) {
                float val = 0.0;
                vec3 barCol = vec3(0.5);

                if (m2 == 0) { val = au_bpmConfidence; barCol = vec3(0.4, 0.8, 1.0); } // BPMConf
                if (m2 == 1) { val = float(au_bpm) / 200.0; barCol = vec3(0.8, 0.6, 0.2); } // BPM
                if (m2 == 2) { val = syn_BeatTime / 32.0;  barCol = vec3(0.7, 0.7, 0.3); }  // BeatTime
                if (m2 == 3) { val = syn_CurvedTime;       barCol = vec3(0.5, 0.8, 0.4); }  // CurvedTime
                if (m2 == 4) { val = au_beatPulse;         barCol = vec3(0.9, 0.3, 0.3); }  // BeatPulse
                if (m2 == 5) { val = au_barPulse;          barCol = vec3(0.7, 0.2, 0.5); }  // BarPulse
                if (m2 == 6) { val = syn_BassPresence;     barCol = vec3(1.0, 0.2, 0.1); }  // BassPres
                if (m2 == 7) { val = syn_MidPresence;      barCol = vec3(0.1, 0.5, 1.0); }  // MidPres
                if (m2 == 8) { val = syn_HighPresence;     barCol = vec3(0.3, 1.0, 0.3); }  // HighPres
                if (m2 == 9) { val = au_beatPhase;         barCol = vec3(0.6, 0.4, 0.7); }  // BeatPhase

                float fillX = barLeft2 + barW2 * val * 0.9;
                float barY = (uv.y - top) / meterH;

                if (uv.x > barLeft2 && uv.x < fillX) {
                    col = mix(barCol * 0.3, barCol, barY);
                } else if (uv.x > barLeft2 && uv.x < barLeft2 + barW2 * 0.9) {
                    col = vec3(0.06, 0.06, 0.08);
                }

                if (barY < 0.03 && uv.x > barLeft2) {
                    col = vec3(0.1, 0.1, 0.15);
                }
            }
        }
    }

    fragColor = vec4(col, 1.0);
}
