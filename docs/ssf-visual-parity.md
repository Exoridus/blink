# SSF visual parity and output contract

Output dimensions are independent of the preview CSS box and device pixel ratio.
The initial parity target is 1920 x 1080. The canvas framebuffer and screen-sized
pass attachments use the selected output size. The browser compositor fits that
finished canvas into the preview using contain (default), cover, or fill. This
preserves the existing common pass executor and each lane's private feedback.

RENDERSIZE is the current pass resolution. SCREENSIZE, where supplied by the
native media/final stage, describes output dimensions. The previous small-pass
browser probe tested our screen-sized uniform, not a native small-pass capture;
it cannot override the recovered host contract. Generic bl_resolution remains
pass-sized. Fragment coordinates use GL bottom-left origin and half-pixel centers.
Readback uses ExoJS top-left rows. Neither convention calls for an X inversion.

UI scale changes interface chrome only. Pointer coordinates map through the
preview fitting rectangle into output pixels, including crop offsets. Letterbox
regions are outside the interactive output. Browser RAF remains synchronized to
the display; an FPS cap is an upper limit, not a promise of 144 FPS or a V-Sync
off switch. Color probes distinguish float attachments from presented SDR pixels;
no corrective gamma, hue, saturation, or channel permutation is applied.

Frozen native reference: Synesthesia 1.25.2.185. User-reported comparison version:
1.25.4.189. Version differences remain unqualified until matching reference
captures are supplied. Screenshots alone do not establish identical PCM or time.

The encoded-RGB compatibility profile adapts only the final screen shader to
ExoJS's linear working surface using the standard sRGB inverse transfer function.
ExoJS's mandatory sRGB output encode then restores native raw presentation bytes.
Opaque presentation ignores shader alpha as the native unblended window does;
float intermediate RGBA is preserved. Transparent canvas composition uses linear
premultiplied storage and remains a separate, unqualified native window profile.
The float marker (0.25, 0.5, 0.75, 1) previously presented as (137,188,225,255);
the expected direct-copy bytes are (64,128,191,255). This is a color-space boundary
adapter, not an artistic gamma correction. Other compatibility profiles retain
ExoJS's existing linear presentation behavior.
