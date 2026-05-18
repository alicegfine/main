package com.example.photoalarm.ml

/** Cosine similarity for L2-normalized vectors is just a dot product. */
fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
    require(a.size == b.size) { "vector size mismatch: ${a.size} vs ${b.size}" }
    var sum = 0f
    for (i in a.indices) sum += a[i] * b[i]
    return sum.coerceIn(-1f, 1f)
}
