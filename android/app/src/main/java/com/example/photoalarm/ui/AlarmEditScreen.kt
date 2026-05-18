package com.example.photoalarm.ui

import android.app.TimePickerDialog
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.photoalarm.alarm.AlarmScheduler
import com.example.photoalarm.data.Alarm
import com.example.photoalarm.data.AlarmRepository
import com.example.photoalarm.ml.ImageEmbedder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Calendar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlarmEditScreen(alarmId: Long, onDone: () -> Unit) {
    val context = LocalContext.current
    val repo = remember { AlarmRepository(context) }
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var hour by remember { mutableStateOf(7) }
    var minute by remember { mutableStateOf(0) }
    var label by remember { mutableStateOf("") }
    var enabled by remember { mutableStateOf(true) }
    var graceSeconds by remember { mutableStateOf(120) }
    var threshold by remember { mutableStateOf(0.75f) }
    var targetPath by remember { mutableStateOf<String?>(null) }
    var daysOfWeek by remember { mutableStateOf(0) }

    LaunchedEffect(alarmId) {
        if (alarmId != 0L) {
            val a = withContext(Dispatchers.IO) { repo.getById(alarmId) }
            if (a != null) {
                hour = a.hour; minute = a.minute; label = a.label
                enabled = a.enabled; graceSeconds = a.graceSeconds
                threshold = a.similarityThreshold; targetPath = a.targetImagePath
                daysOfWeek = a.daysOfWeek
            }
        } else {
            val cal = Calendar.getInstance()
            hour = cal.get(Calendar.HOUR_OF_DAY)
            minute = cal.get(Calendar.MINUTE)
        }
        loading = false
    }

    val pickImage = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            val outFile = File(context.filesDir, "target_${System.currentTimeMillis()}.jpg")
            context.contentResolver.openInputStream(uri)?.use { input ->
                outFile.outputStream().use { input.copyTo(it) }
            }
            targetPath = outFile.absolutePath
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (alarmId == 0L) "New alarm" else "Edit alarm") },
                actions = {
                    if (alarmId != 0L) {
                        IconButton(onClick = {
                            scope.launch(Dispatchers.IO) {
                                repo.getById(alarmId)?.let { repo.delete(it) }
                                AlarmScheduler.cancel(context, alarmId)
                                withContext(Dispatchers.Main) { onDone() }
                            }
                        }) { Icon(Icons.Default.Delete, contentDescription = "Delete") }
                    }
                }
            )
        },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDone, modifier = Modifier.weight(1f)) { Text("Cancel") }
                    Button(
                        onClick = {
                            val draft = Alarm(
                                id = alarmId,
                                label = label,
                                hour = hour,
                                minute = minute,
                                enabled = enabled,
                                daysOfWeek = daysOfWeek,
                                graceSeconds = graceSeconds,
                                similarityThreshold = threshold,
                                targetImagePath = targetPath,
                            )
                            scope.launch(Dispatchers.IO) {
                                val newId = repo.upsert(draft)
                                val toSchedule = if (alarmId == 0L) draft.copy(id = newId) else draft
                                if (enabled) AlarmScheduler.schedule(context, toSchedule)
                                else AlarmScheduler.cancel(context, toSchedule.id)
                                withContext(Dispatchers.Main) { onDone() }
                            }
                        },
                        enabled = !loading && targetPath != null,
                        modifier = Modifier.weight(1f)
                    ) { Text("Save") }
                }
            }
        }
    ) { padding ->
        if (loading) {
            Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedButton(
                onClick = {
                    TimePickerDialog(
                        context, { _, h, m -> hour = h; minute = m }, hour, minute, true
                    ).show()
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Time: %02d:%02d".format(hour, minute)) }

            OutlinedTextField(
                value = label,
                onValueChange = { label = it },
                label = { Text("Label (optional)") },
                modifier = Modifier.fillMaxWidth()
            )

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Enabled", modifier = Modifier.weight(1f))
                Switch(checked = enabled, onCheckedChange = { enabled = it })
            }

            Column {
                Text("Repeat")
                Spacer(Modifier.height(8.dp))
                DayOfWeekPicker(
                    mask = daysOfWeek,
                    onChange = { daysOfWeek = it }
                )
                Text(
                    if (daysOfWeek == 0) "One-shot — fires once, then turns itself off."
                    else "Repeats on selected days.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Column {
                Text("Target photo")
                Spacer(Modifier.height(8.dp))
                if (targetPath != null) {
                    val bmp = remember(targetPath) {
                        ImageEmbedder.decodeOriented(targetPath!!, maxDim = 512)
                    }
                    bmp?.let {
                        Image(
                            bitmap = it.asImageBitmap(),
                            contentDescription = "Target",
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp)
                                .clip(RoundedCornerShape(12.dp))
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
                OutlinedButton(
                    onClick = {
                        pickImage.launch(
                            androidx.activity.result.PickVisualMediaRequest(
                                ActivityResultContracts.PickVisualMedia.ImageOnly
                            )
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (targetPath == null) "Pick target image" else "Replace target image") }
            }

            Column {
                Text("Match strictness: %.2f".format(threshold))
                Slider(
                    value = threshold,
                    onValueChange = { threshold = it },
                    valueRange = 0.55f..0.95f,
                    steps = 7,
                )
                Text(
                    "Higher = stricter. 0.75 is a reasonable default; 0.85+ requires a near-identical shot.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Column {
                Text("Quiet grace period: ${graceSeconds}s")
                Slider(
                    value = graceSeconds.toFloat(),
                    onValueChange = { graceSeconds = it.toInt() },
                    valueRange = 0f..300f,
                    steps = 9,
                )
                Text(
                    "Time you have to capture the target before the alarm becomes audible.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            HorizontalDivider()

            OutlinedButton(
                onClick = {
                    // Persist current edits then fire the alarm immediately so
                    // the test uses exactly the settings on screen.
                    val draft = Alarm(
                        id = alarmId,
                        label = label,
                        hour = hour,
                        minute = minute,
                        enabled = enabled,
                        daysOfWeek = daysOfWeek,
                        graceSeconds = graceSeconds,
                        similarityThreshold = threshold,
                        targetImagePath = targetPath,
                    )
                    scope.launch(Dispatchers.IO) {
                        val savedId = repo.upsert(draft)
                        com.example.photoalarm.alarm.AlarmTrigger.fireNow(context, savedId)
                    }
                },
                enabled = !loading && targetPath != null,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Test now (fire alarm immediately)") }
        }
    }
}

@Composable
private fun DayOfWeekPicker(mask: Int, onChange: (Int) -> Unit) {
    val days = listOf("M" to 1, "T" to 2, "W" to 4, "T" to 8, "F" to 16, "S" to 32, "S" to 64)
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        days.forEach { (label, bit) ->
            val selected = (mask and bit) != 0
            FilterChip(
                selected = selected,
                onClick = { onChange(if (selected) mask and bit.inv() else mask or bit) },
                label = { Text(label) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}
