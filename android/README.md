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

## One-time setup before you build

You need a MobileNetV3 image-feature-vector TFLite model placed at:

    app/src/main/assets/mobilenet_v3_embedder.tflite

The model must accept a `[1, 224, 224, 3]` float32 input in the
`[-1, 1]` range and produce a `[1, N]` float32 output (N is the
embedding dimension, typically 1024).

Quickest path: grab the MobileNetV3-Large image feature vector from
TensorFlow Hub and convert it:

```python
import tensorflow as tf, tensorflow_hub as hub
m = tf.keras.Sequential([
    hub.KerasLayer("https://tfhub.dev/google/imagenet/mobilenet_v3_large_100_224/feature_vector/5",
                   input_shape=(224, 224, 3))
])
m.build([None, 224, 224, 3])
conv = tf.lite.TFLiteConverter.from_keras_model(m)
conv.optimizations = [tf.lite.Optimize.DEFAULT]
open("mobilenet_v3_embedder.tflite", "wb").write(conv.convert())
```

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
