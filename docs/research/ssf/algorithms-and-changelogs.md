# SSF 1.25.2 — Nachvollziehbare Berechnungen und Versionsstrategie

**Basis:** Nutzerarchiv `Synesthesia_SSF_Final_Closure_2026-10-11(4).zip`, darin `final/02_UNIFORMS.csv`, `final/03_DSP_SPEC.md`, ausführbarer Referenzcode unter `final/reference/syn_ssf/`, `final/12_IPP_FFT_SPEC.md`, `final/16_BLINKFX_FINAL_SSF_SPEC.md`, `final/23_FINAL_SSF_COMPATIBILITY_MATRIX.csv`, `final/24_SSF_FREEZE_CANDIDATE.md`. Historische Changelogs aus der offiziellen [Chronik](https://app.synesthesia.live/docs/resources/changelogs.html). Erstellungsdatum 2026-10-13.

## Was „algorithmisch 1:1“ hier bedeutet

Der native Kern wurde für identifizierte Konstruktor-/Update-Pfade gegen realen 32-bit-x86-Code und Emulator-Ausgaben auf qualifizierten Eingabesätzen abgeglichen. Der Quellvertrag enthält native Float-Rundungs- und Ausführungsreihenfolgen, Fenster, Tabellen, Zustände, Bedingungen und Host-Semantik. Das beweist keine umfassende BlinkFX-End-to-End-Parität oder beliebige Eingabekombinationen.

**51 Native-Registry-Einträge = 43 skalare Generatoren + 8 Array-Producer.** Davon sind einzelne Wrapper nahezu Getter; ihre vorgelagerte Producer-Logik ist deswegen nicht trivial. 92 Namen im historischen Inventory umfassen außerdem Shader-Builtins, JS-Control-Namen, Host-Sampler und Kandidaten (nicht 92 Native-Generatoren).

## Rechenpipeline und charakteristische Parameter

`mono float32 PCM → 2048-Sample-Sliding-History → Blackman(N−1) → IPP-DFT(2048, 1/√2048) → Re/Im/Magnitude/Power/Phase → 5 Main-Bänder + 22 BPM-Bänder + 35 Smooth-Bänder + F1…F5 → 43 skalare Generatoren / 8 Array-Producer → Pack RGBA32F → GL_TEXTURE_1D(1024 / 400) → GLSL`. BPM-Kern verwendet gesondert 22 Bandhistorien je 1024 Analyse-Frames, Neuberechnung in jedem 12. Audio-Feature-Update.

| Native Eigenheit | Konkreter Vertrag |
|---|---|
| Audio-Frontend | 2048er Fenster, 1024 positive Frequenzbins, 44100Hz interne Skala, Blackman mit N−1, IPP-FFT-Skala 1/√2048, Power statt Magnitude zur Bandintegration |
| Main-Bands | (0,250), (250,1000), (1000,4000), (2000,4000), (4000,22050) Hz; teilweise überlappend |
| BPM | 22 Bänder, je 1024er Verlauf, Blackman, Frequenzbins 10…43, komplexe Subbin-Korrektur, Voting-Ring 60 bzw. 120 gespiegelte Slots, EMA-Confidence |
| Smooth | 35 Bänder als Input, exakt 33 gewichtete Spalten, approximierte Vector-exp-Gewichte, dB-Gate/Float-Akkumulationsordnung, rekursiver Zustand |
| Juiced | Bin 279 als Gruppierungsübergang, 1024 Slots, exp-Gewichte, 15-Tap-Symmetriefilter mit 8 originalen float32 Taps, pro Aufruf neue FIR-Scratch-Slots |
| TimeSeries | Pro Frame 400er Ring, gedoppelt zu 800 float-Werten, neuer Wert 0,6·input + 0,4·prev; neuester an Index 399 |
| GPU | syn_Spectrum RGBA32F × 1024, syn_LevelTrail RGBA32F × 400; lineares Sampling + GL_REPEAT; nicht bytequantisiert |

### Beispiel: Alle acht originalen Juiced-FIR-Gewichte (binär32)

Der 15-Tap-Filter ist symmetrisch aufgebaut und nutzt diese acht unabhängigen Float32-Werte; **jede Zahl und ihre 32-Bit-Repräsentation** stammt aus `03_DSP_SPEC.md` und dem Original-Binary. Ein normaler frei gewählter Gaussian Blur wäre kein kompatibler Ersatz.

| Hex-Bits | Float32-Wert |
|---|---:|
| `0x3E882C1C` | 0.26596152782440186 |
| `0x3E5A1396` | 0.21296533942222595 |
| `0x3DDFEDAD` | 0.10934004932641983 |
| `0x3D136E6C` | 0.03599397838115692 |
| `0x3BF8F2F9` | 0.007597323972731829 |
| `0x3A86C432` | 0.0010281859431415796 |
| `0x38BB1BBB` | 0.00008922020060708746 |
| `0x36A6906F` | 0.000004963999799656449 |

Die aufsummierte symmetrische 15-Tap-Gewichtung ist ≈ 0,9999996503165676, nicht exakt 1. `syn_SpectrumSmooth` wiederum nutzt nicht diesen FIR, sondern eine **separate native 33-spaltige Gewichtsmatrix**, deren exp-Approximation und x87-Akkumulationsordnung in `22_SMOOTH_IPP_PRECISION_REPORT.md` nachvollzogen sind. Auch die 66 extrahierten Konstanten, die 22 BPM- und 35 Smooth-Bandgrenzen liegen im Quellarchiv maschinenlesbar vor.

## Individuelle Producer-Namen und Werteherkunft

Die nachfolgenden Beschreibungen sind **Kurzsemantik**, nicht das vollständige, instruktionstreue Pseudocode-Programm. Wo die ältere CSV widerspricht, ist die oben genannte *aktuelle* `reference/syn_ssf/*.py` maßgeblich. Für vollständige Float-Assoziation, Randfälle und PCode-Belege die angegebenen Dateien verwenden.

| Name | Klasse | Werteherkunft / Synesthesia-Berechnung | Native Update |
|---|---|---|---|
| `TIME` | Skalar (berechnet) | Basistimer: t += f32(2q·dt); q = Audio Speed (nicht wall clock). | `0x8C7420` |
| `syn_FadeInOut` | Skalar (berechnet) | target = r<0.5 ? (1-2r)+band(0)*2r : band(0); st += target>0.05 ? 9*target*dt : st*(1-0.3*dt); st=min(st;1) | `0x8C7D10` |
| `syn_Intensity` | Skalar (berechnet) | st += band(0)>0.1 ? 0.18*band(0)*dt : st*(1-1.56*dt); st=min(st;1) | `0x8C7E00` |
| `syn_PrimeBang` | Skalar (berechnet) | P = band2(sel0)/3, dt-basierte Akkumulation; Re-arm und Schwellkurven: r<0,5 Interpolationen 60→20/90→30/180→60; Puls ab 1,15 oder Schwelle mit Zeit; verbraucht Arming und Timer. | `0x8C77C0` |
| `syn_RawLevel` | Skalar (berechnet) | x=sanitized(raw0(0)) (NaN/Inf->0); mx=max(x;st); st' = (1-0.03*dt_d)*mx; out = x/mx (native-verified) | `0x8C7470` |
| `syn_InputLevel` | Skalar (einfacher Getter) | Direkter selektorbasierter Getter auf native Audio-Feature; kein weiterer Filter im Uniform-Wrapper. | `0x8C7540` |
| `syn_Level` | Skalar (berechnet) | out=smoother0(obj+0x10; r<0.5?clamp01(2b)*sqrt(2r):clamp01(2b); dt); release rate 0.98+0.015*(1-2r) or 0.98-0.08*(2r-1) | `0x8C66D0` |
| `syn_HighLevel` | Skalar (berechnet) | same as syn_Level with sel=6 | `0x8C66D0` |
| `syn_MidHighLevel` | Skalar (berechnet) | same with sel=3 | `0x8C66D0` |
| `syn_MidLevel` | Skalar (berechnet) | same with sel=5 | `0x8C66D0` |
| `syn_BassLevel` | Skalar (berechnet) | same with sel=2 | `0x8C66D0` |
| `syn_Hits` | Skalar (berechnet) | out=smoother0(obj+0x10; clamp01(r<0.5? h*sqrt(2r): lerp(h;2h^2;2r-1)); dt); h=0.6667*band2(0) | `0x8C7360` |
| `syn_HighHits` | Skalar (berechnet) | same with sel=6 | `0x8C7360` |
| `syn_MidHighHits` | Skalar (berechnet) | same with sel=3 | `0x8C7360` |
| `syn_MidHits` | Skalar (berechnet) | same with sel=5 | `0x8C7360` |
| `syn_BassHits` | Skalar (berechnet) | same with sel=2 | `0x8C7360` |
| `syn_Time` | Skalar (berechnet) | acc = f32(acc + f32(f32(2q * 7.5) * f32(s·dt))); s = geglättetes Band; r<0,5: lerp(0,3, clamp01(2b),2r); sonst nichtlineare Kurve. Siehe uniforms.py, 03. | `0x8C7AE0` |
| `syn_HighTime` | Skalar (berechnet) | same with sel=6 | `0x8C7AE0` |
| `syn_MidHighTime` | Skalar (berechnet) | same with sel=3 | `0x8C7AE0` |
| `syn_MidTime` | Skalar (berechnet) | same with sel=5 | `0x8C7AE0` |
| `syn_BassTime` | Skalar (berechnet) | same with sel=2 | `0x8C7AE0` |
| `syn_BeatTime` | Skalar (berechnet) | Beat-Sperre 0,12s, adaptive Schwelle 0,75−0,5r; Zähler +1 nur wenn Beat und r,q>0,001. | `0x8C6BE0` |
| `syn_CurvedTime` | Skalar (berechnet) | s = smoother(band); r<0,5: lerp(0,125,s²,2r), sonst lerp(s²,2,5·s⁴,2r); acc = f32(acc + f32(f32(2q·7,5)·f32(c·dt))). | `0x8C7C30` |
| `syn_OnBeat` | Skalar (berechnet) | out = r>=0.001 ? smoother0(obj+0x18;beat?1:0;dt) : 0; release rate=0.2+0.399*(0.5-r); beat iff armed && P>=0.75-0.5r; P=band2(7)/3 | `0x8C6910` |
| `syn_ToggleOnBeat` | Skalar (berechnet) | P = band2(sel7)/3, Beat-Sperre 0,12s; Ziel 0↔1 auf Beat; Übergang per exp-basierter tanh(3t), native Steigung −7,2; voriger Wert gespeichert. | `0x8C6A60` |
| `syn_RandomOnBeat` | Skalar (berechnet) | P = band2(sel7)/3; Beat-Sperre 0,12 s; native rand()%1000/1000, Mindestzielabstand 0,3; y = prev + (target-prev)/(1+exp(-6t)); Seed/TLS beachtet. | `0x8C6D10` |
| `syn_BassExpoCurve` | Skalar (berechnet) | out = (2r>=1e-4) ? (pow(50+400r; s)-1)/(49+400r) : 0; s=smoother0(obj+0x14;band(2);dt) | `0x8C6830` |
| `syn_Presence` | Skalar (berechnet) | Adaptive Hi/Lo-Hüllkurve; interner smoother-Alpha 0,0115525; Releasefaktor 0,03·(2r)³; normalisiere (cur−lo)/(hi−lo), Guard 1e−7; bei r<0,1 ×10r. | `0x8C75B0` |
| `syn_HighPresence` | Skalar (berechnet) | Wie syn_Presence mit High-Selektor 6. | `0x8C75B0` |
| `syn_BassPresence` | Skalar (berechnet) | Wie syn_Presence mit Bass-Selektor 2. | `0x8C75B0` |
| `syn_MidPresence` | Skalar (berechnet) | Wie syn_Presence mit Mid-Selektor 5. | `0x8C75B0` |
| `syn_MidHighPresence` | Skalar (berechnet) | Wie syn_Presence mit MidHigh-Selektor 3. | `0x8C75B0` |
| `syn_BPM` | Skalar (einfacher Getter) | Veröffentlichter BPM-Wert aus nativer 22-Band-Voting-/Confidence-Engine; Getter selbst nur Weitergabe. | `0x8C6E90` |
| `syn_BPMSin` | Skalar (berechnet) | sin(ph·6,28318 + 1,570795), danach (sin+1)/2·confidence; Phase += stepped(q)·BPM·dt/60. | `0x8C6EE0` |
| `syn_BPMTri` | Skalar (berechnet) | Native BpmOsc gibt bei Tri-Variante ph·confidence zurück; Phase += stepped(q)·BPM·dt/60; wrap nach >1. Offizielle Benennung „Tri“ darf nicht über native Formel hinwegtäuschen. | `0x8C6FE0` |
| `syn_BPMSin2` | Skalar (berechnet) | Wie BPMSin, Inkrement durch 2. | `0x8C6EE0` |
| `syn_BPMTri2` | Skalar (berechnet) | Wie BPMTri, Phaseninkrement zusätzlich durch 2. | `0x8C6FE0` |
| `syn_BPMSin4` | Skalar (berechnet) | Wie BPMSin, Inkrement durch 4. | `0x8C6EE0` |
| `syn_BPMTri4` | Skalar (berechnet) | Wie BPMTri, Phaseninkrement zusätzlich durch 4. | `0x8C6FE0` |
| `syn_BPMSin8` | Skalar (berechnet) | Wie BPMSin, Inkrement durch 8. | `0x8C6EE0` |
| `syn_BPMTri8` | Skalar (berechnet) | Wie BPMTri, Phaseninkrement zusätzlich durch 8. | `0x8C6FE0` |
| `syn_BPMTwitcher` | Skalar (berechnet) | ph += scale(q)*bpm*dt/60 (no wrap); r<0.5: out=2r*(floor(ph)+1-exp(-9f))+(1-2r)*dt; r>=0.5: out=floor(ph)+1-exp(f*(-9-25*(2r-1))); f=ph-floor(ph) | `0x8C70A0` |
| `syn_BPMConfidence` | Skalar (berechnet) | out = clamp01(bandU(0xc)+r-0.5) | `0x8C72E0` |
| `syn_Spectrum` | Array (berechnet) | Power-Spektrum (nicht FFT-Rohwerte), Floor 1e−5, x ↦ 1 + ln(x)·0,08685889095; r-abhängige kubische Wurzel bzw. nichtlineare Quadratik/Blend. | `0x8C19D0` |
| `syn_SpectrumJuiced` | Array (berechnet) | gain-Abklingen 0,9999899864; Eingangs-Floor; indexabhängige exp-Gewichte, Expansion/Grouping ab Bin 279, eigener Log2, 15-Tap-FIR mit 8 Original-tap-Bitmustern, Attack/Release und r-Kompression. | `0x8C2320 + 0x8C1E30` |
| `syn_SpectrumSmooth` | Array (berechnet) | 35 Frequenzbänder als Eingabe, 33 aktive native Gewichte, vektorisierte exp-Approximation; logarithmisches dB-Gate 2,3…45, binabhängiger Boost und float32-Rekursion; 8192 und spätere Native-Gates bitgleich. | `0x8C1480` |
| `syn_Waveform` | Array (berechnet) | pro Sample f32(0,5·(1 + clamp(src·2r,−1,1))); 1024 Werte mit spezieller Kurzinput-Behandlung. | `0x8C29F0` |
| `syn_TimeSeries` | Array (berechnet) | Pro Renderframe 0,6·clamp(2·band,0,1) + 0,4·prev, 400er Ring ×2 gespiegelt; neuester an Index 399. | `0x8C27A0` |
| `syn_BassTimeSeries` | Array (berechnet) | Wie syn_TimeSeries, Bass-Band-Selektor. | `0x8C27A0` |
| `syn_MidTimeSeries` | Array (berechnet) | Wie syn_TimeSeries, Mid-Band-Selektor. | `0x8C27A0` |
| `syn_HighTimeSeries` | Array (berechnet) | Wie syn_TimeSeries, High-Band-Selektor. | `0x8C27A0` |

### Nicht als Native-Producer zählen

- **SHADER_BUILTIN (10):** `FRAMECOUNT`, `RENDERSIZE`, `_xy`, `_uv`, `_uvc`, `_mouse`, `_click`, `_muv`, `_muvc`, `PASSINDEX`.
- **HOST_BINDING (6):** `syn_FinalPass`, `syn_Media`, `syn_MediaType`, `syn_LevelTrail`, `syn_UserImage`, `syn_MetaControls`.
- **JS_CONTROL (21):** `_Master`, `_High_Color`, `_Paused`, `_Vert_Mirror`, `_Brightness`, `_Transition`, `_Gamma`, `_Contrast`, `_Vert_Flip`, `_Hue`, `_Saturation`, `_Invert`, `_Low_Color`, `_Hor_Mirror`, `_Media_Contrast`, `_Invert_Media`, `_Fit_or_Fill`, `_Hor_Flip`, `_Playback_Speed`, `_Limit_Colors`, `_Alpha_Channel`.
- **CANDIDATE (3):** `syn_Threshold`, `syn_Beat`, `syn_Debug`.
- **GLSL_CONSTANT (1):** `PI`.

`syn_Threshold` ist im Alt-Runtime-AUD3 als JS-sichtbar belegt, jedoch **keine** der 51 registrierten Native-Quellen. Ähnlich ist `syn_LevelTrail` ein Host-Texture-Binding, nicht ein skalarer Generator. Es existieren ferner 121 GLSL-Helper und 62 Scene-JSON-Keys in `final/23` (359 Einträge insgesamt); nur das jeweils relevante Producer-/Consumer-Profil vergleichen.

## Offizielle Changelog-Epochen – SSF-relevant

Der offizielle öffentliche Changelog-Index listet Versionen 1.0…1.25.2; 1.3 war beim Abruf nicht erreichbar; 1.25.3/1.25.4 sind nicht in diesem Index. Jede Zeile bündelt mehrere Patchlogs nach semantischem Einschnitt, nicht nach jedem UI-Fix.

| Version/Epoche | Dokumentierte Änderung | Folgerung für Profilvergleich |
|---|---|---|
| [1.0–1.6](https://www.synesthesia.live/public-release/changelog/1.5.html) | SSF/Scenes/Controls entstehen; 1.5 `.synScene` und `syn_MediaType`; 1.6 Control Groups sowie Wegfall `ImageOnSilence` zugunsten `Contrast`. | Vor-1.17-Szenen, frühere Meta-Control-Namen. |
| [1.9–1.11](https://www.synesthesia.live/public-release/changelog/1.11.html) | 1.9 Brightness/Contrast/Gamma/Hue/Saturation; 1.10 Contrast-Fix; 1.11 Importer `.synScene`/ISF/Shadertoy. | Alte Color-Grading-/Importer-Semantik getrennt betrachten. |
| [1.15–1.16](https://www.synesthesia.live/public-release/changelog/1.16.3.3.html) | 1.15 Trial-Nutzer bereits erwähnt; 1.16 Preset-/Control-Migration und Control-Groups; 1.16 SceneJSON-Float-Save-Fix. | Trial existierte bereits vor 1.17; frühere Szenen nicht automatisch 1.25-ABI. |
| [1.17](https://www.synesthesia.live/public-release/changelog/1.17.5.24.html) | Reactivity und Audio Speed, keep-time beim Reload, Pro-variable resolution. | Audio-Speed- und Reset-Verträge pro Version vergleichen. |
| [1.18](https://www.synesthesia.live/public-release/changelog/1.18.0.39.html) | Marketplace und Dropdown/Color Smooth/Bang Counter Smooth. | Legacy-Control-Typen ergänzen. |
| [1.19–1.19.1](https://www.synesthesia.live/public-release/changelog/1.19.1.54.html) | JS `setup`, Events, Control-API; dann `setUniform`/globale Inputs; `inputs`/`uniforms` deprecated aber unterstützt. | JS-API-Varianten und tatsächliche `update()`-Pflicht je Build testen. |
| [1.20](https://www.synesthesia.live/public-release/changelog/1.20.0.66.html) | `setControl` raw statt normalized; `setControlNormalized` neu, `setControlDimension` deprecated; neue Speed-Controltypen, `DEF_COLOR` deprecated; Mouse-Uniforms und Mediastatus; OSC-Routen geändert. | Wichtiger API-/JSON-Kompatibilitätspunkt. |
| [1.21](https://www.synesthesia.live/public-release/changelog/1.21.0.79.html) | `textureFinalPass` in JS hinzugefügt. | Vorher ggf. JS-Pixel-Sampling nicht verfügbar. |
| [1.22](https://www.synesthesia.live/public-release/changelog/1.22.7.106.html) | SSF 2.0: `syn_Spectrum`/LevelTrail-Texturen, `syn_Media`, Lygia/hg_sdf, Filter/Wrap/Mipmap; Brightness-/Contrast-Math angepasst. | Beispiel für echten SSF-Profilwechsel. |
| [1.23](https://www.synesthesia.live/public-release/changelog/1.23.1.117.html) | Neue Media Controls/GIF/HAP/webm etc. und neue Decoder-/UI-Pipeline. | Media-Semantik und GL-Formatquellen prüfen. |
| [1.24](https://www.synesthesia.live/public-release/windows/changelog/1.24.0.142.html) | Desktop Audio und Shadertoy-Import erweitert (inklusive Cubemaps), Scene-Editing/Schema-Konsumenten. | Importer/Shader-Host-Profil. |
| [1.24.3–1.24.4](https://cdn.syn.live/releases/1.24.3.157/windows/changelog.html) | Spektren explizit verbessert/Bänder angepasst; Reactivity nun alle Audio-Komponenten; Audio Speed erhält BPM-Oszillator-Breakpoints; Low-Volume-Fix 1.24.4. | HÖCHSTE Priorität beim Audio-DSP-Versionsvergleich. |
| [1.25.2](https://cdn.syn.live/releases/1.25.2.185/windows/changelog.html) | Grafikengine neu, Multi-Scene/Crossfades; neue BPM-Oszillatoren; Saturation-Math geändert, Legacy-Funktion; Ping-Pong- und Include-Verhalten. | Gesamter aktueller Native-Referenzvertrag gehört exakt zu dieser Version. |
| [1.25.3–1.25.4](https://synesthesia.live/try) | Offizielle Downloadseite listet 1.25.4.189 (Stand Abfrage 13.10.2026); Changelog-Index endet bei 1.25.2. | Nicht aus Changelog auf Numerik schließen – EXE erst vergleichen. |

### Wichtiges Beispiel einer Changelog-/Binary-Abweichung

1.19.1 kündigt `update()` als optional an; der im 1.25.2-Archiv native-verifizierte Script-Controller bricht ein Script ohne `update()` ab. Das kann eine spätere Regression, geänderte Implementierung oder Doc/Build-Diskrepanz sein: nur Versionsvergleiche können Zeitpunkt/Ursache bestimmen. Gleiche API-Bezeichnung garantiert keine gleichen Semantiken.

## Versionsvergleich ohne erneutes vollständiges RE

**Stufe 0, statisch pro Build:** EXE/Paket-Hash + PE-Version/Architektur; String-Liste und JSON-/GLSL-Literale; Duktape-Registrierungsnamen; Registry-Einträge; Szenen/Config-Metadaten. **Nicht** alte 1.25.2-Adressen blind übernehmen. Neue xrefs und Signaturen nötig.

**Stufe 1, Algorithmus-Fingerprints:** Fenstertyp/Größe, FFT/IPP-ID und Flags, 5/22/35 Bänder, alle 66 Quellenkonstanten und zusätzliche erkannte Literale, Arraylängen, Smooth-Gewichte, Juiced FIR, Beat-Lockouts, BPM-Ring, GL-Enums, JS-API und Standarduniformtypen. Adressbereinigte CFG-/Instruktionshashes vergleichen (Funktionsverschiebung ≠ geänderter Algorithmus).

**Stufe 2, Nur bei Deltas:** Bereits existierende native Harnesses portieren und dieselben Fixture-Inputs/Anfangszustände durchspielen. FIRST DIFFERENCE an Output und State ermitteln. Mehrere CPU-Profile nicht unbemerkt mischen. Alte Binärdateien unter Testvm/isolierter Installation; vor Downgrade Settings, Lizenz/Presets/Szenen sichern.

**Einträge reporten:** ADDED, REMOVED (nur belegbar), RENAMED_CANDIDATE (mit Alias-/Semantikbeweis), SAME_STATIC_SIGNATURE, SAME_NATIVE_OUTPUT_ON_FIXTURES, CHANGED_CONSTANTS, CHANGED_BUFFER_LAYOUT, CHANGED_UPDATE_RULE, UNRESOLVED_MAPPING, VERSION_ONLY_UI. Abwesenheit im Stringscan ist kein Beleg für Entfernung.

**Empfohlene Builds:** v1.25.2.185 (Baseline), neueste offizielle 1.25.4.* (Version/Hash nach Download prüfen), 1.24.4, 1.24.2 (vor 1.24.3-DSP-Änderung), 1.22.7, 1.20.1, 1.19.1, 1.17.5. Je nach Aufwand 1.15.9. Nicht in aktuellem Benutzerprofil blind downgraden.

**Backcompat-Strategie:** Parser-/JS-Aliase für belegte Alt-Namen und Altfelder; `setControlDimension` erhalten, `DEF_COLOR` lesen, `inputs`/`uniforms` als alte JS-Objekte; `traveler` als eigene Semantik, nicht einfach zu `speed` umbenennen; `syn_LevelTrails` aus Changelog nicht ungeprüft als tatsächlicher GLSL-Name aliasen; Audio-Algorithmen nur pro belegtem historischen Profil wechseln.

### Quellen und Evidenzgrenzen

- Aktuelle Native-Quelle: Nutzer-Archiv `/mnt/data/Synesthesia_SSF_Final_Closure_2026-10-11(4).zip`, untersuchte Datei SHA `df45b2021c458a77b653bc27a9689d161acab80f6466fa8feaf3a0820636f256`.
- Offizieller bis 1.25.2 geführter [Changelog-Index](https://app.synesthesia.live/docs/resources/changelogs.html).
- Aktuelle [Downloadseite](https://synesthesia.live/try) und [Legacy Installer](https://app.synesthesia.live/docs/resources/syn_installers.html).
- Öffentliche [SSF Audio Uniforms](https://app.synesthesia.live/docs/ssf/audio_uniforms.html).
- Die Versionseinordnungen vor 1.25.2 beruhen auf den öffentlichen Release Notes, **nicht** auf binärem Versions-RE. Die geänderten Formeln früherer Versionen sind noch nicht verifiziert.


## Vollständige Einzelliste der öffentlich verlinkten Release Notes (1.0–1.25.2)

**54 indexierte Release-Links** wurden auf SSF-, Script-, Audio-, Scene-, Renderer- und Control-Relevanz geprüft. 1.3 antwortete mit HTTP 404 und 1.17.7 war beim Abruf technisch nicht verfügbar; beide sind deshalb als unbekannt ausgewiesen. Viele Patchseiten enthalten kumulierte Feature-Notes der Vorversion, nicht unabhängige neue Features. Die Angabe „keine ausdrücklich benannte Änderung“ beweist keine binäre Unverändertheit.

| Release | Relevanz | Zusammenfassung der öffentlich erreichbaren Notizen |
|---|---|---|
| [1.25.2](https://cdn.syn.live/releases/1.25.2.185/windows/changelog.html) | RENDER+SSF | Neuer Multiscene-Renderer, Ping-Pong, scene-lokale Includes, tri4/tri8/sin8; Saturation und Legacy. |
| [1.25.1](https://cdn.syn.live/releases/1.25.1.182/windows/changelog.html) | RENDER+SSF | Gemeinsame 1.25-Neuauflage, Syphon/Media-Fixes. |
| [1.24.4](https://cdn.syn.live/releases/1.24.4.159/windows/changelog.html) | DSP | Korrektur niedriger Audiopegel in den 1.24.3 Spectra. |
| [1.24.3](https://cdn.syn.live/releases/1.24.3.157/windows/changelog.html) | DSP | Spektralberechnung/-bänder, Reactivity und Audio-Speed-abhängige BPM-Oszillatoren geändert. |
| [1.24.2](https://cdn.syn.live/releases/1.24.2.148/windows/changelog.html) | SCENES | Neue/überarbeitete Szenen, kein ausdrücklich benannter neuer SSF-DSP-Vertrag. |
| [1.24.1](https://www.synesthesia.live/public-release/windows/changelog/1.24.1.145.html) | SCENE/IMAGE | Scene-Editor-Bild/Cubemap-Dateiauswahl und Speicherfehler. |
| [1.24.0](https://www.synesthesia.live/public-release/windows/changelog/1.24.0.142.html) | MEDIA/IMPORT | Desktop-Audio, Shadertoy/Cubemap-Import und Mediasemantik. |
| [1.23.3](https://www.synesthesia.live/public-release/changelog/1.23.3.126.html) | MEDIA/RENDER | Shader-Precompile, Medienladeverfahren und graustufige Bildformate. |
| [1.23.2](https://www.synesthesia.live/public-release/changelog/1.23.2.121.html) | MEDIA | Kameraauflösung und Trial-Medien. |
| [1.23.1](https://www.synesthesia.live/public-release/changelog/1.23.1.117.html) | MEDIA | Mediensteuerung (Scale/Gamma/Hue/etc.) und erweiterte Decoderformate. |
| [1.22.7](https://www.synesthesia.live/public-release/changelog/1.22.7.106.html) | SSF 2.0 | SSF-2.0-Funktionen plus Editor/Marketplace-Patches (kumulatives Changelog). |
| [1.22.6](https://www.synesthesia.live/public-release/changelog/1.22.6.100.html) | SSF 2.0 | Master-Control-Correction; SSF-2.0-Host (kumulatives Changelog). |
| [1.22.5](https://www.synesthesia.live/public-release/changelog/1.22.5.97.html) | SSF 2.0 | SSF-2.0-Host, Mouse-Media/Marketplace-Fixes (kumulativ). |
| [1.22.4](https://www.synesthesia.live/public-release/changelog/1.22.4.94.html) | SSF 2.0 | SSF 2.0: Spektrum-/Trail-Texturen, syn_Media, GLSL-Libraries/Filter. |
| [1.22.2](https://www.synesthesia.live/public-release/changelog/1.22.2.92.html) | SSF 2.0 | SSF-2.0-Basis plus Importer-Patches. |
| [1.22.1](https://www.synesthesia.live/public-release/changelog/1.22.1.89.html) | SSF 2.0 | SSF-2.0-Einführung inkl. Libraries und Texture-Options. |
| [1.21.0](https://www.synesthesia.live/public-release/changelog/1.21.0.79.html) | JS | textureFinalPass-JavaScript-Pixel-API. |
| [1.20.1](https://www.synesthesia.live/public-release/changelog/1.20.1.72.html) | RENDER/EDITOR | Auto-Compile, FPS-, Kamera-, Spout-/Scene-Fixes. |
| [1.20.0](https://www.synesthesia.live/public-release/changelog/1.20.0.66.html) | BREAKING API | setControl raw; setControlNormalized neu; DEF_COLOR/Traveler deprecated; Mouse-Uniforms, Medien-GLSL-Funktionen. |
| [1.19.1](https://www.synesthesia.live/public-release/changelog/1.19.1.54.html) | JS | setUniform/global inputs; inputs/uniforms deprecated; update() laut Notes optional. |
| [1.19.0](https://www.synesthesia.live/public-release/changelog/1.19.0.52.html) | JS/EDITOR | setup(), fünf JS-Events, setControl API; Editor-Beta, OSC-Audio-Output. |
| [1.18.2](https://www.synesthesia.live/public-release/changelog/1.18.2.43.html) | PLATFORM | Apple M1-Support. |
| [1.18.1](https://www.synesthesia.live/public-release/changelog/1.18.1.41.html) | MARKETPLACE/MIDI | Marketplace-Preview/MIDI-Fixes. |
| [1.18.0](https://www.synesthesia.live/public-release/changelog/1.18.0.39.html) | MARKETPLACE/CONTROL | Marketplace-Einführung, Dropdown/ColorSmooth/BangCounterSmooth. |
| [1.17.9](https://www.synesthesia.live/public-release/changelog/1.17.9.35.html) | MEDIA/STATE | Syphon/Spout-State und Media-Settings-Fehlerbehandlung. |
| [1.17.8](https://www.synesthesia.live/public-release/changelog/1.17.8.31.html) | GUI | Audio-Control-GUI/Offline-Fix; keine explizite DSP-Änderung. |
| [1.17.7](https://www.synesthesia.live/public-release/changelog/1.17.7.29.html) | UNAVAILABLE | Verlinkt, jedoch Quelle beim Abruf nicht erreichbar; keine Änderung behaupten. |
| [1.17.6](https://www.synesthesia.live/public-release/changelog/1.17.6.27.html) | PRESET | MIDI- und Preset-Fixes. |
| [1.17.5](https://www.synesthesia.live/public-release/changelog/1.17.5.24.html) | AUDIO/META | Reactivity/Audio Speed, Variable Resolution, keepTime/Reload-Option. |
| [1.16.9](https://www.synesthesia.live/public-release/changelog/1.16.9.14.html) | PLAYLIST/OS | Playlist-Hotkeys und macOS-Permissions. |
| [1.16.8](https://www.synesthesia.live/public-release/changelog/1.16.8.13.html) | MEDIA/PRESET | Medien/Backup-/Startup-Fixes. |
| [1.16.7](https://www.synesthesia.live/public-release/changelog/1.16.7.11.html) | MIDI | MIDI-Absturzfix. |
| [1.16.6](https://www.synesthesia.live/public-release/changelog/1.16.6.9.html) | MIDI | MIDI-Clock/Device-Disconnect-Fixes. |
| [1.16.5](https://www.synesthesia.live/public-release/changelog/1.16.5.7.html) | IMPORT/MEDIA | Shadertoy common-tab, Video-FPS-Speed-Fix. |
| [1.16.4](https://www.synesthesia.live/public-release/changelog/1.16.4.5.html) | CONTROL/OS | GUI-/MIDI-/Zugriffsrechte-Fixes. |
| [1.16.3](https://www.synesthesia.live/public-release/changelog/1.16.3.3.html) | PRESET/CONTROL | Preset-/Control-Migration, Meta/Media-Channels, JSON-Roundtrip-Fix (kumulativ). |
| [1.16.2](https://www.synesthesia.live/public-release/changelog/1.16.3.2.html) | PRESET/CONTROL | 1.16-Preset/Playlist/Control-Migration (kumulativ). |
| [1.15.9](https://www.synesthesia.live/public-release/changelog/1.15.9.9.html) | MEDIA/IMPORT | Spout, Transition-Bugfix, Crash-Rückfall bei Scene-Load. |
| [1.15.7](https://www.synesthesia.live/public-release/changelog/1.15.7.5.html) | MEDIA/JSON | Trial-Nutzer erwähnt; Media-Inputs, Scene-JSON-Fehlerkorrektur. |
| [1.14](https://www.synesthesia.live/public-release/changelog/1.14.html) | CONTROL | Meta-Control Default für Playback/Media korrigiert. |
| [1.13](https://www.synesthesia.live/public-release/changelog/1.13.html) | SCENES | Scene-Update, MIDI-Mapping-Fix. |
| [1.12](https://www.synesthesia.live/public-release/changelog/1.12.html) | MEDIA | Pause/Playback Speed eingeführt, synScene-Importer-Fix. |
| [1.11](https://www.synesthesia.live/public-release/changelog/1.11.html) | IMPORT/EDITOR | Scene Library, .synScene/ISF/Shadertoy-Import, externe Bearbeitung. |
| [1.10](https://www.synesthesia.live/public-release/changelog/1.10.html) | COLOR | Contrast-Mathematik-/Fehlerkorrektur nach 1.9. |
| [1.9](https://www.synesthesia.live/public-release/changelog/1.9.html) | COLOR | Gamma/Hue/Saturation; Brightness/Contrast; JS-Transition-Fix. |
| [1.8](https://www.synesthesia.live/public-release/changelog/1.8.html) | OUTPUT | Alpha-Ausgabe und Transition-Meta-Control gefixt. |
| [1.7](https://www.synesthesia.live/public-release/changelog/1.7.html) | MEDIA/MIDI | Image-Rendering auf älteren macOS-Versionen; Mapping. |
| [1.6](https://www.synesthesia.live/public-release/changelog/1.6.html) | CONTROL | Control-Groups, ImageOnSilence entfernt und Contrast eingeführt. |
| [1.5](https://www.synesthesia.live/public-release/changelog/1.5.html) | SSF/FORMAT | synScene-Endung und syn_MediaType eingeführt. |
| [1.4](https://www.synesthesia.live/public-release/changelog/1.4.html) | IMPORT | Scene-Import/Fallback- und GUI-Fixes. |
| [1.3](https://www.synesthesia.live/public-release/changelog/1.3.html) | UNAVAILABLE | Verlinkte 1.3-Release-Note liefert 404. |
| [1.2](https://www.synesthesia.live/public-release/changelog/1.2.html) | PLATFORM | FPS/OSX-10.10-Stabilitätsfix. |
| [1.1](https://www.synesthesia.live/public-release/changelog/1.1.html) | RELEASE | Public Release; Controls/MIDI/Scene-FPS. |
| [1.0](https://www.synesthesia.live/public-release/changelog/1.0.html) | BASELINE | Meta-/Scene-Controls, Scene-Sharing/-Import, Preview. |

**Nicht indexiert:** 1.25.3 und die auf der Download-Seite als `1.25.4.189` geführte Version. Für diese Builds ist derzeit die EXE selbst aussagekräftiger als der fehlende öffentliche Changelog-Link.
