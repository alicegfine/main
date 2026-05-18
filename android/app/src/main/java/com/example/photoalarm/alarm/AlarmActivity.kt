package com.example.photoalarm.alarm

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.example.photoalarm.data.AlarmRepository
import com.example.photoalarm.ml.ImageEmbedder
import com.example.photoalarm.ml.cosineSimilarity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

class AlarmActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                        android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        val alarmId = intent.getLongExtra(EXTRA_ALARM_ID, -1L)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                AlarmDismissScreen(
                    alarmId = alarmId,
                    onDismiss = {
                        AlarmSoundService.stop(this)
                        finish()
                    }
                )
            }
        }
    }

    companion object {
        const val EXTRA_ALARM_ID = "alarm_id"
    }
}

@Composable
private fun AlarmDismissScreen(alarmId: Long, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = (context as ComponentActivity).lifecycleScope

    var targetImagePath by remember { mutableStateOf<String?>(null) }
    var initialThreshold by remember { mutableStateOf(0.75f) }
    var graceSeconds by remember { mutableStateOf(120) }
    var targetEmbedding by remember { mutableStateOf<FloatArray?>(null) }
    val embedder = remember { ImageEmbedder(context.applicationContext) }
    val startTime = remember { SystemClock.elapsedRealtime() }

    var lastSimilarity by remember { mutableStateOf<Float?>(null) }
    var attempts by remember { mutableStateOf(0) }
    var capturing by remember { mutableStateOf(false) }
    var cameraPermitted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> cameraPermitted = granted }

    LaunchedEffect(Unit) {
        if (!cameraPermitted) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    LaunchedEffect(alarmId) {
        val alarm = withContext(Dispatchers.IO) { AlarmRepository(context).getById(alarmId) }
        targetImagePath = alarm?.targetImagePath
        initialThreshold = alarm?.similarityThreshold ?: 0.75f
        graceSeconds = alarm?.graceSeconds ?: 120
        targetImagePath?.let { path ->
            targetEmbedding = withContext(Dispatchers.Default) { embedder.embedFile(path) }
        }
    }

    DisposableEffect(Unit) { onDispose { embedder.close() } }

    // Tick the elapsed timer once a second so the threshold relaxes smoothly.
    var elapsedSec by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            elapsedSec = ((SystemClock.elapsedRealtime() - startTime) / 1000).toInt()
            delay(1000)
        }
    }

    val effectiveThreshold = remember(elapsedSec, initialThreshold) {
        // Drop 0.02 per minute past the grace window, floor at 0.55.
        val minutesPastGrace = ((elapsedSec - graceSeconds).coerceAtLeast(0)) / 60f
        (initialThreshold - 0.02f * minutesPastGrace).coerceAtLeast(0.55f)
    }

    val imageCapture = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
    }
    val executor = remember { Executors.newSingleThreadExecutor() }
    DisposableEffect(Unit) { onDispose { executor.shutdown() } }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (cameraPermitted) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val providerFuture = ProcessCameraProvider.getInstance(ctx)
                    providerFuture.addListener({
                        val provider = providerFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.setSurfaceProvider(previewView.surfaceProvider)
                        }
                        provider.unbindAll()
                        provider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            imageCapture
                        )
                    }, ContextCompat.getMainExecutor(ctx))
                    previewView
                }
            )
        } else {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Camera permission required", color = Color.White)
            }
        }

        // Top overlay: target image + countdown + last score.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            targetImagePath?.let { path ->
                val bmp = remember(path) { ImageEmbedder.decodeOriented(path, maxDim = 256) }
                bmp?.let {
                    Image(
                        bitmap = it.asImageBitmap(),
                        contentDescription = "Target",
                        modifier = Modifier
                            .size(120.dp)
                            .clip(RoundedCornerShape(12.dp))
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                val remaining = (graceSeconds - elapsedSec).coerceAtLeast(0)
                Text(
                    if (remaining > 0) "Quiet for ${remaining}s — go take the photo"
                    else "Ringing — take the photo to silence",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "Need similarity ≥ ${"%.2f".format(effectiveThreshold)}",
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 13.sp,
                )
                lastSimilarity?.let { s ->
                    Text(
                        "Last shot: ${"%.2f".format(s)}" +
                                if (s >= effectiveThreshold) " (match!)" else "",
                        color = if (s >= effectiveThreshold) Color(0xFF66FF99) else Color(0xFFFFCC66),
                        fontSize = 13.sp,
                    )
                }
                if (attempts > 0) {
                    Text("Attempts: $attempts", color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
                }
            }
        }

        // Bottom shutter button.
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 48.dp)
        ) {
            FilledTonalButton(
                enabled = !capturing && targetEmbedding != null && cameraPermitted,
                onClick = {
                    capturing = true
                    imageCapture.takePicture(
                        executor,
                        object : ImageCapture.OnImageCapturedCallback() {
                            override fun onCaptureSuccess(image: ImageProxy) {
                                val bitmap = image.toBitmap()
                                image.close()
                                scope.launch {
                                    val emb = withContext(Dispatchers.Default) { embedder.embed(bitmap) }
                                    val tgt = targetEmbedding
                                    val sim = if (tgt != null) cosineSimilarity(emb, tgt) else 0f
                                    lastSimilarity = sim
                                    attempts++
                                    if (sim >= effectiveThreshold) onDismiss()
                                    capturing = false
                                }
                            }

                            override fun onError(exception: ImageCaptureException) {
                                capturing = false
                            }
                        }
                    )
                },
                modifier = Modifier.size(96.dp)
            ) {
                Text(if (capturing) "..." else "SNAP", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}
