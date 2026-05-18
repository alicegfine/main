package com.example.photoalarm.ml

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import org.tensorflow.lite.support.common.ops.NormalizeOp
import org.tensorflow.lite.support.image.ImageProcessor
import org.tensorflow.lite.support.image.TensorImage
import org.tensorflow.lite.support.image.ops.ResizeOp
import org.tensorflow.lite.support.tensorbuffer.TensorBuffer
import java.io.File
import kotlin.math.sqrt

/**
 * Runs a MobileNetV3 feature-extractor TFLite model and returns L2-normalized
 * embedding vectors that can be compared with cosine similarity.
 *
 * Expects the model file at assets/mobilenet_v3_embedder.tflite with:
 *   input  shape [1, 224, 224, 3], float32, range [-1, 1]
 *   output shape [1, N] (e.g. 1024 for MobileNetV3 large)
 *
 * To produce it: download a MobileNetV3 image-feature-vector SavedModel from
 * TF Hub and convert with TFLiteConverter.from_saved_model(...). See README.
 */
class ImageEmbedder(context: Context) {

    private val interpreter: Interpreter = run {
        val model = FileUtil.loadMappedFile(context, MODEL_ASSET)
        Interpreter(model, Interpreter.Options().apply { setNumThreads(2) })
    }

    private val inputShape = interpreter.getInputTensor(0).shape() // [1,224,224,3]
    private val inputSize = inputShape[1]
    private val outputSize = interpreter.getOutputTensor(0).shape().last()

    private val preprocessor = ImageProcessor.Builder()
        .add(ResizeOp(inputSize, inputSize, ResizeOp.ResizeMethod.BILINEAR))
        // MobileNetV3 image-feature-vector models expect inputs in [0, 1]:
        // (x - 0) / 255.
        .add(NormalizeOp(0f, 255f))
        .build()

    /** Returns an L2-normalized embedding for the supplied bitmap. */
    fun embed(bitmap: Bitmap): FloatArray {
        val rgb = if (bitmap.config != Bitmap.Config.ARGB_8888) {
            bitmap.copy(Bitmap.Config.ARGB_8888, false)
        } else bitmap

        var tImage = TensorImage(DataType.FLOAT32).apply { load(rgb) }
        tImage = preprocessor.process(tImage)

        val output = TensorBuffer.createFixedSize(intArrayOf(1, outputSize), DataType.FLOAT32)
        interpreter.run(tImage.buffer, output.buffer.rewind())

        return l2normalize(output.floatArray)
    }

    fun embedFile(path: String): FloatArray {
        val bmp = decodeOriented(path)
            ?: error("Could not decode image at $path")
        return embed(bmp)
    }

    fun close() = interpreter.close()

    private fun l2normalize(v: FloatArray): FloatArray {
        var sum = 0.0
        for (x in v) sum += (x * x).toDouble()
        val norm = sqrt(sum).toFloat().coerceAtLeast(1e-12f)
        val out = FloatArray(v.size)
        for (i in v.indices) out[i] = v[i] / norm
        return out
    }

    companion object {
        const val MODEL_ASSET = "mobilenet_v3_embedder.tflite"

        fun decodeOriented(path: String, maxDim: Int = 1024): Bitmap? {
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, opts)
            var sample = 1
            while (opts.outWidth / sample > maxDim || opts.outHeight / sample > maxDim) {
                sample *= 2
            }
            val decoded = BitmapFactory.decodeFile(
                path,
                BitmapFactory.Options().apply { inSampleSize = sample }
            ) ?: return null

            // Respect EXIF rotation.
            val exif = try { androidx.exifinterface.media.ExifInterface(File(path).absolutePath) } catch (_: Throwable) { null }
            val rotation = when (exif?.getAttributeInt(
                androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,
                androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL
            )) {
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
            return if (rotation == 0) decoded else {
                val m = Matrix().apply { postRotate(rotation.toFloat()) }
                Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, m, true)
            }
        }
    }
}
