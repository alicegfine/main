# PhotoAlarm

An Android alarm app that you dismiss by taking a photo of a specific
object/scene that you previously chose. The alarm fires silently for a
configurable "grace" window (default 2 minutes) so you have time to get
out of bed and find the target before the apartment wakes up.

## How it matches photos

1. When you pick a target image, the app stores its path on disk.
2. When the alarm fires, the target image is run through a
   MobileNetV3 image-feature-vector model (TFLite) to produce a 1024-d
   L2-normalized embedding.
3. Every camera shot you take during the alarm gets the same treatment.
4. The two embeddings are compared with cosine similarity. If the score
   meets the threshold (default 0.75), the alarm dismisses.
5. The required threshold relaxes by 0.02 each minute past the grace
   window so you can never get permanently locked out, with a floor of
   0.55.

## Bundled model

`app/src/main/assets/mobilenet_v3_embedder.tflite` is a MobileNetV3-Small
image-feature-vector TFLite (~6 MB) sourced from the official
[tensorflow/tflite-support](https://github.com/tensorflow/tflite-support)
test data. It accepts a `[1, 224, 224, 3]` float32 input in the `[0, 1]`
range and emits a `[1, 1024]` float32 embedding.

Sanity check on real photos (cosine similarity of L2-normalized
embeddings):

| pair                          | similarity |
| ----------------------------- | ---------- |
| burger vs. cropped burger     | 0.93       |
| burger vs. unrelated objects  | 0.01       |

If you ever want a higher-accuracy model, MobileNetV3-Large (~15 MB)
from TF Hub is a drop-in replacement — same I/O shape and `[0, 1]`
normalization.

## Build & install

```
cd android
./gradlew installDebug
```

Then on the device:

1. Grant the **camera** permission when prompted.
2. Grant the **notifications** permission when prompted (needed so the
   foreground sound service can post its required notification).
3. On Android 12+, open the app info → "Alarms & reminders" and allow
   the "Schedule exact alarms" permission. Without it, alarms fall back
   to inexact scheduling and may be delayed by Doze.
4. On OEMs that aggressively kill background apps (Xiaomi, Oppo,
   OnePlus, etc.), disable battery optimization for PhotoAlarm or it
   may miss the alarm time.

## Known limitations / next steps

- One-shot alarms only re-arm for the next day; weekly repeats exist
  in the data model (`daysOfWeek` bitmask) but no UI for it yet.
- No snooze button on purpose — the only way out is the photo.
- The embedding model is shipped in `assets/`; for a smaller APK, fetch
  it on first launch instead.
- If the matched scene is *too* generic (e.g. "a white wall"), expect
  false dismissals. Pick a target with distinctive structure.
